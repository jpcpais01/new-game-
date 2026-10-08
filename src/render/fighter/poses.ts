import type { AnimKey } from '../../sim/types';
import type { BodyForm } from './forms';
import type { GripStyle, OffhandStyle } from './look';

/**
 * Joint order for pose arrays. Each joint stores an XYZ euler (radians).
 * Forward is +X, up +Y, the fighter's right is +Z. A bare Z rotation swings a
 * hanging limb forwards (positive) or backwards (negative).
 */
export const J = {
  HIPS: 0, SPINE: 1, CHEST: 2, NECK: 3, HEAD: 4,
  CLAV_L: 5, UARM_L: 6, FARM_L: 7, HAND_L: 8,
  CLAV_R: 9, UARM_R: 10, FARM_R: 11, HAND_R: 12,
  THIGH_L: 13, SHIN_L: 14, FOOT_L: 15,
  THIGH_R: 16, SHIN_R: 17, FOOT_R: 18,
  /** Aliases kept for older code: the weapon is held by the right hand. */
  WEAPON: 12, OFFHAND: 8,
} as const;
export const JOINT_COUNT = 19;
/** Extra scalar slots after the joints: hip height and forward offset. */
export const HIPS_Y = JOINT_COUNT * 3;
export const HIPS_X = JOINT_COUNT * 3 + 1;
export const POSE_SIZE = JOINT_COUNT * 3 + 2;

/** Anatomical parent of each joint (-1 for the root). */
export const JOINT_PARENT: number[] = [-1, 0, 1, 2, 3, 2, 5, 6, 7, 2, 9, 10, 11, 0, 13, 14, 0, 16, 17];

export type Pose = Float32Array;
type JointName = Exclude<keyof typeof J, 'WEAPON' | 'OFFHAND'> | 'WEAPON' | 'OFFHAND';
/** Compact authoring format: joint -> [x, y, z] in degrees (missing axes = 0). */
export type PoseSpec = Partial<Record<JointName, [number, number?, number?] | number>> & { hipsY?: number; hipsX?: number };

const D2R = Math.PI / 180;

/** Builds a pose; a bare number is shorthand for a Z rotation (the swing axis in side view). */
export function makePose(spec: PoseSpec, base?: Pose): Pose {
  const p = base ? base.slice() : new Float32Array(POSE_SIZE);
  for (const k in spec) {
    if (k === 'hipsY') { p[HIPS_Y] = spec.hipsY!; continue; }
    if (k === 'hipsX') { p[HIPS_X] = spec.hipsX!; continue; }
    const j = J[k as JointName];
    const v = spec[k as JointName]!;
    if (typeof v === 'number') {
      p[j * 3 + 2] = v * D2R;
    } else {
      p[j * 3] = (v[0] ?? 0) * D2R;
      p[j * 3 + 1] = (v[1] ?? 0) * D2R;
      p[j * 3 + 2] = (v[2] ?? 0) * D2R;
    }
  }
  return p;
}

/** Adds a relative spec (degrees) on top of an existing pose. */
export function addPose(p: Pose, spec: PoseSpec, k = 1): Pose {
  for (const key in spec) {
    if (key === 'hipsY') { p[HIPS_Y] += spec.hipsY! * k; continue; }
    if (key === 'hipsX') { p[HIPS_X] += spec.hipsX! * k; continue; }
    const j = J[key as JointName];
    const v = spec[key as JointName]!;
    if (typeof v === 'number') p[j * 3 + 2] += v * D2R * k;
    else {
      p[j * 3] += (v[0] ?? 0) * D2R * k;
      p[j * 3 + 1] += (v[1] ?? 0) * D2R * k;
      p[j * 3 + 2] += (v[2] ?? 0) * D2R * k;
    }
  }
  return p;
}

export function lerpPose(out: Pose, a: Pose, b: Pose, t: number): Pose {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

// -----------------------------------------------------------------------------
// Stances: grip sets the arms, off-hand adjusts the left arm, form sets posture
// -----------------------------------------------------------------------------

const LEGS: PoseSpec = { THIGH_L: [8, 0, 24], SHIN_L: -24, FOOT_L: 2, THIGH_R: [-8, 0, -20], SHIN_R: -26, FOOT_R: 10, hipsY: -0.08 };

const GRIP_READY: Record<GripStyle, PoseSpec> = {
  oneHand: {
    HIPS: [0, -8, -4], SPINE: [0, -4, -2], CHEST: [0, -14, -4], HEAD: [0, 14, 4], NECK: [0, 4, 2],
    UARM_R: [-12, 0, 18], FARM_R: [0, -10, 78], WEAPON: [0, 0, 34],
    UARM_L: [12, 0, 34], FARM_L: [0, 10, 72],
  },
  twoHand: {
    HIPS: [0, -14, -6], SPINE: [0, -6, -4], CHEST: [0, -16, -6], HEAD: [0, 18, 8], NECK: [0, 6, 2],
    UARM_R: [-18, 0, 26], FARM_R: [0, -12, 70], WEAPON: [0, 0, 62],
    UARM_L: [10, 0, 40], FARM_L: [0, 0, 70],
  },
  polearm: {
    HIPS: [0, -18, -4], SPINE: [0, -6, -2], CHEST: [0, -18, -4], HEAD: [0, 22, 6], NECK: [0, 6, 2],
    UARM_R: [-14, 0, -4], FARM_R: [0, -14, 84], WEAPON: [0, 8, -70],
    UARM_L: [10, 0, 50], FARM_L: [0, 0, 40],
  },
  dual: {
    HIPS: [0, -10, -8], SPINE: [0, -4, -4], CHEST: [0, -16, -8], HEAD: [0, 16, 10], NECK: [0, 4, 4],
    UARM_R: [-14, 0, 14], FARM_R: [0, -18, 96], WEAPON: [0, 0, -40],
    UARM_L: [14, 0, 30], FARM_L: [0, 18, 92],
  },
  staff: {
    HIPS: [0, -4, -2], SPINE: [0, -2, 0], CHEST: [0, -10, -2], HEAD: [0, 10, 4],
    UARM_R: [-10, 0, 14], FARM_R: [0, -6, 68], WEAPON: [0, 0, 6],
    UARM_L: [14, 0, 30], FARM_L: [0, 10, 58],
  },
  fist: {
    HIPS: [0, -12, -6], SPINE: [0, -4, -4], CHEST: [0, -18, -8], HEAD: [0, 18, 12], NECK: [0, 6, 6],
    UARM_R: [-22, 0, 24], FARM_R: [0, -20, 122], WEAPON: [0, 0, -10],
    UARM_L: [18, 0, 40], FARM_L: [0, 20, 112], OFFHAND: [0, 0, -10],
  },
  bow: {
    HIPS: [0, -20, -2], SPINE: [0, -6, 0], CHEST: [0, -24, -2], HEAD: [0, 26, 4],
    UARM_R: [-10, 0, 40], FARM_R: [0, -30, 120], WEAPON: [0, 0, -20],
    UARM_L: [0, 0, 80], FARM_L: [0, 0, 8],
  },
};

const OFFHAND_READY: Record<OffhandStyle, PoseSpec> = {
  none: {},
  shield: { UARM_L: [8, 0, 38], FARM_L: [0, 0, 74], OFFHAND: [0, -12, 0] },
  weapon: { UARM_L: [16, 0, 26], FARM_L: [0, 14, 84], OFFHAND: [0, 0, -30] },
  focus: { UARM_L: [12, 0, 36], FARM_L: [0, 30, 70], OFFHAND: [-40, 0, 0] },
};

/** Applies a form's posture (lean, crouch, stance width) to a pose. */
function posture(p: Pose, form: BodyForm): Pose {
  const m = form.motion;
  const lean = m.lean;
  addPose(p, { HIPS: lean * 0.3, SPINE: -lean * 0.1, CHEST: lean * 0.5, NECK: -lean * 0.2, HEAD: -lean * 0.6, hipsY: m.crouch });
  // Wider stances bend the knees more and splay the feet.
  const w = m.stance - 1;
  addPose(p, { THIGH_L: [10 * w, 0, 10 * w], THIGH_R: [-10 * w, 0, -6 * w], SHIN_L: -8 * w, SHIN_R: -8 * w, hipsY: -0.05 * w });
  if (form.id === 'mighty') addPose(p, { UARM_L: 8, UARM_R: 6, CLAV_L: [0, 0, 10], CLAV_R: [0, 0, 10] });
  return p;
}

const stanceCache = new Map<string, Pose>();
export function stance(grip: GripStyle, off: OffhandStyle, form: BodyForm): Pose {
  const key = `${grip}|${off}|${form.id}`;
  let p = stanceCache.get(key);
  if (!p) {
    p = makePose({ ...LEGS, ...GRIP_READY[grip] });
    if (grip !== 'twoHand' && grip !== 'polearm' && grip !== 'bow' && grip !== 'fist') p = makePose(OFFHAND_READY[off], p);
    else if (grip === 'fist' && off === 'shield') p = makePose(OFFHAND_READY.shield, p);
    posture(p, form);
    stanceCache.set(key, p);
  }
  return p;
}

// -----------------------------------------------------------------------------
// Actions: anticipation (windup) and contact (strike) keyframes per weapon grip
// -----------------------------------------------------------------------------

export interface ActionPoses {
  windup: Pose;
  strike: Pose;
  /** Optional mirrored/backhand variant used on alternate swings. */
  alt?: { windup: Pose; strike: Pose };
}

interface ActionSpec {
  windup: PoseSpec;
  strike: PoseSpec;
  alt?: { windup: PoseSpec; strike: PoseSpec };
}

const lunge: PoseSpec = { THIGH_L: [6, 0, 52], SHIN_L: -16, FOOT_L: -8, THIGH_R: [-6, 0, -40], SHIN_R: -10, FOOT_R: 30, hipsY: -0.2, hipsX: 0.12 };
const deepLunge: PoseSpec = { THIGH_L: [6, 0, 62], SHIN_L: -30, FOOT_L: -12, THIGH_R: [-6, 0, -48], SHIN_R: -6, FOOT_R: 36, hipsY: -0.3, hipsX: 0.18 };
const coil: PoseSpec = { THIGH_L: [8, 0, 18], SHIN_L: -34, THIGH_R: [-8, 0, -14], SHIN_R: -36, hipsY: -0.16, hipsX: -0.06 };

/** Generic actions: used by any grip that has no bespoke version. */
const GENERIC: Record<AnimKey, ActionSpec> = {
  slash: {
    windup: { ...coil, HIPS: [0, -18, 4], CHEST: [0, -52, 8], HEAD: [0, 40, 0], UARM_R: [-30, 0, 150], FARM_R: [0, 0, 50], WEAPON: [0, 0, 70], UARM_L: [20, 0, 50] },
    strike: { ...lunge, HIPS: [0, 16, -10], CHEST: [0, 36, -18], HEAD: [0, -26, 6], UARM_R: [20, 0, 60], FARM_R: [0, 0, 5], WEAPON: [0, 0, -35], UARM_L: [-10, 0, -10], FARM_L: [0, 0, 60] },
    alt: {
      windup: { ...coil, HIPS: [0, 14, 2], CHEST: [0, 40, 6], HEAD: [0, -30, 0], UARM_R: [40, 0, 20], FARM_R: [0, 60, 110], WEAPON: [0, 0, -60], UARM_L: [10, 0, 20] },
      strike: { ...lunge, HIPS: [0, -14, -8], CHEST: [0, -30, -14], HEAD: [0, 24, 4], UARM_R: [-40, 0, 110], FARM_R: [0, 0, 10], WEAPON: [0, 0, 30], UARM_L: [10, 0, 30], FARM_L: [0, 0, 70] },
    },
  },
  thrust: {
    windup: { ...coil, CHEST: [0, -40, 0], HEAD: [0, 30, 0], UARM_R: [0, 0, 20], FARM_R: [0, 0, 120], WEAPON: [0, 0, -50] },
    strike: { ...deepLunge, CHEST: [0, 20, -12], HEAD: [0, -14, 4], UARM_R: [0, 0, 92], FARM_R: [0, 0, 0], WEAPON: [0, 0, -92], UARM_L: [10, 0, -20], FARM_L: [0, 0, 40] },
  },
  overhead: {
    windup: { CHEST: [0, -10, 18], SPINE: [0, 0, 8], HIPS: 6, HEAD: 20, CLAV_R: [0, 0, 12], CLAV_L: [0, 0, 12], UARM_R: [-10, 0, 195], FARM_R: [0, 0, 35], UARM_L: [0, 0, 170], FARM_L: [0, 0, 30], WEAPON: [0, 0, 40], hipsY: 0.02, THIGH_L: 18, SHIN_L: -10, THIGH_R: -14, SHIN_R: -12 },
    strike: { ...deepLunge, CHEST: [0, 10, -35], SPINE: [0, 0, -12], HIPS: -15, HEAD: -10, UARM_R: [10, 0, 65], FARM_R: [0, 0, 0], UARM_L: [0, 0, 60], FARM_L: [0, 0, 10], WEAPON: [0, 0, -55] },
  },
  bash: {
    windup: { ...coil, CHEST: [0, 35, 5], HIPS: [0, 20, 0], UARM_L: [0, 0, 15], FARM_L: [0, 0, 105] },
    strike: { ...lunge, CHEST: [0, -30, -18], HIPS: [0, -20, -6], UARM_L: [0, 0, 88], FARM_L: [0, 0, 8], OFFHAND: [0, -20, 0] },
  },
  spin: {
    windup: { ...coil, CHEST: [0, -70, 5], HIPS: [0, -25, 0], HEAD: [0, 50, 0], UARM_R: [-20, 0, -35], FARM_R: [0, 0, 30], WEAPON: [0, 0, 20] },
    strike: { ...lunge, CHEST: [0, 60, -12], HIPS: [0, 25, -5], HEAD: [0, -40, 0], UARM_R: [20, 0, 105], FARM_R: [0, 0, 0], WEAPON: [0, 0, -10], UARM_L: [-30, 0, -20] },
  },
  cast: {
    windup: { CHEST: [0, -15, 12], UARM_R: [0, 0, 125], FARM_R: [0, 0, 30], UARM_L: [0, 0, 60], FARM_L: [0, 0, 70], HEAD: 10, hipsX: -0.04 },
    strike: { ...lunge, CHEST: [0, 15, -12], UARM_R: [0, 0, 85], FARM_R: [0, 0, 0], UARM_L: [0, 0, 92], FARM_L: [0, 0, 0], OFFHAND: [-60, 0, -20], hipsY: -0.1 },
  },
  castBig: {
    windup: { CHEST: [0, 0, 18], SPINE: [0, 0, 10], HEAD: 25, CLAV_L: [0, 0, 15], CLAV_R: [0, 0, 15], UARM_R: [-20, 0, 170], FARM_R: [0, 0, 10], UARM_L: [20, 0, 170], FARM_L: [0, 0, 10], hipsY: 0.05, THIGH_L: 10, THIGH_R: -8 },
    strike: { CHEST: [0, 0, -18], HEAD: -5, UARM_R: [-30, 0, 65], FARM_R: [0, 0, 0], UARM_L: [30, 0, 65], FARM_L: [0, 0, 0], hipsY: -0.28,
      THIGH_L: [10, 0, 40], SHIN_L: -40, THIGH_R: [-10, 0, -30], SHIN_R: -40 },
  },
  guard: {
    windup: { CHEST: [0, 20, -6], UARM_L: [0, 0, 72], FARM_L: [0, 0, 72], OFFHAND: [0, -30, 0], UARM_R: [0, 0, 10], FARM_R: [0, 0, 70], hipsY: -0.18, hipsX: -0.04 },
    strike: { CHEST: [0, 25, -8], UARM_L: [0, 0, 75], FARM_L: [0, 0, 70], OFFHAND: [0, -30, 0], UARM_R: [0, 0, 10], FARM_R: [0, 0, 70], hipsY: -0.2, hipsX: -0.06 },
  },
  counter: {
    windup: { HIPS: -10, CHEST: [0, -45, -8], HEAD: [0, 35, 0], UARM_R: [-20, 0, -15], FARM_R: [0, 0, 70], WEAPON: [0, 0, 165], UARM_L: [0, 0, 10], FARM_L: [0, 0, 80], hipsY: -0.3,
      THIGH_L: [8, 0, 45], SHIN_L: -45, THIGH_R: [-8, 0, -35], SHIN_R: -35 },
    strike: { HIPS: -10, CHEST: [0, -45, -8], HEAD: [0, 35, 0], UARM_R: [-20, 0, -15], FARM_R: [0, 0, 70], WEAPON: [0, 0, 165], UARM_L: [0, 0, 10], FARM_L: [0, 0, 80], hipsY: -0.32,
      THIGH_L: [8, 0, 45], SHIN_L: -45, THIGH_R: [-8, 0, -35], SHIN_R: -35 },
  },
  dash: {
    windup: { HIPS: -15, CHEST: [0, -40, -20], HEAD: [0, 30, 14], UARM_R: [-20, 0, -30], FARM_R: [0, 0, 60], WEAPON: [0, 0, 160], hipsY: -0.35,
      THIGH_L: [8, 0, 55], SHIN_L: -60, THIGH_R: [-8, 0, -30], SHIN_R: -50 },
    strike: { HIPS: -25, CHEST: [0, 30, -30], HEAD: [0, -20, 20], UARM_R: [10, 0, 95], FARM_R: [0, 0, -5], WEAPON: [0, 0, -15], UARM_L: [0, 0, -40], hipsY: -0.32,
      THIGH_L: [8, 0, 70], SHIN_L: -20, THIGH_R: [-8, 0, -60], SHIN_R: -10 },
  },
  evade: {
    windup: { HIPS: 18, CHEST: 15, HEAD: -10, UARM_R: [0, 0, 40], UARM_L: [0, 0, 50], THIGH_L: 45, SHIN_L: -30, THIGH_R: -5, SHIN_R: -60, hipsY: -0.2 },
    strike: { HIPS: 22, CHEST: 18, HEAD: -10, UARM_R: [0, 0, 50], UARM_L: [0, 0, 55], THIGH_L: 50, SHIN_L: -40, THIGH_R: 0, SHIN_R: -70, hipsY: -0.25 },
  },
  blink: {
    windup: { CHEST: [0, 0, 10], UARM_L: [0, 0, 120], FARM_L: [0, 0, 20], HEAD: 10 },
    strike: { CHEST: [0, 0, -5], UARM_L: [0, 0, 90], FARM_L: [0, 0, 0] },
  },
  leap: {
    windup: { HIPS: 10, CHEST: [0, -10, 20], HEAD: 15, UARM_R: [-15, 0, 200], FARM_R: [0, 0, 30], UARM_L: [15, 0, 180], FARM_L: [0, 0, 30], WEAPON: [0, 0, 50],
      THIGH_L: 80, SHIN_L: -110, THIGH_R: 50, SHIN_R: -100, hipsY: 0.1 },
    strike: { HIPS: -20, CHEST: [0, 10, -40], HEAD: -10, UARM_R: [10, 0, 45], FARM_R: [0, 0, 0], UARM_L: [-10, 0, 45], FARM_L: [0, 0, 5], WEAPON: [0, 0, -80],
      THIGH_L: [8, 0, 65], SHIN_L: -70, THIGH_R: [-8, 0, -35], SHIN_R: -60, hipsY: -0.42 },
  },
  roar: {
    windup: { CHEST: [0, 0, 22], HEAD: 28, NECK: 10, UARM_R: [-40, 0, 90], FARM_R: [0, 0, 40], UARM_L: [40, 0, 90], FARM_L: [0, 0, 40], hipsY: -0.05 },
    strike: { CHEST: [0, 0, -12], HEAD: 5, NECK: 6, CLAV_L: [0, 0, 18], CLAV_R: [0, 0, 18], UARM_R: [-60, 0, 100], FARM_R: [0, 0, 120], UARM_L: [60, 0, 100], FARM_L: [0, 0, 120], hipsY: -0.25,
      THIGH_L: [12, 0, 40], SHIN_L: -30, THIGH_R: [-12, 0, -35], SHIN_R: -30 },
  },
  flurry: {
    windup: { HIPS: -10, CHEST: [0, -50, -10], UARM_R: [-30, 0, 140], FARM_R: [0, 0, 40], WEAPON: [0, 0, 60], hipsY: -0.25 },
    strike: { ...lunge, HIPS: -15, CHEST: [0, 40, -20], UARM_R: [20, 0, 55], FARM_R: [0, 0, 0], WEAPON: [0, 0, -40] },
  },
  throw: { // overhand throw with the off hand
    windup: { ...coil, HIPS: [0, 24, 0], CHEST: [0, 44, 10], HEAD: [0, -30, 4], UARM_L: [30, 0, 165], FARM_L: [0, 0, 70], OFFHAND: [0, 0, 40] },
    strike: { ...lunge, HIPS: [0, -20, -6], CHEST: [0, -36, -16], HEAD: [0, 20, 4], UARM_L: [-10, 0, 80], FARM_L: [0, 0, 0], OFFHAND: [0, 0, -40] },
  },
  shoot: { // off-hand launcher aimed and fired
    windup: { HIPS: [0, -16, 0], CHEST: [0, -30, 0], HEAD: [0, 26, 2], UARM_L: [0, 0, 84], FARM_L: [0, 0, 6], OFFHAND: [0, 0, -6], hipsX: -0.03 },
    strike: { HIPS: [0, -14, 0], CHEST: [0, -26, 6], HEAD: [0, 24, 6], UARM_L: [0, 0, 100], FARM_L: [0, 0, 30], OFFHAND: [0, 0, -6], hipsX: -0.08 },
  },
  slam: {
    windup: { CHEST: [0, -15, 22], SPINE: [0, 0, 10], HIPS: 8, HEAD: 15, CLAV_L: [0, 0, 14], CLAV_R: [0, 0, 14], UARM_R: [-10, 0, 200], FARM_R: [0, 0, 30], UARM_L: [10, 0, 190], FARM_L: [0, 0, 30], WEAPON: [0, 0, 40], hipsY: 0.04 },
    strike: { CHEST: [0, 5, -45], SPINE: [0, 0, -14], HIPS: -20, HEAD: -15, UARM_R: [10, 0, 40], FARM_R: [0, 0, 0], UARM_L: [-10, 0, 35], FARM_L: [0, 0, 5], WEAPON: [0, 0, -85],
      THIGH_L: [10, 0, 60], SHIN_L: -60, THIGH_R: [-10, 0, -40], SHIN_R: -50, hipsY: -0.45 },
  },
};

/** Per-grip overrides: the same ability reads differently with each weapon. */
const BY_GRIP: Partial<Record<GripStyle, Partial<Record<AnimKey, ActionSpec>>>> = {
  twoHand: {
    slash: {
      windup: { ...coil, HIPS: [0, -30, 4], SPINE: [0, -10, 0], CHEST: [0, -60, 10], HEAD: [0, 50, 0], CLAV_R: [0, 0, 10], UARM_R: [-40, 0, 160], FARM_R: [0, 0, 40], WEAPON: [0, 0, 80] },
      strike: { ...deepLunge, HIPS: [0, 24, -8], SPINE: [0, 12, -4], CHEST: [0, 46, -18], HEAD: [0, -36, 6], UARM_R: [30, 0, 50], FARM_R: [0, 0, 0], WEAPON: [0, 0, -50] },
      alt: {
        windup: { ...coil, HIPS: [0, 24, 2], CHEST: [0, 50, 6], HEAD: [0, -36, 0], UARM_R: [40, 0, 10], FARM_R: [0, 50, 90], WEAPON: [0, 0, -70] },
        strike: { ...deepLunge, HIPS: [0, -24, -8], CHEST: [0, -44, -14], HEAD: [0, 30, 4], UARM_R: [-40, 0, 120], FARM_R: [0, 0, 20], WEAPON: [0, 0, 40] },
      },
    },
    thrust: {
      windup: { ...coil, CHEST: [0, -30, 4], UARM_R: [-10, 0, 30], FARM_R: [0, 0, 110], WEAPON: [0, 0, -60] },
      strike: { ...deepLunge, CHEST: [0, 10, -14], UARM_R: [0, 0, 80], FARM_R: [0, 0, 10], WEAPON: [0, 0, -88] },
    },
  },
  polearm: {
    slash: {
      windup: { ...coil, HIPS: [0, -30, 0], CHEST: [0, -50, 6], HEAD: [0, 44, 0], UARM_R: [-20, 0, 150], FARM_R: [0, 0, 30], WEAPON: [0, 0, 40] },
      strike: { ...lunge, HIPS: [0, 20, -8], CHEST: [0, 40, -14], HEAD: [0, -30, 4], UARM_R: [20, 0, 40], FARM_R: [0, 0, 10], WEAPON: [0, 0, -60] },
    },
    thrust: {
      windup: { ...coil, HIPS: [0, -24, 0], CHEST: [0, -30, 0], HEAD: [0, 30, 0], UARM_R: [-20, 0, -30], FARM_R: [0, 0, 110], WEAPON: [0, 8, -80], hipsX: -0.1 },
      strike: { ...deepLunge, HIPS: [0, -6, -8], CHEST: [0, -6, -10], HEAD: [0, 10, 6], UARM_R: [-4, 0, 70], FARM_R: [0, 0, 20], WEAPON: [0, 0, -90] },
    },
    overhead: {
      windup: { CHEST: [0, -20, 20], HEAD: 20, UARM_R: [-10, 0, 170], FARM_R: [0, 0, 40], WEAPON: [0, 0, 20], hipsY: 0.02, THIGH_L: 16, THIGH_R: -12 },
      strike: { ...deepLunge, CHEST: [0, 10, -35], HEAD: -10, UARM_R: [10, 0, 70], FARM_R: [0, 0, 0], WEAPON: [0, 0, -70] },
    },
  },
  dual: {
    slash: {
      windup: { ...coil, CHEST: [0, -40, 6], HEAD: [0, 30, 0], UARM_R: [-30, 0, 120], FARM_R: [0, 30, 60], WEAPON: [0, 0, 20] },
      strike: { ...lunge, CHEST: [0, 30, -14], HEAD: [0, -20, 4], UARM_R: [20, 0, 70], FARM_R: [0, 0, 10], WEAPON: [0, 0, -60], UARM_L: [20, 0, 20] },
      alt: {
        windup: { ...coil, CHEST: [0, 30, 6], UARM_R: [30, 0, 40], FARM_R: [0, 40, 120], WEAPON: [0, 0, -80] },
        strike: { ...lunge, CHEST: [0, -30, -12], UARM_R: [-30, 0, 100], FARM_R: [0, 0, 20], WEAPON: [0, 0, -20] },
      },
    },
    thrust: {
      windup: { ...coil, CHEST: [0, -30, 0], UARM_R: [-10, 0, 0], FARM_R: [0, 0, 130], WEAPON: [0, 0, -60] },
      strike: { ...deepLunge, CHEST: [0, 24, -14], UARM_R: [0, 0, 88], FARM_R: [0, 0, 0], WEAPON: [0, 0, -88], UARM_L: [-20, 0, 40], FARM_L: [0, 0, 90] },
    },
  },
  fist: {
    slash: { // hook
      windup: { ...coil, HIPS: [0, -22, 0], CHEST: [0, -40, 6], HEAD: [0, 30, 10], UARM_R: [-60, 0, 40], FARM_R: [0, 0, 100] },
      strike: { ...lunge, HIPS: [0, 20, -6], CHEST: [0, 40, -10], HEAD: [0, -20, 10], UARM_R: [-80, 0, 86], FARM_R: [0, 40, 70], UARM_L: [20, 0, 40], FARM_L: [0, 0, 120] },
      alt: {
        windup: { ...coil, HIPS: [0, 16, 0], CHEST: [0, 30, 6], UARM_L: [60, 0, 40], FARM_L: [0, 0, 100] },
        strike: { ...lunge, HIPS: [0, -20, -6], CHEST: [0, -36, -10], UARM_L: [80, 0, 86], FARM_L: [0, -40, 70], UARM_R: [-20, 0, 30], FARM_R: [0, 0, 120] },
      },
    },
    thrust: { // straight punch
      windup: { ...coil, CHEST: [0, -30, 4], UARM_R: [-10, 0, 10], FARM_R: [0, 0, 130] },
      strike: { ...deepLunge, CHEST: [0, 30, -14], HEAD: [0, -10, 10], UARM_R: [0, 0, 88], FARM_R: [0, 0, 0], UARM_L: [20, 0, 40], FARM_L: [0, 0, 120] },
    },
    overhead: { // double hammer fist
      windup: { CHEST: [0, 0, 18], HEAD: 20, UARM_R: [-10, 0, 190], FARM_R: [0, 0, 40], UARM_L: [10, 0, 190], FARM_L: [0, 0, 40], hipsY: 0.03 },
      strike: { ...deepLunge, CHEST: [0, 0, -40], HEAD: -10, UARM_R: [6, 0, 70], FARM_R: [0, 0, 10], UARM_L: [-6, 0, 70], FARM_L: [0, 0, 10] },
    },
    guard: {
      windup: { CHEST: [0, 0, -10], HEAD: [0, 0, 20], UARM_R: [-10, 0, 40], FARM_R: [0, -30, 140], UARM_L: [10, 0, 40], FARM_L: [0, 30, 140], hipsY: -0.16 },
      strike: { CHEST: [0, 0, -12], HEAD: [0, 0, 24], UARM_R: [-10, 0, 42], FARM_R: [0, -30, 142], UARM_L: [10, 0, 42], FARM_L: [0, 30, 142], hipsY: -0.18 },
    },
  },
  bow: {
    shoot: { // draw to the cheek, then release
      windup: { HIPS: [0, -24, 0], CHEST: [0, -30, -2], HEAD: [0, 30, 4], UARM_L: [0, 0, 88], FARM_L: [0, 0, 2], UARM_R: [-20, 0, 92], FARM_R: [0, -30, 152], WEAPON: [0, 0, -20], hipsX: -0.03 },
      strike: { HIPS: [0, -24, 0], CHEST: [0, -32, 2], HEAD: [0, 30, 6], UARM_L: [0, 0, 92], FARM_L: [0, 0, 6], UARM_R: [-30, 0, 70], FARM_R: [0, -30, 60], WEAPON: [0, 0, -20], hipsX: -0.07 },
    },
    slash: { // bow bash
      windup: { ...coil, CHEST: [0, -40, 6], UARM_L: [20, 0, 150], FARM_L: [0, 0, 30] },
      strike: { ...lunge, CHEST: [0, 30, -14], UARM_L: [-10, 0, 60], FARM_L: [0, 0, 0] },
    },
  },
  staff: {
    slash: {
      windup: { ...coil, CHEST: [0, -40, 8], UARM_R: [-20, 0, 140], FARM_R: [0, 0, 50], WEAPON: [0, 0, 30] },
      strike: { ...lunge, CHEST: [0, 30, -16], UARM_R: [20, 0, 70], FARM_R: [0, 0, 10], WEAPON: [0, 0, -50] },
    },
    cast: {
      windup: { CHEST: [0, -20, 10], HEAD: 10, UARM_R: [0, 0, 110], FARM_R: [0, 0, 20], WEAPON: [0, 0, -20], UARM_L: [10, 0, 50], FARM_L: [0, 0, 60], hipsX: -0.05 },
      strike: { ...lunge, CHEST: [0, 14, -12], UARM_R: [0, 0, 80], FARM_R: [0, 0, 0], WEAPON: [0, 0, -50], UARM_L: [0, 0, 80], FARM_L: [0, 0, 0], OFFHAND: [-70, 0, -20] },
    },
    guard: {
      windup: { CHEST: [0, 10, -6], UARM_R: [-10, 0, 60], FARM_R: [0, 0, 40], WEAPON: [0, 0, -10], UARM_L: [0, 0, 70], FARM_L: [0, 0, 50], hipsY: -0.16 },
      strike: { CHEST: [0, 12, -8], UARM_R: [-10, 0, 62], FARM_R: [0, 0, 40], WEAPON: [0, 0, -10], UARM_L: [0, 0, 72], FARM_L: [0, 0, 50], hipsY: -0.18 },
    },
  },
};

/** Guard and bash depend on what the off hand carries. */
const BY_OFFHAND: Partial<Record<OffhandStyle, Partial<Record<AnimKey, ActionSpec>>>> = {
  none: {
    guard: { // weapon held crosswise in front of the body
      windup: { CHEST: [0, 10, -6], UARM_R: [-20, 0, 50], FARM_R: [0, -40, 80], WEAPON: [0, 0, 20], UARM_L: [10, 0, 50], FARM_L: [0, 0, 90], hipsY: -0.16, hipsX: -0.04 },
      strike: { CHEST: [0, 12, -8], UARM_R: [-20, 0, 52], FARM_R: [0, -40, 82], WEAPON: [0, 0, 20], UARM_L: [10, 0, 52], FARM_L: [0, 0, 92], hipsY: -0.18, hipsX: -0.06 },
    },
    bash: { // shoulder charge
      windup: { ...coil, CHEST: [0, 30, 10], HIPS: [0, 20, 0], UARM_L: [20, 0, 20], FARM_L: [0, 0, 100] },
      strike: { ...deepLunge, CHEST: [0, 50, -24], HIPS: [0, 20, -8], HEAD: [0, -30, 10], UARM_L: [-20, 0, 10], FARM_L: [0, 0, 110] },
    },
  },
  weapon: {
    slash: {
      windup: { ...coil, CHEST: [0, -40, 6], UARM_R: [-30, 0, 140], FARM_R: [0, 0, 50], WEAPON: [0, 0, 60], UARM_L: [20, 0, 120], FARM_L: [0, 0, 60], OFFHAND: [0, 0, 60] },
      strike: { ...lunge, CHEST: [0, 30, -16], UARM_R: [20, 0, 60], FARM_R: [0, 0, 5], WEAPON: [0, 0, -35], UARM_L: [-20, 0, 40], FARM_L: [0, 0, 30], OFFHAND: [0, 0, -40] },
      alt: {
        windup: { ...coil, CHEST: [0, 40, 6], UARM_L: [30, 0, 140], FARM_L: [0, 0, 50], OFFHAND: [0, 0, 60], UARM_R: [-20, 0, 40], FARM_R: [0, 0, 90] },
        strike: { ...lunge, CHEST: [0, -30, -16], UARM_L: [-20, 0, 60], FARM_L: [0, 0, 5], OFFHAND: [0, 0, -35], UARM_R: [20, 0, 40], FARM_R: [0, 0, 40] },
      },
    },
    guard: {
      windup: { CHEST: [0, 10, -6], UARM_R: [-20, 0, 50], FARM_R: [0, -30, 90], WEAPON: [0, 0, 40], UARM_L: [20, 0, 50], FARM_L: [0, 30, 90], OFFHAND: [0, 0, 40], hipsY: -0.16 },
      strike: { CHEST: [0, 12, -8], UARM_R: [-20, 0, 52], FARM_R: [0, -30, 92], WEAPON: [0, 0, 40], UARM_L: [20, 0, 52], FARM_L: [0, 30, 92], OFFHAND: [0, 0, 40], hipsY: -0.18 },
    },
  },
  focus: {
    cast: {
      windup: { CHEST: [0, -20, 10], HEAD: 10, UARM_L: [20, 0, 120], FARM_L: [0, 0, 40], OFFHAND: [-40, 0, 0], hipsX: -0.05 },
      strike: { ...lunge, CHEST: [0, 20, -12], UARM_L: [0, 0, 88], FARM_L: [0, 0, 0], OFFHAND: [-80, 0, -30] },
    },
  },
};

const cache = new Map<string, ActionPoses>();

export function actionPoses(grip: GripStyle, off: OffhandStyle, form: BodyForm, anim: AnimKey): ActionPoses {
  const key = `${grip}|${off}|${form.id}|${anim}`;
  let p = cache.get(key);
  if (!p) {
    const ready = stance(grip, off, form);
    const spec = BY_GRIP[grip]?.[anim] ?? BY_OFFHAND[off]?.[anim] ?? GENERIC[anim] ?? GENERIC.slash;
    // Shield users keep the shield up while swinging with the weapon arm.
    const build = (s: PoseSpec) => {
      const pose = makePose(s, ready);
      if (off === 'shield' && !('UARM_L' in s)) makePose(OFFHAND_READY.shield, pose);
      return pose;
    };
    p = { windup: build(spec.windup), strike: build(spec.strike) };
    if (spec.alt) p.alt = { windup: build(spec.alt.windup), strike: build(spec.alt.strike) };
    cache.set(key, p);
  }
  return p;
}

// -----------------------------------------------------------------------------
// Reactions and finishers
// -----------------------------------------------------------------------------

/** Additive flinch: chest and head snap back, knees give. */
export const HURT_ADD = makePose({ SPINE: [0, 0, 10], CHEST: [0, 0, 18], NECK: [0, 0, 8], HEAD: [0, 0, 16], HIPS: 6, UARM_R: [0, 0, -15], UARM_L: [0, 0, -15], hipsY: -0.08, hipsX: -0.06 });

/** Lying on the back after a knockout (hips rotated so the torso points backwards). */
export const KO_POSE = makePose({
  HIPS: [0, 0, 92], SPINE: [0, 0, -4], CHEST: [0, 10, -6], NECK: [0, 0, -10], HEAD: [0, 30, -16],
  CLAV_L: [0, 0, 6], CLAV_R: [0, 0, 6],
  UARM_L: [75, 0, 20], FARM_L: [0, 0, 40], UARM_R: [-60, 0, 30], FARM_R: [0, 0, 60], WEAPON: [0, 0, 20],
  THIGH_L: [10, 0, 48], SHIN_L: -84, FOOT_L: 20, THIGH_R: [-12, 0, 8], SHIN_R: -12, FOOT_R: 10,
  hipsY: -0.78,
});
/** Mid-fall: knees buckle and the body arches backwards. */
export const KO_FALL = makePose({
  HIPS: [0, 0, 40], SPINE: [0, 0, 14], CHEST: [0, 0, 20], NECK: [0, 0, 10], HEAD: [0, 0, 24],
  UARM_L: [30, 0, 100], FARM_L: [0, 0, 40], UARM_R: [-30, 0, 90], FARM_R: [0, 0, 40],
  THIGH_L: [8, 0, 10], SHIN_L: -80, FOOT_L: 20, THIGH_R: [-8, 0, -20], SHIN_R: -70, FOOT_R: 30,
  hipsY: -0.42, hipsX: -0.2,
});

const VICTORY_BY_GRIP: Record<GripStyle, PoseSpec> = {
  oneHand: { CHEST: [0, 10, 8], HEAD: [0, 15, 18], UARM_R: [-20, 0, 175], FARM_R: [0, 0, 5], WEAPON: [0, 0, 70], UARM_L: [10, 0, 20], FARM_L: [0, 0, 60] },
  twoHand: { CHEST: [0, 0, 18], HEAD: [0, 0, 25], UARM_R: [-50, 0, 120], FARM_R: [0, 0, 110], UARM_L: [50, 0, 120], FARM_L: [0, 0, 110], WEAPON: [0, 0, 60], hipsY: -0.1 },
  polearm: { CHEST: [0, 0, 10], HEAD: [0, 0, 20], UARM_R: [-10, 0, 40], FARM_R: [0, 0, 50], WEAPON: [0, 0, 0], UARM_L: [30, 0, 160], FARM_L: [0, 0, 20] },
  dual: { CHEST: [0, -30, -2], HEAD: [0, 30, 0], UARM_R: [-15, 0, -10], FARM_R: [0, 0, 60], WEAPON: [0, 0, 170], UARM_L: [10, 0, 10], FARM_L: [0, 0, 80] },
  staff: { CHEST: [0, 0, 10], HEAD: [0, 0, 20], UARM_R: [-25, 0, 165], FARM_R: [0, 0, 10], WEAPON: [0, 0, -60], UARM_L: [25, 0, 140], FARM_L: [0, 0, 20] },
  fist: { CHEST: [0, 0, 18], HEAD: [0, 0, 25], UARM_R: [-30, 0, 170], FARM_R: [0, 0, 30], UARM_L: [30, 0, 60], FARM_L: [0, 0, 120] },
  bow: { CHEST: [0, 0, 10], HEAD: [0, 0, 20], UARM_R: [-20, 0, 170], FARM_R: [0, 0, 10], UARM_L: [10, 0, 20], FARM_L: [0, 0, 40] },
};

export function victoryPose(grip: GripStyle, off: OffhandStyle, form: BodyForm): Pose {
  return makePose({ THIGH_L: [8, 0, 10], SHIN_L: -6, THIGH_R: [-8, 0, -8], SHIN_R: -6, hipsY: -0.02, ...VICTORY_BY_GRIP[grip] }, stance(grip, off, form));
}
