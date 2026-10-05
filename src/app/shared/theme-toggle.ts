import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '../core/theme.service';
@Component({ selector:'app-theme-toggle',standalone:true,imports:[MatButtonModule,MatTooltipModule],changeDetection:ChangeDetectionStrategy.OnPush,
  template:`<button mat-icon-button (click)="theme.toggle()" [attr.aria-label]="theme.dark() ? 'Activar modo claro' : 'Activar modo oscuro'" [matTooltip]="theme.dark() ? 'Modo claro' : 'Modo oscuro'" [attr.aria-pressed]="theme.dark()">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
    @if(theme.dark()) { <circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/> }
    @else { <path d="M20.5 14.4A9 9 0 0 1 9.6 3.5a9 9 0 1 0 10.9 10.9Z"/> }
    </svg></button>`,
})
export class ThemeToggle { readonly theme=inject(ThemeService); }
