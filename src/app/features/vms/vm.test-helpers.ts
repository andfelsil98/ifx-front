import type { Vm, VmSummary } from './vm.model';
export function summaryFor(vms: readonly Vm[], revision = 1): VmSummary {
  const counts = { RUNNING: 0, STOPPED: 0, SUSPENDED: 0 };
  const resources = { cores: 0, ram: 0, disk: 0 };
  for (const vm of vms) {
    ++counts[vm.status];
    if (vm.status === 'RUNNING') { resources.cores += vm.cores; resources.ram += vm.ram; resources.disk += vm.disk; }
  }
  return { revision, total: vms.length, counts, resources };
}
let readSequence = 0;
export function pageResponse(vms: readonly Vm[], summary = summaryFor(vms), nextCursor: string | null = null, readVersion = `001728000000:${String(++readSequence).padStart(9, '0')}`) {
  return { vms, readVersion, page: { size: 10, nextCursor }, summary };
}
