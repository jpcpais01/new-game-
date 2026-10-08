import { M } from '../paint';
import { cone, Displace, ell, Fn, inter, noise3, Offset, Paint, shell, Squash, torus, union, type Sdf } from '../sdf';
import { band, clipY, type ArmCtx, type ClothPiece, type LegCtx, type OutfitSculpt, type TorsoCtx } from './kit';

/**
 * The house outfit every fighter starts in: a wrap tunic with a crossed
 * lapel and cap sleeves, a sash knotted at the front, loose trousers with
 * folds, wrapped forearms and laced boots. Coloured by the character's own
 * outfit colours.
 */

function torso(c: TorsoCtx): Sdf {
  const { s, yN } = c;
  const nl = c.nl;
  // --- Outfit paint: V-neck shows skin, everything below the hem is trousers ---
  const yApex = c.yC + nl * 0.74;
  const slope = 0.1 / Math.max(0.05, yN - yApex);
  const yHem = c.yHem;
  const yBelt = c.yBelt;
  const vOpen = (x: number, y: number, z: number) => x > 0.0 && y > yApex && Math.abs(z) < (y - yApex) * slope;
  const core = new Paint(c.core, (x, y, z, m) => {
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
  const sashBand = band(core, yBelt - 0.036, yBelt + 0.036, 0.008, 0.012, M.SASH);
  const knotZ = -s.waistW * 0.42;
  // The knot (its hanging ends sway on their own bone: see cloth()).
  const knot = ell([c.waistD * 0.86, yBelt + 0.004, knotZ], [0.03, 0.034, 0.036], M.SASH);
  // Tunic hem: a flared lip with soft folds over the hips.
  const hemFolds = (x: number, y: number, z: number) => {
    const t = 1 - Math.min(1, Math.abs(y - (yHem + 0.035)) / 0.06);
    return t <= 0 ? 0 : -Math.sin(Math.atan2(z, x) * 9) * 0.004 * t;
  };
  const hem = new Displace(band(c.pelvis, yHem - 0.005, yHem + 0.075, 0.012, 0.009, M.SHIRT), hemFolds, 0.005);
  // Fabric pulled under the sash: shallow horizontal folds above it.
  return new Displace(union(0.006, core, lapel, wrap, collar, sashBand, knot, hem), (x, y, z) => {
    const t = Math.max(0, 1 - Math.abs(y - (yBelt + 0.09)) / 0.07);
    if (t <= 0 || x < -0.05) return 0;
    return Math.sin(y * 95 + z * 18) * 0.0022 * t + noise3(x * 40, y * 40, z * 40) * 0.0012 * t;
  }, 0.004);
}

function arm(c: ArmCtx): Sdf {
  const { s, U, Wr, z, deltoid, upper, fore } = c;
  // Cap sleeve: a loose shell over the shoulder with a crisp hem.
  const ySleeve = U[1] - s.upperArm * 0.36;
  const sleeve = clipY(new Paint(new Offset(union(0.04, deltoid, upper), 0.0035), () => M.SHIRT), ySleeve, 1);
  const sleeveHem = band(union(0.04, deltoid, upper), ySleeve - 0.002, ySleeve + 0.014, 0.004, 0.005, M.TRIM);
  // Leather wraps around the lower forearm, wound in a spiral.
  const yW0 = Wr[1] + 0.005, yW1 = Wr[1] + s.forearm * 0.48;
  const wraps = new Displace(
    band(fore, yW0, yW1, 0.003, 0.0055, M.WRAP),
    (x, y, zz) => -Math.abs(Math.sin(y * 70 + Math.atan2(zz - z, x - Wr[0]) * 1.0)) * 0.0025,
    0.003,
  );
  return union(0.006, union(0.02, c.arm, c.fist), sleeve, sleeveHem, wraps);
}

function leg(c: LegCtx): Sdf {
  const { s, K, z, shin, legBody } = c;
  const cr = s.calfR;
  // Loose trousers: a little room over the leg, folds at the back of the knee and over the boots.
  const yBoot = K[1] - s.shin * 0.38;
  const pants = new Displace(new Offset(legBody, 0.006), (x, y, zz) => {
    const knee = Math.max(0, 1 - Math.abs(y - K[1]) / 0.09);
    const bunch = Math.max(0, 1 - Math.abs(y - (yBoot + 0.04)) / 0.06);
    const back = x < 0 ? 1 : 0.4;
    return -(Math.sin(y * 120 + zz * 25) * 0.0035 * knee * back + Math.sin(y * 150 + Math.atan2(zz - z, x) * 3) * 0.003 * bunch);
  }, 0.004);
  // Boot: shaft around the shin, a folded cuff, and the foot.
  const fs = s.footS;
  const A = c.A;
  const shaft = clipY(new Offset(shin, 0.011), yBoot, -1);
  const cuff = torus([0.002, yBoot + 0.002, z], cr * 0.92, 0.016, M.CUFF, [0, 0, 0.06]);
  // Straps over the instep and around the ankle.
  const strapAt = (x0: number, w: number, tilt: number) => inter(shell(c.foot, 0.003, 0.0045, M.WRAP),
    new Fn((x, y) => Math.abs((x - A[0]) - x0 * fs - (y - A[1]) * tilt) - w, [-1, -1, -1, 1, 3, 1], M.WRAP));
  const boot = union(0.006,
    new Paint(union(0.03, shaft, c.foot), () => M.BOOT),
    cuff, c.sole, strapAt(0.07, 0.009, 0.4), strapAt(0.02, 0.008, 0.9),
  );
  return union(0.01, new Paint(pants, (_x, y) => (y < yBoot + 0.005 ? M.BOOT : M.PANTS)), boot);
}

/** The two loose ends of the sash, hanging from the knot, flattened like cloth. */
function cloth(c: TorsoCtx): ClothPiece[] {
  const field = new Squash(union(0.01,
    cone([0, 0, -0.012], [0.012, -0.2, -0.035], 0.022, 0.028, M.SASH),
    cone([0, 0, 0.01], [0.018, -0.15, 0.022], 0.02, 0.025, M.SASH),
  ), [0, 0, 0], [0.45, 1, 1]);
  return [{ field, root: [c.waistD * 0.86 + 0.01, c.yBelt - 0.008, -c.s.waistW * 0.42], bone: 'hips', stiffness: 1.3 }];
}

export const TUNIC: OutfitSculpt = { torso, arm, leg, cloth };
