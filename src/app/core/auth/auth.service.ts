import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { catchError, defer, finalize, firstValueFrom, from, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { SESSION_LOCK } from './session-lock';
import { SESSION_EVENTS } from './session-events';
import { readSession } from './auth.model';
import type { Session } from './auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly lock = inject(SESSION_LOCK);
  private readonly events = inject(SESSION_EVENTS);
  private readonly remoteGeneration = signal(0);
  private readonly session = signal<Session | null>(null);
  private readonly ready = signal(false);
  private renewal: Observable<Session> | null = null;
  private readonly generation = signal(0);
  private ending = false;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly role = computed(() => this.session()?.role ?? null);
  readonly authenticated = computed(() => this.session() !== null);
  readonly initialized = this.ready.asReadonly();
  readonly remoteChange = this.remoteGeneration.asReadonly();

  constructor() {
    const unsubscribe = this.events?.subscribe(() => {
      this.generation.update(value => value + 1);
      this.session.set(null);
      this.ready.set(false);
      this.ending = false;
      // Old rotations may finish under the lock, but cannot repopulate this epoch.
      this.renewal = null;
      this.remoteGeneration.set(this.generation());
    });
    inject(DestroyRef).onDestroy(() => unsubscribe?.());
  }

  // Identifica el usuario/sesión al iniciar una petición y evita retries tras logout.
  get epoch(): number { return this.generation(); }

  login(email: string, password: string): Observable<Session> {
    return defer(() => {
      this.generation.update((value) => value + 1);
      const epoch = this.generation();
      this.ending = false;
      const settled = this.renewal ? this.renewal.pipe(catchError(() => of(null))) : of(null);
      return settled.pipe(
        switchMap(() => this.request<unknown>('login', { email, password }, epoch)),
        map(readSession),
        switchMap(session => epoch === this.generation() ? of(session) : throwError(() => new Error('La sesión cambió en otra pestaña'))),
        tap((session) => {
          if (epoch === this.generation()) { this.session.set(session); this.ready.set(true); }
        }));
    });
  }

  refresh(): Observable<Session> {
    if (this.ending) return throwError(() => new Error('La sesión se está cerrando'));
    if (this.renewal) return this.renewal;
    const epoch = this.generation();
    const renewal = this.request<unknown>('refresh', {}, epoch).pipe(
      map(readSession),
      tap((session) => {
        if (epoch === this.generation() && !this.ending) this.session.set(session);
      }),
      catchError((error: unknown) => {
        if (epoch === this.generation() && error instanceof HttpErrorResponse && error.status === 401) {
          this.session.set(null);
        }
        return throwError(() => error);
      }),
      finalize(() => {
        if (epoch === this.generation()) this.ready.set(true);
        if (this.renewal === renewal) this.renewal = null;
      }),
      // Mantener la renovación hasta terminar: cancelar un subscriber no pierde la rotación.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.renewal = renewal;
    return renewal;
  }

  ensureSession(): Observable<boolean> {
    if (this.authenticated()) return of(true);
    if (this.ready()) return of(false);
    return this.refresh().pipe(map(() => this.authenticated()), catchError(() => of(false)));
  }

  logout(): Observable<void> {
    return defer(() => {
      const previous = this.session();
      this.generation.update((value) => value + 1);
      const epoch = this.generation();
      this.ending = true;
      this.session.set(null);
      this.ready.set(true);
      // Esperar cualquier refresh evita que sus Set-Cookie lleguen después del logout.
      const settled = this.renewal ? this.renewal.pipe(catchError(() => of(null))) : of(null);
      return settled.pipe(
        switchMap(() => this.request<void>('logout', {}, epoch)),
        catchError((error: unknown) => {
          if (epoch === this.generation()) { this.session.set(previous); this.ending = false; }
          return throwError(() => error);
        }),
      );
    });
  }

  private request<T>(path: 'login' | 'refresh' | 'logout', body: unknown, epoch: number): Observable<T> {
    return defer(() => {
      const request = this.http.post<T>(`${this.base}/${path}`, body, { withCredentials: true }).pipe(
        tap(value => {
          if (path === 'login') { readSession(value); this.events?.publish('login'); }
          if (path === 'logout') this.events?.publish('logout');
        }),
      );
      // The lock spans the response so another tab uses the newly rotated cookie.
      const currentRequest = defer(() => epoch === this.generation()
        ? request : throwError(() => new Error('La sesión cambió en otra pestaña')));
      return this.lock ? from(this.lock.run(() => firstValueFrom(currentRequest))) : currentRequest;
    });
  }

}
