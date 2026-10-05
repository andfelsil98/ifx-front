import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FeedbackService } from '../../shared/feedback.service';
import { LoadingSkeleton } from '../../shared/loading-skeleton';
import { VmsService } from './vms.service';
import { ResourceChart } from './resource-chart';

@Component({
  selector: 'app-dashboard', standalone: true, host: { class: 'view-enter' }, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatButtonModule, LoadingSkeleton, ResourceChart],
  templateUrl: './dashboard.html', styleUrl: './dashboard.scss',
})
export class Dashboard {
  readonly machines = inject(VmsService);
  private readonly feedback = inject(FeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  readonly running = computed(() => this.machines.summary().counts.RUNNING);
  readonly stopped = computed(() => this.machines.summary().counts.STOPPED);
  readonly suspended = computed(() => this.machines.summary().counts.SUSPENDED);
  readonly metrics = [{ key: 'cores', label: 'Cores asignados', unit: 'cores' }, { key: 'ram', label: 'RAM asignada', unit: 'GB' }, { key: 'disk', label: 'Disco asignado', unit: 'GB' }] as const;

  constructor() {
    this.machines.setView('summary');
    this.destroyRef.onDestroy(() => this.machines.setView(null));
    this.reload();
  }

  reload(): void {
    this.machines.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: error => this.feedback.error(error, 'No pudimos actualizar el resumen.') });
  }
}
