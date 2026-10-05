import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { catchError, defer, finalize, map, tap, throwError } from 'rxjs';
import type { Observable, Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { API_BASE_URL } from '../../core/auth/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { EMPTY_VM_SUMMARY, normalizeVm, readSummaryResponse, readVmPageResponse, readVmResponse } from './vm.model';
import type { Vm, VmInput, VmFilter, VmSummary } from './vm.model';
import { VM_EVENTS } from './vm-events';

interface Mutation {
  readonly before: Vm | null;
  after: Vm | null;
  confirmed: boolean;
}
export function vmErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No pudimos conectar con el servidor. Intenta nuevamente.';
    if (error.status === 400) return 'Revisa los campos de la máquina virtual.';
    if (error.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.';
    if (error.status === 403) return 'No tienes permiso para realizar esta operación.';
    if (error.status === 404) return 'La máquina virtual ya no existe. Actualiza el listado.';
  }
  return 'No pudimos completar la operación. Intenta nuevamente.';
}

// Un único inventario por shell; solo escucha la vista actualmente montada.
@Injectable()
export class VmsService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly base = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);
  private readonly events = inject(VM_EVENTS);
  private readonly rows = signal<readonly Vm[]>([]);
  private readonly drafts = signal<ReadonlyMap<string, Mutation>>(new Map());
  private readonly aggregate = signal<VmSummary>(EMPTY_VM_SUMMARY);
  private readonly mode = signal<'summary' | 'page' | null>(null);
  private readonly cursor = signal<string | null>(null);
  private readonly previous = signal<readonly (string | null)[]>([]);
  private readonly selectedStatus = signal<VmFilter>('ALL');
  private readonly nextCursor = signal<string | null>(null);
  private readonly fetching = signal(false);
  private readonly failure = signal<string | null>(null);
  private readonly streamState = signal<'starting' | 'connected' | 'reconnecting' | 'offline'>('starting');
  private readonly retry = signal(0);
  private lastReadVersion: string | null = null;
  private queryVersion = 0;
  private owner = this.auth.user()?.id ?? null;
  private ownerEpoch = this.auth.epoch;
  private resync: Subscription | null = null;

  readonly summary = this.aggregate.asReadonly();
  readonly totals = computed(() => this.aggregate().resources);
  readonly status = this.selectedStatus.asReadonly();
  readonly connection = this.streamState.asReadonly();
  readonly loading = this.fetching.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly pageNumber = computed(() => this.previous().length + 1);
  readonly hasPrevious = computed(() => this.previous().length > 0);
  readonly hasNext = computed(() => this.nextCursor() !== null);
  readonly filteredTotal = computed(() => {
    const status = this.selectedStatus();
    return status === 'ALL' ? this.aggregate().total : this.aggregate().counts[status];
  });
  readonly pendingIds = computed<ReadonlySet<string>>(() => new Set([...this.drafts()]
    .filter(([, mutation]) => !mutation.confirmed).map(([id]) => id)));
  readonly vms = computed(() => {
    let rows = [...this.rows()];
    const matches = (vm: Vm) => this.selectedStatus() === 'ALL' || vm.status === this.selectedStatus();
    for (const [id, mutation] of this.drafts()) {
      const index = rows.findIndex(row => row.id === (mutation.before?.id ?? id) || row.id === mutation.after?.id);
      if (index >= 0) rows.splice(index, 1);
      if (mutation.after && matches(mutation.after)) {
        if (mutation.before && index >= 0) rows.splice(index, 0, mutation.after);
        else rows.unshift(mutation.after);
      }
    }
    return rows.slice(0, 10);
  });
  readonly changedIds = signal<ReadonlySet<string>>(new Set());
  readonly updateAnnouncement = signal('');
  private highlightTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => this.synchronizeOwner());
    effect(onCleanup => {
      const view = this.mode(); const after = this.cursor(); const status = this.selectedStatus();
      const epoch = this.auth.epoch; const user = this.auth.user(); const version = this.queryVersion; this.retry();
      if (!view || !user) return;
      this.streamState.set('starting');
      let stream: Subscription | undefined;
      let invalid = false;
      stream = this.events({ view, ...(view === 'page' && after ? { after } : {}),
        ...(view === 'page' && status !== 'ALL' ? { status } : {}) }).subscribe({
        next: event => {
          if (epoch !== this.auth.epoch || version !== this.queryVersion) return;
          try {
            if (event.type === 'summary') this.acceptSummary(readSummaryResponse(event.data));
            else if (event.type === 'page' && view === 'page') {
              this.acceptPage(readVmPageResponse(event.data), true);
            } else if (event.type === 'state' && (event.data === 'starting' || event.data === 'connected' || event.data === 'reconnecting')) {
              this.streamState.set(event.data);
            }
          } catch { invalid = true; this.streamState.set('offline'); stream?.unsubscribe(); }
        },
        error: () => { if (epoch === this.auth.epoch && version === this.queryVersion) this.streamState.set('offline'); },
      });
      if (invalid) stream.unsubscribe();
      onCleanup(() => stream?.unsubscribe());
    });
    this.destroyRef.onDestroy(() => { this.resync?.unsubscribe(); clearTimeout(this.highlightTimer); });
  }

  setView(view: 'summary' | 'page' | null): void {
    if (view !== this.mode()) { ++this.queryVersion; this.resetPageVersion(); this.mode.set(view); this.fetching.set(false); this.failure.set(null); }
  }
  retryLive(): void { this.retry.update(value => value + 1); }
  isPending(id: string): boolean { return this.pendingIds().has(id); }
  load(): Observable<void> { return this.snapshot(true); }
  changeStatus(status: VmFilter): Observable<void> {
    return defer(() => {
      this.requireNavigation();
      if (status === this.selectedStatus() && this.cursor() === null) return this.load();
      this.selectedStatus.set(status); this.cursor.set(null); this.previous.set([]);
      ++this.queryVersion; this.resetPageVersion(); return this.load();
    });
  }
  nextPage(): Observable<void> {
    return defer(() => {
      this.requireNavigation(); const next = this.nextCursor();
      if (next === null) return throwError(() => new Error('No hay página siguiente'));
      this.previous.update(previous => [...previous, this.cursor()]); this.cursor.set(next);
      ++this.queryVersion; this.resetPageVersion(); return this.load();
    });
  }
  previousPage(): Observable<void> {
    return defer(() => {
      this.requireNavigation(); const previous = [...this.previous()];
      if (!previous.length) return throwError(() => new Error('No hay página anterior'));
      this.cursor.set(previous.pop() ?? null); this.previous.set(previous);
      ++this.queryVersion; this.resetPageVersion(); return this.load();
    });
  }

  private synchronizeOwner(): void {
    const owner = this.auth.user()?.id ?? null; const epoch = this.auth.epoch;
    if (owner !== this.owner || epoch !== this.ownerEpoch) {
      this.owner = owner; this.ownerEpoch = epoch; ++this.queryVersion; this.resetPageVersion();
      this.rows.set([]); this.drafts.set(new Map()); this.aggregate.set(EMPTY_VM_SUMMARY);
      this.cursor.set(null); this.previous.set([]); this.nextCursor.set(null);
      this.failure.set(null); this.fetching.set(false); this.resync?.unsubscribe();
    }
  }
  private snapshot(showLoading: boolean): Observable<void> {
    return defer(() => {
      this.synchronizeOwner();
      const view = this.mode() ?? 'page'; const version = this.queryVersion;
      const epoch = this.auth.epoch;
      const confirmed = new Map([...this.drafts()].filter(([, mutation]) => mutation.confirmed));
      if (showLoading) { this.fetching.set(true); this.failure.set(null); }
      let params = new HttpParams();
      if (view === 'page' && this.cursor()) params = params.set('after', this.cursor() ?? '');
      const status = this.selectedStatus();
      if (view === 'page' && status !== 'ALL') params = params.set('status', status);
      return this.http.get<unknown>(`${this.base}/vms${view === 'summary' ? '/summary' : ''}`, { params }).pipe(
        tap(response => {
          if (epoch !== this.auth.epoch || version !== this.queryVersion) return;
          this.acceptSummary(readSummaryResponse(response));
          if (view === 'page') this.acceptPage(readVmPageResponse(response), false);
          this.drafts.update(drafts => {
            const next = new Map(drafts);
            for (const [id, mutation] of confirmed) if (next.get(id) === mutation) next.delete(id);
            return next;
          });
        }),
        map(() => undefined),
        catchError((error: unknown) => {
          if (epoch === this.auth.epoch && version === this.queryVersion) {
            if (showLoading) this.failure.set(vmErrorMessage(error));
            else this.streamState.set('offline');
          }
          return throwError(() => error);
        }),
        finalize(() => { if (epoch === this.auth.epoch && version === this.queryVersion && showLoading) this.fetching.set(false); }),
      );
    });
  }
  private acceptSummary(summary: VmSummary): void {
    if (summary.revision >= this.aggregate().revision) this.aggregate.set(summary);
  }
  private resetPageVersion(): void {
    this.lastReadVersion = null;
    clearTimeout(this.highlightTimer); this.changedIds.set(new Set()); this.updateAnnouncement.set('');
  }
  private acceptPage(page: ReturnType<typeof readVmPageResponse>, remote: boolean): void {
    if (this.lastReadVersion !== null && page.readVersion < this.lastReadVersion) return;
    this.lastReadVersion = page.readVersion;
    const old = new Map(this.rows().map(vm => [vm.id, vm]));
    const changed = remote ? page.vms.filter(vm => {
      const previous = old.get(vm.id);
      return previous !== undefined && JSON.stringify(previous) !== JSON.stringify(vm);
    }) : [];
    this.rows.set(page.vms); this.nextCursor.set(page.page.nextCursor);
    if (changed.length) {
      clearTimeout(this.highlightTimer); this.changedIds.set(new Set(changed.map(vm => vm.id)));
      this.updateAnnouncement.set(changed.length === 1
        ? `Máquina actualizada: ${changed[0]?.name}.` : `${changed.length} máquinas actualizadas.`);
      this.highlightTimer = setTimeout(() => {
        this.changedIds.set(new Set()); this.updateAnnouncement.set('');
      }, 3000);
    }
  }
  create(input: VmInput): Observable<Vm> {
    return defer(() => {
      this.requireAdmin(); const data = normalizeVm(input); const id = `pending-${crypto.randomUUID()}`;
      const mutation: Mutation = { before: null, after: { id, ...data }, confirmed: false };
      this.begin(id, mutation);
      return this.write(id, mutation, this.http.post<unknown>(`${this.base}/vms`, data).pipe(map(readVmResponse)));
    });
  }
  update(id: string, input: VmInput): Observable<Vm> {
    return defer(() => {
      this.requireAdmin(); const before = this.vms().find(vm => vm.id === id);
      if (!before) return throwError(() => new Error('Máquina virtual no encontrada'));
      const data = normalizeVm(input); const mutation: Mutation = { before, after: { id, ...data }, confirmed: false };
      this.begin(id, mutation);
      return this.write(id, mutation, this.http.put<unknown>(`${this.base}/vms/${encodeURIComponent(id)}`, data).pipe(map(readVmResponse)));
    });
  }
  delete(id: string): Observable<void> {
    return defer(() => {
      this.requireAdmin(); const before = this.vms().find(vm => vm.id === id);
      if (!before) return throwError(() => new Error('Máquina virtual no encontrada'));
      const mutation: Mutation = { before, after: null, confirmed: false }; this.begin(id, mutation);
      const epoch = this.auth.epoch;
      return this.http.delete<void>(`${this.base}/vms/${encodeURIComponent(id)}`).pipe(
        tap(() => { if (epoch === this.auth.epoch) { mutation.confirmed = true; this.notifyDrafts(); } }),
        takeUntilDestroyed(this.destroyRef), finalize(() => this.finish(id, mutation, epoch)),
      );
    });
  }
  private write(id: string, mutation: Mutation, request: Observable<Vm>): Observable<Vm> {
    const epoch = this.auth.epoch;
    return request.pipe(
      tap(vm => { if (epoch === this.auth.epoch) { mutation.after = vm; mutation.confirmed = true; this.notifyDrafts(); } }),
      takeUntilDestroyed(this.destroyRef), finalize(() => this.finish(id, mutation, epoch)),
    );
  }
  private requireAdmin(): void {
    if (this.auth.role() !== 'ADMINISTRADOR') throw new Error('Operación no autorizada');
  }
  private requireNavigation(): void {
    if (this.pendingIds().size || this.fetching()) throw new Error('Hay una operación pendiente');
  }
  private begin(id: string, mutation: Mutation): void {
    if (this.isPending(id)) throw new Error('La máquina virtual tiene una operación pendiente');
    this.drafts.update(drafts => new Map(drafts).set(id, mutation));
  }
  private notifyDrafts(): void { this.drafts.update(drafts => new Map(drafts)); }
  private finish(id: string, mutation: Mutation, epoch: number): void {
    if (epoch !== this.auth.epoch) return;
    if (!mutation.confirmed) this.drafts.update(drafts => { const next = new Map(drafts); if (next.get(id) === mutation) next.delete(id); return next; });
    if (!this.pendingIds().size && [...this.drafts().values()].some(draft => draft.confirmed)) {
      this.resync?.unsubscribe();
      this.resync = this.snapshot(false).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => this.streamState.set('offline') });
    }
  }
}
