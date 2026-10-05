import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { VmsService } from './vms.service';
import { Dashboard } from './dashboard';
import { summaryFor } from './vm.test-helpers';
import type { Vm } from './vm.model';

const running: Vm = { id: 'run', name: 'Activa', os: 'Ubuntu', cores: 2, ram: 4.5, disk: 20, status: 'RUNNING' };
describe('Dashboard summary', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Dashboard], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), VmsService] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login('user@example.com', 'password').subscribe();
    http.expectOne('http://localhost:3000/login').flush({ user: { id: 'user', name: 'User', email: 'user@example.com' }, role: 'CLIENTE' });
  });
  afterEach(() => http.verify());

  it('shows all statuses but sums resources only for running VMs', () => {
    const fixture = TestBed.createComponent(Dashboard);
    const service = TestBed.inject(VmsService);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.dashboard-loading .summary').length).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('.dashboard-loading .resource-panel').length).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('.dashboard-loading [role=status]').length).toBe(0);
    expect(fixture.nativeElement.querySelector('.dashboard-loading')?.getAttribute('role')).toBe('status');
    expect(fixture.nativeElement.querySelector('.dashboard-loading [aria-hidden=true]')).not.toBeNull();
    http.expectOne('http://localhost:3000/vms/summary').flush({ summary: summaryFor([running, { ...running, id: 'stop', status: 'STOPPED', cores: 50 }, { ...running, id: 'suspend', status: 'SUSPENDED' }]) });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dashboard-loading')).toBeNull();
    expect(fixture.componentInstance.running()).toBe(1);
    expect(fixture.componentInstance.stopped()).toBe(1);
    expect(fixture.componentInstance.suspended()).toBe(1);
    expect(service.totals()).toEqual({ cores: 2, ram: 4.5, disk: 20 });
    expect(fixture.nativeElement.textContent).toContain('Solo máquinas en ejecución');
    expect(fixture.nativeElement.querySelector('.vm-card')).toBeNull();
  });

  it('presents load failure and allows retry without creating fake data', () => {
    const fixture = TestBed.createComponent(Dashboard);
    http.expectOne('http://localhost:3000/vms/summary').flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar el resumen');
    fixture.componentInstance.reload();
    http.expectOne('http://localhost:3000/vms/summary').flush({ summary: summaryFor([]) }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-resource-chart').length).toBe(3);
  });
});
