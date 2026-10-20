import { useMemo, useState } from 'react';
import type { LoadedRegistry } from '../data/registry';
import { deviceLabel, diameterOptions } from '../data/registry';
import type { DeviceRecord } from '../data/deviceSchema';
import { SIZING_RULES, assessStent, nearestStentSize, proximalDiameter, type FitVerdict, type SizingRule, type StentFit } from '../engine/sizing';
import { EvidenceChip, NumberField } from './ui';
import { SourceLinks } from './ProcedurePanels';

const GROUPS: { verdict: FitVerdict; title: string; note: string }[] = [
  { verdict: 'reaches', title: 'Documented to expand to the proximal diameter', note: 'Maximum expansion at or above the calculated proximal main-vessel diameter.' },
  { verdict: 'cannot-reach', title: 'Cannot expand to the proximal diameter', note: 'Maximum expansion below the calculated proximal main-vessel diameter.' },
  { verdict: 'unknown', title: 'No documented expansion limit', note: 'The registry has no traceable maximum expansion value for this size.' },
];

export function SizingPage({ reg, dDMV, dSB, rule, onChange, onSimulate }: {
  reg: LoadedRegistry;
  dDMV: number;
  dSB: number;
  rule: SizingRule;
  onChange: (v: { dDMV: number; dSB: number; rule: SizingRule }) => void;
  onSimulate: (dev: DeviceRecord, diameter: number, dPMV: number) => void;
}) {
  const pmv = proximalDiameter(rule, dDMV, dSB);
  const other = proximalDiameter(rule === 'finet' ? 'huo-kassab' : 'finet', dDMV, dSB);
  const target = pmv.ok ? Math.round(pmv.value * 100) / 100 : null;
  const [sizeOverride, setSizeOverride] = useState<Record<string, number>>({});
  const devices = reg.devices.filter((d) => !d.isGeneric);
  const fits = useMemo(
    () =>
      target == null
        ? []
        : devices.map((d) => {
            const auto = nearestStentSize(d, dDMV);
            const dia = sizeOverride[d.id] ?? auto.diameter;
            return assessStent(d, dia, auto.documented, target);
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reg, dDMV, target, sizeOverride],
  );
  const ruleInfo = SIZING_RULES.find((r) => r.id === rule)!;

  return (
    <div className="sizing">
      <section className="rail sizing-input" aria-label="Vessel sizes">
        <div className="rail-head">
          <h2>Step 1 · Vessel sizes</h2>
        </div>
        <div className="rail-body">
          <NumberField id="sz-dmv" label="Distal main vessel diameter" unit="mm" value={dDMV} min={1} max={7} onCommit={(v) => onChange({ dDMV: v, dSB, rule })} />
          <NumberField id="sz-sb" label="Side-branch diameter" unit="mm" value={dSB} min={1} max={6} onCommit={(v) => onChange({ dDMV, dSB: v, rule })} />
          <div className="field wide">
            <label htmlFor="sz-rule">Rule</label>
            <select id="sz-rule" className="plain" value={rule} onChange={(e) => onChange({ dDMV, dSB, rule: e.target.value as SizingRule })}>
              {SIZING_RULES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="pmv-result" role="status">
            <div className="k">Proximal main vessel</div>
            {pmv.ok ? (
              <div className="v">
                {pmv.value.toFixed(2)}
                <span className="u">mm</span>
              </div>
            ) : (
              <div className="note warn">{pmv.error}</div>
            )}
            <div className="mono f">{ruleInfo.formula}</div>
            {other.ok && <div className="muted">{rule === 'finet' ? 'Huo–Kassab' : "Finet's law"} gives {other.value.toFixed(2)} mm.</div>}
          </div>
          <div className="muted">
            {ruleInfo.reference} Anatomical scaling relationships, used here to estimate the proximal reference size. Confirm with imaging where available.
          </div>
        </div>
      </section>

      <section className="sizing-list" aria-label="Stent options">
        <div className="sizing-head">
          <h2>Step 2 · Stents sized to the distal main vessel ({dDMV.toFixed(2)} mm)</h2>
          {target != null && (
            <p className="muted">
              Each stent is checked for whether its documented maximum expansion reaches the proximal main vessel ({target.toFixed(2)} mm), for example with POT. Listed in registry order; this is not a ranking.
            </p>
          )}
        </div>
        {target != null &&
          GROUPS.map((g) => {
            const rows = fits.filter((f) => f.verdict === g.verdict);
            if (!rows.length) return null;
            return (
              <div key={g.verdict} className={`fit-group fit-${g.verdict}`}>
                <h3>
                  {g.title} <span className="muted">· {rows.length}</span>
                </h3>
                <div className="fit-cards">
                  {rows.map((f) => (
                    <FitCard
                      key={f.device.id}
                      f={f}
                      reg={reg}
                      target={target}
                      onSize={(d) => setSizeOverride({ ...sizeOverride, [f.device.id]: d })}
                      onSimulate={() => onSimulate(f.device, f.diameter, target)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        <p className="muted">
          Expansion limits are manufacturer data as cited (mainly EBC consensus 2024, Table 3). They describe the stent platform, not a predicted result in a diseased vessel. Always check the instructions for use.
        </p>
      </section>
    </div>
  );
}

function FitCard({ f, reg, target, onSize, onSimulate }: { f: StentFit; reg: LoadedRegistry; target: number; onSize: (d: number) => void; onSimulate: () => void }) {
  const opts = diameterOptions(f.device).values;
  const max = f.maxExpansion.value;
  return (
    <article className="fit-card">
      <header>
        <b>{deviceLabel(f.device)}</b>
        <span className={`verdict v-${f.verdict}`}>
          {f.verdict === 'reaches' ? `Reaches ${target.toFixed(2)} mm` : f.verdict === 'cannot-reach' ? `Max ${max} mm < ${target.toFixed(2)} mm` : 'Data unavailable'}
        </span>
      </header>
      <div className="fit-row">
        <label>
          Stent size
          <select className="plain" value={f.diameter} onChange={(e) => onSize(Number(e.target.value))} aria-label={`${f.device.model} stent diameter`}>
            {opts.map((d) => (
              <option key={d} value={d}>
                {d.toFixed(2)} mm
              </option>
            ))}
          </select>
        </label>
        {!f.sizeDocumented && <span className="muted">Size list not documented; 0.25 mm grid shown.</span>}
      </div>
      <dl className="kv">
        <dt>Max expansion</dt>
        <dd>
          {max != null ? (
            <>
              <b className="mono">{max} mm</b>{f.maxExpansion.conditions && /outer diameter/i.test(f.maxExpansion.conditions) ? <span className="muted"> O.D.</span> : null} {f.margin != null && <span className={`mono ${f.margin < 0 ? 'neg' : 'pos'}`}>({f.margin >= 0 ? '+' : ''}{f.margin.toFixed(2)})</span>} <EvidenceChip status={f.maxExpansion.status} />
              <SourceLinks ids={f.maxExpansion.sourceIds} reg={reg} />
            </>
          ) : (
            <EvidenceChip status="DATA UNAVAILABLE" long />
          )}
        </dd>
        {f.minimalExpansion && (
          <>
            <dt>Minimal expansion</dt>
            <dd>
              <span className="mono">{f.minimalExpansion.value} mm</span>
              {f.minimalExpansion.conditions ? <span className="muted"> {f.minimalExpansion.conditions}</span> : null} <EvidenceChip status={f.minimalExpansion.status} />
            </dd>
          </>
        )}
      </dl>
      <button className="btn primary" onClick={onSimulate}>
        Simulate techniques with this stent →
      </button>
    </article>
  );
}
