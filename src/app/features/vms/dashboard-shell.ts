import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { FullScreenLoading } from '../../shared/full-screen-loading';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme.service';
import { FeedbackService } from '../../shared/feedback.service';
import { ThemeToggle } from '../../shared/theme-toggle';
import { ButtonSpinner } from '../../shared/button-spinner';
import { VmsService } from './vms.service';

@Component({
  selector: 'app-dashboard-shell', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [VmsService],
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatButtonModule, MatMenuModule, ThemeToggle, ButtonSpinner, FullScreenLoading],
  templateUrl: './dashboard-shell.html', styleUrl: './dashboard-shell.scss',
})
export class DashboardShell {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly machines = inject(VmsService);
  private readonly feedback = inject(FeedbackService);
  private readonly dialogs = inject(MatDialog);
  private readonly accountMenu = viewChild(MatMenuTrigger);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly initialUser = this.auth.user();
  private readonly initialRole = this.auth.role();
  readonly accountName = computed(() => this.auth.user()?.name ?? this.initialUser?.name ?? 'Mi cuenta');
  readonly accountEmail = computed(() => this.auth.user()?.email ?? this.initialUser?.email ?? '');
  readonly accountRole = computed(() => (this.auth.role() ?? this.initialRole) === 'ADMINISTRADOR' ? 'Administrador' : 'Cliente');
  readonly initials = computed(() => this.accountName().trim().split(/\s+/).slice(0, 2).map(part => part.slice(0, 1)).join('').toUpperCase());
  readonly leaving = signal(false);
  readonly scrolled = signal(false);

  @HostListener('window:scroll')
  onScroll(): void { this.scrolled.set(window.scrollY > 8); }

  constructor() {
    this.onScroll();
    this.destroyRef.onDestroy(() => this.dialogs.closeAll());

  }

  logout(): void {
    if (this.leaving() || this.machines.pendingIds().size > 0) return;
    this.accountMenu()?.closeMenu();
    this.leaving.set(true);
    this.auth.logout().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.dialogs.closeAll(); void this.router.navigateByUrl('/login'); },
      error: error => {
        this.feedback.error(error, 'No pudimos cerrar la sesión. Intenta nuevamente.');
        if (this.auth.authenticated()) {
          this.machines.load().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.leaving.set(false))).subscribe({ error: reloadError => this.feedback.error(reloadError, 'No pudimos cargar las máquinas virtuales.') });
        } else { this.leaving.set(false); }
      },
    });
  }
}
