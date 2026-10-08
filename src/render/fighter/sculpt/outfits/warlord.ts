import { M } from '../paint';
import {
  ball, caps, cone, Displace, ell, inter, noise3, Offset, Paint, rbox, shell, Squash, strand, sub, union, type Sdf, type Vec3,
} from '../sdf';
import {
  backAt, band, between, clipY, field, front, frontAt, ramp, seam, segYZ, slab,
  type ArmCtx, type ClothPiece, type LegCtx, type OutfitSculpt, type TorsoCtx,
} from './kit';

/**
 * Ember Warlord (Hellforge): blackened iron plate quenched in magma. A
 * cuirass with a molten chevron and core, banded faulds and hip tassets with
 * fire leaking from every seam, a high gorget, horned pauldrons, cracked
 * vambraces, greaves with glowing flanks and plated sabatons, over an
 * oxblood gambeson. A crimson war tabard hangs front and back.
 */

/** Armour stands this far off the body. */
const PLATE = 0.016;

function torso(c: TorsoCtx): Sdf {
  const { s, yH, yS, yC, yN, yU, nl, yBelt } = c;
  const core = new Paint(c.core, (_x, y, _z, m) => {
    if (m === M.SKIN || y > yN - 0.02) return M.SKIN;
    return y < c.yHem ? M.PANTS : M.SHIRT;
  });

  // --- Cuirass ---------------------------------------------------------------
  const yTop = yN - 0.035;
  const yFauld = yS + 0.06;
  const neckHole = caps([0.01, yN - 0.3, 0], [0.01, yN + 0.3, 0], s.neckR * 1.32, M.PLATE);
  let cuirass: Sdf = sub(between(new Offset(c.core, PLATE), yBelt + 0.026, yTop), neckHole, 0.02);
  // A keel down the breastplate and a flared lower edge over each fauld.
  cuirass = new Displace(cuirass, (x, y, z) => {
    if (x < 0) return 0;
    const keel = Math.exp(-((z / 0.035) ** 2)) * ramp(yS, yC + nl * 0.2, y) * (1 - ramp(yC + nl * 0.75, yTop, y));
    return -0.008 * keel;
  }, 0.008);
  // Banded faulds over the belly: each band flares at its lower lip (the
  // steps between bands sit inside the seams carved below).
  const fauldH = (yFauld - yBelt - 0.026) / 3;
  cuirass = new Displace(cuirass, (_x, y) => {
    if (y > yFauld || y < yBelt + 0.026) return 0;
    const f = ((y - yBelt - 0.026) / fauldH) % 1;
    return -0.006 * (1 - f);
  }, 0.006);
  cuirass = new Paint(cuirass, () => M.PLATE);

  // Molten seams: between the faulds, under the breastplate, a chevron across
  // the chest meeting at a core of magma on the sternum, and a ring of rivets.
  const grooveAt = (y: number, w: number) => inter(shell(c.core, PLATE, 0.009, M.GLOW), slab(y - w, y + w, M.GLOW));
  const chevA = yC + nl * 0.74, chevB = yC + nl * 0.36, chevZ = s.chestW * 0.62;
  const heart = frontAt(c.core, chevB - 0.01);
  const chevron = inter(shell(c.core, PLATE, 0.012, M.GLOW), front((y, z, x) => Math.min(
    Math.min(segYZ(y, z, chevA, chevZ, chevB, 0), segYZ(y, z, chevA, -chevZ, chevB, 0)) - 0.0085,
    Math.hypot(y - heart[1], z, Math.max(0, heart[0] - 0.05 - x)) - 0.024,
  ), 0.02, M.GLOW));
  for (let i = 1; i <= 3; i++) cuirass = seam(cuirass, grooveAt(yBelt + 0.026 + fauldH * i, 0.0075));
  cuirass = seam(cuirass, chevron);

  // --- Gorget: a high collar of plate, lower at the front, bronze lipped ------
  const gTop = (x: number) => yN + 0.02 - Math.max(0, x) * 0.35;
  const gorget = new Paint(
    inter(sub(cone([-0.012, yN - 0.07, 0], [-0.016, yN + 0.04, 0], s.neckR * 1.95, s.neckR * 1.5, M.PLATE),
      caps([0.0, yN - 0.3, 0], [-0.01, yN + 0.3, 0], s.neckR * 1.18, M.PLATE), 0.006),
    field((x, y) => (y - gTop(x)) * 0.94, M.PLATE), 0.006),
    (x, y) => (y > gTop(x) - 0.014 ? M.METAL : M.PLATE_DARK),
  );

  // --- War belt with an ember buckle -------------------------------------------
  const belt = new Paint(band(c.core, yBelt - 0.034, yBelt + 0.03, 0.02, 0.013, M.LEATHER), (x, y, z) => {
    const a = Math.atan2(z, x);
    const stud = Math.abs(Math.sin(a * 7)) > 0.93 && Math.abs(y - yBelt) < 0.013;
    return stud ? M.METAL : M.LEATHER;
  });
  const bp = frontAt(c.core, yBelt);
  const buckle = union(0.004,
    rbox([bp[0] + 0.03, yBelt, 0], [0.014, 0.038, 0.042], 0.01, M.METAL),
    ball([bp[0] + 0.046, yBelt, 0], 0.017, M.GLOW),
  );

  // --- Hip tassets: two flared plates each side, fire in the seam -------------
  const tY0 = yH - 0.15, tY1 = yBelt - 0.02;
  const skirt = new Squash(cone([0, tY1, 0], [0, tY0, 0], c.pelvisW * 1.12, c.pelvisW * 1.36, M.PLATE),
    [0, 0, 0], [c.pelvisD / c.pelvisW * 1.05, 1, 1]);
  let tasset: Sdf = inter(inter(shell(skirt, 0, 0.008, M.PLATE), slab(tY0, tY1, M.PLATE)),
    field((x, _y, z) => Math.max(c.pelvisW * 0.5 - Math.abs(z), Math.abs(x + 0.01) - c.pelvisD * 0.8), M.PLATE), 0.01);
  const tMid = (tY0 + tY1) / 2;
  tasset = new Paint(tasset, (_x, y) => (y < tY0 + 0.016 ? M.METAL : Math.abs(y - tMid) < 0.007 ? M.GLOW : M.PLATE));

  // --- Back: a raised spine plate down the backplate ---------------------------
  const ridge = new Displace(between(new Offset(c.core, PLATE + 0.002), yS, yU - 0.02),
    (_x, _y, z) => -0.009 * Math.exp(-((z / 0.022) ** 2)), 0.009);
  const back = new Paint(inter(ridge, field((x, _y, z) => Math.max(Math.abs(z) - 0.045, x + 0.03), M.PLATE)), () => M.PLATE_DARK);

  return union(0.005, core, cuirass, gorget, belt, buckle, tasset, back);
}

function arm(c: ArmCtx): Sdf {
  const { s, U, E, Wr, z, deltoid, upper, fore } = c;
  const ar = s.armR, fr = s.foreR;
  // Oxblood gambeson sleeve down to mid upper arm, bare skin to the vambrace.
  const ySleeve = U[1] - s.upperArm * 0.55;
  const sleeve = clipY(new Paint(new Offset(union(0.04, deltoid, upper), 0.005), () => M.SHIRT), ySleeve, 1);

  // Pauldron: three overlapping lames stepping down the shoulder, a bronze
  // edge, fire between the lames, and a back-swept horn.
  const dome = new Offset(deltoid, 0.024);
  const pTop = U[1] + 0.05, pLow = U[1] - s.upperArm * 0.42;
  const lameH = (pTop - pLow) / 3;
  let pauldron: Sdf = between(dome, pLow, pTop + 0.1);
  pauldron = new Displace(pauldron, (_x, y) => {
    if (y > pTop) return -0.006;
    if (y < pLow) return -0.014;
    const f = ((y - pLow) / lameH) % 1;
    return -0.008 * (1 - f) - 0.006;
  }, 0.014);
  pauldron = new Paint(pauldron, (_x, y) => (y < pLow + 0.012 ? M.METAL : M.PLATE));
  for (let i = 1; i <= 2; i++) {
    const y = pLow + lameH * i;
    pauldron = seam(pauldron, inter(shell(deltoid, 0.03, 0.012, M.GLOW), slab(y - 0.006, y + 0.006, M.GLOW)));
  }
  // The horn rises from the top lame, sweeps back and curls up, glowing at the tip.
  const h0: Vec3 = [U[0] - 0.01, U[1] + 0.035, z + ar * 0.55];
  const horn = new Paint(strand([
    h0,
    [h0[0] - 0.02, h0[1] + 0.05, h0[2] + 0.025],
    [h0[0] - 0.06, h0[1] + 0.085, h0[2] + 0.03],
    [h0[0] - 0.105, h0[1] + 0.095, h0[2] + 0.025],
  ], [0.024, 0.017, 0.01, 0.004], M.PLATE_DARK, 0.006), (x) => (x < h0[0] - 0.085 ? M.GLOW2 : M.PLATE_DARK));

  // Vambrace: a plated forearm guard with bronze rims, a ridge along the back
  // of the forearm and a molten crack wound around it.
  const vY0 = Wr[1] + 0.012, vY1 = E[1] - 0.035;
  let vamb: Sdf = between(new Offset(fore, 0.012), vY0, vY1, 0.004);
  vamb = new Displace(vamb, (x, y, zz) => {
    // Down the outer face (the back of the forearm faces away from the body).
    const ridge = Math.exp(-(((x - Wr[0]) / 0.016) ** 2)) * ramp(z, z + fr * 0.5, zz);
    return -0.007 * ridge * ramp(vY0, vY0 + 0.04, y);
  }, 0.007);
  vamb = new Paint(vamb, (_x, y) => (y < vY0 + 0.013 || y > vY1 - 0.013 ? M.METAL : M.PLATE));
  vamb = seam(vamb, inter(shell(fore, 0.012, 0.009, M.GLOW), field((x, y, zz) => {
    // A jagged crack spiralling once around the forearm.
    const a = Math.atan2(zz - z, x - Wr[0]);
    const yc = vY0 + (vY1 - vY0) * (0.5 + 0.18 * Math.sin(a * 2) + 0.06 * noise3(x * 60, y * 10, zz * 60));
    return Math.abs(y - yc) - 0.006;
  }, M.GLOW)));
  // Gauntlet: dark leather fist with iron knuckles.
  const k = s.handS;
  const knuckles = rbox([Wr[0] + 0.004 * k, Wr[1] - 0.087 * k, Wr[2] + 0.019 * k], [0.046 * k, 0.012 * k, 0.012 * k], 0.008, M.PLATE);
  const fist = new Paint(c.fist, () => M.LEATHER);

  return union(0.006, union(0.02, new Paint(c.arm, () => M.SKIN), fist), sleeve, pauldron, horn, vamb, knuckles);
}

function leg(c: LegCtx): Sdf {
  const { s, K, A, z, thigh, shin, legBody } = c;
  const cr = s.calfR, tr = s.thighR;
  // Dark breeches, fitted.
  const pants = new Paint(new Offset(legBody, 0.005), () => M.PANTS);

  // Cuisse over the front of the thigh, with a glowing lower lip.
  const cY0 = K[1] + 0.07, cY1 = c.T[1] - 0.12;
  const cuisse = new Paint(inter(between(new Offset(thigh, 0.013), cY0, cY1, 0.004), field((x) => tr * 0.1 - 0.03 - x, M.PLATE), 0.01),
    (_x, y) => (y < cY0 + 0.012 ? M.METAL : M.PLATE));
  // Knee cop: a domed plate with a short spike.
  const kc: Vec3 = [cr * 0.95, K[1] + 0.005, z];
  const knee = union(0.008,
    new Paint(ell(kc, [cr * 0.55, cr * 0.85, cr * 0.85], M.PLATE), (_x, y) => (Math.abs(y - kc[1]) < 0.007 ? M.GLOW : M.PLATE)),
    cone([kc[0] + cr * 0.4, kc[1], z], [kc[0] + cr * 0.62, kc[1] + 0.006, z], 0.014, 0.003, M.PLATE_DARK),
  );
  // Greave: plate around the shin with a keel down the front; magma glows
  // along both flanks of the keel.
  const gY0 = A[1] + 0.06, gY1 = K[1] - 0.06;
  let greave: Sdf = between(new Offset(shin, 0.014), gY0, gY1, 0.004);
  greave = new Displace(greave, (x, _y, zz) => (x > 0 ? -0.009 * Math.exp(-(((zz - z) / 0.02) ** 2)) : 0), 0.009);
  greave = new Paint(greave, (_x, y) => (y > gY1 - 0.012 ? M.METAL : M.PLATE));
  greave = seam(greave, inter(shell(shin, 0.014, 0.01, M.GLOW), front((y, zz) => {
    const off = Math.abs(Math.abs(zz - z) - cr * 0.48);
    return Math.max(off - 0.006, gY0 + 0.03 - y, y - gY1 + 0.03);
  }, 0, M.GLOW)));

  // Sabaton: plated boot with stepped toe plates and an iron sole.
  const fs = s.footS;
  const F = c.F;
  const shaft = between(new Offset(shin, 0.012), A[1] - 0.05, gY0 + 0.01);
  let sabaton: Sdf = new Paint(union(0.03, shaft, new Offset(c.foot, 0.008)), () => M.PLATE_DARK);
  // Stepped toe plates: soft ridges across the instep.
  sabaton = new Displace(sabaton, (x, y) => {
    const t = (x - A[0]) / fs;
    const on = ramp(0.02, 0.06, t) * (1 - ramp(A[1], A[1] + 0.03, y));
    return -0.0035 * on * (0.5 + 0.5 * Math.cos(t * Math.PI * 2 * 11));
  }, 0.0035);
  const sole = new Paint(c.sole, () => M.SOLE);
  const toe = ell(F(0.16, -0.045, 0), [0.04 * fs, 0.026, 0.044 * fs], M.PLATE);

  return union(0.008, pants, cuisse, knee, greave, sabaton, sole, toe);
}

/** A crimson tabard hanging from the belt in front, a longer one behind. */
function cloth(c: TorsoCtx): ClothPiece[] {
  const panel = (len: number, w0: number, w1: number) => new Paint(
    new Squash(cone([0, -w0, 0], [0, -len, 0], w0, w1, M.SASH), [0, 0, 0], [0.12, 1, 1]),
    (_x, y, z) => {
      // A bronze-trimmed hem and a glowing sigil (a downward chevron) in the middle.
      if (y < -len - w1 * 0.55) return M.METAL;
      const yc = -len * 0.5;
      const chev = Math.abs(y - yc - Math.abs(z) * 0.9) < 0.012 && Math.abs(z) < w0 * 0.55;
      return chev ? M.GLOW : M.SASH;
    },
  );
  const y = c.yBelt - 0.034;
  const bf = frontAt(c.core, y), bb = backAt(c.core, y);
  return [
    { field: panel(c.s.thigh * 0.5, 0.075, 0.06), root: [bf[0] + 0.03, y, 0], bone: 'hips', stiffness: 1.1 },
    { field: panel(c.s.thigh * 0.72, 0.09, 0.075), root: [bb[0] - 0.03, y, 0], bone: 'hips', stiffness: 0.9 },
  ];
}

export const WARLORD: OutfitSculpt = { torso, arm, leg, cloth };
