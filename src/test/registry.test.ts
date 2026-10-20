import { BUILTIN_REGISTRY, loadRegistry, lookupSized, strutThicknessForMesh, lengthOptions, diameterOptions } from '../data/registry';
import { validateRegistry, validateDeviceRecord } from '../data/deviceSchema';
import { SOURCED_STATUSES } from '../data/evidence';
import schema from '../data/device-record.schema.json';

const reg = loadRegistry(BUILTIN_REGISTRY);
const dev = (id: string) => reg.devices.find((d) => d.id === id)!;

describe('device registry', () => {
  it('validates against the schema rules', () => expect(validateRegistry(BUILTIN_REGISTRY)).toEqual([]));
  it('admits every built-in record', () => expect(reg.rejected).toEqual([]));
  it('ships a JSON Schema document', () => expect((schema as any).title).toMatch(/device record/i));

  it('includes the five required families and the two additional platforms', () => {
    const fams = new Set(reg.devices.map((d) => d.family));
    for (const f of ['XIENCE', 'Resolute', 'SYNERGY', 'Orsiro', 'Supraflex', 'Ultimaster', 'BioMatrix']) expect(fams.has(f)).toBe(true);
  });

  it('every sourced value cites a source with a URL (source attribution)', () => {
    const walk = (o: any, path: string) => {
      if (!o || typeof o !== 'object') return;
      if (typeof o.status === 'string' && Array.isArray(o.sourceIds)) {
        if (SOURCED_STATUSES.includes(o.status)) expect(o.sourceIds.length, path).toBeGreaterThan(0);
        for (const id of o.sourceIds) expect(reg.sourceMap.get(id)?.url, `${path} → ${id}`).toMatch(/^https:\/\//);
      }
      for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    };
    reg.devices.forEach((d) => walk(d, d.id));
  });

  it('never stores a value for DATA UNAVAILABLE fields (missing-data handling)', () => {
    const walk = (o: any) => {
      if (!o || typeof o !== 'object') return;
      if (o.status === 'DATA UNAVAILABLE' && 'value' in o) expect(o.value).toBeNull();
      Object.values(o).forEach(walk);
    };
    reg.devices.forEach(walk);
  });

  it('has no invented mechanical bench data', () => {
    for (const d of reg.devices) {
      for (const k of ['radialStrength', 'longitudinalStrength', 'recoil', 'foreshortening'] as const) expect(d[k].status).toBe('DATA UNAVAILABLE');
      // side-branch cell opening only from the primary bench studies supplied (Öner 2021, Foin 2013)
      const sb = d.sideBranchCellOpening;
      if (sb.status !== 'DATA UNAVAILABLE') {
        expect(['PUBLISHED BENCH MEASUREMENT', 'DERIVED FROM VERIFIED DATA']).toContain(sb.status);
        expect(sb.sourceIds.every((id) => ['oner-2021-ejmr', 'foin-2013-eurointervention'].includes(id)), d.id).toBe(true);
        expect(sb.conditions, d.id).toBeTruthy();
      }
      for (const b of d.benchTests) expect(['PUBLISHED BENCH MEASUREMENT', 'DERIVED FROM VERIFIED DATA']).toContain(b.status);
    }
  });

  it('carries the 2026-10-20 article data by generation', () => {
    // Öner 2021 Table 2: 3.0 mm balloon shortfall 0.22 mm (Supraflex Cruz), 0.53 mm (Orsiro)
    expect(dev('smt-supraflex-cruz').sideBranchCellOpening.value).toBe(2.78);
    expect(dev('biotronik-orsiro').sideBranchCellOpening.value).toBe(2.47);
    expect(lookupSized(dev('smt-supraflex-cruz').maxExpansionDiameter, 3.0).value).toBe(4.25);
    expect(lookupSized(dev('smt-supraflex-cruz').maxExpansionDiameter, 3.5).value).toBeNull();
    // original Orsiro and Orsiro Mission stay separate
    expect(dev('biotronik-orsiro-mission').benchTests).toEqual([]);
    expect(dev('biotronik-orsiro-mission').sideBranchCellOpening.value).toBeNull();
    // Resolute Integrity bench data are not transferred to Resolute Onyx; Onyx keeps the manufacturer MSID despite the review's 4.75 mm
    expect(dev('medtronic-resolute-onyx').sideBranchCellOpening.value).toBeNull();
    expect(lookupSized(dev('medtronic-resolute-onyx').maxExpansionDiameter, 4.0).value).toBe(5.0);
    expect(lookupSized(dev('medtronic-resolute-integrity').maxExpansionDiameter, 3.0).value).toBe(4.75);
    // review data with no stated generation are not assigned
    expect(dev('bsc-synergy').benchTests).toEqual([]);
    expect(dev('terumo-ultimaster-tansei').benchTests).toEqual([]);
    expect(lookupSized(dev('bsc-synergy-megatron').maxExpansionDiameter, 4.0).sourceIds).toEqual(['ebc-2024-burzotta', 'mehmedbegovic-2023-rcm']);
    // BioMatrix Alpha is its own generation; its limit is an outer diameter
    expect(lookupSized(dev('biosensors-biomatrix-alpha').strutThickness, 3.0).value).toBe(84);
    expect(lookupSized(dev('biosensors-biomatrix-alpha').strutThickness, 3.5).value).toBe(88);
    expect(lookupSized(dev('biosensors-biomatrix-alpha').ratedBurstPressure, 4.0).value).toBe(14);
    expect(lookupSized(dev('biosensors-biomatrix-alpha').maxExpansionDiameter, 3.0).conditions).toMatch(/outer diameter/i);
    expect(lookupSized(dev('biosensors-biomatrix-flex').strutThickness, 3.0).value).toBeNull();
  });

  it('looks up size-specific values without borrowing across ranges', () => {
    expect(lookupSized(dev('medtronic-resolute-onyx').strutThickness, 3.0).value).toBe(81);
    expect(lookupSized(dev('medtronic-resolute-onyx').strutThickness, 4.5).value).toBe(91);
    expect(lookupSized(dev('biotronik-orsiro-mission').strutThickness, 3.0).value).toBe(60);
    expect(lookupSized(dev('biotronik-orsiro-mission').strutThickness, 3.5).value).toBe(80);
    expect(lookupSized(dev('bsc-synergy').strutThickness, 5.0).status).toBe('DATA UNAVAILABLE');
    expect(lookupSized(dev('abbott-xience-skypoint').maxExpansionDiameter, 3.0).value).toBe(3.75);
    expect(lookupSized(dev('abbott-xience-skypoint').maxExpansionDiameter, 3.5).value).toBe(5.75);
  });

  it('does not transfer data between generations (Tansei vs Nagomi)', () => {
    expect(lookupSized(dev('terumo-ultimaster-tansei').maxExpansionDiameter, 4.0).value).toBeNull();
    expect(lookupSized(dev('terumo-ultimaster-nagomi').maxExpansionDiameter, 4.0).value).toBe(6.25);
    expect(dev('terumo-ultimaster-nagomi').connectorsPerRing.value).toBeNull();
    expect(dev('terumo-ultimaster-tansei').connectorsPerRing.value).toBe(2);
  });

  it('carries EBC Table 3 expansion limits by size and generation', () => {
    expect(lookupSized(dev('biotronik-orsiro-mission').maxExpansionDiameter, 3.0).value).toBe(3.5);
    expect(lookupSized(dev('biotronik-orsiro-mission').maxExpansionDiameter, 4.0).value).toBe(4.5);
    expect(lookupSized(dev('terumo-ultimaster-nagomi').maxExpansionDiameter, 2.75).value).toBe(4.5);
    expect(lookupSized(dev('bsc-synergy-xd').maxExpansionDiameter, 3.5).value).toBe(4.25);
    expect(lookupSized(dev('bsc-synergy-megatron').maxExpansionDiameter, 4.5).value).toBe(6.0);
    // Onyx Frontier and Resolute Onyx are separate generations with different small-vessel limits
    expect(lookupSized(dev('medtronic-onyx-frontier').maxExpansionDiameter, 2.5).value).toBe(3.0);
    expect(lookupSized(dev('medtronic-resolute-onyx').maxExpansionDiameter, 2.5).value).toBe(3.5);
    // the 2015 SYNERGY record does not inherit SYNERGY XD values
    expect(lookupSized(dev('bsc-synergy').maxExpansionDiameter, 3.0).value).toBeNull();
    // platforms absent from Table 3 stay unavailable
    for (const id of ['biosensors-biomatrix-flex', 'terumo-ultimaster-tansei']) expect(lookupSized(dev(id).maxExpansionDiameter, 3.0).value).toBeNull();
    expect(lookupSized(dev('smt-supraflex-cruz').maxExpansionDiameter, 3.0).sourceIds).toEqual(['oner-2021-ejmr']);
    expect(lookupSized(dev('biotronik-orsiro-mission').maxExpansionDiameter, 3.0).sourceIds).toContain('ebc-2024-burzotta');
  });

  it('falls back to a flagged illustrative strut thickness when unavailable', () => {
    const t = strutThicknessForMesh(dev('biosensors-biomatrix-flex'), 3.0);
    expect(t.usedFallback).toBe(true);
    expect(t.status).toBe('ILLUSTRATIVE ASSUMPTION');
    expect(strutThicknessForMesh(dev('abbott-xience-skypoint'), 3.0).usedFallback).toBe(false);
  });

  it('applies documented length restrictions', () => {
    expect(lengthOptions(dev('abbott-xience-skypoint'), 4.5).values).toEqual([12, 15, 18, 23, 28, 33]);
    expect(lengthOptions(dev('abbott-xience-skypoint'), 3.0).values).toContain(48);
    expect(lengthOptions(dev('medtronic-resolute-onyx'), 2.0).values.at(-1)).toBe(30);
    expect(diameterOptions(dev('smt-supraflex-cruz')).documented).toBe(false);
  });

  it('rejects malformed admin records', () => {
    const ids = new Set(reg.sourceMap.keys());
    const bad = JSON.parse(JSON.stringify(dev('abbott-xience-skypoint')));
    bad.id = 'bad';
    bad.recoil = { status: 'DATA UNAVAILABLE', value: 3, unit: '%', sourceIds: [] };
    bad.strutThickness[0].sourceIds = ['nope'];
    bad.radialStrength = { status: 'PUBLISHED BENCH MEASUREMENT', value: 100, unit: 'kPa', sourceIds: [] };
    const errs = validateDeviceRecord(bad, ids);
    expect(errs.some((e) => /recoil.*DATA UNAVAILABLE/.test(e))).toBe(true);
    expect(errs.some((e) => /unknown source "nope"/.test(e))).toBe(true);
    expect(errs.some((e) => /radialStrength.*cites no source/.test(e))).toBe(true);
    const loaded = loadRegistry(BUILTIN_REGISTRY, [bad]);
    expect(loaded.devices.find((d) => d.id === 'bad')).toBeUndefined();
    expect(loaded.rejected[0].id).toBe('bad');
  });
});
