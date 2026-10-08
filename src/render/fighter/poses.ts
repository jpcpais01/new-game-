import type { AnimKey, ClassId } from '../../sim/types';

/** Joint order for pose arrays. Each joint stores an XYZ euler (radians). */
export const J = {
  HIPS: 0, SPINE: 1, CHEST: 2, HEAD: 3,
  UARM_L: 4, FARM_L: 5, UARM_R: 6, FARM_R: 7,
  THIGH_L: 8, SHIN_L: 9, THIGH_R: 10, SHIN_R: 11,
  WEAPON: 12, OFFHAND: 13,
} as const;
export const JOINT_COUNT = 14;
/** Extra scalar slot after the joints: hip height offset. */
export const POSE_SIZE = JOINT_COUNT * 3 + 1;
export const HIPS_Y = JOINT_COUNT * 3;

export type Pose = Float32Array;
type JointName = keyof typeof J;
/** Compact authoring format: joint -> [x, y, z] in degrees (missing axes = 0). */
type PoseSpec = Partial<Record<JointName, [number, number?, number?] | number>> & { hipsY?: number };

const D2R = Math.PI / 180;

/** Builds a pose; a bare number is shorthand for a Z rotation (the swing axis in side view). */
export function makePose(spec: PoseSpec, base?: Pose): Pose {
  const p = base ? base.slice() : new Float32Array(POSE_SIZE);
  for (const k in spec) {
    if (k === 'hipsY') { p[HIPS_Y] = spec.hipsY!; continue; }
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

export function lerpPose(out: Pose, a: Pose, b: Pose, t: number): Pose {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

// -----------------------------------------------------------------------------
// Ready stances per class
// -----------------------------------------------------------------------------

const legsStance = { THIGH_L: 24, SHIN_L: -22, THIGH_R: -18, SHIN_R: -26 } as const;

export const READY: Record<ClassId, Pose> = {
  vanguard: makePose({
    HIPS: -4, SPINE: -3, CHEST: [0, -18, -4], HEAD: [0, 14, 6],
    UARM_R: [-10, 0, 20], FARM_R: [0, 0, 75], WEAPON: [0, 0, 35],
    UARM_L: [10, 0, 35], FARM_L: [0, 0, 70], OFFHAND: [0, -10, 0],
    ...legsStance, hipsY: -0.08,
  }),
  ronin: makePose({
    HIPS: -8, SPINE: -4, CHEST: [0, -25, -4], HEAD: [0, 20, 8],
    UARM_R: [-15, 0, 10], FARM_R: [0, 0, 85], WEAPON: [0, 0, 55],
    UARM_L: [15, 0, 25], FARM_L: [0, 0, 85],
    THIGH_L: 34, SHIN_L: -30, THIGH_R: -26, SHIN_R: -30, hipsY: -0.16,
  }),
  arcanist: makePose({
    HIPS: -2, SPINE: 0, CHEST: [0, -10, 0], HEAD: [0, 8, 4],
    UARM_R: [-8, 0, 12], FARM_R: [0, 0, 70], WEAPON: [0, 0, 0],
    UARM_L: [12, 0, 30], FARM_L: [0, 0, 55],
    THIGH_L: 14, SHIN_L: -12, THIGH_R: -10, SHIN_R: -14, hipsY: -0.04,
  }),
  brute: makePose({
    HIPS: -8, SPINE: -6, CHEST: [0, -20, -8], HEAD: [0, 15, 14],
    UARM_R: [-15, 0, 25], FARM_R: [0, 0, 70], WEAPON: [0, 0, 70],
    UARM_L: [20, 0, 35], FARM_L: [0, 0, 75],
    THIGH_L: 28, SHIN_L: -26, THIGH_R: -22, SHIN_R: -28, hipsY: -0.14,
  }),
};

// -----------------------------------------------------------------------------
// Action poses: windup and strike keyframes
// -----------------------------------------------------------------------------

export interface ActionPoses {
  windup: Pose;
  strike: Pose;
}

function action(windup: PoseSpec, strike: PoseSpec): (ready: Pose) => ActionPoses {
  return (ready) => ({ windup: makePose(windup, ready), strike: makePose(strike, ready) });
}

const lunge = { THIGH_L: 50, SHIN_L: -15, THIGH_R: -42, SHIN_R: -10, hipsY: -0.2 } as const;

const ACTIONS: Record<AnimKey, (ready: Pose) => ActionPoses> = {
  slash: action(
    { CHEST: [0, -50, 8], HIPS: [0, -15, 4], UARM_R: [-30, 0, 150], FARM_R: [0, 0, 50], WEAPON: [0, 0, 70] },
    { CHEST: [0, 35, -18], HIPS: [0, 15, -10], UARM_R: [20, 0, 60], FARM_R: [0, 0, 5], WEAPON: [0, 0, -35], ...lunge },
  ),
  thrust: action(
    { CHEST: [0, -40, 0], UARM_R: [0, 0, 20], FARM_R: [0, 0, 120], WEAPON: [0, 0, 0] },
    { CHEST: [0, 20, -12], UARM_R: [0, 0, 92], FARM_R: [0, 0, 0], WEAPON: [0, 0, 0], ...lunge },
  ),
  overhead: action(
    { CHEST: [0, -10, 18], HIPS: 6, HEAD: 20, UARM_R: [-10, 0, 195], FARM_R: [0, 0, 35], UARM_L: [0, 0, 170], FARM_L: [0, 0, 30], WEAPON: [0, 0, 40], hipsY: 0.02 },
    { CHEST: [0, 10, -35], HIPS: -15, HEAD: -10, UARM_R: [10, 0, 65], FARM_R: [0, 0, 0], UARM_L: [0, 0, 60], FARM_L: [0, 0, 10], WEAPON: [0, 0, -55], ...lunge, hipsY: -0.3 },
  ),
  bash: action(
    { CHEST: [0, 35, 5], UARM_L: [0, 0, 15], FARM_L: [0, 0, 105] },
    { CHEST: [0, -30, -18], UARM_L: [0, 0, 88], FARM_L: [0, 0, 8], OFFHAND: [0, -20, 0], ...lunge },
  ),
  spin: action(
    { CHEST: [0, -70, 5], HIPS: [0, -25, 0], UARM_R: [-20, 0, -35], FARM_R: [0, 0, 30], WEAPON: [0, 0, 20] },
    { CHEST: [0, 60, -12], HIPS: [0, 25, -5], UARM_R: [20, 0, 105], FARM_R: [0, 0, 0], WEAPON: [0, 0, -10], ...lunge },
  ),
  cast: action(
    { CHEST: [0, -15, 12], UARM_R: [0, 0, 125], FARM_R: [0, 0, 30], UARM_L: [0, 0, 60], FARM_L: [0, 0, 70], HEAD: 10 },
    { CHEST: [0, 15, -12], UARM_R: [0, 0, 85], FARM_R: [0, 0, 0], UARM_L: [0, 0, 92], FARM_L: [0, 0, 0], ...lunge, hipsY: -0.1 },
  ),
  castBig: action(
    { CHEST: [0, 0, 18], HEAD: 25, UARM_R: [-20, 0, 170], FARM_R: [0, 0, 10], UARM_L: [20, 0, 170], FARM_L: [0, 0, 10], hipsY: 0.05 },
    { CHEST: [0, 0, -18], HEAD: -5, UARM_R: [-30, 0, 65], FARM_R: [0, 0, 0], UARM_L: [30, 0, 65], FARM_L: [0, 0, 0], hipsY: -0.28,
      THIGH_L: 40, SHIN_L: -40, THIGH_R: -30, SHIN_R: -40 },
  ),
  guard: action(
    { CHEST: [0, 20, -6], UARM_L: [0, 0, 72], FARM_L: [0, 0, 72], OFFHAND: [0, -30, 0], UARM_R: [0, 0, 10], FARM_R: [0, 0, 70], hipsY: -0.18 },
    { CHEST: [0, 25, -8], UARM_L: [0, 0, 75], FARM_L: [0, 0, 70], OFFHAND: [0, -30, 0], UARM_R: [0, 0, 10], FARM_R: [0, 0, 70], hipsY: -0.2 },
  ),
  counter: action(
    { HIPS: -10, CHEST: [0, -45, -8], HEAD: [0, 35, 0], UARM_R: [-20, 0, -15], FARM_R: [0, 0, 70], WEAPON: [0, 0, 165], UARM_L: [0, 0, 10], FARM_L: [0, 0, 80], hipsY: -0.3,
      THIGH_L: 45, SHIN_L: -45, THIGH_R: -35, SHIN_R: -35 },
    { HIPS: -10, CHEST: [0, -45, -8], HEAD: [0, 35, 0], UARM_R: [-20, 0, -15], FARM_R: [0, 0, 70], WEAPON: [0, 0, 165], UARM_L: [0, 0, 10], FARM_L: [0, 0, 80], hipsY: -0.32,
      THIGH_L: 45, SHIN_L: -45, THIGH_R: -35, SHIN_R: -35 },
  ),
  dash: action(
    { HIPS: -15, CHEST: [0, -40, -20], UARM_R: [-20, 0, -30], FARM_R: [0, 0, 60], WEAPON: [0, 0, 160], hipsY: -0.35,
      THIGH_L: 55, SHIN_L: -60, THIGH_R: -30, SHIN_R: -50 },
    { HIPS: -25, CHEST: [0, 30, -30], UARM_R: [10, 0, 95], FARM_R: [0, 0, -5], WEAPON: [0, 0, -15], UARM_L: [0, 0, -40], hipsY: -0.32,
      THIGH_L: 70, SHIN_L: -20, THIGH_R: -60, SHIN_R: -10 },
  ),
  evade: action(
    { HIPS: 18, CHEST: 15, HEAD: -10, UARM_R: [0, 0, 40], UARM_L: [0, 0, 50], THIGH_L: 45, SHIN_L: -30, THIGH_R: -5, SHIN_R: -60, hipsY: -0.2 },
    { HIPS: 22, CHEST: 18, HEAD: -10, UARM_R: [0, 0, 50], UARM_L: [0, 0, 55], THIGH_L: 50, SHIN_L: -40, THIGH_R: 0, SHIN_R: -70, hipsY: -0.25 },
  ),
  blink: action(
    { CHEST: [0, 0, 10], UARM_L: [0, 0, 120], FARM_L: [0, 0, 20], HEAD: 10 },
    { CHEST: [0, 0, -5], UARM_L: [0, 0, 90], FARM_L: [0, 0, 0] },
  ),
  leap: action(
    { HIPS: 10, CHEST: [0, -10, 20], HEAD: 15, UARM_R: [-15, 0, 200], FARM_R: [0, 0, 30], UARM_L: [15, 0, 180], FARM_L: [0, 0, 30], WEAPON: [0, 0, 50],
      THIGH_L: 80, SHIN_L: -110, THIGH_R: 50, SHIN_R: -100, hipsY: 0.1 },
    { HIPS: -20, CHEST: [0, 10, -40], HEAD: -10, UARM_R: [10, 0, 45], FARM_R: [0, 0, 0], UARM_L: [-10, 0, 45], FARM_L: [0, 0, 5], WEAPON: [0, 0, -80],
      THIGH_L: 65, SHIN_L: -70, THIGH_R: -35, SHIN_R: -60, hipsY: -0.42 },
  ),
  roar: action(
    { CHEST: [0, 0, 22], HEAD: 28, UARM_R: [-40, 0, 90], FARM_R: [0, 0, 40], UARM_L: [40, 0, 90], FARM_L: [0, 0, 40], hipsY: -0.05 },
    { CHEST: [0, 0, -12], HEAD: 5, UARM_R: [-60, 0, 100], FARM_R: [0, 0, 120], UARM_L: [60, 0, 100], FARM_L: [0, 0, 120], hipsY: -0.25,
      THIGH_L: 40, SHIN_L: -30, THIGH_R: -35, SHIN_R: -30 },
  ),
  flurry: action(
    { HIPS: -10, CHEST: [0, -50, -10], UARM_R: [-30, 0, 140], FARM_R: [0, 0, 40], WEAPON: [0, 0, 60], hipsY: -0.25 },
    { HIPS: -15, CHEST: [0, 40, -20], UARM_R: [20, 0, 55], FARM_R: [0, 0, 0], WEAPON: [0, 0, -40], ...lunge },
  ),
  slam: action(
    { CHEST: [0, -15, 22], HIPS: 8, HEAD: 15, UARM_R: [-10, 0, 200], FARM_R: [0, 0, 30], UARM_L: [10, 0, 190], FARM_L: [0, 0, 30], WEAPON: [0, 0, 40], hipsY: 0.04 },
    { CHEST: [0, 5, -45], HIPS: -20, HEAD: -15, UARM_R: [10, 0, 40], FARM_R: [0, 0, 0], UARM_L: [-10, 0, 35], FARM_L: [0, 0, 5], WEAPON: [0, 0, -85],
      THIGH_L: 60, SHIN_L: -60, THIGH_R: -40, SHIN_R: -50, hipsY: -0.45 },
  ),
};

const cache = new Map<string, ActionPoses>();

export function actionPoses(classId: ClassId, anim: AnimKey): ActionPoses {
  const key = classId + anim;
  let p = cache.get(key);
  if (!p) {
    p = ACTIONS[anim](READY[classId]);
    if (classId === 'brute') twoHanded(p.windup), twoHanded(p.strike);
    cache.set(key, p);
  }
  return p;
}

/** Brute grips the hammer with both hands: the off arm follows the weapon arm. */
function twoHanded(p: Pose): void {
  p[J.UARM_L * 3 + 2] = p[J.UARM_R * 3 + 2] - 0.15;
  p[J.FARM_L * 3 + 2] = p[J.FARM_R * 3 + 2] + 0.2;
  p[J.UARM_L * 3] = -p[J.UARM_R * 3] + 0.5;
}

export const HURT_ADD = makePose({ CHEST: [0, 0, 22], HEAD: [0, 0, 18], HIPS: 8, UARM_R: [0, 0, -15], UARM_L: [0, 0, -15], hipsY: -0.08 });

export const VICTORY: Record<ClassId, Pose> = {
  vanguard: makePose({ CHEST: [0, 10, 8], HEAD: [0, 15, 18], UARM_R: [-20, 0, 175], FARM_R: [0, 0, 5], WEAPON: [0, 0, 70], UARM_L: [10, 0, 20], FARM_L: [0, 0, 60], THIGH_L: 10, THIGH_R: -8 }),
  ronin: makePose({ CHEST: [0, -30, -2], HEAD: [0, 30, 0], UARM_R: [-15, 0, -10], FARM_R: [0, 0, 60], WEAPON: [0, 0, 170], UARM_L: [10, 0, 10], FARM_L: [0, 0, 80], THIGH_L: 12, THIGH_R: -8 }),
  arcanist: makePose({ CHEST: [0, 0, 10], HEAD: [0, 0, 20], UARM_R: [-25, 0, 165], FARM_R: [0, 0, 10], WEAPON: [0, 0, -60], UARM_L: [25, 0, 140], FARM_L: [0, 0, 20] }),
  brute: makePose({ CHEST: [0, 0, 18], HEAD: [0, 0, 25], UARM_R: [-50, 0, 120], FARM_R: [0, 0, 110], UARM_L: [50, 0, 120], FARM_L: [0, 0, 110], WEAPON: [0, 0, 60], THIGH_L: 25, SHIN_L: -20, THIGH_R: -25, hipsY: -0.1 }),
};
