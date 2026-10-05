import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { VmDialog } from './vm-dialog';
import { VmsService } from './vms.service';
import { FeedbackService } from '../../shared/feedback.service';
import type { Vm } from './vm.model';
import { formatVmNumber, parseVmNumber } from './vm-numeric-input';

const values = { name: '  dEV   sERVER ', os: ' UBUNTU   lINUX ', cores: '2', ram: '1,5', disk: '20.5', status: 'RUNNING' as const };
const saved: Vm = { id: 'new', name: 'Dev Server', os: 'Ubuntu Linux', cores: 2, ram: 1.5, disk: 20.5, status: 'RUNNING' };

describe('VM numeric input format', () => {
  it('accepts only positive decimal values up to 999 with a comma or point', () => {
    for (const value of ['1,5', '1.5', '0.001', '999', '999.0']) {
      expect(parseVmNumber(value, false)).withContext(value).not.toBeNull();
    }
    for (const value of ['', '0', '-1', '+1', '1e2', '0x10', 'NaN', 'Infinity', '1 2', '1,2.3', '1000', '999.001']) {
      expect(parseVmNumber(value, false)).withContext(value).toBeNull();
    }
  });
  it('prepares tiny persisted decimals for editing without exponents or lost precision', () => {
    for (const value of [0.0000001, 1.23e-8, Number.MIN_VALUE]) {
      const text = formatVmNumber(value);
      expect(text).not.toContain('e');
      expect(parseVmNumber(text, false)).toBe(value);
    }
  });
  it('requires cores to be an integer from 1 to 999 without decimal syntax', () => {
    expect(parseVmNumber('1', true)).toBe(1);
    expect(parseVmNumber('999', true)).toBe(999);
    for (const value of ['0', '1.0', '1,0', '1.5', '1000', '1e2', '+2', '-2', '0x2']) {
      expect(parseVmNumber(value, true)).withContext(value).toBeNull();
    }
  });
});

describe('VM form and pending request', () => {
  let response: Subject<Vm>;
  const close = jasmine.createSpy('close');
  const create = jasmine.createSpy('create');
  const update = jasmine.createSpy('update');
  let dialog: { close: typeof close; disableClose: boolean };
  beforeEach(() => {
    close.calls.reset(); create.calls.reset(); update.calls.reset(); response = new Subject<Vm>();
    create.and.returnValue(response); update.and.returnValue(response);
    dialog = { close, disableClose: false };
    TestBed.configureTestingModule({ imports: [VmDialog], providers: [
      { provide: MAT_DIALOG_DATA, useValue: null }, { provide: MatDialogRef, useValue: dialog },
      { provide: VmsService, useValue: { create, update } },
      { provide: FeedbackService, useValue: { success: () => undefined, error: () => undefined } },
    ] });
  });

  it('rejects blank text, fractional cores, zero RAM and negative disk', () => {
    const component = TestBed.createComponent(VmDialog).componentInstance;
    component.form.setValue({ name: '  ', os: '  ', cores: '1.5', ram: '0', disk: '-1', status: 'RUNNING' });
    component.save();
    expect(component.form.invalid).toBeTrue(); expect(create).not.toHaveBeenCalled();
    expect(component.form.controls.cores.hasError('integer')).toBeTrue();
  });

  it('uses text numeric inputs and never silently truncates out-of-range values', () => {
    const fixture = TestBed.createComponent(VmDialog);
    fixture.componentInstance.form.setValue({ ...values, cores: '1000', ram: '999.1', disk: '1e3' });
    fixture.componentInstance.save(); fixture.detectChanges();
    expect(create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.form.controls.cores.value).toBe('1000');
    expect(fixture.componentInstance.form.controls.ram.value).toBe('999.1');
    const input: HTMLInputElement | null = fixture.nativeElement.querySelector('[formControlName="cores"]');
    expect(input?.type).toBe('text'); expect(input?.inputMode).toBe('numeric');
    expect(fixture.nativeElement.textContent).toContain('entre 1 y 999');
  });

  it('normalizes text and sends exactly six fields with JSON numbers, keeping the spinner until success', () => {
    const fixture = TestBed.createComponent(VmDialog), component = fixture.componentInstance;
    component.form.setValue(values); component.save(); fixture.detectChanges();
    expect(create).toHaveBeenCalledOnceWith({ name: 'Dev Server', os: 'Ubuntu Linux', cores: 2, ram: 1.5, disk: 20.5, status: 'RUNNING' });
    expect(close).not.toHaveBeenCalled(); expect(dialog.disableClose).toBeTrue();
    expect(fixture.nativeElement.querySelector('app-button-spinner')).not.toBeNull();
    component.save(); expect(create).toHaveBeenCalledTimes(1);
    response.next(saved); response.complete(); expect(close).toHaveBeenCalledOnceWith();
  });

  it('keeps entered strings after a failed save and lets the user retry', () => {
    const fixture = TestBed.createComponent(VmDialog), component = fixture.componentInstance;
    component.form.setValue(values); component.save(); response.error(new Error('internal sensitive details')); fixture.detectChanges();
    expect(component.form.getRawValue()).toEqual(values); expect(component.busy()).toBeFalse();
    expect(component.form.enabled).toBeTrue(); expect(dialog.disableClose).toBeFalse(); expect(close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('sensitive'); expect(fixture.nativeElement.textContent).toContain('No se pudo guardar');
  });

  it('validates normalized name and OS at 100 characters and declares HTML maxlength', () => {
    const fixture = TestBed.createComponent(VmDialog), component = fixture.componentInstance;
    component.form.setValue({ ...values, name: 'N'.repeat(100), os: 'O'.repeat(100) });
    expect(component.form.valid).toBeTrue();
    component.form.controls.name.setValue('N'.repeat(101)); component.form.controls.os.setValue('O'.repeat(101));
    component.save(); fixture.detectChanges();
    expect(component.form.controls.name.hasError('maxlength')).toBeTrue();
    expect(component.form.controls.os.hasError('maxlength')).toBeTrue(); expect(create).not.toHaveBeenCalled();
    const input: HTMLInputElement | null = fixture.nativeElement.querySelector('[formControlName="name"]');
    expect(input?.maxLength).toBe(100);
  });

  it('preloads persisted numeric values as strings and updates using full numeric JSON', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, { useValue: saved });
    const component = TestBed.createComponent(VmDialog).componentInstance;
    expect(component.form.controls.ram.value).toBe('1.5');
    component.form.controls.ram.setValue('2,75'); component.save();
    expect(update).toHaveBeenCalledOnceWith('new', { name: 'Dev Server', os: 'Ubuntu Linux', cores: 2, ram: 2.75, disk: 20.5, status: 'RUNNING' });
    expect(create).not.toHaveBeenCalled(); response.next({ ...saved, ram: 2.75 }); response.complete();
  });
});
