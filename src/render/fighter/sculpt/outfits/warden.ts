import { M } from '../paint';
import { ball, caps, cone, Displace, ell, inter, MirrorZ, Offset, Paint, rbox, Squash, torus, union, type Sdf, type Vec3 } from '../sdf';
import {
  backAt, band, between, clipY, field, frontAt, furred, quilted, ramp,
  type ArmCtx, type ClothPiece, type LegCtx, type OutfitSculpt, type TorsoCtx,
} from './kit';

/**
 * Frost Warden (Rimeborn): a sentinel of the glacier passes. A quilted
 * snow-white greatcoat with frost-blue trims and a split tail, a heavy fur
 * mantle over the shoulders, silver toggles and a glowing snowflake brooch,
 * a leather bandolier, fur-cuffed sleeves and padded breeches tucked into
 * fur-topped boots.
 */

function torso(c: TorsoCtx): Sdf {
  const { s, yH, yC, yN, yU, nl, yBelt } = c;
  const yHem = yH - 0.07;
  const core = new Paint(c.core, (_x, y, _z, m) => {
    if (m === M.SKIN || y > yN - 0.02) return M.SKIN;
    return y < yHem ? M.PANTS : M.SHIRT;
  });

  // --- Greatcoat: padded, diamond-quilted, closed down the front --------------
  const coatTop = yN - 0.05;
  let coat: Sdf = between(new Offset(c.core, 0.014), yHem, coatTop, 0.006);
  coat = quilted(coat, [0, 0], s.chestW * 0.9, 0.055, 0.0032, yHem + 0.02, yU - 0.02);
  // The skirt flares a little over the hips.
  coat = new Displace(coat, (_x, y) => -0.012 * ramp(yBelt - 0.02, yHem, y), 0.012);
  coat = new Paint(coat, (x, y, z) => {
    // Frost-blue placket down the front and a trimmed hem.
    if (y < yHem + 0.022) return M.TRIM;
    if (x > 0 && Math.abs(z) < 0.016) return M.TRIM;
    return M.SHIRT;
  });

  // --- Fur mantle: a heavy ring of pelt over the shoulders and round the neck --
  const sw = s.shoulderW;
  const mantleBody = union(0.06,
    torus([-0.02, yN - 0.05, 0], s.neckR * 1.75, 0.058, M.FUR, [0, 0, 0.12]),
    new MirrorZ(ell([-0.025, yU + 0.012, sw * 0.52], [s.chestD * 0.75, 0.058, sw * 0.36], M.FUR)),
  );
  const mantle = new Paint(furred(clipY(mantleBody, yU - 0.06, 1), 0.011, 30), (_x, y) => (y < yU - 0.035 ? M.FUR_DARK : M.FUR));

  // --- Bandolier: from the right shoulder across to the left hip ----------------
  const slope = (yU - 0.03 - (yBelt + 0.02)) / (sw * 1.1);
  const yMid = (yU - 0.03 + yBelt + 0.02) / 2;
  const strapD = (y: number, z: number) => Math.abs(y - yMid - z * slope) / Math.sqrt(1 + slope * slope);
  const strap = new Paint(inter(between(new Offset(c.core, 0.026), yBelt, yU), field((_x, y, z) => strapD(y, z) - 0.022, M.LEATHER), 0.003),
    (_x, y, z) => (strapD(y, z) > 0.016 ? M.TRIM : M.LEATHER));

  // --- Belt with a silver plate buckle ----------------------------------------
  const belt = band(c.core, yBelt - 0.026, yBelt + 0.026, 0.028, 0.01, M.LEATHER);
  const bp = frontAt(c.core, yBelt);
  const buckle = rbox([bp[0] + 0.037, yBelt, 0], [0.01, 0.03, 0.034], 0.008, M.METAL);

  // --- Silver toggles down the chest and a glowing snowflake brooch -------------
  const toggles: Sdf[] = [];
  for (let i = 0; i < 3; i++) {
    const y = yC + nl * (0.18 + i * 0.17);
    const p = frontAt(c.core, y);
    toggles.push(caps([p[0] + 0.02, y, -0.026], [p[0] + 0.02, y, 0.026], 0.0085, M.METAL));
  }
  const by = yC + nl * 0.6;
  const bz = -s.chestW * 0.45;
  const b = frontAt(c.core, by, bz);
  const n = (b[0] > 0 ? [0.85, 0, -0.5] : [1, 0, 0]) as Vec3;
  const bc: Vec3 = [b[0] + n[0] * 0.024, by, bz + n[2] * 0.024];
  const arms: Sdf[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const dy = Math.cos(a) * 0.03, dz = Math.sin(a) * 0.03;
    arms.push(caps([bc[0], bc[1] - dy, bc[2] - dz], [bc[0], bc[1] + dy, bc[2] + dz], 0.0058, M.METAL));
  }
  const brooch = union(0.003, ...arms, ball(bc, 0.013, M.GLOW));

  // --- Back: a vent where the coat tails split ----------------------------------
  const back = backAt(c.core, yBelt);
  const vent = rbox([back[0] - 0.02, yBelt - 0.004, 0], [0.008, 0.012, 0.03], 0.006, M.METAL);

  return union(0.006, core, coat, mantle, strap, belt, buckle, ...toggles, brooch, vent);
}

function arm(c: ArmCtx): Sdf {
  const { s, U, Wr, z, deltoid, upper, fore } = c;
  // Quilted sleeve to just below the elbow.
  const yCuff = Wr[1] + s.forearm * 0.5;
  let sleeve: Sdf = clipY(new Offset(c.arm, 0.012), yCuff, 1);
  sleeve = quilted(sleeve, [U[0], z], s.armR * 1.2, 0.05, 0.003, yCuff + 0.03, U[1] - 0.05);
  sleeve = new Paint(sleeve, () => M.SHIRT);
  // A frost-blue trim band at the shoulder seam.
  const seamBand = band(union(0.04, deltoid, upper), U[1] - s.upperArm * 0.25 - 0.009, U[1] - s.upperArm * 0.25 + 0.009, 0.014, 0.004, M.TRIM);
  // Fur cuff.
  const cuff = new Paint(furred(torus([Wr[0] + 0.004, yCuff, z], s.foreR * 0.98, 0.026, M.FUR), 0.008, 34), () => M.FUR);
  // Wrapped leather bracer and gloves.
  const bracer = new Displace(band(fore, Wr[1] + 0.008, yCuff - 0.01, 0.003, 0.0055, M.LEATHER),
    (x, y, zz) => -Math.abs(Math.sin(y * 60 + Math.atan2(zz - z, x - Wr[0]))) * 0.0022, 0.003);
  const fist = new Paint(c.fist, (_x, y) => (y > Wr[1] - 0.06 * s.handS ? M.LEATHER : M.SKIN));
  return union(0.006, union(0.02, new Paint(c.arm, () => M.SKIN), fist), sleeve, seamBand, cuff, bracer);
}

function leg(c: LegCtx): Sdf {
  const { s, K, z, shin, legBody } = c;
  const cr = s.calfR;
  // Padded breeches with horizontal stitching.
  const yBoot = K[1] - s.shin * 0.2;
  const pants = new Paint(new Displace(new Offset(legBody, 0.008), (_x, y) => {
    const st = Math.sin(y * 85);
    return Math.exp(-st * st * 10) * 0.0025;
  }, 0.003), () => M.PANTS);
  // Tall boots with a turned-down fur top and two silver-buckled straps.
  const shaft = clipY(new Offset(shin, 0.013), yBoot, -1);
  const boot = new Paint(union(0.03, shaft, new Offset(c.foot, 0.004)), () => M.BOOT);
  const furTop = new Paint(furred(torus([0.002, yBoot - 0.006, z], cr * 1.02, 0.03, M.FUR, [0, 0, 0.05]), 0.009, 32), () => M.FUR);
  const strapY = [yBoot - s.shin * 0.3, yBoot - s.shin * 0.55];
  const straps = strapY.map((y) => band(shin, y - 0.011, y + 0.011, 0.016, 0.005, M.LEATHER));
  const buckles = strapY.map((y) => {
    const p = frontAt(shin, y, z);
    return rbox([p[0] + 0.02, y, z + cr * 0.35], [0.006, 0.013, 0.012], 0.004, M.METAL);
  });
  return union(0.008, pants, boot, c.sole, furTop, ...straps, ...buckles);
}

/** The greatcoat's split tail: two panels hanging from the back of the waist. */
function cloth(c: TorsoCtx): ClothPiece[] {
  const len = c.s.thigh * 0.85;
  const tail = new Paint(
    new Squash(cone([0, -0.045, 0], [0, -len, 0], 0.045, 0.066, M.SHIRT), [0, 0, 0], [0.16, 1, 1]),
    (_x, y) => (y < -len - 0.035 ? M.TRIM : M.SHIRT),
  );
  const y = c.yH - 0.06;
  const b = backAt(c.core, y, 0);
  const root = (side: number): Vec3 => [b[0] - 0.012, y, side * 0.07];
  return [
    { field: tail, root: root(1), bone: 'hips', stiffness: 0.9 },
    { field: tail, root: root(-1), bone: 'hips', stiffness: 0.85 },
  ];
}

export const WARDEN: OutfitSculpt = { torso, arm, leg, cloth };
