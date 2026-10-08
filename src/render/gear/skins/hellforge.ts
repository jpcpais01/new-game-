import type { Object3D } from 'three';
import type { PartSpec } from '../../meshBuilder';
import { box, cone, cyl, halfSphere, ico, lathe, lineless, octa, part, rbox, sphere, torus } from '../kit';
import { bootBase, lp, type SkinModel } from '../models';
import { crystal, edgeBlade, facetLathe, glowSpec, grad, grad3, mirror, pair, plate, rowsOf, tube } from './forge';

// -----------------------------------------------------------------------------
// Hellforge: black iron quenched in living magma. Warm near-black plates with
// a hard glint, molten seams and vents glowing through the cracks, swept
// horns and brass rivets. Everything hot runs white-yellow at the core and
// cools to deep red at the edges.
// -----------------------------------------------------------------------------

const IRON: PartSpec = { color: 0x2c2427, gloss: 0.85 };
const IRON_HI: PartSpec = { color: 0x4d3f40, gloss: 0.95 };
const BRASS: PartSpec = { color: 0xd08a42, gloss: 0.9 };
const LEATHER: PartSpec = { color: 0x3a1f18 };
const EMBER = glowSpec(0xff6a1a, 2.4);
const HOT = glowSpec(0xffc861, 2.8);
/** Molten gradient: white-hot at `from`, cooling to red at `to`. */
const magma = (from: number, to: number, axis: 'x' | 'y' | 'z' = 'y', glow = 2.6) =>
  grad3(0xfff0b8, 0xff7a1a, 0xb8200a, from, to, { glow }, axis);
/** Horn: black at the root, burnished brass at the tip. */
const HORN = (len: number) => grad(0x2c2427, 0xe0a050, len * 0.35, len, { gloss: 0.8 });

/**
 * Jagged crack of glowing magma between two points on a blade face. `face`
 * gives the face's height above the blade plane at x (sign picks the face).
 */
function crack(g: Object3D, key: string, a: [number, number], b: [number, number], face: (x: number) => number, r = 0.0045): void {
  const mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.25, my = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.25;
  const pts: [number, number, number][] = [[a[0], a[1], face(a[0])], [mx, my, face(mx)], [b[0], b[1], face(b[0])]];
  part(g, tube(`crack${key}`, pts, r, r * 0.4, 6, 4), lineless(EMBER));
}

// --- Hellforge Blade (longsword) -------------------------------------------------

const BLADE_LEN = 0.98;
/** Flame-waved edges that narrow to a long point. */
const bladeW = (t: number) => (0.06 + 0.011 * Math.sin(t * Math.PI * 6)) * (t < 0.82 ? 1 - t * 0.2 : (1 - t) / 0.18 * 0.836);

const longsword: SkinModel['weapon'] = (g, m) => {
  // Grip and spiked pommel with a molten band.
  part(g, cyl(0.026, 0.029, 0.22, 8), LEATHER, { pos: [0, 0.02, 0] });
  for (let k = 0; k < 4; k++) part(g, torus(0.03, 0.006, Math.PI * 2, 4, 10), lineless(IRON_HI), { pos: [0, -0.07 + k * 0.05, 0], rot: [Math.PI / 2, 0, 0] });
  part(g, facetLathe('hfPommel', [[0.001, -0.215], [0.022, -0.17], [0.046, -0.13], [0.034, -0.1], [0.024, -0.088]], 6), IRON);
  part(g, torus(0.042, 0.007, Math.PI * 2, 4, 12), lineless(EMBER), { pos: [0, -0.128, 0], rot: [Math.PI / 2, 0, 0] });
  // Guard: a block with a molten eye on each face and horned quillons sweeping up.
  part(g, rbox(0.12, 0.08, 0.08, 0.022), IRON, { pos: [0, 0.145, 0] });
  for (const sz of [-1, 1]) part(g, octa(0.03), HOT, { pos: [0, 0.145, sz * 0.04], scale: [1, 1.35, 0.5] });
  pair(g, tube('hfQuillon', [[0.04, 0.14, 0], [0.13, 0.115, 0], [0.205, 0.17, 0], [0.225, 0.28, 0]], 0.032, 0.006, 14, 7), HORN(0.28), {}, 'x');
  pair(g, sphere(0.011, 6, 4), EMBER, { pos: [0.225, 0.285, 0] }, 'x');
  // Faceted flame blade with a molten fuller and cracks breaking out to the edges.
  const rows = rowsOf(BLADE_LEN, 36, bladeW);
  part(g, edgeBlade('hfBlade', rows, 0.019), { color: 0x30272b, gloss: 0.45 }, { pos: [0, 0.18, 0] });
  part(g, edgeBlade('hfFuller', rowsOf(0.8, 16, (t) => 0.016 * (1 - t * 0.6)), 0.04), magma(0, 0.8), { pos: [0, 0.19, 0] });
  for (const sz of [-1, 1]) {
    // Blade face height at x for the row near the crack (ridge 0.019, edges ~0.055 out).
    const face = (x: number) => sz * (0.019 * (1 - Math.abs(x) / 0.058) + 0.0015);
    crack(g, `a${sz}`, [0.006, 0.42], [0.046, 0.5], face);
    crack(g, `b${sz}`, [-0.006, 0.6], [-0.044, 0.69], face);
    crack(g, `c${sz}`, [0.005, 0.78], [0.034, 0.86], face);
  }
  // Edge-lit cutting edges carry the enchant colour.
  for (const sx of [-1, 1]) {
    const pts: [number, number, number][] = [];
    for (let i = 10; i <= 33; i++) { const t = i / 36; pts.push([sx * (bladeW(t) - 0.004), 0.18 + t * BLADE_LEN, 0]); }
    part(g, tube(`hfEdge${sx}`, pts, 0.0045, 0.003, 30, 4), m.edge);
  }
  return { base: [0, 0.24, 0], tip: [0, 0.18 + BLADE_LEN, 0] };
};

// --- Magma Maul (warhammer) ---------------------------------------------------------

const warhammer: SkinModel['weapon'] = (g, m) => {
  part(g, cyl(0.038, 0.045, 1.36, 8), IRON, { pos: [0, 0.38, 0] });
  for (let k = 0; k < 3; k++) part(g, cyl(0.05, 0.05, 0.065, 8), LEATHER, { pos: [0, -0.12 + k * 0.1, 0] });
  // A molten vein spiralling up the haft.
  const helix: [number, number, number][] = [];
  for (let i = 0; i <= 24; i++) { const a = i * 0.62; helix.push([Math.cos(a) * 0.044, 0.2 + i * 0.026, Math.sin(a) * 0.044]); }
  part(g, tube('hfHelix', helix, 0.006, 0.006, 48, 4), lineless(magma(0.2, 0.84)));
  for (const y of [0.17, 0.86]) part(g, cyl(0.055, 0.055, 0.04, 8), BRASS, { pos: [0, y, 0] });
  part(g, cone(0.05, 0.16, 6), IRON, { pos: [0, -0.4, 0], rot: [Math.PI, 0, 0] });
  part(g, torus(0.05, 0.008, Math.PI * 2, 4, 12), lineless(EMBER), { pos: [0, -0.31, 0], rot: [Math.PI / 2, 0, 0] });
  // Head: a molten core held in black iron, glowing through its seams and vents.
  const head = 1.05;
  part(g, ico(0.15, 1), magma(-0.15, 0.15, 'z', 2.4), { pos: [0, head, 0] });
  for (const sx of [-1, 1]) {
    part(g, rbox(0.15, 0.36, 0.42, 0.04), IRON, { pos: [sx * 0.09, head, 0] });
    // Three cooling vents on the front and back faces.
    for (let k = -1; k <= 1; k++) part(g, rbox(0.012, 0.035, 0.26, 0.008), lineless(HOT), { pos: [sx * 0.166, head + k * 0.08, 0] });
    part(g, rbox(0.03, 0.4, 0.06, 0.012), IRON_HI, { pos: [sx * 0.155, head, 0.2] });
    part(g, rbox(0.03, 0.4, 0.06, 0.012), IRON_HI, { pos: [sx * 0.155, head, -0.2] });
  }
  part(g, rbox(0.36, 0.06, 0.46, 0.02), IRON_HI, { pos: [0, head + 0.2, 0] });
  part(g, rbox(0.36, 0.06, 0.46, 0.02), IRON_HI, { pos: [0, head - 0.2, 0] });
  // Hexagonal striking faces with molten centres.
  for (const sz of [-1, 1]) {
    part(g, cyl(0.17, 0.2, 0.1, 6), IRON, { pos: [0, head, sz * 0.26], rot: [Math.PI / 2, Math.PI / 6, 0] });
    part(g, cyl(0.1, 0.12, 0.03, 6), magma(-0.12, 0.12, 'x', 2.2), { pos: [0, head, sz * 0.315], rot: [Math.PI / 2, Math.PI / 6, 0] });
    part(g, torus(0.17, 0.016, Math.PI * 2, 4, 6), BRASS, { pos: [0, head, sz * 0.3], rot: [0, 0, Math.PI / 6] });
  }
  // Crown spike and swept horns.
  part(g, crystal(0.06, 0.26, 5, 0.1), IRON, { pos: [0, head + 0.22, 0] });
  pair(g, tube('hfMaulHorn', [[0, 0, 0], [0.02, 0.1, 0.06], [-0.06, 0.2, 0.12], [-0.16, 0.22, 0.12]], 0.045, 0.007, 14, 7), HORN(0.22), { pos: [0, head + 0.18, 0.16] });
  part(g, box(0.02, 0.2, 0.2), m.edge, { pos: [0, head, 0], scale: [0.5, 0.5, 0.5] });
  return { base: [0, 0.85, 0], tip: [0, 1.3, 0] };
};

// --- Furnace Fist (iron gauntlet) ----------------------------------------------------

const gauntlet: SkinModel['offhand'] = (s) => {
  const hand = s.offGrip;
  part(hand, rbox(0.16, 0.18, 0.16, 0.045), IRON, { pos: [-0.02, 0, 0] });
  // Knuckle plates with molten gaps and spikes.
  part(hand, rbox(0.03, 0.17, 0.15, 0.01), lineless(HOT), { pos: [0.065, 0, 0] });
  for (let k = 0; k < 4; k++) {
    part(hand, rbox(0.05, 0.04, 0.16, 0.012), IRON_HI, { pos: [0.085, -0.06 + k * 0.04, 0] });
    part(hand, cone(0.016, 0.07, 5), IRON_HI, { pos: [0.13, -0.06 + k * 0.04, 0], rot: [0, 0, -Math.PI / 2] });
  }
  // Bracer: flared, ribbed, venting heat on both sides.
  part(s.forearmL, facetLathe('hfBracer', [[0.075, 0.02], [0.098, -0.02], [0.092, -0.2], [0.106, -0.3], [0.08, -0.32]], 9), IRON, {});
  for (const y of [-0.04, -0.29]) part(s.forearmL, torus(0.1, 0.012, Math.PI * 2, 4, 14), BRASS, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
  for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) {
    part(s.forearmL, rbox(0.05, 0.016, 0.02, 0.006), lineless(HOT), { pos: [0, -0.1 - k * 0.055, sz * 0.096] });
  }
  part(s.forearmL, cone(0.035, 0.16, 5), IRON_HI, { pos: [-0.07, -0.03, 0], rot: [0, 0, 2.2] });
};

// --- Hellforge Plate -------------------------------------------------------------------

function hornedPauldron(sa: Object3D, side: -1 | 1, big: boolean): void {
  const k = big ? 1.25 : 1;
  for (let i = 0; i < 3; i++) {
    part(sa, halfSphere(0.175 * k - i * 0.012), IRON, { pos: [0, -i * 0.055 * k, 0], scale: [1.18, 0.82 - i * 0.05, 1.08] });
    part(sa, torus(0.17 * k - i * 0.012, 0.007, Math.PI * 2, 4, 18), lineless(EMBER), { pos: [0, -i * 0.055 * k - 0.004, 0], rot: [Math.PI / 2, 0, 0], scale: [1.18, 1.08, 1] });
  }
  const horn = tube('hfPauldronHorn', [[0, 0, 0], [0.01, 0.12, 0.05], [-0.04, 0.23, 0.13], [-0.13, 0.27, 0.16]], 0.05, 0.007, 14, 7);
  part(sa, side > 0 ? horn : mirror(horn), HORN(0.27), { pos: [0, 0.1 * k, side * 0.04] });
  for (const x of [-0.11, 0.11]) part(sa, sphere(0.016, 6, 4), BRASS, { pos: [x * k, 0.06, side * 0.1 * k] });
}

const plateArmor: SkinModel['defense'] = (s) => {
  const k = s.big ? 1.28 : 1;
  part(s.chest, facetLathe('hfChest', [[0.001, 0.02], [0.2, 0.04], [0.25, 0.17], [0.268, 0.3], [0.215, 0.41], [0.001, 0.43]], 12), IRON, { scale: [0.87 * k, 1, 1.13 * k] });
  // Furnace grate over the sternum.
  part(s.chest, rbox(0.04, 0.2, 0.17, 0.014), IRON_HI, { pos: [0.222 * k, 0.24, 0] });
  for (let i = 0; i < 4; i++) part(s.chest, rbox(0.03, 0.018, 0.12, 0.006), lineless(magma(-0.06, 0.06, 'z', 2.6)), { pos: [0.236 * k, 0.18 + i * 0.04, 0] });
  // Collar ring and molten seams down the sides.
  part(s.chest, torus(0.205, 0.024, Math.PI * 2, 5, 20), IRON_HI, { pos: [0, 0.41, 0], rot: [Math.PI / 2, 0, 0], scale: [0.87 * k, 1.13 * k, 1] });
  part(s.chest, torus(0.19, 0.008, Math.PI * 2, 4, 20), lineless(EMBER), { pos: [0, 0.385, 0], rot: [Math.PI / 2, 0, 0], scale: [0.87 * k, 1.13 * k, 1] });
  pair(s.chest, tube('hfSeam', [[0.12, 0.06, 0.26], [0.17, 0.2, 0.29], [0.13, 0.36, 0.24]], 0.007, 0.004, 10, 4), lineless(EMBER), { scale: [k, 1, k] });
  // Exhaust stacks on the back.
  for (const sz of [-1, 1]) {
    part(s.chest, cyl(0.035, 0.04, 0.2, 8), IRON_HI, { pos: [-0.2 * k, 0.36, sz * 0.09], rot: [0, 0, 0.2] });
    part(s.chest, torus(0.033, 0.008, Math.PI * 2, 4, 10), lineless(HOT), { pos: [-0.22 * k, 0.465, sz * 0.09], rot: [Math.PI / 2, 0.2, 0] });
  }
  hornedPauldron(s.shoulderL, -1, s.big);
  hornedPauldron(s.shoulderR, 1, s.big);
  // Plackart and faulds with glowing gaps between the lames.
  part(s.hips, facetLathe('hfPlackart', [[0.001, 0.05], [0.19, 0.06], [0.225, 0.16], [0.215, 0.3], [0.001, 0.31]], 12), IRON, { scale: [0.95 * k, 1, 1.0 * k] });
  part(s.hips, torus(0.2 * k, 0.04, Math.PI * 2, 5, 18), IRON_HI, { pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], scale: [0.9, 1.18, 1] });
  part(s.hips, torus(0.2 * k, 0.012, Math.PI * 2, 4, 18), lineless(EMBER), { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], scale: [0.93, 1.2, 1] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    part(s.hips, plate('hfTasset', [[-0.065, 0.06], [0.065, 0.06], [0.055, -0.12], [0, -0.16], [-0.055, -0.12]], 0.022), IRON,
      { pos: [Math.cos(a) * 0.2 * k, -0.02, Math.sin(a) * 0.24 * k], rot: [Math.sin(a) * -0.25, -a + Math.PI / 2, Math.cos(a) * 0.25] });
  }
};

// --- Hellforge Helm -----------------------------------------------------------------------

const helm: SkinModel['head'] = (s) => {
  const { head, headY: y, headR: r } = s;
  part(head, facetLathe('hfHelm', [[0.001, r * 1.3], [r * 0.62, r * 1.22], [r * 1.06, r * 0.86], [r * 1.2, r * 0.2], [r * 1.19, -r * 0.55], [r * 1.07, -r * 1.02], [r * 0.98, -r * 1.06]], 14),
    IRON, { pos: [-0.01, y, 0], scale: [1.02, 1, 0.97] });
  // Glowing T-visor under a heavy brow.
  part(head, rbox(0.03, 0.026, r * 1.25, 0.008), lineless(HOT), { pos: [r * 1.17, y + 0.025, 0] });
  part(head, rbox(0.03, r * 0.62, 0.028, 0.008), lineless(magma(r * 0.3, -r * 0.3, 'y', 2.6)), { pos: [r * 1.15, y - r * 0.28, 0] });
  part(head, plate('hfBrow', [[-r * 0.75, 0], [r * 0.75, 0], [r * 0.6, r * 0.2], [0, r * 0.3], [-r * 0.6, r * 0.2]], 0.05), IRON_HI,
    { pos: [r * 1.13, y + 0.05, 0], rot: [0, Math.PI / 2, 0] });
  part(head, rbox(r * 2.2, 0.035, 0.035, 0.012), IRON_HI, { pos: [0, y + r * 1.02, 0] });
  for (let k = 0; k < 4; k++) for (const sz of [-1, 1]) part(head, sphere(0.012, 5, 4), BRASS, { pos: [r * 1.05, y - r * 0.5 - k * 0.04, sz * r * 0.52] });
  // Ram horns from the temples.
  pair(head, tube('hfHelmHorn', [[0, 0, 0], [-0.03, 0.1, 0.11], [0.04, 0.22, 0.2], [0.16, 0.26, 0.18]], 0.055, 0.008, 16, 8), HORN(0.26),
    { pos: [-0.02, y + r * 0.55, r * 0.85] });
  // A crest of fire that sways with the head.
  const crest = s.clothBone(head, -0.02, y + r * 1.25, 0);
  for (let k = 0; k < 5; k++) {
    const h = 0.16 + Math.sin((k / 4) * Math.PI) * 0.12;
    part(crest, cone(0.04, h, 6), grad3(0xffc04a, 0xff5a12, 0x9a1406, -h / 2, h / 2, { glow: 2.1 }),
      { pos: [0.1 - k * 0.055, h / 2 - 0.02, 0], rot: [0, 0, 0.35 + k * 0.12], scale: [1, 1, 0.45] });
  }
};

// --- Cinder Greaves ----------------------------------------------------------------------------

const greaves: SkinModel['boots'] = (leg, _m, s) => {
  bootBase(leg, IRON, IRON, { color: 0x1a1416 }, s);
  lp(leg, facetLathe('hfGreave', [[0.092, 0.04], [0.104, -0.05], [0.098, -0.2], [0.106, -0.3], [0.096, -0.33]], 10), IRON, { pos: [0.006, -0.0, 0], scale: [1.05, 1, 1] });
  // Pointed poleyn over the knee with a molten slit, and a fan guarding its side.
  lp(leg, facetLathe('hfPoleyn', [[0.001, 0.1], [0.07, 0.07], [0.1, 0.0], [0.07, -0.07], [0.001, -0.1]], 6), IRON_HI, { pos: [0.06, 0.02, 0], scale: [0.7, 1, 1.05] });
  lp(leg, rbox(0.02, 0.1, 0.025, 0.006), lineless(HOT), { pos: [0.128, 0.02, 0] });
  for (const sz of [-1, 1]) lp(leg, plate('hfFan', [[0, 0.06], [0.07, 0.02], [0.05, -0.06], [0, -0.04]], 0.012), IRON, { pos: [0.04, 0.02, sz * 0.09], rot: [0, sz * 0.5, 0] });
  for (const y of [-0.08, -0.22]) lp(leg, torus(0.1, 0.007, Math.PI * 2, 4, 14), lineless(EMBER), { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
  // Shin ridge with a horned knee spike.
  lp(leg, rbox(0.03, 0.26, 0.04, 0.012), IRON_HI, { pos: [0.1, -0.16, 0] });
  lp(leg, cone(0.03, 0.13, 5), IRON_HI, { pos: [0.14, 0.07, 0], rot: [0, 0, -1.0] });
  // Sabaton plates, a toe spike and embers trailing off the heel.
  for (let k = 0; k < 3; k++) lp(leg, rbox(0.07, 0.042, 0.175, 0.015), IRON, { pos: [0.1 + k * 0.06, -0.39 + k * 0.012, 0] });
  lp(leg, cone(0.028, 0.1, 5), IRON_HI, { pos: [0.27, -0.44, 0], rot: [0, 0, -Math.PI / 2] });
  for (let k = 0; k < 3; k++) {
    lp(leg, cone(0.02, 0.1 - k * 0.02, 5), grad(0xffd070, 0xc0200a, -0.05, 0.05, { glow: 2.2 }), { pos: [-0.1, -0.4 + k * 0.04, (k - 1) * 0.04], rot: [0, 0, 1.9 + k * 0.1] });
  }
};

// --- Forgeheart (ember core) -------------------------------------------------------------------

const core: SkinModel['special'] = (s) => {
  const ob = s.orbiter();
  part(ob, ico(0.075, 1), magma(-0.075, 0.075, 'y', 2.8));
  // Iron cage of meridian ribs with brass poles.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const t = -Math.PI / 2 + (i / 8) * Math.PI;
      pts.push([Math.cos(t) * Math.cos(a) * 0.11, Math.sin(t) * 0.13, Math.cos(t) * Math.sin(a) * 0.11]);
    }
    part(ob, tube(`hfCage${k}`, pts, 0.008, 0.008, 16, 4), IRON_HI);
  }
  for (const sy of [-1, 1]) part(ob, cone(0.03, 0.08, 6), BRASS, { pos: [0, sy * 0.15, 0], rot: [sy < 0 ? Math.PI : 0, 0, 0] });
  part(ob, torus(0.12, 0.008, Math.PI * 2, 4, 18), lineless(EMBER), { rot: [Math.PI / 2, 0, 0] });
  part(ob, lathe('hfCoreHalo', [[0.15, -0.004], [0.17, 0], [0.15, 0.004]], 18), lineless(glowSpec(0xff5a10, 1.4)));
};

export const HELLFORGE: Record<string, SkinModel> = {
  hellforge_longsword: { weapon: longsword },
  hellforge_warhammer: { weapon: warhammer },
  hellforge_gauntlet: { offhand: gauntlet },
  hellforge_plate: { defense: plateArmor },
  hellforge_helm: { head: helm, hides: ['hair', 'ears'] },
  hellforge_greaves: { boots: greaves },
  hellforge_core: { special: core },
};
