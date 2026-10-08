import type { FormShape } from '../../forms';
import type { BindJoints } from '../body';
import { M, type PaintColors } from '../paint';
import { Displace, Fn, inter, noise3, plane, shell, sub, type Sdf, type Vec3 } from '../sdf';

/**
 * Shared vocabulary for outfits (the house tunic and the character skins).
 * The body sculpt hands every outfit the bare anatomy of one region (torso,
 * right arm, right leg) with its landmarks; the outfit paints it and adds
 * garments, armour and trims around it. Because everything is built from the
 * form's own anatomy fields and joint heights, one outfit fits every body
 * form: a plate offset from the ribcage follows a Robust belly and a Slender
 * chest alike.
 */

/** Torso anatomy (pelvis to neck, skin and raw materials) and its landmarks. */
export interface TorsoCtx {
  s: FormShape;
  j: BindJoints;
  /** Trunk, pelvis, chest, glutes, neck and collarbones (trunk M.SHIRT, glutes M.PANTS, neck M.SKIN). */
  core: Sdf;
  pelvis: Sdf;
  /** Hips, spine, chest and neck joint heights, and the shoulder line. */
  yH: number; yS: number; yC: number; yN: number; yU: number;
  /** Chest-to-neck length (the upper chest spans yC..yN). */
  nl: number;
  /** Half depth of the waist and the pelvis, half width of the pelvis. */
  waistD: number; pelvisD: number; pelvisW: number;
  /** Where belts sit and where a tunic ends. */
  yBelt: number; yHem: number;
}

/** Right-arm anatomy (deltoid to fist). */
export interface ArmCtx {
  s: FormShape;
  j: BindJoints;
  U: Vec3; E: Vec3; Wr: Vec3;
  /** Lateral position of the arm (shoulder z). */
  z: number;
  deltoid: Sdf; upper: Sdf; fore: Sdf;
  /** Deltoid, upper arm and forearm blended (no hand). */
  arm: Sdf;
  /** The closed fist (M.SKIN). */
  fist: Sdf;
}

/** Right-leg anatomy (hip to ankle) and the bare foot shape. */
export interface LegCtx {
  s: FormShape;
  j: BindJoints;
  T: Vec3; K: Vec3; A: Vec3;
  z: number;
  thigh: Sdf; shin: Sdf;
  /** Thigh and shin blended. */
  legBody: Sdf;
  /** Foot (M.BOOT) from the ankle to the toe, and its sole (M.SOLE) on the ground. */
  foot: Sdf;
  sole: Sdf;
  /** Foot-space point: x along the foot (toe +X), scaled by the form's foot size. */
  F(x: number, y: number, z: number): Vec3;
}

/** A loose piece of cloth swaying from a bone (sash ends, tabards, coat tails, scarves). */
export interface ClothPiece {
  /** Field in the piece's own space: its root (where it hangs from) is the origin. */
  field: Sdf;
  /** Root in body space. */
  root: Vec3;
  /** Which torso bone it hangs from. */
  bone: 'hips' | 'chest';
  stiffness: number;
}

export interface OutfitSculpt {
  torso(c: TorsoCtx): Sdf;
  arm(c: ArmCtx): Sdf;
  leg(c: LegCtx): Sdf;
  cloth(c: TorsoCtx): ClothPiece[];
}

/** Outfit colours on top of the character's own (skin, hair, eyes stay theirs). */
export type OutfitColors = Omit<PaintColors, 'skin' | 'hair' | 'eyes'>;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

export const WIDE = 3;

/** Distance to the slab y0..y1 (negative inside). */
export const slab = (y0: number, y1: number, m: number = M.SHIRT) =>
  new Fn((_x, y) => Math.max(y0 - y, y - y1), [-WIDE, y0 - 0.02, -WIDE, WIDE, y1 + 0.02, WIDE], m);

/** Keeps only the part of `a` below (dir -1) or above (dir 1) the height y, with a crisp edge. */
export const clipY = (a: Sdf, y: number, dir: 1 | -1) => inter(a, plane([0, y, 0], [0, -dir, 0]));

/** Keeps the part of `a` between two heights. */
export const between = (a: Sdf, y0: number, y1: number, k = 0) => inter(a, slab(y0, y1), k);

/** A raised band hugging `a` between two heights (belts, cuffs, hems, trims). */
export const band = (a: Sdf, y0: number, y1: number, off: number, t: number, m: number) =>
  inter(shell(a, off, t, m), slab(y0, y1, m));

/** Smooth 0..1 ramp. */
export const ramp = (e0: number, e1: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Fur: clumped tufts pushed outwards from the surface, with a combed grain
 * so it reads as pelt rather than noise. `amp` is the tuft height.
 */
export function furred(a: Sdf, amp: number, freq = 32): Sdf {
  return new Displace(a, (x, y, z) => {
    const tuft = noise3(x * freq, y * freq * 0.7, z * freq) * 0.5 + 0.5;
    const grain = Math.abs(Math.sin(x * freq * 2.1 + z * freq * 1.7 + noise3(x * 9, y * 9, z * 9) * 3));
    return -amp * (0.35 + 0.45 * tuft + 0.2 * grain);
  }, amp);
}

/**
 * Diamond quilting: shallow stitched grooves on a padded garment. The grid
 * wraps around the vertical axis through `c` (x, z) at radius `r`, so cells
 * keep their size on any form. Grooves are `depth` deep, cells `cell` wide.
 */
export function quilted(a: Sdf, c: [number, number], r: number, cell: number, depth: number, y0 = -WIDE, y1 = WIDE): Sdf {
  const k = Math.PI / cell;
  return new Displace(a, (x, y, z) => {
    const fade = Math.min(ramp(y0, y0 + 0.03, y), 1 - ramp(y1 - 0.03, y1, y));
    if (fade <= 0) return 0;
    const arc = Math.atan2(z - c[1], x - c[0]) * r;
    const u = Math.sin((y + arc) * k), v = Math.sin((y - arc) * k);
    return Math.max(Math.exp(-u * u * 14), Math.exp(-v * v * 14)) * depth * fade;
  }, depth);
}

/**
 * Where a ray from `from` along `dir` (unit) first meets the field: used to
 * pin buckles, gems and emblems onto a body whatever its form. Falls back to
 * the start point if nothing is hit.
 */
export function hit(f: Sdf, from: Vec3, dir: Vec3): Vec3 {
  let t = 0;
  for (let i = 0; i < 96; i++) {
    const p: Vec3 = [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t];
    const d = f.d(p[0], p[1], p[2]);
    if (d < 1e-4) return p;
    t += Math.max(d * 0.9, 1e-4);
    if (t > 2) break;
  }
  return from;
}

/** The front of the body (largest x) at height y and side z. */
export const frontAt = (f: Sdf, y: number, z = 0): Vec3 => hit(f, [0.8, y, z], [-1, 0, 0]);
/** The back of the body (smallest x) at height y and side z. */
export const backAt = (f: Sdf, y: number, z = 0): Vec3 => hit(f, [-0.8, y, z], [1, 0, 0]);
/** The outer side of the body (largest z) at height y and depth x. */
export const sideAt = (f: Sdf, y: number, x = 0): Vec3 => hit(f, [x, y, 0.9], [0, 0, -1]);

/** Distance from (py, pz) to the segment a..b in the y-z plane. */
export function segYZ(py: number, pz: number, ay: number, az: number, by: number, bz: number): number {
  const dy = by - ay, dz = bz - az;
  const l2 = dy * dy + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((py - ay) * dy + (pz - az) * dz) / l2));
  return Math.hypot(py - ay - dy * t, pz - az - dz * t);
}

/** A pattern field (negative inside) in front-facing space: only x > x0 counts. */
export const front = (f: (y: number, z: number, x: number) => number, x0 = 0, m = 0) =>
  new Fn((x, y, z) => (x < x0 ? Math.max(f(y, z, x), x0 - x) : f(y, z, x)), [-WIDE, -WIDE, -WIDE, WIDE, WIDE, WIDE], m);

/** A pattern field from any function (negative inside), unbounded. */
export const field = (f: (x: number, y: number, z: number) => number, m = 0) => new Fn(f, [-WIDE, -WIDE, -WIDE, WIDE, WIDE, WIDE], m);

/** Carves a glowing seam into `a`: the groove `g` is cut and its walls painted `glow`. */
export const seam = (a: Sdf, g: Sdf, glow: number = M.GLOW, k = 0.003) => sub(a, g, k, glow);
