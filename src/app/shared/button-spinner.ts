import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
@Component({ selector:'app-button-spinner',standalone:true,imports:[MatProgressSpinnerModule],changeDetection:ChangeDetectionStrategy.OnPush,
  template:'<mat-spinner [diameter]="18" [strokeWidth]="2" aria-hidden="true" />',
  styles:':host { display:inline-flex; vertical-align:middle; margin-right:8px; }',
})
export class ButtonSpinner {}
