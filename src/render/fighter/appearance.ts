import { Bone, BufferGeometry, Euler, Float32BufferAttribute, Mesh, MeshBasicMaterial, Object3D, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import type { Appearance } from '../../character/appearance';
import type { PartSpec } from '../meshBuilder';
import { bodyDetail, speciesColors } from './body';
import type { RigDecorator } from './look';
import type { RigPartSpec } from './rig';
import { EYE_LIDS, eyeOf, faceOf, HEAD_R, sculptHead, type FaceFeature } from './sculpt/head';
import { SPECIES_HEAD } from './species';
import { M, paintedGeometry, type PaintColors } from './sculpt/paint';
import { noise3 } from './sculpt/sdf';

/**
 * Character customisation layer: builds a head (sculpted face, hair, facial
 * hair, painted markings and glossy eyes) from an Appearance and derives
 * clothing colours from it. Parts are authoring meshes carrying
 * `userData.spec`, the contract the rig's bake() reads, so they merge into the
 * fighter's skinned meshes at no extra draw-call cost. Forward is +X, up +Y,
 * the fighter's right is +Z.
 */

// -----------------------------------------------------------------------------
// Colour helpers
// -----------------------------------------------------------------------------

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
export const shade = (c: number, k: number) => (k < 0 ? mix(c, 0x000000, -k) : mix(c, 0xffffff, k));
const luma = (c: number) => (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255;

export interface LookPalette {
  skin: number;
  main: number;
  trim: number;
  dark: number;
  boots: number;
  pants: number;
  hair: number;
  cloth: number;
}

/** Clothing palette derived from the two outfit colours. */
export function lookPalette(a: Appearance): LookPalette {
  const main = a.primary;
  return {
    skin: a.skin,
    main,
    trim: a.secondary,
    dark: mix(shade(main, -0.72), 0x1a1a26, 0.4),
    boots: mix(shade(main, -0.6), 0x3a2a20, 0.6),
    pants: mix(shade(main, -0.45), 0x2a2a3a, 0.35),
    hair: a.hairColor,
    cloth: luma(main) > 0.75 ? shade(a.secondary, -0.1) : shade(main, -0.15),
  };
}

// -----------------------------------------------------------------------------
// Authoring helpers
// -----------------------------------------------------------------------------

const AUTHOR = new MeshBasicMaterial();
type V3 = [number, number, number];
function part(parent: Object3D, g: BufferGeometry, spec: PartSpec | number, pos: V3 = [0, 0, 0]): Mesh {
  const m = new Mesh(g, AUTHOR);
  m.userData.spec = typeof spec === 'number' ? { color: spec } : spec;
  m.position.set(...pos);
  parent.add(m);
  return m;
}
const painted: RigPartSpec = { color: 0xffffff, vertexColors: true };
const sphereCache = new Map<string, SphereGeometry>();
/** Sphere, or a cap of it around +Y (`ang` = angular radius). */
function sph(r: number, ang = Math.PI, w = 24, h = 14, from = 0): SphereGeometry {
  const k = `${r}:${ang}:${w}:${h}:${from}`;
  let g = sphereCache.get(k);
  if (!g) { g = new SphereGeometry(r, w, h, 0, Math.PI * 2, from, ang); sphereCache.set(k, g); }
  return g;
}
const torusCache = new Map<string, TorusGeometry>();
/** Half a ring (the front half once rotated by `rimQ`). */
function rim(r: number, tube: number): TorusGeometry {
  const k = `${r}:${tube}`;
  let g = torusCache.get(k);
  if (!g) { g = new TorusGeometry(r, tube, 6, 28, Math.PI); torusCache.set(k, g); }
  return g;
}
const _e = new Euler();
const _qa = new Quaternion();
/** Rotation of a lid of one eye: yawed outwards, tilted at the corner, its edge raised (or lowered) by `edge` radians. */
function lidQ(out: Quaternion, side: number, tilt: number, edge: number, ring: boolean): Quaternion {
  out.setFromEuler(_e.set(0, -side * 0.12, 0));
  out.multiply(_qa.setFromEuler(_e.set(-side * tilt, 0, 0)));
  out.multiply(_qa.setFromEuler(_e.set(0, 0, edge)));
  // The ring's half circle runs from the inner corner over the front to the outer corner.
  if (ring) out.multiply(_qa.setFromEuler(_e.set(0, Math.PI / 2, 0))).multiply(_qa.setFromEuler(_e.set(Math.PI / 2, 0, 0)));
  return out;
}

// -----------------------------------------------------------------------------
// Head
// -----------------------------------------------------------------------------

export interface HeadLookOpts {
  /** A hat sits on the head (kept for callers; the sculpted hair already hugs the skull). */
  hat?: boolean;
  /** A helmet covers the head: no hair at all (facial hair stays). */
  noHair?: boolean;
  /** Ears are covered by gear. */
  noEars?: boolean;
  /** Creates a swaying bone (hair tails); defaults to a plain Bone. */
  cloth?: (parent: Object3D, pos: V3, stiffness: number) => Object3D;
  /** Creates an animatable bone (blinking upper lids) and names it for the animator. */
  bone?: (parent: Object3D, pos: V3, name: string) => Object3D;
}

/** Reference skull radius the head is authored at; other sizes scale from it. */
export const LOOK_HEAD_R = HEAD_R;

/**
 * Rig decorator for a character's custom head: skull, face, hair, facial hair
 * and markings, sized to the form's head and attached to the skull socket.
 * Runs after the gear decorators so helmets can hide the hair.
 */
export function headLook(a: Appearance): RigDecorator {
  return (api) => {
    const g = api.group(api.sockets.skull);
    const k = api.metrics.headR / LOOK_HEAD_R;
    const [sx, sy, sz] = (SPECIES_HEAD[a.species] ?? SPECIES_HEAD.kitsu).scale;
    g.scale.set(k * sx, k * sy, k * sz);
    addHeadLook(g, LOOK_HEAD_R, 0, a, {
      noHair: api.isHidden('hair'),
      noEars: api.isHidden('ears'),
      cloth: (parent, pos, stiffness) => api.cloth(parent, ...pos, stiffness),
      bone: (parent, pos, name) => { const b = api.bone(parent, pos); api.tag(name, b); return b; },
    });
  };
}

/** Paint palette for a head. */
function headColors(a: Appearance): PaintColors {
  return {
    skin: a.skin, shirt: a.primary, trim: a.secondary, pants: a.primary, boot: a.primary, wrap: a.secondary,
    hair: a.hairColor, eyes: a.eyeColor, sash: a.secondary, mark: a.secondary,
    ...speciesColors(a.species, a.skin, a.hairColor),
  };
}

/**
 * Species markings painted into the face's materials: a spirit's glowing
 * tear streaks and brow sigil, a golem's cracks, a fox's pale muzzle and
 * cheek tufts. Coordinates in skull radii.
 */
function speciesPaint(a: Appearance) {
  const S = HEAD_R;
  const eye = eyeOf(a.species);
  const seg = (Y: number, Z: number, y0: number, z0: number, y1: number, z1: number) => {
    const dy = y1 - y0, dz = z1 - z0;
    const t = Math.max(0, Math.min(1, ((Y - y0) * dy + (Z - z0) * dz) / (dy * dy + dz * dz)));
    return Math.hypot(Y - (y0 + dy * t), Z - (z0 + dz * t));
  };
  switch (a.species) {
    case 'wisp':
      return (m: number, x: number, y: number, z: number) => {
        if (m !== M.SKIN || x / S < 0.3) return m;
        const Y = y / S, AZ = Math.abs(z) / S;
        const y0 = eye.y - eye.r - 0.07;
        if (seg(Y, AZ, y0, eye.z + 0.05, y0 - 0.24, eye.z + 0.11) < 0.034) return M.SPIRIT;
        if (Math.abs(Y - 0.5) / 0.13 + AZ / 0.07 < 1) return M.SPIRIT;
        return m;
      };
    case 'golem':
      return (m: number, x: number, y: number, z: number) => {
        if (m !== M.SKIN) return m;
        const n = noise3(x * 30, y * 30, z * 30);
        return Math.abs(n) < 0.022 ? M.SKIN_DARK : m;
      };
    case 'kitsu':
      return (m: number, x: number, y: number, z: number) => {
        if (m !== M.SKIN) return m;
        const X = x / S, Y = y / S, AZ = Math.abs(z) / S;
        if (X > 0.48 && Y < -0.43 - Math.max(0, AZ - 0.2) * 0.4) return M.TIP;
        if (AZ > 0.74 && Y < -0.42) return M.TIP;
        return m;
      };
  }
  return undefined;
}

/** 1 inside a shape, 0 outside, with a soft edge `w` wide (d = signed distance, negative inside). */
const soft = (d: number, w = 0.03) => Math.max(0, Math.min(1, 0.5 - d / w));

/**
 * Soft paint on the face: cheek blush, a hint of the lower lip, stubble and
 * the markings. Blended per vertex with feathered edges, so they read as
 * clean painted shapes. Coordinates in skull radii.
 */
function faceBlend(a: Appearance) {
  const S = HEAD_R;
  const eye = eyeOf(a.species);
  const blush = mix(a.skin, 0xff6470, 0.55), lip = mix(a.skin, 0xb84a58, 0.4);
  const stubble = mix(a.skin, a.hairColor, 0.42), scar = mix(a.skin, 0x9a4646, 0.45), shave = mix(a.skin, a.hairColor, 0.3);
  const segD = (Y: number, Z: number, y0: number, z0: number, y1: number, z1: number) => {
    const dy = y1 - y0, dz = z1 - z0;
    const t = Math.max(0, Math.min(1, ((Y - y0) * dy + (Z - z0) * dz) / (dy * dy + dz * dz)));
    return Math.hypot(Y - (y0 + dy * t), Z - (z0 + dz * t));
  };
  return (m: number, x: number, y: number, z: number): [number, number] | null => {
    if (m !== M.SKIN) return null;
    const X = x / S, Y = y / S, Z = z / S, AZ = Math.abs(Z);
    if (a.hairStyle === 'mohawk') {
      // Shaved sides: the scalp painted with the hair's shadow, a soft stubbly hairline.
      const fh = (X - 0.5 + AZ * AZ * 0.35) * 0.75 - (Y - 0.42) * 0.66;
      const ear = AZ > 0.5 && X > -0.42 && X < 0.3 ? (X > 0.08 ? -0.25 - Y : 0.1 - Y) : -1;
      const d = Math.max(fh, -0.36 - Y, ear) + noise3(x * 90, y * 90, z * 90) * 0.02;
      if (d < 0.04) return [shave, soft(d, 0.05) * 0.8];
    }
    if (X < 0.2) return null;
    switch (a.marking) {
      case 'scar': {
        // A slash across the left eye.
        const d = segD(Y, Z, 0.3, -0.2, -0.4, -0.52);
        if (Z < 0 && d < 0.06) return [scar, soft(d - 0.022, 0.02)];
        break;
      }
      case 'warpaint':
        if (AZ > 0.16 && AZ < 0.72) {
          const base = -0.32 - (AZ - 0.16) * 0.2;
          const d = Math.min(Math.abs(Y - base) - 0.03, Math.abs(Y - (base - 0.11)) - 0.024) + Math.max(0, AZ - 0.62) * 0.4;
          if (d < 0.03) return [a.secondary, soft(d, 0.02)];
        }
        break;
      case 'freckles':
        if (X > 0.6 && Y > -0.42 && Y < -0.14 && AZ < 0.58) {
          const n = noise3(x * 230, y * 230, z * 230);
          if (n > 0.5) return [mix(a.skin, 0x9a5a3a, 0.35), Math.min(0.85, (n - 0.5) * 7)];
        }
        break;
      case 'tattoo': {
        if (Z < 0) {
          const dy = Y - eye.y, dz = Z + eye.z;
          const rr = Math.hypot(dy, dz), ang = Math.atan2(dy, -dz);
          const arc = ang > -2.2 && ang < 0.6 ? Math.abs(rr - 0.32) - 0.022 : 1;
          const line = Y < -0.3 && Y > -0.62 ? Math.abs(dz + 0.04) - 0.02 : 1;
          const d = Math.min(arc, line);
          if (d < 0.03) return [a.secondary, soft(d, 0.02)];
        }
        break;
      }
    }
    if (a.facialHair === 'stubble') {
      const d = Math.max(Y - (-0.38 - Math.max(0, 0.3 - X) * 0.5), -1.05 - Y, -0.1 - X);
      // Leave the lips clear.
      const lipD = Math.hypot((Y + 0.56) / 0.06, Z / 0.15) - 1;
      if (d < 0.04 && lipD > -0.2) return [stubble, soft(d, 0.06) * 0.7 * Math.min(1, lipD * 2 + 0.4)];
    }
    // A hint of the lower lip under the mouth line.
    if (X > 0.7 && a.mouth !== 'grin') {
      const d = Math.hypot((Y + 0.6) / 0.04, Z / 0.1) - 1;
      if (d < 0.6) return [lip, soft(d, 0.8) * 0.5];
    }
    // Rosy cheeks.
    if (X > 0.35) {
      const d = Math.hypot((Y + 0.33) / 0.15, (AZ - 0.5) / 0.17) - 1;
      if (d < 0.8) return [blush, soft(d, 1.2) * 0.32];
    }
    return null;
  };
}

/** A tapered tube along a face feature, lying flattened on the skin. */
function featureTube(f: FaceFeature, sides = 8): BufferGeometry {
  const n = f.pts.length;
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const T = new Vector3(), N = new Vector3(), B = new Vector3(), p = new Vector3(), d = new Vector3();
  for (let i = 0; i < n; i++) {
    const a = f.pts[Math.max(0, i - 1)], b = f.pts[Math.min(n - 1, i + 1)];
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    N.set(...f.nrm[i]);
    N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N).normalize();
    p.set(...f.pts[i]);
    const r = f.r[i];
    for (let k = 0; k < sides; k++) {
      const t = (k / sides) * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      d.copy(N).multiplyScalar(c * r * f.flat).addScaledVector(B, sn * r);
      pos.push(p.x + d.x, p.y + d.y, p.z + d.z);
      // Normal of the flattened ring (an ellipse): scale the radial axes inversely.
      d.copy(N).multiplyScalar(c / f.flat).addScaledVector(B, sn).normalize();
      nor.push(d.x, d.y, d.z);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k, b = i * sides + (k + 1) % sides, c = a + sides, e = b + sides;
      idx.push(a, b, c, b, e, c);
    }
  }
  // Round caps.
  for (const [i, dir] of [[0, -1], [n - 1, 1]] as const) {
    const a = f.pts[i], o = f.pts[i - dir];
    T.set(a[0] - o[0], a[1] - o[1], a[2] - o[2]).normalize();
    const c = pos.length / 3;
    pos.push(a[0] + T.x * f.r[i] * 0.8, a[1] + T.y * f.r[i] * 0.8, a[2] + T.z * f.r[i] * 0.8);
    nor.push(T.x, T.y, T.z);
    for (let k = 0; k < sides; k++) {
      const r0 = i * sides + k, r1 = i * sides + (k + 1) % sides;
      if (dir > 0) idx.push(r1, r0, c); else idx.push(r0, r1, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

const _q = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _dir = new Vector3();

/**
 * Adds the whole customised head to `head` (the skull is centred at y = headY
 * with radius r). Returns the swaying bones it created (ponytails, long hair,
 * braids).
 */
export function addHeadLook(head: Object3D, r: number, headY: number, a: Appearance, opts: HeadLookOpts = {}): Object3D[] {
  const cloth: Object3D[] = [];
  const k = r / HEAD_R;
  const grp = new Object3D();
  grp.position.set(0, headY, 0);
  grp.scale.setScalar(k);
  head.add(grp);
  a = faceOf(a);
  const eye = eyeOf(a.species);
  const spec = SPECIES_HEAD[a.species] ?? SPECIES_HEAD.kitsu;
  const sc = sculptHead(a, { noHair: opts.noHair, noEars: opts.noEars }, bodyDetail());
  const colors = headColors(a);
  // Spirits' hair burns with their own light.
  const hairPaint = spec.hairGlow ? { tweak: (m: number) => (m === M.HAIR || m === M.HAIR_DARK ? M.SPIRIT : m) } : {};

  part(grp, paintedGeometry(sc.face, colors, { blend: faceBlend(a), tweak: speciesPaint(a), wash: 0.55, edge: 0.4 }), painted);
  if (sc.horns) part(grp, paintedGeometry(sc.horns, colors), painted);
  // Brows and the mouth line: crisp shapes on the skin.
  for (const f of sc.features) {
    const color = f.kind === 'brow' ? mix(a.hairColor, 0x0c0a12, 0.3) : mix(a.skin, 0x3a1418, 0.72);
    part(grp, featureTube(f), { color, gloss: f.kind === 'brow' ? 0.05 : 0.25, outline: false });
  }
  if (sc.hair) part(grp, paintedGeometry(sc.hair, colors, hairPaint), painted);
  if (sc.facial) part(grp, paintedGeometry(sc.facial, colors), painted);
  for (const t of sc.tails) {
    const pos: V3 = [t.root[0] * HEAD_R, t.root[1] * HEAD_R, t.root[2] * HEAD_R];
    let b: Object3D;
    if (opts.cloth) b = opts.cloth(grp, pos, t.stiffness);
    else { b = new Bone(); b.position.set(...pos); grp.add(b); }
    cloth.push(b);
    part(b, paintedGeometry(t.mesh, colors, hairPaint), painted);
  }

  // Eyes: glossy eyeballs with layered irises, looking a touch outwards,
  // under smooth lids with a lash line along the upper edge.
  const er = eye.r * HEAD_R;
  const lids = EYE_LIDS[a.eyes];
  const lidR = er * 1.08;
  const skinLid = mix(a.skin, 0x8a5058, 0.1);
  const lash = mix(a.hairColor, 0x0a0810, 0.75);
  for (const s of [-1, 1]) {
    const c: V3 = [eye.x * HEAD_R, eye.y * HEAD_R, s * eye.z * HEAD_R];
    _dir.set(1, -0.04, s * 0.14).normalize();
    _q.setFromUnitVectors(_up, _dir);
    const cap = (rad: number, ang: number, spec: PartSpec) => { part(grp, sph(rad, ang), spec, c).quaternion.copy(_q); };
    if (a.eyes === 'glow') {
      part(grp, sph(er), { color: a.eyeColor, glow: 2.4 }, c);
    } else {
      // Anime irises fill most of the eye (they carry the expression and read
      // from far away): dark rim, colour, a lighter lower ring, pupil, and two
      // bold catch lights.
      part(grp, sph(er, Math.PI, 28, 16), { color: spec.sclera, gloss: 0.8, outline: false }, c);
      cap(er * 1.004, 0.9, { color: shade(a.eyeColor, -0.65), outline: false, gloss: 1 });
      cap(er * 1.007, 0.8, { color: a.eyeColor, outline: false, gloss: 1 });
      cap(er * 1.009, 0.56, { color: shade(a.eyeColor, 0.32), outline: false, gloss: 1 });
      cap(er * 1.012, 0.4, { color: 0x07060b, outline: false, gloss: 1 });
      // Catch lights.
      _dir.set(1, 0.42, s * 0.16).normalize();
      part(grp, sph(er * 0.22, Math.PI, 10, 8), { color: 0xffffff, glow: 1.5 }, [c[0] + _dir.x * er, c[1] + _dir.y * er, c[2] + _dir.z * er]);
      _dir.set(1, -0.28, -s * 0.1).normalize();
      part(grp, sph(er * 0.07, Math.PI, 8, 6), { color: 0xffffff, glow: 1.1 }, [c[0] + _dir.x * er, c[1] + _dir.y * er, c[2] + _dir.z * er]);
    }
    // Upper lid (a hemisphere tilted back so its edge arcs over the iris) on
    // a bone that turns about the eye to blink, and the lower lid.
    let upper: Object3D = grp;
    let at: V3 = c;
    if (opts.bone) {
      upper = opts.bone(grp, c, s > 0 ? 'lidR' : 'lidL');
      upper.quaternion.copy(lidQ(new Quaternion(), s, lids.tilt, 0, false));
      upper.userData.base = upper.quaternion.clone();
      upper.userData.shut = lids.up + lids.lo - 0.04;
      at = [0, 0, 0];
    }
    const local = (q: Quaternion) => (upper === grp ? q : q.premultiply(_qa.copy(upper.quaternion).invert()));
    part(upper, sph(lidR, Math.PI / 2, 32, 10), { color: skinLid, gloss: 0.15, outline: false }, at).quaternion.copy(local(lidQ(new Quaternion(), s, lids.tilt, lids.up, false)));
    part(upper, rim(lidR, er * 0.12), { color: lash, gloss: 0.3, outline: false }, at).quaternion.copy(local(lidQ(new Quaternion(), s, lids.tilt, lids.up, true)));
    part(grp, sph(lidR * 0.995, Math.PI / 2, 32, 10, Math.PI / 2), { color: a.skin, gloss: 0.12, outline: false }, c).quaternion.copy(lidQ(new Quaternion(), s, lids.tilt, -lids.lo, false));
    part(grp, rim(lidR * 0.995, er * 0.045), { color: mix(a.skin, 0x8a4a4a, 0.25), outline: false }, c).quaternion.copy(lidQ(new Quaternion(), s, lids.tilt, -lids.lo, true));
  }
  return cloth;
}
