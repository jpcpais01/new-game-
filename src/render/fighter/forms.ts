import { FORMS, type BodyShape } from '../../sim/forms';
import type { FormId } from '../../sim/types';

/**
 * Body forms as the renderer sees them: proportions in metres and movement
 * feel. Proportions come from the sim's FormDef.body (so tuning a form there
 * reshapes it here); muscle, belly and motion are render-only flavour.
 */

export interface FormShape {
  /** Uniform scale of the whole body (1 = 2.1 m stylised hero). */
  scale: number;
  /** Bone lengths in metres before `scale`. */
  thigh: number;
  shin: number;
  /** Hips to chest base and chest to neck. */
  waistLen: number;
  chestLen: number;
  neckLen: number;
  upperArm: number;
  forearm: number;
  /** Half widths. */
  shoulderW: number;
  hipW: number;
  chestW: number;
  waistW: number;
  /** Ribcage depth front-to-back. */
  chestD: number;
  headR: number;
  neckR: number;
  /** Limb radii at the thickest point. */
  armR: number;
  foreR: number;
  thighR: number;
  calfR: number;
  handS: number;
  footS: number;
  /** 0..1 muscle definition (pecs, biceps, calves bulge). */
  muscle: number;
  /** 0..1 belly volume. */
  belly: number;
}

export interface FormMotion {
  /** Pose spring frequency (rad/s) and damping ratio: low and damped = heavy. */
  omega: number;
  zeta: number;
  /** Seconds per footstep at walking pace. */
  stepTime: number;
  /** Lift of a stepping foot (m). */
  stepHeight: number;
  /** Idle combat bounce amplitude (m) and rate (Hz). */
  bounce: number;
  bounceHz: number;
  /** Extra crouch in the stance (m, negative = lower). */
  crouch: number;
  /** Forward lean of the spine in stance (degrees). */
  lean: number;
  /** Feet spread multiplier in stance. */
  stance: number;
  /** Arm swing multiplier while moving. */
  armSwing: number;
  /** Mass feel 0..1: how much hits and landings rock the body. */
  heavy: number;
}

export interface BodyForm {
  id: FormId;
  name: string;
  shape: FormShape;
  motion: FormMotion;
}

const BASE_SHAPE: FormShape = {
  scale: 1, thigh: 0.43, shin: 0.41, waistLen: 0.12, chestLen: 0.22, neckLen: 0.42,
  upperArm: 0.3, forearm: 0.28, shoulderW: 0.27, hipW: 0.12, chestW: 0.25, waistW: 0.18, chestD: 0.19,
  headR: 0.17, neckR: 0.07, armR: 0.068, foreR: 0.06, thighR: 0.105, calfR: 0.078, handS: 1, footS: 1,
  muscle: 0.5, belly: 0,
};
const BASE_MOTION: FormMotion = {
  omega: 16, zeta: 0.72, stepTime: 0.26, stepHeight: 0.13, bounce: 0.012, bounceHz: 1.6,
  crouch: 0, lean: 6, stance: 1, armSwing: 1, heavy: 0.5,
};

/**
 * Render-only flavour per form: muscle and belly volume, small proportion
 * tweaks the sim's BodyShape can't express, and how the body moves.
 */
const FLAVOUR: Record<FormId, { shape: Partial<FormShape>; motion: Partial<FormMotion> }> = {
  balanced: { shape: {}, motion: {} },
  robust: {
    shape: { muscle: 0.7, belly: 0.6, waistW: 0.2, hipW: 0.14, handS: 1.1, footS: 1.1, neckR: 0.08 },
    motion: { omega: 11, zeta: 0.85, stepTime: 0.34, stepHeight: 0.1, bounce: 0.006, bounceHz: 1.1, crouch: -0.04, lean: 10, stance: 1.25, armSwing: 0.75, heavy: 1 },
  },
  agile: {
    shape: { muscle: 0.35, handS: 0.95, footS: 0.95, thigh: 0.45, shin: 0.43 },
    motion: { omega: 22, zeta: 0.62, stepTime: 0.19, stepHeight: 0.16, bounce: 0.035, bounceHz: 2.4, crouch: -0.06, lean: 12, stance: 1.05, armSwing: 1.2, heavy: 0.2 },
  },
  slender: {
    shape: { muscle: 0.3, neckLen: 0.44 },
    motion: { omega: 15, zeta: 0.7, stepTime: 0.29, stepHeight: 0.14, bounce: 0.01, bounceHz: 1.3, crouch: -0.02, lean: 4, stance: 1.1, armSwing: 0.9, heavy: 0.35 },
  },
  mighty: {
    shape: { muscle: 1, belly: 0.1, waistW: 0.16, hipW: 0.125, handS: 1.1 },
    motion: { omega: 14, zeta: 0.74, stepTime: 0.27, stepHeight: 0.12, bounce: 0.016, bounceHz: 1.6, crouch: -0.07, lean: 14, stance: 1.2, armSwing: 1.1, heavy: 0.75 },
  },
  ethereal: {
    shape: { muscle: 0.15, waistW: 0.17, hipW: 0.11, handS: 0.95, footS: 0.92 },
    motion: { omega: 13, zeta: 0.55, stepTime: 0.3, stepHeight: 0.15, bounce: 0.03, bounceHz: 0.9, crouch: 0.02, lean: -2, stance: 0.9, armSwing: 0.7, heavy: 0.15 },
  },
};

/**
 * Turns the sim's relative BodyShape (all 1 for Balanced) into metres, then
 * applies the render flavour on top.
 */
function shapeFor(id: FormId): FormShape {
  const b: BodyShape = FORMS[id]?.body ?? { height: 1, bulk: 1, shoulders: 1, limbs: 1, head: 1 };
  const f = FLAVOUR[id]?.shape ?? {};
  const s = { ...BASE_SHAPE };
  s.scale = b.height;
  // Limb length relative to height; the torso gives some back so the total stays close.
  const L = b.limbs;
  s.thigh = (f.thigh ?? BASE_SHAPE.thigh) * L;
  s.shin = (f.shin ?? BASE_SHAPE.shin) * L;
  s.upperArm = BASE_SHAPE.upperArm * L;
  s.forearm = BASE_SHAPE.forearm * L;
  const torso = 1 - (L - 1) * 0.6;
  s.waistLen = BASE_SHAPE.waistLen * torso;
  s.chestLen = BASE_SHAPE.chestLen * torso;
  s.neckLen = (f.neckLen ?? BASE_SHAPE.neckLen) * torso;
  // Bulk thickens everything, shoulders widen the frame.
  const k = b.bulk;
  for (const key of ['armR', 'foreR', 'thighR', 'calfR', 'chestD', 'neckR', 'waistW'] as const) s[key] = (f[key] ?? BASE_SHAPE[key]) * k;
  s.chestW = BASE_SHAPE.chestW * Math.pow(k, 0.7) * Math.pow(b.shoulders, 0.5);
  s.shoulderW = BASE_SHAPE.shoulderW * b.shoulders * Math.pow(k, 0.35);
  s.hipW = (f.hipW ?? BASE_SHAPE.hipW) * Math.pow(k, 0.5);
  s.headR = BASE_SHAPE.headR * b.head;
  s.handS = (f.handS ?? 1) * Math.pow(k, 0.3);
  s.footS = (f.footS ?? 1) * Math.pow(k, 0.25);
  s.muscle = f.muscle ?? BASE_SHAPE.muscle;
  s.belly = f.belly ?? BASE_SHAPE.belly;
  return s;
}

const formCache = new Map<string, BodyForm>();

/** Resolves a form by id; unknown ids fall back to Balanced. */
export function bodyForm(id: string | undefined): BodyForm {
  const fid = (id && id in FORMS ? id : 'balanced') as FormId;
  let f = formCache.get(fid);
  if (!f) {
    f = { id: fid, name: FORMS[fid].name, shape: shapeFor(fid), motion: { ...BASE_MOTION, ...FLAVOUR[fid]?.motion } };
    formCache.set(fid, f);
  }
  return f;
}
