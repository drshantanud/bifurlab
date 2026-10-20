export const EVIDENCE_STATUSES = [
  'VERIFIED MANUFACTURER SPECIFICATION',
  'PUBLISHED BENCH MEASUREMENT',
  'DERIVED FROM VERIFIED DATA',
  'ILLUSTRATIVE ASSUMPTION',
  'DATA UNAVAILABLE',
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const EVIDENCE_SHORT: Record<EvidenceStatus, string> = {
  'VERIFIED MANUFACTURER SPECIFICATION': 'Verified spec',
  'PUBLISHED BENCH MEASUREMENT': 'Bench data',
  'DERIVED FROM VERIFIED DATA': 'Derived',
  'ILLUSTRATIVE ASSUMPTION': 'Illustrative',
  'DATA UNAVAILABLE': 'Data unavailable',
};

/** Statuses that must cite at least one source. */
export const SOURCED_STATUSES: EvidenceStatus[] = [
  'VERIFIED MANUFACTURER SPECIFICATION',
  'PUBLISHED BENCH MEASUREMENT',
  'DERIVED FROM VERIFIED DATA',
];

/** Classification of simulator outputs (distinct from device-data evidence). */
export type OutputBasis =
  | 'Anatomical calculation (published scaling relationship)'
  | 'Geometric calculation from user inputs'
  | 'Illustrative geometric estimate'
  | 'Not calculable from available data';
