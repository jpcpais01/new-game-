import {
  BoxGeometry, BufferGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry,
  Mesh, Object3D, SphereGeometry, TorusGeometry, type Material,
} from 'three';
import { CLASSES } from '../../sim/classes';
import type { ClassId } from '../../sim/types';
import { createFighterUniforms, fighterToon, glow, outlineMaterial, type FighterUniforms } from '../materials';
import { J, JOINT_COUNT } from './poses';

// Shared, cached geometry. Fighters are rebuilt when loadouts change, so the
// geometry is reused rather than re-allocated.
const geoCache = new Map<string, BufferGeometry>();
function geo<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g as T;
}
const capsule = (r: number, len: number) => geo(`cap${r}:${len}`, () => new CapsuleGeometry(r, len, 4, 10));
const sphere = (r: number, w = 14, h = 10) => geo(`sph${r}:${w}`, () => new SphereGeometry(r, w, h));
const halfSphere = (r: number) => geo(`hsph${r}`, () => new SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2));
const box = (x: number, y: number, z: number) => geo(`box${x}:${y}:${z}`, () => new BoxGeometry(x, y, z));
const cyl = (rt: number, rb: number, h: number, s = 12, open = false) =>
  geo(`cyl${rt}:${rb}:${h}:${s}:${open}`, () => new CylinderGeometry(rt, rb, h, s, 1, open));
const cone = (r: number, h: number, s = 10) => geo(`cone${r}:${h}:${s}`, () => new ConeGeometry(r, h, s));
const torus = (r: number, t: number, arc = Math.PI * 2) => geo(`tor${r}:${t}:${arc}`, () => new TorusGeometry(r, t, 6, 18, arc));
const ico = (r: number) => geo(`ico${r}`, () => new IcosahedronGeometry(r, 0));

export interface Rig {
  root: Group;
  /** Child of root that holds the body; used for KO falls and scale. */
  body: Group;
  joints: Object3D[];
  weaponBase: Object3D;
  weaponTip: Object3D;
  /** Meshes that glow with the weapon-enchant colour. */
  weaponGlow: Mesh[];
  headTop: Object3D;
  /** Attachment points for item gear. */
  anchors: { chest: Object3D; head: Object3D; hips: Object3D; footL: Object3D; footR: Object3D; back: Object3D; shoulderL: Object3D; shoulderR: Object3D };
  /** Swaying cloth pieces (cape, scarf) animated by the view. */
  cloth: Object3D[];
  uniforms: FighterUniforms;
  materials: Material[];
}

interface Ctx {
  u: FighterUniforms;
  mats: Map<number, Material>;
  all: Material[];
}

function mat(ctx: Ctx, color: number, emissive = 0, ei = 1): Material {
  const key = color * 7 + emissive * 13 + ei;
  let m = ctx.mats.get(key);
  if (!m) {
    m = fighterToon(color, ctx.u, { emissive, emissiveIntensity: ei });
    ctx.mats.set(key, m);
    ctx.all.push(m);
  }
  return m;
}

interface PartOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
  outline?: boolean;
  shadow?: boolean;
}

function part(parent: Object3D, g: BufferGeometry, m: Material, o: PartOpts = {}): Mesh {
  const mesh = new Mesh(g, m);
  if (o.pos) mesh.position.set(...o.pos);
  if (o.rot) mesh.rotation.set(...o.rot);
  if (o.scale !== undefined) {
    if (typeof o.scale === 'number') mesh.scale.setScalar(o.scale);
    else mesh.scale.set(...o.scale);
  }
  mesh.castShadow = o.shadow ?? true;
  parent.add(mesh);
  if (o.outline ?? true) {
    const ol = new Mesh(g, outlineMaterial());
    ol.raycast = () => {};
    mesh.add(ol);
  }
  return mesh;
}

function joint(parent: Object3D, x: number, y: number, z: number): Object3D {
  const j = new Object3D();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

interface Palette {
  skin: number;
  main: number;
  trim: number;
  dark: number;
  boots: number;
  pants: number;
}

const PALETTES: Record<ClassId, Palette> = {
  vanguard: { skin: 0xf0c29c, main: 0x3a6cf0, trim: 0xffd36b, dark: 0x1c2347, boots: 0x2a2f45, pants: 0x283055 },
  ronin: { skin: 0xf1c6a0, main: 0xf3ede1, trim: 0xd8343f, dark: 0x22202c, boots: 0x2b2633, pants: 0x2f2a3d },
  arcanist: { skin: 0xe9c0a8, main: 0x7144d8, trim: 0x6ff3ff, dark: 0x2a1a55, boots: 0x3a2a66, pants: 0x3a2a66 },
  brute: { skin: 0xc98d62, main: 0x6b4428, trim: 0xff8a2a, dark: 0x3a2618, boots: 0x3d2a1e, pants: 0x4c3322 },
};

/**
 * Builds a stylised, chunky humanoid out of primitives. Forward is +X, up is
 * +Y, the fighter's right side is +Z (towards the camera when facing right).
 */
export function buildRig(classId: ClassId): Rig {
  const u = createFighterUniforms(CLASSES[classId].accent);
  const ctx: Ctx = { u, mats: new Map(), all: [] };
  const pal = PALETTES[classId];
  const root = new Group();
  const body = new Group();
  root.add(body);
  const big = classId === 'brute';
  if (big) body.scale.setScalar(1.14);

  const joints: Object3D[] = new Array(JOINT_COUNT);
  const hips = joint(body, 0, 0.98, 0); joints[J.HIPS] = hips;
  const spine = joint(hips, 0, 0.1, 0); joints[J.SPINE] = spine;
  const chest = joint(spine, 0, 0.24, 0); joints[J.CHEST] = chest;
  const head = joint(chest, 0.02, 0.44, 0); joints[J.HEAD] = head;

  const shoulderW = big ? 0.36 : 0.3;
  const uarmL = joint(chest, 0, 0.34, -shoulderW); joints[J.UARM_L] = uarmL;
  const farmL = joint(uarmL, 0, -0.31, 0); joints[J.FARM_L] = farmL;
  const handL = joint(farmL, 0, -0.3, 0); joints[J.OFFHAND] = handL;
  const uarmR = joint(chest, 0, 0.34, shoulderW); joints[J.UARM_R] = uarmR;
  const farmR = joint(uarmR, 0, -0.31, 0); joints[J.FARM_R] = farmR;
  const handR = joint(farmR, 0, -0.3, 0); joints[J.WEAPON] = handR;

  const thighL = joint(hips, 0, -0.06, -0.13); joints[J.THIGH_L] = thighL;
  const shinL = joint(thighL, 0, -0.42, 0); joints[J.SHIN_L] = shinL;
  const thighR = joint(hips, 0, -0.06, 0.13); joints[J.THIGH_R] = thighR;
  const shinR = joint(thighR, 0, -0.42, 0); joints[J.SHIN_R] = shinR;

  // --- Base body -------------------------------------------------------------
  const skin = mat(ctx, pal.skin);
  const main = mat(ctx, pal.main);
  const trim = mat(ctx, pal.trim);
  const dark = mat(ctx, pal.dark);
  const boots = mat(ctx, pal.boots);
  const pants = mat(ctx, pal.pants);

  part(hips, sphere(0.2), pants, { pos: [0, 0, 0], scale: [0.85, 0.7, 1.15] });
  part(spine, capsule(0.18, 0.1), main, { pos: [0, 0.08, 0], scale: [0.9, 1, 1.15] });
  const torso = part(chest, capsule(big ? 0.27 : 0.23, 0.2), main, { pos: [0, 0.18, 0], scale: [0.88, 1, big ? 1.35 : 1.2] });
  part(head, sphere(0.21), skin, { pos: [0, 0.17, 0] });
  // Eyes
  const eyeMat = mat(ctx, 0x15131c);
  part(head, capsule(0.022, 0.03), eyeMat, { pos: [0.19, 0.2, 0.075], outline: false, shadow: false });
  part(head, capsule(0.022, 0.03), eyeMat, { pos: [0.19, 0.2, -0.075], outline: false, shadow: false });

  const armR = big ? 0.095 : 0.075;
  for (const [ua, fa, hand] of [[uarmL, farmL, handL], [uarmR, farmR, handR]] as const) {
    part(ua, capsule(armR, 0.2), classId === 'brute' ? skin : main, { pos: [0, -0.15, 0] });
    part(fa, capsule(armR * 0.92, 0.18), classId === 'arcanist' ? main : skin, { pos: [0, -0.14, 0] });
    part(hand, sphere(armR * 1.15, 10, 8), classId === 'vanguard' ? trim : skin, { pos: [0, -0.02, 0] });
  }
  for (const [th, sh] of [[thighL, shinL], [thighR, shinR]] as const) {
    part(th, capsule(0.1, 0.24), pants, { pos: [0, -0.2, 0] });
    part(sh, capsule(0.085, 0.24), boots, { pos: [0, -0.2, 0] });
    part(sh, box(0.27, 0.1, 0.14), boots, { pos: [0.06, -0.42, 0] });
  }

  const back = joint(chest, -0.2, 0.25, 0);
  const shoulderLA = joint(chest, 0, 0.36, -shoulderW);
  const shoulderRA = joint(chest, 0, 0.36, shoulderW);
  const headTop = joint(head, 0, 0.55, 0);

  const weaponGlow: Mesh[] = [];
  const cloth: Object3D[] = [];
  const weaponBase = new Object3D();
  const weaponTip = new Object3D();

  // Weapons are built along +Y then rotated so they point forward from the fist.
  const weapon = new Group();
  weapon.rotation.z = -Math.PI / 2;
  handR.add(weapon);
  weapon.add(weaponBase);
  weapon.add(weaponTip);

  switch (classId) {
    case 'vanguard': {
      part(chest, torus(0.2, 0.035), trim, { pos: [0, 0.38, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1.2, 1] });
      part(hips, torus(0.19, 0.04), trim, { pos: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0], scale: [0.9, 1.2, 1] });
      part(chest, sphere(0.09, 8, 6), trim, { pos: [0.19, 0.2, 0], scale: [0.5, 1, 1] }); // chest emblem
      // Helmet
      part(head, sphere(0.235), main, { pos: [0, 0.2, 0], scale: [1.02, 1, 1] });
      part(head, box(0.06, 0.04, 0.3), dark, { pos: [0.21, 0.2, 0], outline: false });
      part(head, torus(0.235, 0.03), trim, { pos: [0, 0.16, 0], rot: [Math.PI / 2, 0, 0] });
      const plume = part(head, cone(0.07, 0.42, 8), mat(ctx, 0xe8343f), { pos: [-0.12, 0.48, 0], rot: [0, 0, 0.9] });
      cloth.push(plume);
      // Pauldrons
      part(shoulderLA, halfSphere(0.15), trim, { scale: [1.1, 0.9, 1] });
      part(shoulderRA, halfSphere(0.15), trim, { scale: [1.1, 0.9, 1] });
      // Cape
      const capeJ = joint(chest, -0.2, 0.36, 0);
      part(capeJ, box(0.04, 0.95, 0.5), mat(ctx, 0x1f3f9e), { pos: [0, -0.47, 0] });
      cloth.push(capeJ);
      // Sword
      part(weapon, cyl(0.03, 0.03, 0.22, 8), dark, { pos: [0, 0.0, 0] });
      part(weapon, box(0.08, 0.06, 0.32), trim, { pos: [0, 0.13, 0] });
      const blade = part(weapon, box(0.03, 0.95, 0.09), mat(ctx, 0xdfe7f5), { pos: [0, 0.62, 0] });
      weaponGlow.push(part(weapon, box(0.012, 0.9, 0.1), glow(0xbfe3ff, 0.6), { pos: [0, 0.62, 0], outline: false, shadow: false }));
      void blade;
      weaponBase.position.set(0, 0.2, 0);
      weaponTip.position.set(0, 1.1, 0);
      // Shield on the left forearm
      const shield = new Group();
      shield.position.set(0, -0.12, -0.11);
      shield.rotation.set(Math.PI / 2, 0, 0);
      farmL.add(shield);
      part(shield, cyl(0.36, 0.3, 0.06, 6), main, { scale: [1, 1, 1.25] });
      part(shield, cyl(0.29, 0.24, 0.07, 6), mat(ctx, 0x2a55c8), { pos: [0, 0.01, 0], scale: [1, 1, 1.25], outline: false });
      part(shield, cyl(0.1, 0.1, 0.08, 10), trim, { pos: [0, 0.02, 0], outline: false });
      break;
    }
    case 'ronin': {
      part(hips, torus(0.2, 0.05), trim, { pos: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0], scale: [0.9, 1.15, 1] });
      part(hips, cyl(0.22, 0.36, 0.44, 12, false), pants, { pos: [0, -0.22, 0] }); // hakama
      part(chest, box(0.04, 0.4, 0.06), dark, { pos: [0.2, 0.15, 0.05], rot: [0.6, 0, 0], outline: false }); // gi fold
      // Hair & topknot, kasa hat
      part(head, sphere(0.215), mat(ctx, 0x17131c), { pos: [-0.02, 0.21, 0], scale: [1, 0.95, 1] });
      part(head, sphere(0.07, 8, 6), mat(ctx, 0x17131c), { pos: [-0.12, 0.42, 0] });
      const hat = part(head, cone(0.52, 0.2, 18), mat(ctx, 0xd8b36a), { pos: [0, 0.42, 0], rot: [0, 0, 0.12] });
      void hat;
      part(head, torus(0.2, 0.02), trim, { pos: [0, 0.33, 0], rot: [Math.PI / 2, 0, 0], outline: false });
      // Scarf
      const scarf = joint(chest, -0.1, 0.42, 0);
      part(scarf, box(0.6, 0.06, 0.16), trim, { pos: [-0.3, 0, 0] });
      cloth.push(scarf);
      // Katana
      part(weapon, cyl(0.026, 0.026, 0.26, 8), mat(ctx, 0x8c1d26), { pos: [0, 0.0, 0] });
      part(weapon, cyl(0.07, 0.07, 0.02, 12), mat(ctx, 0xc9a24a), { pos: [0, 0.14, 0] });
      part(weapon, box(0.022, 0.98, 0.06), mat(ctx, 0xeef2f8), { pos: [0, 0.64, 0] });
      weaponGlow.push(part(weapon, box(0.01, 0.94, 0.07), glow(0xffe0e0, 0.5), { pos: [0, 0.64, 0], outline: false, shadow: false }));
      weaponBase.position.set(0, 0.2, 0);
      weaponTip.position.set(0, 1.12, 0);
      // Sheath on the hip
      part(hips, box(0.05, 0.75, 0.07), mat(ctx, 0x2a1a20), { pos: [0.05, -0.05, -0.24], rot: [0, 0, 1.25] });
      break;
    }
    case 'arcanist': {
      part(hips, cyl(0.2, 0.44, 0.82, 14), main, { pos: [0, -0.38, 0] }); // robe skirt
      part(hips, torus(0.43, 0.025), trim, { pos: [0, -0.78, 0], rot: [Math.PI / 2, 0, 0], outline: false });
      part(chest, torus(0.17, 0.045), mat(ctx, 0xf0c060), { pos: [0, 0.38, 0], rot: [Math.PI / 2, 0, 0] });
      part(chest, box(0.04, 0.42, 0.08), trim, { pos: [0.2, 0.15, 0], outline: false });
      // Hat
      part(head, cyl(0.44, 0.44, 0.03, 20), main, { pos: [0, 0.32, 0] });
      part(head, cyl(0.25, 0.26, 0.06, 16), mat(ctx, 0xf0c060), { pos: [0, 0.36, 0], outline: false });
      const tip = joint(head, 0, 0.36, 0);
      tip.rotation.z = 0.25;
      part(tip, cone(0.25, 0.42, 14), main, { pos: [0, 0.2, 0] });
      const tip2 = joint(tip, 0, 0.4, 0);
      tip2.rotation.z = 0.6;
      part(tip2, cone(0.1, 0.25, 10), main, { pos: [0, 0.1, 0] });
      cloth.push(tip2);
      // Glowing eyes
      part(head, sphere(0.03, 6, 4), glow(0x6ff3ff, 3), { pos: [0.2, 0.2, 0.075], outline: false, shadow: false });
      part(head, sphere(0.03, 6, 4), glow(0x6ff3ff, 3), { pos: [0.2, 0.2, -0.075], outline: false, shadow: false });
      // Staff (held vertically, built along +Y in the weapon group)
      const staff = new Group();
      staff.rotation.z = -Math.PI / 2 + 0.2; // along the hand's +X: upright when the forearm is level
      handR.add(staff);
      part(staff, cyl(0.035, 0.04, 1.7, 8), mat(ctx, 0x5b3a22), { pos: [0, 0.25, 0] });
      part(staff, torus(0.13, 0.03, Math.PI * 1.4), mat(ctx, 0xf0c060), { pos: [0, 1.18, 0], rot: [0, 0, -0.7] });
      const orb = part(staff, sphere(0.1), glow(0x6ff3ff, 3.2), { pos: [0, 1.2, 0], outline: false, shadow: false });
      weaponGlow.push(orb);
      staff.add(weaponBase); staff.add(weaponTip);
      weaponBase.position.set(0, 0.9, 0);
      weaponTip.position.set(0, 1.2, 0);
      weapon.visible = false;
      break;
    }
    case 'brute': {
      const leather = mat(ctx, 0x5a3a22);
      part(chest, box(0.08, 0.7, 0.12), leather, { pos: [0.17, 0.15, 0], rot: [0.75, 0, 0] }); // strap
      part(hips, torus(0.21, 0.06), leather, { pos: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0], scale: [0.95, 1.2, 1] });
      part(hips, cyl(0.07, 0.07, 0.05, 6), trim, { pos: [0.22, 0.08, 0], rot: [0, 0, Math.PI / 2] }); // buckle
      // Helmet with horns, beard
      const metal = mat(ctx, 0x8a8f9c);
      part(head, sphere(0.225), metal, { pos: [0, 0.22, 0], scale: [1, 0.85, 1] });
      for (const s of [-1, 1]) {
        const hj = joint(head, 0, 0.28, s * 0.18);
        hj.rotation.x = s * 0.9;
        part(hj, cone(0.06, 0.32, 8), mat(ctx, 0xf3ead6), { pos: [0, 0.15, 0], rot: [0, 0, -0.4] });
      }
      part(head, cone(0.15, 0.3, 8), trim, { pos: [0.13, 0.0, 0], rot: [0, 0, Math.PI - 0.25] });
      // Spiked pauldron
      part(shoulderLA, halfSphere(0.19), metal, { scale: [1.1, 1, 1] });
      part(shoulderLA, cone(0.05, 0.2, 6), mat(ctx, 0xf3ead6), { pos: [0, 0.18, 0] });
      part(shoulderLA, cone(0.05, 0.16, 6), mat(ctx, 0xf3ead6), { pos: [0.1, 0.12, 0], rot: [0, 0, -0.6] });
      // Bracers
      part(farmL, cyl(0.1, 0.11, 0.14, 8), leather, { pos: [0, -0.18, 0] });
      part(farmR, cyl(0.1, 0.11, 0.14, 8), leather, { pos: [0, -0.18, 0] });
      // Hammer
      part(weapon, cyl(0.04, 0.045, 1.25, 8), mat(ctx, 0x6b4a2e), { pos: [0, 0.38, 0] });
      part(weapon, box(0.32, 0.36, 0.5), metal, { pos: [0, 1.0, 0] });
      part(weapon, box(0.34, 0.08, 0.52), mat(ctx, 0x4d5260), { pos: [0, 0.86, 0], outline: false });
      weaponGlow.push(part(weapon, box(0.335, 0.12, 0.2), glow(0xff8a2a, 2), { pos: [0, 1.0, 0], outline: false, shadow: false }));
      weaponBase.position.set(0, 0.85, 0);
      weaponTip.position.set(0, 1.18, 0);
      break;
    }
  }
  void torso;

  return {
    root, body, joints, weaponBase, weaponTip, weaponGlow, headTop,
    anchors: { chest, head, hips, footL: shinL, footR: shinR, back, shoulderL: shoulderLA, shoulderR: shoulderRA },
    cloth, uniforms: u, materials: ctx.all,
  };
}

export const gearGeo = { sphere, box, cone, torus, cyl, ico, capsule };
