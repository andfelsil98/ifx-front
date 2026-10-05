import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No pudimos conectar con el servidor. Revisa tu conexión.';
    if (error.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.';
    if (error.status === 403) return 'No tienes permiso para realizar esta acción.';
    if (error.status === 404) return 'La máquina virtual ya no está disponible. Actualiza el listado.';
  }
  return fallback;
}
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly snack = inject(MatSnackBar);
  success(message: string): void { this.snack.open(message, 'Cerrar', { duration: 4500, politeness: 'polite' }); }
  error(error: unknown, fallback: string): void {
    this.snack.open(errorMessage(error, fallback), 'Cerrar', { duration: 8000, politeness: 'assertive' });
  }
}
