import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, effect, inject, input, viewChild, DestroyRef } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { ThemeService } from '../../core/theme.service';
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

@Component({
  selector: 'app-resource-chart', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="chart-wrap"><canvas #canvas role="img" [attr.aria-label]="label() + ': ' + total() + ' ' + unit() + ', asignados a máquinas en ejecución'"></canvas></div>`,
  styles: `:host { display:block; } .chart-wrap { position:relative; height:140px; min-width:0; overflow:hidden; }`,
})
export class ResourceChart {
  readonly metric = input.required<'cores' | 'ram' | 'disk'>();
  readonly label = input.required<string>();
  readonly unit = input.required<string>();
  readonly total = input.required<number>();
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private chart?: Chart<'bar'>;
  private readonly document = inject(DOCUMENT);
  private fontsReady = false;
  private customFonts = true;
  private destroyed = false;
  constructor() {
    afterNextRender(() => { void this.prepareFonts(); });
    effect(() => {
      this.total(); this.metric(); this.label(); this.unit(); this.theme.dark();
      if (this.fontsReady && !this.destroyed) this.render();
    });
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; this.chart?.destroy(); });
  }
  private async prepareFonts(): Promise<void> {
    try {
      await Promise.all([
        this.document.fonts.load('400 12px "JetBrains Mono Variable"'),
        this.document.fonts.load('400 12px "Sora Variable"'),
        this.document.fonts.load('600 12px "Sora Variable"'),
      ]);
    } catch {
      // Explicit stable fallback if a local font asset cannot load.
      this.customFonts = false;
    }
    if (this.destroyed) return;
    this.fontsReady = true;
    this.render();
  }
  private render(): void {
    const dark = this.theme.dark();
    const metric = this.metric();
    const colors = { cores: dark ? '#60a5fa' : '#2563eb', ram: dark ? '#2dd4bf' : '#0f766e', disk: dark ? '#38bdf8' : '#0369a1' };
    const data = { labels: ['Asignación global'], datasets: [{ data: [this.total()], backgroundColor: colors[metric], borderRadius: 4, maxBarThickness: 28 }] };
    if (this.chart) { this.chart.destroy(); }
    this.chart = new Chart(this.canvas().nativeElement, {
      type: 'bar', data,
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { tooltip: {
          titleFont: () => ({ family: this.customFonts ? 'Sora Variable' : 'sans-serif', size: 12, weight: 600 }),
          bodyFont: () => ({ family: this.customFonts ? 'Sora Variable' : 'sans-serif', size: 12, weight: 400 }),
          footerFont: () => ({ family: this.customFonts ? 'Sora Variable' : 'sans-serif', size: 12, weight: 600 }),
          callbacks: { label: context => `${context.formattedValue} ${this.unit()}` } } },
        scales: { x: { display: false }, y: { beginAtZero: true, ticks: { color: dark ? '#cbd5e1' : '#475569', maxTicksLimit: 4, precision: metric === 'cores' ? 0 : undefined, font: { family: this.customFonts ? 'JetBrains Mono Variable' : 'monospace', size: 12, weight: 400 } }, grid: { color: dark ? '#263449' : '#e2e8f0' }, border: { display: false } } },
      },
    });
  }
}
