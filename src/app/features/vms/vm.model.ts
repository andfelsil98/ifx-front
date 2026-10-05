export const VM_STATUSES = ['RUNNING', 'STOPPED', 'SUSPENDED'] as const;
export type VmStatus = typeof VM_STATUSES[number];
export const STATUS_LABELS: Record<VmStatus, string> = {
  RUNNING: 'En ejecución', STOPPED: 'Detenida', SUSPENDED: 'Suspendida',
};

export interface VmInput {
  readonly name: string;
  readonly cores: number;
  readonly ram: number;
  readonly disk: number;
  readonly os: string;
  readonly status: VmStatus;
}
export interface Vm extends VmInput { readonly id: string; }

export const normalizeText = (value: string): string => value.trim().replace(/\s+/g, ' ');

export const normalizeVmLabel = (value: string): string => normalizeText(value).toLowerCase()
  .split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

export function normalizeVm(input: VmInput): VmInput {
  return {
    name: normalizeText(input.name),
    os: normalizeText(input.os),
    cores: input.cores, ram: input.ram, disk: input.disk, status: input.status,
  };
}

export function readVm(value: unknown): Vm {
  if (typeof value !== 'object' || value === null || !('id' in value)
    || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id)
    || /^__.*__$/.test(value.id) || !('name' in value) || typeof value.name !== 'string'
    || !value.name.trim() || !('os' in value) || typeof value.os !== 'string' || !value.os.trim()
    || !('cores' in value) || typeof value.cores !== 'number' || !Number.isSafeInteger(value.cores)
    || value.cores <= 0 || !('ram' in value) || typeof value.ram !== 'number'
    || !Number.isFinite(value.ram) || value.ram <= 0 || !('disk' in value)
    || typeof value.disk !== 'number' || !Number.isFinite(value.disk) || value.disk <= 0
    || !('status' in value) || (value.status !== 'RUNNING' && value.status !== 'STOPPED'
      && value.status !== 'SUSPENDED')) throw new Error('Respuesta de máquinas virtuales inválida');
  return { id: value.id, name: value.name, os: value.os, cores: value.cores,
    ram: value.ram, disk: value.disk, status: value.status };
}

export function readVmResponse(value: unknown): Vm {
  if (typeof value !== 'object' || value === null || !('vm' in value)) {
    throw new Error('Respuesta de máquina virtual inválida');
  }
  return readVm(value.vm);
}

export function readVmsResponse(value: unknown): readonly Vm[] {
  if (typeof value !== 'object' || value === null || !('vms' in value) || !Array.isArray(value.vms)) {
    throw new Error('Respuesta de máquinas virtuales inválida');
  }
  return value.vms.map(readVm);
}

export type VmFilter = VmStatus | 'ALL';
export interface VmPage {
  readonly size: 10;
  readonly nextCursor: string | null;
}
export interface VmSummary {
  readonly revision: number;
  readonly total: number;
  readonly counts: Readonly<Record<VmStatus, number>>;
  readonly resources: { readonly cores: number; readonly ram: number; readonly disk: number };
}
export const EMPTY_VM_SUMMARY: VmSummary = {
  revision: 0, total: 0, counts: { RUNNING: 0, STOPPED: 0, SUSPENDED: 0 },
  resources: { cores: 0, ram: 0, disk: 0 },
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function resource(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
export function readVmSummary(value: unknown): VmSummary {
  if (!record(value) || !count(value['revision']) || !count(value['total'])
    || !record(value['counts']) || !record(value['resources'])) throw new Error('Resumen de VMs inválido');
  const counts = value['counts']; const resources = value['resources'];
  if (!count(counts['RUNNING']) || !count(counts['STOPPED']) || !count(counts['SUSPENDED'])
    || counts['RUNNING'] + counts['STOPPED'] + counts['SUSPENDED'] !== value['total']
    || !resource(resources['cores']) || !Number.isSafeInteger(resources['cores'])
    || !resource(resources['ram']) || !resource(resources['disk'])) throw new Error('Resumen de VMs inválido');
  return { revision: value['revision'], total: value['total'],
    counts: { RUNNING: counts['RUNNING'], STOPPED: counts['STOPPED'], SUSPENDED: counts['SUSPENDED'] },
    resources: { cores: resources['cores'], ram: resources['ram'], disk: resources['disk'] } };
}
export function readSummaryResponse(value: unknown): VmSummary {
  if (!record(value)) throw new Error('Resumen de VMs inválido');
  return readVmSummary(value['summary']);
}
export function readVmPageResponse(value: unknown): { vms: readonly Vm[]; page: VmPage; readVersion: string } {
  if (!record(value) || !record(value['page']) || typeof value['readVersion'] !== 'string'
    || !/^\d{12}:\d{9}$/.test(value['readVersion'])) throw new Error('Página de VMs inválida');
  const page = value['page'];
  const cursor = page['nextCursor'];
  const vms = readVmsResponse(value);
  if (page['size'] !== 10 || vms.length > 10 || (cursor !== null && (typeof cursor !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(cursor) || /^__.*__$/.test(cursor)))) throw new Error('Página de VMs inválida');
  if (new Set(vms.map(vm => vm.id)).size !== vms.length) throw new Error('Página de VMs inválida');
  return { vms, page: { size: 10, nextCursor: cursor }, readVersion: value['readVersion'] };
}
