export type DiameterSource = 'manual' | 'angiography' | 'ivus-oct';

export interface Anatomy {
  dPMV: number;
  dDMV: number;
  dSB: number;
  lesionProx: number;
  lesionDist: number;
  lesionSB: number;
  angleDeg: number;
  /** Radius of the rounded carina tip, mm (0 = sharp) */
  carinaRounding: number;
  /** Linear taper per segment, % of the reference diameter across the segment */
  taperPct: number;
  /** Side-branch ostial flare, % increase of SB radius at the ostium */
  sbFlarePct: number;
  /** Out-of-plane main-vessel curvature, total bend in degrees */
  curvatureDeg: number;
  diameterSource: DiameterSource;
  plaqueEnabled: boolean;
  /** Plaque burden, % of reference cross-sectional area */
  plaqueBurdenPct: number;
  /** 0 = concentric, 1 = maximally eccentric */
  eccentricity: number;
}

/** Example values for a typical educational case. They are not patient data. */
export const EXAMPLE_ANATOMY: Anatomy = {
  dPMV: 3.5,
  dDMV: 3.0,
  dSB: 2.5,
  lesionProx: 6,
  lesionDist: 8,
  lesionSB: 4,
  angleDeg: 50,
  carinaRounding: 0.3,
  taperPct: 5,
  sbFlarePct: 10,
  curvatureDeg: 0,
  diameterSource: 'manual',
  plaqueEnabled: true,
  plaqueBurdenPct: 45,
  eccentricity: 0.4,
};

export interface FieldSpec {
  key: keyof Anatomy;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  allowZero: boolean;
  help: string;
}

export const ANATOMY_FIELDS: FieldSpec[] = [
  { key: 'dPMV', label: 'Proximal main vessel reference diameter', unit: 'mm', min: 1, max: 7, step: 0.05, allowZero: false, help: 'Reference diameter of the proximal main vessel.' },
  { key: 'dDMV', label: 'Distal main vessel reference diameter', unit: 'mm', min: 1, max: 7, step: 0.05, allowZero: false, help: 'Reference diameter of the distal main vessel.' },
  { key: 'dSB', label: 'Side-branch reference diameter', unit: 'mm', min: 1, max: 6, step: 0.05, allowZero: false, help: 'Reference diameter of the side branch.' },
  { key: 'lesionProx', label: 'Proximal lesion length', unit: 'mm', min: 0, max: 60, step: 0.5, allowZero: true, help: '0 means no disease in this segment.' },
  { key: 'lesionDist', label: 'Distal main-vessel lesion length', unit: 'mm', min: 0, max: 60, step: 0.5, allowZero: true, help: '0 means no disease in this segment.' },
  { key: 'lesionSB', label: 'Side-branch lesion length', unit: 'mm', min: 0, max: 40, step: 0.5, allowZero: true, help: '0 means no disease in this segment.' },
  { key: 'angleDeg', label: 'Main vessel to side-branch angle', unit: '°', min: 15, max: 150, step: 1, allowZero: false, help: 'Angle between the distal main vessel and side-branch axes.' },
  { key: 'carinaRounding', label: 'Carina tip rounding radius', unit: 'mm', min: 0, max: 1.5, step: 0.05, allowZero: true, help: '0 gives a sharp carina; larger values blunt the flow divider.' },
  { key: 'taperPct', label: 'Main-vessel taper', unit: '%', min: 0, max: 40, step: 1, allowZero: true, help: 'Linear change in diameter along each segment, around the reference value at the bifurcation.' },
  { key: 'sbFlarePct', label: 'Side-branch ostial flare', unit: '%', min: 0, max: 50, step: 1, allowZero: true, help: 'Increase of the side-branch radius at its take-off, fading over one SB diameter.' },
  { key: 'curvatureDeg', label: 'Main-vessel curvature (out of plane)', unit: '°', min: 0, max: 90, step: 1, allowZero: true, help: 'Total bend of the main vessel along its modelled length.' },
  { key: 'plaqueBurdenPct', label: 'Plaque burden', unit: '%', min: 0, max: 90, step: 1, allowZero: true, help: 'Percentage of the reference cross-sectional area occupied by plaque in lesion segments.' },
  { key: 'eccentricity', label: 'Plaque eccentricity', unit: '0–1', min: 0, max: 1, step: 0.05, allowZero: true, help: '0 = concentric. Plaque sits opposite the flow divider.' },
];

export type ValidationResult = { valid: true } | { valid: false; errors: Partial<Record<keyof Anatomy, string>> };

export function validateField(spec: FieldSpec, raw: unknown): string | null {
  if (raw === '' || raw === null || raw === undefined) return `${spec.label} is required.`;
  const v = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${spec.label} must be a number.`;
  if (v < 0) return `${spec.label} cannot be negative.`;
  if (v === 0 && !spec.allowZero) return `${spec.label} must be greater than 0 ${spec.unit}.`;
  if (v < spec.min) return `${spec.label} must be at least ${spec.min} ${spec.unit} in this simulator.`;
  if (v > spec.max) return `${spec.label} must be at most ${spec.max} ${spec.unit} in this simulator.`;
  return null;
}

export function validateAnatomy(a: Anatomy): ValidationResult {
  const errors: Partial<Record<keyof Anatomy, string>> = {};
  for (const f of ANATOMY_FIELDS) {
    const e = validateField(f, a[f.key]);
    if (e) errors[f.key] = e;
  }
  if (!['manual', 'angiography', 'ivus-oct'].includes(a.diameterSource)) errors.diameterSource = 'Unknown diameter source.';
  return Object.keys(errors).length ? { valid: false, errors } : { valid: true };
}

/** Non-blocking anatomical consistency notes. */
export function anatomyNotes(a: Anatomy): string[] {
  const notes: string[] = [];
  if (a.dDMV > a.dPMV) notes.push('Distal main vessel is larger than the proximal main vessel. Check the measurements.');
  if (a.dSB > a.dPMV) notes.push('Side branch is larger than the proximal main vessel. Check the measurements.');
  if (a.dSB > a.dDMV) notes.push('Side branch is larger than the distal main vessel; branch labelling may be reversed.');
  return notes;
}
