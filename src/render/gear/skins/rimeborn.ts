import type { Object3D } from 'three';
import type { PartSpec } from '../../meshBuilder';
import { box, cone, cyl, group, lineless, octa, part, rbox, sphere, torus, type Mats } from '../kit';
import { bootBase, lp, shieldBack, type SkinModel } from '../models';
import { crystal, edgeBlade, facetLathe, glowSpec, grad, type BladeRow, plate, tube } from './forge';

// -----------------------------------------------------------------------------
// Rimeborn: carved from the heart of a glacier. Pale ice that deepens to
// glacier blue at its roots, frosted silver fittings, snowflake emblems and
// crystals that grow off every edge. The glow is cold and white-blue.
// -----------------------------------------------------------------------------

const ICE: PartSpec = { color: 0xc4f0ff, gloss: 1 };
const ICE_DEEP: PartSpec = { color: 0x5fb6e6, gloss: 1 };
const SILVER: PartSpec = { color: 0xe2eaf6, gloss: 0.95 };
const SNOW: PartSpec = { color: 0xf4f8ff };
const FROST = glowSpec(0xa8ecff, 2.2);
const FROST_SOFT = glowSpec(0x8fe6ff, 1.3);
/** Ice that deepens to glacier blue at its base. */
const glacier = (from: number, to: number, base: Partial<PartSpec> = {}) => grad(0x4aa8e0, 0xeefcff, from, to, { gloss: 1, ...base });

/** Six-armed snowflake in the XY plane (facing ±Z). */
function snowflake(g: Object3D, r: number, spec: PartSpec, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], depth = 0.012): void {
  const w = r * 0.16;
  const f = group(g, pos, rot);
  // Plain boxes: a snowflake is many small arms, and rounded corners on each
  // would cost more triangles than the whole blade.
  for (let k = 0; k < 3; k++) part(f, box(r * 2, w, depth), spec, { rot: [0, 0, (k * Math.PI) / 3] });
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const cx = Math.cos(a) * r * 0.58, cy = Math.sin(a) * r * 0.58;
    for (const sb of [-1, 1]) {
      const b = a + sb * 0.85;
      part(f, box(r * 0.4, w * 0.8, depth), spec, { pos: [cx + Math.cos(b) * r * 0.17, cy + Math.sin(b) * r * 0.17, 0], rot: [0, 0, b] });
    }
  }
  part(f, cyl(r * 0.24, r * 0.24, depth * 1.4, 6), spec, { rot: [Math.PI / 2, 0, 0] });
}

// --- Rimefang (katana) ----------------------------------------------------------------

const KATANA_LEN = 1.0;
function katanaRows(): BladeRow[] {
  const rows: BladeRow[] = [];
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const taper = 1 - 0.2 * t;
    const l = -0.026 * taper, r = 0.032 * taper;
    if (t <= 0.88) rows.push([t * KATANA_LEN, l, r, l * 0.35]);
    else {
      // Kissaki: the edge sweeps up to meet the spine in a curved point.
      const u = (t - 0.88) / 0.12;
      const rr = r + (l * 0.8 - r) * Math.pow(u, 0.8);
      const ll = l * (1 - u * 0.2);
      rows.push([t * KATANA_LEN, ll, Math.max(ll, rr), ll * 0.6 + rr * 0.4]);
    }
  }
  return rows;
}

const katana: SkinModel['weapon'] = (g, m) => {
  // Pale wrap with silver diamonds, silver end cap.
  part(g, cyl(0.026, 0.026, 0.28, 8), { color: 0xdcecff }, { pos: [0, 0, 0] });
  for (let k = 0; k < 5; k++) part(g, octa(0.03), lineless(SILVER), { pos: [0, -0.11 + k * 0.055, 0], scale: [0.5, 0.75, 1.05] });
  part(g, facetLathe('rbKashira', [[0.028, -0.14], [0.03, -0.16], [0.018, -0.18], [0.001, -0.185]], 6), SILVER);
  // Snowflake tsuba and silver collar.
  snowflake(g, 0.085, SILVER, [0, 0.15, 0], [Math.PI / 2, 0, 0], 0.016);
  part(g, cyl(0.03, 0.03, 0.022, 6), FROST, { pos: [0, 0.15, 0] });
  part(g, cyl(0.03, 0.028, 0.05, 8), SILVER, { pos: [0, 0.18, 0] });
  // Ice blade, deep blue at the guard, white at the point.
  part(g, edgeBlade('rbKatana', katanaRows(), 0.018, 0.09), glacier(0, KATANA_LEN * 0.9), { pos: [0, 0.195, 0] });
  // A cold temper line wavering along the edge.
  const hamon: [number, number, number][] = [];
  for (let i = 1; i <= 12; i++) {
    const t = i / 13, y = t * 0.86;
    const x = 0.018 * (1 - 0.2 * t) + Math.sin(i * 1.9) * 0.004 + 0.09 * (y / KATANA_LEN) ** 2;
    hamon.push([x, 0.195 + y, 0]);
  }
  part(g, tube('rbHamon', hamon, 0.004, 0.003, 36, 4), m.edge, { scale: [1, 1, 3.6] });
  // Frost crystals growing off the spine.
  const sp = [[0.12, 0.05, -0.5], [0.2, 0.07, -0.7], [0.27, 0.045, -0.4], [0.42, 0.04, -0.6], [0.55, 0.03, -0.45]] as const;
  sp.forEach(([y, len, a], i) => {
    const t = y / KATANA_LEN;
    part(g, crystal(0.012, len, 5), glacier(0, len), { pos: [-0.024 * (1 - 0.2 * t) + 0.09 * t * t, 0.195 + y, (i % 2 ? 1 : -1) * 0.004], rot: [0, 0, -a] });
  });
  return { base: [0, 0.22, 0], tip: [0.09, 1.17, 0] };
};

// --- Glacier Lance (spear) ---------------------------------------------------------------

const spear: SkinModel['weapon'] = (g, m) => {
  part(g, cyl(0.026, 0.03, 1.85, 8), { color: 0x9eb4cc, gloss: 0.6 }, { pos: [0, 0.38, 0] });
  // Ice wraps spiralling up the shaft.
  const helix: [number, number, number][] = [];
  for (let i = 0; i <= 16; i++) { const a = i * 0.9; helix.push([Math.cos(a) * 0.031, -0.1 + i * 0.03, Math.sin(a) * 0.031]); }
  part(g, tube('rbWrap', helix, 0.008, 0.008, 40, 4), lineless(ICE));
  part(g, cone(0.04, 0.14, 6), glacier(-0.07, 0.07), { pos: [0, -0.6, 0], rot: [Math.PI, 0, 0] });
  // Collar hung with icicles.
  part(g, facetLathe('rbCollar', [[0.03, 1.28], [0.055, 1.3], [0.06, 1.36], [0.04, 1.4]], 8), SILVER);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    part(g, cone(0.012, 0.08 + (k % 2) * 0.05, 5), glacier(0.06, -0.06), { pos: [Math.cos(a) * 0.05, 1.27 - 0.03 - (k % 2) * 0.025, Math.sin(a) * 0.05], rot: [Math.PI, 0, 0] });
  }
  // Crystal head with a crown of side shards.
  part(g, crystal(0.06, 0.52, 6, 0.12), glacier(0, 0.5), { pos: [0, 1.4, 0] });
  part(g, crystal(0.022, 0.42, 4, 0.1), FROST_SOFT, { pos: [0, 1.42, 0] });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    part(g, crystal(0.022, 0.2, 5), glacier(0, 0.2), { pos: [Math.cos(a) * 0.04, 1.4, Math.sin(a) * 0.04], rot: [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55] });
  }
  part(g, box(0.012, 0.3, 0.012), m.edge, { pos: [0, 1.62, 0] });
  return { base: [0, 1.05, 0], tip: [0, 1.9, 0] };
};

// --- Winter's Eye (frost orb) ----------------------------------------------------------------

const orb: SkinModel['offhand'] = (s) => {
  const o = s.bone(s.forearmL, 0, -0.42, -0.14);
  part(o, sphere(0.085, 14, 10), FROST);
  part(o, sphere(0.11, 12, 8), lineless(glowSpec(0x8fe6ff, 0.55)));
  // A crown of crystals cradling the orb.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const len = 0.13 + (k % 2) * 0.05;
    part(o, crystal(0.022, len, 5), glacier(0, len), { pos: [Math.cos(a) * 0.08, -0.06, Math.sin(a) * 0.08], rot: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7] });
  }
  part(o, crystal(0.03, 0.12, 6), ICE_DEEP, { pos: [0, -0.1, 0], rot: [Math.PI, 0, 0] });
  // A snowflake halo turning around it.
  const ring = s.spin(o, 0, 0, 0, 1.6);
  snowflake(ring, 0.06, SILVER, [0.17, 0.05, 0], [0, Math.PI / 2, 0], 0.01);
  part(ring, torus(0.17, 0.006, Math.PI * 2, 4, 28), lineless(FROST_SOFT), { rot: [Math.PI / 2, 0, 0] });
};

// --- Frozen Aegis (mirror aegis) ------------------------------------------------------------

const hex = (r: number): [number, number][] => Array.from({ length: 6 }, (_, k) => [Math.cos((k / 6) * Math.PI * 2 + Math.PI / 2) * r, Math.sin((k / 6) * Math.PI * 2 + Math.PI / 2) * r]);

const aegis: SkinModel['defense'] = (s) => {
  const sh = group(s.forearmL, [0, -0.16, -0.13], [0, 0, 0.08]);
  part(sh, plate('rbAegis', hex(0.33), 0.05, 0.012), ICE_DEEP);
  part(sh, plate('rbAegisFace', hex(0.27), 0.02, 0.006), { color: 0x2a74b0, gloss: 1 }, { pos: [0, 0, -0.03] });
  part(sh, plate('rbAegisMirror', hex(0.12), 0.012, 0.004), glowSpec(0xbff4ff, 1.4), { pos: [0, 0, -0.045] });
  snowflake(sh, 0.21, SILVER, [0, 0, -0.05], [0, 0, 0], 0.016);
  part(sh, octa(0.035), FROST, { pos: [0, 0, -0.062], scale: [1, 1, 0.5] });
  // Crystals bursting from the corners.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 2;
    const len = k % 2 ? 0.16 : 0.24;
    part(sh, crystal(0.035, len, 5), glacier(0, len), { pos: [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0], rot: [0, 0, a - Math.PI / 2] });
  }
  part(sh, box(0.03, 0.34, 0.01), lineless({ color: 0xffffff, glow: 1.8 }), { pos: [-0.07, 0.04, -0.06], rot: [0, 0, 0.7] });
  shieldBack(sh, { wood: { color: 0x9eb4cc }, wrap: { color: 0x5a6a80 }, leather: { color: 0x7a8aa6 } } as Mats, 0.36, 0.36);
};

// --- Icicle Crown (chrono circlet) -------------------------------------------------------------

const crown: SkinModel['head'] = (s) => {
  const { head, headY: y, headR: r } = s;
  const c = s.bone(head, 0, y + r * 0.58, 0);
  c.rotation.z = -0.1;
  const rr = r * 0.9;
  part(c, torus(rr, 0.016, Math.PI * 2, 4, 28), SILVER, { rot: [Math.PI / 2, 0, 0] });
  part(c, torus(rr, 0.006, Math.PI * 2, 4, 28), lineless(FROST_SOFT), { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0] });
  for (let k = 0; k < 13; k++) {
    const a = (k / 13) * Math.PI * 2;
    // Tallest at the brow, shrinking towards the back.
    const front = (Math.cos(a) + 1) / 2;
    const len = 0.07 + front * front * 0.16 + (k % 2) * 0.03;
    part(c, crystal(0.018, len, 5), glacier(0, len), { pos: [Math.cos(a) * rr, 0.005, Math.sin(a) * rr], rot: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25] });
  }
  part(c, octa(0.04), FROST, { pos: [rr + 0.012, 0.03, 0], scale: [0.6, 1.3, 1] });
  part(c, torus(0.045, 0.008, Math.PI * 2, 4, 12), SILVER, { pos: [rr + 0.005, 0.03, 0], rot: [0, Math.PI / 2, 0] });
};

// --- Snowstriders (leather boots) ----------------------------------------------------------------

const boots: SkinModel['boots'] = (leg, _m, s) => {
  const hide: PartSpec = { color: 0x9cb6d8 };
  bootBase(leg, hide, hide, { color: 0x3a4a64 }, s);
  // Fur cuff: a ring of soft white tufts.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    lp(leg, sphere(0.045, 7, 5), SNOW, { pos: [Math.cos(a) * 0.1, -0.17 + (k % 2) * 0.015, Math.sin(a) * 0.1], scale: [1, 0.8, 1] });
  }
  lp(leg, torus(0.1, 0.03, Math.PI * 2, 5, 14), SNOW, { pos: [0, -0.18, 0], rot: [Math.PI / 2, 0, 0] });
  // Silver laces, a frost-steel toe cap and ice crampons under the sole.
  for (let k = 0; k < 3; k++) lp(leg, rbox(0.012, 0.012, 0.09, 0.005), lineless(SILVER), { pos: [0.1, -0.26 - k * 0.05, 0], rot: [0.5 * (k % 2 ? 1 : -1), 0, 0] });
  lp(leg, rbox(0.1, 0.11, 0.172, 0.045), SILVER, { pos: [0.19, -0.43, 0] });
  lp(leg, rbox(0.012, 0.09, 0.15, 0.005), lineless(FROST_SOFT), { pos: [0.14, -0.43, 0] });
  for (const x of [-0.02, 0.07, 0.16]) for (const sz of [-1, 1]) lp(leg, cone(0.014, 0.05, 4), glacier(0.025, -0.025), { pos: [x, -0.53, sz * 0.05], rot: [Math.PI, 0, 0] });
  lp(leg, crystal(0.016, 0.1, 5), glacier(0, 0.1), { pos: [-0.08, -0.22, 0], rot: [0, 0, 2.1] });
};

// --- Heart of Winter (frost core) ------------------------------------------------------------------

const heart: SkinModel['special'] = (s) => {
  const ob = s.orbiter();
  part(ob, octa(0.06), FROST, { scale: [0.8, 1.3, 0.8] });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const len = k % 2 ? 0.1 : 0.16;
    part(ob, crystal(0.022, len, 5), glacier(0, len), { pos: [Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0], rot: [0, 0, a - Math.PI / 2] });
  }
  part(ob, crystal(0.02, 0.12, 5), ICE, { pos: [0, 0, 0.03], rot: [Math.PI / 2, 0, 0] });
  part(ob, crystal(0.02, 0.12, 5), ICE, { pos: [0, 0, -0.03], rot: [-Math.PI / 2, 0, 0] });
  part(ob, torus(0.2, 0.005, Math.PI * 2, 4, 30), lineless(FROST_SOFT), { rot: [1.3, 0.2, 0] });
};

export const RIMEBORN: Record<string, SkinModel> = {
  rimeborn_katana: { weapon: katana },
  rimeborn_spear: { weapon: spear },
  rimeborn_orb: { offhand: orb },
  rimeborn_aegis: { defense: aegis },
  rimeborn_circlet: { head: crown },
  rimeborn_boots: { boots },
  rimeborn_core: { special: heart },
};
