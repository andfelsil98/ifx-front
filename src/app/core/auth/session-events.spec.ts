import { TestBed } from '@angular/core/testing';
import { browserSessionEvents, SESSION_EVENTS, validSessionEvent } from './session-events';

describe('Browser session metadata events', () => {
  it('accepts only bounded change metadata, never session or token payloads', () => {
    expect(validSessionEvent({ version: 1, action: 'login', nonce: 'a-1' })).toBeTrue();
    for (const value of [null, [], { version: 2, action: 'login', nonce: 'a' },
      { version: 1, action: 'refresh', nonce: 'a' }, { version: 1, action: 'logout', nonce: 'x'.repeat(81) },
      { version: 1, action: 'login', nonce: 'a', user: { email: 'private' } },
      { version: 1, action: 'logout', nonce: 'a', token: 'private' }]) {
      expect(validSessionEvent(value)).toBeFalse();
    }
  });

  it('falls back to storage metadata, ignores duplicates and cleans up listeners', () => {
    spyOn(window, 'BroadcastChannel').and.throwError('Unavailable');
    const store = spyOn(Storage.prototype, 'setItem');
    const remove = spyOn(Storage.prototype, 'removeItem');
    TestBed.configureTestingModule({ providers: [{ provide: SESSION_EVENTS, useFactory: browserSessionEvents }] });
    const events = TestBed.inject(SESSION_EVENTS);
    const listener = jasmine.createSpy('session change');
    const unsubscribe = events?.subscribe(listener);
    events?.publish('login');
    const [key, body] = store.calls.mostRecent().args;
    const value: unknown = JSON.parse(body);
    expect(key).toBe('ifx-session-event');
    expect(validSessionEvent(value)).toBeTrue();
    if (typeof value === 'object' && value !== null) expect(Object.keys(value).sort()).toEqual(['action', 'nonce', 'version']);
    else fail('Missing event metadata');
    expect(remove).toHaveBeenCalledWith(key);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: body }));
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: body }));
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: '{invalid' }));
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify({ version: 1, action: 'login', nonce: 'bad', password: 'private' }) }));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe?.();
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify({ version: 1, action: 'logout', nonce: 'new' }) }));
    expect(listener).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify({ version: 1, action: 'logout', nonce: 'destroyed' }) }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
