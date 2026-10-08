import {
  Bone, BufferGeometry, CapsuleGeometry, ConeGeometry, Mesh, MeshBasicMaterial, Object3D, SphereGeometry, TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Appearance } from '../../character/appearance';
import type { PartSpec } from '../meshBuilder';
import type { RigDecorator } from './look';

/**
 * Character customisation layer: builds a head (skull, face, hair, facial
 * hair, markings) from an Appearance and derives clothing colours from it.
 * Parts are plain authoring meshes carrying `userData.spec`, the same contract
 * the rig's bake() reads, so they merge into the fighter's skinned meshes at
 * no extra draw-call cost. Forward is +X, up +Y, the fighter's right is +Z.
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
// Geometry (cached; authoring only, baked away afterwards)
// -----------------------------------------------------------------------------

const cache = new Map<string, BufferGeometry>();
function geo<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = cache.get(key);
  if (!g) { g = make(); cache.set(key, g); }
  return g as T;
}
const sphere = (r: number, w = 16, h = 12) => geo(`s${r}:${w}:${h}`, () => new SphereGeometry(r, w, h));
/** Spherical cap: the top `frac` of a sphere (0..1 of the polar angle). */
const cap = (r: number, frac: number) => geo(`cap${r}:${frac}`, () => new SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI * frac));
const capsule = (r: number, len: number) => geo(`c${r}:${len}`, () => new CapsuleGeometry(r, len, 4, 10));
const cone = (r: number, h: number, s = 8) => geo(`k${r}:${h}:${s}`, () => new ConeGeometry(r, h, s));
const torus = (r: number, t: number, arc = Math.PI * 2) => geo(`t${r}:${t}:${arc}`, () => new TorusGeometry(r, t, 6, 14, arc));
const rbox = (x: number, y: number, z: number, rr = 0.01) =>
  geo(`b${x}:${y}:${z}:${rr}`, () => new RoundedBoxGeometry(x, y, z, 2, Math.min(rr, x / 2.01, y / 2.01, z / 2.01)));

const AUTHOR = new MeshBasicMaterial();
type V3 = [number, number, number];
function part(parent: Object3D, g: BufferGeometry, spec: PartSpec | number, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 | number = 1): Mesh {
  const m = new Mesh(g, AUTHOR);
  m.userData.spec = typeof spec === 'number' ? { color: spec } : spec;
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (typeof scale === 'number') m.scale.setScalar(scale); else m.scale.set(...scale);
  parent.add(m);
  return m;
}
const flat = (color: number, extra: Partial<PartSpec> = {}): PartSpec => ({ color, outline: false, ...extra });

// -----------------------------------------------------------------------------
// Head
// -----------------------------------------------------------------------------

export interface HeadLookOpts {
  /** A hat sits on the head: skip hair volume that would poke through. */
  hat?: boolean;
  /** A helmet covers the head: no hair at all (facial hair stays). */
  noHair?: boolean;
  /** Ears are covered by gear. */
  noEars?: boolean;
  /** Creates a swaying bone (hair tails); defaults to a plain Bone. */
  cloth?: (parent: Object3D, pos: V3) => Object3D;
}

/** Reference skull radius the head is authored at; other sizes scale from it. */
export const LOOK_HEAD_R = 0.215;

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
      cloth: (parent, pos) => api.cloth(parent, ...pos),
    });
  };
}

/**
 * Adds the whole customised head to `head` (the skull is centred at y = headY
 * with radius r). Returns the swaying bones it created (ponytails, long hair,
 * braids).
 */
export function addHeadLook(head: Object3D, r: number, headY: number, a: Appearance, opts: HeadLookOpts = {}): Object3D[] {
  const cloth: Object3D[] = [];
  const newBone = (parent: Object3D, pos: V3): Object3D => {
    let b: Object3D;
    if (opts.cloth) b = opts.cloth(parent, pos);
    else {
      b = new Bone();
      b.position.set(...pos);
      parent.add(b);
    }
    cloth.push(b);
    return b;
  };
  const skin = a.skin;
  const hair = a.hairColor;
  const hairDark = shade(hair, -0.25);
  const browCol = a.hairStyle === 'bald' ? shade(skin, -0.45) : shade(hair, -0.15);
  const cy = headY;

  // --- Skull, jaw, ears, nose ------------------------------------------------
  part(head, sphere(r, 20, 16), skin, [0, cy, 0], [0, 0, 0], [1, 1.04, 0.94]);
  if (a.jaw === 'square') part(head, rbox(r * 1.05, r * 0.7, r * 1.35, r * 0.25), skin, [r * 0.32, cy - r * 0.45, 0]);
  else if (a.jaw === 'narrow') part(head, sphere(r * 0.55, 14, 10), skin, [r * 0.45, cy - r * 0.48, 0], [0, 0, 0.35], [1.05, 0.85, 0.95]);
  else part(head, sphere(r * 0.62, 14, 10), skin, [r * 0.38, cy - r * 0.42, 0], [0, 0, 0], [1, 0.8, 1.15]);
  if (!opts.noEars) for (const s of [-1, 1]) part(head, sphere(0.045, 10, 8), skin, [-0.01, cy, s * r * 0.92], [0, 0, 0], [0.7, 1, 0.5]);
  if (a.nose === 'round') part(head, sphere(0.045, 10, 8), skin, [r * 0.98, cy - 0.02, 0], [0, 0, 0], [0.9, 0.9, 0.95]);
  else if (a.nose === 'long') part(head, cone(0.035, 0.12, 8), skin, [r * 1.02, cy - 0.01, 0], [0, 0, -Math.PI / 2 - 0.5], [1, 1, 0.8]);
  else part(head, sphere(0.032, 10, 8), skin, [r * 1.0, cy - 0.01, 0], [0, 0, 0], [0.9, 1, 0.8]);

  // --- Eyes and brows --------------------------------------------------------
  const ex = r * 0.86, ey = cy + r * 0.12, ez = r * 0.36;
  const eyeScale: Record<Appearance['eyes'], [number, number]> = { round: [1.2, 0.95], sharp: [0.85, 1.05], narrow: [0.55, 1.05], wide: [1.45, 1.1], glow: [0.9, 1] };
  const [sy, sz] = eyeScale[a.eyes];
  for (const s of [-1, 1]) {
    const tilt = a.eyes === 'sharp' ? s * 0.25 : a.eyes === 'narrow' ? s * 0.12 : 0;
    if (a.eyes === 'glow') {
      part(head, sphere(0.036, 10, 8), { color: a.eyeColor, glow: 2.6 }, [ex + 0.012, ey, s * ez], [tilt, 0, 0], [0.5, 0.75, 1.1]);
    } else {
      part(head, sphere(0.046, 12, 10), flat(0xfbf8f2), [ex, ey, s * ez], [tilt, 0, 0], [0.45, sy, sz * 0.95]);
      part(head, sphere(0.027, 10, 8), flat(a.eyeColor), [ex + 0.017, ey - 0.004, s * ez * 0.94], [tilt, 0, 0], [0.5, Math.min(1.25, sy * 1.05), 0.9]);
      part(head, sphere(0.013, 8, 6), flat(0x0e0c14), [ex + 0.026, ey - 0.004, s * ez * 0.93], [0, 0, 0], [0.4, Math.min(1.2, sy), 0.9]);
      part(head, sphere(0.008, 6, 4), flat(0xffffff, { glow: 1.2 }), [ex + 0.03, ey + 0.016 * sy, s * ez * 0.9]);
    }
    if (a.brows !== 'none') {
      const thick = a.brows === 'thick' ? 0.04 : a.brows === 'soft' ? 0.02 : 0.026;
      const ang = a.brows === 'angry' ? 0.62 : a.brows === 'straight' ? 0.05 : a.brows === 'thick' ? 0.3 : 0.25;
      const lift = a.brows === 'angry' ? -0.006 : 0.004;
      part(head, rbox(0.022, thick, 0.09, 0.01), flat(browCol), [ex - 0.004, ey + 0.066 + lift, s * ez], [-s * ang, 0, 0]);
    }
  }

  // --- Mouth -----------------------------------------------------------------
  const mx = r * 0.93, my = cy - r * 0.42;
  const lip = shade(skin, -0.55);
  switch (a.mouth) {
    case 'smile':
      part(head, torus(0.04, 0.008, Math.PI * 0.8), flat(lip), [mx - 0.004, my + 0.03, 0], [0, Math.PI / 2, Math.PI + Math.PI * 0.1]);
      break;
    case 'frown':
      part(head, torus(0.04, 0.008, Math.PI * 0.7), flat(lip), [mx - 0.004, my - 0.025, 0], [0, Math.PI / 2, Math.PI * 0.15]);
      break;
    case 'grin':
      part(head, rbox(0.016, 0.034, 0.09, 0.008), flat(0x3a1a1a), [mx - 0.004, my, 0]);
      part(head, rbox(0.012, 0.014, 0.08, 0.005), flat(0xfaf6ea), [mx + 0.003, my + 0.007, 0]);
      break;
    default:
      part(head, rbox(0.012, 0.012, 0.07, 0.005), flat(lip), [mx, my, 0]);
  }

  // --- Markings --------------------------------------------------------------
  switch (a.marking) {
    case 'scar':
      part(head, rbox(0.01, 0.11, 0.018, 0.005), flat(shade(skin, -0.3)), [ex + 0.012, ey - 0.01, -ez], [0.35, 0, 0]);
      break;
    case 'warpaint':
      for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
        part(head, rbox(0.008, 0.016, 0.07, 0.004), flat(a.secondary), [ex + 0.004 - k * 0.012, ey - 0.06 - k * 0.03, s * (ez + 0.03)], [-s * 0.2, 0, 0]);
      }
      break;
    case 'freckles':
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
        part(head, sphere(0.007, 5, 4), flat(shade(skin, -0.28)), [ex + 0.008, ey - 0.055 - (k % 2) * 0.016, s * (ez - 0.02 + k * 0.016)]);
      }
      break;
    case 'tattoo':
      part(head, torus(0.03, 0.005), { color: a.secondary, glow: 1.4 }, [ex - 0.01, ey - 0.07, -ez - 0.03], [0, Math.PI / 2 - 0.5, 0]);
      part(head, rbox(0.006, 0.06, 0.008, 0.003), { color: a.secondary, glow: 1.4 }, [ex - 0.006, ey - 0.07, -ez - 0.03], [0, 0, 0]);
      break;
  }

  // --- Facial hair -----------------------------------------------------------
  const fh = a.facialHair;
  const jawX = a.jaw === 'narrow' ? r * 0.45 : r * 0.38;
  if (fh === 'stubble') {
    part(head, sphere(r * 0.64, 14, 10), flat(mix(skin, hair, 0.35)), [jawX + 0.004, cy - r * 0.45, 0], [0, 0, 0], [1, 0.78, 1.14]);
  }
  if (fh === 'mustache' || fh === 'goatee' || fh === 'beard' || fh === 'braid') {
    for (const s of [-1, 1]) {
      part(head, capsule(0.016, 0.05), hair, [r * 0.97, my + 0.028, s * 0.035], [s * 1.2, 0, 0.15]);
    }
  }
  if (fh === 'goatee') part(head, cone(0.04, 0.1, 8), hair, [r * 0.82, my - 0.07, 0], [0, 0, Math.PI - 0.25], [1, 1, 1.2]);
  if (fh === 'beard' || fh === 'braid') {
    part(head, sphere(0.14, 12, 10), hair, [r * 0.5, cy - r * 0.62, 0], [0, 0, 0], [0.8, 0.8, 1.2]);
    part(head, sphere(0.1, 10, 8), hair, [r * 0.66, cy - r * 1.08, 0], [0, 0, 0], [0.9, 1, 1]);
    for (const s of [-1, 1]) part(head, sphere(0.06, 10, 8), hair, [r * 0.1, cy - r * 0.3, s * r * 0.8], [0, 0, 0], [0.8, 1.4, 0.7]); // sideburns
  }
  if (fh === 'braid') {
    part(head, cone(0.07, 0.2, 8), hair, [r * 0.75, cy - r * 1.55, 0], [0, 0, Math.PI - 0.2]);
    part(head, torus(0.06, 0.018), { color: shade(a.secondary, 0.1), gloss: 0.9 }, [r * 0.72, cy - r * 1.36, 0], [Math.PI / 2, 0, -0.2]);
  }

  // --- Hair ------------------------------------------------------------------
  const hs = opts.noHair ? 'bald' : a.hairStyle;
  const hat = !!opts.hat;
  /** Scalp shell tilted back so the hairline sits above the brow. */
  const scalp = (k: number, frac: number, tilt = 0.72, col = hair) =>
    part(head, cap(r * k, frac), col, [-0.012, cy + 0.01, 0], [0, 0, tilt], [1, 1.04, 0.97]);
  /** Lock of hair hanging from the side of the head. */
  const sideLocks = (len: number) => {
    for (const s of [-1, 1]) part(head, capsule(0.045, len), hair, [-0.02, cy - len * 0.35, s * r * 0.86], [s * 0.12, 0, 0.1], [1, 1, 0.7]);
  };

  switch (hs) {
    case 'bald':
      break;
    case 'buzz':
      scalp(1.02, 0.5, 0.6, mix(hair, skin, 0.25));
      break;
    case 'short': {
      scalp(1.06, 0.56);
      if (!hat) {
        for (let k = 0; k < 5; k++) {
          const t = (k - 2) / 2;
          part(head, sphere(0.075, 10, 8), hair, [0.07 - Math.abs(t) * 0.04, cy + r * 0.88, t * r * 0.55], [0, 0, 0], [1.1, 0.7, 1]);
        }
      }
      for (const s of [-1, 1]) part(head, rbox(0.05, 0.1, 0.03, 0.012), hair, [0.06, cy - 0.02, s * r * 0.92]); // sideburns
      break;
    }
    case 'swept': {
      scalp(1.06, 0.58);
      if (!hat) {
        part(head, capsule(0.075, 0.24), hair, [0.06, cy + r * 0.86, 0.02], [0.3, 0, -1.25], [1, 1, 1.9]);
        for (let k = 0; k < 3; k++) {
          part(head, cone(0.055, 0.17, 6), hair, [r * 0.62 - k * 0.02, cy + r * 0.62 - k * 0.02, -0.06 + k * 0.07], [0.9 - k * 0.4, 0, -2.0], [1, 1, 0.7]);
        }
      }
      break;
    }
    case 'spiky': {
      scalp(1.06, 0.6);
      if (!hat) {
        const spikes: [number, number, number][] = [
          [0.75, -0.2, 0], [0.4, -0.65, 0.35], [0.4, -0.65, -0.35], [0.05, -1.0, 0], [-0.25, -1.4, 0.4], [-0.25, -1.4, -0.4], [-0.6, -1.9, 0], [0.9, -0.5, 0.2],
        ];
        for (const [x, rz, z] of spikes) {
          part(head, cone(0.07, 0.22, 6), hair, [x * r, cy + r * (0.85 - Math.abs(x) * 0.25), z * r], [z * 1.2, 0, rz], [1, 1, 0.8]);
        }
      }
      for (let k = 0; k < 3; k++) part(head, cone(0.05, 0.15, 6), hair, [r * 0.7, cy + r * 0.55, (k - 1) * 0.08], [(k - 1) * 0.5, 0, -2.1]); // bangs
      break;
    }
    case 'ponytail': {
      scalp(1.04, 0.56);
      const tie = newBone(head, [-r * 0.95, cy + r * 0.45, 0]);
      part(tie, torus(0.045, 0.018), { color: a.secondary, gloss: 0.5 }, [0, 0, 0], [0, Math.PI / 2, 0]);
      part(tie, capsule(0.065, 0.32), hair, [-0.08, -0.17, 0], [0, 0, 0.45], [1, 1, 0.85]);
      part(tie, cone(0.05, 0.14, 8), hair, [-0.17, -0.4, 0], [0, 0, Math.PI + 0.45]);
      break;
    }
    case 'long': {
      scalp(1.07, 0.6);
      sideLocks(0.26);
      const back = newBone(head, [-r * 0.7, cy + r * 0.2, 0]);
      part(back, rbox(0.1, 0.62, r * 1.7, 0.05), hair, [-0.04, -0.28, 0], [0, 0, 0.12]);
      part(back, rbox(0.08, 0.12, r * 1.5, 0.04), hairDark, [-0.07, -0.58, 0], [0, 0, 0.12]);
      if (!hat) part(head, capsule(0.07, 0.2), hair, [0.08, cy + r * 0.86, 0], [0.25, 0, -1.3], [1, 1, 2]);
      break;
    }
    case 'bun': {
      scalp(1.04, 0.56);
      if (!hat) {
        part(head, sphere(0.1, 12, 10), hair, [-r * 0.55, cy + r * 0.95, 0]);
        part(head, torus(0.075, 0.016), { color: a.secondary, gloss: 0.5 }, [-r * 0.45, cy + r * 0.86, 0], [0, 0, -0.6]);
      } else {
        part(head, sphere(0.09, 12, 10), hair, [-r * 1.0, cy + r * 0.3, 0]);
      }
      break;
    }
    case 'mohawk': {
      scalp(1.01, 0.5, 0.6, mix(hair, skin, 0.55));
      if (!hat) {
        for (let k = 0; k < 6; k++) {
          const a0 = -0.6 + k * 0.42; // angle across the crown from front to back
          part(head, cone(0.06, 0.24 - Math.abs(k - 2.5) * 0.02, 6), hair,
            [Math.sin(a0) * r * 0.95, cy + Math.cos(a0) * r * 0.98 + 0.06, 0], [0, 0, -a0], [1, 1, 0.45]);
        }
      }
      break;
    }
    case 'braids': {
      scalp(1.05, 0.58);
      for (const s of [-1, 1]) {
        const b = newBone(head, [-r * 0.55, cy - r * 0.1, s * r * 0.75]);
        for (let k = 0; k < 4; k++) part(b, sphere(0.05 - k * 0.004, 10, 8), k % 2 ? hairDark : hair, [-0.02 - k * 0.012, -0.06 - k * 0.08, 0], [0, 0, 0], [1, 1.1, 1]);
        part(b, torus(0.035, 0.012), { color: a.secondary, gloss: 0.6 }, [-0.07, -0.37, 0], [Math.PI / 2, 0, 0]);
      }
      break;
    }
  }
  return cloth;
}
