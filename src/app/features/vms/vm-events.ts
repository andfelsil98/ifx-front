import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';
import { Router } from '@angular/router';
import { EMPTY, Observable, Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { API_BASE_URL } from '../../core/auth/api.config';
import type { VmStatus } from './vm.model';

export interface VmEventsQuery { view: 'summary' | 'page'; after?: string; status?: VmStatus; }
export interface VmEvent { type: 'summary' | 'page' | 'state'; data: unknown; }
export interface VmEventSource {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  listen(name: string, callback: (data: string) => void): void;
  close(): void;
}
export const VM_EVENT_SOURCE = new InjectionToken<(url: string) => VmEventSource>('VM_EVENT_SOURCE', {
  providedIn: 'root', factory: () => url => {
    const native = new EventSource(url, { withCredentials: true });
    const source: VmEventSource = {
      onopen: null, onerror: null,
      listen: (name, callback) => native.addEventListener(name, (event: MessageEvent<string>) => callback(event.data)),
      close: () => native.close(),
    };
    native.onopen = () => source.onopen?.();
    native.onerror = () => source.onerror?.();
    return source;
  },
});
// Los tests de features sustituyen esta función; el provider de aplicación activa SSE.
export const VM_EVENTS = new InjectionToken<(query: VmEventsQuery) => Observable<VmEvent>>('VM_EVENTS', {
  providedIn: 'root', factory: () => () => EMPTY,
});

export function browserVmEvents(): (query: VmEventsQuery) => Observable<VmEvent> {
  const createSource = inject(VM_EVENT_SOURCE);
  const http = inject(HttpClient);
  const auth = inject(AuthService);
  const router = inject(Router);
  const base = inject(API_BASE_URL);
  return query => new Observable(subscriber => {
    const epoch = auth.epoch;
    const params = new URLSearchParams({ view: query.view });
    if (query.after) params.set('after', query.after);
    if (query.status) params.set('status', query.status);
    let source: VmEventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let recovery: Subscription | undefined;
    let attempts = 0;
    let stopped = false;
    const current = () => !stopped && auth.epoch === epoch;
    const closeSource = () => { source?.close(); source = undefined; };
    const fail = (error: unknown) => { if (current()) subscriber.error(error); };
    const recover = (expired: boolean) => {
      if (!current() || recovery || timer) return;
      closeSource();
      subscriber.next({ type: 'state', data: 'reconnecting' });
      if (++attempts > 3) { fail(new Error('La conexión en tiempo real está pausada')); return; }
      timer = setTimeout(() => {
        timer = undefined;
        if (!current()) return;
        // HTTP usa el interceptor existente; EventSource no expone el estado del handshake.
        const check = expired ? auth.refresh() : http.get<unknown>(`${base}/vms/summary`);
        const subscription = check.subscribe({
          next: () => { recovery = undefined; if (current()) connect(); },
          error: (error: unknown) => {
            recovery = undefined;
            if (!current()) return;
            if ((error instanceof HttpErrorResponse && [401, 403, 429].includes(error.status)) || !auth.authenticated()) {
              if (!auth.authenticated()) void router.navigateByUrl('/login');
              fail(error);
            } else recover(false);
          },
        });
        recovery = subscription.closed ? undefined : subscription;
      }, Math.min(1000 * 2 ** (attempts - 1), 4000));
    };
    const connect = () => {
      if (!current()) return;
      closeSource();
      try { source = createSource(`${base}/vms/events?${params}`); }
      catch (error) { fail(error); return; }
      const active = source;
      active.onopen = () => { if (current() && active === source) subscriber.next({ type: 'state', data: 'connected' }); };
      active.onerror = () => { if (active === source) recover(false); };
      for (const type of ['summary', 'page'] as const) active.listen(type, text => {
        if (!current() || active !== source) return;
        try {
          if (text.length > 64 * 1024) throw new Error('Evento demasiado grande');
          const data: unknown = JSON.parse(text);
          attempts = 0;
          subscriber.next({ type, data });
        } catch { fail(new Error('Respuesta en tiempo real inválida')); }
      });
      active.listen('session-expired', () => { if (active === source) recover(true); });
      active.listen('stream-error', () => { if (active === source) recover(false); });
    };
    subscriber.next({ type: 'state', data: 'starting' });
    connect();
    return () => { stopped = true; closeSource(); if (timer) clearTimeout(timer); recovery?.unsubscribe(); };
  });
}
