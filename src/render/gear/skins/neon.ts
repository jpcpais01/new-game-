import type { Object3D } from 'three';
import type { PartSpec } from '../../meshBuilder';
import { box, cone, cyl, group, lineless, octa, part, rbox, sphere, torus } from '../kit';
import { XBOW, bootBase, lp, type GearSockets, type SkinModel } from '../models';
import { edgeBlade, facetLathe, glowSpec, grad, mirror, plate, rowsOf } from './forge';

// -----------------------------------------------------------------------------
// Neon Circuit: black chrome running with light. Hard-surface panels with
// bevelled edges, cyan light strips and magenta accents, emitters, vents and
// circuit traces. Clean silhouettes, every glow a crisp line.
// -----------------------------------------------------------------------------

const CHROME: PartSpec = { color: 0x1c1e2a, gloss: 1 };
const CHROME_HI: PartSpec = { color: 0x40465e, gloss: 1 };
const PANEL: PartSpec = { color: 0x2a2e40, gloss: 0.6 };
const CYAN = glowSpec(0x2ef2ff, 2.4);
const MAGENTA = glowSpec(0xff3ad6, 2.2);
const CYAN_SOFT = glowSpec(0x2ef2ff, 1.2);

/** Glowing rectangular outline in the XY plane (w × h), facing ±Z. */
function frame(g: Object3D, w: number, h: number, t: number, spec: PartSpec, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]): void {
  const f = group(g, pos, rot);
  for (const sy of [-1, 1]) part(f, box(w, t, t), lineless(spec), { pos: [0, sy * h / 2, 0] });
  for (const sx of [-1, 1]) part(f, box(t, h, t), lineless(spec), { pos: [sx * w / 2, 0, 0] });
}

// --- Neon Edge (katana) ---------------------------------------------------------------------

const katana: SkinModel['weapon'] = (g, m) => {
  part(g, rbox(0.05, 0.28, 0.046, 0.014), CHROME, { pos: [0, 0, 0] });
  for (let k = 0; k < 3; k++) part(g, rbox(0.054, 0.012, 0.05, 0.004), lineless(k === 1 ? MAGENTA : CYAN), { pos: [0, -0.09 + k * 0.09, 0] });
  part(g, rbox(0.06, 0.04, 0.056, 0.014), CHROME_HI, { pos: [0, -0.155, 0] });
  // Square tsuba with a magenta frame and an emitter collar.
  part(g, rbox(0.15, 0.022, 0.1, 0.008), CHROME, { pos: [0, 0.15, 0] });
  frame(g, 0.13, 0.08, 0.008, MAGENTA, [0, 0.162, 0], [Math.PI / 2, 0, 0]);
  part(g, rbox(0.06, 0.06, 0.05, 0.012), CHROME_HI, { pos: [0, 0.19, 0] });
  part(g, rbox(0.064, 0.012, 0.054, 0.004), lineless(CYAN), { pos: [0, 0.2, 0] });
  // Black chrome blade: cyan cutting edge, magenta spine light, circuit traces.
  const rows = rowsOf(1.0, 22, (t) => (t < 0.86 ? 0.032 * (1 - 0.15 * t) : 0.032 * 0.85 * (1 - t) / 0.14));
  part(g, edgeBlade('nnKatana', rows, 0.016, 0.09), CHROME, { pos: [0, 0.21, 0] });
  const edge: [number, number, number][] = [];
  for (let i = 1; i <= 18; i++) { const t = i / 21; edge.push([0.028 * (1 - 0.15 * t) + 0.09 * t * t, 0.21 + t, 0]); }
  for (let i = 0; i < edge.length - 1; i++) {
    const [ax, ay] = edge[i], [bx, by] = edge[i + 1];
    part(g, box(0.006, Math.hypot(bx - ax, by - ay) + 0.002, 0.012), m.edge, { pos: [(ax + bx) / 2, (ay + by) / 2, 0], rot: [0, 0, -Math.atan2(bx - ax, by - ay)] });
  }
  for (let i = 0; i < 16; i++) {
    const t = (i + 0.5) / 18, y = 0.21 + t, x = -0.026 * (1 - 0.15 * t) + 0.09 * t * t;
    part(g, box(0.005, 1 / 18 + 0.002, 0.008), lineless(MAGENTA), { pos: [x + 0.004, y, 0], rot: [0, 0, -0.18 * t] });
  }
  for (const sz of [-1, 1]) {
    const z = sz * 0.0115;
    part(g, box(0.004, 0.12, 0.003), lineless(CYAN_SOFT), { pos: [0.0, 0.32, z] });
    part(g, box(0.02, 0.004, 0.003), lineless(CYAN_SOFT), { pos: [0.009, 0.38, z] });
    part(g, box(0.004, 0.08, 0.003), lineless(CYAN_SOFT), { pos: [0.019, 0.42, z] });
    part(g, sphere(0.006, 5, 4), lineless(CYAN), { pos: [0.019, 0.46, z] });
    part(g, sphere(0.006, 5, 4), lineless(CYAN), { pos: [0, 0.26, z] });
  }
  return { base: [0, 0.24, 0], tip: [0.09, 1.19, 0] };
};

// --- Arc Repeater (hand crossbow) ---------------------------------------------------------------

/**
 * Modelled in the hand's grip frame like the base crossbow (muzzle +X, top +Y,
 * prod tips at ±Z) with the same tagged bones, so the crossbow animator aims,
 * looses and re-cocks it (fighter/crossbow.ts).
 */
function repeater(g: Object3D, s: GearSockets): void {
  // Stock and pistol grip, with light lines down both flanks.
  part(g, rbox(0.44, 0.055, 0.05, 0.016), CHROME, { pos: [0.12, 0.055, 0] });
  part(g, rbox(0.05, 0.12, 0.045, 0.014), CHROME_HI, { pos: [-0.005, 0.0, 0], rot: [0, 0, 0.25] });
  for (const z of [-1, 1]) {
    part(g, rbox(0.3, 0.022, 0.004, 0.002), PANEL, { pos: [0.13, 0.05, z * 0.026] });
    part(g, box(0.26, 0.004, 0.004), lineless(CYAN), { pos: [0.13, 0.064, z * 0.028] });
  }
  // Rail, nose and a ring emitter at the muzzle.
  part(g, box(0.3, 0.012, 0.022), PANEL, { pos: [0.18, 0.084, 0] });
  part(g, rbox(0.06, 0.065, 0.065, 0.012), CHROME_HI, { pos: [0.33, 0.06, 0] });
  part(g, torus(0.026, 0.006, Math.PI * 2, 4, 16), lineless(CYAN), { pos: [0.362, 0.06, 0], rot: [0, Math.PI / 2, 0] });
  // Drum magazine under the rail and a holo sight on top.
  part(g, cyl(0.045, 0.045, 0.05, 12), CHROME_HI, { pos: [0.17, 0.0, 0], rot: [Math.PI / 2, 0, 0] });
  for (const z of [-1, 1]) part(g, torus(0.034, 0.005, Math.PI * 2, 4, 16), lineless(MAGENTA), { pos: [0.17, 0.0, z * 0.026] });
  part(g, rbox(0.06, 0.028, 0.02, 0.006), CHROME_HI, { pos: [0.04, 0.11, 0] });
  part(g, box(0.004, 0.02, 0.014), lineless(CYAN), { pos: [0.072, 0.118, 0] });
  // Angular prod lying flat across the nose, glowing at the tips.
  const limb = plate('nnProd', [[0.3, 0], [0.345, 0.02], [0.31, 0.15], [XBOW.tipX + 0.01, XBOW.tipZ + 0.01], [XBOW.tipX - 0.02, XBOW.tipZ], [0.28, 0.14], [0.27, 0]], 0.022, 0.004);
  part(g, limb, CHROME_HI, { pos: [0, XBOW.stringY + 0.011, 0], rot: [Math.PI / 2, 0, 0] });
  part(g, mirror(limb, 'y'), CHROME_HI, { pos: [0, XBOW.stringY + 0.011, 0], rot: [Math.PI / 2, 0, 0] });
  for (const z of [-1, 1]) part(g, rbox(0.03, 0.03, 0.03, 0.008), lineless(MAGENTA), { pos: [XBOW.tipX, XBOW.stringY, z * XBOW.tipZ] });
  // Laser string halves from each tip to the latch (driven bones).
  for (const z of [-1, 1]) {
    const half = s.bone(g, XBOW.tipX, XBOW.stringY, z * XBOW.tipZ);
    part(half, box(0.005, 0.005, XBOW.tipZ), lineless(CYAN), { pos: [0, 0, -z * XBOW.tipZ / 2] });
    s.tag(z > 0 ? 'xbowStringR' : 'xbowStringL', half);
  }
  // A bolt of light: nock at the bone, along +X.
  const bolt = s.bone(g, XBOW.cockX, XBOW.stringY + 0.012, 0);
  const L = XBOW.boltLen;
  part(bolt, box(L, 0.012, 0.012), lineless(MAGENTA), { pos: [L / 2, 0, 0] });
  part(bolt, octa(0.022), CYAN, { pos: [L + 0.01, 0, 0], scale: [1.6, 0.8, 0.8] });
  s.tag('xbowBolt', bolt);
}

const crossbow: SkinModel['offhand'] = (s) => {
  const xb = s.bone(s.offGrip, 0, 0, 0);
  repeater(xb, s);
  s.tag('xbow', xb);
};

// --- Hyperdisc (wind chakram) -------------------------------------------------------------------

function disc(g: Object3D, s: GearSockets): void {
  const c = group(g, [0, 0.18, 0], [0, Math.PI / 2, 0]);
  part(c, torus(0.2, 0.026, Math.PI * 2, 6, 36), CHROME, {});
  part(c, torus(0.17, 0.008, Math.PI * 2, 4, 36), lineless(MAGENTA), { pos: [0, 0, 0.012] });
  part(c, torus(0.17, 0.008, Math.PI * 2, 4, 36), lineless(MAGENTA), { pos: [0, 0, -0.012] });
  // Four blades on the rim.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    part(c, plate('nnDiscBlade', [[0, 0], [0.11, 0.02], [0.02, 0.05]], 0.012, 0.003), CHROME_HI, { pos: [Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0], rot: [0, 0, a + Math.PI / 2] });
    part(c, box(0.08, 0.004, 0.014), lineless(CYAN), { pos: [Math.cos(a + 0.25) * 0.215, Math.sin(a + 0.25) * 0.215, 0], rot: [0, 0, a + Math.PI / 2 + 0.25] });
  }
  // A hub that keeps spinning.
  const hub = s.spin(c, 0, 0, 0, 6);
  const h = group(hub, [0, 0, 0], [Math.PI / 2, 0, 0]);
  part(h, cyl(0.07, 0.07, 0.03, 12), CHROME_HI, {});
  part(h, cyl(0.03, 0.03, 0.036, 12), CYAN, {});
  for (let k = 0; k < 3; k++) part(h, rbox(0.12, 0.02, 0.012, 0.004), PANEL, { pos: [0, 0, 0], rot: [0, (k / 3) * Math.PI, 0], scale: [1.4, 1, 1] });
}

const chakram: SkinModel['offhand'] = (s) => {
  disc(s.offGrip, s);
};

// --- Cyber Visor (iron helm) ------------------------------------------------------------------------

const visor: SkinModel['head'] = (s) => {
  const { head, headY: y, headR: r } = s;
  part(head, sphere(r * 1.15, 22, 16), CHROME, { pos: [-0.01, y + 0.03, 0], scale: [1.05, 1.04, 0.99] });
  part(head, facetLathe('nnJaw', [[r * 1.12, -r * 0.2], [r * 1.14, -r * 0.6], [r * 1.0, -r * 0.95]], 16), CHROME_HI, { pos: [-0.01, y, 0] });
  // Wraparound light visor.
  part(head, torus(r * 1.13, 0.034, Math.PI * 1.1, 4, 28), lineless(CYAN), { pos: [-0.01, y + 0.03, 0], rot: [Math.PI / 2, 0, -Math.PI * 0.55], scale: [1.04, 0.99, 1.2] });
  part(head, torus(r * 1.16, 0.01, Math.PI * 1.1, 4, 28), CHROME_HI, { pos: [-0.01, y + 0.075, 0], rot: [Math.PI / 2, 0, -Math.PI * 0.55], scale: [1.04, 0.99, 1] });
  // Ear units with magenta rings and a fin of light along the crown.
  for (const sz of [-1, 1]) {
    part(head, cyl(r * 0.36, r * 0.36, 0.05, 14), CHROME_HI, { pos: [-0.02, y, sz * r * 1.12], rot: [Math.PI / 2, 0, 0] });
    part(head, torus(r * 0.3, 0.009, Math.PI * 2, 4, 18), lineless(MAGENTA), { pos: [-0.02, y, sz * r * 1.15] });
    part(head, rbox(0.012, 0.16, 0.012, 0.004), CHROME_HI, { pos: [-0.04, y + 0.12, sz * r * 1.12], rot: [0, 0, -0.5] });
  }
  part(head, plate('nnFin', [[r * 0.6, 0], [-r * 0.9, 0], [-r * 1.1, r * 0.35], [r * 0.2, r * 0.18]], 0.024, 0.006), CHROME_HI, { pos: [0, y + r * 1.08, 0] });
  for (let k = 0; k < 4; k++) part(head, box(0.04, 0.012, 0.03), lineless(k % 2 ? MAGENTA : CYAN), { pos: [r * 0.35 - k * r * 0.33, y + r * 1.14 + k * 0.012, 0] });
};

// --- Hoverjets (leaping boots) -------------------------------------------------------------------------

const boots: SkinModel['boots'] = (leg, _m, s) => {
  bootBase(leg, CHROME, CHROME, PANEL, s);
  lp(leg, rbox(0.21, 0.2, 0.06, 0.02), PANEL, { pos: [0.02, -0.26, 0.07] });
  lp(leg, rbox(0.21, 0.2, 0.06, 0.02), PANEL, { pos: [0.02, -0.26, -0.07] });
  lp(leg, torus(0.1, 0.012, Math.PI * 2, 4, 16), lineless(MAGENTA), { pos: [0, -0.2, 0], rot: [Math.PI / 2, 0, 0] });
  lp(leg, rbox(0.3, 0.012, 0.18, 0.004), lineless(CYAN), { pos: [0.075, -0.505, 0] });
  lp(leg, rbox(0.012, 0.18, 0.012, 0.004), lineless(CYAN), { pos: [0.1, -0.29, 0] });
  // Twin thrusters at the heel, burning blue.
  for (const sz of [-1, 1]) {
    lp(leg, cyl(0.034, 0.042, 0.1, 10), CHROME_HI, { pos: [-0.1, -0.38, sz * 0.045], rot: [0, 0, 0.5] });
    lp(leg, cone(0.03, 0.14, 8), grad(0xe8feff, 0x2ef2ff, 0.07, -0.07, { glow: 2.2 }), { pos: [-0.14, -0.46, sz * 0.045], rot: [0, 0, 0.5 + Math.PI] });
  }
};

// --- Data Core (echo stone) ------------------------------------------------------------------------------

const core: SkinModel['special'] = (s) => {
  const ob = s.orbiter();
  const e = 0.1;
  // Chrome cube frame around a glowing core cube set on its corner.
  for (const [ax, ay, az] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const) {
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const pos: [number, number, number] = ax ? [0, a * e, b * e] : ay ? [a * e, 0, b * e] : [a * e, b * e, 0];
      part(ob, box(ax ? e * 2 + 0.016 : 0.016, ay ? e * 2 + 0.016 : 0.016, az ? e * 2 + 0.016 : 0.016), CHROME_HI, { pos });
    }
  }
  const inner = s.spin(ob, 0, 0, 0, -2);
  part(inner, box(0.08, 0.08, 0.08), CYAN, { rot: [0.62, 0, 0.78] });
  part(ob, torus(0.19, 0.006, Math.PI * 2, 4, 32), lineless(MAGENTA), { rot: [1.2, 0.3, 0] });
  for (const c of [-1, 1]) part(ob, sphere(0.014, 6, 4), lineless(MAGENTA), { pos: [c * e, c * e, c * e] });
};

export const NEON: Record<string, SkinModel> = {
  neon_katana: { weapon: katana },
  neon_crossbow: { offhand: crossbow },
  neon_chakram: { offhand: chakram },
  neon_helm: { head: visor, hides: ['hair', 'ears'] },
  neon_boots: { boots },
  neon_core: { special: core },
};
