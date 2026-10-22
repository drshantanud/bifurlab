/**
 * BalloonGeometry: balloons are modelled as rigid cylinders of their nominal labelled diameter
 * swept along a centreline. Pressure–diameter compliance is NOT modelled.
 * Contact rule (illustrative): any strut point inside an inflated balloon is moved radially
 * to the balloon surface. Struts never recoil, and the vessel wall does not constrain them.
 */
import { type Vec3, add, scale, sub, cumulativeLengths, closestOnPolyline, catmullRom } from './math';

export interface Balloon {
  id: string;
  label: string;
  diameter: number;
  /** Dense centreline */
  axis: Vec3[];
  cum: number[];
  length: number;
  /** Position in a series of sequential inflations of one balloon (e.g. repeated POT), if more than one. */
  step?: { index: number; count: number };
}

export function makeBalloon(id: string, label: string, diameter: number, ctrlOrAxis: Vec3[], smooth = false): Balloon {
  const axis = smooth ? catmullRom(ctrlOrAxis, 10) : ctrlOrAxis;
  const cum = cumulativeLengths(axis);
  return { id, label, diameter, axis, cum, length: cum[cum.length - 1] };
}

/** Push strut points out of the balloons. Returns how many points of each [start,end) range moved. */
export function applyBalloons(positions: Float32Array, balloons: Balloon[], iterations = balloons.length > 1 ? 4 : 1): Uint8Array {
  const moved = new Uint8Array(positions.length / 3);
  const capMargin = 0.1;
  for (let it = 0; it < iterations; it++) {
    for (const b of balloons) {
      const r = b.diameter / 2;
      for (let i = 0; i < positions.length; i += 3) {
        const p: Vec3 = [positions[i], positions[i + 1], positions[i + 2]];
        const c = closestOnPolyline(b.axis, b.cum, p);
        if (c.u <= capMargin || c.u >= b.length - capMargin) continue;
        if (c.d < r - 1e-6 && c.d > 1e-9) {
          const q = add(c.q, scale(sub(p, c.q), r / c.d));
          positions[i] = q[0];
          positions[i + 1] = q[1];
          positions[i + 2] = q[2];
          moved[i / 3] = 1;
        }
      }
    }
  }
  return moved;
}
