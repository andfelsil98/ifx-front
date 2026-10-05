import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterOutlet, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom, map } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { FullScreenLoading } from './shared/full-screen-loading';
@Component({ selector:'app-root',standalone:true,imports:[RouterOutlet,FullScreenLoading],templateUrl:'./app.html',changeDetection:ChangeDetectionStrategy.OnPush })
export class App {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly synchronizing = signal(0);
  private readonly restoring = toSignal(this.router.events.pipe(
    filter(event => event instanceof NavigationStart || event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError),
    map(event => event instanceof NavigationStart && !this.auth.initialized() && event.url.split('?')[0] !== '/login'),
  ), { initialValue: false });
  readonly restoringSession = computed(() => this.restoring() || (this.synchronizing() !== 0 && this.synchronizing() === this.auth.epoch));

  constructor() {
    effect(() => {
      const epoch = this.auth.remoteChange();
      if (epoch) untracked(() => { void this.synchronizeSession(epoch); });
    });
  }

  private async synchronizeSession(epoch: number): Promise<void> {
    this.synchronizing.set(epoch);
    try {
      // Leaving the shell destroys its inventory, pending UI and SSE subscription.
      await this.router.navigateByUrl('/login');
      if (this.destroyRef.destroyed || epoch !== this.auth.epoch) return;
      const valid = await firstValueFrom(this.auth.ensureSession());
      if (this.destroyRef.destroyed || epoch !== this.auth.epoch) return;
      if (valid) await this.router.navigateByUrl('/dashboard');
    } finally {
      if (this.synchronizing() === epoch) this.synchronizing.set(0);
    }
  }
}
