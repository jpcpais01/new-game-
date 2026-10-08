import {
  BoxGeometry, BufferGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, IcosahedronGeometry,
  LatheGeometry, OctahedronGeometry, Shape, SphereGeometry, TorusGeometry, Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Cached authoring geometry for fighters and gear. Shapes are built once and
 * shared; the rig bakes transformed copies, so caching is purely to save time
 * when fighters are rebuilt (loadout changes, character creator preview).
 */

const geoCache = new Map<string, BufferGeometry>();
function geo<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g as T;
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export const capsule = (r: number, len: number) => geo(`cap${r}:${len}`, () => new CapsuleGeometry(r, len, 4, 12));
export const sphere = (r: number, w = 16, h = 12) => geo(`sph${r}:${w}:${h}`, () => new SphereGeometry(r, w, h));
export const halfSphere = (r: number) => geo(`hsph${r}`, () => new SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
export const box = (x: number, y: number, z: number) => geo(`box${x}:${y}:${z}`, () => new BoxGeometry(x, y, z));
export const rbox = (x: number, y: number, z: number, r = 0.02) => geo(`rbox${x}:${y}:${z}:${r}`, () => new RoundedBoxGeometry(x, y, z, 2, Math.min(r, x / 2.01, y / 2.01, z / 2.01)));
export const cyl = (rt: number, rb: number, h: number, s = 14, open = false) =>
  geo(`cyl${rt}:${rb}:${h}:${s}:${open}`, () => new CylinderGeometry(rt, rb, h, s, 1, open));
export const cone = (r: number, h: number, s = 12) => geo(`cone${r}:${h}:${s}`, () => new ConeGeometry(r, h, s));
export const torus = (r: number, t: number, arc = Math.PI * 2, rs = 8, ts = 22) => geo(`tor${r}:${t}:${arc}:${rs}:${ts}`, () => new TorusGeometry(r, t, rs, ts, arc));
export const ico = (r: number, d = 0) => geo(`ico${r}:${d}`, () => new IcosahedronGeometry(r, d));
export const octa = (r: number) => geo(`oct${r}`, () => new OctahedronGeometry(r, 0));

/** Revolved profile: points are [radius, y]. */
export function lathe(key: string, pts: [number, number][], seg = 18): LatheGeometry {
  return geo(`lathe${key}`, () => new LatheGeometry(pts.map(([r, y]) => new Vector2(Math.max(0.0005, r), y)), seg));
}

/** Tapered limb segment hanging down from its joint (length along -Y). */
export const limb = (r0: number, r1: number, len: number) => geo(`limb${r0}:${r1}:${len}`, () => {
  const g = new CylinderGeometry(r1, r0, len, 14, 4, false);
  g.translate(0, -len / 2, 0);
  return g;
});

/**
 * Smooth organic limb hanging from its joint along -Y, closed at both ends.
 * `profile` is [t, radius] with t = 0 at the joint and 1 at the far end; it is
 * resampled into evenly spaced rings so skinning bends it smoothly.
 */
export function organ(len: number, profile: [number, number][], rings = 10, seg = 14): LatheGeometry {
  const key = `organ${r4(len)}:${profile.map(([t, r]) => `${r4(t)},${r4(r)}`).join(';')}:${rings}:${seg}`;
  return geo(key, () => {
    const at = (t: number) => {
      for (let i = 1; i < profile.length; i++) {
        const [t1, r1] = profile[i];
        const [t0, r0] = profile[i - 1];
        if (t <= t1) {
          const k = (t - t0) / Math.max(1e-6, t1 - t0);
          const s = k * k * (3 - 2 * k);
          return r0 + (r1 - r0) * s;
        }
      }
      return profile[profile.length - 1][1];
    };
    const pts: Vector2[] = [];
    const r0 = at(0), r1 = at(1);
    // Rounded caps: a quarter circle at each end so silhouettes stay soft.
    const cap = 3;
    for (let i = cap; i >= 1; i--) {
      const a = (i / cap) * (Math.PI / 2);
      pts.push(new Vector2(Math.max(0.0005, Math.cos(a) * r0), Math.sin(a) * r0 * 0.6));
    }
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      pts.push(new Vector2(at(t), -t * len));
    }
    for (let i = 1; i <= cap; i++) {
      const a = (i / cap) * (Math.PI / 2);
      pts.push(new Vector2(Math.max(0.0005, Math.cos(a) * r1), -len - Math.sin(a) * r1 * 0.6));
    }
    // Lathe winds clockwise when the profile runs top to bottom; flip so faces point outwards.
    pts.reverse();
    return new LatheGeometry(pts, seg);
  });
}

/** Blade along +Y, broad side in X, optionally curved towards +X. */
export function blade(len: number, width: number, thick: number, curve = 0, tip = 0.18): BufferGeometry {
  return geo(`blade${len}:${width}:${thick}:${curve}:${tip}`, () => {
    const s = new Shape();
    const tipLen = len * tip;
    s.moveTo(-width / 2, 0);
    s.lineTo(width / 2, 0);
    s.lineTo(width / 2, len - tipLen);
    s.lineTo(width * 0.1, len);
    s.lineTo(-width / 2, len - tipLen * 0.4);
    s.lineTo(-width / 2, 0);
    const g = new ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: Math.min(width * 0.18, 0.012), bevelSegments: 1, steps: 1, curveSegments: 1 });
    g.translate(0, 0, -thick / 2);
    if (curve) {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / len;
        p.setX(i, p.getX(i) + curve * y * y);
      }
      g.computeVertexNormals();
    }
    return g;
  });
}

/** Heater shield outline extruded with a bevel. Face points -Z. */
export const heater = (k = 1) => geo(`heater${k}`, () => {
  const s = new Shape();
  s.moveTo(-0.3 * k, 0.36 * k);
  s.lineTo(0.3 * k, 0.36 * k);
  s.quadraticCurveTo(0.32 * k, -0.08 * k, 0, -0.44 * k);
  s.quadraticCurveTo(-0.32 * k, -0.08 * k, -0.3 * k, 0.36 * k);
  const g = new ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 8 });
  g.rotateY(Math.PI);
  return g;
});
export const heaterInner = (k = 1) => geo(`heaterIn${k}`, () => {
  const s = new Shape();
  s.moveTo(-0.22 * k, 0.28 * k);
  s.lineTo(0.22 * k, 0.28 * k);
  s.quadraticCurveTo(0.24 * k, -0.06 * k, 0, -0.33 * k);
  s.quadraticCurveTo(-0.24 * k, -0.06 * k, -0.22 * k, 0.28 * k);
  const g = new ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false, curveSegments: 8 });
  g.rotateY(Math.PI);
  return g;
});

/** Flat star (sun emblem / charms), facing +Z, extruded thinly. */
export const star = (points: number, r0: number, r1: number, depth = 0.02) => geo(`star${points}:${r0}:${r1}:${depth}`, () => {
  const s = new Shape();
  for (let i = 0; i <= points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r0;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false });
});

export const gearGeo = { sphere, halfSphere, box, cone, torus, cyl, ico, capsule, octa, star, rbox, lathe, limb, organ, blade, heater, heaterInner };
