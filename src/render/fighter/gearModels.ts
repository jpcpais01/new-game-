import type { GearId } from '../../sim/types';
import { blade, cone, cyl, heater, heaterInner, octa, rbox, sphere, star, torus, lathe, box, halfSphere } from './geo';
import type { RigBuildApi, RigDecorator } from './look';
import type { RigPartSpec } from './rig';

/**
 * 3D models for gear, keyed by gear id. Each entry is a decorator that adds
 * baked parts to sockets (see look.ts). This is the extension point for gear
 * visuals: replace or add entries freely; ids without an entry simply show
 * nothing on the body. Weapons must call `api.setWeapon` (trail anchors) and
 * two-handed ones `api.setOffGrip` (left hand IK target).
 */
export const GEAR_MODELS: Partial<Record<GearId, RigDecorator>> = {};

const metal = (color: number, gloss = 0.85): RigPartSpec => ({ color, gloss });
const glowS = (color: number, glow = 2.2): RigPartSpec => ({ color, glow });
const edge = (color = 0xffffff, glow = 0.9): RigPartSpec => ({ color, glow, enchant: true });

// --- Main weapons --------------------------------------------------------------

GEAR_MODELS.longsword = (api) => {
  const w = api.sockets.mainHand, gold = metal(0xf3c24f, 1);
  api.part(w, sphere(0.045, 12, 10), gold, { pos: [0, -0.1, 0] });
  api.part(w, cyl(0.026, 0.028, 0.2, 10), 0x4a2f1f, { pos: [0, 0.0, 0] });
  api.part(w, rbox(0.32, 0.055, 0.065, 0.024), gold, { pos: [0, 0.12, 0] });
  api.part(w, octa(0.035), glowS(0x6fc8ff, 2), { pos: [0, 0.12, 0.036] });
  api.part(w, blade(0.95, 0.12, 0.024, 0, 0.16), metal(0xeef3fb, 1), { pos: [0, 0.15, 0] });
  api.part(w, box(0.028, 0.78, 0.032), edge(), { pos: [0, 0.54, 0] });
  api.setWeapon([0, 0.2, 0], [0, 1.1, 0]);
};

GEAR_MODELS.katana = (api) => {
  const w = api.sockets.mainHand;
  api.part(w, cyl(0.024, 0.024, 0.28, 8), 0x7a1824, { pos: [0, -0.02, 0] });
  for (let k = 0; k < 4; k++) api.part(w, torus(0.026, 0.007, Math.PI * 2, 4, 8), { color: 0x1a1420, outline: false }, { pos: [0, -0.11 + k * 0.06, 0], rot: [Math.PI / 2, 0, 0] });
  api.part(w, cyl(0.075, 0.075, 0.02, 16), metal(0x2a2430, 0.6), { pos: [0, 0.13, 0] });
  api.part(w, cyl(0.028, 0.028, 0.05, 8), metal(0xd9b04a, 1), { pos: [0, 0.16, 0] });
  api.part(w, blade(1.0, 0.065, 0.02, 0.09, 0.12), metal(0xf2f5fa, 1), { pos: [0, 0.17, 0] });
  api.part(w, box(0.015, 0.82, 0.024), edge(0xffe8e8, 0.8), { pos: [0.03, 0.59, 0], rot: [0, 0, -0.05] });
  // Saya on the left hip.
  api.part(api.sockets.belt, rbox(0.055, 0.8, 0.065, 0.024), metal(0x2a1a20, 0.5), { pos: [0.02, -0.12, -0.24], rot: [0, 0, 1.25] });
  api.setWeapon([0, 0.2, 0], [0.09, 1.15, 0]);
};

GEAR_MODELS.warhammer = (api) => {
  const w = api.sockets.mainHand, iron = metal(0x7d8594, 0.7), leather = 0x5a3a22;
  api.part(w, cyl(0.04, 0.046, 1.36, 8), 0x6b4a2e, { pos: [0, 0.4, 0] });
  for (let k = 0; k < 3; k++) api.part(w, cyl(0.05, 0.05, 0.06, 8), leather, { pos: [0, -0.12 + k * 0.1, 0] });
  api.part(w, rbox(0.32, 0.34, 0.52, 0.06), iron, { pos: [0, 1.06, 0] });
  api.part(w, rbox(0.36, 0.075, 0.56, 0.03), metal(0x4d5260, 0.6), { pos: [0, 0.93, 0] });
  api.part(w, rbox(0.36, 0.075, 0.56, 0.03), metal(0x4d5260, 0.6), { pos: [0, 1.19, 0] });
  api.part(w, rbox(0.325, 0.11, 0.19, 0.02), { color: 0xff8a2a, glow: 2.2, enchant: true }, { pos: [0, 1.06, 0] });
  api.part(w, cone(0.06, 0.18, 6), iron, { pos: [0, 1.32, 0] });
  api.setWeapon([0, 0.88, 0], [0, 1.24, 0]);
  api.setOffGrip([0, 0.26, 0]);
};

GEAR_MODELS.spear = (api) => {
  const w = api.sockets.mainHand;
  api.part(w, cyl(0.026, 0.03, 2.1, 8), 0x7a5634, { pos: [0, 0.3, 0] });
  api.part(w, cyl(0.04, 0.04, 0.08, 8), metal(0xc9d27a, 1), { pos: [0, 1.32, 0] });
  api.part(w, blade(0.42, 0.11, 0.025, 0, 0.45), metal(0xeef3fb, 1), { pos: [0, 1.34, 0] });
  api.part(w, box(0.022, 0.3, 0.03), edge(), { pos: [0, 1.5, 0] });
  api.part(w, cone(0.035, 0.1, 6), metal(0x6a6f7a), { pos: [0, -0.78, 0], rot: [Math.PI, 0, 0] });
  for (const z of [-1, 1]) api.part(w, rbox(0.03, 0.12, 0.04, 0.01), 0xd12020, { pos: [0, 1.26, z * 0.04], rot: [z * 0.4, 0, 0] });
  api.setWeapon([0, 1.0, 0], [0, 1.76, 0]);
  api.setOffGrip([0, 0.62, 0]);
};

const dagger = (api: RigBuildApi, at: import('three').Object3D) => {
  api.part(at, cyl(0.022, 0.022, 0.14, 8), 0x2a3a1a, { pos: [0, 0, 0] });
  api.part(at, rbox(0.16, 0.04, 0.05, 0.016), metal(0x8cff3a, 0.6), { pos: [0, 0.08, 0] });
  api.part(at, blade(0.38, 0.07, 0.02, 0.03, 0.3), metal(0xe8f0e0, 1), { pos: [0, 0.1, 0] });
  api.part(at, box(0.015, 0.26, 0.022), edge(0xb8ff9a, 1), { pos: [0, 0.24, 0] });
};
GEAR_MODELS.twin_daggers = (api) => {
  dagger(api, api.sockets.mainHand);
  dagger(api, api.sockets.offHand);
  api.setWeapon([0, 0.12, 0], [0, 0.46, 0]);
};

GEAR_MODELS.arcane_staff = (api) => {
  const w = api.sockets.mainHand, gold = metal(0xf0c060, 1);
  api.part(w, cyl(0.03, 0.04, 1.8, 8), 0x5b3a22, { pos: [0, 0.3, 0] });
  for (let k = 0; k < 3; k++) api.part(w, torus(0.038, 0.011, Math.PI * 2, 5, 10), gold, { pos: [0, 0.55 + k * 0.3, 0], rot: [Math.PI / 2, 0, 0] });
  api.part(w, torus(0.14, 0.028, Math.PI * 1.35, 8, 18), gold, { pos: [0, 1.25, 0], rot: [0, 0, -0.65 - Math.PI / 2] });
  api.part(w, octa(0.1), glowS(0x9ff8ff, 3.2), { pos: [0, 1.29, 0], scale: [0.8, 1.3, 0.8] });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    api.part(w, octa(0.028), glowS(0x6ff3ff, 2.4), { pos: [Math.cos(a) * 0.19, 1.29 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.19] });
  }
  api.setWeapon([0, 0.95, 0], [0, 1.29, 0]);
};

GEAR_MODELS.longbow = (api) => {
  const b = api.sockets.offHand;
  const wood = 0x8a5a2b;
  api.part(b, cyl(0.03, 0.03, 0.14, 8), 0x3a2618, {});
  for (const s of [-1, 1]) {
    const limb = api.group(b, [0, s * 0.07, 0], [0, 0, 0]);
    api.part(limb, lathe(`bowLimb`, [[0.026, 0], [0.022, 0.3], [0.012, 0.62], [0.001, 0.66]], 8), wood, { rot: [s < 0 ? Math.PI : 0, 0, s * -0.18], pos: [0, 0, 0] });
  }
  api.part(b, box(0.006, 1.34, 0.006), { color: 0xf3ead6, outline: false }, { pos: [-0.17, 0, 0] });
  api.setWeapon([0, 0, 0], [0, 0.4, 0]);
};

// --- Off hand and defense ---------------------------------------------------

GEAR_MODELS.tower_shield = (api) => {
  const sh = api.group(api.sockets.shieldArm, [0, 0, 0], [0, 0, 0]);
  api.part(sh, heater(1.25), metal(0xc4cee2, 0.9), {});
  api.part(sh, heaterInner(1.25), 0x2f5be0, { pos: [0, 0, -0.08] });
  api.part(sh, star(12, 0.08, 0.17, 0.02), metal(0xf3c24f, 1), { pos: [0, 0.03, -0.105], rot: [0, Math.PI, 0] });
  api.part(sh, sphere(0.055, 12, 10), glowS(0xffe08a, 1.6), { pos: [0, 0.03, -0.11], scale: [1, 1, 0.5] });
};

GEAR_MODELS.parrying_blade = (api) => {
  const w = api.sockets.offHand;
  api.part(w, cyl(0.022, 0.022, 0.16, 8), 0x4a1a1a, {});
  api.part(w, torus(0.07, 0.012, Math.PI * 1.2, 5, 12), metal(0xe0404a, 0.9), { pos: [0, 0.1, 0], rot: [0, Math.PI / 2, Math.PI * 0.4] });
  api.part(w, blade(0.6, 0.05, 0.016, 0, 0.2), metal(0xeef3fb, 1), { pos: [0, 0.1, 0] });
};

GEAR_MODELS.frost_orb = (api) => {
  const o = api.group(api.sockets.offHand, [0.06, 0.0, 0]);
  api.part(o, sphere(0.085, 14, 12), glowS(0x9fe8ff, 2.2), {});
  api.part(o, torus(0.12, 0.01, Math.PI * 2, 4, 16), glowS(0xd8f6ff, 1.6), { rot: [1.1, 0.3, 0] });
};

GEAR_MODELS.iron_gauntlet = (api) => {
  const iron = metal(0xa0a8b8, 0.9);
  api.part(api.sockets.forearmL, cyl(api.metrics.foreR * 1.35, api.metrics.foreR * 1.2, api.metrics.forearm * 0.55, 10), iron, { pos: [0, -api.metrics.forearm * 0.62, 0] });
  api.part(api.sockets.offHand, rbox(0.13, 0.13, 0.14, 0.04), iron, { pos: [0, 0.0, 0] });
  for (let k = 0; k < 3; k++) api.part(api.sockets.offHand, cone(0.022, 0.06, 5), metal(0xd8dee8), { pos: [0.07, -0.03 + k * 0.035, 0.0], rot: [0, 0, -Math.PI / 2] });
};

GEAR_MODELS.thornmail = (api) => {
  for (const sh of [api.sockets.shoulderL, api.sockets.shoulderR]) {
    api.part(sh, torus(0.15, 0.025, Math.PI * 2, 5, 14), 0x2f7a3a, { pos: [0, 0.0, 0], rot: [Math.PI / 2, 0, 0] });
    for (let k = 0; k < 4; k++) api.part(sh, cone(0.03, 0.15, 5), 0x58c46b, { pos: [(k - 1.5) * 0.07, 0.1, 0], rot: [(k % 2 ? 0.3 : -0.3), 0, (1.5 - k) * 0.4] });
  }
  for (const fa of [api.sockets.forearmL, api.sockets.forearmR]) for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    api.part(fa, cone(0.022, 0.1, 5), 0x58c46b, { pos: [Math.cos(a) * 0.08, -0.12, Math.sin(a) * 0.08], rot: [Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4] });
  }
};

GEAR_MODELS.plate_armor = (api) => {
  const steel = metal(0xb8c2d4, 0.9), gold = metal(0xd9b04a, 1);
  const m = api.metrics, ny = m.form.shape.neckLen;
  // Breastplate shell over the ribcage, gorget ring, layered pauldrons and a plated belt.
  api.part(api.sockets.chest, lathe('breastplate', [[0, -0.02], [0.86, 0], [0.98, ny * 0.3], [1.06, ny * 0.62], [1.0, ny * 0.84], [0.8, ny * 0.97], [0, ny]], 22), steel, { pos: [0.012, 0, 0], scale: [m.chestD * 1.08, 1, m.chestW * 1.06] });
  api.part(api.sockets.chest, torus(m.form.shape.neckR * 1.5, 0.03, Math.PI * 2, 6, 18), gold, { pos: [0.01, ny * 0.98, 0], rot: [Math.PI / 2, 0, 0] });
  for (const sh of [api.sockets.shoulderL, api.sockets.shoulderR]) {
    api.part(sh, halfSphere(m.armR * 1.75), steel, { pos: [0, 0.01, 0], scale: [1.1, 0.8, 1.05] });
    api.part(sh, halfSphere(m.armR * 1.6), steel, { pos: [0, -0.05, 0], scale: [1.15, 0.75, 1.12] });
  }
  api.part(api.sockets.belt, torus(1, 0.04, Math.PI * 2, 6, 24), steel, { rot: [Math.PI / 2, 0, 0], scale: [m.chestD * 0.95, (m.form.shape.hipW + m.thighR * 0.9) * 1.02, 1] });
};

// --- Head ---------------------------------------------------------------------

GEAR_MODELS.berserker_mask = (api) => {
  const r = api.metrics.headR, sk = api.sockets.skull;
  api.part(sk, rbox(0.05, 0.1, r * 1.7, 0.03), metal(0xb01818, 0.6), { pos: [r * 0.92, r * 0.12, 0] });
  for (const z of [-1, 1]) {
    api.part(sk, sphere(0.022, 8, 6), glowS(0xff3020, 3), { pos: [r * 0.95 + 0.03, r * 0.15, z * 0.07], scale: [0.5, 0.8, 1.2] });
    api.part(sk, cone(0.03, 0.14, 6), 0x2a0a0a, { pos: [r * 0.6, r * 0.95, z * 0.12], rot: [z * 0.5, 0, -0.4] });
  }
};

GEAR_MODELS.iron_helm = (api) => {
  const r = api.metrics.headR, sk = api.sockets.skull, steel = metal(0xa0a8b8, 0.9);
  api.hide('hair');
  api.part(sk, sphere(r * 1.12, 20, 14), steel, { pos: [-0.01, r * 0.18, 0], scale: [1.02, 0.92, 0.98] });
  api.part(sk, torus(r * 1.1, 0.02, Math.PI * 2, 6, 24), metal(0xd9b04a, 1), { pos: [-0.01, r * 0.12, 0], rot: [Math.PI / 2, 0, 0] });
  api.part(sk, rbox(0.03, r * 0.7, 0.035, 0.012), steel, { pos: [r * 1.08, -r * 0.05, 0] });
};

GEAR_MODELS.storm_crown = (api) => {
  const r = api.metrics.headR;
  for (let k = 0; k < 5; k++) api.part(api.sockets.skull, cone(0.03, 0.1, 4), metal(0x9fd8ff, 1), { pos: [Math.cos(k * 1.25) * r * 0.85, r * 0.92, Math.sin(k * 1.25) * r * 0.85] });
  api.part(api.sockets.skull, torus(r * 0.9, 0.018, Math.PI * 2, 5, 20), metal(0xd9e8ff, 1), { pos: [0, r * 0.82, 0], rot: [Math.PI / 2, 0, 0] });
  const ob = api.orbiter('storm_crown');
  api.part(ob, octa(0.09), glowS(0xbfe6ff, 2.6), { scale: [0.8, 1.3, 0.8] });
  api.part(ob, torus(0.13, 0.012, Math.PI * 2, 4, 16), glowS(0x9fd8ff, 1.8), { rot: [Math.PI / 2, 0, 0] });
};

GEAR_MODELS.chrono_circlet = (api) => {
  const r = api.metrics.headR;
  api.part(api.sockets.skull, torus(r * 1.0, 0.016, Math.PI * 2, 5, 22), metal(0xc9a24a, 1), { pos: [0, r * 0.45, 0], rot: [Math.PI / 2 - 0.12, 0, 0] });
  const ob = api.orbiter('chrono_circlet');
  api.part(ob, cone(0.07, 0.1, 8), glowS(0xe0c8ff, 1.8), { pos: [0, 0.05, 0], rot: [Math.PI, 0, 0] });
  api.part(ob, cone(0.07, 0.1, 8), glowS(0xc8a2ff, 1.8), { pos: [0, -0.05, 0] });
  api.part(ob, cyl(0.09, 0.09, 0.02, 10), metal(0xc9a24a), { pos: [0, 0.11, 0] });
  api.part(ob, cyl(0.09, 0.09, 0.02, 10), metal(0xc9a24a), { pos: [0, -0.11, 0] });
};

// --- Boots ------------------------------------------------------------------------

GEAR_MODELS.zephyr_boots = (api) => {
  for (const f of [api.sockets.footL, api.sockets.footR]) for (const s of [-1, 1]) {
    const wing = api.group(f, [-0.04, 0.04, s * 0.08], [s * -0.3, 0, 0.7]);
    for (let k = 0; k < 3; k++) api.part(wing, rbox(0.03, 0.14 - k * 0.03, 0.012, 0.006), glowS(0x5effc8, 1.6), { pos: [-k * 0.035, 0.05, 0], rot: [0, 0, 0.3 * k] });
  }
};

// --- Specials ---------------------------------------------------------------------

GEAR_MODELS.phoenix_feather = (api) => {
  const r = api.metrics.headR;
  const ph = api.bone(api.sockets.skull, [-r * 0.45, r * 0.8, r * 0.6]);
  api.tag('phoenix', ph);
  for (let k = 0; k < 3; k++) {
    api.part(ph, cone(0.05 - k * 0.01, 0.42 - k * 0.08, 6), glowS(k === 0 ? 0xff8a2e : 0xffc04a, 1.8 - k * 0.3), { pos: [-0.06 - k * 0.03, 0.18 - k * 0.02, k * 0.03], rot: [0.2 * k, 0, 0.7 + k * 0.25], scale: [1, 1, 0.4] });
  }
};

GEAR_MODELS.echo_stone = (api) => {
  const ob = api.orbiter('echo_stone');
  api.part(ob, sphere(0.08, 12, 10), glowS(0x6b8cff, 2.4), {});
  api.part(ob, torus(0.12, 0.012, Math.PI * 2, 4, 16), glowS(0xb0c4ff, 1.6), { rot: [1.1, 0.4, 0] });
  api.part(ob, torus(0.14, 0.01, Math.PI * 2, 4, 16), glowS(0x6b8cff, 1.2), { rot: [-0.6, 0.9, 0] });
};

GEAR_MODELS.vampiric_fang = (api) => {
  api.part(api.sockets.chest, cone(0.025, 0.1, 6), 0xf3ead6, { pos: [api.metrics.chestD * 0.95, api.metrics.form.shape.neckLen * 0.78, 0.05], rot: [0, 0, Math.PI] });
  api.part(api.sockets.chest, sphere(0.02, 8, 6), glowS(0xff2e55, 2.4), { pos: [api.metrics.chestD * 0.95, api.metrics.form.shape.neckLen * 0.88, 0.05] });
};

GEAR_MODELS.ember_core = (api) => {
  api.part(api.sockets.belt, octa(0.04), glowS(0xff6a1a, 2.2), { pos: [api.metrics.chestD * 0.9, -0.02, 0.1] });
};

GEAR_MODELS.frost_core = (api) => {
  for (let k = 0; k < 3; k++) api.part(api.sockets.mainHand, octa(0.035), glowS(0xbff4ff, 2), { pos: [(k - 1) * 0.04, 0.14, 0.04], scale: [0.6, 1.6, 0.6] });
};
