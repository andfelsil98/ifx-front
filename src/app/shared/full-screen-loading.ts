import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ThemeService } from '../core/theme.service';
@Component({ selector:'app-full-screen-loading',standalone:true,imports:[MatProgressSpinnerModule],changeDetection:ChangeDetectionStrategy.OnPush,
  template:`<div class="loading-screen" role="status" aria-live="polite" aria-busy="true"><img [src]="theme.dark() ? '/resources/full-logo-white.png' : '/resources/full-logo-dark.png'" alt="VMS Manager" width="240" height="80"><mat-spinner [diameter]="32" [strokeWidth]="3" aria-hidden="true"/><span class="sr-only">{{ message() }}</span></div>`,
  styles: `.loading-screen { position:fixed; inset:0; z-index:2000; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:28px; background:var(--mat-sys-surface); } img { object-fit:contain; max-width:70vw; }`,
})
export class FullScreenLoading { readonly theme=inject(ThemeService); readonly message=input('Cargando sesión…'); }
