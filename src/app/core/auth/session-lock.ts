import { InjectionToken } from '@angular/core';

export interface SessionLock {
  run<T>(work: () => Promise<T>): Promise<T>;
}

// Tests keep synchronous HTTP scheduling unless they explicitly test coordination.
export const SESSION_LOCK = new InjectionToken<SessionLock | null>('SESSION_LOCK', {
  providedIn: 'root', factory: () => null,
});

export function browserSessionLock(): SessionLock | null {
  if (typeof navigator === 'undefined' || !navigator.locks) return null;
  return { run: async <T>(work: () => Promise<T>): Promise<T> => await navigator.locks.request('ifx-auth-session', work) };
}
