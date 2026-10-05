import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector } from '@angular/core';
import type { DestroyableInjector } from '@angular/core';
import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SESSION_EVENTS } from './session-events';
import type { SessionAction, SessionEvents } from './session-events';
import { SESSION_LOCK } from './session-lock';
import type { SessionLock } from './session-lock';

const admin = { user: { id: 'admin', name: 'Admin', email: 'admin@example.com' }, role: 'ADMINISTRADOR' };
const client = { user: { id: 'client', name: 'Client', email: 'client@example.com' }, role: 'CLIENTE' };

describe('Session synchronization between independently injected tabs', () => {
  let http: HttpTestingController;
  let tabs: DestroyableInjector[];
  let listeners: Set<() => void>[];
  let published: SessionAction[];
  beforeEach(() => {
    listeners = []; tabs = []; published = [];
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { tabs.forEach(tab => tab.destroy()); http.verify(); });
  function tab(lock: SessionLock | null = null): AuthService {
    const own = new Set<() => void>(); listeners.push(own);
    const events: SessionEvents = {
      publish(action) { published.push(action); listeners.filter(set => set !== own).forEach(set => set.forEach(listener => listener())); },
      subscribe(listener) { own.add(listener); return () => own.delete(listener); },
    };
    const injector = Injector.create({ parent: TestBed.inject(Injector), providers: [AuthService,
      { provide: SESSION_EVENTS, useValue: events }, { provide: SESSION_LOCK, useValue: lock }] });
    tabs.push(injector); return injector.get(AuthService);
  }

  it('invalidates other tabs on login/logout and restores a later different account from cookies', () => {
    const a = tab(); const b = tab();
    a.login('admin@example.com', 'password').subscribe();
    http.expectOne('http://localhost:3000/login').flush(admin);
    expect(b.initialized()).toBeFalse(); expect(b.remoteChange()).toBeGreaterThan(0);
    b.ensureSession().subscribe(); http.expectOne('http://localhost:3000/refresh').flush(admin);
    expect(b.role()).toBe('ADMINISTRADOR'); expect(published).toEqual(['login']);
    b.logout().subscribe(); http.expectOne('http://localhost:3000/logout').flush(null, { status: 204, statusText: 'No Content' });
    expect(a.user()).toBeNull(); expect(a.initialized()).toBeFalse();
    a.ensureSession().subscribe(); http.expectOne('http://localhost:3000/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    b.login('client@example.com', 'password').subscribe(); http.expectOne('http://localhost:3000/login').flush(client);
    a.ensureSession().subscribe(); http.expectOne('http://localhost:3000/refresh').flush(client);
    expect(a.user()?.id).toBe('client'); expect(a.role()).toBe('CLIENTE');
    expect(published).toEqual(['login', 'logout', 'login']);
  });

  it('never lets an earlier refresh finalize readiness or overwrite the newer session', () => {
    const a = tab(); const b = tab();
    a.refresh().subscribe(); const old = http.expectOne('http://localhost:3000/refresh');
    b.login('client@example.com', 'password').subscribe(); http.expectOne('http://localhost:3000/login').flush(client);
    a.ensureSession().subscribe(); const current = http.expectOne('http://localhost:3000/refresh');
    old.flush(admin);
    expect(a.user()).toBeNull(); expect(a.initialized()).toBeFalse();
    current.flush(client);
    expect(a.user()?.id).toBe('client'); expect(a.initialized()).toBeTrue();
    expect(published).toEqual(['login']);
  });

  it('does not announce a failed logout or clear the other tab', () => {
    const a = tab(); const b = tab();
    a.login('admin@example.com', 'password').subscribe(); http.expectOne('http://localhost:3000/login').flush(admin);
    b.ensureSession().subscribe(); http.expectOne('http://localhost:3000/refresh').flush(admin);
    const before = b.epoch;
    a.logout().subscribe({ error: () => undefined });
    http.expectOne('http://localhost:3000/logout').flush({}, { status: 500, statusText: 'Internal Server Error' });
    expect(a.user()?.id).toBe('admin'); expect(b.user()?.id).toBe('admin');
    expect(b.epoch).toBe(before); expect(published).toEqual(['login']);
  });

  it('serializes cookie reconciliation under the same Web Lock without rebroadcasting refresh', fakeAsync(() => {
    let tail: Promise<void> = Promise.resolve();
    const lock: SessionLock = { run<T>(work: () => Promise<T>): Promise<T> {
      const result = tail.then(work); tail = result.then(() => undefined, () => undefined); return result;
    } };
    const a = tab(lock); const b = tab(lock);
    a.login('admin@example.com', 'password').subscribe(); flushMicrotasks();
    http.expectOne('http://localhost:3000/login').flush(admin); flushMicrotasks();
    a.refresh().subscribe(); b.ensureSession().subscribe(); flushMicrotasks();
    const first = http.expectOne('http://localhost:3000/refresh');
    http.expectNone('http://localhost:3000/refresh'); first.flush(admin); flushMicrotasks();
    http.expectOne('http://localhost:3000/refresh').flush(admin); flushMicrotasks();
    expect(b.user()?.id).toBe('admin'); expect(published).toEqual(['login']);
  }));

  it('removes a destroyed tab from future notifications', () => {
    const a = tab(); const b = tab(); tabs.pop()?.destroy();
    const before = b.epoch;
    a.login('admin@example.com', 'password').subscribe(); http.expectOne('http://localhost:3000/login').flush(admin);
    expect(b.epoch).toBe(before);
  });
});
