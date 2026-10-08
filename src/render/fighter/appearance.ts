import { Bone, Euler, Mesh, MeshBasicMaterial, Object3D, Quaternion, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import type { Appearance } from '../../character/appearance';
import type { PartSpec } from '../meshBuilder';
import { bodyDetail } from './body';
import type { RigDecorator } from './look';
import type { RigPartSpec } from './rig';
import { EYE, EYE_LIDS, HEAD_R, sculptHead } from './sculpt/head';
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
    g.scale.setScalar(api.metrics.headR / LOOK_HEAD_R);
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
  };
}

/** Painted details on the face: markings, cheek blush, stubble. Coordinates in skull radii. */
function faceTweak(a: Appearance) {
  const S = HEAD_R;
  return (m: number, x: number, y: number, z: number): number => {
    if (m !== M.SKIN) return m;
    const X = x / S, Y = y / S, Z = z / S, AZ = Math.abs(Z);
    switch (a.marking) {
      case 'scar': {
        // A slash across the left eye.
        if (Z < 0 && X > 0.45) {
          const t = Math.max(0, Math.min(1, ((Y - 0.4) * -0.55 + (Z + 0.2) * -0.3) / (0.55 * 0.55 + 0.3 * 0.3)));
          const dy = Y - (0.4 - 0.55 * t), dz = Z - (-0.2 - 0.3 * t);
          if (Math.hypot(dy, dz) < 0.03) return M.SCAR;
        }
        break;
      }
      case 'warpaint':
        if (X > 0.42 && AZ > 0.2 && AZ < 0.66) {
          const base = -0.1 - (AZ - 0.2) * 0.25;
          if (Math.abs(Y - base) < 0.032 || Math.abs(Y - (base - 0.1)) < 0.028) return M.PAINT;
        }
        break;
      case 'freckles':
        if (X > 0.6 && Y > -0.3 && Y < 0.0 && AZ < 0.55 && noise3(x * 140, y * 140, z * 140) > 0.42) return M.FRECKLE;
        break;
      case 'tattoo': {
        if (Z < 0 && X > 0.35) {
          const dy = Y - EYE.y, dz = Z + EYE.z;
          const rr = Math.hypot(dy, dz), ang = Math.atan2(dy, -dz);
          if ((Math.abs(rr - 0.3) < 0.026 && ang > -2.2 && ang < 0.6) || (Math.abs(dz + 0.05) < 0.024 && Y < -0.18 && Y > -0.5)) return M.PAINT;
        }
        break;
      }
    }
    if (a.facialHair === 'stubble' && X > -0.15 && Y < -0.3 - Math.max(0, 0.3 - X) * 0.6 && Y > -1.1) return M.STUBBLE;
    // Warm cheeks.
    if (X > 0.4 && Math.hypot((Y + 0.2) / 0.15, (AZ - 0.47) / 0.17) < 1) return M.BLUSH;
    return m;
  };
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
  const sc = sculptHead(a, { noHair: opts.noHair, noEars: opts.noEars }, bodyDetail());
  const colors = headColors(a);

  part(grp, paintedGeometry(sc.face, colors, { tweak: faceTweak(a), wash: 0.9 }), painted);
  if (sc.hair) part(grp, paintedGeometry(sc.hair, colors), painted);
  if (sc.facial) part(grp, paintedGeometry(sc.facial, colors), painted);
  for (const t of sc.tails) {
    const pos: V3 = [t.root[0] * HEAD_R, t.root[1] * HEAD_R, t.root[2] * HEAD_R];
    let b: Object3D;
    if (opts.cloth) b = opts.cloth(grp, pos, t.stiffness);
    else { b = new Bone(); b.position.set(...pos); grp.add(b); }
    cloth.push(b);
    part(b, paintedGeometry(t.mesh, colors), painted);
  }

  // Eyes: glossy eyeballs with layered irises, looking a touch outwards,
  // under smooth lids with a lash line along the upper edge.
  const er = EYE.r * HEAD_R;
  const lids = EYE_LIDS[a.eyes];
  const lidR = er * 1.08;
  const skinLid = mix(a.skin, 0x6a4048, 0.14);
  const lash = mix(a.hairColor, 0x0a0810, 0.75);
  for (const s of [-1, 1]) {
    const c: V3 = [EYE.x * HEAD_R, EYE.y * HEAD_R, s * EYE.z * HEAD_R];
    _dir.set(1, -0.04, s * 0.14).normalize();
    _q.setFromUnitVectors(_up, _dir);
    const cap = (rad: number, ang: number, spec: PartSpec) => { part(grp, sph(rad, ang), spec, c).quaternion.copy(_q); };
    if (a.eyes === 'glow') {
      part(grp, sph(er), { color: a.eyeColor, glow: 2.4 }, c);
    } else {
      part(grp, sph(er), { color: 0xf6f2ec, gloss: 0.9, outline: false }, c);
      cap(er * 1.004, 0.62, { color: shade(a.eyeColor, -0.55), outline: false, gloss: 1 });
      cap(er * 1.007, 0.55, { color: a.eyeColor, outline: false, gloss: 1 });
      cap(er * 1.009, 0.42, { color: shade(a.eyeColor, 0.25), outline: false, gloss: 1 });
      cap(er * 1.012, 0.25, { color: 0x07060b, outline: false, gloss: 1 });
      // Catch light.
      _dir.set(1, 0.35, s * 0.05).normalize();
      part(grp, sph(er * 0.14, Math.PI, 8, 6), { color: 0xffffff, glow: 1.3 }, [c[0] + _dir.x * er * 1.0, c[1] + _dir.y * er * 1.0, c[2] + s * 0.02 * er]);
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
    part(upper, rim(lidR, er * 0.13), { color: lash, gloss: 0.3, outline: false }, at).quaternion.copy(local(lidQ(new Quaternion(), s, lids.tilt, lids.up, true)));
    part(grp, sph(lidR * 0.995, Math.PI / 2, 32, 10, Math.PI / 2), { color: a.skin, gloss: 0.12, outline: false }, c).quaternion.copy(lidQ(new Quaternion(), s, lids.tilt, -lids.lo, false));
    part(grp, rim(lidR * 0.995, er * 0.06), { color: mix(a.skin, 0x5a2a2a, 0.3), outline: false }, c).quaternion.copy(lidQ(new Quaternion(), s, lids.tilt, -lids.lo, true));
  }
  return cloth;
}
