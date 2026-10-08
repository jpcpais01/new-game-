import type { FormShape } from '../forms';
import { meshSdf, mirrorZ, type SculptMesh } from './mesher';
import { outfitSculpt } from './outfits';
import { speciesSculpt } from './species';
import type { ArmCtx, ClothPiece, LegCtx, OutfitSculpt, TorsoCtx } from './outfits/kit';
import { M } from './paint';
import { ball, cone, ell, loft, MirrorZ, rbox, strand, union, type Sdf, type Vec3 } from './sdf';

/**
 * Sculpted base bodies. Each species-and-form body is blocked out in bold,
 * simple volumes in the bind pose (arms hanging, body space, metres before
 * the form scale), then dressed by an outfit (outfits/: the house tunic or a character skin), which
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
  const head: Vec3 = [0.03, neck[1] + s.headLift + s.neckR * 0.2, 0];
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
// Torso: pelvis to neck
// -----------------------------------------------------------------------------

/**
 * The trunk as one bold, simple volume, the way a character designer blocks
 * a body: a ribcage that reads as a single shape, a waist and a pelvis, no
 * individual muscles. Species proportions (barrel ogres, reed-thin spirits)
 * come from the shape alone.
 */
function torsoAnatomy(s: FormShape, j: BindJoints): TorsoCtx {
  const mu = s.muscle, bel = s.belly;
  const yH = j.hips[1], yS = j.spine[1], yC = j.chest[1], yN = j.neck[1];
  const nl = s.neckLen;
  const pelvisW = s.hipW + s.thighR * 0.9;
  const pelvisD = s.chestD * 0.86 + bel * 0.04;
  const waistD = s.waistW * 0.8 + bel * 0.07;
  const yU = j.shoulder[1];
  const sw = s.shoulderW, cw = s.chestW, cd = s.chestD;
  const trunk = loft([
    [yH - 0.16, -0.012, pelvisD * 0.55, pelvisW * 0.52],
    [yH - 0.07, -0.012, pelvisD * 0.88, pelvisW * 0.84],
    [yH + 0.05, bel * 0.02, waistD * 0.98 + bel * 0.05, s.waistW * 0.98 + bel * 0.03],
    [yS + 0.04, bel * 0.03, waistD * 1.04 + bel * 0.08, s.waistW * 1.02 + bel * 0.035],
    [yC + nl * 0.14, 0.0, cd * 0.88 + bel * 0.03, cw * 0.88],
    [yC + nl * 0.48, -0.006, cd * 0.96, cw * 0.99],
    [yC + nl * 0.76, -0.018, cd * 0.82, sw * 0.84],
    [yC + nl * 0.92, -0.028, cd * 0.56, sw * 0.6],
    [yN + 0.01, -0.02, s.neckR * 1.35, s.neckR * 1.4],
  ], M.SHIRT, 2.4);
  const pelvis = ell([-0.004, yH - 0.03, 0], [pelvisD * 0.82, 0.13, pelvisW * 0.76], M.SHIRT);
  const half = union(0.04,
    // Shoulder: one round mass the arm hangs from.
    ball([-0.014, yU - 0.022, sw - 0.07], s.armR * 1.05, M.SHIRT),
    // Seat.
    ell([-pelvisD * 0.4, yH - 0.08, s.hipW * 0.55], [s.thighR * 0.72, s.thighR * 0.86, s.thighR * 0.74], M.PANTS),
  );
  // Strong builds get a broad, flat chest plate (never two rounded mounds).
  const chestPlate = mu > 0.45
    ? rbox([cd * 0.36, yC + nl * 0.58, 0], [0.03 + 0.02 * (mu - 0.45), nl * 0.2, cw * 0.66], 0.035, M.SHIRT, [0, 0, 0.1])
    : null;
  const belly = bel > 0 ? ell([waistD * 0.44 + bel * 0.03, yS - 0.02, 0], [0.1 + 0.07 * bel, 0.13 + 0.05 * bel, s.waistW * 0.95 + bel * 0.02], M.SHIRT) : null;
  let core: Sdf = union(0.06, trunk, pelvis, chestPlate, new MirrorZ(half), belly);
  const neck = cone([0, yN - 0.07, 0], add(j.head, -0.005, 0.03, 0), s.neckR * 1.2, s.neckR * 0.98, M.SKIN);
  core = union(0.04, core, neck);
  return {
    s, j, core, pelvis, yH, yS, yC, yN, yU, nl, waistD, pelvisD, pelvisW,
    yBelt: yH + 0.07, yHem: yH - 0.035,
  };
}

// -----------------------------------------------------------------------------
// Right arm: shoulder to fist
// -----------------------------------------------------------------------------

/** Simple tapered arm forms; big-fisted species swell the forearm (forePop). */
function armAnatomy(s: FormShape, j: BindJoints): ArmCtx {
  const mu = s.muscle, pop = s.forePop;
  const U = j.shoulder, E = j.elbow, Wr = j.wrist;
  const ar = s.armR, fr = s.foreR;
  const z = U[2];
  const deltoid = ell(add(U, 0.0, -0.045, 0.006), [ar * 1.22, ar * 1.45 + 0.02, ar * 1.12], M.SKIN);
  const upper = union(0.035,
    cone(add(U, 0, -0.03, 0), E, ar * 1.0, fr * 0.86, M.SKIN),
    mu > 0.3 ? ell([U[0] + ar * 0.3, U[1] - s.upperArm * 0.52, z], [ar * (0.6 + 0.35 * mu), s.upperArm * 0.32, ar * 0.85], M.SKIN) : null,
  );
  const fore = union(0.04,
    ball([E[0] - fr * 0.4, E[1] + 0.004, z], fr * 0.5, M.SKIN),
    cone(E, Wr, fr * 0.95, fr * (0.62 + 0.12 * pop), M.SKIN),
    // A round forearm mass: Popeye arms on ogres and golems, a gentle swell elsewhere.
    ell([E[0] + fr * 0.08, E[1] - s.forearm * (0.3 + 0.08 * pop), z], [fr * (0.82 + 0.3 * pop), s.forearm * (0.3 + 0.08 * pop), fr * (0.82 + 0.3 * pop)], M.SKIN),
  );
  const arm = union(0.045, deltoid, upper, fore);
  return { s, j, U, E, Wr, z, deltoid, upper, fore, arm, fist: fistField(s.handS, Wr, s.foreR) };
}

/**
 * A chunky cartoon fist closed around a grip bar along +X at
 * (y = wrist - 0.055k, z = 0), thumb forwards, palm towards the body (-Z):
 * matches the mainHand socket. Fat fingers fused a little, so it reads as one
 * clear shape at a distance.
 */
function fistField(k: number, Wr: Vec3, foreR: number): Sdf {
  const P = (x: number, y: number, z: number): Vec3 => [Wr[0] + x * k, Wr[1] + y * k, Wr[2] + z * k];
  const palm = union(0.016,
    rbox(P(0.004, -0.05, 0.006), [0.043 * k, 0.045 * k, 0.023 * k], 0.02 * k, M.SKIN),
    cone(P(0, 0.012, 0), P(0.002, -0.03, 0.004), foreR * 0.6, 0.032 * k, M.SKIN),
  );
  const fingers: Sdf[] = [];
  const xs = [0.028, 0.0095, -0.0095, -0.027];
  const len = [1, 1.04, 0.98, 0.88];
  for (let i = 0; i < 4; i++) {
    const x = xs[i], l = len[i], r = 0.0138 * (i === 3 ? 0.9 : 1);
    fingers.push(strand([
      P(x, -0.086, 0.006),
      P(x, -0.088 - 0.01 * l, -0.025 * l),
      P(x, -0.075, -0.042 * l),
      P(x, -0.054, -0.036 * l),
    ], [r * k, r * k, r * 0.95 * k, r * 0.9 * k], M.SKIN, 0.004));
  }
  const thumb = strand([P(0.03, -0.02, -0.014), P(0.046, -0.044, -0.034), P(0.038, -0.062, -0.048), P(0.022, -0.068, -0.05)],
    [0.017 * k, 0.015 * k, 0.013 * k, 0.0115 * k], M.SKIN, 0.004);
  return union(0.008, palm, union(0.006, ...fingers), thumb);
}

// -----------------------------------------------------------------------------
// Right leg: hip to sole
// -----------------------------------------------------------------------------

function legAnatomy(s: FormShape, j: BindJoints, ankleH: number): LegCtx {
  const T = j.hip, K = j.knee, A = j.ankle;
  const tr = s.thighR, cr = s.calfR, z = T[2];
  const thigh = union(0.045,
    cone(add(T, 0, 0.05, 0.006), add(K, 0, 0.02, 0), tr * 1.15, cr * 1.0, M.PANTS),
    ell(add(T, 0, -0.02, -0.01), [tr * 1.04, tr * 1.3, tr * 0.98], M.PANTS),
  );
  const shin = union(0.04,
    cone(K, A, cr * 0.98, cr * 0.6, M.PANTS),
    // Calf: one soft swell at the back.
    ell([-cr * 0.3, K[1] - s.shin * 0.28, z], [cr * 0.78, s.shin * 0.27, cr * 0.85], M.PANTS),
  );
  const legBody = union(0.045, thigh, shin);
  // The foot (foot space, toe +X): a rounded shoe shape with a big toe cap.
  const F = (x: number, y: number, zz: number): Vec3 => [A[0] + x * s.footS, A[1] + y, A[2] + zz * s.footS];
  const fs = s.footS;
  const foot = union(0.035,
    cone(F(0, 0.035, 0), F(0, -0.02, 0), cr * 0.66, 0.054 * fs, M.BOOT),
    ball(F(-0.03, -0.042, 0), 0.048 * fs, M.BOOT),
    cone(F(-0.01, -0.03, 0), F(0.11, -0.05, 0), 0.052 * fs, 0.046 * fs, M.BOOT),
    ell(F(0.145, -0.05, 0), [0.064 * fs, 0.042, 0.058 * fs], M.BOOT),
  );
  const soleY = -ankleH;
  const sole = union(0.008,
    rbox(F(0.05, soleY + 0.01, 0), [0.15 * fs, 0.01, 0.057 * fs], 0.01, M.SOLE),
    rbox(F(-0.04, soleY + 0.018, 0), [0.05 * fs, 0.018, 0.052 * fs], 0.008, M.SOLE),
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

/**
 * Sculpts (or reuses) a body (`key` names its form and species) dressed in an
 * outfit (see outfits/index.ts), with the species' own growths on top.
 */
export function sculptBody(key: string, s: FormShape, hipH: number, ankleH: number, detail: number, outfit?: string, species?: string): BodySculpt {
  const o: OutfitSculpt = outfitSculpt(outfit);
  const sp = speciesSculpt(species);
  const ck = `${key}:${species ?? ''}:${outfit ?? ''}:${detail}`;
  let b = cache.get(ck);
  if (b) return b;
  const j = bindJoints(s, hipH);
  // Barrel-chested creatures have far more surface: a coarser grid keeps them in the same triangle budget.
  const mass = (s.chestW * s.chestD) / (0.25 * 0.19);
  const h0 = BODY_DETAIL[Math.max(0, Math.min(BODY_DETAIL.length - 1, detail))];
  const h = h0 * Math.max(1, Math.pow(mass, 0.2));
  const ao = 0.014;
  const t = torsoAnatomy(s, j);
  const a = armAnatomy(s, j);
  const torsoF = o.torso(t), armF = o.arm(a);
  const torso = meshSdf(sp.torso ? sp.torso(t, torsoF) : torsoF, { h, ao });
  const armR = meshSdf(sp.arm ? sp.arm(a, armF) : armF, { h: h * 0.85, ao: ao * 0.8 });
  const legR = meshSdf(o.leg(legAnatomy(s, j, ankleH)), { h, ao });
  // Thin outfit cloth needs a fine grid; tails are round and can take a coarser one.
  const hang = (c: ClothPiece, hc: number) => ({ mesh: meshSdf(c.field, { h: hc, ao: ao * 0.7 }), root: c.root, bone: c.bone, stiffness: c.stiffness });
  const cloth = [...o.cloth(t).map((c) => hang(c, h0 * 0.7)), ...(sp.cloth?.(t) ?? []).map((c) => hang(c, h0 * 1.15))];
  b = { torso, armR, armL: mirrorZ(armR), legR, legL: mirrorZ(legR), cloth };
  cache.set(ck, b);
  return b;
}
