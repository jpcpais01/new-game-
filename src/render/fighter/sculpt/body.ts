import type { FormShape } from '../forms';
import { meshSdf, mirrorZ, type SculptMesh } from './mesher';
import { M } from './paint';
import {
  ball, caps, cone, Displace, ell, Fn, inter, loft, MirrorZ, noise3, Offset, Paint, plane, rbox, shell, Squash, strand, sub, torus, union,
  type Sdf, type Vec3,
} from './sdf';

/**
 * Sculpted base bodies. Each form's body is modelled as smooth anatomy in the
 * bind pose (arms hanging, body space, metres before the form scale), wearing
 * the house outfit: a wrap tunic with a crossed lapel and cap sleeves, a sash,
 * loose trousers with folds, wrapped forearms and laced boots. Three regions
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

/** Keeps only the part of `a` below (dir -1) or above (dir 1) the height y, with a crisp edge. */
const clipY = (a: Sdf, y: number, dir: 1 | -1) => inter(a, plane([0, y, 0], [0, -dir, 0]));

// -----------------------------------------------------------------------------
// Torso: pelvis to neck, with the tunic, lapels, sash and collar
// -----------------------------------------------------------------------------

function torsoField(s: FormShape, j: BindJoints): Sdf {
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

  // --- Outfit paint: V-neck shows skin, everything below the hem is trousers ---
  const yApex = yC + nl * 0.74;
  const slope = 0.1 / Math.max(0.05, yN - yApex);
  const yHem = yH - 0.035;
  const yBelt = yH + 0.07;
  const vOpen = (x: number, y: number, z: number) => x > 0.0 && y > yApex && Math.abs(z) < (y - yApex) * slope;
  core = new Paint(core, (x, y, z, m) => {
    if (y > yN + 0.005 - (x < 0 ? 0 : 0.04)) return M.SKIN;
    if (m === M.SKIN) return vOpen(x, y, z) || y > yN - 0.02 ? M.SKIN : M.SHIRT;
    if (vOpen(x, y, z)) return M.SKIN;
    if (y < yHem) return M.PANTS;
    return m === M.PANTS ? M.PANTS : m;
  });

  // --- Raised details hugging the body ------------------------------------
  const lapelW = 0.021;
  const lapelLine = (x: number, y: number, z: number) => {
    if (x < -0.02 || y < yApex - 0.02 || y > yN + 0.02) return 1;
    // Distance to the two V edges in the y-z plane.
    const edge = Math.abs(Math.abs(z) - (y - yApex) * slope) / Math.sqrt(1 + slope * slope);
    return edge - lapelW;
  };
  const lapel = inter(shell(core, 0.004, 0.0055, M.TRIM), new Fn(lapelLine, [-0.1, yApex - 0.05, -0.3, 0.4, yN + 0.05, 0.3], M.TRIM), 0.005);
  // The overlap of the wrap: from the V apex diagonally down to the sash.
  const wrapX = (y: number) => (y - yBelt) / Math.max(0.05, yApex - yBelt);
  const wrapEdge = (x: number, y: number, z: number) => {
    if (x < 0 || y > yApex + 0.01 || y < yBelt - 0.01) return 1;
    const zz = -0.11 * (1 - wrapX(y)) * (s.chestW / 0.25);
    return Math.abs(z - zz) - 0.012;
  };
  const wrap = inter(shell(core, 0.003, 0.0045, M.TRIM), new Fn(wrapEdge, [-0.05, yBelt - 0.05, -0.3, 0.4, yApex + 0.05, 0.3], M.TRIM), 0.005);
  // Collar: a folded band around the base of the neck, open at the front.
  const collar = inter(
    torus([-0.012, yN - 0.012, 0], s.neckR * 1.32, 0.017, M.SHIRT, [0, 0, 0.18]),
    new Fn((x, _y, z) => (x > 0.02 && Math.abs(z) < 0.06 ? 0.02 : -1), [-1, -1, -1, 1, 3, 1], M.SHIRT),
  );
  // Sash: a broad band over the waist, knotted at the front.
  const sashBand = inter(shell(core, 0.008, 0.012, M.SASH), new Fn((_x, y) => Math.abs(y - yBelt) - 0.036, [-1, yBelt - 0.05, -1, 1, yBelt + 0.05, 1], M.SASH));
  const knotZ = -s.waistW * 0.42;
  // The knot (its hanging ends sway on their own bone: see sashTails).
  const knot = ell([waistD * 0.86, yBelt + 0.004, knotZ], [0.03, 0.034, 0.036], M.SASH);
  // Tunic hem: a flared lip with soft folds over the hips.
  const hemFolds = (x: number, y: number, z: number) => {
    const t = 1 - Math.min(1, Math.abs(y - (yHem + 0.035)) / 0.06);
    return t <= 0 ? 0 : -Math.sin(Math.atan2(z, x) * 9) * 0.004 * t;
  };
  const hem = new Displace(inter(shell(pelvis, 0.012, 0.009, M.SHIRT), new Fn((_x, y) => Math.abs(y - (yHem + 0.035)) - 0.04, [-1, yHem - 0.02, -1, 1, yHem + 0.09, 1], M.SHIRT)), hemFolds, 0.005);
  // Fabric pulled under the sash: shallow horizontal folds above it.
  const torso = new Displace(union(0.006, core, lapel, wrap, collar, sashBand, knot, hem), (x, y, z) => {
    const t = Math.max(0, 1 - Math.abs(y - (yBelt + 0.09)) / 0.07);
    if (t <= 0 || x < -0.05) return 0;
    return Math.sin(y * 95 + z * 18) * 0.0022 * t + noise3(x * 40, y * 40, z * 40) * 0.0012 * t;
  }, 0.004);
  return torso;
}

// -----------------------------------------------------------------------------
// Right arm: deltoid to fist, with the cap sleeve and forearm wraps
// -----------------------------------------------------------------------------

function armField(s: FormShape, j: BindJoints): Sdf {
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

  // Cap sleeve: a loose shell over the shoulder with a crisp hem.
  const ySleeve = U[1] - s.upperArm * 0.36;
  const sleeve = clipY(new Paint(new Offset(union(0.04, deltoid, upper), 0.0035), () => M.SHIRT), ySleeve, 1);
  const sleeveHem = inter(shell(union(0.04, deltoid, upper), 0.004, 0.005, M.TRIM), new Fn((_x, y) => Math.abs(y - ySleeve - 0.006) - 0.008, [-1, ySleeve - 0.02, -1, 1, ySleeve + 0.03, 1], M.TRIM));
  // Leather wraps around the lower forearm, wound in a spiral.
  const yW0 = Wr[1] + 0.005, yW1 = Wr[1] + s.forearm * 0.48;
  const wraps = new Displace(
    inter(shell(fore, 0.003, 0.0055, M.WRAP), new Fn((_x, y) => Math.max(yW0 - y, y - yW1), [-1, yW0 - 0.01, -1, 1, yW1 + 0.01, 1], M.WRAP)),
    (x, y, zz) => -Math.abs(Math.sin(y * 70 + Math.atan2(zz - z, x - Wr[0]) * 1.0)) * 0.0025,
    0.003,
  );
  const fist = fistField(s.handS, Wr, s.foreR);
  return union(0.006, union(0.02, arm, fist), sleeve, sleeveHem, wraps);
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
// Right leg: hip to boot sole
// -----------------------------------------------------------------------------

function legField(s: FormShape, j: BindJoints, ankleH: number): Sdf {
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
  // Loose trousers: a little room over the leg, folds at the back of the knee and over the boots.
  const legBody = union(0.04, thigh, shin);
  const yBoot = K[1] - s.shin * 0.38;
  const pants = new Displace(new Offset(legBody, 0.006), (x, y, zz) => {
    const knee = Math.max(0, 1 - Math.abs(y - K[1]) / 0.09);
    const bunch = Math.max(0, 1 - Math.abs(y - (yBoot + 0.04)) / 0.06);
    const back = x < 0 ? 1 : 0.4;
    return -(Math.sin(y * 120 + zz * 25) * 0.0035 * knee * back + Math.sin(y * 150 + Math.atan2(zz - z, x) * 3) * 0.003 * bunch);
  }, 0.004);

  // Boot: shaft around the shin, a folded cuff, and the foot (foot space, toe +X).
  const F = (x: number, y: number, zz: number): Vec3 => [A[0] + x * s.footS, A[1] + y, A[2] + zz * s.footS];
  const fs = s.footS;
  const shaft = clipY(new Offset(shin, 0.011), yBoot, -1);
  const cuff = torus([0.002, yBoot + 0.002, z], cr * 0.92, 0.016, M.CUFF, [0, 0, 0.06]);
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
  // Straps over the instep and around the ankle.
  const strapAt = (x0: number, w: number, tilt: number) => inter(shell(foot, 0.003, 0.0045, M.WRAP),
    new Fn((x, y) => Math.abs((x - A[0]) - x0 * fs - (y - A[1]) * tilt) - w, [-1, -1, -1, 1, 3, 1], M.WRAP));
  const boot = union(0.006,
    new Paint(union(0.03, shaft, foot), () => M.BOOT),
    cuff, sole, strapAt(0.07, 0.009, 0.4), strapAt(0.02, 0.008, 0.9),
  );
  return union(0.01, new Paint(pants, (_x, y) => (y < yBoot + 0.005 ? M.BOOT : M.PANTS)), boot);
}

/** Where the sash is knotted (body space): the root of its swaying ends. */
function sashKnot(s: FormShape, j: BindJoints): Vec3 {
  const waistD = s.waistW * 0.8 + s.belly * 0.05;
  return [waistD * 0.86 + 0.01, j.hips[1] + 0.07 - 0.008, -s.waistW * 0.42];
}

/** The two loose ends of the sash, hanging from the knot (knot-local space), flattened like cloth. */
function sashTails(): Sdf {
  return new Squash(union(0.01,
    cone([0, 0, -0.012], [0.012, -0.2, -0.035], 0.022, 0.028, M.SASH),
    cone([0, 0, 0.01], [0.018, -0.15, 0.022], 0.02, 0.025, M.SASH),
  ), [0, 0, 0], [0.45, 1, 1]);
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
  /** The sash's loose ends and where they hang from (body space). */
  sash: { mesh: SculptMesh; root: Vec3 };
}

/** Grid spacing per detail tier (body-space metres). */
export const BODY_DETAIL = [0.022, 0.016, 0.0125];

const cache = new Map<string, BodySculpt>();

export function sculptBody(key: string, s: FormShape, hipH: number, ankleH: number, detail: number): BodySculpt {
  const ck = `${key}:${detail}`;
  let b = cache.get(ck);
  if (b) return b;
  const j = bindJoints(s, hipH);
  const h = BODY_DETAIL[Math.max(0, Math.min(BODY_DETAIL.length - 1, detail))];
  const ao = 0.014;
  const torso = meshSdf(torsoField(s, j), { h, ao });
  const armR = meshSdf(armField(s, j), { h: h * 0.85, ao: ao * 0.8 });
  const legR = meshSdf(legField(s, j, ankleH), { h, ao });
  const sash = { mesh: meshSdf(sashTails(), { h: h * 0.7, ao: ao * 0.7 }), root: sashKnot(s, j) };
  b = { torso, armR, armL: mirrorZ(armR), legR, legL: mirrorZ(legR), sash };
  cache.set(ck, b);
  return b;
}

