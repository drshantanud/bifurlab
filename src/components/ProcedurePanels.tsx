import type { Anatomy } from '../engine/anatomy';
import { Fragment, useEffect, useState } from 'react';
import type { LoadedRegistry } from '../data/registry';
import { diameterOptions, lengthOptions, lookupSized, strutThicknessForMesh, deviceLabel } from '../data/registry';
import type { EvidenceNumber } from '../data/deviceSchema';
import { TECHNIQUES, withTechnique, type Scenario, type StentChoice, type Technique, type ProcParams } from '../engine/scenario';
import { allStages } from '../engine/proceduralSequence';
import type { SimResult, SimWarning } from '../engine/simulation';
import type { Metric } from '../engine/measurementEngine';
import { fmt } from '../engine/report';
import { EvidenceChip, NumberField, Panel, Section, Term } from './ui';

export function SourceLinks({ ids, reg }: { ids: string[]; reg: LoadedRegistry }) {
  if (!ids.length) return null;
  return (
    <span className="muted">
      {' '}
      {ids.map((id, i) => {
        const s = reg.sourceMap.get(id);
        return s ? (
          <a key={id} href={s.url} target="_blank" rel="noreferrer" title={`${s.title} — ${s.publisher}${s.revision ? ` (${s.revision})` : ''}`}>
            [{i + 1}]
          </a>
        ) : null;
      })}
    </span>
  );
}

function EvRow({ label, e, reg }: { label: string; e: EvidenceNumber; reg: LoadedRegistry }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{e.value != null ? `${e.value} ${e.unit}` : <span className="nc">Data unavailable</span>}</td>
      <td>
        <EvidenceChip status={e.status} />
        <SourceLinks ids={e.sourceIds} reg={reg} />
      </td>
    </tr>
  );
}

export function StentChooser({ title, choice, reg, onChange, idPrefix, research }: { title: string; choice: StentChoice; reg: LoadedRegistry; onChange: (c: StentChoice) => void; idPrefix: string; research: boolean }) {
  const dev = reg.devices.find((d) => d.id === choice.deviceId) ?? reg.devices[0];
  const dOpts = diameterOptions(dev);
  const lOpts = lengthOptions(dev, choice.diameter);
  const pickDevice = (id: string) => {
    const nd = reg.devices.find((d) => d.id === id)!;
    const ds = diameterOptions(nd).values;
    const d = ds.reduce((b, v) => (Math.abs(v - choice.diameter) < Math.abs(b - choice.diameter) ? v : b), ds[0]);
    const ls = lengthOptions(nd, d).values;
    const l = ls.find((v) => v >= choice.length) ?? ls[ls.length - 1];
    onChange({ deviceId: id, diameter: d, length: l });
  };
  const pickDiameter = (d: number) => {
    const ls = lengthOptions(dev, d).values;
    onChange({ ...choice, diameter: d, length: ls.includes(choice.length) ? choice.length : ls.find((v) => v >= choice.length) ?? ls[ls.length - 1] });
  };
  const thick = strutThicknessForMesh(dev, choice.diameter);
  const maxE = lookupSized(dev.maxExpansionDiameter, choice.diameter);
  const families = [...new Set(reg.devices.map((d) => d.family))];
  return (
    <div className="body" style={{ padding: 0, gap: 8 }}>
      <div className="group-label">{title}</div>
      <select id={`${idPrefix}-dev`} aria-label={`${title}: platform and model`} className="plain" value={dev.id} onChange={(e) => pickDevice(e.target.value)}>
        {families.map((f) => (
          <optgroup key={f} label={f}>
            {reg.devices.filter((d) => d.family === f).map((d) => (
              <option key={d.id} value={d.id}>
                {deviceLabel(d)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="input-unit field" style={{ display: 'flex' }}>
          <select id={`${idPrefix}-d`} aria-label="Nominal diameter" value={choice.diameter} onChange={(e) => pickDiameter(Number(e.target.value))}>
            {dOpts.values.map((d) => (
              <option key={d} value={d}>
                {d.toFixed(2)}
              </option>
            ))}
          </select>
          <span className="unit">mm Ø</span>
        </div>
        <div className="input-unit field" style={{ display: 'flex' }}>
          <select id={`${idPrefix}-l`} aria-label="Length" value={choice.length} onChange={(e) => onChange({ ...choice, length: Number(e.target.value) })}>
            {lOpts.values.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <span className="unit">mm long</span>
        </div>
      </div>
      <div className="muted">
        Strut {thick.micrometres} µm <EvidenceChip status={thick.status} /> · max expansion {maxE.value != null ? `${maxE.value} mm` : 'unavailable'} <EvidenceChip status={maxE.status} />
        <SourceLinks ids={[...new Set([...thick.evidence.sourceIds, ...maxE.sourceIds])]} reg={reg} />
      </div>
      {(!dOpts.documented || !lOpts.documented) && !dev.isGeneric && <div className="muted">Only a size range is documented for this model; confirm the size exists.</div>}
      {research && (
        <details>
          <summary className="muted">All device data for this size</summary>
          <table className="data">
            <tbody>
              <EvRow label="Strut thickness" e={thick.evidence} reg={reg} />
              <EvRow label="Nominal pressure" e={lookupSized(dev.nominalPressure, choice.diameter)} reg={reg} />
              <EvRow label="Rated burst pressure" e={lookupSized(dev.ratedBurstPressure, choice.diameter)} reg={reg} />
              <EvRow label="Max expansion" e={maxE} reg={reg} />
              {dev.minimalExpansion && <EvRow label="Minimal expansion" e={lookupSized(dev.minimalExpansion, choice.diameter)} reg={reg} />}
              <tr>
                <td>Material</td>
                <td>{dev.material.value ?? <span className="nc">Data unavailable</span>}</td>
                <td>
                  <EvidenceChip status={dev.material.status} />
                </td>
              </tr>
              <EvRow label="Radial strength" e={dev.radialStrength} reg={reg} />
              <EvRow label="Recoil" e={dev.recoil} reg={reg} />
              <EvRow label="SB cell opening (bench)" e={dev.sideBranchCellOpening} reg={reg} />
            </tbody>
          </table>
          <div className="muted">{dev.generation}</div>
        </details>
      )}
    </div>
  );
}

export function SetupRail({ sc, anatomy, reg, onChange, research, teaching }: { sc: Scenario; anatomy: Anatomy; reg: LoadedRegistry; onChange: (s: Scenario) => void; research: boolean; teaching: boolean }) {
  const tech = TECHNIQUES.find((t) => t.id === sc.technique)!;
  const setTech = (t: Technique) => onChange(withTechnique(sc, t, anatomy, reg));
  const p = sc.proc;
  const set = (k: keyof ProcParams, v: number | boolean) => onChange({ ...sc, proc: { ...p, [k]: v } });
  const nf = (k: keyof ProcParams, label: React.ReactNode, unit: string, min: number, max: number, step = 0.25, allowZero = false) => (
    <NumberField key={k} id={`proc-${k}`} label={label} unit={unit} value={p[k] as number} min={min} max={max} step={step} allowZero={allowZero} onCommit={(v) => set(k, v)} />
  );
  const optional = allStages(sc.technique, p).filter((s) => s.optional);
  return (
    <>
      <div className="rail-body">
        <div className="field wide">
          <label htmlFor="tech">Technique</label>
          <select id="tech" className="plain" value={sc.technique} onChange={(e) => setTech(e.target.value as Technique)}>
            {TECHNIQUES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <StentChooser title={sc.technique === 'culotte' ? 'Second stent (PMV → DMV)' : 'Main-vessel stent'} choice={sc.mvStent} reg={reg} onChange={(c) => onChange({ ...sc, mvStent: c })} idPrefix="mvs" research={research} />
        {tech.twoStent && (
          <StentChooser title={sc.technique === 'culotte' ? 'First stent (PMV → SB)' : 'Side-branch stent'} choice={sc.sbStent} reg={reg} onChange={(c) => onChange({ ...sc, sbStent: c })} idPrefix="sbs" research={research} />
        )}
        {optional.map((s) => (
          <label key={s.id} className="check">
            <input type="checkbox" checked={s.included} onChange={(e) => onChange({ ...sc, proc: { ...p, [s.optional!]: e.target.checked } })} /> Include: {s.title.replace(' (optional)', '').toLowerCase()}
          </label>
        ))}
      </div>
      <Section title="Balloons" meta={`MV ${p.mvBalloonD} · SB ${p.sbBalloonD} mm`}>
        {nf('mvBalloonD', 'Main-vessel balloon', 'mm', 1.5, 6)}
        {nf('sbBalloonD', 'Side-branch balloon', 'mm', 1.0, 5)}
        {sc.technique === 'provisional' && nf('cellOpenBalloonD', <Term k="cell opening" teaching={teaching}>Cell-opening balloon</Term>, 'mm', 1.0, 4)}
        {nf('balloonLength', 'Balloon length', 'mm', 6, 30, 1)}
      </Section>
      <Section title={<Term k="POT" teaching={teaching}>POT</Term>} meta={`${p.potD} mm`}>
        {nf('potD', 'POT balloon diameter', 'mm', 2, 6.5)}
        {nf('potLength', 'POT balloon length', 'mm', 4, 20, 1)}
        {nf('potOffset', 'Distal end vs carina (− proximal)', 'mm', -6, 3, 0.25, true)}
      </Section>
      <Section title={<Term k="kissing" teaching={teaching}>Kissing{sc.technique === 'dk-crush' || sc.technique === 'tap' ? ' and protrusion' : ''}</Term>}>
        {nf('kissOverlap', 'Proximal side-by-side overlap', 'mm', 0.5, 12, 0.5)}
        {(sc.technique === 'dk-crush' || sc.technique === 'tap') && nf('protrusion', <Term k="protrusion" teaching={teaching}>SB stent protrusion</Term>, 'mm', 0.25, 5, 0.25)}
      </Section>
      <Section title="Inflation pressure" meta={`${p.deployPressure} / ${p.postDilPressure} atm`}>
        {nf('deployPressure', 'Stent deployment', 'atm', 1, 30, 1)}
        {nf('postDilPressure', 'Post-dilation', 'atm', 1, 30, 1)}
        <div className="muted">Recorded and checked against documented limits. Pressure is never converted into a stent diameter; balloons act at their labelled size.</div>
      </Section>
    </>
  );
}

export function Timeline({ sim, onStage, teaching }: { sim: SimResult; onStage: (i: number) => void; teaching: boolean }) {
  const [playing, setPlaying] = useState(false);
  const n = sim.stages.length;
  const i = sim.stageIndex;
  useEffect(() => {
    if (!playing) return;
    if (i >= n - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => onStage(i + 1), 2800);
    return () => clearTimeout(t);
  }, [playing, i, n, onStage]);
  const stage = sim.stages[i];
  return (
    <section className="timeline" aria-label="Procedural timeline">
      <div className="steps" role="tablist" aria-label="Deployment stages">
        {sim.stages.map((s, k) => (
          <button key={s.id + k} role="tab" aria-selected={k === i} className={`step${k === i ? ' current' : k < i ? ' done' : ''}`} onClick={() => onStage(k)} title={s.title}>
            {k + 1}
          </button>
        ))}
      </div>
      <div className="stage-title">
        <h3>
          Stage {i + 1} of {n}: {stage.title}
        </h3>
        <div className="btn-row">
          <button className="btn" onClick={() => onStage(i - 1)} disabled={i === 0} aria-label="Previous stage">
            ← Back
          </button>
          <button className="btn" onClick={() => onStage(i + 1)} disabled={i === n - 1} aria-label="Next stage">
            Next →
          </button>
          <button
            className="btn primary"
            onClick={() => {
              if (!playing) onStage(0);
              setPlaying(!playing);
            }}
          >
            {playing ? 'Stop' : 'Play all'}
          </button>
        </div>
      </div>
      {teaching && <p style={{ margin: 0 }}>{stage.teaching}</p>}
    </section>
  );
}

const KEY_METRICS = ['prox-d', 'dist-d', 'prox-ell', 'ostial-free', 'ostial-struts', 'overlap'];

export function ResultsRail({ metrics, warnings, reg, research }: { metrics: Metric[]; warnings: SimWarning[]; reg: LoadedRegistry; research: boolean }) {
  const key = KEY_METRICS.map((id) => metrics.find((m) => m.id === id)).filter((m): m is Metric => !!m && !(m.id === 'overlap' && !m.value));
  const warn = warnings.filter((w) => w.level === 'warning');
  const info = warnings.filter((w) => w.level === 'info');
  const groups: [Metric['group'], string][] = [
    ['geometry', 'Stent geometry'],
    ['anatomy', 'Anatomy'],
    ['procedure', 'Procedure inputs'],
    ['mechanical', 'Mechanical quantities'],
  ];
  return (
    <>
      <div className="rail-body">
        <div className="tiles">
          {key.map((m) => (
            <div className="tile" key={m.id} title={`${m.basis}. ${m.method}`}>
              <div className="k">{m.label.replace(' (mean)', '').replace(' (largest strut-free circle)', '').replace(' (max/min diameter)', '')}</div>
              {m.value == null ? <div className="v nc">Not calculable</div> : <div className="v">{m.value.toFixed(m.unit === 'count' ? 0 : 2)}<span className="u">{m.unit === 'ratio' || m.unit === 'count' ? '' : m.unit}</span></div>}
            </div>
          ))}
        </div>
        <div className="muted">Illustrative geometric estimates from the generic mesh. Hover a value for its method.</div>
        {warn.map((w, i) => (
          <div key={i} className="warning-item">
            {w.message}
            <SourceLinks ids={w.sourceIds} reg={reg} />
          </div>
        ))}
      </div>
      <Section title="All measurements" meta={`${metrics.length}`}>
        <div className="table-scroll">
          <table className="data">
            <tbody>
              {groups.map(([g, label]) => (
                <Fragment key={g}>
                  <tr>
                    <th colSpan={2}>{label}</th>
                  </tr>
                  {metrics
                    .filter((m) => m.group === g)
                    .map((m) => (
                      <tr key={m.id}>
                        <td>
                          {m.label}
                          <div className="basis" title={m.method}>
                            {m.basis}
                            {research ? ` · ${m.method}` : ''}
                          </div>
                        </td>
                        <td className={`num${m.value == null ? ' nc' : ''}`}>{fmt(m.value, m.unit)}</td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Data notes" meta={`${info.length}`}>
        {info.map((w, i) => (
          <div key={i} className="warning-item info">
            {w.message}
            <SourceLinks ids={w.sourceIds} reg={reg} />
          </div>
        ))}
        <div className="muted">Warnings do not replace the manufacturer's instructions for use.</div>
      </Section>
    </>
  );
}

export function MechanicalPanel() {
  return (
    <Panel title="Mechanical simulation" sub="Mode 3">
      <div className="note warn" role="status">
        <b>Mechanical simulation not available in this build.</b>
      </div>
      <table className="data">
        <tbody>
          <tr><td>Solver status</td><td>No solver registered</td></tr>
          <tr><td>Material model</td><td className="nc">Not available</td></tr>
          <tr><td>Boundary conditions</td><td className="nc">Not available</td></tr>
          <tr><td>Contact assumptions</td><td className="nc">Not available</td></tr>
          <tr><td>Mesh resolution</td><td className="nc">Not available</td></tr>
          <tr><td>Convergence</td><td className="nc">Not available</td></tr>
          <tr><td>Stress / strain fields</td><td className="nc">Not calculated</td></tr>
          <tr><td>Validation results</td><td className="nc">None</td></tr>
        </tbody>
      </table>
      <div className="muted">
        A validated finite-element backend can be connected through the MechanicalSolver interface (src/engine/solver.ts) without changing the interface. No stress map is drawn, because none has been calculated.
      </div>
    </Panel>
  );
}
