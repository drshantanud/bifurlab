import { EXAMPLE_ANATOMY, ANATOMY_FIELDS, validateAnatomy, validateField, anatomyNotes } from '../engine/anatomy';
import { buildBifurcation, ostiumEllipse } from '../engine/bifurcationGeometry';
import { buildVesselMeshes, validateMesh } from '../engine/vesselGeometry';

const spec = (k: string) => ANATOMY_FIELDS.find((f) => f.key === k)!;

describe('input validation', () => {
  it('accepts the example anatomy', () => expect(validateAnatomy(EXAMPLE_ANATOMY).valid).toBe(true));
  it('rejects zero, negative and non-finite diameters', () => {
    for (const v of [0, -1, NaN, Infinity, '', 'abc']) expect(validateField(spec('dPMV'), v)).not.toBeNull();
  });
  it('allows zero lesion length but rejects negatives', () => {
    expect(validateField(spec('lesionSB'), 0)).toBeNull();
    expect(validateField(spec('lesionSB'), -2)).not.toBeNull();
  });
  it('rejects a zero angle', () => expect(validateField(spec('angleDeg'), 0)).toMatch(/greater than 0/));
  it('reports errors per field', () => {
    const r = validateAnatomy({ ...EXAMPLE_ANATOMY, dSB: -2, angleDeg: Infinity });
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.errors.dSB).toBeDefined();
      expect(r.errors.angleDeg).toBeDefined();
    }
  });
  it('notes implausible branch sizes without blocking', () => {
    expect(anatomyNotes({ ...EXAMPLE_ANATOMY, dDMV: 4 }).length).toBeGreaterThan(0);
    expect(anatomyNotes(EXAMPLE_ANATOMY)).toEqual([]);
  });
});

describe('bifurcation geometry', () => {
  it('places heel proximal to the carina and the carina on the DMV wall', () => {
    const m = buildBifurcation(EXAMPLE_ANATOMY);
    expect(m.xHeel).toBeLessThan(m.xCarina);
    expect(m.carinaPoint[1]).toBeCloseTo(m.rD, 9);
  });
  it('reference radii match inputs at the bifurcation level', () => {
    const a = { ...EXAMPLE_ANATOMY, taperPct: 0 };
    const m = buildBifurcation(a);
    expect(2 * m.mvRefRadius(m.sMin)).toBeCloseTo(a.dPMV, 6);
    expect(2 * m.mvRefRadius(m.sMax)).toBeCloseTo(a.dDMV, 6);
  });
  it('responds to every anatomical input', () => {
    const base = buildBifurcation(EXAMPLE_ANATOMY);
    const changed = buildBifurcation({ ...EXAMPLE_ANATOMY, angleDeg: 80 });
    expect(changed.xCarina).not.toBeCloseTo(base.xCarina, 3);
    expect(buildBifurcation({ ...EXAMPLE_ANATOMY, lesionProx: 15 }).sMin).toBeLessThan(base.sMin);
    expect(buildBifurcation({ ...EXAMPLE_ANATOMY, curvatureDeg: 40 }).mvPoint(base.sMax)[2]).toBeGreaterThan(0);
    const plaque = buildBifurcation({ ...EXAMPLE_ANATOMY, plaqueBurdenPct: 70 });
    const s = (plaque.lesions.prox[0] + plaque.lesions.prox[1]) / 2;
    expect(plaque.mvLumenRadius(s, Math.PI)).toBeLessThan(base.mvLumenRadius(s, Math.PI));
  });
  it('plaque leaves the lumen area consistent with the burden (concentric case)', () => {
    const m = buildBifurcation({ ...EXAMPLE_ANATOMY, eccentricity: 0, plaqueBurdenPct: 50, lesionProx: 10 });
    const s = (m.lesions.prox[0] + m.lesions.prox[1]) / 2;
    const r = m.mvLumenRadius(s, 0.3);
    expect((r * r) / m.mvRefRadius(s) ** 2).toBeCloseTo(0.5, 3);
  });
  it('computes the elliptical ostium area', () => {
    const o = ostiumEllipse(2.5, 90);
    expect(o.area).toBeCloseTo((Math.PI / 4) * 2.5 * 2.5, 9);
    expect(ostiumEllipse(2.5, 30).major).toBeCloseTo(5, 9);
  });
});

describe('vessel meshes', () => {
  const cases = [
    EXAMPLE_ANATOMY,
    { ...EXAMPLE_ANATOMY, angleDeg: 15 },
    { ...EXAMPLE_ANATOMY, angleDeg: 150, carinaRounding: 1.5 },
    { ...EXAMPLE_ANATOMY, dSB: 1, dPMV: 7, dDMV: 6.5, taperPct: 40, curvatureDeg: 90 },
    { ...EXAMPLE_ANATOMY, lesionProx: 0, lesionDist: 0, lesionSB: 0, plaqueBurdenPct: 90, eccentricity: 1 },
  ];
  it.each(cases.map((c, i) => [i, c] as const))('case %i produces valid meshes', (_, a) => {
    const m = buildBifurcation(a);
    const meshes = buildVesselMeshes(m, true, 0.5);
    for (const mesh of Object.values(meshes)) expect(validateMesh(mesh)).toEqual([]);
  });
  it('trims the MV lumen at the ostium (fewer triangles than an untrimmed tube)', () => {
    const m = buildBifurcation(EXAMPLE_ANATOMY);
    const meshes = buildVesselMeshes(m, false, 0.5);
    const nr = 36;
    const na = Math.max(40, Math.round(((m.sMax - m.sMin) / 0.2) * 0.5));
    expect(meshes.mvLumen.indices.length / 3).toBeLessThan(na * nr * 2);
  });
});
