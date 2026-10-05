import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { VmsService } from './vms.service';
import { VmsPage } from './vms-page';
import { VmDialog } from './vm-dialog';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { pageResponse, summaryFor } from './vm.test-helpers';
import type { Vm } from './vm.model';

const vm: Vm = { id: 'vm1', name: 'Servidor', os: 'Ubuntu', cores: 2, ram: 4, disk: 20, status: 'RUNNING' };
describe('VM inventory cards', () => {
  let http: HttpTestingController;
  const open = jasmine.createSpy('open');
  beforeEach(() => {
    open.calls.reset(); open.and.returnValue({ afterClosed: () => of(undefined) });
    TestBed.configureTestingModule({ imports: [VmsPage], providers: [provideHttpClient(), provideHttpClientTesting(), VmsService, { provide: MatDialog, useValue: { open } }] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login('admin@example.com', 'password').subscribe();
    http.expectOne('http://localhost:3000/login').flush({ user: { id: 'admin', name: 'Admin', email: 'admin@example.com' }, role: 'ADMINISTRADOR' });
  });
  afterEach(() => http.verify());
  function create() {
    const fixture = TestBed.createComponent(VmsPage);
    http.expectOne('http://localhost:3000/vms').flush(pageResponse([vm])); fixture.detectChanges();
    return fixture;
  }

  it('reserves ten card slots, controls and pagination during loading with one accessible status', () => {
    const fixture = TestBed.createComponent(VmsPage); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.inventory-loading .vm-card').length).toBe(10);
    expect(fixture.nativeElement.querySelectorAll('.inventory-loading .status-filters app-loading-skeleton').length).toBe(4);
    expect(fixture.nativeElement.querySelector('.inventory-loading .pagination')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.inventory-loading')?.getAttribute('role')).toBe('status');
    expect(fixture.nativeElement.querySelectorAll('.inventory-loading [role=status]').length).toBe(0);
    expect(fixture.nativeElement.querySelector('.inventory-loading [aria-hidden=true]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.inventory-loading button')).toBeNull();
    http.expectOne('http://localhost:3000/vms').flush(pageResponse([vm])); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.inventory-loading')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.vm-card').length).toBe(1);
  });

  it('shows persisted OS/status/resources without inventing usage metrics', () => {
    const fixture = create();
    expect(fixture.nativeElement.querySelectorAll('.vm-card').length).toBe(1);
    const text = fixture.nativeElement.querySelector('.vm-card').textContent;
    expect(text).toContain('Ubuntu'); expect(text).toContain('En ejecución'); expect(text).toContain('RAM');
    expect(text).not.toContain('%'); expect(text).not.toContain('Uptime');
    expect(fixture.nativeElement.querySelector('input[type=search]')).toBeNull();
  });

  it('opens the form with the inherited inventory injector and avoids duplicate POSTs', () => {
    const fixture = create(); fixture.componentInstance.edit();
    expect(open).toHaveBeenCalledWith(VmDialog, jasmine.objectContaining({ data: null, injector: jasmine.anything() }));
    http.expectNone(request => request.method === 'POST');
  });

  it('requires confirmation before deleting and rolls back only the affected card', () => {
    const fixture = create();
    fixture.componentInstance.remove({ ...vm, status: 'RUNNING' });
    expect(open).toHaveBeenCalledWith(ConfirmDialog, jasmine.objectContaining({ data: 'Servidor' }));
    http.expectNone(request => request.method === 'DELETE');
    open.and.returnValue({ afterClosed: () => of(true) });
    fixture.componentInstance.remove({ ...vm, status: 'RUNNING' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.vm-card')).toBeNull();
    http.expectOne('http://localhost:3000/vms/vm1').flush({}, { status: 500, statusText: 'Server Error' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.vm-card')).not.toBeNull();
  });
  it('filters cards by status without changing inventory counts or resource totals', () => {
    const fixture = create();
    fixture.componentInstance.selectStatus('STOPPED');
    http.expectOne('http://localhost:3000/vms?status=STOPPED').flush(pageResponse([], summaryFor([vm]))); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.vm-card').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('No hay máquinas en este estado');
    expect(fixture.nativeElement.textContent).not.toContain('Aún no hay máquinas virtuales');
    expect(fixture.componentInstance.statusCounts().ALL).toBe(1);
    expect(fixture.componentInstance.machines.totals().cores).toBe(2);
    expect(fixture.nativeElement.querySelector('[aria-pressed="true"]')?.textContent).toContain('Detenidas');
    fixture.componentInstance.selectStatus('RUNNING');
    http.expectOne('http://localhost:3000/vms?status=RUNNING').flush(pageResponse([vm])); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.vm-card').length).toBe(1);
  });

});
