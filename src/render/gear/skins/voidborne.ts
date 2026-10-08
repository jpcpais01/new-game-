import type { Object3D } from 'three';
import type { PartSpec } from '../../meshBuilder';
import { cyl, group, lineless, octa, part, rbox, sphere, torus, type Mats } from '../kit';
import { bootBase, lp, type SkinModel } from '../models';
import { crystal, edgeBlade, facetLathe, glowSpec, grad, hoodShell, pair, plate, rowsOf, starry, tube } from './forge';

// -----------------------------------------------------------------------------
// Voidborne: forged where the stars went out. Black-violet glass with a
// mirror glint, starfield cloth, rifts of violet light and shards that float
// free of the pieces they broke from.
// -----------------------------------------------------------------------------

const GLASS: PartSpec = { color: 0x1d1631, gloss: 1 };
const GLASS_HI: PartSpec = { color: 0x3b2b60, gloss: 1 };
const RIFT = glowSpec(0xb46bff, 2.4);
const PINK = glowSpec(0xff4fd8, 2.2);
const RIFT_SOFT = glowSpec(0x9a4dff, 1.2);
/** Black glass shading to violet at its far end. */
const dusk = (from: number, to: number) => grad(0x16101f, 0x4a2a8a, from, to, { gloss: 1 });
const SKY = starry(0x251a44, 0xf4ecff, 0.09, 1.3);

/** Shards hovering in a loose ring that turns on its own. */
function shardRing(s: { spin(p: Object3D, x: number, y: number, z: number, speed?: number): Object3D }, parent: Object3D, pos: [number, number, number], r: number, n: number, speed: number, len = 0.08): void {
  const ring = s.spin(parent, ...pos, speed);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    part(ring, crystal(len * 0.22, len, 4), k % 2 ? GLASS_HI : dusk(0, len), { pos: [Math.cos(a) * r, Math.sin(a * 2) * 0.02, Math.sin(a) * r], rot: [Math.sin(a) * 1.2, a, -Math.cos(a) * 1.2] });
  }
}

// --- Eclipse (katana) ---------------------------------------------------------------------

const katana: SkinModel['weapon'] = (g, m) => {
  part(g, cyl(0.026, 0.026, 0.28, 8), { color: 0x1a1428 });
  for (let k = 0; k < 5; k++) part(g, octa(0.03), lineless(RIFT_SOFT), { pos: [0, -0.11 + k * 0.055, 0], scale: [0.45, 0.7, 1.05] });
  part(g, facetLathe('vbKashira', [[0.001, -0.19], [0.022, -0.17], [0.03, -0.14]], 6), GLASS_HI);
  // Eclipse tsuba: a black disc with a burning corona.
  part(g, cyl(0.082, 0.082, 0.022, 24), GLASS, { pos: [0, 0.15, 0] });
  part(g, torus(0.086, 0.01, Math.PI * 2, 4, 30), lineless(PINK), { pos: [0, 0.15, 0], rot: [Math.PI / 2, 0, 0] });
  part(g, torus(0.07, 0.006, Math.PI * 1.3, 4, 20), lineless(RIFT), { pos: [0, 0.162, 0], rot: [Math.PI / 2, 0, 0.6] });
  part(g, cyl(0.03, 0.028, 0.05, 8), GLASS_HI, { pos: [0, 0.18, 0] });
  // Black glass blade, its edge burning violet.
  const rows = rowsOf(1.0, 26, (t) => (t < 0.88 ? 0.03 * (1 - 0.2 * t) : 0.03 * 0.82 * (1 - t) / 0.12), 0.0);
  part(g, edgeBlade('vbKatana', rows, 0.017, 0.09), dusk(0, 1.0), { pos: [0, 0.195, 0] });
  const edge: [number, number, number][] = [];
  for (let i = 1; i <= 22; i++) { const t = i / 24; edge.push([0.026 * (1 - 0.2 * t) + 0.09 * t * t, 0.195 + t, 0]); }
  part(g, tube('vbEdge', edge, 0.005, 0.0035, 40, 4), m.edge);
  part(g, edgeBlade('vbKatanaCore', rowsOf(0.8, 12, (t) => 0.008 * (1 - t * 0.5)), 0.03, 0.09 * 0.64), RIFT, { pos: [-0.004, 0.2, 0] });
  // Shards drifting off the spine.
  [[0.25, 0.07], [0.42, 0.05], [0.6, 0.06]].forEach(([y, len], i) => {
    const t = y;
    part(g, crystal(0.012, len, 4), i % 2 ? GLASS_HI : dusk(0, len), { pos: [-0.06 + 0.09 * t * t, 0.195 + y, 0], rot: [0, 0, 0.9 + i * 0.2] });
  });
  part(g, octa(0.012), PINK, { pos: [-0.075, 0.5, 0] });
  return { base: [0, 0.22, 0], tip: [0.09, 1.17, 0] };
};

// --- Void Fangs (twin daggers) ------------------------------------------------------------

function fang(g: Object3D, m: Mats): void {
  part(g, cyl(0.024, 0.026, 0.15, 8), { color: 0x1a1428 });
  part(g, sphere(0.034, 10, 8), RIFT, { pos: [0, -0.09, 0] });
  part(g, torus(0.036, 0.007, Math.PI * 2, 4, 12), GLASS_HI, { pos: [0, -0.09, 0], rot: [0, 0, Math.PI / 2] });
  // Guard: two hooked prongs.
  part(g, tube('vbFangGuard', [[-0.1, 0.12, 0], [-0.06, 0.08, 0], [0, 0.085, 0], [0.06, 0.08, 0], [0.11, 0.13, 0]], 0.016, 0.016, 12, 5), GLASS_HI);
  // Curved fang blade in three pieces with violet light in the breaks.
  const segs: [number, number][] = [[0.1, 0.2], [0.21, 0.33], [0.34, 0.5]];
  segs.forEach(([a, b], i) => {
    const rows = rowsOf(b - a, 8, (t) => {
      const T = (a + t * (b - a) - 0.1) / 0.4;
      return 0.045 * (1 - T * 0.85) * (i === 2 && t > 0.6 ? (1 - t) / 0.4 : 1) + 0.002;
    });
    part(g, edgeBlade(`vbFang${i}`, rows, 0.016, 0.03 * (i + 1)), dusk(-0.1, 0.4), { pos: [0.012 * i * i, a, 0] });
  });
  for (const y of [0.205, 0.335]) part(g, rbox(0.07, 0.008, 0.02, 0.003), lineless(PINK), { pos: [0.004 + (y - 0.2) * 0.1, y, 0] });
  part(g, rbox(0.006, 0.32, 0.03, 0.002), m.edge, { pos: [0.016, 0.3, 0], rot: [0, 0, -0.06] });
}

const daggers: SkinModel['weapon'] = (g, m, s) => {
  fang(g, m);
  fang(s.offGrip, m);
  return { base: [0, 0.13, 0], tip: [0.05, 0.52, 0] };
};

// --- Riftcloak (phase cloak) -----------------------------------------------------------------

const cloak: SkinModel['defense'] = (s) => {
  const k = s.big ? 1.2 : 1;
  const cape = s.clothBone(s.chest, -0.21, 0.42, 0);
  part(cape, rbox(0.04, 0.98, 0.62 * k, 0.018), SKY, { pos: [-0.02, -0.49, 0] });
  part(cape, rbox(0.034, 0.94, 0.56 * k, 0.018), { color: 0x2a1650 }, { pos: [0.008, -0.47, 0] });
  // Torn hem: tatters that fade into violet light.
  for (let i = 0; i < 7; i++) {
    const z = (-0.27 + i * 0.09) * k;
    const len = 0.16 + ((i * 7) % 3) * 0.06;
    part(cape, plate('vbTatter', [[-0.045, 0], [0.045, 0], [0, -1]], 0.03, 0.004), grad(0x2a1650, 0xb46bff, -len * 0.2, -len, { glow: 1.4 }),
      { pos: [-0.02, -0.98, z], rot: [0, Math.PI / 2, 0], scale: [1, len, 1] });
  }
  part(cape, rbox(0.044, 0.025, 0.64 * k, 0.01), RIFT, { pos: [-0.02, -0.975, 0] });
  // High shard collar and a void clasp.
  for (let i = 0; i < 7; i++) {
    const a = -1.4 + i * (2.8 / 6);
    part(s.chest, crystal(0.03, 0.12 + Math.abs(Math.cos(a)) * 0.05, 4), GLASS, {
      pos: [-0.04 - Math.cos(a) * 0.14 * k, 0.43, Math.sin(a) * 0.19 * k], rot: [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5],
    });
  }
  part(s.chest, torus(0.17 * k, 0.045, Math.PI * 2, 6, 18), SKY, { pos: [-0.03, 0.44, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1.15, 1] });
  part(s.chest, cyl(0.05, 0.05, 0.03, 12), GLASS_HI, { pos: [0.16 * k, 0.43, 0], rot: [0, 0, Math.PI / 2] });
  part(s.chest, sphere(0.032, 10, 8), PINK, { pos: [0.178 * k, 0.43, 0] });
  shardRing(s, s.chest, [-0.1, 0.62, 0], 0.32 * k, 5, 0.8, 0.07);
};

// --- Voidgaze Hood (executioner hood) ---------------------------------------------------------

const HOOD_GAP = 0.95;
const HOOD_THETA = Math.PI * 0.74;

/** Points along the hood's opening, hem to crown to hem, for the glowing trim. */
function hoodEdge(r: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const side = (sz: number, from: number, to: number) => {
    for (let k = 0; k <= 6; k++) {
      const v = from + (to - from) * (k / 6);
      const th = v * HOOD_THETA;
      const g = HOOD_GAP * Math.min(1, th / (HOOD_THETA * 0.45));
      pts.push([Math.cos(g) * Math.sin(th) * r, Math.cos(th) * r, sz * Math.sin(g) * Math.sin(th) * r]);
    }
  };
  side(-1, 1, 0.06);
  pts.pop();
  side(1, 0.06, 1);
  return pts;
}

const hood: SkinModel['head'] = (s) => {
  const { head, headY: y, headR: r } = s;
  const R = r * 1.22;
  // An open hood: the cut is pointed at the crown and frames the face.
  part(head, hoodShell('vb', R, HOOD_GAP, HOOD_THETA), SKY, { pos: [-0.03, y + 0.03, 0], scale: [1, 1.1, 1.04] });
  part(head, tube('vbHoodTrim', hoodEdge(R * 1.005), 0.007, 0.007, 30, 5), lineless(RIFT), { pos: [-0.03, y + 0.03, 0], scale: [1, 1.1, 1.04] });
  part(head, facetLathe('vbHoodPeak', [[r * 0.5, 0], [r * 0.3, r * 0.5], [0.001, r * 0.9]], 8), SKY, { pos: [-r * 0.35, y + r * 1.0, 0], rot: [0, 0, 0.9] });
  const tail = s.clothBone(head, -r * 0.95, y + r * 0.2, 0);
  part(tail, facetLathe('vbHoodTail', [[r * 0.6, 0], [r * 0.3, -r * 1.0], [0.001, -r * 1.8]], 8), SKY, { pos: [-r * 0.2, -r * 0.1, 0], rot: [0, 0, -0.5] });
  part(s.chest, facetLathe('vbMantle', [[0.12, 0.0], [0.25, 0.05], [0.29, 0.15], [0.22, 0.2]], 12), SKY, { pos: [-0.02, 0.37, 0], scale: [0.95, 1, 1.1] });
  // A rift gem on the brow, framed by the hood's edge.
  part(head, octa(0.03), PINK, { pos: [r * 1.0, y + r * 0.62, 0], scale: [0.5, 1.2, 0.8] });
  // A crown of shards hovering above.
  const crown = s.spin(head, -0.02, y + r * 1.45, 0, 0.7);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    part(crown, crystal(0.022, 0.12 + (k % 2) * 0.05, 4), k % 2 ? dusk(0, 0.17) : GLASS_HI, { pos: [Math.cos(a) * r * 0.75, 0, Math.sin(a) * r * 0.75], rot: [Math.sin(a) * -0.4, 0, Math.cos(a) * 0.4] });
  }
  part(crown, torus(r * 0.75, 0.006, Math.PI * 2, 4, 30), lineless(RIFT_SOFT), { rot: [Math.PI / 2, 0, 0] });
};

// --- Riftwalkers (shadow treads) ----------------------------------------------------------------

const treads: SkinModel['boots'] = (leg, _m, s) => {
  bootBase(leg, GLASS, GLASS, { color: 0x0a0812 }, s);
  lp(leg, facetLathe('vbGreave', [[0.094, -0.33], [0.106, -0.24], [0.1, -0.06], [0.11, 0.03]], 7), GLASS, {});
  lp(leg, crystal(0.03, 0.16, 4), GLASS_HI, { pos: [0.07, 0.0, 0], rot: [0, 0, -0.5] });
  // Rift seams and a glowing toe.
  pair(leg.shin, tube('vbSeam', [[0.06, -0.02, 0.08], [0.09, -0.14, 0.07], [0.07, -0.3, 0.08]], 0.006, 0.004, 8, 4), lineless(RIFT));
  lp(leg, rbox(0.06, 0.02, 0.15, 0.008), lineless(PINK), { pos: [0.2, -0.47, 0] });
  for (let k = 0; k < 2; k++) lp(leg, crystal(0.022, 0.1, 4), GLASS_HI, { pos: [-0.1, -0.08 - k * 0.12, 0], rot: [0, 0, 2.0] });
  shardRing(s, leg.shin, [0, -0.3, 0], 0.17, 4, 1.4, 0.06);
};

// --- Abyssal Edge (phantom blade) ---------------------------------------------------------------

const blade: SkinModel['special'] = (s) => {
  const ob = s.orbiter();
  const sw = group(ob, [0, -0.32, 0], [0, 0, 0], 0.62);
  part(sw, edgeBlade('vbAbyss', rowsOf(0.95, 14, (t) => (t < 0.75 ? 0.07 : 0.07 * (1 - t) / 0.25)), 0.022), dusk(0, 0.95), { pos: [0, 0.17, 0] });
  part(sw, edgeBlade('vbAbyssCore', rowsOf(0.7, 8, () => 0.012), 0.03), PINK, { pos: [0, 0.2, 0] });
  part(sw, tube('vbAbyssGuard', [[-0.2, 0.22, 0], [-0.12, 0.14, 0], [0, 0.15, 0], [0.12, 0.14, 0], [0.2, 0.22, 0]], 0.022, 0.022, 12, 5), GLASS_HI);
  part(sw, cyl(0.028, 0.028, 0.2, 6), { color: 0x1a1428 }, { pos: [0, 0.03, 0] });
  part(sw, octa(0.04), RIFT, { pos: [0, -0.1, 0] });
  for (const sx of [-1, 1]) part(sw, rbox(0.006, 0.66, 0.026, 0.002), RIFT, { pos: [sx * 0.064, 0.52, 0] });
  shardRing(s, ob, [0, 0, 0], 0.16, 3, -2.5, 0.07);
};

export const VOIDBORNE: Record<string, SkinModel> = {
  void_katana: { weapon: katana },
  void_daggers: { weapon: daggers },
  void_cloak: { defense: cloak },
  void_hood: { head: hood, hides: ['hair'] },
  void_treads: { boots: treads },
  void_blade: { special: blade },
};
