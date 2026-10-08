import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, ExtrudeGeometry, LatheGeometry, Shape, TubeGeometry, Vector2,
  Vector3, type Object3D,
} from 'three';
import type { PartSpec } from '../../meshBuilder';
import { part, type PartOpts } from '../kit';

// -----------------------------------------------------------------------------
// Extra authoring kit for skin models: faceted blades with a real ridge,
// tapered tubes through any 3D path (horns, roots, vines, cracks), cut
// crystals, leaves and gradient paints. Like the base kit, everything is
// geometry merged into the fighter bake, so detail costs vertices only.
// -----------------------------------------------------------------------------

const cache = new Map<string, BufferGeometry>();
function geo<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = cache.get(key);
  if (!g) { g = make(); cache.set(key, g); }
  return g as T;
}

/** Splits shared vertices so every face shades flat: crisp facets on metal and crystal. */
function faceted(g: BufferGeometry): BufferGeometry {
  const f = g.index ? g.toNonIndexed() : g;
  f.computeVertexNormals();
  return f;
}

/**
 * A blade row: height, left edge x, right edge x, and optionally the ridge x
 * (defaults to the middle) and a thickness multiplier.
 */
export type BladeRow = [y: number, left: number, right: number, ridge?: number, thick?: number];

/**
 * Faceted blade with a diamond cross-section: each row joins its two cutting
 * edges to a raised ridge on both faces, so light breaks along the ridge the
 * way it does on forged steel. Rows go from the guard (first) to the tip.
 * `curve` bends the blade towards +X with the square of the height.
 */
export function edgeBlade(key: string, rows: BladeRow[], thick: number, curve = 0): BufferGeometry {
  return geo(`eb${key}:${thick}:${curve}`, () => {
    const len = rows[rows.length - 1][0] || 1;
    const pos: number[] = [];
    const ring = rows.map(([y, l, r, ridge, tk]) => {
      const cx = ridge ?? (l + r) / 2;
      const t = thick * (tk ?? 1) * Math.min(1, (r - l) / 0.05 + 0.15);
      const b = curve * (y / len) * (y / len);
      return [[l + b, y, 0], [cx + b, y, t], [r + b, y, 0], [cx + b, y, -t]];
    });
    const quad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < ring.length - 1; i++) {
      const A = ring[i], B = ring[i + 1];
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        quad(A[k], A[k2], B[k2], B[k]);
      }
    }
    // Close the base so the blade looks solid where it meets the guard.
    const b0 = ring[0];
    quad(b0[0], b0[3], b0[2], b0[1]);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.computeVertexNormals();
    return g;
  });
}

/** Rows for a straight blade from a half-width function over [0, len] (tip at len). */
export function rowsOf(len: number, n: number, halfWidth: (t: number) => number, skew = 0): BladeRow[] {
  const rows: BladeRow[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = i === n ? 0 : halfWidth(t);
    rows.push([t * len, -w + skew * t, w + skew * t]);
  }
  return rows;
}

/**
 * Tube through 3D points (Catmull-Rom), tapering from r0 to r1. Horns, roots,
 * vines, chains of embers and glowing cracks.
 */
export function tube(key: string, pts: [number, number, number][], r0: number, r1: number, seg = 16, sides = 7): BufferGeometry {
  return geo(`tb${key}:${r0}:${r1}:${seg}:${sides}`, () => {
    const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)));
    const g = new TubeGeometry(curve, seg, 1, sides, false);
    const p = g.getAttribute('position');
    const c = new Vector3();
    // TubeGeometry lays out (seg + 1) rings of (sides + 1) vertices around unit radius.
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      curve.getPointAt(t, c);
      const r = r0 + (r1 - r0) * t;
      for (let j = 0; j <= sides; j++) {
        const k = i * (sides + 1) + j;
        p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
      }
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Cut crystal: a faceted bipyramid with a long point, base at y=0. */
export function crystal(r: number, len: number, sides = 6, base = 0.18): BufferGeometry {
  return geo(`cr${r}:${len}:${sides}:${base}`, () => faceted(new LatheGeometry([
    new Vector2(0, -len * base * 0.4), new Vector2(r, len * base), new Vector2(r * 0.82, len * 0.72), new Vector2(0, len),
  ], sides)));
}

/** Faceted revolved profile (points are [radius, y], in either direction). */
export function facetLathe(key: string, pts: [number, number][], sides = 8): BufferGeometry {
  // Lathe faces point outwards only when the profile runs upwards.
  const up = pts[pts.length - 1][1] >= pts[0][1] ? pts : [...pts].reverse();
  return geo(`fl${key}:${sides}`, () => faceted(new LatheGeometry(up.map(([r, y]) => new Vector2(r, y)), sides)));
}

/** Leaf in the XY plane (stem at the origin, tip at +Y), cupped slightly towards +Z. */
export function leaf(len: number, w: number, cup = 0.25): BufferGeometry {
  return geo(`lf${len}:${w}:${cup}`, () => {
    const s = new Shape();
    s.moveTo(0, 0);
    s.quadraticCurveTo(w * 1.1, len * 0.35, 0, len);
    s.quadraticCurveTo(-w * 1.1, len * 0.35, 0, 0);
    const g = new ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false, curveSegments: 5 });
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / Math.max(1e-4, w);
      p.setZ(i, p.getZ(i) + cup * w * x * x - cup * 0.4 * len * (p.getY(i) / len) ** 2);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Extruded outline with crisp flat facets (plates, feathers, panels). */
export function plate(key: string, pts: [number, number][], depth: number, bevel = 0.006): BufferGeometry {
  return geo(`pl${key}:${depth}:${bevel}`, () => {
    const s = new Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    return faceted(g);
  });
}

/** Regular star / gear outline for `plate` (n points between radii r0 and r1). */
export function starPts(n: number, r0: number, r1: number, rot = Math.PI / 2): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r0 : r1;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

// --- paints -------------------------------------------------------------------

const _a = new Color(), _b = new Color();

/** Spec painted with a gradient along one local axis (molten blades, frosted tips, dusk cloth). */
export function grad(c0: number, c1: number, from: number, to: number, base: Partial<PartSpec> = {}, axis: 'x' | 'y' | 'z' = 'y'): PartSpec {
  const paint = (p: Vector3) => {
    const t = Math.min(1, Math.max(0, (p[axis] - from) / (to - from || 1)));
    return _a.setHex(c0).lerp(_b.setHex(c1), t).getHex();
  };
  return { color: c0, ...base, paint } as PartSpec;
}

/** Three-stop gradient (hot core → mid → cool rim). */
export function grad3(c0: number, c1: number, c2: number, from: number, to: number, base: Partial<PartSpec> = {}, axis: 'x' | 'y' | 'z' = 'y'): PartSpec {
  const paint = (p: Vector3) => {
    const t = Math.min(1, Math.max(0, (p[axis] - from) / (to - from || 1)));
    return t < 0.5 ? _a.setHex(c0).lerp(_b.setHex(c1), t * 2).getHex() : _a.setHex(c1).lerp(_b.setHex(c2), t * 2 - 1).getHex();
  };
  return { color: c0, ...base, paint } as PartSpec;
}

/** Scatter of tiny star points painted on cloth (void starfields). */
export function starry(base: number, star: number, density = 0.06, seed = 1): PartSpec {
  const paint = (p: Vector3) => {
    const h = Math.abs(Math.sin(p.x * 127.1 * seed + p.y * 311.7 + p.z * 74.7) * 43758.5) % 1;
    return h < density ? star : base;
  };
  return { color: base, paint } as PartSpec;
}

export const glowSpec = (color: number, glow = 2.2): PartSpec => ({ color, glow });

/**
 * Hood-like shell: a sphere with a wedge cut out of its +X side (closed at the
 * crown, widening to `gap` radians each side at the hem) and open below
 * `thetaMax`. It has an inner lining so the opening never shows through.
 */
export function hoodShell(key: string, r: number, gap: number, thetaMax: number, lining = 0.94): BufferGeometry {
  return geo(`hood${key}`, () => {
    const rows = 12, cols = 22;
    const pos: number[] = [];
    const nor: number[] = [];
    const at = (u: number, v: number, k: number) => {
      const th = v * thetaMax;
      // The cut widens from nothing at the crown to the full gap at the hem.
      const g = gap * Math.min(1, th / (thetaMax * 0.45));
      const ph = g + u * (Math.PI * 2 - 2 * g);
      const x = Math.cos(ph) * Math.sin(th), y = Math.cos(th), z = Math.sin(ph) * Math.sin(th);
      return [x * r * k, y * r * k, z * r * k, x, y, z];
    };
    const quad = (k: number, flip: boolean) => {
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const a = at(i / cols, j / rows, k), b = at((i + 1) / cols, j / rows, k);
        const c = at((i + 1) / cols, (j + 1) / rows, k), d = at(i / cols, (j + 1) / rows, k);
        const tris = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
        for (const v of tris) { pos.push(v[0], v[1], v[2]); nor.push(flip ? -v[3] : v[3], flip ? -v[4] : v[4], flip ? -v[5] : v[5]); }
      }
    };
    quad(1, true);
    quad(lining, false);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    return g;
  });
}

/** Mirror image of a geometry across one axis, with its faces turned the right way out. */
export function mirror(g: BufferGeometry, axis: 'x' | 'y' | 'z' = 'z'): BufferGeometry {
  const key = `${g.uuid}:${axis}`;
  return geo(`mir${key}`, () => {
    const f = (g.index ? g.toNonIndexed() : g.clone());
    const p = f.getAttribute('position');
    const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    for (let v = 0; v < p.count; v++) p.setComponent(v, i, -p.getComponent(v, i));
    // Swap two corners of every triangle so the winding stays front-facing.
    for (let t = 0; t < p.count; t += 3) {
      for (let c = 0; c < 3; c++) {
        const a = p.getComponent(t + 1, c);
        p.setComponent(t + 1, c, p.getComponent(t + 2, c));
        p.setComponent(t + 2, c, a);
      }
    }
    f.deleteAttribute('uv');
    f.deleteAttribute('normal');
    f.computeVertexNormals();
    return f;
  });
}

/**
 * Adds a part and its mirror image across the X or Z plane (left and right
 * horns, quillons, pauldron spikes). The mirror flips the geometry itself, so
 * asymmetric shapes like curved tubes come out as true pairs.
 */
export function pair(parent: Object3D, g: BufferGeometry, spec: PartSpec | number, o: PartOpts = {}, axis: 'x' | 'z' = 'z'): void {
  part(parent, g, spec, o);
  const pos = o.pos ? [...o.pos] as [number, number, number] : [0, 0, 0] as [number, number, number];
  const rot = o.rot ? [...o.rot] as [number, number, number] : [0, 0, 0] as [number, number, number];
  if (axis === 'z') { pos[2] = -pos[2]; rot[0] = -rot[0]; rot[1] = -rot[1]; }
  else { pos[0] = -pos[0]; rot[1] = -rot[1]; rot[2] = -rot[2]; }
  part(parent, mirror(g, axis), spec, { pos, rot, scale: o.scale });
}
