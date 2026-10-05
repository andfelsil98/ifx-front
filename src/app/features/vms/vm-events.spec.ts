import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { throwError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { browserVmEvents, VM_EVENT_SOURCE } from './vm-events';
import type { VmEventSource, VmEvent } from './vm-events';

class FakeSource implements VmEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly callbacks = new Map<string, (value: string) => void>();
  readonly close = jasmine.createSpy('close');
  listen(name: string, callback: (value: string) => void): void { this.callbacks.set(name, callback); }
  emit(name: string, value: unknown): void { this.callbacks.get(name)?.(JSON.stringify(value)); }
}

describe('VM events transport', () => {
  let sources: FakeSource[];
  let urls: string[];
  let http: HttpTestingController;
  let epoch: number;
  let authenticated: boolean;
  const refresh = jasmine.createSpy('refresh');
  beforeEach(() => {
    sources = []; urls = []; epoch = 1; authenticated = true; refresh.calls.reset(); refresh.and.returnValue(of({}));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { get epoch() { return epoch; }, authenticated: () => authenticated, refresh } },
      { provide: VM_EVENT_SOURCE, useValue: (url: string) => { const source = new FakeSource(); sources.push(source); urls.push(url); return source; } },
    ] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const connect = () => TestBed.runInInjectionContext(browserVmEvents);

  it('uses one filtered stream, emits snapshots and closes on unsubscribe', () => {
    const events: VmEvent[] = [];
    const subscription = connect()({ view: 'page', after: 'vm-10', status: 'RUNNING' }).subscribe(event => events.push(event));
    expect(urls).toEqual(['http://localhost:3000/vms/events?view=page&after=vm-10&status=RUNNING']);
    sources[0]?.onopen?.(); sources[0]?.emit('summary', { summary: { total: 40 } });
    sources[0]?.emit('page', { vms: [] });
    expect(events.map(event => event.type)).toEqual(['state', 'state', 'summary', 'page']);
    subscription.unsubscribe(); expect(sources[0]?.close).toHaveBeenCalledTimes(1);
    sources[0]?.emit('page', { vms: ['late'] }); expect(events.length).toBe(4);
  });

  it('renews an expired session once and opens a new stream without exposing a token', fakeAsync(() => {
    const subscription = connect()({ view: 'summary' }).subscribe();
    sources[0]?.emit('session-expired', { code: 'SESSION_EXPIRED' });
    expect(sources[0]?.close).toHaveBeenCalled(); tick(1000);
    expect(refresh).toHaveBeenCalledTimes(1); expect(sources.length).toBe(2);
    expect(urls[1]).not.toContain('token'); subscription.unsubscribe();
  }));

  it('stops reconnection after three failed attempts and allows explicit retry', fakeAsync(() => {
    const error = jasmine.createSpy('error');
    const subscription = connect()({ view: 'summary' }).subscribe({ error });
    sources[0]?.onerror?.();
    for (const duration of [1000, 2000, 4000]) {
      tick(duration); http.expectOne('http://localhost:3000/vms/summary').flush({}, { status: 503, statusText: 'Unavailable' });
    }
    expect(error).toHaveBeenCalledTimes(1); expect(sources.length).toBe(1);
    subscription.unsubscribe();
    const retry = connect()({ view: 'summary' }).subscribe(); expect(sources.length).toBe(2); retry.unsubscribe();
  }));

  it('cancels recovery work and ignores another session', fakeAsync(() => {
    const subscription = connect()({ view: 'summary' }).subscribe();
    sources[0]?.onerror?.(); subscription.unsubscribe(); tick(5000);
    http.expectNone('http://localhost:3000/vms/summary');
    const next = connect()({ view: 'summary' }).subscribe(); epoch++;
    sources[1]?.onerror?.(); tick(5000); http.expectNone('http://localhost:3000/vms/summary'); next.unsubscribe();
  }));

  it('rejects malformed events and closes the stream', () => {
    const error = jasmine.createSpy('error');
    connect()({ view: 'summary' }).subscribe({ error });
    sources[0]?.callbacks.get('page')?.('{invalid');
    expect(error).toHaveBeenCalled(); expect(sources[0]?.close).toHaveBeenCalled();
  });

  it('redirects to login after failed renewal without retrying indefinitely', fakeAsync(() => {
    authenticated = false; refresh.and.returnValue(throwError(() => new Error('Unauthorized')));
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const error = jasmine.createSpy('error');
    connect()({ view: 'summary' }).subscribe({ error }); sources[0]?.emit('session-expired', {}); tick(1000);
    expect(error).toHaveBeenCalled(); expect(navigate).toHaveBeenCalledWith('/login'); expect(sources.length).toBe(1);
  }));
});
