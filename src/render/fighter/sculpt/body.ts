import type { FormShape } from '../forms';
import { meshSdf, mirrorZ, type SculptMesh } from './mesher';
import { outfitSculpt } from './outfits';
import type { ArmCtx, LegCtx, OutfitSculpt, TorsoCtx } from './outfits/kit';
import { M } from './paint';
import { ball, caps, cone, ell, loft, MirrorZ, rbox, strand, sub, union, type Sdf, type Vec3 } from './sdf';

/**
 * Sculpted base bodies. Each form's body is modelled as smooth anatomy in the
 * bind pose (arms hanging, body space, metres before the form scale), then
 * dressed by an outfit (outfits/: the house tunic or a character skin), which
 * paints the anatomy and adds garments and armour around it. Three regions
 * are meshed separately (torso, right arm, right leg; the left limbs are
 * mirrors) so each skins along its own bone chain.
 */

/** Bind-pose joint positions in body space (must match rig.ts). */
export interface BindJoints {
  hips: Vec3; spine: Vec3; chest: Vec3; neck: Vec3; head: Vec3;
  shoulder: Vec3; elbow: Vec3; wrist: Vec3;
  hip: Vec3; knee: Vec3; ankle: Vec3;
}

export function bindJoints(s: FormShape, hipH: number): BindJoints {
  const hips: Vec3 = [0, hipH, 0];
  const spine: Vec3 = [0, hipH + s.waistLen, 0];
  const chest: Vec3 = [0, spine[1] + s.chestLen, 0];
  const neck: Vec3 = [0.012, chest[1] + s.neckLen, 0];
  const head: Vec3 = [0.03, neck[1] + 0.095 + s.neckR * 0.2, 0];
  const shoulder: Vec3 = [-0.01, chest[1] + s.neckLen * 0.8 + 0.01, s.shoulderW];
  const elbow: Vec3 = [-0.01, shoulder[1] - s.upperArm, s.shoulderW];
  const wrist: Vec3 = [-0.01, elbow[1] - s.forearm, s.shoulderW];
  const hip: Vec3 = [0, hipH - 0.06, s.hipW];
  const knee: Vec3 = [0, hip[1] - s.thigh, s.hipW];
  const ankle: Vec3 = [0, knee[1] - s.shin, s.hipW];
  return { hips, spine, chest, neck, head, shoulder, elbow, wrist, hip, knee, ankle };
}

const add = (a: Vec3, x: number, y: number, z: number): Vec3 => [a[0] + x, a[1] + y, a[2] + z];

// -----------------------------------------------------------------------------
// Torso anatomy: pelvis to neck
// -----------------------------------------------------------------------------

function torsoAnatomy(s: FormShape, j: BindJoints): TorsoCtx {
  const mu = s.muscle;
  const yH = j.hips[1], yS = j.spine[1], yC = j.chest[1], yN = j.neck[1];
  const nl = s.neckLen;
  const pelvisW = s.hipW + s.thighR * 0.9;
  const pelvisD = s.chestD * 0.86 + s.belly * 0.03;
  const waistD = s.waistW * 0.8 + s.belly * 0.05;
  const yU = j.shoulder[1];

  // --- Anatomy (worn under a fitted tunic) ---------------------------------
  // The trunk is lofted from cross-sections so the silhouette reads heroic:
  // broad ribcage and shoulders, straight obliques, a firm waist and hips.
  const sw = s.shoulderW, cw = s.chestW, cd = s.chestD;
  const trunk = loft([
    [yH - 0.16, -0.012, pelvisD * 0.55, pelvisW * 0.5],
    [yH - 0.07, -0.014, pelvisD * 0.86, pelvisW * 0.8],
    [yH + 0.05, -0.006, waistD * 0.98 + s.belly * 0.03, s.waistW * 0.98 + s.belly * 0.02],
    [yS + 0.04, 0.0, waistD * 1.02 + s.belly * 0.06, s.waistW * 1.0 + s.belly * 0.025],
    [yC + nl * 0.12, -0.004, cd * 0.86, cw * 0.86],
    [yC + nl * 0.45, -0.01, cd * 0.94, cw * 0.98],
    [yC + nl * 0.74, -0.02, cd * 0.8, sw * 0.82],
    [yC + nl * 0.9, -0.03, cd * 0.56, sw * 0.6],
    [yN + 0.01, -0.02, s.neckR * 1.35, s.neckR * 1.4],
  ], M.SHIRT, 2.2);
  const pelvis = ell([-0.004, yH - 0.03, 0], [pelvisD * 0.82, 0.13, pelvisW * 0.76], M.SHIRT);
  const half = union(0.03,
    // Lats flare from the armpit and taper to the waist (the V).
    ell([-cd * 0.3, yC + nl * 0.44, cw * 0.66], [cd * 0.46, nl * 0.4, 0.05 + 0.035 * mu], M.SHIRT, [0.3, 0, 0]),
    // Trapezius slope and the shoulder socket.
    cone([-0.035, yN - 0.01, 0.0], [-0.025, yU + 0.004, sw * 0.72], s.neckR * 1.1, 0.045 + 0.012 * mu, M.SHIRT),
    ball([-0.014, yU - 0.02, sw - 0.07], s.armR * 1.0, M.SHIRT),
    // Glutes.
    ell([-pelvisD * 0.42, yH - 0.08, s.hipW * 0.56], [s.thighR * 0.7, s.thighR * 0.88, s.thighR * 0.72], M.PANTS),
  );
  // The chest: one broad, flat plate across the ribcage with a squared lower
  // edge (two separate rounded pecs read as breasts under the tunic).
  const chestPlate = rbox([cd * 0.36, yC + nl * 0.6, 0], [0.035 + 0.012 * mu, nl * 0.2, cw * 0.66], 0.03, M.SHIRT, [0, 0, 0.12]);
  let core: Sdf = union(0.05, trunk, pelvis, chestPlate, new MirrorZ(half),
    s.belly > 0 ? ell([waistD * 0.42, yS - 0.01, 0], [0.1 + 0.05 * s.belly, 0.13 + 0.03 * s.belly, s.waistW * 0.92], M.SHIRT) : null,
  );
  // The groove of the spine down the back.
  core = sub(core, caps([-s.chestD * 0.93, yC + nl * 0.62, 0], [-waistD * 1.02, yS - 0.02, 0], 0.011, M.SHIRT_DARK), 0.025);

  // --- Neck and collarbones (skin) -----------------------------------------
  const neck = union(0.03,
    cone([0, yN - 0.07, 0], add(j.head, -0.005, 0.03, 0), s.neckR * 1.18, s.neckR * 0.95, M.SKIN),
    new MirrorZ(union(0,
      // Sternocleidomastoid: behind the ear down to the sternum.
      cone(add(j.head, -0.035, 0.02, s.neckR * 0.62), [0.05, yN - 0.03, 0.018], 0.019, 0.016, M.SKIN),
      // Clavicle.
      caps([s.chestD * 0.5, yN - 0.045, 0.03], [-0.005, yU + 0.012, s.shoulderW - 0.065], 0.013, M.SKIN),
    )),
  );
  core = union(0.035, core, neck);
  return {
    s, j, core, pelvis, yH, yS, yC, yN, yU, nl, waistD, pelvisD, pelvisW,
    yBelt: yH + 0.07, yHem: yH - 0.035,
  };
}

// -----------------------------------------------------------------------------
// Right arm anatomy: deltoid to fist
// -----------------------------------------------------------------------------

function armAnatomy(s: FormShape, j: BindJoints): ArmCtx {
  const mu = s.muscle;
  const U = j.shoulder, E = j.elbow, Wr = j.wrist;
  const ar = s.armR, fr = s.foreR;
  const z = U[2];
  const deltoid = union(0.03,
    ell(add(U, 0.0, -0.045, 0.006), [ar * 1.25, ar * 1.5 + 0.02, ar * 1.12], M.SKIN),
    cone(add(U, 0, -0.03, 0.008), [U[0] + 0.006, U[1] - s.upperArm * 0.52, z + 0.01], ar * 1.16, ar * 0.6, M.SKIN),
  );
  const upper = union(0.03,
    cone(add(U, 0, -0.03, 0), E, ar * 1.0, fr * 0.92, M.SKIN),
    ell([U[0] + ar * 0.42, U[1] - s.upperArm * 0.56, z - ar * 0.05], [ar * (0.5 + 0.25 * mu), s.upperArm * 0.3, ar * 0.72], M.SKIN),
    ell([U[0] - ar * 0.42, U[1] - s.upperArm * 0.45, z + ar * 0.08], [ar * (0.5 + 0.2 * mu), s.upperArm * 0.35, ar * 0.78], M.SKIN),
  );
  const fore = union(0.03,
    ball([E[0] - fr * 0.55, E[1] + 0.005, z], fr * 0.42, M.SKIN),
    cone(E, Wr, fr * 1.0, fr * 0.6, M.SKIN),
    ell([E[0] + fr * 0.25, E[1] - s.forearm * 0.2, z + fr * 0.3], [fr * 0.72, s.forearm * 0.32, fr * 0.7], M.SKIN),
    ell([E[0] + fr * 0.05, E[1] - s.forearm * 0.25, z - fr * 0.35], [fr * 0.68, s.forearm * 0.3, fr * 0.6], M.SKIN),
  );
  const arm = union(0.04, deltoid, upper, fore);
  return { s, j, U, E, Wr, z, deltoid, upper, fore, arm, fist: fistField(s.handS, Wr, s.foreR) };
}

/**
 * A right fist closed around a grip bar along +X at (y = wrist - 0.055k, z = 0),
 * thumb forwards, palm towards the body (-Z): matches the mainHand socket.
 */
function fistField(k: number, Wr: Vec3, foreR: number): Sdf {
  const P = (x: number, y: number, z: number): Vec3 => [Wr[0] + x * k, Wr[1] + y * k, Wr[2] + z * k];
  const palm = union(0.014,
    rbox(P(0.004, -0.05, 0.006), [0.041 * k, 0.044 * k, 0.021 * k], 0.017 * k, M.SKIN),
    cone(P(0, 0.012, 0), P(0.002, -0.03, 0.004), foreR * 0.6, 0.03 * k, M.SKIN),
    ell(P(0.026, -0.036, -0.012), [0.021 * k, 0.028 * k, 0.017 * k], M.SKIN),
  );
  const fingers: Sdf[] = [];
  const xs = [0.028, 0.0095, -0.0095, -0.027];
  const len = [1, 1.06, 0.97, 0.84];
  const rad = [1, 1.04, 0.98, 0.88];
  for (let i = 0; i < 4; i++) {
    const x = xs[i], l = len[i], r = 0.0118 * rad[i];
    const kn = P(x, -0.087, 0.006);
    fingers.push(ball(kn, r * k * 1.06, M.SKIN));
    fingers.push(strand([
      kn,
      P(x, -0.087 - 0.012 * l, -0.024 * l),
      P(x, -0.076 + 0.002 * (1 - l), -0.043 * l),
      P(x, -0.053, -0.037 * l),
    ], [r * k, r * 0.95 * k, r * 0.88 * k, r * 0.8 * k], M.SKIN, 0.004));
  }
  const thumb = strand([P(0.03, -0.02, -0.014), P(0.045, -0.044, -0.034), P(0.038, -0.062, -0.048), P(0.022, -0.068, -0.05)],
    [0.0155 * k, 0.0135 * k, 0.0118 * k, 0.0102 * k], M.SKIN, 0.004);
  return union(0.007, palm, union(0.0025, ...fingers), thumb);
}

// -----------------------------------------------------------------------------
// Right leg anatomy: hip to sole
// -----------------------------------------------------------------------------

function legAnatomy(s: FormShape, j: BindJoints, ankleH: number): LegCtx {
  const mu = s.muscle;
  const T = j.hip, K = j.knee, A = j.ankle;
  const tr = s.thighR, cr = s.calfR, z = T[2];
  const thigh = union(0.04,
    cone(add(T, 0, 0.05, 0.006), add(K, 0, 0.02, 0), tr * 1.15, cr * 1.0, M.PANTS),
    ell(add(T, 0, -0.01, -0.012), [tr * 1.02, tr * 1.25, tr * 0.95], M.PANTS),
    ell([tr * 0.38, T[1] - s.thigh * 0.48, z + tr * 0.08], [tr * (0.55 + 0.2 * mu), s.thigh * 0.38, tr * 0.8], M.PANTS),
    ell([tr * 0.33, K[1] + 0.075, z - tr * 0.45], [tr * 0.45, s.thigh * 0.17, tr * 0.45], M.PANTS),
    ell([-tr * 0.4, T[1] - s.thigh * 0.45, z], [tr * 0.6, s.thigh * 0.4, tr * 0.75], M.PANTS),
    ell([cr * 0.72, K[1] + 0.005, z], [0.026, 0.036, 0.032], M.PANTS),
  );
  const shin = union(0.035,
    cone(K, A, cr * 0.95, cr * 0.58, M.PANTS),
    ell([-cr * 0.45, K[1] - s.shin * 0.27, z + 0.004], [cr * 0.62, s.shin * 0.25, cr * 0.78], M.PANTS),
    ell([cr * 0.35, K[1] - s.shin * 0.3, z + cr * 0.1], [cr * 0.45, s.shin * 0.3, cr * 0.5], M.PANTS),
  );
  const legBody = union(0.04, thigh, shin);
  // The foot (foot space, toe +X).
  const F = (x: number, y: number, zz: number): Vec3 => [A[0] + x * s.footS, A[1] + y, A[2] + zz * s.footS];
  const fs = s.footS;
  const foot = union(0.03,
    cone(F(0, 0.035, 0), F(0, -0.02, 0), cr * 0.66, 0.052 * fs, M.BOOT),
    ball(F(-0.032, -0.042, 0), 0.046 * fs, M.BOOT),
    cone(F(-0.02, -0.04, 0), F(0.12, -0.056, 0), 0.047 * fs, 0.038 * fs, M.BOOT),
    cone(F(0.0, -0.005, 0), F(0.095, -0.042, 0), 0.05 * fs, 0.04 * fs, M.BOOT),
    ell(F(0.152, -0.052, 0), [0.056 * fs, 0.036, 0.05 * fs], M.BOOT),
  );
  const soleY = -ankleH;
  const sole = union(0.008,
    rbox(F(0.05, soleY + 0.01, 0), [0.14 * fs, 0.01, 0.053 * fs], 0.009, M.SOLE),
    rbox(F(-0.04, soleY + 0.018, 0), [0.048 * fs, 0.018, 0.05 * fs], 0.007, M.SOLE),
  );
  return { s, j, T, K, A, z, thigh, shin, legBody, foot, sole, F };
}

// -----------------------------------------------------------------------------
// Meshing and cache
// -----------------------------------------------------------------------------

export interface BodySculpt {
  torso: SculptMesh;
  armR: SculptMesh;
  armL: SculptMesh;
  legR: SculptMesh;
  legL: SculptMesh;
  /** Loose cloth (sash ends, tabards, coat tails, scarves) and where each hangs from (body space). */
  cloth: { mesh: SculptMesh; root: Vec3; bone: 'hips' | 'chest'; stiffness: number }[];
}

/** Grid spacing per detail tier (body-space metres). */
export const BODY_DETAIL = [0.022, 0.016, 0.0125];

const cache = new Map<string, BodySculpt>();

/** Sculpts (or reuses) a form's body dressed in an outfit (see outfits/index.ts). */
export function sculptBody(key: string, s: FormShape, hipH: number, ankleH: number, detail: number, outfit?: string): BodySculpt {
  const o: OutfitSculpt = outfitSculpt(outfit);
  const ck = `${key}:${outfit ?? ''}:${detail}`;
  let b = cache.get(ck);
  if (b) return b;
  const j = bindJoints(s, hipH);
  const h = BODY_DETAIL[Math.max(0, Math.min(BODY_DETAIL.length - 1, detail))];
  const ao = 0.014;
  const t = torsoAnatomy(s, j);
  const torso = meshSdf(o.torso(t), { h, ao });
  const armR = meshSdf(o.arm(armAnatomy(s, j)), { h: h * 0.85, ao: ao * 0.8 });
  const legR = meshSdf(o.leg(legAnatomy(s, j, ankleH)), { h, ao });
  const cloth = o.cloth(t).map((c) => ({ mesh: meshSdf(c.field, { h: h * 0.7, ao: ao * 0.7 }), root: c.root, bone: c.bone, stiffness: c.stiffness }));
  b = { torso, armR, armL: mirrorZ(armR), legR, legL: mirrorZ(legR), cloth };
  cache.set(ck, b);
  return b;
}
