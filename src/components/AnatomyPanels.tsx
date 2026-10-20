import { useState } from 'react';
import { ANATOMY_FIELDS, EXAMPLE_ANATOMY, anatomyNotes, type Anatomy, type DiameterSource } from '../engine/anatomy';
import { hkCompare, hkDaughterDiameter, hkParentDiameter } from '../engine/huoKassab';
import { NumberField, Section } from './ui';

const isExample = (a: Anatomy) => (Object.keys(EXAMPLE_ANATOMY) as (keyof Anatomy)[]).every((k) => a[k] === EXAMPLE_ANATOMY[k]);

/** Anatomy inputs grouped so only the four key values show by default. */
export function AnatomyFields({ anatomy, onChange, idPrefix = 'an' }: { anatomy: Anatomy; onChange: (a: Anatomy) => void; idPrefix?: string }) {
  const set = (k: keyof Anatomy, v: unknown) => onChange({ ...anatomy, [k]: v });
  const field = (key: keyof Anatomy) => {
    const f = ANATOMY_FIELDS.find((x) => x.key === key)!;
    return (
      <NumberField key={key} id={`${idPrefix}-${key}`} label={f.label} unit={f.unit} value={anatomy[key] as number} min={f.min} max={f.max} step={f.step} allowZero={f.allowZero} help={f.help} onCommit={(v) => set(key, v)} />
    );
  };
  const notes = anatomyNotes(anatomy);
  return (
    <>
      <div className="rail-body">
        <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          {isExample(anatomy) ? <span className="example-tag">Example values</span> : <span className="muted">Custom anatomy</span>}
          <button className="btn" onClick={() => onChange(EXAMPLE_ANATOMY)} disabled={isExample(anatomy)}>
            Reset
          </button>
        </div>
        {(['dPMV', 'dDMV', 'dSB', 'angleDeg'] as const).map(field)}
        {notes.map((n) => (
          <div key={n} className="note warn">
            {n}
          </div>
        ))}
      </div>
      <Section title="Lesion lengths" meta={`${anatomy.lesionProx} / ${anatomy.lesionDist} / ${anatomy.lesionSB} mm`}>
        {(['lesionProx', 'lesionDist', 'lesionSB'] as const).map(field)}
      </Section>
      <Section title="Carina, taper and curvature">
        {(['carinaRounding', 'taperPct', 'sbFlarePct', 'curvatureDeg'] as const).map(field)}
        <div className="field wide">
          <label htmlFor={`${idPrefix}-src`}>Diameter source</label>
          <select id={`${idPrefix}-src`} className="plain" value={anatomy.diameterSource} onChange={(e) => set('diameterSource', e.target.value as DiameterSource)}>
            <option value="manual">Manually entered</option>
            <option value="angiography">Angiography-derived</option>
            <option value="ivus-oct">IVUS/OCT-derived</option>
          </select>
        </div>
      </Section>
      <Section title="Plaque" meta={anatomy.plaqueEnabled ? `${anatomy.plaqueBurdenPct}%` : 'off'}>
        <label className="check">
          <input type="checkbox" checked={anatomy.plaqueEnabled} onChange={(e) => set('plaqueEnabled', e.target.checked)} /> Show plaque in lesion segments
        </label>
        {anatomy.plaqueEnabled && (['plaqueBurdenPct', 'eccentricity'] as const).map(field)}
        <div className="muted">Calcification and vessel rigidity are not offered: this engine has no vessel mechanics.</div>
      </Section>
    </>
  );
}

type Unknown = 'PMV' | 'DMV' | 'SB';

export function HuoKassabSection({ anatomy }: { anatomy: Anatomy }) {
  const c = hkCompare(anatomy.dPMV, anatomy.dDMV, anatomy.dSB);
  const [unknown, setUnknown] = useState<Unknown>('SB');
  const [vals, setVals] = useState({ PMV: anatomy.dPMV, DMV: anatomy.dDMV, SB: anatomy.dSB });
  const solve = unknown === 'PMV' ? hkParentDiameter(vals.DMV, vals.SB) : unknown === 'DMV' ? hkDaughterDiameter(vals.PMV, vals.SB) : hkDaughterDiameter(vals.PMV, vals.DMV);
  const meta = 'error' in c ? '—' : `${c.calculatedPMV.toFixed(2)} mm`;
  return (
    <Section title="Huo–Kassab" meta={meta}>
      <div className="mono" style={{ fontSize: 13 }}>
        D<sub>PMV</sub><sup>7/3</sup> = D<sub>DMV</sub><sup>7/3</sup> + D<sub>SB</sub><sup>7/3</sup>
      </div>
      {'error' in c ? (
        <div className="note warn">{c.error}</div>
      ) : (
        <table className="data">
          <tbody>
            <tr><td>Measured PMV</td><td className="num">{c.measuredPMV.toFixed(2)} mm</td></tr>
            <tr><td>Calculated PMV</td><td className="num">{c.calculatedPMV.toFixed(2)} mm</td></tr>
            <tr><td>Difference</td><td className="num">{c.absoluteDifference >= 0 ? '+' : ''}{c.absoluteDifference.toFixed(2)} mm ({c.relativeDifferencePct >= 0 ? '+' : ''}{c.relativeDifferencePct.toFixed(1)}%)</td></tr>
          </tbody>
        </table>
      )}
      <div className="muted">Anatomical scaling relationship (Huo &amp; Kassab, 2012). Not a stent-sizing method and not a prediction of the post-PCI result.</div>
      <div className="group-label">Solve for an unknown diameter</div>
      <div className="field wide">
        <label htmlFor="hk-unknown">Unknown</label>
        <select id="hk-unknown" className="plain" value={unknown} onChange={(e) => setUnknown(e.target.value as Unknown)}>
          <option value="PMV">Proximal main vessel</option>
          <option value="DMV">Distal main vessel</option>
          <option value="SB">Side branch</option>
        </select>
      </div>
      {(['PMV', 'DMV', 'SB'] as const)
        .filter((k) => k !== unknown)
        .map((k) => (
          <NumberField key={k} id={`hk-${k}`} label={`${k} diameter`} unit="mm" value={vals[k]} min={0.5} max={8} onCommit={(v) => setVals({ ...vals, [k]: v })} />
        ))}
      <div className={solve.ok ? 'note accent' : 'note warn'} role="status">
        {solve.ok ? (
          <>
            Calculated {unknown}: <b className="mono">{solve.value.toFixed(2)} mm</b>
          </>
        ) : (
          solve.error
        )}
      </div>
    </Section>
  );
}
