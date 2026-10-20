import { EVIDENCE_STATUSES, SOURCED_STATUSES, type EvidenceStatus } from './evidence';

export interface Source {
  id: string;
  title: string;
  publisher: string;
  url: string;
  sourceType: 'manufacturer-document' | 'manufacturer-web-page' | 'manufacturer-press-release' | 'peer-reviewed-publication' | 'secondary-report';
  revision: string | null;
  accessed: string;
  notes?: string;
}

/** A numeric value with its evidence, optionally restricted to a range of nominal stent diameters. */
export interface EvidenceNumber {
  status: EvidenceStatus;
  value: number | null;
  unit: string;
  appliesToDiameters?: [number, number] | null;
  sourceIds: string[];
  conditions?: string | null;
  uncertainty?: string | null;
  notes?: string | null;
}

export interface EvidenceText {
  status: EvidenceStatus;
  value: string | null;
  sourceIds: string[];
  notes?: string | null;
}

export interface SizeList {
  status: EvidenceStatus;
  /** Discrete list of available sizes, mm, when documented */
  values: number[] | null;
  /** Documented range when only a range is stated */
  range: [number, number] | null;
  sourceIds: string[];
  notes?: string | null;
}

export interface LengthRestriction {
  diameters: number[];
  minLength?: number;
  maxLength?: number;
  sourceIds: string[];
}

export interface BenchResult {
  status: EvidenceStatus;
  description: string;
  value: number | null;
  unit: string | null;
  testMethod: string | null;
  conditions: string | null;
  sourceIds: string[];
}

export interface DeviceRecord {
  id: string;
  recordVersion: string;
  lastReviewed: string;
  manufacturer: string;
  family: string;
  model: string;
  generation: string;
  isGeneric?: boolean;
  diameters: SizeList;
  lengths: SizeList;
  lengthRestrictions: LengthRestriction[];
  strutThickness: EvidenceNumber[];
  strutCrossSection: EvidenceText;
  ringPattern: EvidenceText;
  connectorArrangement: EvidenceText;
  /** Connectors between adjacent rings used by the illustrative mesh when documented */
  connectorsPerRing: EvidenceNumber;
  cellGeometry: EvidenceText;
  material: EvidenceText;
  materialProperties: EvidenceText;
  nominalPressure: EvidenceNumber[];
  ratedBurstPressure: EvidenceNumber[];
  maxExpansionDiameter: EvidenceNumber[];
  /** Optional: minimal expansion diameter from compliance charts, with the pressure in `conditions` */
  minimalExpansion?: EvidenceNumber[];
  radialStrength: EvidenceNumber;
  longitudinalStrength: EvidenceNumber;
  recoil: EvidenceNumber;
  foreshortening: EvidenceNumber;
  sideBranchCellOpening: EvidenceNumber;
  benchTests: BenchResult[];
  limitations: string[];
}

export interface Registry {
  registryVersion: string;
  schemaVersion: string;
  sources: Source[];
  devices: DeviceRecord[];
}

const isStatus = (s: unknown): s is EvidenceStatus => typeof s === 'string' && (EVIDENCE_STATUSES as readonly string[]).includes(s);

function checkSources(path: string, status: EvidenceStatus, ids: unknown, known: Set<string>, errors: string[]) {
  if (!Array.isArray(ids)) {
    errors.push(`${path}.sourceIds must be an array`);
    return;
  }
  for (const id of ids) if (!known.has(id)) errors.push(`${path} cites unknown source "${id}"`);
  if (SOURCED_STATUSES.includes(status) && ids.length === 0) errors.push(`${path} has status "${status}" but cites no source`);
}

function checkNumber(path: string, v: any, known: Set<string>, errors: string[]) {
  if (!v || typeof v !== 'object') return errors.push(`${path} is missing`);
  if (!isStatus(v.status)) return errors.push(`${path}.status is not a recognised evidence label`);
  if (v.status === 'DATA UNAVAILABLE') {
    if (v.value !== null) errors.push(`${path} is DATA UNAVAILABLE but has a value; use null`);
  } else if (typeof v.value !== 'number' || !Number.isFinite(v.value) || v.value <= 0) {
    errors.push(`${path}.value must be a positive finite number`);
  }
  if (typeof v.unit !== 'string') errors.push(`${path}.unit must be a string`);
  if (v.appliesToDiameters != null) {
    const r = v.appliesToDiameters;
    if (!Array.isArray(r) || r.length !== 2 || !(r[0] > 0) || !(r[1] >= r[0])) errors.push(`${path}.appliesToDiameters must be [min, max] with 0 < min ≤ max`);
  }
  checkSources(path, v.status, v.sourceIds, known, errors);
}

function checkText(path: string, v: any, known: Set<string>, errors: string[]) {
  if (!v || typeof v !== 'object') return errors.push(`${path} is missing`);
  if (!isStatus(v.status)) return errors.push(`${path}.status is not a recognised evidence label`);
  if (v.status === 'DATA UNAVAILABLE' && v.value !== null) errors.push(`${path} is DATA UNAVAILABLE but has a value; use null`);
  if (v.status !== 'DATA UNAVAILABLE' && (typeof v.value !== 'string' || !v.value)) errors.push(`${path}.value must be a non-empty string`);
  checkSources(path, v.status, v.sourceIds, known, errors);
}

function checkSizes(path: string, v: any, known: Set<string>, errors: string[]) {
  if (!v || typeof v !== 'object') return errors.push(`${path} is missing`);
  if (!isStatus(v.status)) return errors.push(`${path}.status is not a recognised evidence label`);
  if (v.values != null && (!Array.isArray(v.values) || v.values.some((x: unknown) => typeof x !== 'number' || !(x > 0)))) errors.push(`${path}.values must be positive numbers`);
  if (v.range != null && (!Array.isArray(v.range) || v.range.length !== 2 || !(v.range[0] > 0) || !(v.range[1] >= v.range[0]))) errors.push(`${path}.range must be [min, max]`);
  if (v.status === 'DATA UNAVAILABLE' && (v.values != null || v.range != null)) errors.push(`${path} is DATA UNAVAILABLE but lists sizes`);
  if (v.status !== 'DATA UNAVAILABLE' && v.values == null && v.range == null) errors.push(`${path} needs values or range`);
  checkSources(path, v.status, v.sourceIds, known, errors);
}

const NUMBER_ARRAYS = ['strutThickness', 'nominalPressure', 'ratedBurstPressure', 'maxExpansionDiameter'] as const;
const NUMBERS = ['connectorsPerRing', 'radialStrength', 'longitudinalStrength', 'recoil', 'foreshortening', 'sideBranchCellOpening'] as const;
const TEXTS = ['strutCrossSection', 'ringPattern', 'connectorArrangement', 'cellGeometry', 'material', 'materialProperties'] as const;
const STRINGS = ['id', 'recordVersion', 'lastReviewed', 'manufacturer', 'family', 'model', 'generation'] as const;

/** Validate one device record. Returns a list of human-readable errors (empty = valid). */
export function validateDeviceRecord(rec: any, knownSourceIds: Set<string>): string[] {
  const errors: string[] = [];
  if (!rec || typeof rec !== 'object') return ['record must be an object'];
  const p = rec.id ? `device "${rec.id}"` : 'device';
  for (const k of STRINGS) if (typeof rec[k] !== 'string' || !rec[k]) errors.push(`${p}.${k} must be a non-empty string`);
  checkSizes(`${p}.diameters`, rec.diameters, knownSourceIds, errors);
  checkSizes(`${p}.lengths`, rec.lengths, knownSourceIds, errors);
  if (!Array.isArray(rec.lengthRestrictions)) errors.push(`${p}.lengthRestrictions must be an array`);
  else rec.lengthRestrictions.forEach((r: any, i: number) => checkSources(`${p}.lengthRestrictions[${i}]`, 'VERIFIED MANUFACTURER SPECIFICATION', r?.sourceIds, knownSourceIds, errors));
  for (const k of NUMBER_ARRAYS) {
    if (!Array.isArray(rec[k]) || rec[k].length === 0) errors.push(`${p}.${k} must be a non-empty array (use one DATA UNAVAILABLE entry when unknown)`);
    else rec[k].forEach((v: any, i: number) => checkNumber(`${p}.${k}[${i}]`, v, knownSourceIds, errors));
  }
  if (rec.minimalExpansion !== undefined) {
    if (!Array.isArray(rec.minimalExpansion)) errors.push(`${p}.minimalExpansion must be an array`);
    else rec.minimalExpansion.forEach((v: any, i: number) => checkNumber(`${p}.minimalExpansion[${i}]`, v, knownSourceIds, errors));
  }
  for (const k of NUMBERS) checkNumber(`${p}.${k}`, rec[k], knownSourceIds, errors);
  for (const k of TEXTS) checkText(`${p}.${k}`, rec[k], knownSourceIds, errors);
  if (!Array.isArray(rec.benchTests)) errors.push(`${p}.benchTests must be an array`);
  else
    rec.benchTests.forEach((b: any, i: number) => {
      if (!isStatus(b?.status)) errors.push(`${p}.benchTests[${i}].status invalid`);
      else checkSources(`${p}.benchTests[${i}]`, b.status, b.sourceIds, knownSourceIds, errors);
    });
  if (!Array.isArray(rec.limitations)) errors.push(`${p}.limitations must be an array`);
  return errors;
}

export function validateSource(s: any): string[] {
  const e: string[] = [];
  for (const k of ['id', 'title', 'publisher', 'url', 'sourceType', 'accessed']) if (typeof s?.[k] !== 'string' || !s[k]) e.push(`source.${k} must be a non-empty string`);
  if (typeof s?.url === 'string' && !/^https?:\/\//.test(s.url)) e.push(`source "${s.id}" url must start with http(s)://`);
  return e;
}

export function validateRegistry(reg: any): string[] {
  const errors: string[] = [];
  if (!reg || !Array.isArray(reg.sources) || !Array.isArray(reg.devices)) return ['registry must have sources[] and devices[]'];
  const ids = new Set<string>();
  for (const s of reg.sources) {
    errors.push(...validateSource(s));
    if (ids.has(s.id)) errors.push(`duplicate source id ${s.id}`);
    ids.add(s.id);
  }
  const devIds = new Set<string>();
  for (const d of reg.devices) {
    errors.push(...validateDeviceRecord(d, ids));
    if (devIds.has(d.id)) errors.push(`duplicate device id ${d.id}`);
    devIds.add(d.id);
  }
  return errors;
}
