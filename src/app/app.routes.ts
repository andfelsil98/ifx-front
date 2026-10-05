import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login').then(m => m.Login) },
  {
    path: '', canActivate: [authGuard],
    loadComponent: () => import('./features/vms/dashboard-shell').then(m => m.DashboardShell),
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/vms/dashboard').then(m => m.Dashboard) },
      { path: 'vms', loadComponent: () => import('./features/vms/vms-page').then(m => m.VmsPage) },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
