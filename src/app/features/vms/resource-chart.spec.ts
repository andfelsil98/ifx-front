import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { Chart } from 'chart.js';
import { signal } from '@angular/core';
import { ThemeService } from '../../core/theme.service';
import { ResourceChart } from './resource-chart';

describe('ResourceChart font readiness', () => {
  let ready: () => void;
  let fail: () => void;
  const dark = signal(false);
  beforeEach(() => {
    dark.set(false);
    const pending = new Promise<FontFace[]>((resolve, reject) => {
      ready = () => resolve([]); fail = () => reject(new Error('Local font unavailable'));
    });
    spyOn(document.fonts, 'load').and.returnValue(pending);
    TestBed.configureTestingModule({ imports: [ResourceChart], providers: [{ provide: ThemeService, useValue: { dark } }] });
  });
  function create() {
    const fixture = TestBed.createComponent(ResourceChart);
    fixture.componentRef.setInput('metric', 'cores'); fixture.componentRef.setInput('label', 'Cores asignados');
    fixture.componentRef.setInput('unit', 'cores'); fixture.componentRef.setInput('total', 2);
    fixture.detectChanges(); TestBed.tick();
    const canvas = fixture.nativeElement.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Expected chart canvas');
    return { fixture, canvas };
  }

  it('waits for exact font faces and renders the latest inputs and theme', fakeAsync(() => {
    const { fixture, canvas } = create();
    expect(Chart.getChart(canvas)).toBeUndefined();
    expect(document.fonts.load).toHaveBeenCalledWith('400 12px "JetBrains Mono Variable"');
    expect(document.fonts.load).toHaveBeenCalledWith('400 12px "Sora Variable"');
    expect(document.fonts.load).toHaveBeenCalledWith('600 12px "Sora Variable"');
    fixture.componentRef.setInput('total', 9); dark.set(true); fixture.detectChanges();
    ready(); flushMicrotasks();
    const chart = Chart.getChart(canvas);
    expect(chart?.data.datasets[0]?.data).toEqual([9]);
    expect(chart?.data.datasets[0]?.backgroundColor).toBe('#60a5fa');
    expect(chart?.options.scales?.['y']?.ticks?.font).toEqual(jasmine.objectContaining({ family: 'JetBrains Mono Variable', size: 12, weight: 400 }));
    fixture.componentRef.setInput('total', 12); fixture.detectChanges(); TestBed.tick();
    expect(Chart.getChart(canvas)?.data.datasets[0]?.data).toEqual([12]);
    fixture.destroy(); expect(Chart.getChart(canvas)).toBeUndefined();
  }));

  it('does not create a chart when font loading finishes after unmount', fakeAsync(() => {
    const { fixture, canvas } = create(); fixture.destroy(); ready(); flushMicrotasks();
    expect(Chart.getChart(canvas)).toBeUndefined();
  }));

  it('uses a stable explicit fallback if local font loading fails', fakeAsync(() => {
    const { fixture, canvas } = create(); fail(); flushMicrotasks();
    expect(Chart.getChart(canvas)?.options.scales?.['y']?.ticks?.font).toEqual(jasmine.objectContaining({ family: 'monospace' }));
    expect(Chart.getChart(canvas)?.data.datasets[0]?.data).toEqual([2]); fixture.destroy();
  }));
});
