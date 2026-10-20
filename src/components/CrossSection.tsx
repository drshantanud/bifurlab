import { useMemo, useState } from 'react';
import type { BifurcationModel } from '../engine/bifurcationGeometry';
import type { SimResult } from '../engine/simulation';
import { sampleStruts, mvSlice } from '../engine/measurementEngine';
import { closestOnPolyline } from '../engine/math';
import { type Vec3, sub, dot, scale } from '../engine/math';
import type { DisplaySettings } from './display';

type Seg = 'mv' | 'sb';

export function CrossSection({ model, sim, display }: { model: BifurcationModel; sim: SimResult; display: DisplaySettings }) {
  const [seg, setSeg] = useState<Seg>('mv');
  const [pos, setPos] = useState(() => (model.lesions.prox[0] + model.xHeel) / 2);
  const [tPos, setTPos] = useState(() => model.tOstium + 2.5);
  const samples = useMemo(() => sampleStruts(sim.stents, 0.06), [sim]);
  const s = Math.min(Math.max(pos, model.sMin), model.sMax);
  const t = Math.min(Math.max(tPos, 0.2), model.sbLength);

  const view = useMemo(() => {
    const frame = seg === 'mv' ? model.mvFrame(s) : model.sbFrame();
    const center: Vec3 = seg === 'mv' ? model.mvPoint(s) : model.sbPoint(t);
    const refR = seg === 'mv' ? model.mvRefRadius(s) : model.sbRefRadius(t);
    const lumen: [number, number][] = [];
    for (let k = 0; k < 96; k++) {
      const phi = (2 * Math.PI * k) / 96;
      const r = seg === 'mv' ? model.mvLumenRadius(s, phi) : model.sbLumenRadius(t, phi);
      lumen.push([r * Math.sin(phi), r * Math.cos(phi)]);
    }
    const struts: { x: number; y: number; owner: number }[] = [];
    samples.pts.forEach((p, i) => {
      let along: number;
      if (seg === 'mv') along = model.closestMV(p).s - s;
      else along = dot(p, model.d) - t;
      if (Math.abs(along) > 0.06) return;
      const v = sub(p, seg === 'mv' ? model.closestMV(p).q : scale(model.d, dot(p, model.d)));
      struts.push({ x: dot(v, frame.B), y: dot(v, frame.N), owner: samples.owner[i] });
    });
    const balloons: { x: number; y: number; r: number }[] = [];
    for (const b of sim.activeBalloons) {
      const c = closestOnPolyline(b.axis, b.cum, center);
      const v = sub(c.q, center);
      const axial = seg === 'mv' ? model.closestMV(c.q).s - s : dot(c.q, model.d) - t;
      if (Math.abs(axial) < 0.5 && c.u > 0.1 && c.u < b.length - 0.1) balloons.push({ x: dot(v, frame.B), y: dot(v, frame.N), r: b.diameter / 2 });
    }
    const slice = seg === 'mv' && sim.stents.length ? mvSlice(model, samples.pts, s) : null;
    return { refR, lumen, struts, balloons, slice };
  }, [seg, s, t, model, samples, sim]);

  const R = Math.max(view.refR * 1.9, 3.2);
  const thick = (o: number) => Math.max(0.03, (sim.stents[o]?.thickness.micrometres ?? 80) / 2000);
  const range = seg === 'mv' ? [model.sMin, model.sMax] : [0.2, model.sbLength];
  return (
    <div className="cross-section">
      <div className="stage-toolbar">
        <label className="tgl">
          Segment{' '}
          <select value={seg} onChange={(e) => setSeg(e.target.value as Seg)} aria-label="Cross-section segment">
            <option value="mv">Main vessel</option>
            <option value="sb">Side branch</option>
          </select>
        </label>
        <label className="tgl" style={{ flex: 1, minWidth: 180 }}>
          Position
          <input
            type="range"
            min={range[0]}
            max={range[1]}
            step={0.1}
            value={seg === 'mv' ? s : t}
            onChange={(e) => (seg === 'mv' ? setPos(Number(e.target.value)) : setTPos(Number(e.target.value)))}
            style={{ flex: 1 }}
            aria-label="Cross-section position along the vessel"
          />
          <span className="mono">{(seg === 'mv' ? s : t).toFixed(1)} mm</span>
        </label>
      </div>
      <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} role="img" aria-label="Cross-section of vessel and stent struts">
        <g transform="scale(1,-1)">
          <circle cx={0} cy={0} r={view.refR + 0.4} fill={display.colors.wall} fillOpacity={0.18} stroke={display.colors.wall} strokeWidth={0.02} />
          <circle cx={0} cy={0} r={view.refR} fill={display.colors.plaque} fillOpacity={display.showPlaque && model.anatomy.plaqueEnabled ? (view.struts.length ? 0.22 : 0.55) : 0} stroke="#8796a8" strokeWidth={0.015} strokeDasharray="0.08 0.06" />
          <polygon
            points={view.lumen.map((p) => p.join(',')).join(' ')}
            fill={view.struts.length ? 'none' : display.colors.lumen}
            stroke="#9fb0c4"
            strokeWidth={0.02}
            strokeDasharray={view.struts.length ? '0.1 0.07' : undefined}
          />
          {view.balloons.map((b, i) => (
            <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={display.colors.balloon} fillOpacity={0.22} stroke={display.colors.balloon} strokeWidth={0.02} />
          ))}
          {view.struts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={thick(p.owner)} fill={p.owner === 0 ? display.colors.stent : display.colors.stent2} />
          ))}
        </g>
        <g transform={`translate(${R - 1.4}, ${R - 0.35})`}>
          <line x1={0} y1={0} x2={1} y2={0} stroke="#fff" strokeWidth={0.03} />
          <text x={0.5} y={-0.1} fontSize={0.22} fill="#fff" textAnchor="middle">
            1 mm
          </text>
        </g>
      </svg>
      <div className="stage-toolbar" style={{ borderTop: '1px solid #22344d', borderBottom: 0, display: 'block' }}>
        <div>
          Up = toward {seg === 'mv' ? 'side branch' : 'carina'} · reference Ø {(2 * view.refR).toFixed(2)} mm
          {view.slice && (
            <span style={{ color: display.colors.measure }}>
              {' '}
              · strut envelope Ø mean {view.slice.meanDiameter.toFixed(2)}, min {view.slice.minDiameter.toFixed(2)}, max {view.slice.maxDiameter.toFixed(2)} mm (illustrative geometric estimate)
            </span>
          )}
        </div>
        {view.struts.length > 0 && <div>Dashed outline: pre-PCI lumen. Plaque displacement by the stent is not modelled.</div>}
      </div>
    </div>
  );
}
