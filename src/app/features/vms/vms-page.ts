import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { FeedbackService } from '../../shared/feedback.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { LoadingSkeleton } from '../../shared/loading-skeleton';
import { ButtonSpinner } from '../../shared/button-spinner';
import { VmsService } from './vms.service';
import type { Vm, VmStatus } from './vm.model';
import { STATUS_LABELS } from './vm.model';
import { VmDialog } from './vm-dialog';

@Component({
  selector: 'app-vms-page', standalone: true, host: { class: 'view-enter' }, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatButtonModule, LoadingSkeleton, ButtonSpinner],
  templateUrl: './vms-page.html', styleUrl: './vms-page.scss',
})
export class VmsPage {
  readonly auth = inject(AuthService);
  readonly machines = inject(VmsService);
  private readonly feedback = inject(FeedbackService);
  private readonly dialogs = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  readonly statusFilter = this.machines.status;
  readonly statuses = ['ALL', 'RUNNING', 'STOPPED', 'SUSPENDED'] as const;
  readonly filterLabels = { ALL: 'Todas', RUNNING: 'En ejecución', STOPPED: 'Detenidas', SUSPENDED: 'Suspendidas' };
  readonly statusCounts = computed(() => ({ ALL: this.machines.summary().total, ...this.machines.summary().counts }));
  readonly isAdmin = computed(() => this.auth.role() === 'ADMINISTRADOR');
  readonly statusLabels = STATUS_LABELS;

  constructor() {
    this.machines.setView('page');
    this.destroyRef.onDestroy(() => this.machines.setView(null));
    this.reload();
  }
  selectStatus(status: VmStatus | 'ALL'): void {
    this.machines.changeStatus(status).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: error => this.feedback.error(error, 'No pudimos cargar las máquinas virtuales.') });
  }
  nextPage(): void {
    this.machines.nextPage().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: error => this.feedback.error(error, 'No pudimos cargar la página siguiente.') });
  }
  previousPage(): void {
    this.machines.previousPage().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: error => this.feedback.error(error, 'No pudimos cargar la página anterior.') });
  }

  reload(): void {
    this.machines.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: error => this.feedback.error(error, 'No pudimos cargar las máquinas virtuales.') });
  }
  edit(vm: Vm | null = null): void {
    if (!this.isAdmin() || (vm && this.machines.isPending(vm.id))) return;
    this.dialogs.open(VmDialog, { data: vm, injector: this.injector, width: '600px', maxWidth: 'calc(100vw - 16px)' });
  }
  remove(vm: Vm): void {
    if (!this.isAdmin() || this.machines.isPending(vm.id)) return;
    this.dialogs.open<ConfirmDialog, string, boolean>(ConfirmDialog, { data: vm.name, width: '440px', maxWidth: 'calc(100vw - 32px)' }).afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(confirmed => {
      if (!confirmed || !this.isAdmin()) return;
      this.machines.delete(vm.id).subscribe({ next: () => this.feedback.success('Máquina virtual eliminada.'), error: error => this.feedback.error(error, 'No se pudo eliminar la máquina virtual. Revertimos el cambio.') });
    });
  }
}
