import { InjectionToken } from '@angular/core';

// Configuración pública; puede reemplazarse mediante un provider de despliegue.
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => 'http://localhost:3000',
});
