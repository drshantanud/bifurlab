import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { BifurcationModel } from '../engine/bifurcationGeometry';
import { buildVesselMeshes, type MeshData } from '../engine/vesselGeometry';
import type { AppliedBalloon, SimResult, SimStent } from '../engine/simulation';
import type { Balloon } from '../engine/balloonGeometry';
import type { Metric } from '../engine/measurementEngine';
import { type Vec3, add, scale, norm } from '../engine/math';
import type { DisplaySettings, ViewPreset } from './display';

function toGeometry(m: MeshData, plaqueColor?: THREE.Color, baseColor?: THREE.Color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  if (m.plaque && plaqueColor && baseColor) {
    const c = new Float32Array(m.plaque.length * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < m.plaque.length; i++) {
      const w = THREE.MathUtils.smoothstep(m.plaque[i], 0.02, 0.18);
      tmp.copy(baseColor).lerp(plaqueColor, w);
      c[i * 3] = tmp.r;
      c[i * 3 + 1] = tmp.g;
      c[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  g.computeVertexNormals();
  return g;
}

function Vessel({ model, display }: { model: BifurcationModel; display: DisplaySettings }) {
  const meshes = useMemo(() => buildVesselMeshes(model, display.showPlaque && model.anatomy.plaqueEnabled), [model, display.showPlaque]);
  const geo = useMemo(() => {
    const pc = new THREE.Color(display.colors.plaque);
    const lc = new THREE.Color(display.colors.lumen);
    return {
      mvLumen: toGeometry(meshes.mvLumen, pc, lc),
      sbLumen: toGeometry(meshes.sbLumen, pc, lc),
      mvWall: toGeometry(meshes.mvWall),
      sbWall: toGeometry(meshes.sbWall),
    };
  }, [meshes, display.colors.plaque, display.colors.lumen]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  const plaque = display.showPlaque && model.anatomy.plaqueEnabled;
  return (
    <group>
      {display.showLumen &&
        [geo.mvLumen, geo.sbLumen].map((g, i) => (
          <mesh key={`l${i}`} geometry={g} renderOrder={0}>
            <meshStandardMaterial side={THREE.FrontSide} vertexColors={plaque} color={plaque ? '#ffffff' : display.colors.lumen} roughness={0.85} metalness={0} />
          </mesh>
        ))}
      {display.showWall &&
        [geo.mvWall, geo.sbWall].map((g, i) => (
          <mesh key={`w${i}`} geometry={g} renderOrder={3}>
            <meshStandardMaterial color={display.colors.wall} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} roughness={0.6} />
          </mesh>
        ))}
      {display.showWall && model.carinaSphere && (
        <mesh position={model.carinaSphere.center} renderOrder={3}>
          <sphereGeometry args={[model.carinaSphere.radius, 24, 16]} />
          <meshStandardMaterial color={display.colors.wall} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Animation clock shared by the balloons, struts and pressure readout. `t` runs 0 → 1 over one
 * stage; balloons inflate over the first part, struts follow the balloon surface, then hold.
 * Purely visual: the end state is always exactly the simulated geometry for the stage.
 */
interface AnimClock {
  t: number;
  start: number;
}
const ANIM_MS = 2000;
const INFLATE_END = 0.72;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Balloon inflation fraction at clock time t. */
const inflation = (t: number) => easeInOut(clamp01(t / INFLATE_END));
/** Struts start moving once the balloon has unfolded enough to touch them. */
const strutFollow = (t: number) => easeInOut(clamp01((t / INFLATE_END - 0.18) / 0.82));

/** Crimped-on-balloon positions for a newly delivered stent (illustrative 0.5 mm radius). */
function crimpedPositions(st: SimStent): Float32Array {
  const P = st.mesh.positions;
  const out = new Float32Array(P.length);
  for (let i = 0; i < st.mesh.u.length; i++) {
    const c = st.path.point(st.mesh.u[i]);
    const dx = P[i * 3] - c[0];
    const dy = P[i * 3 + 1] - c[1];
    const dz = P[i * 3 + 2] - c[2];
    const k = 0.5 / Math.max(1e-6, Math.hypot(dx, dy, dz));
    out[i * 3] = c[0] + dx * k;
    out[i * 3 + 1] = c[1] + dy * k;
    out[i * 3 + 2] = c[2] + dz * k;
  }
  return out;
}

function StentMesh({ st, from, clock, color, strutScale }: { st: SimStent; from: Float32Array | null; clock: React.MutableRefObject<AnimClock>; color: string; strutScale: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = st.mesh.edges.length / 2;
  const work = useMemo(() => new Float32Array(st.mesh.positions.length), [st.mesh.positions]);
  const lastE = useRef(1);
  const write = (P: Float32Array) => {
    const im = ref.current;
    if (!im) return;
    const E = st.mesh.edges;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const mtx = new THREE.Matrix4();
    const s = new THREE.Vector3();
    const radius = (st.thickness.micrometres / 1000 / 2) * strutScale;
    for (let i = 0; i < count; i++) {
      a.fromArray(P, E[i * 2] * 3);
      b.fromArray(P, E[i * 2 + 1] * 3);
      dir.subVectors(b, a);
      const L = dir.length();
      q.setFromUnitVectors(UP, L > 0 ? dir.normalize() : UP);
      s.set(radius * 2, L + radius, radius * 2);
      mtx.compose(mid.addVectors(a, b).multiplyScalar(0.5), q, s);
      im.setMatrixAt(i, mtx);
    }
    im.instanceMatrix.needsUpdate = true;
  };
  const frame = (e: number) => {
    const to = st.mesh.positions;
    if (!from || from.length !== to.length || e >= 1) return write(to);
    for (let i = 0; i < to.length; i++) work[i] = from[i] + (to[i] - from[i]) * e;
    write(work);
  };
  useLayoutEffect(() => {
    const e = strutFollow(clock.current.t);
    lastE.current = e;
    frame(e);
    ref.current?.computeBoundingSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, count, strutScale, from]);
  useFrame(() => {
    const e = strutFollow(clock.current.t);
    if (e === lastE.current) return;
    lastE.current = e;
    frame(e);
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} renderOrder={1} frustumCulled={false}>
      <cylinderGeometry args={[0.5, 0.5, 1, 6, 1]} />
      <meshStandardMaterial color={color} metalness={0.75} roughness={0.32} />
    </instancedMesh>
  );
}

const DEFLATED_R = 0.42;
const RADIAL = 36;

/** Balloon on its catheter: a folded (three-wing) deflated profile that unfolds to the labelled diameter. */
function BalloonMesh({ b, color, clock }: { b: Balloon; color: string; clock: React.MutableRefObject<AnimClock> }) {
  const R = b.diameter / 2;
  const built = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(b.axis.map((p) => new THREE.Vector3(...p)));
    const tubular = Math.max(16, b.axis.length * 2);
    const geo = new THREE.TubeGeometry(curve, tubular, R, RADIAL, false);
    const full = (geo.getAttribute('position').array as Float32Array).slice();
    const folded = new Float32Array(full.length);
    const c = new THREE.Vector3();
    for (let i = 0; i <= tubular; i++) {
      curve.getPointAt(i / tubular, c);
      // taper the wings toward the balloon ends, like a folded balloon on its shaft
      const edge = Math.min(i, tubular - i) / tubular;
      const taper = 0.55 + 0.45 * clamp01(edge * 8);
      for (let j = 0; j <= RADIAL; j++) {
        const k = (i * (RADIAL + 1) + j) * 3;
        const th = (j / RADIAL) * Math.PI * 2;
        const rr = Math.min(R, DEFLATED_R) * taper * (0.78 + 0.22 * Math.cos(3 * th));
        const f = rr / R;
        folded[k] = c.x + (full[k] - c.x) * f;
        folded[k + 1] = c.y + (full[k + 1] - c.y) * f;
        folded[k + 2] = c.z + (full[k + 2] - c.z) * f;
      }
    }
    const shaft = new THREE.TubeGeometry(curve, tubular, 0.2, 10, false);
    const tangentAt = (u: number) => ({ p: curve.getPointAt(u), t: curve.getTangentAt(u) });
    const markers = [tangentAt(Math.min(0.5, 1 / b.length)), tangentAt(Math.max(0.5, 1 - 1 / b.length))].map(({ p, t }) => ({
      p: p.toArray() as Vec3,
      q: new THREE.Quaternion().setFromUnitVectors(UP, t.normalize()),
    }));
    return { geo, full, folded, shaft, markers };
  }, [b, R]);
  useEffect(
    () => () => {
      built.geo.dispose();
      built.shaft.dispose();
    },
    [built],
  );
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const caps = useRef<(THREE.Mesh | null)[]>([]);
  const last = useRef(-1);
  const apply = (e: number) => {
    const pos = built.geo.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const { full, folded } = built;
    for (let i = 0; i < arr.length; i++) arr[i] = folded[i] + (full[i] - folded[i]) * e;
    pos.needsUpdate = true;
    built.geo.computeVertexNormals();
    if (mat.current) mat.current.opacity = 0.75 - 0.33 * e;
    const s = (Math.min(R, DEFLATED_R) * 0.8 + (R - Math.min(R, DEFLATED_R) * 0.8) * e) / R;
    caps.current.forEach((m) => m?.scale.setScalar(s));
  };
  useLayoutEffect(() => {
    last.current = inflation(clock.current.t);
    apply(last.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);
  useFrame(() => {
    const e = inflation(clock.current.t);
    if (e === last.current) return;
    last.current = e;
    apply(e);
  });
  return (
    <group>
      <mesh geometry={built.shaft}>
        <meshStandardMaterial color="#c9d3df" metalness={0.2} roughness={0.5} />
      </mesh>
      {built.markers.map((m, i) => (
        <mesh key={i} position={m.p} quaternion={m.q}>
          <cylinderGeometry args={[0.26, 0.26, 0.7, 14]} />
          <meshStandardMaterial color="#3a4352" metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
      <mesh geometry={built.geo} renderOrder={2}>
        <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={0.18} transparent opacity={0.42} depthWrite={false} side={THREE.DoubleSide} roughness={0.35} />
      </mesh>
      {[b.axis[0], b.axis[b.axis.length - 1]].map((p, i) => (
        <mesh key={i} position={p} ref={(m) => (caps.current[i] = m)}>
          <sphereGeometry args={[R, 24, 14]} />
          <meshStandardMaterial color={color} transparent opacity={0.2} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Advances the clock each frame and writes the pressure readout without re-rendering React. */
function AnimDriver({ clock, hud, applied }: { clock: React.MutableRefObject<AnimClock>; hud: React.RefObject<HTMLDivElement>; applied: AppliedBalloon[] }) {
  useFrame(() => {
    const c = clock.current;
    if (c.t < 1) c.t = clamp01((performance.now() - c.start) / ANIM_MS);
    const el = hud.current;
    if (!el) return;
    if (!applied.length) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    const e = inflation(c.t);
    const txt = applied.map((a) => `${a.label}: ${a.pressure == null ? 'pressure not set' : `${Math.round(a.pressure * e)} atm`}`).join('\n');
    if (el.textContent !== txt) el.textContent = txt;
  });
  return null;
}

function Wire({ pts }: { pts: Vec3[] }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(curve, 120, 0.035, 6, false);
  }, [pts]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#000000" metalness={0.3} roughness={0.35} />
    </mesh>
  );
}

export function presetCamera(m: BifurcationModel, preset: ViewPreset): { pos: Vec3; target: Vec3 } {
  const midProx = m.mvPoint((m.lesions.prox[0] + m.lesions.prox[1]) / 2);
  const midDist = m.mvPoint(Math.min(m.sMax - 4, (m.lesions.dist[0] + m.lesions.dist[1]) / 2 + 2));
  switch (preset) {
    case 'proximal':
      return { target: midProx, pos: add(midProx, [-5, 5, 13]) };
    case 'distal':
      return { target: midDist, pos: add(midDist, [5, 5, 13]) };
    case 'sb': {
      const t = m.sbPoint(m.tOstium + Math.max(3, m.anatomy.lesionSB / 2 + 2));
      return { target: t, pos: add(t, add(scale(m.nC, -6), [0, 0, 13])) };
    }
    case 'carina': {
      const bis = norm(add([1, 0, 0], m.d));
      return { target: m.carinaPoint, pos: add(m.carinaPoint, add(scale(bis, 11), [0, 0, 5])) };
    }
    case 'ostium':
      return { target: m.sbPoint(0), pos: m.sbPoint(m.tOstium + 14) };
    default: {
      const sbEnd = m.sbPoint(m.sbLength);
      const minX = Math.min(m.sMin, sbEnd[0]);
      const maxX = Math.max(m.sMax, sbEnd[0]);
      const maxY = Math.max(sbEnd[1], m.rP);
      const t: Vec3 = [(minX + maxX) / 2, (maxY - m.rP) / 2, 0];
      const span = Math.max(maxX - minX, (maxY + m.rP) * 1.6);
      return { target: t, pos: [t[0], t[1] + span * 0.12, span * 0.95] };
    }
  }
}

function CameraRig({ model, preset, nonce }: { model: BifurcationModel; preset: ViewPreset; nonce: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    const { pos, target } = presetCamera(model, preset);
    const aspect = (camera as THREE.PerspectiveCamera).aspect || 1.5;
    const k = preset === 'overview' ? Math.max(1, 1.45 / aspect) : Math.max(1, 1.0 / aspect);
    camera.position.set(target[0] + (pos[0] - target[0]) * k, target[1] + (pos[1] - target[1]) * k, target[2] + (pos[2] - target[2]) * k);
    camera.up.set(0, 1, 0);
    if (controls) {
      controls.target.set(...target);
      controls.update();
    } else camera.lookAt(...target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, nonce, controls]);
  return null;
}

function CaptureHook({ onReady }: { onReady?: (capture: () => string | null) => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    onReady?.(() => {
      try {
        gl.render(scene, camera);
        return gl.domElement.toDataURL('image/png');
      } catch {
        return null;
      }
    });
  }, [gl, scene, camera, onReady]);
  return null;
}

function Label({ at, text }: { at: Vec3; text: string }) {
  return (
    <Html position={at} center zIndexRange={[10, 0]}>
      <div className="mlabel">{text}</div>
    </Html>
  );
}

export interface Viewer3DProps {
  model: BifurcationModel;
  sim: SimResult;
  metrics?: Metric[];
  display: DisplaySettings;
  preset: ViewPreset;
  presetNonce: number;
  compact?: boolean;
  onCaptureReady?: (capture: () => string | null) => void;
  /** Geometry at the previous stage; when given, the stage's inflation is animated from it. */
  prevSim?: SimResult | null;
  /** Changing this replays the stage animation (stage, scenario or an explicit replay). */
  animToken?: string;
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Viewer3D({ model, sim, metrics, display, preset, presetNonce, compact, onCaptureReady, prevSim, animToken }: Viewer3DProps) {
  const animate = !compact && !!prevSim;
  const clock = useRef<AnimClock>({ t: 1, start: 0 });
  const hud = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!animate || reducedMotion()) clock.current = { t: 1, start: 0 };
    else clock.current = { t: 0, start: performance.now() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animToken]);
  const fromFor = useMemo(() => {
    const map = new Map<SimStent, Float32Array | null>();
    for (const st of sim.stents) {
      if (!animate) {
        map.set(st, null);
        continue;
      }
      const prev = prevSim!.stents.find((p) => p.key === st.key && p.mesh.positions.length === st.mesh.positions.length);
      map.set(st, prev ? prev.mesh.positions : st.deployedAtStage === sim.stageIndex ? crimpedPositions(st) : null);
    }
    return map;
  }, [sim, prevSim, animate]);
  const applied = useMemo(() => (animate ? sim.applied.filter((x) => x.stage === sim.stageIndex) : []), [sim, animate]);
  const mv = (id: string) => metrics?.find((x) => x.id === id)?.value ?? null;
  const proxD = mv('prox-d');
  const distD = mv('dist-d');
  const free = mv('ostial-free');
  const a = model.anatomy;
  return (
    <div className={`canvas-wrap${compact ? ' compact' : ''}`}>
      <Canvas
        camera={{ fov: 38, near: 0.05, far: 600, position: [0, 3, 50] }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        dpr={[1, 2]}
        style={{ background: display.colors.background }}
        aria-label="Interactive 3D model of the coronary bifurcation"
      >
        <color attach="background" args={[display.colors.background]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[10, 20, 25]} intensity={1.6} />
        <directionalLight position={[-15, -10, -20]} intensity={0.5} />
        <Vessel model={model} display={display} />
        {display.showStent && sim.stents.map((st, i) => <StentMesh key={`${st.key}-${i}`} st={st} from={fromFor.get(st) ?? null} clock={clock} color={i === 0 ? display.colors.stent : display.colors.stent2} strutScale={display.strutScale} />)}
        {display.showBalloons && sim.activeBalloons.map((b) => <BalloonMesh key={b.id} b={b} clock={clock} color={display.colors.balloon} />)}
        <AnimDriver clock={clock} hud={hud} applied={applied} />
        {display.showWires && sim.wires.map((w, i) => <Wire key={i} pts={w} />)}
        {display.showMeasurements && !compact && (
          <group>
            <Label at={add(model.mvPoint(model.lesions.prox[0] - 1), [0, -model.rP - 1.6, 0])} text={`PMV ref ${a.dPMV.toFixed(2)} mm${proxD != null ? ` · stent ${proxD.toFixed(2)}` : ''}`} />
            <Label at={add(model.mvPoint(model.lesions.dist[1] + 1), [0, -model.rD - 1.6, 0])} text={`DMV ref ${a.dDMV.toFixed(2)} mm${distD != null ? ` · stent ${distD.toFixed(2)}` : ''}`} />
            <Label at={add(model.sbPoint(model.sbLength - 3), scale(model.nC, -model.rS - 2.2))} text={`SB ref ${a.dSB.toFixed(2)} mm`} />
            <Label at={add(model.mvPoint(model.xCarina), [0, -model.rD - 3.2, 0])} text={`Angle ${a.angleDeg}°${free != null ? ` · ostial free Ø ${free.toFixed(2)} mm` : ''}`} />
          </group>
        )}
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={2} maxDistance={200} />
        <CameraRig model={model} preset={preset} nonce={presetNonce} />
        <CaptureHook onReady={onCaptureReady} />
      </Canvas>
      <div className="mode-banner" aria-live="polite">
        <span>Mode A · illustrative geometry{sim.deformationBasis === 'illustrative' ? ' and deformation' : ''}</span>
      </div>
      {animate && <div className="pressure-hud" ref={hud} title="Recorded inflation pressure, shown for timing only. Balloons are drawn at their labelled diameter; pressure is never converted into a diameter." />}
      {!compact && (
        <div className="legend" aria-hidden="true">
          <span><i style={{ background: display.colors.wall }} />Vessel wall</span>
          <span><i style={{ background: display.colors.plaque }} />Plaque</span>
          <span><i style={{ background: display.colors.stent }} />{sim.stents[0]?.label ?? 'Stent'}</span>
          {sim.stents[1] && <span><i style={{ background: display.colors.stent2 }} />{sim.stents[1].label}</span>}
          <span><i style={{ background: display.colors.balloon }} />Balloon</span>
          {model.anatomy.plaqueEnabled && display.showPlaque && <span title="Plaque displacement is not modelled">Plaque = pre-PCI lumen</span>}
        </div>
      )}
    </div>
  );
}
