/**
 * A tiny signed-distance-field modelling kit for sculpting fighters.
 *
 * Bodies, heads and hair are described as trees of smooth primitives (round
 * cones, ellipsoids, rounded boxes) blended with smooth unions, carved with
 * smooth subtractions and wrapped with shells, so muscles flow into each other
 * and clothing hugs the body instead of intersecting it. The mesher
 * (mesher.ts) turns a tree into a skinned-ready triangle mesh once and caches
 * it, so none of this runs per frame.
 *
 * Every node reports a distance and, through the module-level `MAT` register,
 * the material of the surface that won at that point. Materials are small
 * integers the caller maps to colours later, so one sculpt serves every
 * outfit colour.
 */

/** Material id of the last evaluated point (set by leaves, kept by ops). */
export let MAT = 0;
/** Lets ops override the material register. */
function setMat(m: number): void { MAT = m; }

export type Vec3 = [number, number, number];

const INF = 1e9;

/** Distance from a point to an AABB (0 inside). Lower bound for any surface inside it. */
function boxDist(bb: Float64Array, x: number, y: number, z: number): number {
  return Math.sqrt(boxDist2(bb, x, y, z));
}
function boxDist2(bb: Float64Array, x: number, y: number, z: number): number {
  const dx = x < bb[0] ? bb[0] - x : x > bb[3] ? x - bb[3] : 0;
  const dy = y < bb[1] ? bb[1] - y : y > bb[4] ? y - bb[4] : 0;
  const dz = z < bb[2] ? bb[2] - z : z > bb[5] ? z - bb[5] : 0;
  return dx * dx + dy * dy + dz * dz;
}

export abstract class Sdf {
  /** World-space bounds of the zero set (minX, minY, minZ, maxX, maxY, maxZ). */
  readonly bb = new Float64Array(6);
  abstract d(x: number, y: number, z: number): number;
  /**
   * A copy of this tree reduced to what can matter inside the box
   * (lo..hi), or null when nothing does. Used per meshing block so each
   * point only evaluates the handful of nearby primitives.
   */
  prune(lo: Vec3, hi: Vec3): Sdf | null {
    const b = this.bb;
    return b[0] > hi[0] || b[1] > hi[1] || b[2] > hi[2] || b[3] < lo[0] || b[4] < lo[1] || b[5] < lo[2] ? null : this;
  }
  protected setBB(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const b = this.bb;
    b[0] = x0; b[1] = y0; b[2] = z0; b[3] = x1; b[4] = y1; b[5] = z1;
  }
}

// -----------------------------------------------------------------------------
// Primitives
// -----------------------------------------------------------------------------

/**
 * Cone between two spheres (iq's exact round cone): the workhorse for limbs,
 * muscles, fingers, hair locks and straps. Equal radii make a capsule.
 */
export class RoundCone extends Sdf {
  private readonly ax: number; private readonly ay: number; private readonly az: number;
  private readonly bax: number; private readonly bay: number; private readonly baz: number;
  private readonly l2: number; private readonly rr: number; private readonly a2: number;
  private readonly il2: number;
  constructor(a: Vec3, b: Vec3, private readonly r1: number, private readonly r2: number, readonly m: number) {
    super();
    this.ax = a[0]; this.ay = a[1]; this.az = a[2];
    this.bax = b[0] - a[0]; this.bay = b[1] - a[1]; this.baz = b[2] - a[2];
    this.l2 = Math.max(1e-10, this.bax * this.bax + this.bay * this.bay + this.baz * this.baz);
    this.rr = r1 - r2;
    this.a2 = this.l2 - this.rr * this.rr;
    this.il2 = 1 / this.l2;
    const r = Math.max(r1, r2);
    this.setBB(
      Math.min(a[0] - r1, b[0] - r2), Math.min(a[1] - r1, b[1] - r2), Math.min(a[2] - r1, b[2] - r2),
      Math.max(a[0] + r1, b[0] + r2), Math.max(a[1] + r1, b[1] + r2), Math.max(a[2] + r1, b[2] + r2),
    );
    void r;
  }
  d(px: number, py: number, pz: number): number {
    MAT = this.m;
    const pax = px - this.ax, pay = py - this.ay, paz = pz - this.az;
    const y = pax * this.bax + pay * this.bay + paz * this.baz;
    const z = y - this.l2;
    const xx = pax * this.l2 - this.bax * y, xy = pay * this.l2 - this.bay * y, xz = paz * this.l2 - this.baz * y;
    const x2 = xx * xx + xy * xy + xz * xz;
    const y2 = y * y * this.l2;
    const z2 = z * z * this.l2;
    const k = Math.sign(this.rr) * this.rr * this.rr * x2;
    if (Math.sign(z) * this.a2 * z2 > k) return Math.sqrt(x2 + z2) * this.il2 - this.r2;
    if (Math.sign(y) * this.a2 * y2 < k) return Math.sqrt(x2 + y2) * this.il2 - this.r1;
    return (Math.sqrt(x2 * this.a2 * this.il2) + y * this.rr) * this.il2 - this.r1;
  }
}

export class Sphere extends Sdf {
  constructor(private readonly c: Vec3, private readonly r: number, readonly m: number) {
    super();
    this.setBB(c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r);
  }
  d(x: number, y: number, z: number): number {
    MAT = this.m;
    const dx = x - this.c[0], dy = y - this.c[1], dz = z - this.c[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - this.r;
  }
}

/** Row-major 3x3 rotation from XYZ euler angles (same order as three.js). */
export function rotXYZ(rx: number, ry: number, rz: number): Float64Array {
  const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return new Float64Array([
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c,
  ]);
}

/** Shared helper for oriented primitives: world point -> local frame. */
abstract class Oriented extends Sdf {
  protected readonly cx: number; protected readonly cy: number; protected readonly cz: number;
  /** Inverse rotation (transpose), row-major. */
  protected readonly r: Float64Array;
  constructor(c: Vec3, rot: Vec3 | undefined, ext: Vec3) {
    super();
    this.cx = c[0]; this.cy = c[1]; this.cz = c[2];
    const R = rot ? rotXYZ(rot[0], rot[1], rot[2]) : new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    // Store the transpose so local = R^T (p - c).
    this.r = new Float64Array([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]);
    // Bounds of the rotated local box `ext`.
    let ex = 0, ey = 0, ez = 0;
    for (let i = 0; i < 3; i++) {
      ex += Math.abs(R[i]) * ext[i];
      ey += Math.abs(R[3 + i]) * ext[i];
      ez += Math.abs(R[6 + i]) * ext[i];
    }
    this.setBB(c[0] - ex, c[1] - ey, c[2] - ez, c[0] + ex, c[1] + ey, c[2] + ez);
  }
}

/** Ellipsoid (iq's bound approximation, good near the surface). */
export class Ellipsoid extends Oriented {
  private readonly rx: number; private readonly ry: number; private readonly rz: number;
  constructor(c: Vec3, radii: Vec3, readonly m: number, rot?: Vec3) {
    super(c, rot, radii);
    this.rx = radii[0]; this.ry = radii[1]; this.rz = radii[2];
  }
  d(px: number, py: number, pz: number): number {
    MAT = this.m;
    const qx = px - this.cx, qy = py - this.cy, qz = pz - this.cz;
    const r = this.r;
    const x = r[0] * qx + r[1] * qy + r[2] * qz;
    const y = r[3] * qx + r[4] * qy + r[5] * qz;
    const z = r[6] * qx + r[7] * qy + r[8] * qz;
    const ax = x / this.rx, ay = y / this.ry, az = z / this.rz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = ax / this.rx, by = ay / this.ry, bz = az / this.rz;
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 < 1e-9 ? -Math.min(this.rx, this.ry, this.rz) : k0 * (k0 - 1) / k1;
  }
}

/** Rounded box: half extents and corner radius. */
export class RBox extends Oriented {
  private readonly hx: number; private readonly hy: number; private readonly hz: number;
  constructor(c: Vec3, half: Vec3, private readonly rad: number, readonly m: number, rot?: Vec3) {
    super(c, rot, half);
    this.hx = half[0] - rad; this.hy = half[1] - rad; this.hz = half[2] - rad;
  }
  d(px: number, py: number, pz: number): number {
    MAT = this.m;
    const qx = px - this.cx, qy = py - this.cy, qz = pz - this.cz;
    const r = this.r;
    const x = Math.abs(r[0] * qx + r[1] * qy + r[2] * qz) - this.hx;
    const y = Math.abs(r[3] * qx + r[4] * qy + r[5] * qz) - this.hy;
    const z = Math.abs(r[6] * qx + r[7] * qy + r[8] * qz) - this.hz;
    const ox = Math.max(x, 0), oy = Math.max(y, 0), oz = Math.max(z, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(x, y, z), 0) - this.rad;
  }
}

/** Torus in its local XZ plane (axis +Y). */
export class Torus extends Oriented {
  constructor(c: Vec3, private readonly R: number, private readonly t: number, readonly m: number, rot?: Vec3) {
    super(c, rot, [R + t, t, R + t]);
  }
  d(px: number, py: number, pz: number): number {
    MAT = this.m;
    const qx = px - this.cx, qy = py - this.cy, qz = pz - this.cz;
    const r = this.r;
    const x = r[0] * qx + r[1] * qy + r[2] * qz;
    const y = r[3] * qx + r[4] * qy + r[5] * qz;
    const z = r[6] * qx + r[7] * qy + r[8] * qz;
    const l = Math.sqrt(x * x + z * z) - this.R;
    return Math.sqrt(l * l + y * y) - this.t;
  }
}

/**
 * A lofted trunk: horizontal elliptical (or squarish, p > 2) cross-sections
 * keyed by height and joined with a smooth Catmull-Rom profile. Gives exact
 * control over a silhouette (chest, waist, hips) the way a sculptor blocks a
 * torso in. Keys: [y, centreX, depthRadius, widthRadius]. Ends are rounded.
 */
export class Loft extends Sdf {
  private readonly ys: number[]; private readonly cx: number[]; private readonly ra: number[]; private readonly rb: number[];
  constructor(keys: [number, number, number, number][], readonly m: number, private readonly p = 2) {
    super();
    keys = keys.slice().sort((a, b) => a[0] - b[0]);
    this.ys = keys.map((k) => k[0]); this.cx = keys.map((k) => k[1]);
    this.ra = keys.map((k) => k[2]); this.rb = keys.map((k) => k[3]);
    let ma = 0, mb = 0, x0 = INF, x1 = -INF;
    for (const k of keys) { ma = Math.max(ma, k[2]); mb = Math.max(mb, k[3]); x0 = Math.min(x0, k[1] - k[2]); x1 = Math.max(x1, k[1] + k[2]); }
    this.setBB(x0, this.ys[0] - 0.02, -mb, x1, this.ys[this.ys.length - 1] + 0.02, mb);
  }
  /** Catmull-Rom sample of one channel at height y. */
  private at(c: number[], y: number): number {
    const ys = this.ys, n = ys.length;
    if (y <= ys[0]) return c[0];
    if (y >= ys[n - 1]) return c[n - 1];
    let i = 0;
    while (i < n - 2 && y > ys[i + 1]) i++;
    const t = (y - ys[i]) / (ys[i + 1] - ys[i]);
    const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(n - 1, i + 2)];
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  d(x: number, y: number, z: number): number {
    MAT = this.m;
    const yc = Math.max(this.ys[0], Math.min(this.ys[this.ys.length - 1], y));
    const a = this.at(this.ra, yc), b = this.at(this.rb, yc);
    const dx = Math.abs(x - this.at(this.cx, yc)) / a, dz = Math.abs(z) / b;
    const k = this.p === 2 ? Math.sqrt(dx * dx + dz * dz) : Math.pow(Math.pow(dx, this.p) + Math.pow(dz, this.p), 1 / this.p);
    const radial = (k - 1) * Math.min(a, b);
    const dy = Math.max(this.ys[0] - y, y - this.ys[this.ys.length - 1]);
    if (dy <= 0) return radial;
    // Rounded ends.
    const r = Math.max(radial, 0);
    return radial > 0 ? Math.sqrt(r * r + dy * dy) : Math.max(radial, dy);
  }
}

/** Half-space: points on the side `n` points to are outside. */
export class Plane extends Sdf {
  private readonly nx: number; private readonly ny: number; private readonly nz: number; private readonly o: number;
  constructor(p: Vec3, n: Vec3, readonly m = 0) {
    super();
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.nx = n[0] / l; this.ny = n[1] / l; this.nz = n[2] / l;
    this.o = p[0] * this.nx + p[1] * this.ny + p[2] * this.nz;
    this.setBB(-INF, -INF, -INF, INF, INF, INF);
  }
  d(x: number, y: number, z: number): number {
    MAT = this.m;
    return x * this.nx + y * this.ny + z * this.nz - this.o;
  }
}

/** Arbitrary distance function with explicit bounds. */
export class Fn extends Sdf {
  constructor(private readonly f: (x: number, y: number, z: number) => number, bb: [number, number, number, number, number, number], readonly m: number) {
    super();
    this.setBB(...bb);
  }
  d(x: number, y: number, z: number): number {
    const v = this.f(x, y, z);
    MAT = this.m;
    return v;
  }
}

// -----------------------------------------------------------------------------
// Operators
// -----------------------------------------------------------------------------

/**
 * Smooth union of many children (polynomial smooth-min with blend radius k).
 * Children whose bounds are further than the current best + k are skipped,
 * which keeps big trees cheap. The material is the nearest child's.
 */
export class Union extends Sdf {
  readonly kids: Sdf[];
  constructor(kids: Sdf[], private readonly k = 0) {
    super();
    this.kids = kids.filter(Boolean);
    const b = [INF, INF, INF, -INF, -INF, -INF];
    for (const c of this.kids) {
      for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], c.bb[i]); b[i + 3] = Math.max(b[i + 3], c.bb[i + 3]); }
    }
    const e = k * 0.25;
    this.setBB(b[0] - e, b[1] - e, b[2] - e, b[3] + e, b[4] + e, b[5] + e);
  }
  prune(lo: Vec3, hi: Vec3): Sdf | null {
    if (!super.prune(lo, hi)) return null;
    const kids: Sdf[] = [];
    let same = true;
    for (const c of this.kids) {
      const p = c.prune(lo, hi);
      if (p) kids.push(p);
      if (p !== c) same = false;
    }
    if (same) return this;
    if (kids.length === 0) return null;
    if (kids.length === 1) return kids[0];
    return new Union(kids, this.k);
  }
  d(x: number, y: number, z: number): number {
    const k = this.k;
    let best = INF, mat = 0, nearest = INF;
    const kids = this.kids;
    let lim = INF;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (boxDist2(c.bb, x, y, z) > lim) continue;
      const v = c.d(x, y, z);
      if (v < nearest) { nearest = v; mat = MAT; }
      if (k > 0 && best < INF) {
        const h = Math.max(k - Math.abs(best - v), 0) / k;
        best = Math.min(best, v) - h * h * k * 0.25;
      } else best = Math.min(best, v);
      const l = best + k;
      lim = l > 0 ? l * l : 0;
    }
    MAT = mat;
    return best === INF ? boxDist(this.bb, x, y, z) + 1 : best;
  }
}

/**
 * Smooth subtraction: carves `b` out of `a`. With `paint` set, the carved
 * walls take `b`'s material (seams, grooves, eye sockets with a lash line).
 */
export class Sub extends Sdf {
  constructor(private readonly a: Sdf, private readonly b: Sdf, private readonly k = 0, private readonly paint = -1) {
    super();
    this.bb.set(a.bb);
  }
  prune(lo: Vec3, hi: Vec3): Sdf | null {
    const a = this.a.prune(lo, hi);
    if (!a) return null;
    const b = this.b.prune(lo, hi);
    if (!b) return a;
    return a === this.a && b === this.b ? this : new Sub(a, b, this.k, this.paint);
  }
  d(x: number, y: number, z: number): number {
    const da = this.a.d(x, y, z);
    const ma = MAT;
    const k = this.k;
    if (boxDist(this.b.bb, x, y, z) > k + Math.max(0, -da) + 1e-4) { MAT = ma; return da; }
    const db = -this.b.d(x, y, z);
    let v: number;
    if (k > 0) {
      const h = Math.max(k - Math.abs(da - db), 0) / k;
      v = Math.max(da, db) + h * h * k * 0.25;
    } else v = Math.max(da, db);
    MAT = this.paint >= 0 && db > da - k * 0.5 ? this.paint : ma;
    return v;
  }
}

/** Smooth intersection; the material comes from `a` (from `b` far outside it). */
export class Inter extends Sdf {
  constructor(private readonly a: Sdf, private readonly b: Sdf, private readonly k = 0) {
    super();
    const A = a.bb, B = b.bb;
    this.setBB(Math.max(A[0], B[0]), Math.max(A[1], B[1]), Math.max(A[2], B[2]), Math.min(A[3], B[3]), Math.min(A[4], B[4]), Math.min(A[5], B[5]));
  }
  prune(lo: Vec3, hi: Vec3): Sdf | null {
    const a = this.a.prune(lo, hi), b = this.b.prune(lo, hi);
    if (!a || !b) return null;
    return a === this.a && b === this.b ? this : new Inter(a, b, this.k);
  }
  d(x: number, y: number, z: number): number {
    const db = this.b.d(x, y, z);
    // Far outside the clipping shape: no need to evaluate the (often big) other side.
    if (db > 0.04 + this.k) return db;
    const da = this.a.d(x, y, z);
    const ma = MAT;
    const k = this.k;
    let v: number;
    if (k > 0) {
      const h = Math.max(k - Math.abs(da - db), 0) / k;
      v = Math.max(da, db) + h * h * k * 0.25;
    } else v = Math.max(da, db);
    MAT = ma;
    return v;
  }
}

/** Hollow skin of thickness 2t around a surface, offset outwards by `off`. */
export class Shell extends Sdf {
  constructor(private readonly a: Sdf, private readonly off: number, private readonly t: number, readonly m: number) {
    super();
    const e = off + t;
    const b = a.bb;
    this.setBB(b[0] - e, b[1] - e, b[2] - e, b[3] + e, b[4] + e, b[5] + e);
  }
  prune(lo: Vec3, hi: Vec3): Sdf | null {
    if (!super.prune(lo, hi)) return null;
    const a = this.a.prune(lo, hi);
    if (!a) return null;
    return a === this.a ? this : new Shell(a, this.off, this.t, this.m);
  }
  d(x: number, y: number, z: number): number {
    const v = Math.abs(this.a.d(x, y, z) - this.off) - this.t;
    MAT = this.m;
    return v;
  }
}

/** Grows (positive) or shrinks a surface. */
export class Offset extends Sdf {
  constructor(private readonly a: Sdf, private readonly r: number) {
    super();
    const b = a.bb, e = Math.max(0, r);
    this.setBB(b[0] - e, b[1] - e, b[2] - e, b[3] + e, b[4] + e, b[5] + e);
  }
  prune(lo: Vec3, hi: Vec3): Sdf | null {
    const a = this.a.prune(lo, hi);
    return !a ? null : a === this.a ? this : new Offset(a, this.r);
  }
  d(x: number, y: number, z: number): number { return this.a.d(x, y, z) - this.r; }
}

/** Overrides the material of everything inside. */
export class Paint extends Sdf {
  constructor(private readonly a: Sdf, private readonly f: (x: number, y: number, z: number, m: number) => number) {
    super();
    this.bb.set(a.bb);
  }
  prune(lo: Vec3, hi: Vec3): Sdf | null {
    const a = this.a.prune(lo, hi);
    return !a ? null : a === this.a ? this : new Paint(a, this.f);
  }
  d(x: number, y: number, z: number): number {
    const v = this.a.d(x, y, z);
    MAT = this.f(x, y, z, MAT);
    return v;
  }
}

/** Adds a displacement (wrinkles, folds, hammered metal). Keep amplitude small. */
export class Displace extends Sdf {
  constructor(private readonly a: Sdf, private readonly f: (x: number, y: number, z: number) => number, private readonly amp: number) {
    super();
    const b = a.bb;
    this.setBB(b[0] - amp, b[1] - amp, b[2] - amp, b[3] + amp, b[4] + amp, b[5] + amp);
  }
  prune(lo: Vec3, hi: Vec3): Sdf | null {
    const a = this.a.prune(lo, hi);
    return !a ? null : a === this.a ? this : new Displace(a, this.f, this.amp);
  }
  d(x: number, y: number, z: number): number {
    const v = this.a.d(x, y, z);
    const m = MAT;
    const r = v + this.f(x, y, z);
    MAT = m;
    return r;
  }
}

/**
 * Non-uniform scale about a centre (flattened locks, fins, straps). The
 * distance is scaled by the smallest factor so it stays a safe bound.
 */
export class Squash extends Sdf {
  private readonly k: number;
  constructor(private readonly a: Sdf, private readonly c: Vec3, private readonly s: Vec3) {
    super();
    this.k = Math.min(s[0], s[1], s[2]);
    const b = a.bb;
    this.setBB(
      c[0] + (b[0] - c[0]) * s[0], c[1] + (b[1] - c[1]) * s[1], c[2] + (b[2] - c[2]) * s[2],
      c[0] + (b[3] - c[0]) * s[0], c[1] + (b[4] - c[1]) * s[1], c[2] + (b[5] - c[2]) * s[2],
    );
  }
  d(x: number, y: number, z: number): number {
    const c = this.c, s = this.s;
    return this.a.d(c[0] + (x - c[0]) / s[0], c[1] + (y - c[1]) / s[1], c[2] + (z - c[2]) / s[2]) * this.k;
  }
}

/** Mirrors the child across the z = 0 plane (left/right symmetry). */
export class MirrorZ extends Sdf {
  constructor(private readonly a: Sdf) {
    super();
    const b = a.bb;
    const z = Math.max(Math.abs(b[2]), Math.abs(b[5]));
    this.setBB(b[0], b[1], -z, b[3], b[4], z);
  }
  prune(lo: Vec3, hi: Vec3): Sdf | null {
    // Points in the box fold onto |z|.
    const z0 = lo[2] <= 0 && hi[2] >= 0 ? 0 : Math.min(Math.abs(lo[2]), Math.abs(hi[2]));
    const z1 = Math.max(Math.abs(lo[2]), Math.abs(hi[2]));
    const a = this.a.prune([lo[0], lo[1], z0], [hi[0], hi[1], z1]);
    return !a ? null : a === this.a ? this : new MirrorZ(a);
  }
  d(x: number, y: number, z: number): number { return this.a.d(x, y, Math.abs(z)); }
}

// -----------------------------------------------------------------------------
// Short constructors
// -----------------------------------------------------------------------------

export const cone = (a: Vec3, b: Vec3, r1: number, r2: number, m: number) => new RoundCone(a, b, r1, r2, m);
export const caps = (a: Vec3, b: Vec3, r: number, m: number) => new RoundCone(a, b, r, r, m);
export const ball = (c: Vec3, r: number, m: number) => new Sphere(c, r, m);
export const ell = (c: Vec3, r: Vec3, m: number, rot?: Vec3) => new Ellipsoid(c, r, m, rot);
export const rbox = (c: Vec3, half: Vec3, rad: number, m: number, rot?: Vec3) => new RBox(c, half, rad, m, rot);
export const torus = (c: Vec3, R: number, t: number, m: number, rot?: Vec3) => new Torus(c, R, t, m, rot);
export const union = (k: number, ...kids: (Sdf | null | undefined | false)[]) => new Union(kids.filter(Boolean) as Sdf[], k);
export const sub = (a: Sdf, b: Sdf, k = 0, paint = -1) => new Sub(a, b, k, paint);
export const inter = (a: Sdf, b: Sdf, k = 0) => new Inter(a, b, k);
export const shell = (a: Sdf, off: number, t: number, m: number) => new Shell(a, off, t, m);
export const plane = (p: Vec3, n: Vec3) => new Plane(p, n);
export const loft = (keys: [number, number, number, number][], m: number, p = 2) => new Loft(keys, m, p);

/**
 * A chain of round cones through `pts` with radii `rs`: tapered tubes for
 * hair locks, tails, braids, straps and fingers.
 */
export function strand(pts: Vec3[], rs: number[], m: number, k = 0): Sdf {
  const segs: Sdf[] = [];
  for (let i = 1; i < pts.length; i++) segs.push(new RoundCone(pts[i - 1], pts[i], rs[i - 1], rs[i], m));
  return segs.length === 1 ? segs[0] : new Union(segs, k);
}

/**
 * A flat ribbon along a polyline: the cross-section is an ellipse whose thin
 * axis points away from `centre` (the head), so locks of hair lie on the scalp
 * as broad clumps instead of round tubes. `thin` is the thickness/width ratio.
 */
export class Ribbon extends Sdf {
  private readonly segs: { a: Vec3; ab: Vec3; l2: number; r0: number; r1: number }[] = [];
  constructor(pts: Vec3[], rs: number[], private readonly thin: number, private readonly c: Vec3, readonly m: number) {
    super();
    const b = [INF, INF, INF, -INF, -INF, -INF];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], e = pts[i];
      const ab: Vec3 = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
      this.segs.push({ a, ab, l2: Math.max(1e-12, ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]), r0: rs[i - 1], r1: rs[i] });
    }
    pts.forEach((p, i) => {
      for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p[k] - rs[i]); b[k + 3] = Math.max(b[k + 3], p[k] + rs[i]); }
    });
    this.setBB(b[0], b[1], b[2], b[3], b[4], b[5]);
  }
  d(x: number, y: number, z: number): number {
    MAT = this.m;
    let best = INF;
    const c = this.c, th = this.thin;
    for (const s of this.segs) {
      const px = x - s.a[0], py = y - s.a[1], pz = z - s.a[2];
      const t = Math.max(0, Math.min(1, (px * s.ab[0] + py * s.ab[1] + pz * s.ab[2]) / s.l2));
      const r = s.r0 + (s.r1 - s.r0) * t;
      const qx = px - s.ab[0] * t, qy = py - s.ab[1] * t, qz = pz - s.ab[2] * t;
      // Thin axis: from the head centre through the closest point, made orthogonal to the segment.
      let nx = s.a[0] + s.ab[0] * t - c[0], ny = s.a[1] + s.ab[1] * t - c[1], nz = s.a[2] + s.ab[2] * t - c[2];
      const nd = (nx * s.ab[0] + ny * s.ab[1] + nz * s.ab[2]) / s.l2;
      nx -= s.ab[0] * nd; ny -= s.ab[1] * nd; nz -= s.ab[2] * nd;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const qn = qx * nx + qy * ny + qz * nz;
      const qq = qx * qx + qy * qy + qz * qz;
      const qb = Math.sqrt(Math.max(0, qq - qn * qn));
      const rn = Math.max(1e-6, r * th), rb = Math.max(1e-6, r);
      const k = Math.hypot(qn / rn, qb / rb);
      const d = (k - 1) * rn;
      if (d < best) best = d;
    }
    return best;
  }
}

/** Samples a quadratic Bezier into `n + 1` points. */
export function bezier(a: Vec3, c: Vec3, b: Vec3, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]]);
  }
  return out;
}

/** Cheap smooth value noise in [-1, 1] for wrinkles and surface breakup. */
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number, c: number) => {
    let n = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    n = (n ^ (n >>> 13)) * 1274126177 | 0;
    return ((n ^ (n >>> 16)) & 0xffff) / 32767.5 - 1;
  };
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(h(ix, iy, iz), h(ix + 1, iy, iz), ux), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), ux), uy),
    l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), ux), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), ux), uy),
    uz,
  );
}

export { setMat };
