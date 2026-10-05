import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly dark = signal(false);
  constructor() {
    let saved: string | null = null;
    try { saved = localStorage.getItem('vms-theme'); } catch { /* Storage can be unavailable. */ }
    this.apply(saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches));
  }
  toggle(): void {
    this.apply(!this.dark());
    try { localStorage.setItem('vms-theme', this.dark() ? 'dark' : 'light'); } catch { /* Preference remains in memory. */ }
  }
  private apply(dark: boolean): void {
    this.dark.set(dark);
    this.document.documentElement.classList.toggle('dark-theme', dark);
  }
}
