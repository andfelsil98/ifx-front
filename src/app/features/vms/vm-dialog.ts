import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { Vm, VmInput, VmStatus } from './vm.model';
import { normalizeText, normalizeVmLabel } from './vm.model';
import { formatVmNumber, parseVmNumber } from './vm-numeric-input';
import { VmsService } from './vms.service';
import { ButtonSpinner } from '../../shared/button-spinner';
import { FeedbackService, errorMessage } from '../../shared/feedback.service';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export function nonBlank(control: AbstractControl<unknown>): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim() ? null : { blank: true };
}
export function positiveNumber(control: AbstractControl<unknown>): ValidationErrors | null {
  return parseVmNumber(control.value, false) !== null ? null : { positive: true };
}
export function positiveInteger(control: AbstractControl<unknown>): ValidationErrors | null {
  return parseVmNumber(control.value, true) !== null ? null : { integer: true };
}

export function boundedText(control: AbstractControl<unknown>): ValidationErrors | null {
  return typeof control.value === 'string' && normalizeText(control.value).length <= 100 ? null : { maxlength: true };
}

@Component({
  selector: 'app-vm-dialog', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, ButtonSpinner],
  templateUrl: './vm-dialog.html',
  styles: `form { display:grid; grid-template-columns:1fr 1fr; gap:24px 16px; align-items:start; padding-top:12px; } mat-form-field { width:100%; min-width:0; } .full { grid-column:1 / -1; } .description { color:var(--mat-sys-on-surface-variant); font-size:14px; }
    mat-dialog-actions { flex-wrap:nowrap; gap:8px; }
    @media(max-width:400px) { mat-dialog-actions { padding:12px 8px; } mat-dialog-actions button { min-width:0; padding-inline:8px; font-size:12px; white-space:nowrap; } }
    @media(max-width:550px) { form { grid-template-columns:1fr; } }`,
})
export class VmDialog {
  readonly vm = inject<Vm | null>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialogRef<VmDialog>);
  private readonly machines = inject(VmsService);
  private readonly feedback = inject(FeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    name: [this.vm?.name ?? '', [Validators.required, nonBlank, boundedText]],
    cores: [formatVmNumber(this.vm?.cores ?? 1), [Validators.required, positiveInteger]],
    ram: [formatVmNumber(this.vm?.ram ?? 1), [Validators.required, positiveNumber]],
    disk: [formatVmNumber(this.vm?.disk ?? 20), [Validators.required, positiveNumber]],
    os: [this.vm?.os ?? '', [Validators.required, nonBlank, boundedText]],
    status: [this.vm?.status ?? 'STOPPED' as VmStatus, Validators.required],
  });
  normalizeLabel(field: 'name' | 'os'): void {
    const control = this.form.controls[field];
    control.setValue(normalizeVmLabel(control.value));
  }
  save(): void {
    if (this.busy()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const values = this.form.getRawValue();
    const cores = parseVmNumber(values.cores, true);
    const ram = parseVmNumber(values.ram, false);
    const disk = parseVmNumber(values.disk, false);
    if (cores === null || ram === null || disk === null) { this.form.markAllAsTouched(); return; }
    const data: VmInput = { name: normalizeVmLabel(values.name), os: normalizeVmLabel(values.os), cores, ram, disk, status: values.status };
    this.busy.set(true); this.error.set(''); this.dialog.disableClose = true; this.form.disable();
    const request = this.vm ? this.machines.update(this.vm.id, data) : this.machines.create(data);
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
      this.busy.set(false); this.dialog.disableClose = false; this.form.enable();
    })).subscribe({
      next: () => {
        this.feedback.success(this.vm ? 'Máquina virtual actualizada.' : 'Máquina virtual creada.');
        this.dialog.close();
      },
      error: (error: unknown) => {
        this.error.set(errorMessage(error, 'No se pudo guardar la máquina virtual. Revisa los datos e intenta nuevamente.'));
        this.feedback.error(error, 'No se pudo guardar la máquina virtual. Revertimos el cambio.');
      },
    });
  }
}
