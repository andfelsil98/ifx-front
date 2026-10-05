import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { App } from './app';
import { appConfig } from './app.config';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './core/auth/auth.service';
import { SESSION_EVENTS } from './core/auth/session-events';
import { SESSION_LOCK } from './core/auth/session-lock';

@Component({
  standalone: true,
  imports: [MatButtonModule],
  template: '<button mat-flat-button>Prueba de Material</button>',
})
class MaterialThemeProbe {}

// Smoke de composición y tema Material.
describe('Application composition', () => {
  const remoteListeners = new Set<() => void>();
  beforeEach(async () => {
    document.documentElement.classList.remove('dark-theme');
    remoteListeners.clear();
    await TestBed.configureTestingModule({
      imports: [App, MaterialThemeProbe],
      providers: [appConfig.providers, provideHttpClientTesting(), { provide: SESSION_LOCK, useValue: null }, { provide: SESSION_EVENTS, useValue: {
        publish: () => undefined,
        subscribe: (listener: () => void) => { remoteListeners.add(listener); return () => remoteListeners.delete(listener); },
      } }],
    }).compileComponents();
  });

  it('creates the standalone root with a main landmark and router outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance).toBeTruthy();
    expect(element.querySelector('main router-outlet')).not.toBeNull();
    expect(element.querySelector('h1')).toBeNull();
  });

  it('applies the configured Material theme to an actual Material component', () => {
    const fixture = TestBed.createComponent(MaterialThemeProbe);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const button = element.querySelector('button');
    expect(button).not.toBeNull();
    document.body.getAnimations().forEach(animation => animation.finish());
    const rootStyles = getComputedStyle(document.documentElement);
    expect(rootStyles.getPropertyValue('--mat-sys-primary').trim()).not.toBe('');
    expect(rootStyles.getPropertyValue('--mat-sys-surface').trim()).not.toBe('');
    if (button) {
      const buttonStyles = getComputedStyle(button);
      expect(buttonStyles.fontFamily).toContain('Sora Variable');
      expect(buttonStyles.backgroundColor).toBe('rgb(37, 99, 235)');
      expect(buttonStyles.color).toBe('rgb(255, 255, 255)');
      expect(buttonStyles.borderRadius).toBe('8px');
      expect(buttonStyles.fontWeight).toBe('500');
      expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(248, 250, 252)');
    }
  });

  it('provides the protected feature routes through the application config', () => {
    expect(TestBed.inject(Router).config.map(route => route.path)).toEqual(['login', '', '**']);
    expect(TestBed.inject(Router).config[1]?.children?.map(route => route.path)).toEqual(['dashboard', 'vms', '']);
  });

  it('leaves the old shell before cookie reconciliation and routes the new account to Dashboard', fakeAsync(() => {
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(App); fixture.detectChanges();
    const auth = TestBed.inject(AuthService);
    remoteListeners.forEach(listener => listener()); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-full-screen-loading')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('main')?.hasAttribute('inert')).toBeTrue();
    expect(navigate).toHaveBeenCalledWith('/login'); flushMicrotasks();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('http://localhost:3000/refresh').flush({ user: { id: 'client', name: 'Client', email: 'client@example.com' }, role: 'CLIENTE' });
    flushMicrotasks(); fixture.detectChanges();
    expect(navigate.calls.allArgs()).toEqual([['/login'], ['/dashboard']]);
    expect(auth.role()).toBe('CLIENTE');
    expect(fixture.nativeElement.querySelector('app-full-screen-loading')).toBeNull(); http.verify();
  }));

  it('stays on login when remote logout has removed the cookies', fakeAsync(() => {
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(App); fixture.detectChanges();
    remoteListeners.forEach(listener => listener()); fixture.detectChanges(); flushMicrotasks();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('http://localhost:3000/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    flushMicrotasks(); fixture.detectChanges();
    expect(navigate.calls.allArgs()).toEqual([['/login']]);
    expect(TestBed.inject(AuthService).authenticated()).toBeFalse();
    expect(fixture.nativeElement.querySelector('app-full-screen-loading')).toBeNull(); http.verify();
  }));

});
