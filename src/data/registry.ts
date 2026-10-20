import registryJson from './registry.json';
import { validateRegistry, validateDeviceRecord, type DeviceRecord, type EvidenceNumber, type Registry, type Source } from './deviceSchema';
import type { EvidenceStatus } from './evidence';

export const BUILTIN_REGISTRY = registryJson as unknown as Registry;

export interface LoadedRegistry extends Registry {
  /** Records rejected by schema validation, with reasons */
  rejected: { id: string; errors: string[] }[];
  sourceMap: Map<string, Source>;
}

/** Validate every record and admit only valid ones into the simulator. */
export function loadRegistry(base: Registry, extraDevices: DeviceRecord[] = [], extraSources: Source[] = []): LoadedRegistry {
  const sources = [...base.sources, ...extraSources.filter((s) => !base.sources.some((b) => b.id === s.id))];
  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const ids = new Set(sourceMap.keys());
  const devices: DeviceRecord[] = [];
  const rejected: LoadedRegistry['rejected'] = [];
  for (const d of [...base.devices, ...extraDevices]) {
    const errors = validateDeviceRecord(d, ids);
    if (devices.some((x) => x.id === d.id)) errors.push(`duplicate device id ${d.id}`);
    if (errors.length) rejected.push({ id: d?.id ?? '(no id)', errors });
    else devices.push(d);
  }
  return { ...base, sources, devices, rejected, sourceMap };
}

export const builtinErrors = () => validateRegistry(BUILTIN_REGISTRY);

const inRange = (e: EvidenceNumber, d: number) => !e.appliesToDiameters || (d >= e.appliesToDiameters[0] - 1e-9 && d <= e.appliesToDiameters[1] + 1e-9);

/** Size-specific value lookup. Never borrows a value from a different size range. */
export function lookupSized(entries: EvidenceNumber[], diameter: number): EvidenceNumber {
  const hit = entries.find((e) => e.status !== 'DATA UNAVAILABLE' && inRange(e, diameter));
  if (hit) return hit;
  const un = entries.find((e) => e.status === 'DATA UNAVAILABLE');
  return {
    status: 'DATA UNAVAILABLE',
    value: null,
    unit: entries[0]?.unit ?? '',
    sourceIds: [],
    notes: un?.notes ?? `No documented value for a ${diameter.toFixed(2)} mm stent in this registry version.`,
  };
}

export const GENERIC_STRUT_UM = 80;

export interface StrutThicknessForMesh {
  micrometres: number;
  status: EvidenceStatus;
  usedFallback: boolean;
  evidence: EvidenceNumber;
}

/** Thickness used to draw the mesh: verified where available, otherwise the illustrative default (flagged). */
export function strutThicknessForMesh(dev: DeviceRecord, diameter: number): StrutThicknessForMesh {
  const e = lookupSized(dev.strutThickness, diameter);
  if (e.value != null) return { micrometres: e.value, status: e.status, usedFallback: false, evidence: e };
  return { micrometres: GENERIC_STRUT_UM, status: 'ILLUSTRATIVE ASSUMPTION', usedFallback: true, evidence: e };
}

export function connectorsForMesh(dev: DeviceRecord): { count: number; status: EvidenceStatus } {
  const c = dev.connectorsPerRing;
  if (c.value != null && c.value >= 1) return { count: Math.round(c.value), status: c.status };
  return { count: 3, status: 'ILLUSTRATIVE ASSUMPTION' };
}

/** Selectable diameters. When only a range (or nothing) is documented, a 0.25 mm grid is offered and flagged. */
export function diameterOptions(dev: DeviceRecord): { values: number[]; documented: boolean } {
  if (dev.diameters.values) return { values: dev.diameters.values, documented: dev.diameters.status !== 'ILLUSTRATIVE ASSUMPTION' };
  const [lo, hi] = dev.diameters.range ?? [2.0, 5.0];
  const out: number[] = [];
  for (let d = lo; d <= hi + 1e-9; d += 0.25) out.push(Math.round(d * 100) / 100);
  return { values: out, documented: false };
}

export function lengthOptions(dev: DeviceRecord, diameter: number): { values: number[]; documented: boolean } {
  let values: number[];
  let documented = dev.lengths.status !== 'ILLUSTRATIVE ASSUMPTION';
  if (dev.lengths.values) values = [...dev.lengths.values];
  else {
    documented = false;
    const [lo, hi] = dev.lengths.range ?? [8, 38];
    values = [];
    for (let l = lo; l <= hi; l += 2) values.push(l);
    if (values[values.length - 1] !== hi) values.push(hi);
  }
  for (const r of dev.lengthRestrictions) {
    if (r.diameters.some((d) => Math.abs(d - diameter) < 1e-9))
      values = values.filter((l) => (r.minLength == null || l >= r.minLength) && (r.maxLength == null || l <= r.maxLength));
  }
  return { values, documented };
}

export function deviceLabel(dev: DeviceRecord) {
  return dev.isGeneric ? dev.model : `${dev.model} (${dev.manufacturer.split(' (')[0]})`;
}
