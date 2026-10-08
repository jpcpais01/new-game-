import type { Object3D } from 'three';
import type { PartSpec } from '../../meshBuilder';
import { cone, cyl, group, halfSphere, lathe, lineless, octa, part, rbox, sphere, torus } from '../kit';
import { bootBase, lp, type SkinModel } from '../models';
import { crystal, facetLathe, glowSpec, grad, leaf, pair, tube } from './forge';

// -----------------------------------------------------------------------------
// Wildwood: grown, not made. Living bark and twisted roots, moss, fresh
// leaves and pink blossoms, with sap glowing green where the wood is alive.
// -----------------------------------------------------------------------------

const BARK: PartSpec = { color: 0x6e4527 };
const BARK_DARK: PartSpec = { color: 0x40271a };
const MOSS: PartSpec = { color: 0x5f9c3c };
const PETAL = grad(0xffeef6, 0xff8ac0, 0, 0.05);
const LIFE = glowSpec(0xa6ff6a, 2.1);
const SAP = glowSpec(0xc8ff7a, 1.5);
const leafSpec = (len: number) => grad(0x3f8a2e, 0xa6e85a, 0, len, { gloss: 0.2 });

/** Five-petal blossom facing +Z with a glowing heart. */
function flower(parent: Object3D, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], size = 0.05): void {
  const f = group(parent, pos, rot);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    part(f, leaf(size, size * 0.62, 0.5), PETAL, { rot: [0.35 * Math.cos(a), 0.35 * Math.sin(a), a], scale: [1, 1, 1] });
  }
  part(f, sphere(size * 0.26, 8, 6), glowSpec(0xfff0a0, 1.8), { pos: [0, 0, 0.006] });
}

/** A sprig of leaves along +Y. */
function sprig(parent: Object3D, pos: [number, number, number], rot: [number, number, number], n = 3, len = 0.07): void {
  const g = group(parent, pos, rot);
  for (let k = 0; k < n; k++) {
    const side = k % 2 ? 1 : -1;
    part(g, leaf(len * (1 - k * 0.12), len * 0.4), leafSpec(len), { pos: [0, k * len * 0.45, 0], rot: [0, 0, side * 0.7] });
  }
}

/** Spiral vine around the Y axis between y0 and y1. */
function vine(r: number, y0: number, y1: number, turns: number, phase = 0): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const n = Math.max(6, Math.round(turns * 8));
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = phase + t * turns * Math.PI * 2;
    pts.push([Math.cos(a) * r, y0 + (y1 - y0) * t, Math.sin(a) * r]);
  }
  return pts;
}

// --- Elderbough (longbow) -----------------------------------------------------------------

const bow: SkinModel['weapon'] = (g) => {
  part(g, rbox(0.065, 0.26, 0.055, 0.022), BARK_DARK);
  part(g, tube('wwGrip', vine(0.036, -0.12, 0.12, 3), 0.008, 0.008, 30, 4), MOSS);
  part(g, crystal(0.03, 0.09, 6), LIFE, { pos: [0.04, -0.04, 0], rot: [0, 0, -Math.PI / 2] });
  for (const sy of [-1, 1]) {
    // Gnarled branch limbs.
    const limb: [number, number, number][] = [[0, sy * 0.1, 0], [0.07, sy * 0.3, 0.01], [0.12, sy * 0.5, -0.01], [0.08, sy * 0.7, 0.01], [-0.02, sy * 0.88, 0]];
    part(g, tube(`wwLimb${sy}`, limb, 0.034, 0.013, 24, 7), BARK);
    part(g, tube(`wwLimbVine${sy}`, limb.map(([x, y, z], i) => [x + Math.sin(i * 2.1) * 0.03, y, z + Math.cos(i * 2.1) * 0.03] as [number, number, number]), 0.007, 0.005, 24, 4), MOSS);
    // Leaves and a blossom at each tip.
    sprig(g, [0.11, sy * 0.45, 0.02], [0, 0, sy > 0 ? -0.9 : Math.PI + 0.9], 3, 0.08);
    sprig(g, [0.06, sy * 0.72, -0.02], [0, 0, sy > 0 ? -0.4 : Math.PI + 0.4], 2, 0.07);
    flower(g, [-0.02, sy * 0.9, 0.01], [0, 0, 0], 0.055);
  }
  // A string of glowing sap.
  part(g, rbox(0.006, 1.76, 0.006, 0.002), lineless(SAP), { pos: [-0.03, 0, 0] });
  return { base: [0, -0.6, 0], tip: [0, 0.6, 0] };
};

// --- Worldroot (arcane staff) ------------------------------------------------------------------

const staff: SkinModel['weapon'] = (g) => {
  const shaft: [number, number, number][] = [[0, -0.76, 0], [0.02, -0.3, 0.01], [-0.015, 0.2, -0.01], [0.015, 0.7, 0.01], [0, 1.1, 0]];
  part(g, tube('wwShaft', shaft, 0.04, 0.032, 30, 8), BARK);
  part(g, tube('wwShaftVine', vine(0.04, -0.4, 0.95, 3.5), 0.009, 0.007, 50, 4), MOSS);
  // Roots splaying at the foot.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    part(g, tube('wwFootRoot', [[0, -0.62, 0], [0.04, -0.72, 0], [0.08, -0.78, 0]], 0.018, 0.006, 8, 5), BARK_DARK, { rot: [0, a, 0] });
  }
  // Roots climbing up and curling around a glowing seed.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    part(g, tube('wwCrown', [[0.02, 1.0, 0], [0.12, 1.16, 0], [0.13, 1.36, 0], [0.04, 1.52, 0]], 0.024, 0.008, 18, 6), k % 2 ? BARK : BARK_DARK, { rot: [0, a, 0] });
  }
  part(g, sphere(0.085, 14, 10), LIFE, { pos: [0, 1.32, 0] });
  part(g, sphere(0.11, 12, 8), lineless(glowSpec(0x7ee05a, 0.5)), { pos: [0, 1.32, 0] });
  sprig(g, [0, 1.48, 0], [0, 0, 0.2], 4, 0.1);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    flower(g, [Math.cos(a) * 0.12, 1.18, Math.sin(a) * 0.12], [0, -a + Math.PI / 2, 0], 0.045);
  }
  part(g, torus(0.045, 0.012, Math.PI * 2, 4, 10), MOSS, { pos: [0, 0.75, 0], rot: [Math.PI / 2, 0, 0] });
  return { base: [0, 1.0, 0], tip: [0, 1.36, 0] };
};

// --- Bloomguard (thornmail) ---------------------------------------------------------------------

function mossy(parent: Object3D, pos: [number, number, number], r: number): void {
  for (let k = 0; k < 4; k++) part(parent, sphere(r * (1 - k * 0.15), 7, 5), MOSS, { pos: [pos[0], pos[1] + (k % 2) * r * 0.6, pos[2] + (k - 1.5) * r * 0.9], scale: [0.5, 0.8, 1] });
}

const thornmail: SkinModel['defense'] = (s) => {
  const k = s.big ? 1.28 : 1;
  part(s.chest, lathe('wwChest', [[0.001, 0.04], [0.21, 0.06], [0.25, 0.2], [0.26, 0.32], [0.2, 0.4], [0.001, 0.42]], 16), BARK, { scale: [0.88 * k, 1, 1.14 * k] });
  // Grain: a few raised strips of darker bark following the chest's curve.
  for (let i = 0; i < 4; i++) {
    const a = -0.75 + i * 0.5;
    part(s.chest, tube('wwGrain', [[0.2, 0.08, 0], [0.245, 0.2, 0.01], [0.25, 0.3, -0.01], [0.19, 0.39, 0]], 0.012, 0.006, 12, 5), BARK_DARK,
      { rot: [0, -a, 0], scale: [0.88 * k, 1, 1.14 * k] });
  }
  // A cuirass of broad leaves layered like scales down the front, each tier
  // fanning out from a root along the sternum.
  const tiers: [number, number, number][] = [[0.36, 0.24, 0.5], [0.26, 0.23, 0.62], [0.16, 0.2, 0.74]];
  tiers.forEach(([y, len, fan], i) => {
    for (const sz of [-1, 1]) {
      part(s.chest, leaf(len, len * 0.55, 0.32), leafSpec(len),
        { pos: [(0.236 - i * 0.004) * k, y, sz * 0.015], rot: [sz * -0.08, Math.PI / 2 - 0.12, Math.PI - sz * fan] });
    }
  });
  part(s.chest, tube('wwSternum', [[0.235, 0.41, 0], [0.25, 0.3, 0], [0.252, 0.18, 0], [0.235, 0.06, 0]], 0.016, 0.01, 12, 5), BARK_DARK, { scale: [k, 1, 1] });
  part(s.chest, octa(0.03), SAP, { pos: [0.262 * k, 0.3, 0], scale: [0.6, 1.3, 1] });
  // A vine winding around the torso, moss, blooms and a collar of leaves.
  part(s.chest, tube('wwChestVine', [[0.17, 0.02, -0.2], [0.24, 0.14, -0.06], [0.22, 0.24, 0.12], [0.08, 0.34, 0.26], [-0.12, 0.38, 0.22]], 0.014, 0.01, 24, 5), MOSS, { scale: [k, 1, k] });
  mossy(s.chest, [0.22 * k, 0.36, -0.08], 0.05);
  flower(s.chest, [0.235 * k, 0.24, 0.08], [0, Math.PI / 2, 0], 0.065);
  flower(s.chest, [0.2 * k, 0.12, -0.14 * k], [0, Math.PI / 2 + 0.5, 0], 0.05);
  flower(s.chest, [0.12 * k, 0.33, 0.24 * k], [0, 0.6, 0], 0.045);
  for (let i = 0; i < 9; i++) {
    const a = -1.6 + i * 0.4;
    part(s.chest, leaf(0.09, 0.035), leafSpec(0.09), { pos: [Math.cos(a) * 0.17 * k, 0.41, Math.sin(a) * 0.2 * k], rot: [Math.sin(a) * 0.9, -a, -Math.cos(a) * 0.9] });
  }
  // Shoulders: bark caps sprouting leaves and blooms.
  for (const sh of [s.shoulderL, s.shoulderR]) {
    part(sh, halfSphere(0.165 * k, 12), BARK, { scale: [1.15, 0.85, 1.1] });
    part(sh, torus(0.16 * k, 0.014, Math.PI * 2, 4, 16), BARK_DARK, { rot: [Math.PI / 2, 0, 0], scale: [1.15, 1.1, 1] });
    for (let i = 0; i < 5; i++) part(sh, leaf(0.15, 0.05), leafSpec(0.15), { pos: [(i - 2) * 0.05, 0.1, 0], rot: [i % 2 ? 0.4 : -0.4, 0, (2 - i) * 0.4] });
    flower(sh, [0.04, 0.15, 0], [-Math.PI / 2, 0, 0], 0.05);
  }
  // Vines around the forearms with a few thorns kept for show.
  for (const fa of [s.forearmL, s.forearmR]) {
    part(fa, tube('wwArmVine', vine(0.075, -0.02, -0.28, 1.6), 0.01, 0.008, 24, 4), MOSS);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      part(fa, cone(0.016, 0.07, 4), BARK_DARK, { pos: [Math.cos(a) * 0.09, -0.14, Math.sin(a) * 0.09], rot: [Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4] });
    }
    part(fa, leaf(0.07, 0.03), leafSpec(0.07), { pos: [0.07, -0.08, 0], rot: [0, 0, -0.8] });
  }
};

// --- Laurel of the Grove (duelist band) --------------------------------------------------------

const laurel: SkinModel['head'] = (s) => {
  const { head, headY: y, headR: r } = s;
  const c = group(head, [0, y + 0.08, 0], [0, 0, -0.15]);
  const rr = r * 1.0;
  part(c, torus(rr, 0.012, Math.PI * 2, 4, 30), { color: 0xd8a848, gloss: 0.9 }, { rot: [Math.PI / 2, 0, 0] });
  // Leaves sweeping back from the brow on both sides.
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const a = sz * (0.25 + i * 0.36);
      const len = 0.085 - i * 0.004;
      part(c, leaf(len, len * 0.42, 0.3), grad(0x4c8a32, 0xb8e070, 0, len), {
        pos: [Math.cos(a) * rr, 0.01 + (i % 2) * 0.012, Math.sin(a) * rr], rot: [0, -a + (sz > 0 ? Math.PI : 0), sz * 1.9],
      });
    }
  }
  flower(c, [rr + 0.01, 0.02, 0], [0, Math.PI / 2, 0], 0.045);
  for (let k = 0; k < 2; k++) {
    const t = s.clothBone(head, -r * 1.0, y + 0.07, (k - 0.5) * 0.06);
    part(t, rbox(0.26 - k * 0.05, 0.035, 0.05, 0.012), { color: 0x4c8a3a }, { pos: [-(0.13 - k * 0.025), -0.03 - k * 0.03, 0], rot: [0, 0, -0.4 - k * 0.15] });
    part(t, leaf(0.05, 0.025), leafSpec(0.05), { pos: [-(0.26 - k * 0.05), -0.08 - k * 0.05, 0], rot: [0, 0, 2.2] });
  }
};

// --- Mossleapers (leaping boots) -----------------------------------------------------------------

const boots: SkinModel['boots'] = (leg, _m, s) => {
  bootBase(leg, BARK, BARK, BARK_DARK, s);
  // Moss cuff, root straps and a toe of curled root.
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    lp(leg, sphere(0.042, 7, 5), MOSS, { pos: [Math.cos(a) * 0.1, -0.18 + (k % 2) * 0.012, Math.sin(a) * 0.1], scale: [1, 0.75, 1] });
  }
  lp(leg, tube('wwStrap', vine(0.098, -0.22, -0.36, 1.2), 0.012, 0.012, 16, 5), BARK_DARK);
  lp(leg, tube('wwToe', [[0.18, -0.42, 0], [0.26, -0.43, 0], [0.29, -0.38, 0], [0.26, -0.35, 0]], 0.03, 0.008, 12, 6), BARK_DARK);
  // Leaf wings at the ankles.
  pair(leg.shin, leaf(0.2, 0.07, 0.15), leafSpec(0.2), { pos: [-0.04, -0.28, 0.1], rot: [-0.35, 0, 0.9] });
  pair(leg.shin, leaf(0.15, 0.055, 0.15), leafSpec(0.15), { pos: [-0.06, -0.3, 0.1], rot: [-0.35, 0, 1.3] });
  // Glowing mushrooms on the heel.
  for (let k = 0; k < 2; k++) {
    lp(leg, cyl(0.008, 0.01, 0.04, 6), { color: 0xf2ead8 }, { pos: [-0.1, -0.36 + k * 0.05, (k - 0.5) * 0.05], rot: [0, 0, 1.4] });
    lp(leg, facetLathe('wwShroom', [[0.001, 0.02], [0.022, 0.012], [0.026, 0.0]], 8), glowSpec(0x7affc8, 1.6), { pos: [-0.12, -0.36 + k * 0.05, (k - 0.5) * 0.05], rot: [0, 0, 1.4] });
  }
};

// --- Heartseed (earth heart) ---------------------------------------------------------------------

const heart: SkinModel['special'] = (s) => {
  const ob = s.orbiter();
  part(ob, sphere(0.055, 12, 8), LIFE);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    part(ob, tube('wwSeedCage', [[0, -0.11, 0], [0.09, -0.05, 0], [0.09, 0.06, 0], [0, 0.11, 0]], 0.012, 0.012, 14, 5), BARK, { rot: [0, a, 0] });
  }
  sprig(ob, [0, 0.1, 0], [0, 0, 0], 3, 0.08);
  flower(ob, [0.0, -0.02, 0.1], [0, 0, 0], 0.045);
  part(ob, torus(0.17, 0.005, Math.PI * 2, 4, 28), lineless(SAP), { rot: [1.2, 0.3, 0] });
};

export const WILDWOOD: Record<string, SkinModel> = {
  wild_bow: { weapon: bow },
  wild_staff: { weapon: staff },
  wild_thorn: { defense: thornmail },
  wild_band: { head: laurel },
  wild_boots: { boots },
  wild_heart: { special: heart },
};
