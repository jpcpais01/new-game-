import type { Object3D } from 'three';
import { resolveArt, type ArtKey, type ResolvedArt } from '../../gear/art';
import { ITEM_ART } from '../../gear/itemArt';
import { gearOf } from '../../sim/gear';
import type { GearId } from '../../sim/types';
import type { RigBuildApi, RigDecorator } from '../fighter/look';
import {
  bent, blade, box, capsule, cone, cyl, group, halfSphere, ico, lathe, lineless, mats, octa, part, rbox, slab, sphere, torus,
  type Mats,
} from './kit';

// -----------------------------------------------------------------------------
// 3D gear models. Each art key authors its parts onto the body sockets the rig
// exposes; the rig then bakes everything into its skinned meshes. Weapons are
// modelled in a grip frame (grip at the origin, blade along +Y); worn pieces
// are modelled in the frame of the bone they sit on.
// -----------------------------------------------------------------------------

/** Attach points, built from the rig's sockets. Forward is +X, up +Y, the fighter's right is +Z. */
export interface GearSockets {
  /** Right-hand weapon frame: grip at the origin, blade along +Y. */
  grip: Object3D;
  /** Left-hand frame, same convention. */
  offGrip: Object3D;
  forearmL: Object3D;
  forearmR: Object3D;
  head: Object3D;
  /** Head sphere centre (in head space) and radius. */
  headY: number;
  headR: number;
  chest: Object3D;
  hips: Object3D;
  shoulderL: Object3D;
  shoulderR: Object3D;
  legL: Leg;
  legR: Leg;
  /** Heavy-set body: torso proxies already scale with the body, so this only thickens trims. */
  big: boolean;
  /** Creates an extra skinned bone. */
  bone(parent: Object3D, x: number, y: number, z: number): Object3D;
  /** Creates a cloth bone the view sways. */
  clothBone(parent: Object3D, x: number, y: number, z: number): Object3D;
  /** A bone orbiting the fighter for this item. */
  orbiter(): Object3D;
  /** Names a bone the animator drives (bow string, nocked arrow). */
  tag(name: string, o: Object3D): void;
}

/**
 * Boots are modelled against a reference leg (knee at y=0, ground at y=-0.5).
 * Shaft parts ride the shin, sole parts ride the foot so they stay planted.
 */
export interface Leg {
  shin: Object3D;
  foot: Object3D;
}

export interface WeaponTrailPoints {
  base: [number, number, number];
  tip: [number, number, number];
  /** Where the left hand grips a two-handed weapon (grip space). */
  offGrip?: [number, number, number];
}

/** Arts held in one hand, leaving the other free. */
const ONE_HANDED: ArtKey[] = ['sword', 'katana', 'rapier', 'dagger', 'axe', 'mace', 'torch', 'wand', 'scepter'];

export function lookOf(id: GearId): ResolvedArt {
  return resolveArt(ITEM_ART[id]);
}

// Reference body the models were authored against (the Balanced form is close to it).
const REF = { chestD: 0.2, chestW: 0.28, chestH: 0.46, hipD: 0.17, hipW: 0.236, armR: 0.072, forearm: 0.3, calfR: 0.08 };

/** A group that maps the reference body onto this body's proportions. */
function proxy(api: RigBuildApi, parent: Object3D, scale: [number, number, number], pos: [number, number, number] = [0, 0, 0]): Object3D {
  const g = api.group(parent, pos);
  g.scale.set(...scale);
  g.userData.proxy = true;
  return g;
}

/** Bones must not live under a scaled proxy: hang them on the real bone instead. */
function unproxied(parent: Object3D, x: number, y: number, z: number): [Object3D, [number, number, number]] {
  if (!parent.userData.proxy || !parent.parent) return [parent, [x, y, z]];
  const sc = parent.scale, o = parent.position;
  return [parent.parent, [o.x + x * sc.x, o.y + y * sc.y, o.z + z * sc.z]];
}

function socketsFrom(api: RigBuildApi, id: GearId): GearSockets {
  const k = api.sockets, m = api.metrics, sh = m.form.shape;
  // The new torso carries muscle and cloth volume, so worn pieces sit a little proud of it.
  const chestScale: [number, number, number] = [1.1 * m.chestD / REF.chestD, sh.neckLen / REF.chestH, 1.1 * m.chestW / REF.chestW];
  const arm = (fa: Object3D) => proxy(api, fa, [m.foreR / 0.064, m.forearm / REF.forearm, m.foreR / 0.064]);
  const shoulder = (so: Object3D) => proxy(api, so, [m.armR / REF.armR, m.armR / REF.armR, m.armR / REF.armR]);
  const leg = (shin: Object3D, foot: Object3D): Leg => {
    const r = m.calfR / REF.calfR;
    // Reference ground (y=-0.5) lands on this body's ground at rest.
    const lift = 0.5 - (m.shin + m.ankleH);
    return {
      shin: proxy(api, shin, [r, 1, r], [0, lift, 0]),
      foot: proxy(api, foot, [m.footS, m.footS, m.footS * r], [0, -m.ankleH + 0.5 * m.footS, 0]),
    };
  };
  return {
    grip: k.mainHand,
    offGrip: k.offHand,
    forearmL: arm(k.forearmL),
    forearmR: arm(k.forearmR),
    head: k.head,
    headY: m.headY,
    headR: m.headR,
    chest: proxy(api, k.chest, chestScale),
    hips: proxy(api, k.hips, [m.chestD * 0.95 / REF.hipD, 1, (sh.hipW + m.thighR * 0.9) / REF.hipW]),
    shoulderL: shoulder(k.shoulderL),
    shoulderR: shoulder(k.shoulderR),
    legL: leg(k.shinL, k.footL),
    legR: leg(k.shinR, k.footR),
    big: false,
    bone: (parent, x, y, z) => { const [p, pos] = unproxied(parent, x, y, z); return api.bone(p, pos); },
    clothBone: (parent, x, y, z) => { const [p, pos] = unproxied(parent, x, y, z); return api.cloth(p, ...pos); },
    orbiter: () => api.orbiter(id),
    tag: (name, o) => api.tag(name, o),
  };
}

/** Rig decorator that models one gear piece (registered in fighter/gearModels.ts). */
export function gearDecorator(id: GearId): RigDecorator {
  const look = lookOf(id);
  const slot = gearOf(id).slot;
  return (api) => {
    const s = socketsFrom(api, id);
    const m = mats(look);
    const grip = api.look.grip;
    // The left hand is free for a secondary when the main weapon is one-handed and nothing is strapped to that arm.
    const leftFree = grip === 'oneHand' && (api.look.offhand === 'none' || api.look.offhand === 'focus');
    switch (slot) {
      case 'main': {
        const w = WEAPONS[look.art] ?? WEAPONS.sword!;
        // A bow is held in the left hand; the right hand draws the string.
        const bow = grip === 'bow';
        const t = w(bow ? s.offGrip : s.grip, m, s);
        if (look.art === 'twin_daggers') WEAPONS.dagger!(s.offGrip, m, s);
        api.setWeapon(t.base, t.tip, bow ? 'off' : 'main');
        if ((grip === 'twoHand' || grip === 'polearm') && !ONE_HANDED.includes(look.art)) api.setOffGrip(t.offGrip ?? [0, 0.24, 0]);
        else if (grip === 'twoHand' || grip === 'polearm') api.setOffGrip(t.offGrip ?? [0, -0.11, 0]);
        break;
      }
      case 'defense':
        DEFENSE[look.art]?.(s, m);
        break;
      case 'offhand':
        OFFHAND[look.art]?.(s, m, leftFree);
        break;
      case 'head':
        if (look.art === 'knight_helm' || look.art === 'hood') api.hide('hair');
        if (look.art === 'knight_helm') api.hide('ears');
        HEAD[look.art]?.(s, m);
        break;
      case 'boots': {
        const b = BOOTS[look.art] ?? BOOTS.leather_boots!;
        for (const leg of [s.legL, s.legR]) b(leg, m, s);
        break;
      }
      case 'special': {
        const r = SPECIAL[look.art]?.(s, m);
        if (r?.phoenix) api.tag('phoenix', r.phoenix);
        break;
      }
    }
  };
}

// --- weapons ---------------------------------------------------------------------

/** Bow string geometry shared with the animator (grip space of the left hand). */
export const BOW_STRING = { tipY: 0.86, arrowY: 0.03, arrowLen: 0.8 };

type WeaponFn = (g: Object3D, m: Mats, s: GearSockets) => WeaponTrailPoints;

function hilt(g: Object3D, m: Mats, len = 0.2, pommel = 0.045): void {
  part(g, cyl(0.026, 0.03, len, 8), m.wrap, { pos: [0, 0.02, 0] });
  for (let k = 0; k < 3; k++) part(g, torus(0.03, 0.007, Math.PI * 2, 4, 8), lineless(m.leather), { pos: [0, -0.05 + k * 0.06, 0], rot: [Math.PI / 2, 0, 0] });
  part(g, sphere(pommel, 10, 8), m.trim, { pos: [0, 0.02 - len / 2 - pommel * 0.6, 0] });
}

const WEAPONS: Partial<Record<ArtKey, WeaponFn>> = {
  sword: (g, m) => {
    hilt(g, m);
    part(g, rbox(0.34, 0.055, 0.07, 0.024), m.trim, { pos: [0, 0.14, 0] });
    for (const sx of [-1, 1]) part(g, sphere(0.032, 8, 6), m.trim, { pos: [sx * 0.18, 0.15, 0] });
    part(g, octa(0.038), m.gem, { pos: [0, 0.14, 0.04] });
    part(g, blade(0.92, 0.12, 0.024, 0, 0.16), m.main, { pos: [0, 0.165, 0] });
    part(g, box(0.026, 0.74, 0.03), m.edge, { pos: [0, 0.54, 0] });
    return { base: [0, 0.22, 0], tip: [0, 1.08, 0] };
  },
  katana: (g, m) => {
    part(g, cyl(0.026, 0.026, 0.28, 8), m.cloth, { pos: [0, 0.0, 0] });
    for (let k = 0; k < 5; k++) part(g, torus(0.028, 0.007, Math.PI * 2, 4, 8), lineless({ color: 0xf4ecdc }), { pos: [0, -0.11 + k * 0.055, 0], rot: [Math.PI / 2, 0.5, 0] });
    part(g, cyl(0.03, 0.026, 0.03, 8), m.gold, { pos: [0, -0.15, 0] });
    part(g, cyl(0.08, 0.08, 0.02, 14), { color: 0x2a2430, gloss: 0.6 }, { pos: [0, 0.15, 0] });
    part(g, cyl(0.03, 0.03, 0.05, 8), m.gold, { pos: [0, 0.18, 0] });
    part(g, blade(1.0, 0.068, 0.02, 0.09, 0.12), m.main, { pos: [0, 0.19, 0] });
    part(g, box(0.015, 0.8, 0.024), m.edge, { pos: [0.033, 0.6, 0], rot: [0, 0, -0.05] });
    return { base: [0, 0.22, 0], tip: [0.09, 1.17, 0] };
  },
  rapier: (g, m) => {
    hilt(g, m, 0.18, 0.04);
    part(g, torus(0.09, 0.012, Math.PI * 1.2, 5, 14), m.trim, { pos: [0.02, 0.06, 0], rot: [0, 0, -0.4] });
    part(g, rbox(0.26, 0.03, 0.04, 0.012), m.trim, { pos: [0, 0.13, 0] });
    part(g, blade(1.0, 0.04, 0.016, 0, 0.1), m.main, { pos: [0, 0.14, 0] });
    return { base: [0, 0.2, 0], tip: [0, 1.12, 0] };
  },
  dagger: (g, m) => {
    part(g, cyl(0.024, 0.026, 0.15, 8), m.wrap, { pos: [0, 0.0, 0] });
    part(g, sphere(0.034, 8, 6), m.trim, { pos: [0, -0.09, 0] });
    part(g, rbox(0.2, 0.04, 0.05, 0.016), m.trim, { pos: [0, 0.09, 0] });
    part(g, blade(0.42, 0.085, 0.02, 0, 0.32, 0.25), m.main, { pos: [0, 0.11, 0] });
    part(g, box(0.016, 0.3, 0.024), m.edge, { pos: [0.012, 0.29, 0] });
    return { base: [0, 0.13, 0], tip: [0, 0.53, 0] };
  },
  twin_daggers: (g, m, s) => WEAPONS.dagger!(g, m, s),
  warhammer: (g, m) => {
    part(g, cyl(0.04, 0.046, 1.32, 8), m.wood, { pos: [0, 0.38, 0] });
    for (let k = 0; k < 3; k++) part(g, cyl(0.05, 0.05, 0.06, 8), m.leather, { pos: [0, -0.1 + k * 0.1, 0] });
    part(g, sphere(0.055, 8, 6), m.trim, { pos: [0, -0.3, 0] });
    part(g, rbox(0.32, 0.34, 0.54, 0.06), m.main, { pos: [0, 1.02, 0] });
    for (const y of [0.88, 1.16]) part(g, rbox(0.36, 0.07, 0.58, 0.03), m.trim, { pos: [0, y, 0] });
    part(g, rbox(0.33, 0.12, 0.2, 0.02), m.edge, { pos: [0, 1.02, 0] });
    for (const z of [-0.29, 0.29]) {
      part(g, cyl(0.13, 0.15, 0.04, 8), m.main, { pos: [0, 1.02, z], rot: [Math.PI / 2, 0, 0] });
      part(g, torus(0.12, 0.014, Math.PI * 2, 4, 12), m.trim, { pos: [0, 1.02, z * 1.08] });
      part(g, octa(0.04), m.gem, { pos: [0, 1.02, z * 1.1] });
    }
    part(g, cone(0.06, 0.2, 6), m.main, { pos: [0, 1.29, 0] });
    return { base: [0, 0.85, 0], tip: [0, 1.22, 0] };
  },
  spear: (g, m, s) => {
    part(g, cyl(0.026, 0.03, 1.85, 8), m.wood, { pos: [0, 0.38, 0] });
    for (const y of [-0.05, 0.12]) part(g, cyl(0.034, 0.034, 0.08, 8), m.leather, { pos: [0, y, 0] });
    part(g, cone(0.035, 0.1, 6), m.trim, { pos: [0, -0.59, 0], rot: [Math.PI, 0, 0] });
    part(g, cyl(0.04, 0.03, 0.1, 8), m.trim, { pos: [0, 1.38, 0] });
    part(g, blade(0.42, 0.13, 0.024, 0, 0.42, 0.45), m.main, { pos: [0, 1.42, 0] });
    part(g, box(0.014, 0.3, 0.03), m.edge, { pos: [0, 1.6, 0] });
    // Tassel under the head (sways like cloth).
    const t = s.clothBone(g, 0, 1.33, 0);
    for (let k = 0; k < 4; k++) part(t, capsule(0.014, 0.16), m.cloth, { pos: [-0.03 + (k % 2) * 0.03, -0.1, (k - 1.5) * 0.02], rot: [0, 0, 0.4 + k * 0.08] });
    return { base: [0, 1.05, 0], tip: [0, 1.84, 0] };
  },
  staff: (g, m) => {
    part(g, cyl(0.03, 0.042, 1.9, 8), m.wood, { pos: [0, 0.2, 0] });
    for (const y of [-0.3, 0.45, 0.75]) part(g, sphere(0.046, 8, 6), m.wood, { pos: [0, y, 0], scale: [1, 0.6, 1] });
    for (let k = 0; k < 3; k++) part(g, torus(0.042, 0.011, Math.PI * 2, 4, 10), m.gold, { pos: [0, 0.58 + k * 0.1, 0], rot: [Math.PI / 2, 0, 0] });
    // Crook: two curling arms cradling a floating crystal.
    for (const sx of [-1, 1]) part(g, bent(`staffArm${sx}`, [[0, 0], [sx * 0.2, 0.08], [sx * 0.1, 0.32]], 0.032, 0.012), m.wood, { pos: [0, 1.12, 0] });
    part(g, octa(0.11), m.glow, { pos: [0, 1.36, 0], scale: [0.8, 1.35, 0.8] });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      part(g, octa(0.028), m.gem, { pos: [Math.cos(a) * 0.19, 1.36 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.19] });
    }
    return { base: [0, 1.0, 0], tip: [0, 1.36, 0] };
  },
  bow: (g, m, s) => {
    // Held in the left fist: grip at the origin, limbs along ±Y bending towards
    // the target (+X), string behind the riser. The string halves and the
    // nocked arrow hang on bones the animator drives (see fighter/bow.ts).
    part(g, rbox(0.06, 0.24, 0.05, 0.02), m.leather, { pos: [0, 0, 0] });
    for (const sy of [-1, 1]) {
      part(g, bent(`bowLimb${sy}`, [[0, 0], [0.12, sy * 0.4], [-0.02, sy * 0.78]], 0.03, 0.014), m.wood, { pos: [0, sy * 0.1, 0] });
      part(g, sphere(0.022, 6, 4), m.trim, { pos: [-0.02, sy * 0.88, 0] });
      // String half from the limb tip to the centre (the nock point at rest).
      const half = s.bone(g, -0.025, sy * BOW_STRING.tipY, 0);
      part(half, box(0.008, BOW_STRING.tipY, 0.008), lineless({ color: 0xf3ead6 }), { pos: [0, -sy * BOW_STRING.tipY / 2, 0] });
      s.tag(sy > 0 ? 'bowTop' : 'bowBottom', half);
    }
    part(g, octa(0.03), m.gem, { pos: [0.04, 0, 0] });
    // Nocked arrow: nock at the bone, pointing at the target (+X), resting on the left of the riser.
    const arrow = s.bone(g, -0.025, BOW_STRING.arrowY, 0);
    const L = BOW_STRING.arrowLen;
    part(arrow, cyl(0.009, 0.009, L, 6), { color: 0xc9a46a }, { pos: [L / 2, 0, 0], rot: [0, 0, -Math.PI / 2] });
    part(arrow, cone(0.024, 0.08, 6), m.steel, { pos: [L + 0.03, 0, 0], rot: [0, 0, -Math.PI / 2] });
    for (const k of [-1, 1]) part(arrow, box(0.12, 0.004, 0.035), lineless({ color: m.tint }), { pos: [0.08, 0, k * 0.018] });
    part(arrow, box(0.12, 0.035, 0.004), lineless({ color: m.tint }), { pos: [0.08, 0.018, 0] });
    s.tag('arrow', arrow);
    return { base: [0, -0.6, 0], tip: [0, 0.6, 0] };
  },
  crossbow: (g, m) => {
    part(g, rbox(0.06, 0.5, 0.07, 0.02), m.wood, { pos: [0, 0.14, 0] });
    part(g, bent('xbowArm', [[-0.32, 0], [0, 0.12], [0.32, 0]], 0.02, 0.02), m.main, { pos: [0, 0.34, 0] });
    part(g, box(0.62, 0.006, 0.006), lineless({ color: 0xf3ead6 }), { pos: [0, 0.33, 0] });
    part(g, rbox(0.03, 0.34, 0.03, 0.01), m.steel, { pos: [0, 0.32, 0.04] });
    part(g, cone(0.025, 0.07, 4), m.gem, { pos: [0, 0.52, 0.04] });
    return { base: [0, 0, 0], tip: [0, 0.5, 0] };
  },
  chakram: (g, m) => {
    part(g, torus(0.2, 0.025, Math.PI * 2, 4, 24), m.main, { pos: [0, 0.18, 0], rot: [0, Math.PI / 2, 0] });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      part(g, cone(0.03, 0.12, 3), m.main, { pos: [0, 0.18 + Math.sin(a) * 0.24, Math.cos(a) * 0.24], rot: [a, 0, 0], scale: [0.4, 1, 1] });
    }
    part(g, torus(0.16, 0.01, Math.PI * 2, 4, 20), m.gem, { pos: [0, 0.18, 0], rot: [0, Math.PI / 2, 0] });
    return { base: [0, 0, 0], tip: [0, 0.4, 0] };
  },
};

// --- secondary weapons ------------------------------------------------------------

/** Hand crossbow geometry shared with the animator (grip frame: muzzle +X, top +Y, prod tips at ±Z). */
export const XBOW = { tipX: 0.27, tipZ: 0.27, stringY: 0.085, cockX: 0.06, boltLen: 0.3 };

function handCrossbow(g: Object3D, m: Mats, s: GearSockets): void {
  // Stock over the fist, pistol grip down into it, trigger guard.
  part(g, rbox(0.44, 0.055, 0.05, 0.018), m.wood, { pos: [0.12, 0.055, 0] });
  part(g, rbox(0.05, 0.12, 0.045, 0.016), m.wood, { pos: [-0.005, 0.0, 0], rot: [0, 0, 0.25] });
  part(g, torus(0.025, 0.006, Math.PI, 4, 8), m.steel, { pos: [0.05, 0.02, 0], rot: [0, 0, Math.PI] });
  // Rail with a groove for the bolt, and a steel nose.
  part(g, box(0.3, 0.012, 0.022), m.steel, { pos: [0.18, 0.084, 0] });
  part(g, rbox(0.05, 0.06, 0.06, 0.012), m.steel, { pos: [0.33, 0.06, 0] });
  // Prod: a recurved arc lying flat across the nose, tips swept back.
  const flat = group(g, [XBOW.tipX + 0.09 - 0.43, XBOW.stringY, 0], [Math.PI / 2, 0, 0]);
  part(group(flat, [0, 0, 0], [0, 0, -0.7]), torus(0.43, 0.016, 1.4, 6, 16), m.main, {});
  for (const z of [-1, 1]) part(g, sphere(0.018, 6, 4), m.trim, { pos: [XBOW.tipX, XBOW.stringY, z * XBOW.tipZ] });
  part(g, octa(0.022), m.gem, { pos: [0.2, 0.06, 0.03] });
  // String halves from each prod tip to the latch (driven bones).
  for (const z of [-1, 1]) {
    const half = s.bone(g, XBOW.tipX, XBOW.stringY, z * XBOW.tipZ);
    part(half, box(0.006, 0.006, XBOW.tipZ), lineless({ color: 0xf3ead6 }), { pos: [0, 0, -z * XBOW.tipZ / 2] });
    s.tag(z > 0 ? 'xbowStringR' : 'xbowStringL', half);
  }
  // Bolt: nock at the bone, along +X.
  const bolt = s.bone(g, XBOW.cockX, XBOW.stringY + 0.012, 0);
  const L = XBOW.boltLen;
  part(bolt, cyl(0.008, 0.008, L, 6), { color: 0xc9a46a }, { pos: [L / 2, 0, 0], rot: [0, 0, -Math.PI / 2] });
  part(bolt, cone(0.02, 0.06, 4), m.steel, { pos: [L + 0.02, 0, 0], rot: [0, 0, -Math.PI / 2] });
  part(bolt, box(0.06, 0.03, 0.004), lineless({ color: m.tint }), { pos: [0.04, 0.012, 0] });
  s.tag('xbowBolt', bolt);
}

type OffhandFn = (s: GearSockets, m: Mats, inHand: boolean) => void;

const OFFHAND: Partial<Record<ArtKey, OffhandFn>> = {
  throwing_knives: (s, m, inHand) => {
    // Bandolier across the chest with three knives, one more in the hand.
    part(s.chest, rbox(0.06, 0.62, 0.05, 0.02), m.leather, { pos: [0.21, 0.2, 0], rot: [0.75, 0, 0] });
    for (let k = 0; k < 3; k++) {
      const kn = group(s.chest, [0.25, 0.12 + k * 0.08, -0.12 + k * 0.1], [0.75, 0, 0]);
      part(kn, blade(0.14, 0.04, 0.01, 0, 0.4), m.main, { pos: [0, 0.02, 0] });
      part(kn, cyl(0.012, 0.012, 0.06, 6), m.cloth, { pos: [0, -0.02, 0] });
    }
    if (inHand) {
      for (let k = 0; k < 3; k++) {
        const kn = group(s.offGrip, [0, 0.02, 0], [(k - 1) * 0.35, 0, 0]);
        part(kn, blade(0.22, 0.05, 0.012, 0, 0.4), m.main, { pos: [0, 0.05, 0] });
        part(kn, torus(0.02, 0.006, Math.PI * 2, 4, 8), m.trim, { pos: [0, -0.03, 0] });
      }
    }
  },
  crossbow: (s, m, inHand) => {
    // The crossbow hangs on a bone the animator moves between the left hand and
    // the left hip (when that hand is busy), aims, looses and re-cocks (see
    // fighter/crossbow.ts). Modelled in the hand's grip frame: muzzle +X, top +Y.
    const xb = s.bone(s.offGrip, 0, 0, 0);
    handCrossbow(xb, m, s);
    s.tag('xbow', xb);
    if (!inHand) {
      // Holster on the left hip, muzzle down.
      const holster = s.bone(s.hips, 0.02, -0.04, -0.29);
      holster.rotation.set(0.25, 0, -Math.PI / 2 - 0.3);
      s.tag('xbowHolster', holster);
    }
  },
  chakram: (s, m, inHand) => {
    if (inHand) { WEAPONS.chakram!(s.offGrip, m, s); return; }
    const b = group(s.chest, [-0.24, 0.28, 0], [0, 0, 0.3]);
    WEAPONS.chakram!(b, m, s);
  },
  orb: (s, m) => {
    // Floating orb beside the left hand, cradled by three gold claws.
    const o = group(s.forearmL, [0.0, -0.42, -0.14]);
    part(o, sphere(0.1, 14, 10), m.glow, {});
    part(o, sphere(0.13, 12, 8), lineless({ color: m.tint, glow: 0.6 }), { scale: 1 });
    part(o, torus(0.15, 0.01, Math.PI * 2, 4, 20), m.gem, { rot: [1.2, 0.3, 0] });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      part(o, cone(0.02, 0.1, 4), m.main, { pos: [Math.cos(a) * 0.11, -0.1, Math.sin(a) * 0.11], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
    }
  },
  gauntlets: (s, m) => {
    // Armoured left fist and forearm.
    const hand = s.offGrip;
    part(hand, rbox(0.15, 0.17, 0.15, 0.05), m.main, { pos: [-0.02, 0.0, 0.0] });
    for (let k = 0; k < 4; k++) part(hand, cone(0.018, 0.07, 4), lineless(m.gem), { pos: [0.08, -0.05 + k * 0.035, 0.07], rot: [Math.PI / 2, 0, 0] });
    part(s.forearmL, cyl(0.1, 0.085, 0.24, 10), m.main, { pos: [0, -0.16, 0] });
    for (const y of [-0.07, -0.26]) part(s.forearmL, torus(0.098, 0.016, Math.PI * 2, 4, 14), m.trim, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
    part(s.forearmL, octa(0.04), m.gem, { pos: [0.0, -0.16, -0.1] });
  },
  horn: (s, m) => {
    // War horn slung at the hip on a strap.
    const h = group(s.hips, [0.04, 0.0, 0.27], [0.2, 0, 0.3]);
    part(h, bent('hornBody', [[0, 0], [0.18, -0.05], [0.3, 0.12]], 0.022, 0.07), m.main, {});
    for (const t of [0.35, 0.7]) part(h, torus(0.045 + t * 0.03, 0.01, Math.PI * 2, 4, 12), m.gold, { pos: [0.1 + t * 0.15, -0.02 + t * 0.06, 0], rot: [0, Math.PI / 2, 0.7] });
    part(s.chest, rbox(0.05, 0.62, 0.04, 0.015), m.cloth, { pos: [0.2, 0.18, 0], rot: [-0.75, 0, 0] });
  },
};

// --- defense ----------------------------------------------------------------------

type DefenseFn = (s: GearSockets, m: Mats) => WeaponTrailPoints | void;

function pauldrons(s: GearSockets, spec: Mats['main'], trim: Mats['trim']): void {
  const k = s.big ? 1.25 : 1;
  for (const sa of [s.shoulderL, s.shoulderR]) {
    part(sa, halfSphere(0.17 * k), spec, { scale: [1.15, 0.85, 1.05] });
    part(sa, halfSphere(0.15 * k), spec, { pos: [0, -0.07 * k, 0], scale: [1.22, 0.8, 1.15] });
    part(sa, torus(0.165 * k, 0.016, Math.PI * 2, 4, 16), trim, { rot: [Math.PI / 2, 0, 0], scale: [1.15, 1.05, 1] });
  }
}

/** Inner face of a shield (seen when the shield arm is turned away): wood boards and leather straps. */
function shieldBack(sh: Object3D, m: Mats, w: number, h: number): void {
  part(sh, rbox(w, h, 0.02, 0.01), m.wood, { pos: [0, 0, 0.035] });
  for (let k = -1; k <= 1; k++) part(sh, box(0.006, h * 0.96, 0.004), lineless(m.wrap), { pos: [k * w * 0.25, 0, 0.047] });
  for (const y of [h * 0.18, -h * 0.18]) part(sh, rbox(w * 0.85, 0.05, 0.03, 0.01), m.leather, { pos: [0, y, 0.05] });
  part(sh, cyl(0.03, 0.03, h * 0.5, 8), m.wrap, { pos: [0, 0, 0.075] });
}

const DEFENSE: Partial<Record<ArtKey, DefenseFn>> = {
  tower_shield: (s, m) => {
    const sh = group(s.forearmL, [0, -0.16, -0.14], [0, 0, 0.06]);
    const outline: [number, number][] = [[-0.28, 0.46], [0, 0.52], [0.28, 0.46], [0.28, -0.4], [0, -0.52], [-0.28, -0.4]];
    part(sh, slab('tower', outline, 0.05, 0.02), m.main, { rot: [0, Math.PI, 0] });
    part(sh, rbox(0.14, 0.94, 0.03, 0.01), m.cloth, { pos: [0, 0, -0.045] });
    for (const y of [0.24, -0.2]) part(sh, rbox(0.6, 0.06, 0.03, 0.01), m.trim, { pos: [0, y, -0.05] });
    part(sh, cyl(0.075, 0.085, 0.04, 14), m.trim, { pos: [0, 0.02, -0.06], rot: [Math.PI / 2, 0, 0] });
    part(sh, sphere(0.045, 10, 8), m.gem, { pos: [0, 0.02, -0.08], scale: [1, 1, 0.6] });
    for (const [x, y] of [[-0.21, 0.36], [0.21, 0.36], [-0.21, -0.32], [0.21, -0.32]]) part(sh, sphere(0.02, 6, 4), m.trim, { pos: [x, y, -0.04] });
    shieldBack(sh, m, 0.44, 0.8);
  },
  mirror_shield: (s, m) => {
    const sh = group(s.forearmL, [0, -0.16, -0.13], [0, 0, 0.08]);
    part(sh, cyl(0.31, 0.31, 0.05, 24), m.main, { rot: [Math.PI / 2, 0, 0] });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      part(sh, cone(0.04, 0.09, 4), m.main, { pos: [Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0], rot: [0, 0, a - Math.PI / 2] });
    }
    part(sh, cyl(0.25, 0.25, 0.02, 24), { color: m.tint, glow: 1.25 }, { pos: [0, 0, -0.03], rot: [Math.PI / 2, 0, 0] });
    part(sh, box(0.03, 0.36, 0.01), lineless({ color: 0xffffff, glow: 1.8 }), { pos: [-0.06, 0.03, -0.045], rot: [0, 0, 0.7] });
    shieldBack(sh, m, 0.4, 0.4);
  },
  parrying_dagger: (s, m) => {
    const g = s.offGrip;
    part(g, cyl(0.024, 0.026, 0.15, 8), m.dark, {});
    part(g, sphere(0.034, 8, 6), m.trim, { pos: [0, -0.09, 0] });
    part(g, halfSphere(0.085), m.trim, { pos: [0, 0.08, 0], rot: [Math.PI, 0, 0], scale: [1, 0.6, 1] });
    part(g, rbox(0.4, 0.03, 0.04, 0.012), m.trim, { pos: [0, 0.1, 0] });
    for (const sx of [-1, 1]) part(g, sphere(0.024, 6, 4), m.trim, { pos: [sx * 0.2, 0.1, 0] });
    part(g, blade(0.5, 0.07, 0.02, 0, 0.2), m.main, { pos: [0, 0.12, 0] });
    part(g, box(0.014, 0.36, 0.024), m.edge, { pos: [0, 0.32, 0] });
    return { base: [0, 0.14, 0], tip: [0, 0.6, 0] };
  },
  plate_armor: (s, m) => {
    const k = s.big ? 1.28 : 1;
    part(s.chest, lathe('plateChest', [[0.001, 0.02], [0.2, 0.04], [0.248, 0.18], [0.265, 0.31], [0.212, 0.41], [0.001, 0.43]], 18), m.main, { scale: [0.87 * k, 1, 1.13 * k] });
    part(s.chest, torus(0.205, 0.022, Math.PI * 2, 5, 20), m.trim, { pos: [0, 0.41, 0], rot: [Math.PI / 2, 0, 0], scale: [0.87 * k, 1.13 * k, 1] });
    part(s.chest, rbox(0.03, 0.3, 0.04, 0.012), m.trim, { pos: [0.225 * k, 0.2, 0] });
    part(s.chest, octa(0.05), m.gem, { pos: [0.24 * k, 0.26, 0], scale: [0.6, 1, 1] });
    pauldrons(s, m.main, m.trim);
    // Plackart over the belly, between the breastplate and the faulds.
    part(s.hips, lathe('plackart', [[0.001, 0.05], [0.19, 0.06], [0.225, 0.16], [0.215, 0.3], [0.001, 0.31]], 16), m.main, { scale: [0.95 * k, 1, 1.0 * k] });
    // Faulds: a ring of plates over the hips.
    part(s.hips, torus(0.2 * k, 0.04, Math.PI * 2, 5, 18), m.trim, { pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], scale: [0.9, 1.18, 1] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(s.hips, rbox(0.03, 0.18, 0.13, 0.01), m.main, { pos: [Math.cos(a) * 0.19 * k, -0.04, Math.sin(a) * 0.23 * k], rot: [Math.sin(a) * -0.25, -a, Math.cos(a) * 0.25] });
    }
  },
  cloak: (s, m) => {
    const cape = s.clothBone(s.chest, -0.21, 0.42, 0);
    const k = s.big ? 1.2 : 1;
    part(cape, rbox(0.04, 1.08, 0.6 * k, 0.018), m.cloth, { pos: [-0.02, -0.54, 0] });
    part(cape, rbox(0.035, 1.02, 0.54 * k, 0.018), m.clothDark, { pos: [0.006, -0.52, 0] });
    part(cape, rbox(0.044, 0.04, 0.62 * k, 0.015), m.glow, { pos: [-0.02, -1.07, 0] });
    part(s.chest, torus(0.17 * k, 0.05, Math.PI * 2, 6, 18), m.cloth, { pos: [-0.03, 0.45, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1.15, 1] });
    part(s.chest, cyl(0.045, 0.045, 0.03, 12), m.trim, { pos: [0.16 * k, 0.43, 0], rot: [0, 0, Math.PI / 2] });
    part(s.chest, octa(0.032), m.gem, { pos: [0.18 * k, 0.43, 0] });
  },
  thorn_armor: (s, m) => {
    const bark = m.main, thorn = { color: m.tint, gloss: 0.3 };
    const tk = 1.5;
    const k = s.big ? 1.28 : 1;
    part(s.chest, lathe('barkChest', [[0.001, 0.04], [0.21, 0.06], [0.25, 0.2], [0.26, 0.32], [0.2, 0.4], [0.001, 0.42]], 9), bark, { scale: [0.88 * k, 1, 1.14 * k] });
    for (let i = 0; i < 7; i++) {
      const a = -1.1 + i * 0.36;
      part(s.chest, cone(0.026 * tk, 0.12 * tk, 4), thorn, { pos: [Math.cos(a) * 0.25 * k, 0.12 + (i % 3) * 0.09, Math.sin(a) * 0.31 * k], rot: [Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4] });
    }
    for (const sh of [s.shoulderL, s.shoulderR]) {
      part(sh, halfSphere(0.16 * k, 9), bark, { scale: [1.15, 0.9, 1.1] });
      for (let i = 0; i < 4; i++) part(sh, cone(0.028 * tk, 0.17 * tk, 4), thorn, { pos: [(i - 1.5) * 0.08, 0.1, 0], rot: [(i % 2 ? 0.3 : -0.3), 0, (1.5 - i) * 0.4] });
    }
    for (const fa of [s.forearmL, s.forearmR]) for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      part(fa, cone(0.022 * tk, 0.1 * tk, 4), thorn, { pos: [Math.cos(a) * 0.1, -0.12, Math.sin(a) * 0.1], rot: [Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4] });
    }
  },
};

// --- head -------------------------------------------------------------------------

type HeadFn = (s: GearSockets, m: Mats) => void;

const HEAD: Partial<Record<ArtKey, HeadFn>> = {
  knight_helm: (s, m) => {
    const { head, headY: y, headR: r } = s;
    part(head, sphere(r * 1.16, 18, 14), m.main, { pos: [-0.005, y + 0.025, 0], scale: [1.04, 1.04, 0.99] });
    part(head, cyl(r * 1.05, r * 1.18, r * 0.5, 16), m.main, { pos: [-0.01, y - r * 0.55, 0] });
    part(head, rbox(0.03, 0.03, r * 1.3, 0.012), lineless(m.dark), { pos: [r * 1.12, y + 0.03, 0], scale: [1, 1, 1] });
    for (let k = 0; k < 3; k++) for (const sz of [-1, 1]) part(head, sphere(0.009, 4, 3), lineless(m.dark), { pos: [r * 1.12, y - 0.06 - k * 0.03, sz * 0.05] });
    part(head, rbox(r * 2.0, 0.035, 0.03, 0.012), m.trim, { pos: [0, y + r * 0.95, 0], rot: [0, 0, 0] });
    part(head, torus(r * 1.16, 0.018, Math.PI * 2, 4, 20), m.trim, { pos: [-0.005, y - 0.04, 0], rot: [Math.PI / 2, 0, 0] });
    const plume = s.clothBone(head, -0.02, y + r * 1.1, 0);
    for (let k = 0; k < 6; k++) {
      const a = -0.9 + k * 0.32;
      part(plume, capsule(0.034, 0.15 + Math.sin((k / 5) * Math.PI) * 0.06), k % 2 ? m.cloth : m.clothDark, { pos: [Math.sin(a) * 0.12 - 0.05, Math.cos(a) * 0.1 + 0.03, 0], rot: [0, 0, -a * 1.1], scale: [1, 1, 0.7] });
    }
  },
  demon_mask: (s, m) => {
    const { head, headY: y, headR: r } = s;
    part(head, sphere(r * 0.98, 16, 12), m.cloth, { pos: [r * 0.62, y - 0.01, 0], scale: [0.5, 1.02, 1.0] });
    for (const sz of [-1, 1]) {
      part(head, rbox(0.035, 0.03, 0.11, 0.012), lineless(m.dark), { pos: [r * 1.06, y + 0.07, sz * 0.075], rot: [sz * -0.4, 0, 0] });
      part(head, sphere(0.024, 8, 6), { color: 0xffd040, glow: 3 }, { pos: [r * 1.08, y + 0.03, sz * 0.075], scale: [0.5, 0.7, 1.2] });
      const h = group(head, [-0.02, y + r * 0.72, sz * r * 0.6], [sz * 0.7, 0, 0]);
      part(h, cone(0.05, 0.2, 8), m.bone, { pos: [0, 0.08, 0], rot: [0, 0, -0.3] });
      part(h, cone(0.028, 0.12, 6), m.bone, { pos: [-0.03, 0.22, 0], rot: [0, 0, -0.8] });
    }
    part(head, rbox(0.03, 0.04, 0.2, 0.012), lineless(m.dark), { pos: [r * 1.0, y - 0.11, 0] });
    for (let k = 0; k < 4; k++) part(head, cone(0.012, 0.035, 3), lineless(m.bone), { pos: [r * 1.03, y - 0.1, (k - 1.5) * 0.04], rot: [Math.PI, 0, 0] });
  },
  circlet: (s, m) => {
    const { head, headY: y, headR: r } = s;
    part(head, torus(r * 1.02, 0.014, Math.PI * 2, 4, 24), m.main, { pos: [0, y + 0.08, 0], rot: [Math.PI / 2, -0.18, 0] });
    part(head, octa(0.045), m.glow, { pos: [r * 1.04, y + 0.11, 0], scale: [0.6, 1.3, 1] });
    part(head, torus(0.04, 0.008, Math.PI * 2, 4, 12), m.main, { pos: [r * 1.0, y + 0.11, 0], rot: [0, Math.PI / 2, 0] });
    for (const sz of [-1, 1]) {
      const wg = group(head, [r * 0.82, y + 0.12, sz * r * 0.5], [sz * -0.4, sz * 0.6, 0.5]);
      for (let k = 0; k < 3; k++) part(wg, rbox(0.03, 0.1 - k * 0.022, 0.01, 0.005), m.main, { pos: [-k * 0.025, 0.04, 0], rot: [0, 0, 0.3 * k] });
    }
  },
  hood: (s, m) => {
    const { head, headY: y, headR: r } = s;
    // Close-fitting cowl: shell set back so the face shows, a peak over the
    // brow, a tail falling down the back and a mantle over the shoulders.
    part(head, sphere(r * 1.17, 16, 12), m.cloth, { pos: [-0.035, y + 0.035, 0], scale: [1, 1.06, 1.04] });
    part(head, cone(r * 0.55, r * 0.6, 10), m.cloth, { pos: [r * 0.55, y + r * 0.95, 0], rot: [0, 0, -1.25], scale: [1, 1, 0.9] });
    const tail = s.clothBone(head, -r * 0.95, y + r * 0.2, 0);
    part(tail, cone(r * 0.62, r * 1.6, 10), m.cloth, { pos: [-r * 0.35, -r * 0.55, 0], rot: [0, 0, 2.6] });
    part(s.chest, lathe('cowl', [[0.12, 0.0], [0.24, 0.04], [0.29, 0.14], [0.24, 0.2], [0.14, 0.1]], 16), m.cloth, { pos: [-0.02, 0.38, 0], scale: [0.95, 1, 1.1] });
    part(s.chest, rbox(0.03, 0.05, 0.3, 0.012), m.trim, { pos: [0.21, 0.44, 0] });
    // Executioner's mask over the lower face, eyes burning in the shadow.
    part(head, sphere(r * 0.9, 14, 10), m.clothDark, { pos: [r * 0.42, y - 0.03, 0], scale: [0.62, 0.9, 0.95] });
    for (const sz of [-1, 1]) part(head, sphere(0.024, 8, 6), { color: m.tint, glow: 3 }, { pos: [r * 0.98, y + 0.035, sz * 0.075], scale: [0.5, 0.6, 1.3] });
  },
  crown: (s, m) => {
    const { head, headY: y, headR: r } = s;
    const c = group(head, [0, y + r * 0.66, 0], [0, 0, -0.08]);
    const rr = r * 0.82;
    part(c, lathe('crownBand', [[rr, 0], [rr + 0.025, 0], [rr + 0.03, 0.09], [rr + 0.005, 0.09], [rr, 0]], 20), m.main, {});
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      part(c, cone(0.03, 0.13, 4), m.main, { pos: [Math.cos(a) * (rr + 0.015), 0.15, Math.sin(a) * (rr + 0.015)] });
      part(c, sphere(0.018, 6, 4), k % 2 ? m.gem : m.trim, { pos: [Math.cos(a) * (rr + 0.015), 0.225, Math.sin(a) * (rr + 0.015)] });
    }
    part(c, octa(0.04), m.glow, { pos: [rr + 0.04, 0.05, 0], scale: [0.6, 1.2, 1] });
  },
  bandana: (s, m) => {
    const { head, headY: y, headR: r } = s;
    part(head, torus(r * 1.0, 0.035, Math.PI * 2, 6, 22), m.cloth, { pos: [0, y + 0.08, 0], rot: [Math.PI / 2, -0.15, 0], scale: [1, 1, 1.05] });
    part(head, sphere(0.045, 8, 6), m.clothDark, { pos: [-r * 1.02, y + 0.06, 0] });
    for (let k = 0; k < 2; k++) {
      const t = s.clothBone(head, -r * 1.02, y + 0.06, (k - 0.5) * 0.05);
      part(t, rbox(0.3 - k * 0.06, 0.04, 0.07, 0.015), m.cloth, { pos: [-(0.15 - k * 0.03), -0.03 - k * 0.03, 0], rot: [0, 0, -0.35 - k * 0.15] });
    }
    part(head, octa(0.03), m.gem, { pos: [r * 1.0, y + 0.1, 0], scale: [0.5, 1, 1] });
  },
};

// --- boots ------------------------------------------------------------------------

type BootFn = (leg: Leg, m: Mats, s: GearSockets) => void;

/** Places a boot part on the shin or, below the ankle, on the foot. */
function lp(leg: Leg, g: Parameters<typeof part>[1], spec: Parameters<typeof part>[2], o: Parameters<typeof part>[3] = {}): void {
  const y = o.pos?.[1] ?? 0;
  part(y < -0.38 ? leg.foot : leg.shin, g, spec, o);
}

function bootBase(shin: Leg, shaft: Mats['main'], foot: Mats['main'], sole: Mats['main'], s: GearSockets): void {
  const k = s.big ? 1.18 : 1;
  lp(shin, cyl(0.1 * k, 0.092 * k, 0.24, 12), shaft, { pos: [0, -0.3, 0] });
  lp(shin, rbox(0.32, 0.12, 0.165 * k, 0.05), foot, { pos: [0.075, -0.43, 0] });
  lp(shin, rbox(0.34, 0.035, 0.175 * k, 0.015), sole, { pos: [0.075, -0.49, 0] });
}

const BOOTS: Partial<Record<ArtKey, BootFn>> = {
  leather_boots: (sh, m, s) => {
    bootBase(sh, m.main, m.main, m.wrap, s);
    lp(sh, torus(0.1, 0.03, Math.PI * 2, 5, 14), m.cloth, { pos: [0, -0.18, 0], rot: [Math.PI / 2, 0, 0] });
    for (let k = 0; k < 3; k++) lp(sh, rbox(0.012, 0.012, 0.09, 0.005), lineless({ color: 0xf1e2c4 }), { pos: [0.1, -0.26 - k * 0.05, 0], rot: [0.5 * (k % 2 ? 1 : -1), 0, 0] });
  },
  winged_boots: (sh, m, s) => {
    bootBase(sh, m.main, m.main, m.dark, s);
    lp(sh, torus(0.1, 0.02, Math.PI * 2, 4, 14), m.trim, { pos: [0, -0.19, 0], rot: [Math.PI / 2, 0, 0] });
    for (const sz of [-1, 1]) {
      const wing = group(sh.shin, [-0.05, -0.28, sz * 0.1], [sz * -0.35, 0, 0.75]);
      for (let k = 0; k < 3; k++) part(wing, rbox(0.03, 0.17 - k * 0.035, 0.012, 0.006), m.glow, { pos: [-k * 0.035, 0.06, 0], rot: [0, 0, 0.3 * k] });
    }
  },
  plate_greaves: (sh, m, s) => {
    bootBase(sh, m.main, m.main, m.dark, s);
    lp(sh, cyl(0.098, 0.088, 0.3, 12), m.main, { pos: [0.01, -0.13, 0], scale: [1.05, 1, 1] });
    lp(sh, sphere(0.1, 12, 8), m.main, { pos: [0.05, 0.0, 0], scale: [0.85, 1, 1] });
    lp(sh, octa(0.03), m.gem, { pos: [0.13, 0.0, 0] });
    for (const y of [-0.04, -0.28]) lp(sh, torus(0.097, 0.014, Math.PI * 2, 4, 14), m.trim, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
    for (let k = 0; k < 3; k++) lp(sh, rbox(0.07, 0.04, 0.17, 0.015), m.main, { pos: [0.1 + k * 0.06, -0.39 + k * 0.012, 0] });
  },
  spiked_boots: (sh, m, s) => {
    bootBase(sh, m.main, m.main, m.dark, s);
    for (let k = 0; k < 3; k++) lp(sh, cone(0.025, 0.1, 4), m.steel, { pos: [0.1, -0.06 - k * 0.09, 0], rot: [0, 0, -1.4] });
    lp(sh, cone(0.03, 0.1, 4), m.steel, { pos: [0.27, -0.44, 0], rot: [0, 0, -1.57] });
    lp(sh, torus(0.1, 0.016, Math.PI * 2, 4, 14), m.glow, { pos: [0, -0.2, 0], rot: [Math.PI / 2, 0, 0] });
  },
  cloud_boots: (sh, m, s) => {
    bootBase(sh, m.cloth, m.cloth, m.trim, s);
    lp(sh, torus(0.1, 0.025, Math.PI * 2, 4, 14), m.trim, { pos: [0, -0.19, 0], rot: [Math.PI / 2, 0, 0] });
    for (let k = 0; k < 4; k++) lp(sh, sphere(0.06 - (k % 2) * 0.012, 8, 6), lineless({ color: 0xf4fbff, glow: 1.15 }), { pos: [-0.04 + k * 0.08, -0.52, (k % 2 ? 0.04 : -0.04)] });
  },
};

// --- specials ----------------------------------------------------------------------

type SpecialFn = (s: GearSockets, m: Mats) => { orbiter?: Object3D; phoenix?: Object3D } | void;

function orbiter(s: GearSockets): Object3D {
  return s.orbiter();
}

const SPECIAL: Partial<Record<ArtKey, SpecialFn>> = {
  feather: (s, m) => {
    const b = s.bone(s.head, -0.08, s.headY + s.headR * 0.85, 0.12);
    for (let k = 0; k < 3; k++) {
      part(b, cone(0.05 - k * 0.01, 0.42 - k * 0.08, 6), { color: k === 0 ? m.tint : 0xffc04a, glow: 1.8 - k * 0.3 }, { pos: [-0.06 - k * 0.03, 0.18 - k * 0.02, k * 0.03], rot: [0.2 * k, 0, 0.7 + k * 0.25], scale: [1, 1, 0.4] });
    }
    return { phoenix: b };
  },
  fang: (s, m) => {
    part(s.chest, torus(0.13, 0.008, Math.PI * 2, 4, 18), lineless(m.wrap), { pos: [0.03, 0.44, 0], rot: [Math.PI / 2, 0.45, 0] });
    part(s.chest, cone(0.04, 0.18, 6), m.bone, { pos: [0.25, 0.27, 0.0], rot: [0, 0, Math.PI - 0.15] });
    part(s.chest, sphere(0.03, 8, 6), m.glow, { pos: [0.25, 0.37, 0.0] });
  },
  core: (s, m) => {
    const c = group(s.hips, [0.04, -0.02, -0.27], [0, 0, 0], 1.4);
    part(c, octa(0.06), m.glow, { scale: [0.8, 1.3, 0.8] });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      part(c, bent('coreRib', [[0, -0.1], [0.075, 0], [0, 0.1]], 0.008, 0.008), m.main, { rot: [0, a, 0] });
    }
    part(c, cyl(0.03, 0.03, 0.02, 8), m.main, { pos: [0, 0.105, 0] });
    part(c, cyl(0.03, 0.03, 0.02, 8), m.main, { pos: [0, -0.105, 0] });
  },
  relic_orb: (s, m) => {
    const ob = orbiter(s);
    part(ob, sphere(0.08, 12, 10), m.glow, {});
    part(ob, torus(0.12, 0.012, Math.PI * 2, 4, 16), { color: m.tint, glow: 1.6 }, { rot: [1.1, 0.4, 0] });
    part(ob, torus(0.14, 0.01, Math.PI * 2, 4, 16), { color: m.tint, glow: 1.2 }, { rot: [-0.6, 0.9, 0] });
    return { orbiter: ob };
  },
  sigil: (s, m) => {
    const ob = orbiter(s);
    part(ob, cyl(0.13, 0.13, 0.025, 6), m.main, { rot: [Math.PI / 2, 0, 0] });
    part(ob, cyl(0.1, 0.1, 0.03, 6), m.glow, { rot: [Math.PI / 2, 0, Math.PI / 6] });
    part(ob, torus(0.17, 0.01, Math.PI * 2, 4, 18), m.gem, {});
    return { orbiter: ob };
  },
  holy_relic: (s, m) => {
    const ob = orbiter(s);
    part(ob, rbox(0.04, 0.26, 0.03, 0.01), m.main, {});
    part(ob, rbox(0.17, 0.04, 0.03, 0.01), m.main, { pos: [0, 0.05, 0] });
    part(ob, octa(0.035), m.glow, { pos: [0, 0.05, 0.02] });
    part(ob, torus(0.15, 0.012, Math.PI * 2, 4, 20), { color: m.tint, glow: 2 }, { pos: [0, 0.05, -0.02] });
    return { orbiter: ob };
  },
  spectral_sword: (s, m) => {
    const ob = orbiter(s);
    const sw = group(ob, [0, -0.3, 0], [0, 0, 0], 0.6);
    part(sw, blade(0.92, 0.12, 0.024, 0, 0.16), { color: m.tint, glow: 1.6 }, { pos: [0, 0.165, 0] });
    part(sw, rbox(0.34, 0.055, 0.07, 0.024), { color: m.tint, glow: 2.4 }, { pos: [0, 0.14, 0] });
    part(sw, cyl(0.03, 0.03, 0.2, 6), { color: m.tint, glow: 1.2 }, { pos: [0, 0.02, 0] });
    return { orbiter: ob };
  },
  heart: (s, m) => {
    const ob = orbiter(s);
    part(ob, ico(0.1, 0), m.main, {});
    part(ob, ico(0.06, 0), m.glow, {});
    for (let k = 0; k < 3; k++) part(ob, octa(0.03), m.main, { pos: [Math.cos(k * 2.1) * 0.15, Math.sin(k * 2.1) * 0.12, 0.04] });
    return { orbiter: ob };
  },
};
