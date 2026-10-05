import { DestroyRef, inject, InjectionToken } from '@angular/core';

export type SessionAction = 'login' | 'logout';
export interface SessionEvents {
  publish(action: SessionAction): void;
  subscribe(listener: () => void): () => void;
}

// Events announce cookie changes; they never carry identity or credentials.
export const SESSION_EVENTS = new InjectionToken<SessionEvents | null>('SESSION_EVENTS', {
  providedIn: 'root', factory: () => null,
});

export function validSessionEvent(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 3 && 'version' in value && value.version === 1
    && 'action' in value && (value.action === 'login' || value.action === 'logout')
    && 'nonce' in value && typeof value.nonce === 'string'
    && /^[a-zA-Z0-9-]{1,80}$/.test(value.nonce);
}

export function browserSessionEvents(): SessionEvents {
  const destroyRef = inject(DestroyRef);
  const key = 'ifx-session-event';
  const listeners = new Set<() => void>();
  const received = new Set<string>();
  let channel: BroadcastChannel | undefined;
  try { channel = new BroadcastChannel(key); } catch { /* Storage fallback below. */ }
  const receive = (value: unknown) => {
    if (!validSessionEvent(value) || typeof value !== 'object' || value === null
      || !('nonce' in value) || typeof value.nonce !== 'string' || received.has(value.nonce)) return;
    received.add(value.nonce);
    if (received.size > 32) { const oldest = received.values().next().value; if (oldest) received.delete(oldest); }
    listeners.forEach(listener => listener());
  };
  const message = (event: MessageEvent<unknown>) => receive(event.data);
  const storage = (event: StorageEvent) => {
    if (event.key !== key || !event.newValue || event.newValue.length > 256) return;
    try { receive(JSON.parse(event.newValue)); } catch { /* Ignore malformed external metadata. */ }
  };
  channel?.addEventListener('message', message);
  window.addEventListener('storage', storage);
  destroyRef.onDestroy(() => {
    channel?.removeEventListener('message', message); channel?.close();
    window.removeEventListener('storage', storage); listeners.clear();
  });
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    publish(action) {
      const event = { version: 1, action, nonce: crypto.randomUUID() };
      try { channel?.postMessage(event); } catch { /* Storage also delivers metadata. */ }
      try {
        localStorage.setItem(key, JSON.stringify(event));
        localStorage.removeItem(key);
      } catch { /* Restricted storage: authentication itself remains available. */ }
    },
  };
}
