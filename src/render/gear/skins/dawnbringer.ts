import type { Object3D } from 'three';
import type { PartSpec } from '../../meshBuilder';
import { cyl, group, halfSphere, lathe, lineless, octa, part, rbox, slab, sphere, torus, type Mats } from '../kit';
import { bootBase, lp, shieldBack, type SkinModel } from '../models';
import { edgeBlade, facetLathe, glowSpec, grad, plate, rowsOf, starPts } from './forge';

// -----------------------------------------------------------------------------
// Dawnbringer: white enamel, sunlit gold and sky-blue leather. Feathered
// wings, sunbursts and floating halos; the glow is warm morning light.
// -----------------------------------------------------------------------------

const ENAMEL: PartSpec = { color: 0xf5f1e8, gloss: 0.55 };
const GOLD: PartSpec = { color: 0xf4c552, gloss: 1 };
const GOLD_DEEP: PartSpec = { color: 0xc98f2c, gloss: 0.9 };
const SKY: PartSpec = { color: 0x3a6fd0 };
const LIGHT = glowSpec(0xffe6a0, 2.3);
const HALO = glowSpec(0xfff0c4, 1.7);
/** Feathers: white at the root, warming to gold at the tip. */
const plume = (len: number) => grad(0xfffbf2, 0xf2c860, len * 0.55, len, { gloss: 0.3 });

function feather(len: number, w: number) {
  return plate(`dbFeather${len}:${w}`, [[-w * 0.35, 0], [w * 0.4, 0], [w * 0.5, len * 0.35], [w * 0.38, len * 0.8], [0, len], [-w * 0.3, len * 0.75], [-w * 0.42, len * 0.3]], 0.01, 0.004);
}

/**
 * A fanned wing in the XY plane, spreading towards +X and up from its root.
 * `n` feathers, the longest first; `spread` is the fan angle in radians.
 */
function wing(parent: Object3D, n: number, len: number, spread = 1.1, start = 0.25): void {
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const l = len * (1 - t * 0.55);
    const a = -(start + t * spread);
    part(parent, feather(l, l * 0.3), plume(l), { pos: [Math.sin(-a) * len * 0.12 * t, -t * len * 0.05, i * 0.004], rot: [0, 0, a] });
  }
  part(parent, sphere(len * 0.08, 8, 6), GOLD, {});
}

/** Sunburst plate facing ±Z. */
function sunburst(g: Object3D, r: number, rays: number, pos: [number, number, number], depth = 0.014): void {
  part(g, plate(`dbSun${rays}:${r}`, starPts(rays, r * 0.55, r), depth, 0.004), GOLD, { pos });
  part(g, cyl(r * 0.42, r * 0.42, depth * 1.6, 16), LIGHT, { pos, rot: [Math.PI / 2, 0, 0] });
  part(g, torus(r * 0.45, r * 0.06, Math.PI * 2, 4, 18), GOLD_DEEP, { pos });
}

// --- Dawnbringer (longsword) -------------------------------------------------------------

const BLADE_LEN = 0.96;

const longsword: SkinModel['weapon'] = (g, m, s) => {
  // Sky-blue wrap bound in gold wire; a small sun for a pommel.
  part(g, cyl(0.026, 0.03, 0.21, 8), SKY, { pos: [0, 0.02, 0] });
  for (let k = 0; k < 5; k++) part(g, torus(0.03, 0.005, Math.PI * 2, 4, 10), lineless(GOLD), { pos: [0, -0.07 + k * 0.04, 0], rot: [Math.PI / 2, 0.3, 0] });
  const pm = group(g, [0, -0.115, 0]);
  sunburst(pm, 0.05, 8, [0, 0, 0], 0.02);
  // Guard: a gold sun flanked by two swept wings.
  part(g, rbox(0.1, 0.06, 0.07, 0.02), GOLD, { pos: [0, 0.14, 0] });
  for (const sz of [-1, 1]) part(g, octa(0.028), LIGHT, { pos: [0, 0.14, sz * 0.036], scale: [1, 1.3, 0.5] });
  for (const sx of [-1, 1]) {
    const w = group(g, [sx * 0.04, 0.15, 0], [0, sx < 0 ? Math.PI : 0, 0]);
    wing(w, 5, 0.2, 0.8, 0.6);
  }
  // Broad white-steel blade with a gold inlay down the ridge.
  const bw = (t: number) => (t < 0.8 ? 0.058 + Math.sin(t * Math.PI) * 0.006 : 0.06 * (1 - t) / 0.2);
  part(g, edgeBlade('dbBlade', rowsOf(BLADE_LEN, 24, bw), 0.02), { color: 0xf2f4fa, gloss: 0.6 }, { pos: [0, 0.17, 0] });
  part(g, edgeBlade('dbInlay', rowsOf(0.72, 12, (t) => 0.012 * (1 - t * 0.5)), 0.03), GOLD, { pos: [0, 0.18, 0] });
  for (const sx of [-1, 1]) part(g, rbox(0.006, BLADE_LEN * 0.62, 0.006, 0.002), m.edge, { pos: [sx * 0.05, 0.17 + BLADE_LEN * 0.42, 0] });
  // A halo turning around the blade.
  const halo = s.spin(g, 0, 0.42, 0, 2.2);
  part(halo, torus(0.1, 0.008, Math.PI * 2, 4, 30), lineless(HALO), { rot: [Math.PI / 2, 0, 0] });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    part(halo, octa(0.014), LIGHT, { pos: [Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1] });
  }
  return { base: [0, 0.22, 0], tip: [0, 0.17 + BLADE_LEN, 0] };
};

// --- Sunwall (tower shield) -----------------------------------------------------------------

const tower: SkinModel['defense'] = (s) => {
  const sh = group(s.forearmL, [0, -0.16, -0.14], [0, 0, 0.06]);
  const outline: [number, number][] = [[-0.28, 0.44], [-0.12, 0.5], [0, 0.56], [0.12, 0.5], [0.28, 0.44], [0.28, -0.38], [0, -0.56], [-0.28, -0.38]];
  part(sh, slab('dbTowerRim', outline, 0.05, 0.02), GOLD, { rot: [0, Math.PI, 0], scale: [1.06, 1.04, 1] });
  part(sh, slab('dbTower', outline, 0.06, 0.02), ENAMEL, { pos: [0, 0, -0.012], rot: [0, Math.PI, 0] });
  // Blue field behind a great sunburst, with rays running to the rim.
  part(sh, rbox(0.5, 0.2, 0.02, 0.01), SKY, { pos: [0, 0.04, -0.05] });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    part(sh, rbox(0.018, 0.34, 0.012, 0.004), GOLD_DEEP, { pos: [Math.sin(a) * 0.17, 0.04 + Math.cos(a) * 0.17, -0.058], rot: [0, 0, -a] });
  }
  sunburst(sh, 0.15, 12, [0, 0.04, -0.07], 0.02);
  // Gold wings on the top corners.
  for (const sx of [-1, 1]) {
    const w = group(sh, [sx * 0.24, 0.4, -0.04], [0, sx < 0 ? Math.PI : 0, 0.4]);
    wing(w, 4, 0.2, 0.8, 0.2);
  }
  shieldBack(sh, { wood: { color: 0xd8cfbe }, wrap: { color: 0x8a6a3a }, leather: { color: 0x2f5bb8 } } as Mats, 0.44, 0.8);
};

// --- Seraph Plate (plate armor) ---------------------------------------------------------------

function seraphPauldron(sa: Object3D, big: boolean): void {
  const k = big ? 1.25 : 1;
  part(sa, halfSphere(0.17 * k), ENAMEL, { scale: [1.15, 0.85, 1.05] });
  part(sa, halfSphere(0.155 * k), ENAMEL, { pos: [0, -0.075 * k, 0], scale: [1.2, 0.8, 1.12] });
  part(sa, torus(0.168 * k, 0.016, Math.PI * 2, 4, 20), GOLD, { rot: [Math.PI / 2, 0, 0], scale: [1.15, 1.05, 1] });
  part(sa, torus(0.155 * k, 0.014, Math.PI * 2, 4, 20), GOLD, { pos: [0, -0.075 * k, 0], rot: [Math.PI / 2, 0, 0], scale: [1.2, 1.12, 1] });
  part(sa, octa(0.03), LIGHT, { pos: [0.02, 0.15 * k, 0], scale: [1, 0.6, 1] });
}

const plateArmor: SkinModel['defense'] = (s) => {
  const k = s.big ? 1.28 : 1;
  part(s.chest, lathe('dbChest', [[0.001, 0.02], [0.2, 0.04], [0.25, 0.17], [0.266, 0.3], [0.212, 0.41], [0.001, 0.43]], 20), ENAMEL, { scale: [0.87 * k, 1, 1.13 * k] });
  part(s.chest, torus(0.205, 0.022, Math.PI * 2, 5, 22), GOLD, { pos: [0, 0.41, 0], rot: [Math.PI / 2, 0, 0], scale: [0.87 * k, 1.13 * k, 1] });
  // Sun on the breast.
  const sun = group(s.chest, [0.228 * k, 0.26, 0], [0, Math.PI / 2, 0]);
  sunburst(sun, 0.09, 12, [0, 0, 0], 0.02);
  for (const sz of [-1, 1]) part(s.chest, rbox(0.02, 0.28, 0.02, 0.008), GOLD, { pos: [0.2 * k, 0.2, sz * 0.13 * k], rot: [sz * 0.25, 0, 0] });
  seraphPauldron(s.shoulderL, s.big);
  seraphPauldron(s.shoulderR, s.big);
  // Folded wings on the back, swaying a little as the fighter moves.
  for (const sz of [-1, 1]) {
    const root = s.clothBone(s.chest, -0.2 * k, 0.36, sz * 0.09);
    root.userData.stiffness = 2.2;
    // Spread out to the side and swept back, so the wing faces the camera.
    const w = group(root, [0, 0, 0], [0, Math.atan2(-sz * 0.9, -0.45), 0]);
    wing(w, 7, 0.55, 1.25, 0.45);
  }
  // Plackart, faulds and a sky-blue tabard.
  part(s.hips, lathe('dbPlackart', [[0.001, 0.05], [0.19, 0.06], [0.225, 0.16], [0.215, 0.3], [0.001, 0.31]], 18), ENAMEL, { scale: [0.95 * k, 1, 1.0 * k] });
  part(s.hips, torus(0.2 * k, 0.03, Math.PI * 2, 5, 18), GOLD, { pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], scale: [0.9, 1.18, 1] });
  const tab = s.clothBone(s.hips, 0.2 * k, 0.04, 0);
  part(tab, rbox(0.03, 0.42, 0.18, 0.012), SKY, { pos: [0.01, -0.2, 0] });
  part(tab, rbox(0.034, 0.03, 0.19, 0.01), GOLD, { pos: [0.01, -0.4, 0] });
  part(tab, octa(0.03), LIGHT, { pos: [0.03, -0.12, 0], scale: [0.5, 1.2, 1] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    if (Math.cos(a) > 0.9) continue;
    part(s.hips, plate('dbTasset', [[-0.06, 0.06], [0.06, 0.06], [0.05, -0.12], [0, -0.15], [-0.05, -0.12]], 0.02), ENAMEL,
      { pos: [Math.cos(a) * 0.2 * k, -0.02, Math.sin(a) * 0.24 * k], rot: [Math.sin(a) * -0.25, -a + Math.PI / 2, Math.cos(a) * 0.25] });
  }
};

// --- Halo of Dawn (storm crown) -----------------------------------------------------------------

const crown: SkinModel['head'] = (s) => {
  const { head, headY: y, headR: r } = s;
  const c = group(head, [0, y + r * 0.6, 0], [0, 0, -0.1]);
  const rr = r * 0.86;
  part(c, lathe('dbDiadem', [[rr, 0], [rr + 0.02, 0], [rr + 0.025, 0.05], [rr + 0.005, 0.06], [rr, 0]], 24), GOLD);
  // Rays rising from the brow, longest in the middle.
  for (let k = -3; k <= 3; k++) {
    const a = k * 0.2;
    const len = 0.13 - Math.abs(k) * 0.025;
    part(c, plate('dbRay', [[-0.012, 0], [0.012, 0], [0, 1]], 0.01), GOLD, { pos: [Math.cos(a) * (rr + 0.02), 0.04, Math.sin(a) * (rr + 0.02)], rot: [0, -a + Math.PI / 2, 0], scale: [1, len, 1] });
  }
  part(c, octa(0.035), LIGHT, { pos: [rr + 0.03, 0.04, 0], scale: [0.6, 1.2, 1] });
  // The halo floats above and turns slowly.
  const halo = s.spin(head, -0.02, y + r * 1.5, 0, 0.9);
  part(halo, torus(r * 0.72, 0.016, Math.PI * 2, 5, 36), lineless(HALO), { rot: [Math.PI / 2, 0, 0] });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    part(halo, sphere(0.014, 6, 4), LIGHT, { pos: [Math.cos(a) * r * 0.72, 0, Math.sin(a) * r * 0.72] });
  }
};

// --- Seraph Steps (zephyr boots) -------------------------------------------------------------------

const boots: SkinModel['boots'] = (leg, _m, s) => {
  bootBase(leg, ENAMEL, ENAMEL, GOLD_DEEP, s);
  lp(leg, facetLathe('dbGreave', [[0.096, 0.0], [0.104, -0.08], [0.1, -0.26], [0.106, -0.33]], 14), ENAMEL, { pos: [0.004, -0.0, 0] });
  for (const y of [-0.02, -0.3]) lp(leg, torus(0.102, 0.014, Math.PI * 2, 4, 16), GOLD, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
  lp(leg, octa(0.028), LIGHT, { pos: [0.11, -0.1, 0], scale: [0.6, 1.2, 1] });
  lp(leg, rbox(0.12, 0.06, 0.17, 0.025), GOLD, { pos: [0.19, -0.44, 0] });
  // Wings at the ankles.
  for (const sz of [-1, 1]) {
    const w = group(leg.shin, [-0.05, -0.26, sz * 0.1], [sz * -0.4, Math.PI, -0.35]);
    wing(w, 5, 0.22, 0.85, 0.3);
  }
};

// --- Sunfall Relic (relic of judgment) ----------------------------------------------------------------

const relic: SkinModel['special'] = (s) => {
  const ob = s.orbiter();
  part(ob, plate('dbRelicRays', starPts(16, 0.08, 0.16), 0.018, 0.004), GOLD);
  part(ob, plate('dbRelicInner', starPts(8, 0.05, 0.1, 0), 0.026, 0.004), GOLD_DEEP);
  part(ob, sphere(0.05, 14, 10), LIGHT, {});
  part(ob, torus(0.19, 0.008, Math.PI * 2, 4, 30), lineless(HALO));
  part(ob, torus(0.22, 0.005, Math.PI * 2, 4, 30), lineless(glowSpec(0xffd76a, 1.2)), { rot: [Math.PI / 2, 0, 0] });
};

export const DAWNBRINGER: Record<string, SkinModel> = {
  dawn_longsword: { weapon: longsword },
  dawn_tower: { defense: tower },
  dawn_plate: { defense: plateArmor },
  dawn_crown: { head: crown },
  dawn_boots: { boots },
  dawn_relic: { special: relic },
};
