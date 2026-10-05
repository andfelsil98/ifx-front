import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { HttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';

const session = { user: { id: 'admin', name: 'Admin', email: 'admin@example.com' }, role: 'ADMINISTRADOR' };

describe('AuthService and cookie interceptor', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let client: HttpClient;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), provideRouter([]),
    ] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
  });
  afterEach(() => http.verify());

  it('logs in using cookies and retains only the public session projection', () => {
    auth.login('admin@example.com', 'a-password').subscribe();
    const request = http.expectOne('http://localhost:3000/login');
    expect(request.request.withCredentials).toBeTrue();
    expect(request.request.body).toEqual({ email: 'admin@example.com', password: 'a-password' });
    request.flush({ ...session, token: 'unexpected', user: { ...session.user, passwordHash: 'unexpected' } });
    expect(auth.user()).toEqual(session.user);
    expect(auth.role()).toBe('ADMINISTRADOR');
  });

  it('restores a session with refresh rather than an unavailable /me endpoint', () => {
    let valid = false;
    auth.ensureSession().subscribe((value) => { valid = value; });
    http.expectOne('http://localhost:3000/refresh').flush(session);
    expect(valid).toBeTrue();
    expect(auth.initialized()).toBeTrue();
  });

  it('renews once for concurrent 401 requests and retries each original request', () => {
    let completed = 0;
    client.get('http://localhost:3000/vms').subscribe(() => { ++completed; });
    client.get('http://localhost:3000/vms/a').subscribe(() => { ++completed; });
    http.expectOne('http://localhost:3000/vms').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('http://localhost:3000/vms/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('http://localhost:3000/refresh').flush(session);
    http.expectOne('http://localhost:3000/vms').flush({ vms: [] });
    http.expectOne('http://localhost:3000/vms/a').flush({});
    expect(completed).toBe(2);
  });

  it('does not renew again when the retried request also fails with 401', () => {
    let failed = false;
    client.get('http://localhost:3000/vms').subscribe({ error: () => { failed = true; } });
    http.expectOne('http://localhost:3000/vms').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('http://localhost:3000/refresh').flush(session);
    http.expectOne('http://localhost:3000/vms').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectNone('http://localhost:3000/refresh');
    expect(failed).toBeTrue();
  });

  it('does not refresh incorrect login credentials or expose server payloads', () => {
    let failed = false;
    auth.login('admin@example.com', 'incorrect').subscribe({ error: () => { failed = true; } });
    http.expectOne('http://localhost:3000/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectNone('http://localhost:3000/refresh');
    expect(failed).toBeTrue();
    expect(auth.user()).toBeNull();
  });

  it('waits for refresh before logout and cannot resurrect the public session', () => {
    auth.refresh().subscribe();
    auth.logout().subscribe();
    http.expectNone('http://localhost:3000/logout');
    http.expectOne('http://localhost:3000/refresh').flush(session);
    expect(auth.user()).toBeNull();
    http.expectOne('http://localhost:3000/logout').flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.authenticated()).toBeFalse();
  });

  it('does not retry old protected requests after logout', () => {
    let failed = false;
    client.get('http://localhost:3000/vms').subscribe({ error: () => { failed = true; } });
    const protectedRequest = http.expectOne('http://localhost:3000/vms');
    auth.logout().subscribe();
    http.expectOne('http://localhost:3000/logout').flush(null, { status: 204, statusText: 'No Content' });
    protectedRequest.flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectNone('http://localhost:3000/refresh');
    expect(failed).toBeTrue();
  });

  it('completes refresh before login to prevent cookies crossing between users', () => {
    auth.refresh().subscribe();
    auth.login('client@example.com', 'password').subscribe();
    http.expectNone('http://localhost:3000/login');
    http.expectOne('http://localhost:3000/refresh').flush(session);
    expect(auth.user()).toBeNull();
    http.expectOne('http://localhost:3000/login').flush({ user: { id: 'client', name: 'Client', email: 'client@example.com' }, role: 'CLIENTE' });
    expect(auth.user()?.id).toBe('client');
  });

  it('never sends application credentials or renews requests to third parties', () => {
    client.get('https://outside.example/vms').subscribe({ error: () => undefined });
    const request = http.expectOne('https://outside.example/vms');
    expect(request.request.withCredentials).toBeFalse();
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectNone('http://localhost:3000/refresh');
  });

  it('fails a malformed session response instead of retaining unknown data', () => {
    let failed = false;
    auth.login('admin@example.com', 'password').subscribe({ error: () => { failed = true; } });
    http.expectOne('http://localhost:3000/login').flush({ ...session, role: 'ADMIN' });
    expect(failed).toBeTrue();
    expect(auth.user()).toBeNull();
  });
  it('restores the previous public session when persistence fails during logout', () => {
    auth.login('admin@example.com', 'password').subscribe();
    http.expectOne('http://localhost:3000/login').flush(session);
    auth.logout().subscribe({ error: () => undefined });
    expect(auth.user()).toBeNull();
    http.expectOne('http://localhost:3000/logout').flush({}, { status: 500, statusText: 'Internal Server Error' });
    expect(auth.user()).toEqual(session.user);
    auth.refresh().subscribe();
    http.expectOne('http://localhost:3000/refresh').flush(session);
  });

  it('redirects to login when refresh has expired instead of retrying endlessly', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    client.get('http://localhost:3000/vms').subscribe({ error: () => undefined });
    http.expectOne('http://localhost:3000/vms').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('http://localhost:3000/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(navigate).toHaveBeenCalledOnceWith('/login');
    expect(auth.user()).toBeNull();
    http.expectNone('http://localhost:3000/vms');
  });

});
