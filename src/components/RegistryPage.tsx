import { useState } from 'react';
import type { LoadedRegistry } from '../data/registry';
import { lookupSized, BUILTIN_REGISTRY } from '../data/registry';
import type { DeviceRecord, EvidenceNumber, EvidenceText, Source } from '../data/deviceSchema';
import { validateDeviceRecord, validateSource } from '../data/deviceSchema';
import schema from '../data/device-record.schema.json';
import { EVIDENCE_STATUSES } from '../data/evidence';
import { EvidenceChip, Panel, copyText, downloadText } from './ui';

const sizedText = (arr: EvidenceNumber[]) =>
  arr.map((e, i) => (
    <div key={i}>
      {e.value != null ? `${e.value} ${e.unit}` : 'Data unavailable'}
      {e.appliesToDiameters ? ` (${e.appliesToDiameters[0]}–${e.appliesToDiameters[1]} mm)` : ''} <EvidenceChip status={e.status} />
      {e.conditions && <div className="basis">{e.conditions}</div>}
      {e.notes && <div className="basis">{e.notes}</div>}
    </div>
  ));

function Sources({ ids, reg }: { ids: string[]; reg: LoadedRegistry }) {
  return (
    <>
      {ids.map((id) => {
        const s = reg.sourceMap.get(id);
        return s ? (
          <div key={id} className="basis">
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>{' '}
            — {s.publisher}
            {s.revision ? `, ${s.revision}` : ''} (accessed {s.accessed})
          </div>
        ) : null;
      })}
    </>
  );
}

function TextRow({ label, v, reg }: { label: string; v: EvidenceText; reg: LoadedRegistry }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {v.value ?? 'Data unavailable'} <EvidenceChip status={v.status} />
        {v.notes && <div className="basis">{v.notes}</div>}
        <Sources ids={v.sourceIds} reg={reg} />
      </dd>
    </>
  );
}

function NumRows({ label, arr, reg }: { label: string; arr: EvidenceNumber[]; reg: LoadedRegistry }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {sizedText(arr)}
        <Sources ids={[...new Set(arr.flatMap((e) => e.sourceIds))]} reg={reg} />
      </dd>
    </>
  );
}

export function DeviceDetail({ d, reg }: { d: DeviceRecord; reg: LoadedRegistry }) {
  const sizes = (s: DeviceRecord['diameters']) => (s.values ? s.values.join(', ') + ' mm' : s.range ? `${s.range[0]}–${s.range[1]} mm (range only)` : 'Data unavailable');
  return (
    <Panel title={d.model} sub={`${d.manufacturer} · record ${d.recordVersion} · reviewed ${d.lastReviewed}`}>
      <div className="muted">{d.generation}</div>
      <dl className="kv">
        <dt>Diameters</dt>
        <dd>
          {sizes(d.diameters)} <EvidenceChip status={d.diameters.status} />
          {d.diameters.notes && <div className="basis">{d.diameters.notes}</div>}
          <Sources ids={d.diameters.sourceIds} reg={reg} />
        </dd>
        <dt>Lengths</dt>
        <dd>
          {sizes(d.lengths)} <EvidenceChip status={d.lengths.status} />
          {d.lengths.notes && <div className="basis">{d.lengths.notes}</div>}
          {d.lengthRestrictions.map((r, i) => (
            <div key={i} className="basis">
              {r.diameters.join(', ')} mm stents: {r.minLength != null ? `${r.minLength}–${r.maxLength} mm` : `up to ${r.maxLength} mm`}
            </div>
          ))}
        </dd>
        <NumRows label="Strut thickness" arr={d.strutThickness} reg={reg} />
        <TextRow label="Strut cross-section" v={d.strutCrossSection} reg={reg} />
        <TextRow label="Ring pattern" v={d.ringPattern} reg={reg} />
        <TextRow label="Connectors" v={d.connectorArrangement} reg={reg} />
        <NumRows label="Connectors per ring" arr={[d.connectorsPerRing]} reg={reg} />
        <TextRow label="Cell geometry" v={d.cellGeometry} reg={reg} />
        <TextRow label="Material" v={d.material} reg={reg} />
        <TextRow label="Material properties" v={d.materialProperties} reg={reg} />
        <NumRows label="Nominal pressure (manufacturer)" arr={d.nominalPressure} reg={reg} />
        <NumRows label="Rated burst pressure (manufacturer limit)" arr={d.ratedBurstPressure} reg={reg} />
        <NumRows label="Max expansion (manufacturer limit)" arr={d.maxExpansionDiameter} reg={reg} />
        {d.minimalExpansion && <NumRows label="Minimal expansion (compliance chart)" arr={d.minimalExpansion} reg={reg} />}
        <NumRows label="Radial strength (observed)" arr={[d.radialStrength]} reg={reg} />
        <NumRows label="Longitudinal strength (observed)" arr={[d.longitudinalStrength]} reg={reg} />
        <NumRows label="Recoil (observed)" arr={[d.recoil]} reg={reg} />
        <NumRows label="Foreshortening (observed)" arr={[d.foreshortening]} reg={reg} />
        <NumRows label="SB cell opening (observed)" arr={[d.sideBranchCellOpening]} reg={reg} />
        <dt>Bench tests</dt>
        <dd>
          {d.benchTests.length
            ? d.benchTests.map((b, i) => (
                <details key={i}>
                  <summary>
                    {b.description} <EvidenceChip status={b.status} />
                  </summary>
                  {b.conditions && <div className="basis">{b.conditions}</div>}
                  {b.testMethod && <div className="basis">Method: {b.testMethod}</div>}
                  <Sources ids={b.sourceIds} reg={reg} />
                </details>
              ))
            : 'None entered'}
        </dd>
        <dt>Limitations</dt>
        <dd>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {d.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </dd>
      </dl>
    </Panel>
  );
}

export function RegistryPage({ reg, localDevices, localSources, onSaveLocal, notify }: { reg: LoadedRegistry; localDevices: DeviceRecord[]; localSources: Source[]; onSaveLocal: (d: DeviceRecord[], s: Source[]) => void; notify: (m: string) => void }) {
  const [sel, setSel] = useState(reg.devices[0]?.id);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[] | null>(null);
  const selected = reg.devices.find((d) => d.id === sel) ?? reg.devices[0];

  const validateInput = (): { device: DeviceRecord; sources: Source[] } | null => {
    try {
      const parsed = JSON.parse(text);
      const device: DeviceRecord = parsed.device ?? parsed;
      const sources: Source[] = parsed.sources ?? [];
      const errs = sources.flatMap(validateSource);
      const ids = new Set([...reg.sourceMap.keys(), ...sources.map((s) => s.id)]);
      errs.push(...validateDeviceRecord(device, ids));
      if (reg.devices.some((d) => d.id === device.id) && !localDevices.some((d) => d.id === device.id)) errs.push(`id "${device.id}" is already used by a built-in record`);
      setErrors(errs);
      return errs.length ? null : { device, sources };
    } catch (e) {
      setErrors([`Not valid JSON: ${(e as Error).message}`]);
      return null;
    }
  };

  return (
    <div className="registry-grid">
      <div className="col">
        <Panel title="Device registry" sub={`Version ${reg.registryVersion} · schema ${reg.schemaVersion} · ${reg.devices.length} records`}>
          <div className="muted">Every numerical property is traceable to a source or marked as data unavailable. Manufacturer limits are kept separate from observed (bench) behaviour. Values are never transferred between product generations.</div>
          <div className="btn-row">
            {EVIDENCE_STATUSES.map((s) => (
              <EvidenceChip key={s} status={s} long />
            ))}
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Strut thickness</th>
                  <th>RBP</th>
                  <th>Max expansion</th>
                  <th>Bench data</th>
                </tr>
              </thead>
              <tbody>
                {reg.devices.map((d) => {
                  const st = d.strutThickness.filter((e) => e.value != null);
                  return (
                    <tr key={d.id} className={`clickable${d.id === selected?.id ? ' selected' : ''}`} onClick={() => setSel(d.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(d.id)}>
                      <td>
                        <b>{d.model}</b>
                        <div className="basis">{d.manufacturer}</div>
                      </td>
                      <td className="num">{st.length ? st.map((e) => `${e.value}`).join(' / ') + ' µm' : <EvidenceChip status="DATA UNAVAILABLE" />}</td>
                      <td className="num">{d.ratedBurstPressure.some((e) => e.value != null) ? d.ratedBurstPressure.filter((e) => e.value != null).map((e) => e.value).join(' / ') + ' atm' : <EvidenceChip status="DATA UNAVAILABLE" />}</td>
                      <td className="num">{d.maxExpansionDiameter.some((e) => e.value != null) ? lookupSized(d.maxExpansionDiameter, 3.0).value ?? 'by size' : <EvidenceChip status="DATA UNAVAILABLE" />}</td>
                      <td>{d.benchTests.length ? d.benchTests.length : <EvidenceChip status="DATA UNAVAILABLE" />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="muted">Max expansion column shows the value for a 3.0 mm stent where documented.</div>
        </Panel>
        <Panel title="Administrator: add a device record" sub="Stored only in this browser">
          <div className="muted">Paste a device record (or {'{ "device": …, "sources": [ … ] }'}). It is validated against the schema before it can enter the simulator. New platforms need no change to the simulation engine.</div>
          <textarea id="admin-json" className="plain" rows={10} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Device record JSON" />
          <div className="btn-row">
            <button
              className="btn"
              onClick={() => {
                const tpl = JSON.parse(JSON.stringify(BUILTIN_REGISTRY.devices.find((d) => d.id === 'generic-illustrative')));
                tpl.id = 'my-new-device';
                tpl.model = 'New device (edit me)';
                tpl.family = 'Custom';
                tpl.isGeneric = false;
                setText(JSON.stringify({ device: tpl, sources: [] }, null, 2));
                setErrors(null);
              }}
            >
              Load template
            </button>
            <button className="btn" onClick={() => validateInput() && notify('Record is valid.')}>
              Validate
            </button>
            <button
              className="btn primary"
              onClick={() => {
                const ok = validateInput();
                if (!ok) return;
                onSaveLocal([...localDevices.filter((d) => d.id !== ok.device.id), ok.device], [...localSources.filter((s) => !ok.sources.some((n) => n.id === s.id)), ...ok.sources]);
                notify(`Added ${ok.device.model} to this browser's registry.`);
              }}
            >
              Add to registry
            </button>
          </div>
          {errors && errors.length > 0 && (
            <div className="note warn" role="alert">
              <b>Record rejected:</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {errors && errors.length === 0 && <div className="note accent">Record passes validation.</div>}
          {localDevices.length > 0 && (
            <div>
              <div className="group-label">Local records</div>
              {localDevices.map((d) => (
                <div key={d.id} className="btn-row" style={{ alignItems: 'center' }}>
                  <span>{d.model}</span>
                  <button className="btn" onClick={() => onSaveLocal(localDevices.filter((x) => x.id !== d.id), localSources)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {reg.rejected.length > 0 && (
            <div className="note warn">
              {reg.rejected.length} stored record(s) failed validation and are excluded: {reg.rejected.map((r) => r.id).join(', ')}
            </div>
          )}
          <div className="btn-row">
            <button className="btn" onClick={async () => notify((await copyText(JSON.stringify({ ...BUILTIN_REGISTRY, devices: reg.devices, sources: reg.sources }, null, 2))) ? 'Registry JSON copied.' : 'Copy failed.')}>
              Copy registry JSON
            </button>
            <button className="btn" onClick={() => downloadText('bifurcation-lab-registry.json', JSON.stringify({ ...BUILTIN_REGISTRY, devices: reg.devices, sources: reg.sources }, null, 2), 'application/json')}>
              Download registry JSON
            </button>
            <button className="btn" onClick={async () => notify((await copyText(JSON.stringify(schema, null, 2))) ? 'JSON Schema copied.' : 'Copy failed.')}>
              Copy JSON Schema
            </button>
          </div>
        </Panel>
      </div>
      <div className="col">{selected && <DeviceDetail d={selected} reg={reg} />}</div>
    </div>
  );
}
