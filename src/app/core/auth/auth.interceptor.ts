import { HttpErrorResponse } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const base = inject(API_BASE_URL);
  // No enviar credentials a servicios externos ni coincidencias parciales del hostname.
  if (!request.url.startsWith(`${base}/`)) return next(request);
  const auth = inject(AuthService);
  const router = inject(Router);
  const epoch = auth.epoch;
  const authenticated = request.clone({ withCredentials: true });
  return next(authenticated).pipe(catchError((error: unknown) => {
    const path = request.url.slice(base.length).split('?')[0];
    if (!(error instanceof HttpErrorResponse) || error.status !== 401
      || !(path === '/vms' || path?.startsWith('/vms/')) || epoch !== auth.epoch) {
      return throwError(() => error);
    }
    return auth.refresh().pipe(
      catchError((refreshError: unknown) => {
        if (refreshError instanceof HttpErrorResponse && refreshError.status === 401 && epoch === auth.epoch) {
          void router.navigateByUrl('/login');
        }
        return throwError(() => refreshError);
      }),
      switchMap(() => epoch === auth.epoch
      ? next(authenticated) : throwError(() => error)));
  }));
};
