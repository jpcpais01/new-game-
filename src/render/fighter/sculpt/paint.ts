import { BufferAttribute, BufferGeometry } from 'three';
import type { SculptMesh } from './mesher';

/**
 * Material ids carried by sculpted surfaces, and the "figurine paint" that
 * turns them into vertex colours: a base colour per material, a tinted wash in
 * the recesses (from the baked AO), and a dry-brushed highlight on raised
 * edges (from the baked curvature), the way painted collectible figures are
 * finished. Colours are applied per build, so one cached sculpt serves every
 * outfit.
 */
export const M = {
  SKIN: 0, SHIRT: 1, TRIM: 2, PANTS: 3, BOOT: 4, SOLE: 5, WRAP: 6, HAIR: 7, LIP: 8, MOUTH: 9, TEETH: 10,
  EYE: 11, IRIS: 12, PUPIL: 13, LASH: 14, BROW: 15, METAL: 16, SASH: 17, CUFF: 18, NAIL: 19, HAIR_DARK: 20,
  SCAR: 21, PAINT: 22, GLOW: 23, SHIRT_DARK: 24, LINING: 25, SHAVE: 26, STUBBLE: 27, BLUSH: 28, FRECKLE: 29,
} as const;

export interface PaintColors {
  skin: number;
  shirt: number;
  trim: number;
  pants: number;
  boot: number;
  wrap: number;
  hair: number;
  eyes: number;
  sash: number;
  /** Marking colour (war paint, tattoo). */
  mark: number;
}

interface MatStyle {
  /** Gloss for the specular glint (0..1). */
  gloss: number;
  /** Strength of the recess wash and its tint (multiplied in shadowed creases). */
  wash: number;
  washTint: [number, number, number];
  /** Strength of the edge highlight. */
  edge: number;
  /** Painted sheen band where the surface faces up and out (hair). */
  sheen?: number;
}

const W = (r: number, g: number, b: number): [number, number, number] => [r, g, b];
const STYLE: Record<number, MatStyle> = {
  [M.SKIN]: { gloss: 0.12, wash: 0.55, washTint: W(0.62, 0.3, 0.26), edge: 0.16 },
  [M.BLUSH]: { gloss: 0.12, wash: 0.55, washTint: W(0.62, 0.3, 0.26), edge: 0.16 },
  [M.FRECKLE]: { gloss: 0.12, wash: 0.55, washTint: W(0.62, 0.3, 0.26), edge: 0.16 },
  [M.STUBBLE]: { gloss: 0.05, wash: 0.55, washTint: W(0.6, 0.4, 0.4), edge: 0.1 },
  [M.SCAR]: { gloss: 0.3, wash: 0.6, washTint: W(0.6, 0.3, 0.3), edge: 0.2 },
  [M.PAINT]: { gloss: 0.2, wash: 0.4, washTint: W(0.6, 0.5, 0.5), edge: 0.1 },
  [M.SHAVE]: { gloss: 0.1, wash: 0.5, washTint: W(0.5, 0.4, 0.45), edge: 0.1 },
  [M.LASH]: { gloss: 0.3, wash: 0, washTint: W(1, 1, 1), edge: 0 },
  [M.MOUTH]: { gloss: 0.2, wash: 0, washTint: W(1, 1, 1), edge: 0 },
  [M.LIP]: { gloss: 0.35, wash: 0.5, washTint: W(0.55, 0.25, 0.25), edge: 0.12 },
  [M.HAIR]: { gloss: 0.28, wash: 0.85, washTint: W(0.42, 0.34, 0.36), edge: 0.25, sheen: 0.22 },
  [M.HAIR_DARK]: { gloss: 0.28, wash: 0.8, washTint: W(0.42, 0.34, 0.36), edge: 0.2, sheen: 0.15 },
  [M.BROW]: { gloss: 0.1, wash: 0.3, washTint: W(0.4, 0.35, 0.4), edge: 0.1 },
  [M.BOOT]: { gloss: 0.45, wash: 0.7, washTint: W(0.4, 0.3, 0.3), edge: 0.3 },
  [M.CUFF]: { gloss: 0.4, wash: 0.6, washTint: W(0.4, 0.3, 0.3), edge: 0.3 },
  [M.SOLE]: { gloss: 0.1, wash: 0.5, washTint: W(0.4, 0.4, 0.45), edge: 0.15 },
  [M.WRAP]: { gloss: 0.2, wash: 0.85, washTint: W(0.4, 0.3, 0.3), edge: 0.3 },
  [M.METAL]: { gloss: 1, wash: 0.6, washTint: W(0.3, 0.3, 0.4), edge: 0.5 },
  [M.EYE]: { gloss: 0.9, wash: 0.25, washTint: W(0.7, 0.6, 0.65), edge: 0 },
  [M.IRIS]: { gloss: 1, wash: 0.2, washTint: W(0.5, 0.5, 0.5), edge: 0 },
  [M.PUPIL]: { gloss: 1, wash: 0, washTint: W(1, 1, 1), edge: 0 },
  [M.TEETH]: { gloss: 0.6, wash: 0.5, washTint: W(0.7, 0.6, 0.55), edge: 0.05 },
  [M.NAIL]: { gloss: 0.6, wash: 0.3, washTint: W(0.6, 0.4, 0.4), edge: 0.1 },
};
const CLOTH: MatStyle = { gloss: 0.04, wash: 0.75, washTint: W(0.45, 0.4, 0.55), edge: 0.22 };

const r8 = (c: number) => ((c >> 16) & 255) / 255;
const g8 = (c: number) => ((c >> 8) & 255) / 255;
const b8 = (c: number) => (c & 255) / 255;
// sRGB -> linear (vertex colours are linear in three's colour pipeline).
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Base colour of a material for a palette. */
export function baseColor(m: number, c: PaintColors): number {
  switch (m) {
    case M.SKIN: return c.skin;
    case M.SHIRT: return c.shirt;
    case M.SHIRT_DARK: return mixHex(c.shirt, 0x101018, 0.35);
    case M.LINING: return mixHex(c.trim, 0x101018, 0.25);
    case M.TRIM: return c.trim;
    case M.SASH: return c.sash;
    case M.PANTS: return c.pants;
    case M.BOOT: return c.boot;
    case M.CUFF: return mixHex(c.boot, 0xffffff, 0.12);
    case M.SOLE: return mixHex(c.boot, 0x15121a, 0.7);
    case M.WRAP: return c.wrap;
    case M.HAIR: return c.hair;
    case M.HAIR_DARK: return mixHex(c.hair, 0x0c0a12, 0.35);
    case M.BROW: return mixHex(c.hair, 0x0c0a12, 0.2);
    case M.LIP: return mixHex(c.skin, 0xa83a3a, 0.32);
    case M.MOUTH: return 0x3a1418;
    case M.TEETH: return 0xf4efe4;
    case M.EYE: return 0xf7f3ee;
    case M.IRIS: return c.eyes;
    case M.PUPIL: return 0x08070c;
    case M.LASH: return mixHex(c.hair, 0x0a0810, 0.75);
    case M.METAL: return 0xd8b25a;
    case M.NAIL: return mixHex(c.skin, 0xffffff, 0.25);
    case M.SCAR: return mixHex(c.skin, 0x8a3a3a, 0.35);
    case M.PAINT: return c.mark;
    case M.GLOW: return c.eyes;
    case M.SHAVE: return mixHex(c.hair, c.skin, 0.78);
    case M.STUBBLE: return mixHex(c.skin, c.hair, 0.38);
    case M.BLUSH: return mixHex(c.skin, 0xe0605a, 0.07);
    case M.FRECKLE: return mixHex(c.skin, 0x8a4a2a, 0.35);
    default: return 0xff00ff;
  }
}

export interface PaintOpts {
  /** Optional per-vertex override (markings painted on skin, hair streaks). */
  tweak?: (m: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) => number;
  /** Multiplier on the wash strength (smaller pieces read better with less). */
  wash?: number;
}

/**
 * Builds a BufferGeometry (position, normal, color, gloss) from a sculpt,
 * painting it for the palette.
 */
export function paintedGeometry(s: SculptMesh, c: PaintColors, o: PaintOpts = {}): BufferGeometry {
  const n = s.count;
  const col = new Float32Array(n * 3);
  const gloss = new Float32Array(n);
  const washK = o.wash ?? 1;
  for (let i = 0; i < n; i++) {
    let m = s.mat[i];
    if (o.tweak) m = o.tweak(m, s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2], s.nor[i * 3], s.nor[i * 3 + 1], s.nor[i * 3 + 2]);
    const st = STYLE[m] ?? CLOTH;
    const hex = baseColor(m, c);
    let r = r8(hex), g = g8(hex), b = b8(hex);
    // Recess wash: occluded creases darken towards a tinted shade.
    const occ = 1 - s.ao[i];
    const cv = s.curv[i];
    const wash = Math.min(1, occ * 1.25 + Math.max(0, -cv) * 0.45) * st.wash * washK;
    r *= 1 - wash * (1 - st.washTint[0]);
    g *= 1 - wash * (1 - st.washTint[1]);
    b *= 1 - wash * (1 - st.washTint[2]);
    // Dry-brushed edges: raised ridges catch a lighter tone.
    const edge = Math.max(0, cv) * st.edge;
    r += (1 - r) * edge * 0.8; g += (1 - g) * edge * 0.8; b += (1 - b) * edge * 0.8;
    if (st.sheen) {
      // A soft ring of light across the crown, broken up by the grooves.
      const ny = s.nor[i * 3 + 1];
      const band = Math.exp(-(((ny - 0.55) / 0.2) ** 2)) * st.sheen * s.ao[i];
      r += (1 - r) * band; g += (1 - g) * band; b += (1 - b) * band;
    }
    col[i * 3] = lin(r); col[i * 3 + 1] = lin(g); col[i * 3 + 2] = lin(b);
    gloss[i] = st.gloss;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(s.pos, 3));
  geo.setAttribute('normal', new BufferAttribute(s.nor, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setAttribute('gloss', new BufferAttribute(gloss, 1));
  geo.setIndex(new BufferAttribute(s.idx, 1));
  return geo;
}
