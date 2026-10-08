import { M } from '../paint';
import { caps, cone, ell, inter, Offset, Paint, Squash, sub, union, type Sdf, type Vec3 } from '../sdf';
import {
  backAt, band, between, field, frontAt, ramp, seam,
  type ArmCtx, type ClothPiece, type LegCtx, type OutfitSculpt, type TorsoCtx,
} from './kit';

/**
 * Neon Runner (Neon Circuit): a black chrome street duelist. A glossy
 * bodysuit traced with cyan circuits down every flank and limb, an angular
 * chest plate around a glowing core, a high collar ringed with light,
 * shoulder and shin plates, and chunky sneakers on magenta-lit soles. A long
 * data scarf streams from the collar.
 */

/** Circuit line half width. */
const LINE = 0.0075;

function torso(c: TorsoCtx): Sdf {
  const { s, yH, yS, yC, yN, yU, nl, yBelt } = c;
  const yCol = yN + 0.045;
  const core = new Paint(c.core, (_x, y, _z, m) => (y > yCol - 0.01 ? M.SKIN : m === M.SKIN && y > yN - 0.02 ? M.SKIN : M.SUIT));

  // --- Bodysuit with circuits ---------------------------------------------------
  const flank = s.waistW * 0.45;
  const suit = new Paint(between(new Offset(c.core, 0.004), yH - 0.2, yN - 0.02), (x, y, z) => {
    // Down each flank, from the armpit to the hip.
    if (Math.abs(x + 0.012) < LINE && Math.abs(z) > flank && y < yU - 0.06) return M.GLOW;
    // Twin traces down the back that jog outwards at the waist.
    const jog = 0.03 + 0.03 * ramp(yS + 0.03, yS - 0.03, y);
    if (x < -0.05 && Math.abs(Math.abs(z) - jog) < LINE * 0.8 && y > yBelt + 0.03 && y < yU - 0.02) return M.GLOW;
    return M.SUIT;
  });
  // Belt: a slim black band with a magenta light line.
  const belt = new Paint(band(c.core, yBelt - 0.024, yBelt + 0.024, 0.009, 0.007, M.PLATE_DARK),
    (_x, y) => (Math.abs(y - yBelt) < 0.0065 ? M.GLOW2 : M.PLATE_DARK));

  // --- Chest plate: an angular shield over the ribcage with a light core -------
  const pY0 = yC + nl * 0.12, pY1 = yN - 0.055;
  const halfW = (y: number) => s.chestW * (0.52 + 0.3 * ramp(pY0, pY1 - 0.04, y));
  const outline = (y: number, z: number) => Math.max(Math.abs(z) - halfW(y), pY0 - y + Math.abs(z) * 0.45, y - pY1);
  let plate: Sdf = inter(new Offset(c.core, 0.017), field((x, y, z) => Math.max(outline(y, z), -0.02 - x), M.PLATE), 0.008);
  plate = new Paint(plate, (_x, y, z) => (outline(y, z) > -0.012 ? M.GLOW : M.PLATE));
  // The core: a hole through the plate over a disc of light.
  const heartY = yC + nl * 0.5;
  const heart = frontAt(c.core, heartY);
  const disc = (r: number) => field((x, y, z) => Math.max(Math.hypot(y - heartY, z) - r, heart[0] - 0.02 - x), M.GLOW2);
  plate = seam(plate, disc(0.03), M.PLATE_DARK);
  const coreLight = new Paint(inter(new Offset(c.core, 0.011), disc(0.032)), () => M.GLOW2);
  // Panel lines across the plate (dark grooves).
  for (const t of [0.3, 0.72]) {
    const y = yC + nl * t;
    plate = seam(plate, inter(field((x, yy, z) => Math.max(Math.abs(yy - y - Math.abs(z) * 0.3) - 0.004, -x), M.PLATE_DARK),
      field((_x, yy, z) => Math.hypot(yy - heartY, z) > 0.04 ? -1 : 1, M.PLATE_DARK)), M.PLATE_DARK);
  }
  // A smaller backplate with the traces running over it.
  const bY0 = yS + 0.05, bY1 = yU - 0.03;
  const backplate = new Paint(inter(new Offset(c.core, 0.014), field((x, y, z) => Math.max(Math.abs(z) - s.chestW * 0.42, bY0 - y, y - bY1, x + 0.04), M.PLATE), 0.008),
    (_x, _y, z) => (Math.abs(Math.abs(z) - 0.03) < LINE * 0.8 ? M.GLOW : M.PLATE));

  // --- High collar ringed with light ------------------------------------------
  const collar = new Paint(sub(cone([-0.01, yN - 0.07, 0], [-0.004, yCol, 0], s.neckR * 1.62, s.neckR * 1.3, M.SUIT),
    caps([0.006, yN - 0.3, 0], [0.006, yN + 0.3, 0], s.neckR * 1.1, M.SUIT), 0.004),
  (_x, y) => (y > yCol - 0.012 ? M.GLOW : y < yN - 0.04 ? M.PLATE_DARK : M.SUIT));

  return union(0.005, core, suit, belt, plate, coreLight, backplate, collar);
}

function arm(c: ArmCtx): Sdf {
  const { s, U, E, Wr, z, deltoid, fore } = c;
  // Outer-arm circuit: the lateral midline facing away from the body.
  const trace = (x: number, zz: number) => Math.abs(x - U[0]) < LINE && zz > z + s.armR * 0.25;
  const suit = new Paint(new Offset(c.arm, 0.004), (x, _y, zz) => (trace(x, zz) ? M.GLOW : M.SUIT));
  // Shoulder plate: the outer half of the shoulder, lit along its lower edge.
  const sY0 = U[1] - s.upperArm * 0.3;
  const shoulder = new Paint(inter(between(new Offset(deltoid, 0.016), sY0, U[1] + 0.2, 0.006), field((_x, _y, zz) => z - 0.025 - zz, M.PLATE), 0.01),
    (_x, y) => (y < sY0 + 0.01 ? M.GLOW : M.PLATE));
  // Forearm bracer with the trace running through it.
  const bY0 = Wr[1] + 0.02, bY1 = E[1] - 0.05;
  const bracer = new Paint(between(new Offset(fore, 0.012), bY0, bY1, 0.006),
    (x, y, zz) => (trace(x, zz) ? M.GLOW : y < bY0 + 0.008 || y > bY1 - 0.008 ? M.PLATE_DARK : M.PLATE));
  // Gloves, with lit knuckles.
  const k = s.handS;
  const ky = Wr[1] - 0.087 * k;
  const fist = new Paint(c.fist, (x, y) => (Math.abs(y - ky) < 0.008 * k && x > Wr[0] - 0.035 * k ? M.GLOW2 : M.SUIT));
  return union(0.006, union(0.02, suit, fist), shoulder, bracer);
}

function leg(c: LegCtx): Sdf {
  const { s, K, A, z, shin, legBody } = c;
  const cr = s.calfR;
  // Outer-leg circuit, hip to ankle.
  const trace = (x: number, zz: number) => Math.abs(x) < LINE && zz > z + s.thighR * 0.3;
  const suit = new Paint(new Offset(legBody, 0.004), (x, _y, zz) => (trace(x, zz) ? M.GLOW : M.SUIT));
  // Knee guard with a lit slit.
  const kc: Vec3 = [cr * 0.9, K[1] + 0.01, z];
  const knee = new Paint(ell(kc, [cr * 0.5, cr * 0.95, cr * 0.82], M.PLATE), (_x, y) => (Math.abs(y - kc[1]) < 0.006 ? M.GLOW2 : M.PLATE));
  // Shin guard over the front of the shin.
  const gY0 = A[1] + 0.09, gY1 = K[1] - 0.075;
  const guard = new Paint(inter(between(new Offset(shin, 0.012), gY0, gY1, 0.006), field((x) => -0.012 - x, M.PLATE), 0.008),
    (x, y, zz) => (trace(x, zz) ? M.GLOW : y > gY1 - 0.01 ? M.PLATE_DARK : M.PLATE));
  // Chunky sneakers: a white upper, dark toe cap, and a thick sole with a magenta light line.
  const fs = s.footS;
  const ankleY = A[1] + 0.06;
  const upper = new Paint(union(0.03, between(new Offset(shin, 0.01), A[1] - 0.04, ankleY), new Offset(c.foot, 0.01)),
    (x, y) => ((x - A[0]) / fs > 0.13 && y < A[1] - 0.025 ? M.TRIM : y > ankleY - 0.014 ? M.SUIT : M.BOOT));
  // The sole stands on the ground (y = 0); its light line runs round the middle.
  const sole = new Paint(new Offset(c.sole, 0.005), (_x, y) => (y > 0.008 && y < 0.016 ? M.GLOW2 : M.SOLE));
  return union(0.008, suit, knee, guard, upper, sole);
}

/** A long data scarf: two ribbons streaming from the back of the collar. */
function cloth(c: TorsoCtx): ClothPiece[] {
  const ribbon = (len: number, w: number, lean: number) => new Paint(
    new Squash(cone([0, -w, 0], [-0.03, -len, lean], w, w * 0.75, M.SASH), [0, 0, 0], [0.3, 1, 1]),
    (_x, _y, zz) => (Math.abs(zz) > w * 0.62 ? M.GLOW2 : M.SASH),
  );
  const y = c.yN - 0.035;
  const b = backAt(c.core, y);
  return [
    { field: ribbon(0.46, 0.034, 0.03), root: [b[0] - 0.04, y, 0.025], bone: 'chest', stiffness: 0.7 },
    { field: ribbon(0.36, 0.03, -0.02), root: [b[0] - 0.035, y - 0.01, -0.02], bone: 'chest', stiffness: 0.75 },
  ];
}

export const RUNNER: OutfitSculpt = { torso, arm, leg, cloth };
