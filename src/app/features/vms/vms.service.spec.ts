import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import type { Role, SessionUser } from '../../core/auth/auth.model';
import { VmsService } from './vms.service';
import type { Vm, VmInput } from './vm.model';
import { VM_EVENTS } from './vm-events';
import type { VmEvent, VmEventsQuery } from './vm-events';
import { pageResponse, summaryFor } from './vm.test-helpers';

const input: VmInput = { name: 'Servidor', cores: 4, ram: 8.5, disk: 120.25, os: 'Ubuntu', status: 'RUNNING' };
const first: Vm = { id: 'first', ...input };
const second: Vm = { id: 'second', ...input, name: 'Otro', status: 'STOPPED' };

describe('VmsService server pages, global summary and realtime overlays', () => {
  let service: VmsService;
  let http: HttpTestingController;
  let epoch: number;
  const role = signal<Role>('ADMINISTRADOR');
  const user = signal<SessionUser | null>({ id: 'admin', name: 'Admin', email: 'admin@example.com' });
  let streams: { query: VmEventsQuery; subject: Subject<VmEvent> }[];
  beforeEach(() => {
    epoch = 1; streams = []; role.set('ADMINISTRADOR'); user.set({ id: 'admin', name: 'Admin', email: 'admin@example.com' });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), VmsService,
      { provide: AuthService, useValue: { role, user, get epoch() { return epoch; } } },
      { provide: VM_EVENTS, useValue: (query: VmEventsQuery) => {
        const subject = new Subject<VmEvent>(); streams.push({ query, subject }); return subject;
      } },
    ] });
    service = TestBed.inject(VmsService); http = TestBed.inject(HttpTestingController); TestBed.tick();
  });
  afterEach(() => http.verify());
  function load(vms: readonly Vm[] = [first, second]): void {
    service.setView('page'); service.load().subscribe();
    http.expectOne('http://localhost:3000/vms').flush(pageResponse(vms)); TestBed.tick();
  }
  function latest(): Subject<VmEvent> {
    const stream = streams.at(-1);
    if (!stream) throw new Error('Expected stream');
    return stream.subject;
  }
  function reconcile(vms: readonly Vm[]): void { http.expectOne('http://localhost:3000/vms').flush(pageResponse(vms, summaryFor(vms, 2))); }

  it('keeps global totals independent of the ten visible VMs', () => {
    service.setView('page'); service.load().subscribe();
    const summary = { revision: 1, total: 42, counts: { RUNNING: 20, STOPPED: 12, SUSPENDED: 10 }, resources: { cores: 100, ram: 500, disk: 1000 } };
    http.expectOne('http://localhost:3000/vms').flush(pageResponse([first], summary, 'first'));
    expect(service.vms().length).toBe(1); expect(service.totals()).toEqual(summary.resources);
    expect(service.filteredTotal()).toBe(42);
  });

  it('paginates by cursor and resets to page one when changing the server status filter', () => {
    service.setView('page'); service.load().subscribe();
    http.expectOne('http://localhost:3000/vms').flush(pageResponse([first], summaryFor([first, second]), 'first'));
    service.nextPage().subscribe();
    http.expectOne('http://localhost:3000/vms?after=first').flush(pageResponse([second], summaryFor([first, second])));
    expect(service.pageNumber()).toBe(2); expect(service.hasPrevious()).toBeTrue();
    service.previousPage().subscribe(); http.expectOne('http://localhost:3000/vms').flush(pageResponse([first], summaryFor([first, second]), 'first'));
    service.changeStatus('STOPPED').subscribe();
    http.expectOne('http://localhost:3000/vms?status=STOPPED').flush(pageResponse([second], summaryFor([first, second])));
    expect(service.pageNumber()).toBe(1); expect(service.hasPrevious()).toBeFalse(); expect(service.filteredTotal()).toBe(1);
  });

  it('merges realtime snapshots under an optimistic edit and reveals the latest remote row on failure', () => {
    load(); service.update('first', { ...input, cores: 8 }).subscribe({ error: () => undefined });
    latest().next({ type: 'page', data: pageResponse([{ ...first, cores: 6 }, second]) });
    latest().next({ type: 'summary', data: { summary: summaryFor([{ ...first, cores: 6 }, second], 2) } });
    expect(service.vms()[0]?.cores).toBe(8); expect(service.totals().cores).toBe(6);
    http.expectOne('http://localhost:3000/vms/first').flush({}, { status: 500, statusText: 'Server Error' });
    expect(service.vms()[0]?.cores).toBe(6); expect(service.totals().cores).toBe(6);
  });

  it('does not double count an optimistic create when the server summary updates before its response', () => {
    load([]); service.create(input).subscribe();
    expect(service.vms()[0]?.id).toMatch(/^pending-/); expect(service.totals().cores).toBe(0);
    latest().next({ type: 'summary', data: { summary: summaryFor([first], 2) } });
    http.expectOne('http://localhost:3000/vms').flush({ vm: first });
    expect(service.vms().length).toBe(1); expect(service.totals().cores).toBe(4);
    reconcile([first]); expect(service.vms()).toEqual([first]); expect(service.totals().cores).toBe(4);
  });

  it('rolls back only the failed edit while another VM succeeds', () => {
    load(); service.update('first', { ...input, cores: 8 }).subscribe({ error: () => undefined });
    service.update('second', { ...input, name: 'Actualizada', disk: 400 }).subscribe();
    const updated: Vm = { ...second, name: 'Actualizada', disk: 400 };
    http.expectOne('http://localhost:3000/vms/second').flush({ vm: updated });
    http.expectOne('http://localhost:3000/vms/first').flush({}, { status: 500, statusText: 'Server Error' });
    expect(service.vms().find(vm => vm.id === 'first')).toEqual(first);
    expect(service.vms().find(vm => vm.id === 'second')?.disk).toBe(400);
    reconcile([first, updated]); expect(service.error()).toBeNull();
  });

  it('blocks writes to the same VM and page navigation while a mutation is pending', () => {
    load(); service.update('first', { ...input, cores: 8 }).subscribe();
    let rejected = 0;
    service.delete('first').subscribe({ error: () => { ++rejected; } });
    service.changeStatus('STOPPED').subscribe({ error: () => { ++rejected; } });
    expect(rejected).toBe(2);
    http.expectOne('http://localhost:3000/vms/first').flush({ vm: { ...first, cores: 8 } });
    reconcile([{ ...first, cores: 8 }, second]);
  });

  it('removes and restores a failed deletion without overwriting another realtime row', () => {
    load(); service.delete('first').subscribe({ error: () => undefined });
    latest().next({ type: 'page', data: pageResponse([first, { ...second, disk: 250 }]) });
    expect(service.vms().map(vm => vm.id)).toEqual(['second']);
    http.expectOne('http://localhost:3000/vms/first').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(service.vms().find(vm => vm.id === 'first')).toEqual(first);
    expect(service.vms().find(vm => vm.id === 'second')?.disk).toBe(250);
  });

  it('keeps a successful deletion hidden until authoritative page reconciliation', () => {
    load(); service.delete('first').subscribe();
    http.expectOne('http://localhost:3000/vms/first').flush(null, { status: 204, statusText: 'No Content' });
    expect(service.vms()).toEqual([second]); reconcile([second]); expect(service.vms()).toEqual([second]);
  });

  it('ignores older aggregate revisions and an HTTP page superseded by realtime', () => {
    load(); service.load().subscribe(); const request = http.expectOne('http://localhost:3000/vms');
    latest().next({ type: 'page', data: pageResponse([{ ...first, cores: 8 }, second], summaryFor([first, second]), null, '001728000001:000000002') });
    latest().next({ type: 'summary', data: { summary: summaryFor([{ ...first, cores: 8 }, second], 5) } });
    request.flush(pageResponse([first, second], summaryFor([first, second], 2), null, '001728000001:000000001'));
    expect(service.vms()[0]?.cores).toBe(8); expect(service.totals().cores).toBe(8);
  });

  it('accepts a newer HTTP snapshot even when an older SSE snapshot arrived while it was pending', () => {
    load(); service.load().subscribe(); const request = http.expectOne('http://localhost:3000/vms');
    latest().next({ type: 'page', data: pageResponse([first, second], summaryFor([first, second]), null, '001728000002:000000001') });
    request.flush(pageResponse([{ ...first, cores: 9 }, second], summaryFor([{ ...first, cores: 9 }, second], 3), null, '001728000002:000000002'));
    expect(service.vms()[0]?.cores).toBe(9);
    expect(service.changedIds().size).toBe(0);
  });

  it('clears a confirmed overlay after an older GET when a newer SSE snapshot is already authoritative', () => {
    load(); service.update('first', { ...input, cores: 8 }).subscribe();
    http.expectOne('http://localhost:3000/vms/first').flush({ vm: { ...first, cores: 8 } });
    latest().next({ type: 'page', data: pageResponse([{ ...first, cores: 9 }, second], summaryFor([first, second]), null, '001728000003:000000002') });
    expect(service.vms()[0]?.cores).toBe(8);
    http.expectOne('http://localhost:3000/vms').flush(pageResponse([{ ...first, cores: 8 }, second], summaryFor([first, second]), null, '001728000003:000000001'));
    expect(service.vms()[0]?.cores).toBe(9);
    expect(service.changedIds().has('first')).toBeTrue();
    expect(service.updateAnnouncement()).toBe('Máquina actualizada: Servidor.');
  });

  it('rejects invalid read versions instead of applying unorderable pages', () => {
    service.setView('page'); service.load().subscribe({ error: () => undefined });
    http.expectOne('http://localhost:3000/vms').flush(pageResponse([first], summaryFor([first]), null, 'invalid'));
    expect(service.vms()).toEqual([]); expect(service.error()).toContain('No pudimos');
  });

  it('highlights remote changes for three seconds and resets ordering when the query changes', fakeAsync(() => {
    load();
    latest().next({ type: 'page', data: pageResponse([{ ...first, cores: 6 }, second], summaryFor([first, second]), null, '001728000004:000000010') });
    expect(service.changedIds().has('first')).toBeTrue();
    tick(2999); expect(service.changedIds().has('first')).toBeTrue();
    tick(1); expect(service.changedIds().size).toBe(0); expect(service.updateAnnouncement()).toBe('');
    service.changeStatus('STOPPED').subscribe();
    http.expectOne('http://localhost:3000/vms?status=STOPPED').flush(pageResponse([second], summaryFor([first, second]), null, '001728000004:000000001'));
    expect(service.vms()).toEqual([second]);
  }));

  it('closes the old listener when switching views and when logging out', () => {
    load(); const pageStream = latest();
    service.setView('summary'); TestBed.tick(); expect(pageStream.observed).toBeFalse();
    expect(streams.at(-1)?.query).toEqual({ view: 'summary' });
    const summaryStream = latest(); ++epoch; user.set(null); TestBed.tick();
    expect(summaryStream.observed).toBeFalse(); expect(service.vms()).toEqual([]); expect(service.summary().total).toBe(0);
  });

  it('ignores delayed mutation responses from the previous session', () => {
    load(); service.update('first', { ...input, cores: 8 }).subscribe();
    ++epoch; user.set(null); TestBed.tick();
    http.expectOne('http://localhost:3000/vms/first').flush({ vm: { ...first, cores: 8 } });
    expect(service.vms()).toEqual([]); http.expectNone('http://localhost:3000/vms');
  });

  it('blocks CLIENTE mutations even through direct service calls', () => {
    load(); role.set('CLIENTE'); let rejected = 0;
    const reject = () => { ++rejected; };
    service.create(input).subscribe({ error: reject }); service.update('first', input).subscribe({ error: reject }); service.delete('first').subscribe({ error: reject });
    expect(rejected).toBe(3); http.expectNone(request => request.method !== 'GET');
  });

  it('rejects pages over ten rows and malformed summaries without exposing their data', () => {
    service.setView('page'); service.load().subscribe({ error: () => undefined });
    http.expectOne('http://localhost:3000/vms').flush(pageResponse(Array.from({ length: 11 }, (_, index) => ({ ...first, id: `vm${index}` }))));
    expect(service.vms()).toEqual([]); expect(service.error()).toContain('No pudimos');
  });

  it('closes malformed streams and allows an explicit reconnect', () => {
    load(); const malformed = latest(); malformed.next({ type: 'summary', data: { summary: { revision: 'wrong', secret: 'hidden' } } });
    expect(service.connection()).toBe('offline'); expect(malformed.observed).toBeFalse();
    service.retryLive(); TestBed.tick(); expect(streams.length).toBe(2);
  });
});
