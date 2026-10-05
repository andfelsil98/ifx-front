import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector } from '@angular/core';
import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SESSION_LOCK } from './session-lock';
import type { SessionLock } from './session-lock';

const session = { user: { id: 'user', name: 'User', email: 'user@example.com' }, role: 'CLIENTE' };

// Two independently injected auth services simulate tabs sharing a single lock.
describe('Cross-tab authentication coordination', () => {
  let http: HttpTestingController;
  let runs: number;
  beforeEach(() => {
    runs = 0;
    let tail: Promise<void> = Promise.resolve();
    const lock: SessionLock = {
      run<T>(work: () => Promise<T>): Promise<T> {
        ++runs;
        const result = tail.then(work);
        tail = result.then(() => undefined, () => undefined);
        return result;
      },
    };
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), { provide: SESSION_LOCK, useValue: lock },
    ] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('serializes two refreshes until each response has applied its cookies', fakeAsync(() => {
    const tabA = Injector.create({ providers: [AuthService], parent: TestBed.inject(Injector) });
    const tabB = Injector.create({ providers: [AuthService], parent: TestBed.inject(Injector) });
    let completed = 0;
    tabA.get(AuthService).refresh().subscribe(() => { ++completed; });
    tabB.get(AuthService).refresh().subscribe(() => { ++completed; });
    flushMicrotasks();
    const first = http.expectOne('http://localhost:3000/refresh');
    http.expectNone('http://localhost:3000/refresh');
    first.flush(session);
    flushMicrotasks();
    expect(completed).toBe(1);
    http.expectOne('http://localhost:3000/refresh').flush(session);
    flushMicrotasks();
    expect(completed).toBe(2);
    expect(runs).toBe(2);
    tabA.destroy(); tabB.destroy();
  }));

  it('coordinates login and logout too, and releases a failed refresh lock', fakeAsync(() => {
    const tabA = Injector.create({ providers: [AuthService], parent: TestBed.inject(Injector) });
    const tabB = Injector.create({ providers: [AuthService], parent: TestBed.inject(Injector) });
    tabA.get(AuthService).refresh().subscribe({ error: () => undefined });
    tabB.get(AuthService).login('user@example.com', 'password').subscribe();
    flushMicrotasks();
    http.expectNone('http://localhost:3000/login');
    http.expectOne('http://localhost:3000/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    flushMicrotasks();
    http.expectOne('http://localhost:3000/login').flush(session);
    flushMicrotasks();
    expect(tabB.get(AuthService).authenticated()).toBeTrue();
    tabB.get(AuthService).logout().subscribe();
    flushMicrotasks();
    http.expectOne('http://localhost:3000/logout').flush(null, { status: 204, statusText: 'No Content' });
    flushMicrotasks();
    expect(tabB.get(AuthService).authenticated()).toBeFalse();
    expect(runs).toBe(3);
    tabA.destroy(); tabB.destroy();
  }));
});
