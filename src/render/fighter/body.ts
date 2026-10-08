import type { Bone, Vector3 } from 'three';
import { lathe, organ, rbox, sphere, torus, capsule, limb } from './geo';
import type { RigBuildApi } from './look';
import { J } from './poses';
import type { RigPartSpec } from './rig';

/**
 * Anatomical base body for any form: pelvis, waist, ribcage with pecs and
 * traps, deltoids, tapered muscular limbs, fists and boots, wearing a simple
 * shirt, trousers and boots in the character's colours. Flesh parts are
 * `smooth`, so the bake blends their skin weights across elbows, knees, hips
 * and the spine and the body bends like one surface instead of segments.
 */
export function buildBody(api: RigBuildApi, j: Bone[]): void {
  const { metrics: m, appearance: a } = api;
  const s = m.form.shape;
  const mu = s.muscle;
  const part = (parent: Bone, g: Parameters<RigBuildApi['part']>[1], spec: RigPartSpec, o?: Parameters<RigBuildApi['part']>[3]) =>
    api.part(parent, g, { smooth: true, ...spec }, o);
  const solid = (color: number, extra: Partial<RigPartSpec> = {}): RigPartSpec => ({ color, ...extra });
  const skin = solid(a.skin);
  const shirt = solid(a.primary);
  const pants = solid(a.secondary);
  const boots = solid(a.leather);
  const dark = mix(a.leather, 0x0d0b10, 0.55);

  // --- Pelvis and glutes ------------------------------------------------------
  const pelvisW = s.hipW + s.thighR * 0.9;
  const pelvisD = s.chestD * 0.86 + s.belly * 0.03;
  part(j[J.HIPS], lathe('pelvis', [[0, -0.15], [0.62, -0.13], [0.92, -0.06], [1, 0.03], [0.94, 0.1], [0.82, 0.15], [0, 0.16]], 20), pants, { scale: [pelvisD, 1, pelvisW] });
  for (const z of [-1, 1]) {
    part(j[J.HIPS], sphere(s.thighR * 1.05, 12, 10), pants, { pos: [-pelvisD * 0.45, -0.07, z * s.hipW * 0.85], scale: [0.85, 1, 0.95] });
  }

  // --- Waist and belly --------------------------------------------------------
  const waistD = s.waistW * 0.8 + s.belly * 0.05;
  const wl = s.waistLen + s.chestLen;
  part(j[J.SPINE], lathe('waist', [[0, -0.1], [0.92, -0.08], [0.9, 0.04], [0.86, wl * 0.45], [0.96, wl * 0.85], [0, wl]], 20), shirt, { scale: [waistD, 1, s.waistW] });
  if (s.belly > 0) {
    part(j[J.SPINE], sphere(0.12 + s.belly * 0.06, 16, 12), shirt, { pos: [waistD * 0.42, 0.04 + s.belly * 0.02, 0], scale: [0.95, 0.95, 1.25] });
  }

  // --- Ribcage, pecs, traps, collar -------------------------------------------
  const ny = s.neckLen;
  const vNeck = (p: Vector3) => {
    // A V-neck: skin shows in a wedge at the front of the collar.
    const depth = (p.y - ny * 0.78) / (ny * 0.22);
    return p.x > 0.35 && depth > 0 && Math.abs(p.z) < depth * 0.32 ? a.skin : a.primary;
  };
  part(j[J.CHEST], lathe('ribs', [
    [0, -0.06], [0.82, -0.05], [0.93, ny * 0.25], [1, ny * 0.6], [0.97, ny * 0.8], [0.8, ny * 0.95], [0.42, ny * 1.04], [0, ny * 1.06],
  ], 22), { ...shirt, paint: vNeck }, { scale: [s.chestD, 1, s.chestW] });
  if (mu > 0.2) {
    for (const z of [-1, 1]) {
      part(j[J.CHEST], sphere(0.1, 14, 10), shirt, {
        pos: [s.chestD * 0.62, ny * 0.66, z * s.chestW * 0.44], scale: [0.25 + 0.4 * mu, 0.72, 0.95 + 0.2 * mu],
      });
    }
  }
  // Trapezius: slope from the neck down to the shoulders.
  part(j[J.CHEST], sphere(1, 18, 10), shirt, { pos: [-0.02, ny * 0.9, 0], scale: [s.chestD * 0.62, 0.07 + mu * 0.03, s.shoulderW * 0.82] });
  part(j[J.CHEST], torus(s.neckR * 1.15, 0.022, Math.PI * 2, 6, 18), solid(a.accent), { pos: [0.01, ny * 1.02, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1.1, 1] });

  // --- Neck ------------------------------------------------------------------
  part(j[J.NECK], limb(s.neckR * 1.05, s.neckR * 0.92, 0.17), skin, { pos: [0, 0.12, 0] });

  // --- Arms ------------------------------------------------------------------
  for (const [ua, fa, hand, side] of [[J.UARM_L, J.FARM_L, J.HAND_L, -1], [J.UARM_R, J.FARM_R, J.HAND_R, 1]] as const) {
    const arm = s.armR, fore = s.foreR;
    // Deltoid: covers the rigid shoulder joint.
    part(j[ua], sphere(arm * 1.32, 16, 12), { ...shirt, smooth: false }, { pos: [0, -0.02, 0], scale: [1.08, 1.05, 1] });
    const sleeve = (p: Vector3) => (p.y > -s.upperArm * 0.42 ? a.primary : a.skin);
    part(j[ua], organ(s.upperArm, [[0, arm * 1.15], [0.35, arm * (1.02 + 0.12 * mu)], [0.62, arm * 0.98], [1, fore * 0.98]]), { ...skin, paint: sleeve });
    if (mu > 0.25) {
      // Biceps (front) and triceps (back).
      part(j[ua], sphere(arm * 0.72, 12, 10), skin, { pos: [arm * 0.42, -s.upperArm * 0.5, 0], scale: [0.7 + 0.3 * mu, 1.5, 0.9] });
      part(j[ua], sphere(arm * 0.7, 12, 10), skin, { pos: [-arm * 0.45, -s.upperArm * 0.42, 0], scale: [0.6 + 0.2 * mu, 1.6, 0.9] });
    }
    const wrap = (p: Vector3) => (p.y < -s.forearm * 0.74 ? a.leather : a.skin);
    part(j[fa], organ(s.forearm, [[0, fore * 1.02], [0.22, fore * (1.1 + 0.15 * mu)], [0.6, fore * 0.86], [1, fore * 0.68]]), { ...skin, paint: wrap });
    fist(api, j[hand], side, a.skin);
  }

  // --- Legs ------------------------------------------------------------------
  for (const [th, sh, ft, side] of [[J.THIGH_L, J.SHIN_L, J.FOOT_L, -1], [J.THIGH_R, J.SHIN_R, J.FOOT_R, 1]] as const) {
    const tr = s.thighR, cr = s.calfR;
    part(j[th], organ(s.thigh, [[0, tr * 1.1], [0.22, tr * (1.06 + 0.06 * mu)], [0.65, tr * 0.88], [1, cr * 0.96]]), pants);
    if (mu > 0.3) part(j[th], sphere(tr * 0.75, 12, 10), pants, { pos: [tr * 0.4, -s.thigh * 0.38, 0], scale: [0.7 + 0.2 * mu, 1.7, 0.9] });
    // Kneecap.
    part(j[sh], sphere(cr * 0.62, 10, 8), pants, { pos: [cr * 0.48, 0.0, 0], scale: [0.8, 1, 1] });
    const bootLine = -s.shin * 0.42;
    const shinPaint = (p: Vector3) => (p.y < bootLine ? a.leather : a.secondary);
    part(j[sh], organ(s.shin, [[0, cr * 0.98], [0.26, cr * 1.06], [0.62, cr * 0.82], [1, cr * 0.7]]), { ...pants, paint: shinPaint });
    // Calf muscle at the back.
    part(j[sh], sphere(cr * 0.8, 12, 10), pants, { pos: [-cr * 0.45, -s.shin * 0.24, 0], scale: [0.75 + 0.25 * mu, 1.55, 0.9] });
    // Boot cuff.
    part(j[sh], torus(cr * 0.82, 0.018, Math.PI * 2, 5, 16), { ...boots, smooth: false }, { pos: [0, bootLine, 0], rot: [Math.PI / 2, 0, 0] });
    // Shoe: rigid on the foot bone, toe pointing +X.
    const fs = s.footS;
    api.part(j[ft], rbox(0.27 * fs, 0.1, 0.125 * fs, 0.045), boots, { pos: [0.055 * fs, -0.035, 0] });
    api.part(j[ft], rbox(0.1 * fs, 0.07, 0.13 * fs, 0.03), boots, { pos: [0.16 * fs, -0.05, 0] });
    api.part(j[ft], rbox(0.29 * fs, 0.025, 0.13 * fs, 0.01), dark, { pos: [0.06 * fs, -0.075, 0] });
    void side;
  }

  // --- Belt --------------------------------------------------------------------
  api.part(api.sockets.belt, torus(1, 0.028, Math.PI * 2, 6, 26), solid(a.leather), { rot: [Math.PI / 2, 0, 0], scale: [pelvisD * 0.98, pelvisW * 0.97, 1] });
  api.part(api.sockets.belt, rbox(0.03, 0.06, 0.08, 0.012), { color: a.accent, gloss: 0.9 }, { pos: [pelvisD * 0.97, 0, 0] });
}

/** Mitten fist with a thumb and a knuckle ridge, wrist at the bone. */
function fist(api: RigBuildApi, hand: Bone, side: number, color: number): void {
  const k = api.metrics.handS;
  const s: RigPartSpec = { color, smooth: true };
  api.part(hand, rbox(0.085 * k, 0.095 * k, 0.09 * k, 0.03), s, { pos: [0.004, -0.045 * k, 0] });
  api.part(hand, rbox(0.06 * k, 0.07 * k, 0.088 * k, 0.025), { color }, { pos: [0.042 * k, -0.07 * k, 0] });
  api.part(hand, capsule(0.019 * k, 0.04 * k), { color }, { pos: [0.042 * k, -0.025 * k, side * 0.038 * k], rot: [side * 0.3, 0, 0.7] });
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
export { mix as mixColor };
