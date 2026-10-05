import {
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/auth/auth.interceptor';
import { browserSessionLock, SESSION_LOCK } from './core/auth/session-lock';
import { browserSessionEvents, SESSION_EVENTS } from './core/auth/session-events';

import { VM_EVENTS, browserVmEvents } from './features/vms/vm-events';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: VM_EVENTS, useFactory: browserVmEvents },
    { provide: SESSION_LOCK, useFactory: browserSessionLock },
    { provide: SESSION_EVENTS, useFactory: browserSessionEvents },
  ],
};
