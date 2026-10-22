import { EXAMPLE_ANATOMY } from '../engine/anatomy';
import { buildBifurcation } from '../engine/bifurcationGeometry';
import { BUILTIN_REGISTRY, loadRegistry } from '../data/registry';
import { defaultScenario, ensureCoverage, withTechnique, TECHNIQUES, type Technique } from '../engine/scenario';
import { simulate, potPositions, stentStartS } from '../engine/simulation';
import { activeStages, allStages, SEQUENCES } from '../engine/proceduralSequence';
import { computeMetrics } from '../engine/measurementEngine';
import { isFiniteVec, dot } from '../engine/math';

const reg = loadRegistry(BUILTIN_REGISTRY);
const m = buildBifurcation(EXAMPLE_ANATOMY);
const sc = (t: Technique, dev = 'abbott-xience-skypoint') => defaultScenario('a', 'A', EXAMPLE_ANATOMY, reg, t, dev);
const metric = (ms: ReturnType<typeof computeMetrics>, id: string) => ms.find((x) => x.id === id)!;

describe('procedural sequences', () => {
  it('provisional follows the specified stage order', () => {
    expect(SEQUENCES.provisional.map((s) => s.id)).toEqual(['prep', 'mv-stent', 'pot', 'rewire', 'cell-open', 'sb-dil', 'kiss', 'final-pot', 'inspect']);
  });
  it('optional stages can be removed', () => {
    const s = sc('provisional');
    const p = { ...s.proc, includeKissing: false, includeSBDilation: false };
    expect(activeStages('provisional', p).length).toBe(7);
    expect(allStages('provisional', p).filter((x) => !x.included).map((x) => x.id)).toEqual(['sb-dil', 'kiss']);
  });
  it.each(TECHNIQUES.map((t) => t.id))('%s: steps forward and backward deterministically', (t) => {
    const s = sc(t);
    const n = activeStages(t, s.proc).length;
    const fwd = [];
    for (let i = 0; i < n; i++) fwd.push(simulate(m, s, reg, i));
    const again = simulate(m, s, reg, 2);
    expect(Array.from(again.stents.flatMap((x) => Array.from(x.mesh.positions)))).toEqual(Array.from(fwd[2].stents.flatMap((x) => Array.from(x.mesh.positions))));
    expect(simulate(m, s, reg, 999).stageIndex).toBe(n - 1);
    expect(simulate(m, s, reg, -3).stageIndex).toBe(0);
    const last = fwd[n - 1];
    for (const st of last.stents) for (let i = 0; i < st.mesh.positions.length; i += 3) expect(isFiniteVec([st.mesh.positions[i], st.mesh.positions[i + 1], st.mesh.positions[i + 2]])).toBe(true);
    expect(last.stents.length).toBe(t === 'provisional' ? 1 : 2);
  });
});

describe('illustrative deformation', () => {
  it('POT enlarges the proximal segment to roughly the POT balloon diameter', () => {
    const s = sc('provisional');
    const before = metric(computeMetrics(m, s, simulate(m, s, reg, 1)), 'prox-d').value!;
    const after = metric(computeMetrics(m, s, simulate(m, s, reg, 2)), 'prox-d').value!;
    expect(before).toBeCloseTo(s.mvStent.diameter, 1);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeCloseTo(s.proc.potD, 1);
  });
  it('cell opening increases the ostial free-lumen diameter', () => {
    const s = sc('provisional');
    const jailed = metric(computeMetrics(m, s, simulate(m, s, reg, 1)), 'ostial-free').value!;
    const opened = metric(computeMetrics(m, s, simulate(m, s, reg, 5)), 'ostial-free').value!;
    expect(opened).toBeGreaterThan(jailed);
  });
  it('kissing makes the proximal segment elliptical and final POT never increases it', () => {
    const s = sc('provisional');
    const kissE = metric(computeMetrics(m, s, simulate(m, s, reg, 6)), 'prox-ell').value!;
    const potE = metric(computeMetrics(m, s, simulate(m, s, reg, 7)), 'prox-ell').value!;
    expect(kissE).toBeGreaterThan(1.05);
    expect(potE).toBeLessThanOrEqual(kissE + 1e-9);
  });
  it('culotte produces a proximal overlap', () => {
    const s = sc('culotte');
    const last = simulate(m, s, reg, 99);
    expect(metric(computeMetrics(m, s, last), 'overlap').value!).toBeGreaterThan(3);
  });
  it('stage 1 of provisional has no stent and no stent metrics', () => {
    const s = sc('provisional');
    const ms = computeMetrics(m, s, simulate(m, s, reg, 0));
    expect(metric(ms, 'prox-d').value).toBeNull();
    expect(metric(ms, 'prox-d').basis).toBe('Not calculable from available data');
  });
});

describe('stent-model switching', () => {
  it('uses verified strut thickness by size and flags fallbacks', () => {
    const a = simulate(m, sc('provisional', 'biotronik-orsiro-mission'), reg, 1);
    expect(a.stents[0].thickness.micrometres).toBe(60);
    const b = simulate(m, sc('provisional', 'biosensors-biomatrix-flex'), reg, 1);
    expect(b.stents[0].thickness.usedFallback).toBe(true);
    expect(b.warnings.some((w) => /strut thickness/.test(w.message))).toBe(true);
  });
  it('uses the documented connector count only where documented', () => {
    const t = simulate(m, sc('provisional', 'terumo-ultimaster-tansei'), reg, 1);
    const g = simulate(m, sc('provisional', 'generic-illustrative'), reg, 1);
    expect(t.stents[0].connectors.count).toBe(2);
    expect(g.stents[0].connectors.count).toBe(3);
  });
  it('warns when a balloon exceeds a documented expansion limit', () => {
    const s = sc('provisional');
    s.proc.potD = 4.5; // XIENCE Skypoint 3.0 mm limit 3.75 mm
    const r = simulate(m, s, reg, 2);
    expect(r.warnings.some((w) => w.level === 'warning' && /3.75 mm/.test(w.message) && w.sourceIds.length > 0)).toBe(true);
  });
  it('warns when deployment pressure exceeds a documented RBP', () => {
    const s = sc('provisional');
    s.proc.deployPressure = 20;
    expect(simulate(m, s, reg, 1).warnings.some((w) => /rated burst pressure of 16 atm/.test(w.message))).toBe(true);
  });
  it('reports mechanical outputs as not calculable', () => {
    const s = sc('provisional');
    const ms = computeMetrics(m, s, simulate(m, s, reg, 8));
    for (const id of ['sb-cell-area', 'recoil', 'foreshortening', 'stress']) {
      expect(metric(ms, id).value).toBeNull();
      expect(metric(ms, id).basis).toBe('Not calculable from available data');
    }
    for (const x of ms) expect(x.method.length).toBeGreaterThan(5);
  });
});

describe('lesion coverage', () => {
  const ends = (s: ReturnType<typeof sc>, mm = m) => {
    const r = simulate(mm, s, reg, 999);
    return Object.fromEntries(r.stents.map((st) => [st.key, st.path.point(st.path.length)]));
  };
  it('culotte default stents land beyond both lesion edges', () => {
    const e = ends(sc('culotte'));
    expect(dot(e.culotteFirst, m.d)).toBeGreaterThan(m.lesions.sb[1] + 1.5);
    expect(m.insideSB(e.culotteFirst, 0.5)).toBe(true);
    expect(e.culotteSecond[0]).toBeGreaterThan(m.lesions.dist[1] + 1.5);
    expect(simulate(m, sc('culotte'), reg, 999).warnings.some((w) => w.message.includes('does not reach'))).toBe(false);
  });
  it('switching to culotte re-sizes the first stent so it reaches past the side-branch lesion', () => {
    const s = withTechnique(sc('provisional'), 'culotte', EXAMPLE_ANATOMY, reg);
    expect(dot(ends(s).culotteFirst, m.d)).toBeGreaterThan(m.lesions.sb[1] + 1.5);
  });
  it('lengthening a lesion lengthens stents that no longer cover it, and an uncovered lesion is warned', () => {
    const a = { ...EXAMPLE_ANATOMY, lesionSB: 12, lesionDist: 20 };
    const m2 = buildBifurcation(a);
    const stale = sc('culotte');
    expect(simulate(m2, stale, reg, 999).warnings.filter((w) => w.message.includes('does not reach')).length).toBe(2);
    const e = ends(ensureCoverage(stale, a, reg), m2);
    expect(dot(e.culotteFirst, m2.d)).toBeGreaterThan(m2.lesions.sb[1]);
    expect(e.culotteSecond[0]).toBeGreaterThan(m2.lesions.dist[1]);
  });
});

describe('POT coverage of the proximal stent', () => {
  it.each([0, 6, 15, 30])('proximal lesion %s mm: sequential POT inflations cover from the carina back to the proximal stent edge', (lesionProx) => {
    const a = { ...EXAMPLE_ANATOMY, lesionProx };
    const mm = buildBifurcation(a);
    const s = defaultScenario('a', 'A', a, reg, 'provisional', 'abbott-xience-skypoint');
    const pos = potPositions(mm, s.proc);
    expect(pos[0][1]).toBeCloseTo(mm.xCarina + s.proc.potOffset, 6);
    const prox = Math.min(...pos.map((p) => p[0]));
    if (pos.length > 1) expect(prox).toBeCloseTo(stentStartS(mm), 6);
    else expect(prox).toBeLessThanOrEqual(stentStartS(mm));
    for (let i = 1; i < pos.length; i++) expect(pos[i][1]).toBeGreaterThanOrEqual(pos[i - 1][0]);
    for (const p of pos) expect(p[1] - p[0]).toBeCloseTo(s.proc.potLength, 6);
    const r = simulate(mm, s, reg, SEQUENCES.provisional.findIndex((x) => x.id === 'pot'));
    expect(r.activeBalloons.length).toBe(pos.length);
    expect(r.applied.filter((x) => x.label.startsWith('POT')).length).toBe(pos.length);
  });
  it('a longer proximal lesion needs more POT inflations', () => {
    const n = (lesionProx: number) => {
      const a = { ...EXAMPLE_ANATOMY, lesionProx };
      return potPositions(buildBifurcation(a), defaultScenario('a', 'A', a, reg, 'culotte', 'abbott-xience-skypoint').proc).length;
    };
    expect(n(30)).toBeGreaterThan(n(6));
    expect(n(30)).toBeGreaterThanOrEqual(3);
  });
});
