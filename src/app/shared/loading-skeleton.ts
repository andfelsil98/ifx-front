import { ChangeDetectionStrategy, Component, input } from '@angular/core';
@Component({
  selector: 'app-loading-skeleton', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.width]': 'width()', '[style.height]': 'height()' },
  template: `<span></span>`,
  styles: `:host { display:block; max-width:100%; } span { display:block; width:100%; height:100%; border-radius:4px; background:var(--ifx-skeleton); animation:pulse 1.4s ease-in-out infinite alternate; }
    @keyframes pulse { to { opacity:.45; } } @media(prefers-reduced-motion:reduce) { span { animation:none; } }`,
})
export class LoadingSkeleton {
  readonly width = input('100%');
  readonly height = input('18px');
}
