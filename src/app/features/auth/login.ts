import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme.service';
import { errorMessage } from '../../shared/feedback.service';
import { ThemeToggle } from '../../shared/theme-toggle';
import { ButtonSpinner } from '../../shared/button-spinner';

@Component({
  selector: 'app-login', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, ThemeToggle, ButtonSpinner],
  templateUrl: './login.html', styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);
  readonly busy = signal(false);
  readonly passwordVisible = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  submit(): void {
    if (this.form.invalid || this.busy()) { this.form.markAllAsTouched(); return; }
    this.busy.set(true); this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email.trim().toLowerCase(), password).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => { void this.router.navigateByUrl('/dashboard'); },
      error: (error: unknown) => {
        this.error.set(error instanceof HttpErrorResponse && error.status === 401
          ? 'Usuario o contraseña incorrectos.' : errorMessage(error, 'No pudimos iniciar sesión. Intenta nuevamente.'));
      },
    });
  }
}
