import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { By } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import type { Role } from '../../core/auth/auth.model';
import { DashboardShell } from './dashboard-shell';
import { VmsService } from './vms.service';
import { VmsPage } from './vms-page';
import { pageResponse, summaryFor } from './vm.test-helpers';
import type { Vm } from './vm.model';

const vm: Vm = { id: 'vm1', name: 'Dev server', os: 'Ubuntu', cores: 2, ram: 4, disk: 20, status: 'RUNNING' };

describe('Protected shell and shared inventory', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  const open = jasmine.createSpy('open');
  const closeAll = jasmine.createSpy('closeAll');
  beforeEach(() => {
    open.calls.reset(); closeAll.calls.reset();
    open.and.returnValue({ afterClosed: () => of(undefined) });
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter(routes),
      { provide: MatDialog, useValue: { open, closeAll } },
    ] });
    http = TestBed.inject(HttpTestingController); auth = TestBed.inject(AuthService);
  });
  afterEach(() => http.verify());
  function login(role: Role): void {
    auth.login('user@example.com', 'password').subscribe();
    http.expectOne('http://localhost:3000/login').flush({ user: { id: 'user', name: 'Test User', email: 'user@example.com' }, role });
  }

  it('shares inventory state while loading summary-only Dashboard and a bounded VMs page', async () => {
    login('ADMINISTRADOR');
    const harness = await RouterTestingHarness.create('/dashboard');
    http.expectOne('http://localhost:3000/vms/summary').flush({ summary: summaryFor([vm]) }); harness.detectChanges();
    const dashboardInventory = harness.routeDebugElement?.injector.get(VmsService);
    expect(harness.routeNativeElement?.textContent).toContain('Recursos asignados');
    expect(harness.routeNativeElement?.querySelectorAll('app-resource-chart').length).toBe(3);
    await harness.navigateByUrl('/vms'); harness.detectChanges();
    expect(harness.routeDebugElement?.injector.get(VmsService)).toBe(dashboardInventory);
    http.expectOne('http://localhost:3000/vms').flush(pageResponse([vm])); harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('.vm-card')?.textContent).toContain('Dev server');
    expect(harness.routeNativeElement?.querySelector('[aria-current="page"]')?.textContent).toContain('Máquinas virtuales');
    expect(harness.routeNativeElement?.querySelector('app-resource-chart')).toBeNull();
  });

  it('preserves account display and shows pending logout until the server completes', async () => {
    login('ADMINISTRADOR');
    const harness = await RouterTestingHarness.create('/dashboard');
    http.expectOne('http://localhost:3000/vms/summary').flush({ summary: summaryFor([]) }); harness.detectChanges();
    const shell = harness.routeDebugElement?.injector.get(DashboardShell);
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    shell?.logout(); harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Cerrando sesión');
    expect(harness.routeNativeElement?.textContent).toContain('Test User');
    expect(shell?.leaving()).toBeTrue();
    expect(harness.routeNativeElement?.querySelector('app-full-screen-loading')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('.workspace')?.hasAttribute('inert')).toBeTrue();
    expect(navigate).not.toHaveBeenCalled();
    http.expectOne('http://localhost:3000/logout').flush(null, { status: 204, statusText: 'No Content' });
    expect(navigate).toHaveBeenCalledOnceWith('/login');
    expect(closeAll).toHaveBeenCalled();
    expect(shell?.leaving()).toBeTrue();
  });

  it('covers a failed logout until restored inventory has finished loading', async () => {
    login('ADMINISTRADOR');
    const harness = await RouterTestingHarness.create('/dashboard');
    http.expectOne('http://localhost:3000/vms/summary').flush({ summary: summaryFor([vm]) }); harness.detectChanges();
    const shell = harness.routeDebugElement?.injector.get(DashboardShell);
    shell?.logout(); harness.detectChanges();
    http.expectOne('http://localhost:3000/logout').flush({}, { status: 500, statusText: 'Internal Server Error' });
    harness.detectChanges();
    expect(auth.authenticated()).toBeTrue();
    expect(shell?.leaving()).toBeTrue();
    expect(harness.routeNativeElement?.querySelector('app-full-screen-loading')).not.toBeNull();
    http.expectOne('http://localhost:3000/vms/summary').flush({ summary: summaryFor([vm]) }); harness.detectChanges();
    expect(shell?.leaving()).toBeFalse();
    expect(shell?.machines.summary().total).toBe(1);
    expect(harness.routeNativeElement?.querySelector('app-full-screen-loading')).toBeNull();
  });

  it('lets CLIENTE navigate and read cards without exposing mutation actions', async () => {
    login('CLIENTE');
    const harness = await RouterTestingHarness.create('/vms');
    http.expectOne('http://localhost:3000/vms').flush(pageResponse([vm])); harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).not.toContain('Crear VM');
    expect(harness.routeNativeElement?.querySelector('[aria-label="Editar Dev server"]')).toBeNull();
    const page = harness.fixture.debugElement.query(By.directive(VmsPage)).injector.get(VmsPage);
    page.edit(); page.remove({ ...vm, status: 'RUNNING' });
    expect(open).not.toHaveBeenCalled();
  });

  it('guards both Dashboard and VMs before rendering the protected shell', async () => {
    const creating = RouterTestingHarness.create();
    const harness = await creating;
    const navigation = harness.navigateByUrl('/dashboard');
    await Promise.resolve();
    http.expectOne('http://localhost:3000/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.routeNativeElement?.querySelector('.app-header')).toBeNull();
    http.expectNone('http://localhost:3000/vms');
  });
  it('finishes a pending delete after navigating from VMs to Dashboard', async () => {
    login('ADMINISTRADOR');
    const harness = await RouterTestingHarness.create('/vms');
    http.expectOne('http://localhost:3000/vms').flush(pageResponse([vm])); harness.detectChanges();
    const inventory = harness.routeDebugElement?.injector.get(VmsService);
    const page = harness.fixture.debugElement.query(By.directive(VmsPage)).injector.get(VmsPage);
    open.and.returnValue({ afterClosed: () => of(true) });
    page.remove({ ...vm, status: 'RUNNING' });
    const deletion = http.expectOne('http://localhost:3000/vms/vm1');
    await harness.navigateByUrl('/dashboard'); harness.detectChanges();
    http.expectOne('http://localhost:3000/vms/summary').flush({ summary: summaryFor([vm]) });
    expect(deletion.cancelled).toBeFalse();
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('http://localhost:3000/vms/summary').flush({ summary: summaryFor([], 2) });
    expect(inventory?.summary().total).toBe(0);
    expect(inventory?.pendingIds().size).toBe(0);
  });

});
