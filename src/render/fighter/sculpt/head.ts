import type { Appearance } from '../../../character/appearance';
import { cullInside, meshSdf, type SculptMesh } from './mesher';
import { M } from './paint';
import {
  ball, bezier, cone, Displace, ell, Fn, inter, MirrorZ, Offset, Paint, rbox, Ribbon, Squash, strand, sub, torus,
  union, type Sdf, type Vec3,
} from './sdf';

/**
 * Sculpted heads. Everything is authored in units of the skull radius R (the
 * creator's reference head), centred on the skull, face towards +X, the
 * character's right towards +Z. A head is several cached meshes so that a
 * change in the creator only remeshes what changed:
 *  - face: skull, jaw, cheekbones, nose, lips, ears, brows, eye openings,
 *  - hair: the hairstyle on the scalp (plus facial hair),
 *  - tails: swaying pieces (ponytail, long hair, braids), each on its own bone.
 * Eyeballs are small primitive meshes added by the caller (crisp irises).
 */

export const HEAD_R = 0.215;

/** Grid spacing per detail tier, in metres at the reference head size. */
export const HEAD_DETAIL = [0.011, 0.0085, 0.0062];

type FaceKey = Pick<Appearance, 'jaw' | 'nose' | 'mouth' | 'eyes' | 'brows'>;

/** Where the eyeballs sit (R units, right eye) and how big they are. */
export const EYE = { x: 0.64, y: -0.05, z: 0.37, r: 0.2 };

const S = HEAD_R;
const P = (x: number, y: number, z: number): Vec3 => [x * S, y * S, z * S];

// -----------------------------------------------------------------------------
// Face
// -----------------------------------------------------------------------------

/**
 * Eyelids per eye style: how far the upper and lower lids leave the eyeball
 * open (elevation of each lid's edge at the front, radians) and the tilt of
 * the outer corner. The lids themselves are smooth meshes added with the
 * eyeballs; the face only carves a socket and an almond opening for them.
 */
export const EYE_LIDS: Record<Appearance['eyes'], { up: number; lo: number; tilt: number }> = {
  round: { up: 0.72, lo: 0.6, tilt: 0.0 },
  sharp: { up: 0.4, lo: 0.42, tilt: 0.18 },
  narrow: { up: 0.3, lo: 0.32, tilt: 0.05 },
  wide: { up: 0.88, lo: 0.72, tilt: -0.04 },
  glow: { up: 0.45, lo: 0.42, tilt: 0.2 },
};

/**
 * The almond outline of an eye opening as a 2D distance (R units) in the
 * face plane: `u` outwards from the eye centre, `v` up. Each lid is an arc
 * of a big circle through both corners.
 */
function almond(style: Appearance['eyes']): (u: number, v: number) => number {
  const l = EYE_LIDS[style];
  const w = EYE.r * 0.97, hu = Math.sin(l.up) * EYE.r + 0.03, hl = Math.sin(l.lo) * EYE.r + 0.025;
  const cu = (w * w - hu * hu) / (2 * hu), ru = hu + cu;
  const cl = (w * w - hl * hl) / (2 * hl), rl = hl + cl;
  const c = Math.cos(l.tilt), sn = Math.sin(l.tilt);
  return (u, v) => {
    // Tilt: the outer corner (u > 0) rises.
    const uu = u * c + v * sn, vv = v * c - u * sn;
    return Math.max(Math.hypot(uu, vv + cu) - ru, Math.hypot(uu, vv - cl) - rl);
  };
}

/** The skull (cranium and temples) shared by the face and the hair that grows on it. */
function skull(m: number): Sdf {
  return union(0.14 * S,
    ell(P(-0.06, 0.1, 0), [1.0 * S, 0.97 * S, 0.86 * S], m),
    new MirrorZ(ell(P(0.36, 0.3, 0.55), [0.4 * S, 0.35 * S, 0.25 * S], m)),
  );
}

/** Where the mouth sits (R units). */
const MOUTH_Y = -0.56;

/**
 * A crisp facial feature drawn as a smooth tapered tube lying on the skin
 * (brows, the mouth line): points and surface normals in head space
 * (metres), half-widths along the skin, and how flat it lies.
 */
export interface FaceFeature {
  kind: 'brow' | 'mouth';
  pts: Vec3[];
  nrm: Vec3[];
  r: number[];
  flat: number;
}

/**
 * The face: a smooth, simple head in a clean stylised look. A round cranium,
 * full cheeks and a soft chin (shaped by the jaw option), a small nose, ears
 * and sockets for the eyes. The eyes, lids, brows and mouth line are crisp
 * meshes laid on top (see FaceFeature), so the sculpt itself stays smooth.
 */
function faceField(a: FaceKey, ears: boolean): { face: Sdf; jaw: Sdf } {
  const cranium = skull(M.SKIN);
  const lower = ell(P(0.28, -0.3, 0), [0.68 * S, 0.66 * S, 0.74 * S], M.SKIN);
  const cheeks = new MirrorZ(ball(P(0.5, -0.36, 0.4), 0.3 * S, M.SKIN));
  const chin = ({
    soft: ell(P(0.52, -0.74, 0), [0.3 * S, 0.22 * S, 0.36 * S], M.SKIN),
    square: rbox(P(0.44, -0.72, 0), [0.28 * S, 0.14 * S, 0.44 * S], 0.14 * S, M.SKIN),
    narrow: ell(P(0.58, -0.8, 0), [0.24 * S, 0.24 * S, 0.2 * S], M.SKIN),
  } as const)[a.jaw];
  const jaw = union(0.22 * S, lower, chin, cheeks);
  let face: Sdf = union(0.25 * S, cranium, jaw);

  // Eye sockets: room for the eyeball and its lids, opened in an almond.
  const E = P(EYE.x, EYE.y, EYE.z), er = EYE.r * S;
  const eyeD = (x: number, y: number, z: number) => Math.hypot(x - E[0], y - E[1], Math.abs(z) - E[2]);
  const shape = almond(a.eyes);
  const eb: [number, number, number, number, number, number] = [E[0] - er * 1.8, E[1] - er * 1.8, -E[2] - er * 1.8, E[0] + er * 1.8, E[1] + er * 1.8, E[2] + er * 1.8];
  face = sub(face, new Fn((x, y, z) => eyeD(x, y, z) - er * 1.06, eb, M.SKIN), 0.015 * S);
  face = sub(face, new Fn((x, y, z) => Math.max(shape((Math.abs(z) - E[2]) / S, (y - E[1]) / S) * S, E[0] - x), eb, M.SKIN), 0.04 * S);

  // Nose: small and soft.
  const nose = ({
    button: union(0.06 * S, ball(P(0.95, -0.24, 0), 0.09 * S, M.SKIN), cone(P(0.84, -0.02, 0), P(0.94, -0.19, 0), 0.04 * S, 0.07 * S, M.SKIN)),
    round: union(0.06 * S, ball(P(0.95, -0.24, 0), 0.12 * S, M.SKIN), new MirrorZ(ball(P(0.89, -0.29, 0.08), 0.075 * S, M.SKIN))),
    long: union(0.05 * S, cone(P(0.84, 0.04, 0), P(1.04, -0.22, 0), 0.05 * S, 0.075 * S, M.SKIN), ball(P(1.02, -0.24, 0), 0.085 * S, M.SKIN)),
  } as const)[a.nose];
  face = union(0.08 * S, face, nose);

  // An open grin is carved (with teeth); the other mouths are lines drawn on top.
  if (a.mouth === 'grin') {
    const my = MOUTH_Y + 0.02;
    const open = new Fn((x, y, z) => {
      const Y = y / S, Z = z / S;
      const d = Math.max(Y - my, Math.hypot((Y - my) / 0.12, Z / 0.18) - 1) * 0.1;
      return Math.max(d * S, 0.72 * S - x);
    }, [0.6 * S, (my - 0.15) * S, -0.22 * S, 1.2 * S, (my + 0.03) * S, 0.22 * S], M.MOUTH);
    face = sub(face, open, 0.025 * S, M.MOUTH);
    face = union(0.008 * S, face, ell(P(0.8, my - 0.02, 0), [0.07 * S, 0.035 * S, 0.15 * S], M.TEETH));
  }

  // Ears: simple, with a soft bowl.
  if (ears) {
    const ear = sub(
      ell(P(-0.04, -0.06, 0.88), [0.16 * S, 0.25 * S, 0.1 * S], M.SKIN, [0.15, -0.25, 0]),
      ell(P(-0.01, -0.05, 0.97), [0.09 * S, 0.15 * S, 0.06 * S], M.SKIN, [0.15, -0.25, 0]), 0.04 * S,
    );
    face = union(0.06 * S, face, new MirrorZ(ear));
  }
  return { face, jaw };
}

/** Finds the skin under (y, z) by marching in from the front; returns the point and its normal. */
function onFace(f: Sdf, y: number, z: number): [Vec3, Vec3] {
  let x = 1.5 * S, step = 0.02 * S;
  while (f.d(x, y, z) > 0 && x > -S) x -= step;
  // Refine between the last outside and inside samples.
  let lo = x, hi = x + step;
  for (let i = 0; i < 12; i++) {
    const m = (lo + hi) / 2;
    if (f.d(m, y, z) > 0) hi = m; else lo = m;
  }
  x = (lo + hi) / 2;
  const e = 0.004 * S;
  const n: Vec3 = [f.d(x + e, y, z) - f.d(x - e, y, z), f.d(x, y + e, z) - f.d(x, y - e, z), f.d(x, y, z + e) - f.d(x, y, z - e)];
  const l = Math.hypot(...n) || 1;
  return [[x, y, z], [n[0] / l, n[1] / l, n[2] / l]];
}

/** A feature along a curve over the face: `yz(t)` in R units, width `w(t)` in R units. */
function feature(f: Sdf, kind: FaceFeature['kind'], yz: (t: number) => [number, number], w: (t: number) => number, flat: number, n = 14): FaceFeature {
  const pts: Vec3[] = [], nrm: Vec3[] = [], r: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [y, z] = yz(t);
    const [p, nn] = onFace(f, y * S, z * S);
    const rr = w(t) * S;
    // Half sunk into the skin.
    const lift = rr * flat * 0.35;
    pts.push([p[0] + nn[0] * lift, p[1] + nn[1] * lift, p[2] + nn[2] * lift]);
    nrm.push(nn);
    r.push(rr);
  }
  return { kind, pts, nrm, r, flat };
}

/** Brows and the mouth line for a face. */
function faceFeatures(a: FaceKey, f: Sdf): FaceFeature[] {
  const out: FaceFeature[] = [];
  const taper = (t: number) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.45);
  if (a.brows !== 'none') {
    const [inY, midY, outY, w0, w1] = ({
      soft: [0.24, 0.3, 0.25, 0.055, 0.034],
      straight: [0.26, 0.27, 0.26, 0.056, 0.042],
      angry: [0.17, 0.26, 0.31, 0.06, 0.036],
      thick: [0.23, 0.29, 0.25, 0.085, 0.06],
    } as const)[a.brows];
    for (const sd of [-1, 1]) {
      out.push(feature(f, 'brow', (t) => {
        // Quadratic through inner, middle and outer points; the inner end is a little lower and thicker.
        const y = (1 - t) * (1 - t) * inY + 2 * t * (1 - t) * (midY + (midY - (inY + outY) / 2)) + t * t * outY;
        return [y, sd * (0.15 + t * 0.42)];
      }, (t) => (w0 + (w1 - w0) * t) * (t < 0.15 ? 0.6 + t / 0.15 * 0.4 : 1) * Math.max(0.25, taper(Math.min(1, t * 0.5 + 0.5))), 0.5));
    }
  }
  if (a.mouth !== 'grin') {
    const k = a.mouth === 'smile' ? 0.06 : a.mouth === 'frown' ? -0.05 : 0.0;
    const half = a.mouth === 'smile' ? 0.15 : 0.12;
    out.push(feature(f, 'mouth', (t) => {
      const u = t * 2 - 1;
      return [MOUTH_Y + k * (u * u - 0.35), u * half];
    }, (t) => 0.021 * Math.max(0.35, taper(t)), 0.6));
  }
  return out;
}

// -----------------------------------------------------------------------------
// Hair
// -----------------------------------------------------------------------------

const CRANIUM = skull(M.HAIR);
const SMOOTH = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Head centre the hair is laid out around. */
const HC: Vec3 = [-0.06, 0.1, 0];

/** A tapered lock of hair along a quadratic curve. */
function lock(a: Vec3, c: Vec3, b: Vec3, r0: number, r1: number, m: number = M.HAIR, n = 5): Sdf {
  const pts = bezier(P(...a), P(...c), P(...b), n);
  const rs = pts.map((_, i) => (r0 + (r1 - r0) * Math.pow(i / n, 0.9)) * S);
  return strand(pts, rs, m, 0.01 * S);
}


/** A flat clump of hair along a quadratic curve (R units), tapering to a tip. */
function clump(a: Vec3, c: Vec3, b: Vec3, r0: number, r1: number, thin = 0.42, m: number = M.HAIR, n = 6): Sdf {
  const pts = bezier(P(...a), P(...c), P(...b), n);
  const rs = pts.map((_, i) => {
    const t = i / n;
    // Clumps swell a little after the root, then taper to the tip.
    return (r0 + (r1 - r0) * Math.pow(t, 1.3)) * (1 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.6))) * S;
  });
  return new Ribbon(pts, rs, thin, P(...HC), m);
}


interface MassOpts {
  /** Thickness over the skull at the hairline, and extra towards the top (R units). */
  t: number;
  top?: number;
  /** Where the locks flow from: azimuth (0 = front, +pi/2 = right) and elevation on the skull. */
  crown: [number, number];
  /** Locks around the crown, depth of the grooves between them, how far each lock's tip reaches past the hairline (R units). */
  n: number;
  groove: number;
  tips: number;
  /** Locks curl around the crown as they flow (radians per radian away from it). */
  twist?: number;
  /** Hairline over the forehead (bigger = lower), at the nape, and whether it clears the ears. */
  front?: number;
  nape?: number;
  ears?: boolean;
  /** How much lower the hairline falls at an azimuth (long hair). */
  drop?: (phi: number) => number;
  /** Volumes (quiffs, curtains) merged into the mass before it is grooved and trimmed. */
  extra?: Sdf[];
  m?: number;
}

/**
 * A sculpted mass of hair: a shell over the skull with volumes merged in,
 * split into locks by V-grooves that flow from the crown, and trimmed at the
 * hairline so each lock ends in a point. This reads as stylised hair from any
 * angle and keeps one clean silhouette.
 */
function hairMass(o: MassOpts): Sdf {
  const [cp, cl] = o.crown;
  const c: Vec3 = [Math.cos(cp) * Math.cos(cl), Math.sin(cl), Math.sin(cp) * Math.cos(cl)];
  // Basis around the crown axis.
  let ux = -c[2], uy = 0, uz = c[0];
  if (Math.hypot(ux, uz) < 1e-3) { ux = 1; uy = 0; uz = 0; }
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = c[1] * uz - c[2] * uy, vy = c[2] * ux - c[0] * uz, vz = c[0] * uy - c[1] * ux;
  const n = o.n, twist = o.twist ?? 0, front = o.front ?? 0.56, nape = o.nape ?? -0.3;
  const t = o.t * S, top = (o.top ?? 0) * S, groove = o.groove * S;
  const extra = o.extra?.length ? union(0.12 * S, ...o.extra) : null;
  const ears = o.ears ?? true;
  /** 0 at a lock's centre line, 1 on the groove between two locks. */
  const lockW = (X: number, Y: number, Z: number): [number, number] => {
    const qx = X - HC[0], qy = Y - HC[1], qz = Z - HC[2];
    const ql = Math.hypot(qx, qy, qz) || 1;
    const ang = Math.acos(Math.max(-1, Math.min(1, (qx * c[0] + qy * c[1] + qz * c[2]) / ql)));
    const th = Math.atan2(qx * vx + qy * vy + qz * vz, qx * ux + qy * uy + qz * uz) + twist * ang;
    // Locks of uneven width, so the cut doesn't read as corrugated.
    const f = th * n / (2 * Math.PI) + 0.22 * Math.sin(th * 3 + 1.3) + 0.12 * Math.sin(th * 7 + 0.4);
    return [Math.abs(f - Math.floor(f) - 0.5) * 2, ang];
  };
  const bb: [number, number, number, number, number, number] = [-1.45 * S, -1.6 * S, -1.25 * S, 1.3 * S, 1.6 * S, 1.25 * S];
  return new Fn((x, y, z) => {
    const X = x / S, Y = y / S, Z = z / S, AZ = Math.abs(Z);
    const [w, ang] = lockW(X, Y, Z);
    const tip = 1 - w;
    // Mass: the skull's shell, thicker on top, with the extra volumes.
    let d = CRANIUM.d(x, y, z) - t - top * SMOOTH(0, 1, Y);
    if (extra) {
      const e = extra.d(x, y, z);
      const k = 0.1 * S, h = Math.max(k - Math.abs(d - e), 0) / k;
      d = Math.min(d, e) - h * h * k * 0.25;
    }
    d += groove * Math.pow(w, 5) * SMOOTH(0.12, 0.45, ang);
    // Hairline, with the lock tips reaching past it.
    const drop = o.drop ? o.drop(Math.atan2(Z, X)) : 0;
    const fh = ((X - front - o.tips * tip + AZ * AZ * 0.35) * 0.75 - (Y - 0.42) * 0.66) * S;
    const nk = (nape - drop - o.tips * tip - Y) * S;
    let ear = -1;
    if (ears && AZ > 0.5 && X > -0.42 && X < 0.3) ear = (X > 0.08 ? -0.25 - Y : 0.1 - Y - o.tips * tip * 0.5) * S;
    const r = Math.max(fh, nk, ear);
    const k = 0.025 * S, h = Math.max(k - Math.abs(d - r), 0) / k;
    return Math.max(d, r) + h * h * k * 0.25;
  }, bb, o.m ?? M.HAIR);
}

/** Point on the scalp (R units) at azimuth `phi` (0 = front, +pi/2 = right) and elevation `lat`, lifted by `lift`. */
function onScalp(phi: number, lat: number, lift = 0): Vec3 {
  const cl = Math.cos(lat);
  const dx = Math.cos(phi) * cl, dy = Math.sin(lat), dz = Math.sin(phi) * cl;
  // Skull radii (matches the cranium ellipsoid closely enough for placing hair).
  const rx = dx > 0 ? 1.0 : 1.02, ry = 0.98, rz = 0.92;
  const k = 1 / Math.hypot(dx / rx, dy / ry, dz / rz) + lift;
  return [HC[0] + dx * k, HC[1] + dy * k, HC[2] + dz * k];
}

function hairField(style: Appearance['hairStyle']): Sdf | null {
  const B = Math.PI;
  switch (style) {
    case 'bald':
      return null;
    case 'buzz':
      return hairMass({ t: 0.035, crown: [B, 1.2], n: 24, groove: 0.008, tips: 0.02, front: 0.48, nape: -0.34 });
    case 'short':
      // A textured crop with the fringe swept to one side.
      return hairMass({
        t: 0.06, top: 0.08, crown: [B * 0.92, 1.12], n: 19, groove: 0.05, tips: 0.15, twist: 0.35, front: 0.38,
        extra: [ell(P(0.38, 0.72, -0.1), [0.42 * S, 0.3 * S, 0.62 * S], M.HAIR, [0, 0, -0.35])],
      });
    case 'swept':
      // A swept-back quiff, tall at the front and combed over the crown.
      return hairMass({
        t: 0.06, top: 0.1, crown: [0, 0.1], n: 15, groove: 0.055, tips: 0.12, front: 0.48,
        extra: [ell(P(0.4, 0.86, 0.04), [0.5 * S, 0.34 * S, 0.6 * S], M.HAIR, [0, 0, -0.45])],
      });
    case 'spiky': {
      const spikes: Sdf[] = [];
      const row = (count: number, lat: number, len: number, off: number, spread = 2.6) => {
        for (let i = 0; i < count; i++) {
          const phi = off + (i - (count - 1) / 2) * (spread / count);
          const a = onScalp(phi, lat, -0.04), m = onScalp(phi, lat + 0.1, len * 0.45), b = onScalp(phi - 0.2 * Math.sign(phi), lat - 0.1, len);
          b[0] -= 0.3;
          b[1] += 0.1;
          spikes.push(clump(a, m, b, 0.24, 0.006, 0.55));
        }
      };
      row(4, 0.85, 0.5, 0);
      row(3, 1.25, 0.55, 0);
      row(3, 0.6, 0.36, B, 1.5);
      return union(0.05 * S,
        hairMass({ t: 0.07, top: 0.06, crown: [B, 1.15], n: 14, groove: 0.05, tips: 0.24, front: 0.36 }),
        ...spikes);
    }
    case 'ponytail':
    case 'braids':
      // Slicked back towards a tie (or two, for braids).
      return union(0.03 * S,
        hairMass({ t: 0.045, top: 0.025, crown: [B, style === 'ponytail' ? 0.4 : 0.05], n: 18, groove: 0.03, tips: 0.035, front: 0.46 }),
        style === 'ponytail' && torus(P(-0.98, 0.42, 0), 0.11 * S, 0.045 * S, M.TRIM, [0, 0, Math.PI / 2 - 0.5]),
      );
    case 'bun': {
      const swirl: Sdf[] = [];
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26;
        swirl.push(clump([-0.6 + Math.cos(a) * 0.05, 1.0, Math.sin(a) * 0.05], [-0.6 + Math.cos(a + 1.2) * 0.3, 1.1, Math.sin(a + 1.2) * 0.3],
          [-0.6 + Math.cos(a + 2.6) * 0.1, 1.26, Math.sin(a + 2.6) * 0.1], 0.17, 0.04, 0.6));
      }
      return union(0.03 * S,
        hairMass({ t: 0.045, top: 0.025, crown: [B, 0.95], n: 18, groove: 0.03, tips: 0.035, front: 0.46 }),
        union(0.04 * S, ball(P(-0.6, 1.03, 0), 0.25 * S, M.HAIR), ...swirl),
        torus(P(-0.5, 0.84, 0), 0.2 * S, 0.04 * S, M.TRIM, [0, 0, -0.75]),
      );
    }
    case 'mohawk': {
      const fins: Sdf[] = [];
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const ang = 0.5 - t * 2.15; // from the forehead over the crown to the nape
        const bx = Math.cos(ang + Math.PI / 2) * -0.92 - 0.06, by = Math.sin(ang + Math.PI / 2) * 0.92 + 0.1;
        const nx = bx + 0.06, ny = by - 0.1, L = Math.hypot(nx, ny);
        const l = 0.62 - Math.abs(t - 0.35) * 0.4;
        fins.push(cone(P(bx, by, 0), P(bx + nx / L * l - 0.28, by + ny / L * l, 0), 0.19 * S, 0.012 * S, M.HAIR));
      }
      return union(0.02 * S,
        new Squash(union(0.07 * S, ...fins), [0, 0, 0], [1, 1, 0.45]));
    }
    case 'long':
      // Parted in the middle, falling behind the shoulders; the back also hangs on its own bone.
      return hairMass({
        t: 0.06, top: 0.05, crown: [0.1, 1.2], n: 17, groove: 0.05, tips: 0.12, front: 0.44, ears: false,
        drop: (phi) => 0.75 * SMOOTH(1.0, 1.8, Math.abs(phi)),
        extra: [ell(P(-0.22, -0.35, 0), [0.92 * S, 1.02 * S, 0.98 * S], M.HAIR)],
      });
  }
  return null;
}

function facialField(fh: Appearance['facialHair'], jaw: Sdf): Sdf | null {
  if (fh === 'none' || fh === 'stubble') return null;
  const parts: Sdf[] = [];
  const stache = new MirrorZ(lock([0.94, -0.5, 0.012], [0.97, -0.53, 0.15], [0.86, -0.67, 0.23], 0.06, 0.025));
  parts.push(stache);
  if (fh === 'goatee') parts.push(lock([0.86, -0.68, 0], [0.9, -0.86, 0], [0.8, -1.04, 0], 0.09, 0.03));
  if (fh === 'beard' || fh === 'braid') {
    // A full beard hugging the jaw: along the jawline from the ears, thick under the chin, clear of the mouth.
    const region = new Fn((x, y, z) => {
      const X = x / S, Y = y / S, Z = Math.abs(z) / S;
      const front = 1 - SMOOTH(0.16, 0.34, Z);
      const top = -0.5 - X * 0.08 + Z * 0.06 - (X > 0.35 ? front * 0.2 : 0);
      return Math.max((Y - top) * S, (-0.12 - X) * S);
    }, [-0.3 * S, -1.4 * S, -1 * S, 1.3 * S, 0.2 * S, 1 * S], M.HAIR);
    const mass = union(0.12 * S, new Offset(jaw, 0.05 * S), ell(P(0.5, -0.86, 0), [0.32 * S, 0.24 * S, 0.36 * S], M.HAIR));
    const beard = new Displace(inter(mass, region, 0.06 * S),
      (x, y, z) => -Math.pow(Math.abs(Math.sin(Math.atan2(z, x) * 9 + y / S * 2)), 4) * 0.025 * S, 0.025 * S);
    parts.push(new Paint(beard, () => M.HAIR));
    parts.push(lock([0.52, -0.92, 0], [0.66, -1.08, 0], [0.58, -1.22, 0], 0.17, 0.06));
    if (fh === 'braid') {
      const pts: Sdf[] = [];
      for (let i = 0; i < 4; i++) {
        const y = -1.22 - i * 0.14;
        pts.push(ell(P(0.58 - i * 0.01, y, 0), [0.075 * S, 0.09 * S, 0.075 * S], i % 2 ? M.HAIR_DARK : M.HAIR, [0, 0, i % 2 ? 0.4 : -0.4]));
      }
      parts.push(union(0.015 * S, ...pts));
      parts.push(torus(P(0.58, -1.3, 0), 0.075 * S, 0.025 * S, M.METAL));
    }
  }
  return union(0.03 * S, ...parts);
}

// -----------------------------------------------------------------------------
// Swaying pieces (meshed in their bone's space; the bone sits at `root`)
// -----------------------------------------------------------------------------

export interface TailSpec {
  /** Bone position in head space (R units). */
  root: Vec3;
  field: Sdf;
  /** Stiffness passed to the cloth bone. */
  stiffness: number;
}

function tails(style: Appearance['hairStyle']): TailSpec[] {
  const L = (a: Vec3, c: Vec3, b: Vec3, r0: number, r1: number, m: number = M.HAIR) => lock(a, c, b, r0, r1, m, 6);
  switch (style) {
    case 'ponytail':
      return [{
        root: [-0.95, 0.38, 0], stiffness: 0.8,
        field: union(0.05 * S,
          L([0, 0, 0], [-0.45, -0.1, 0], [-0.4, -0.75, 0], 0.18, 0.1),
          L([-0.05, -0.05, 0.04], [-0.35, -0.4, 0.08], [-0.25, -1.15, 0.02], 0.14, 0.02),
          L([-0.05, -0.05, -0.04], [-0.38, -0.35, -0.06], [-0.32, -1.05, -0.05], 0.13, 0.02),
        ),
      }];
    case 'long': {
      const sheet: Sdf[] = [];
      for (let i = 0; i < 6; i++) {
        const z = (i - 2.5) * 0.22;
        sheet.push(L([0.1, 0.1, z * 0.85], [-0.25, -0.5, z * 1.05], [-0.15 - (i % 2) * 0.05, -1.55 + (i % 2) * 0.12, z * 0.95], 0.2, 0.05));
      }
      return [{ root: [-0.62, 0.15, 0], stiffness: 0.6, field: union(0.05 * S, ...sheet) }];
    }
    case 'braids':
      return [-1, 1].map((s) => {
        const beads: Sdf[] = [];
        for (let i = 0; i < 6; i++) {
          beads.push(ell(P(-0.05 - i * 0.02, -0.12 - i * 0.16, 0), [0.085 * S, 0.11 * S, 0.085 * S], i % 2 ? M.HAIR_DARK : M.HAIR, [0, 0, i % 2 ? 0.35 : -0.35]));
        }
        beads.push(torus(P(-0.16, -1.02, 0), 0.07 * S, 0.028 * S, M.TRIM));
        beads.push(lock([-0.16, -1.04, 0], [-0.17, -1.14, 0], [-0.15, -1.25, 0], 0.07, 0.02));
        return { root: [-0.5, -0.05, s * 0.74] as Vec3, stiffness: 1, field: union(0.02 * S, ...beads) };
      });
    default:
      return [];
  }
}

// -----------------------------------------------------------------------------
// Meshing and caches
// -----------------------------------------------------------------------------

const cache = new Map<string, SculptMesh | null>();
function cached(key: string, make: () => SculptMesh | null): SculptMesh | null {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!;
}

export interface HeadSculpt {
  face: SculptMesh;
  hair: SculptMesh | null;
  facial: SculptMesh | null;
  tails: { root: Vec3; stiffness: number; mesh: SculptMesh }[];
  /** Brows and mouth line, drawn as crisp tubes on the skin. */
  features: FaceFeature[];
}
const featureCache = new Map<string, FaceFeature[]>();

export function sculptHead(a: Appearance, o: { noHair?: boolean; noEars?: boolean }, detail: number): HeadSculpt {
  const h = HEAD_DETAIL[Math.max(0, Math.min(HEAD_DETAIL.length - 1, detail))];
  const ears = !o.noEars;
  const style = o.noHair ? 'bald' : a.hairStyle;
  let jaw: Sdf | null = null;
  const fields = () => faceField(a, ears);
  const hairF = () => hairFields.get(style) ?? (hairFields.set(style, hairField(style)), hairFields.get(style)!);
  // The face is meshed per hairstyle so the scalp under the hair can be dropped.
  const fk = `face:${a.jaw}:${a.nose}:${a.mouth === 'grin'}:${a.eyes}:${ears}`;
  const face = cached(`${fk}:${style}:${detail}`, () => {
    const f = cached(`${fk}:full:${detail}`, () => meshSdf(fields().face, { h, ao: 0.03 * S }))!;
    const cover = hairF();
    return cover ? cullInside(f, cover, h * 0.4) : f;
  })!;
  const hair = cached(`hair:${style}:${detail}`, () => {
    const f = hairF();
    return f ? meshSdf(f, { h, ao: 0.04 * S }) : null;
  });
  const facial = cached(`facial:${a.facialHair}:${a.jaw}:${detail}`, () => {
    jaw ??= fields().jaw;
    const f = facialField(a.facialHair, jaw);
    return f ? meshSdf(f, { h, ao: 0.04 * S }) : null;
  });
  const tl = tails(style).map((t, i) => ({
    root: t.root, stiffness: t.stiffness,
    mesh: cached(`tail:${style}:${i}:${detail}`, () => meshSdf(t.field, { h, ao: 0.04 * S }))!,
  }));
  const ftk = `${fk}:${a.mouth}:${a.brows}`;
  let features = featureCache.get(ftk);
  if (!features) { features = faceFeatures(a, fields().face); featureCache.set(ftk, features); }
  return { face, hair, facial, tails: tl, features };
}
const hairFields = new Map<string, Sdf | null>();
