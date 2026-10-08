import type { Appearance } from '../../../character/appearance';
import { cullInside, meshSdf, type SculptMesh } from './mesher';
import { M } from './paint';
import {
  ball, bezier, caps, cone, Displace, ell, Fn, inter, MirrorZ, noise3, Offset, Paint, rbox, Ribbon, Squash, strand, sub, torus,
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
export const EYE = { x: 0.64, y: 0.04, z: 0.34, r: 0.155 };

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
  round: { up: 0.62, lo: 0.5, tilt: 0.0 },
  sharp: { up: 0.36, lo: 0.36, tilt: 0.2 },
  narrow: { up: 0.26, lo: 0.24, tilt: 0.06 },
  wide: { up: 0.78, lo: 0.62, tilt: -0.05 },
  glow: { up: 0.36, lo: 0.32, tilt: 0.22 },
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

function faceField(a: FaceKey, ears: boolean): { face: Sdf; jaw: Sdf } {
  // --- Skull and face masses ---
  const cranium = skull(M.SKIN);
  const mask = ell(P(0.32, -0.22, 0), [0.6 * S, 0.62 * S, 0.62 * S], M.SKIN);
  // The jawline runs from below the ear to the chin; the chin closes it.
  const jaws: Record<Appearance['jaw'], [Vec3, Vec3, number, number, Sdf]> = {
    soft: [[-0.14, -0.42, 0.56], [0.6, -0.86, 0.17], 0.2, 0.15, ell(P(0.66, -0.86, 0), [0.2 * S, 0.17 * S, 0.24 * S], M.SKIN)],
    square: [[-0.14, -0.6, 0.58], [0.58, -0.88, 0.22], 0.2, 0.17, rbox(P(0.62, -0.84, 0), [0.14 * S, 0.11 * S, 0.24 * S], 0.09 * S, M.SKIN)],
    narrow: [[-0.12, -0.36, 0.52], [0.62, -0.9, 0.09], 0.18, 0.11, ell(P(0.68, -0.9, 0), [0.15 * S, 0.15 * S, 0.13 * S], M.SKIN)],
  };
  const [angle, chinSide, rA, rC, chin] = jaws[a.jaw];
  const jawBar = cone(P(...angle), P(...chinSide), rA * S, rC * S, M.SKIN);
  const jaw = union(0.16 * S, new MirrorZ(jawBar), chin, ell(P(0.25, -0.5, 0), [0.45 * S, 0.35 * S, 0.5 * S], M.SKIN));
  const half = union(0.06 * S,
    // Brow ridge and cheekbones.
    cone(P(0.8, 0.25, 0.04), P(0.64, 0.27, 0.5), 0.11 * S, 0.08 * S, M.SKIN),
    ell(P(0.56, -0.1, 0.48), [0.2 * S, 0.12 * S, 0.2 * S], M.SKIN, [0, 0.4, -0.15]),
  );
  let face: Sdf = union(0.16 * S, cranium, mask, jaw, new MirrorZ(half));
  // A soft plane under the cheekbones, towards the jaw.
  face = sub(face, new MirrorZ(ell(P(0.46, -0.44, 0.74), [0.24 * S, 0.14 * S, 0.1 * S], M.SKIN, [0, 0.5, 0])), 0.14 * S);

  // --- Eyes: a socket for the eyeball and its lids, opened in an almond ---
  const E = P(EYE.x, EYE.y, EYE.z), er = EYE.r * S;
  const eyeD = (x: number, y: number, z: number) => Math.hypot(x - E[0], y - E[1], Math.abs(z) - E[2]);
  const shape = almond(a.eyes);
  const eb: [number, number, number, number, number, number] = [E[0] - er * 1.8, E[1] - er * 1.8, -E[2] - er * 1.8, E[0] + er * 1.8, E[1] + er * 1.8, E[2] + er * 1.8];
  face = sub(face, new Fn((x, y, z) => eyeD(x, y, z) - er * 1.06, eb, M.SKIN), 0.012 * S);
  face = sub(face, new Fn((x, y, z) => Math.max(shape((Math.abs(z) - E[2]) / S, (y - E[1]) / S) * S, E[0] - x), eb, M.SKIN), 0.03 * S);
  // Upper lid crease.
  face = sub(face, new MirrorZ(strand(bezier(P(0.74, 0.17, 0.2), P(0.8, 0.25, 0.35), P(0.7, 0.17, 0.5), 4), [0.014 * S, 0.018 * S, 0.018 * S, 0.014 * S, 0.01 * S], M.SKIN)), 0.025 * S);

  // --- Nose ---
  let nose: Sdf;
  if (a.nose === 'round') {
    nose = union(0.05 * S,
      cone(P(0.9, 0.14, 0), P(1.04, -0.14, 0), 0.07 * S, 0.1 * S, M.SKIN),
      ball(P(1.05, -0.2, 0), 0.14 * S, M.SKIN),
      new MirrorZ(ball(P(0.94, -0.25, 0.11), 0.075 * S, M.SKIN)),
    );
  } else if (a.nose === 'long') {
    nose = union(0.04 * S,
      cone(P(0.9, 0.2, 0), P(1.16, -0.18, 0), 0.07 * S, 0.075 * S, M.SKIN),
      ball(P(1.14, -0.22, 0), 0.09 * S, M.SKIN),
      new MirrorZ(ball(P(0.99, -0.26, 0.085), 0.06 * S, M.SKIN)),
    );
  } else {
    nose = union(0.045 * S,
      cone(P(0.9, 0.16, 0), P(1.07, -0.15, 0), 0.06 * S, 0.085 * S, M.SKIN),
      ball(P(1.07, -0.19, 0), 0.105 * S, M.SKIN),
      new MirrorZ(ball(P(0.97, -0.25, 0.09), 0.06 * S, M.SKIN)),
    );
  }
  face = union(0.05 * S, face, nose);
  // Nostrils.
  face = sub(face, new MirrorZ(ell(P(1.0, -0.29, 0.065), [0.04 * S, 0.025 * S, 0.035 * S], M.MOUTH)), 0.02 * S);

  // --- Mouth ---
  const my = -0.5;
  const corner = a.mouth === 'smile' ? 0.07 : a.mouth === 'frown' ? -0.06 : a.mouth === 'grin' ? 0.05 : -0.005;
  const lips = union(0.025 * S,
    // Upper lip in two halves (the cupid's bow), the fuller lower lip under it.
    new MirrorZ(ell(P(0.8, my + 0.035, 0.07), [0.06 * S, 0.035 * S, 0.12 * S], M.LIP, [0.25, 0, 0])),
    ell(P(0.78, my - 0.045, 0), [0.06 * S, 0.045 * S, 0.15 * S], M.LIP),
  );
  face = union(0.03 * S, face, lips);
  // Philtrum groove under the nose and the dimple under the lower lip.
  face = sub(face, caps(P(0.98, -0.3, 0), P(0.92, my + 0.08, 0), 0.026 * S, M.SKIN), 0.03 * S);
  face = sub(face, ell(P(0.92, my - 0.16, 0), [0.05 * S, 0.035 * S, 0.12 * S], M.SKIN), 0.05 * S);
  if (a.mouth === 'grin') {
    const open = new MirrorZ(ell(P(0.98, my + 0.0, 0.0), [0.14 * S, 0.075 * S, 0.21 * S], M.MOUTH));
    face = sub(face, open, 0.02 * S, M.MOUTH);
    face = union(0.005 * S, face, ell(P(0.85, my + 0.03, 0), [0.1 * S, 0.04 * S, 0.17 * S], M.TEETH));
  } else {
    // The mouth line: a thin carved curve rising (smile) or falling (frown) at the corners.
    const line = strand(bezier(P(0.9, my + corner, -0.2), P(0.95, my - corner * 0.6, 0), P(0.9, my + corner, 0.2), 6),
      [0.012 * S, 0.016 * S, 0.018 * S, 0.018 * S, 0.018 * S, 0.016 * S, 0.012 * S], M.MOUTH);
    face = sub(face, line, 0.012 * S, M.MOUTH);
    if (a.mouth === 'smile') face = sub(face, new MirrorZ(caps(P(0.92, my + 0.1, 0.24), P(0.88, my - 0.02, 0.27), 0.016 * S, M.SKIN)), 0.03 * S);
  }

  // --- Ears ---
  if (ears) {
    const ear = sub(
      union(0.03 * S,
        ell(P(-0.04, -0.03, 0.9), [0.17 * S, 0.27 * S, 0.09 * S], M.SKIN, [0.15, -0.25, 0]),
        torus(P(-0.04, 0.02, 0.92), 0.13 * S, 0.035 * S, M.SKIN, [Math.PI / 2 + 0.15, 0, -0.25]),
      ),
      ell(P(-0.02, -0.02, 0.99), [0.1 * S, 0.17 * S, 0.06 * S], M.SKIN, [0.15, -0.25, 0]), 0.03 * S,
    );
    face = union(0.05 * S, face, new MirrorZ(ear));
  }

  // --- Brows ---
  if (a.brows !== 'none') {
    const [inY, midY, outY, r0, r1] = ({
      soft: [0.27, 0.33, 0.28, 0.045, 0.028],
      straight: [0.29, 0.31, 0.29, 0.05, 0.035],
      angry: [0.2, 0.3, 0.34, 0.055, 0.035],
      thick: [0.27, 0.33, 0.29, 0.075, 0.055],
    } as const)[a.brows];
    const brow = strand(bezier(P(0.92, inY, 0.12), P(0.94, midY + 0.03, 0.34), P(0.78, outY, 0.56), 5),
      [r0 * S, r0 * 1.05 * S, r0 * S, (r0 + r1) * 0.5 * S, r1 * S, r1 * 0.7 * S], M.BROW);
    face = union(0.012 * S, face, new MirrorZ(brow));
  }
  return { face, jaw: union(0.1 * S, jaw, mask) };
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
      const row = (count: number, lat: number, len: number, off: number) => {
        for (let i = 0; i < count; i++) {
          const phi = off + (i - (count - 1) / 2) * (2.6 / count);
          const a = onScalp(phi, lat, -0.04), m = onScalp(phi, lat + 0.1, len * 0.45), b = onScalp(phi - 0.2 * Math.sign(phi), lat - 0.1, len);
          b[0] -= 0.3;
          b[1] += 0.1;
          spikes.push(clump(a, m, b, 0.24, 0.006, 0.55));
        }
      };
      row(4, 0.85, 0.5, 0);
      row(3, 1.25, 0.55, 0);
      row(3, 0.6, 0.4, B);
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
        hairMass({ t: 0.006, crown: [B, 1.2], n: 30, groove: 0, tips: 0.02, front: 0.48, nape: -0.36, m: M.SHAVE }),
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
  const stache = new MirrorZ(lock([0.9, -0.37, 0.015], [0.94, -0.39, 0.15], [0.84, -0.53, 0.25], 0.06, 0.02));
  parts.push(stache);
  if (fh === 'goatee') parts.push(lock([0.8, -0.62, 0], [0.86, -0.85, 0], [0.76, -1.06, 0], 0.1, 0.03));
  if (fh === 'beard' || fh === 'braid') {
    const region = new Fn((x, y, z) => {
      const X = x / S, Y = y / S, Z = Math.abs(z) / S;
      // Below the cheekbones, in front of the ears, open around the mouth.
      const cheek = (Y - (-0.2 - X * 0.15 + Z * 0.05)) * S;
      const back = (-0.15 - X) * S;
      const mouth = (1 - Math.hypot((Y + 0.5) / 0.15, Z / 0.27, Math.max(0, 0.62 - X) * 4)) * 0.1 * S;
      return Math.max(cheek, back, X > 0.6 ? mouth : -1);
    }, [-0.3 * S, -1.4 * S, -1 * S, 1.3 * S, 0.2 * S, 1 * S], M.HAIR);
    const beard = new Displace(inter(new Offset(jaw, 0.065 * S), region, 0.03 * S),
      (x, y, z) => -Math.abs(Math.sin(Math.atan2(z, x) * 11 + y / S * 4)) * 0.02 * S + noise3(x * 25, y * 25, z * 25) * 0.008 * S, 0.02 * S);
    parts.push(new Paint(beard, () => M.HAIR));
    parts.push(lock([0.6, -0.84, 0], [0.74, -1.04, 0], [0.64, -1.18, 0], 0.17, 0.07));
    if (fh === 'braid') {
      const pts: Sdf[] = [];
      for (let i = 0; i < 4; i++) {
        const y = -1.22 - i * 0.14;
        pts.push(ell(P(0.68 - i * 0.01, y, 0), [0.075 * S, 0.09 * S, 0.075 * S], i % 2 ? M.HAIR_DARK : M.HAIR, [0, 0, i % 2 ? 0.4 : -0.4]));
      }
      parts.push(union(0.015 * S, ...pts));
      parts.push(torus(P(0.68, -1.3, 0), 0.075 * S, 0.025 * S, M.METAL));
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
}

export function sculptHead(a: Appearance, o: { noHair?: boolean; noEars?: boolean }, detail: number): HeadSculpt {
  const h = HEAD_DETAIL[Math.max(0, Math.min(HEAD_DETAIL.length - 1, detail))];
  const ears = !o.noEars;
  const style = o.noHair ? 'bald' : a.hairStyle;
  let jaw: Sdf | null = null;
  const fields = () => faceField(a, ears);
  const hairF = () => hairFields.get(style) ?? (hairFields.set(style, hairField(style)), hairFields.get(style)!);
  // The face is meshed per hairstyle so the scalp under the hair can be dropped.
  const face = cached(`face:${a.jaw}:${a.nose}:${a.mouth}:${a.eyes}:${a.brows}:${ears}:${style}:${detail}`, () => {
    const f = cached(`face:${a.jaw}:${a.nose}:${a.mouth}:${a.eyes}:${a.brows}:${ears}:full:${detail}`, () => meshSdf(fields().face, { h, ao: 0.03 * S }))!;
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
  return { face, hair, facial, tails: tl };
}
const hairFields = new Map<string, Sdf | null>();
