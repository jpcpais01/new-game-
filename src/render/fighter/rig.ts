import {
  Bone, BoxGeometry, BufferGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group,
  IcosahedronGeometry, LatheGeometry, Mesh, MeshBasicMaterial, Object3D, OctahedronGeometry, Shape, Skeleton,
  SkinnedMesh, SphereGeometry, TorusGeometry, Vector2, type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CLASSES } from '../../sim/classes';
import { ITEMS } from '../../sim/items';
import type { ClassId, ItemId } from '../../sim/types';
import {
  createFighterUniforms, fighterMaterial, glowVertexMaterial, outlineMaterial, type FighterUniforms,
} from '../materials';
import { MeshBuilder, type PartSpec } from '../meshBuilder';
import { J, JOINT_COUNT } from './poses';

// -----------------------------------------------------------------------------
// Cached authoring geometry
// -----------------------------------------------------------------------------

const geoCache = new Map<string, BufferGeometry>();
function geo<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g as T;
}
const capsule = (r: number, len: number) => geo(`cap${r}:${len}`, () => new CapsuleGeometry(r, len, 4, 12));
const sphere = (r: number, w = 16, h = 12) => geo(`sph${r}:${w}:${h}`, () => new SphereGeometry(r, w, h));
const halfSphere = (r: number) => geo(`hsph${r}`, () => new SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
const box = (x: number, y: number, z: number) => geo(`box${x}:${y}:${z}`, () => new BoxGeometry(x, y, z));
const rbox = (x: number, y: number, z: number, r = 0.02) => geo(`rbox${x}:${y}:${z}:${r}`, () => new RoundedBoxGeometry(x, y, z, 2, Math.min(r, x / 2.01, y / 2.01, z / 2.01)));
const cyl = (rt: number, rb: number, h: number, s = 14, open = false) =>
  geo(`cyl${rt}:${rb}:${h}:${s}:${open}`, () => new CylinderGeometry(rt, rb, h, s, 1, open));
const cone = (r: number, h: number, s = 12) => geo(`cone${r}:${h}:${s}`, () => new ConeGeometry(r, h, s));
const torus = (r: number, t: number, arc = Math.PI * 2, rs = 8, ts = 22) => geo(`tor${r}:${t}:${arc}:${rs}:${ts}`, () => new TorusGeometry(r, t, rs, ts, arc));
const ico = (r: number, d = 0) => geo(`ico${r}:${d}`, () => new IcosahedronGeometry(r, d));
const octa = (r: number) => geo(`oct${r}`, () => new OctahedronGeometry(r, 0));

/** Revolved profile: points are [radius, y]. */
function lathe(key: string, pts: [number, number][], seg = 18): LatheGeometry {
  return geo(`lathe${key}`, () => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg));
}

/** Tapered limb segment hanging down from its joint (length along -Y). */
const limb = (r0: number, r1: number, len: number) => geo(`limb${r0}:${r1}:${len}`, () => {
  const g = new CylinderGeometry(r1, r0, len, 14, 1, false);
  g.translate(0, -len / 2, 0);
  return g;
});

/** Blade along +Y, broad side in X, optionally curved towards +X. */
function blade(len: number, width: number, thick: number, curve = 0, tip = 0.18): BufferGeometry {
  return geo(`blade${len}:${width}:${thick}:${curve}:${tip}`, () => {
    const s = new Shape();
    const tipLen = len * tip;
    s.moveTo(-width / 2, 0);
    s.lineTo(width / 2, 0);
    s.lineTo(width / 2, len - tipLen);
    s.lineTo(width * 0.1, len);
    s.lineTo(-width / 2, len - tipLen * 0.4);
    s.lineTo(-width / 2, 0);
    const g = new ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: Math.min(width * 0.18, 0.012), bevelSegments: 1, steps: 1, curveSegments: 1 });
    g.translate(0, 0, -thick / 2);
    if (curve) {
      // Subdivide-free bend: offset x by a quadratic of height.
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / len;
        p.setX(i, p.getX(i) + curve * y * y);
      }
      g.computeVertexNormals();
    }
    return g;
  });
}

/** Heater shield outline extruded with a bevel. Face points -Z. */
const heater = () => geo('heater', () => {
  const s = new Shape();
  s.moveTo(-0.3, 0.36);
  s.lineTo(0.3, 0.36);
  s.quadraticCurveTo(0.32, -0.08, 0, -0.44);
  s.quadraticCurveTo(-0.32, -0.08, -0.3, 0.36);
  const g = new ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 8 });
  g.rotateY(Math.PI);
  return g;
});
const heaterInner = () => geo('heaterIn', () => {
  const s = new Shape();
  s.moveTo(-0.22, 0.28);
  s.lineTo(0.22, 0.28);
  s.quadraticCurveTo(0.24, -0.06, 0, -0.33);
  s.quadraticCurveTo(-0.24, -0.06, -0.22, 0.28);
  const g = new ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false, curveSegments: 8 });
  g.rotateY(Math.PI);
  return g;
});

/** Flat star (sun emblem / charms), facing +Z, extruded thinly. */
const star = (points: number, r0: number, r1: number, depth = 0.02) => geo(`star${points}:${r0}:${r1}:${depth}`, () => {
  const s = new Shape();
  for (let i = 0; i <= points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r0;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false });
});

// -----------------------------------------------------------------------------
// Authoring helpers
// -----------------------------------------------------------------------------

const AUTHOR_MAT = new MeshBasicMaterial();

type Spec = PartSpec | number;
interface PartOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
}

function part(parent: Object3D, g: BufferGeometry, spec: Spec, o: PartOpts = {}): Mesh {
  const mesh = new Mesh(g, AUTHOR_MAT);
  mesh.userData.spec = typeof spec === 'number' ? { color: spec } : spec;
  if (o.pos) mesh.position.set(...o.pos);
  if (o.rot) mesh.rotation.set(...o.rot);
  if (o.scale !== undefined) {
    if (typeof o.scale === 'number') mesh.scale.setScalar(o.scale);
    else mesh.scale.set(...o.scale);
  }
  parent.add(mesh);
  return mesh;
}

function group(parent: Object3D, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): Group {
  const g = new Group();
  g.position.set(...pos);
  g.rotation.set(...rot);
  parent.add(g);
  return g;
}

const lineless = (color: number, extra: Partial<PartSpec> = {}): PartSpec => ({ color, outline: false, ...extra });
const metal = (color: number, gloss = 0.8): PartSpec => ({ color, gloss });
const glowS = (color: number, glow = 2.2): PartSpec => ({ color, glow });

// -----------------------------------------------------------------------------
// Rig
// -----------------------------------------------------------------------------

export interface Rig {
  root: Group;
  /** Child of root that holds the body; used for KO falls and scale. */
  body: Group;
  joints: Bone[];
  weaponBase: Object3D;
  weaponTip: Object3D;
  headTop: Object3D;
  /** Swaying cloth bones (cape, scarf, hair) animated by the view. */
  cloth: Bone[];
  /** Bones of item relics that orbit the fighter. */
  orbiters: { item: ItemId; bone: Bone }[];
  /** Bone of the phoenix feather (collapsed once the revive is spent). */
  phoenix: Bone | null;
  uniforms: FighterUniforms;
  materials: Material[];
  /** Material of the enchant-tinted glow (weapon edge). */
  enchantMaterial: MeshBasicMaterial | null;
  meshes: SkinnedMesh[];
}

interface Palette {
  skin: number;
  main: number;
  trim: number;
  dark: number;
  boots: number;
  pants: number;
  hair: number;
  cloth: number;
}

const PALETTES: Record<ClassId, Palette> = {
  vanguard: { skin: 0xf2c4a0, main: 0xc4cee2, trim: 0xf3c24f, dark: 0x1e2a5c, boots: 0x3b4466, pants: 0x2b3a7a, hair: 0x8a5a2b, cloth: 0x2f5be0 },
  ronin: { skin: 0xf0c49c, main: 0xf2ecdf, trim: 0xd6283c, dark: 0x1b1a26, boots: 0x2b2633, pants: 0x2c2d4c, hair: 0x15121c, cloth: 0xd6283c },
  arcanist: { skin: 0xe8c4b2, main: 0x6c3ad6, trim: 0x6ff3ff, dark: 0x22184f, boots: 0x2e2360, pants: 0x2e2360, hair: 0xe9ecff, cloth: 0x3d2596 },
  brute: { skin: 0xc98a5c, main: 0x6b4428, trim: 0xff8a2a, dark: 0x3a2618, boots: 0x3d2a1e, pants: 0x4c3322, hair: 0xd8642a, cloth: 0x8a3a22 },
};

interface Ctx {
  pal: Palette;
  bones: Bone[];
}

function bone(ctx: Ctx, parent: Object3D, x: number, y: number, z: number): Bone {
  const b = new Bone();
  b.position.set(x, y, z);
  parent.add(b);
  ctx.bones.push(b);
  return b;
}

/** Stylised face on the +X side of a head of radius r centred at cy. */
function face(head: Object3D, cy: number, r: number, o: { eye?: number; glowEyes?: number; brows?: number; scar?: boolean; mouth?: boolean } = {}): void {
  const ex = r * 0.86, ey = cy + r * 0.12, ez = r * 0.36;
  for (const s of [-1, 1]) {
    if (o.glowEyes) {
      part(head, sphere(0.034, 10, 8), glowS(o.glowEyes, 2.6), { pos: [ex + 0.01, ey, s * ez], scale: [0.5, 1.15, 0.9] });
    } else {
      part(head, sphere(0.046, 12, 10), lineless(0xfbf8f2), { pos: [ex, ey, s * ez], scale: [0.45, 1.2, 0.95] });
      part(head, sphere(0.027, 10, 8), lineless(o.eye ?? 0x1c1a2a), { pos: [ex + 0.017, ey - 0.004, s * ez * 0.94], scale: [0.5, 1.25, 0.9] });
      part(head, sphere(0.008, 6, 4), lineless(0xffffff, { glow: 1.2 }), { pos: [ex + 0.03, ey + 0.016, s * ez * 0.9] });
    }
    if (o.brows !== undefined) {
      part(head, rbox(0.022, 0.026, 0.085, 0.01), lineless(o.brows), { pos: [ex - 0.005, ey + 0.068, s * ez], rot: [-s * 0.38, 0, 0] });
    }
  }
  // Nose and mouth.
  if (o.mouth !== false) part(head, rbox(0.012, 0.012, 0.07, 0.005), lineless(0x6a2f2a), { pos: [r * 0.93, cy - r * 0.42, 0] });
  if (o.scar) part(head, rbox(0.01, 0.11, 0.018, 0.005), lineless(0xb5645a), { pos: [ex + 0.012, ey - 0.01, -ez], rot: [0.35, 0, 0] });
}

/**
 * Builds a stylised, chunky humanoid out of primitives, then bakes every part
 * into three skinned meshes (lit body, coloured outline, emissive glow) that
 * share one skeleton: a fully geared fighter costs ~4 draw calls. Forward is
 * +X, up is +Y, the fighter's right side is +Z.
 */
export function buildRig(classId: ClassId, items: ItemId[] = []): Rig {
  const u = createFighterUniforms(CLASSES[classId].accent);
  const pal = PALETTES[classId];
  const ctx: Ctx = { pal, bones: [] };
  const root = new Group();
  const body = new Group();
  root.add(body);
  const big = classId === 'brute';
  if (big) body.scale.setScalar(1.12);

  // Skeleton (indices match the J table).
  const joints: Bone[] = new Array(JOINT_COUNT);
  const reg = (i: number, b: Bone) => { joints[i] = b; return b; };
  const hips = reg(J.HIPS, bone(ctx, body, 0, 0.98, 0));
  const spine = reg(J.SPINE, bone(ctx, hips, 0, 0.1, 0));
  const chest = reg(J.CHEST, bone(ctx, spine, 0, 0.24, 0));
  const head = reg(J.HEAD, bone(ctx, chest, 0.02, 0.44, 0));
  const shoulderW = big ? 0.37 : 0.3;
  const uarmL = reg(J.UARM_L, bone(ctx, chest, 0, 0.34, -shoulderW));
  const farmL = reg(J.FARM_L, bone(ctx, uarmL, 0, -0.31, 0));
  const uarmR = reg(J.UARM_R, bone(ctx, chest, 0, 0.34, shoulderW));
  const farmR = reg(J.FARM_R, bone(ctx, uarmR, 0, -0.31, 0));
  const thighL = reg(J.THIGH_L, bone(ctx, hips, 0, -0.06, -0.13));
  const shinL = reg(J.SHIN_L, bone(ctx, thighL, 0, -0.42, 0));
  const thighR = reg(J.THIGH_R, bone(ctx, hips, 0, -0.06, 0.13));
  const shinR = reg(J.SHIN_R, bone(ctx, thighR, 0, -0.42, 0));
  const handR = reg(J.WEAPON, bone(ctx, farmR, 0, -0.3, 0));
  const handL = reg(J.OFFHAND, bone(ctx, farmL, 0, -0.3, 0));
  // Keep the J order in the bone list: rebuild it with joints first.
  ctx.bones.length = 0;
  ctx.bones.push(...joints);

  const cloth: Bone[] = [];
  const headTop = new Object3D();
  headTop.position.set(0, 0.55, 0);
  head.add(headTop);
  const weaponBase = new Object3D();
  const weaponTip = new Object3D();
  const weapon = group(handR, [0, -0.02, 0], [0, 0, -Math.PI / 2]);
  weapon.add(weaponBase, weaponTip);

  // --- Base anatomy ----------------------------------------------------------
  const P = pal;
  const headR = big ? 0.19 : 0.215;
  const headY = 0.18;
  const armR = big ? 0.1 : 0.072;
  const handS = big ? 1.35 : 1.12;

  // Pelvis, belly, torso.
  part(hips, sphere(0.2), P.pants, { scale: [0.85, 0.72, 1.18] });
  part(spine, capsule(0.17, 0.12), classId === 'brute' ? P.skin : P.main, { pos: [0, 0.08, 0], scale: [0.88, 1, 1.12] });
  const torsoProfile: [number, number][] = big
    ? [[0.001, -0.08], [0.2, -0.06], [0.27, 0.06], [0.33, 0.22], [0.35, 0.34], [0.28, 0.44], [0.12, 0.5], [0.001, 0.5]]
    : [[0.001, -0.06], [0.17, -0.04], [0.21, 0.08], [0.25, 0.24], [0.26, 0.33], [0.2, 0.42], [0.09, 0.46], [0.001, 0.46]];
  part(chest, lathe(classId + 'torso', torsoProfile), classId === 'brute' ? P.skin : P.main, { pos: [0, 0, 0], scale: [0.78, 1, big ? 1.12 : 1.08] });
  part(chest, cyl(big ? 0.1 : 0.075, big ? 0.12 : 0.085, 0.12), P.skin, { pos: [0.01, 0.48, 0] }); // neck

  // Head.
  part(head, sphere(headR, 20, 16), P.skin, { pos: [0, headY, 0], scale: [1, 1.04, 0.94] });
  part(head, sphere(headR * 0.62, 14, 10), P.skin, { pos: [headR * 0.38, headY - headR * 0.42, 0], scale: [1, 0.8, 1.15] }); // jaw
  part(head, sphere(0.034, 10, 8), P.skin, { pos: [headR * 1.0, headY - 0.01, 0], scale: [0.9, 1, 0.8] }); // nose
  for (const s of [-1, 1]) part(head, sphere(0.045, 10, 8), P.skin, { pos: [-0.01, headY, s * headR * 0.92], scale: [0.7, 1, 0.5] }); // ears

  // Arms.
  for (const [ua, fa, hand, side] of [[uarmL, farmL, handL, -1], [uarmR, farmR, handR, 1]] as const) {
    const sleeve = classId === 'brute' ? P.skin : classId === 'arcanist' ? P.main : classId === 'ronin' ? P.main : P.main;
    part(ua, sphere(armR * 1.3), sleeve, { pos: [0, -0.02, 0] }); // shoulder ball
    part(ua, limb(armR * 1.15, armR * 0.95, 0.3), sleeve, {});
    part(fa, sphere(armR * 0.95), classId === 'brute' ? P.skin : sleeve, {});
    part(fa, limb(armR * 1.0, armR * 0.78, 0.28), classId === 'arcanist' ? P.main : classId === 'vanguard' ? P.main : P.skin, {});
    // Mitten fist + thumb.
    const handCol = classId === 'vanguard' ? P.main : classId === 'brute' ? P.skin : classId === 'ronin' ? 0xe9e2d2 : P.skin;
    part(hand, rbox(0.1 * handS, 0.12 * handS, 0.1 * handS, 0.035), classId === 'vanguard' ? metal(handCol) : handCol, { pos: [0.005, -0.03, 0] });
    part(hand, capsule(0.024 * handS, 0.04 * handS), handCol, { pos: [0.05 * handS, -0.0, side * 0.035], rot: [0, 0, 0.6] });
  }

  // Legs.
  for (const [th, sh] of [[thighL, shinL], [thighR, shinR]] as const) {
    part(th, limb(big ? 0.13 : 0.105, big ? 0.1 : 0.085, 0.42), P.pants, {});
    part(sh, sphere(big ? 0.1 : 0.085), P.pants, {});
    part(sh, limb(big ? 0.1 : 0.085, big ? 0.075 : 0.065, 0.36), P.boots, {});
    part(sh, cyl(big ? 0.105 : 0.09, big ? 0.095 : 0.08, 0.16), P.boots, { pos: [0, -0.3, 0] }); // boot shaft
    part(sh, rbox(0.3, 0.11, 0.15, 0.045), P.boots, { pos: [0.07, -0.43, 0] });
    part(sh, rbox(0.1, 0.06, 0.155, 0.025), P.dark, { pos: [0.2, -0.465, 0] }); // toe cap
  }

  const shoulderLA = group(chest, [0, 0.38, -shoulderW]);
  const shoulderRA = group(chest, [0, 0.38, shoulderW]);

  // --- Class identity --------------------------------------------------------
  switch (classId) {
    case 'vanguard': {
      const steel = metal(P.main, 0.9);
      const gold = metal(P.trim, 1);
      // Breastplate over the torso, sun emblem, plated belt.
      part(chest, lathe('vgPlate', [[0.001, 0.02], [0.2, 0.04], [0.245, 0.18], [0.262, 0.31], [0.21, 0.41], [0.001, 0.43]]), steel, { scale: [0.86, 1, 1.12] });
      part(chest, torus(0.205, 0.024), gold, { pos: [0, 0.41, 0], rot: [Math.PI / 2, 0, 0], scale: [0.86, 1.12, 1] });
      part(chest, star(8, 0.05, 0.1, 0.03), glowS(0xffd36b, 1.4), { pos: [0.205, 0.22, 0], rot: [0, Math.PI / 2, 0] });
      part(chest, cyl(0.05, 0.05, 0.04, 16), gold, { pos: [0.215, 0.22, 0], rot: [0, 0, Math.PI / 2] });
      part(hips, torus(0.2, 0.04), gold, { pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], scale: [0.88, 1.18, 1] });
      // Tabard front/back flaps.
      for (const fx of [1, -1]) {
        const flap = bone(ctx, hips, fx * 0.15, 0.04, 0);
        cloth.push(flap);
        part(flap, rbox(0.03, 0.5, 0.24, 0.012), P.cloth, { pos: [0, -0.25, 0] });
        part(flap, rbox(0.032, 0.05, 0.25, 0.012), gold, { pos: [0, -0.49, 0] });
        if (fx > 0) part(flap, star(4, 0.02, 0.06, 0.01), lineless(P.trim), { pos: [0.02, -0.22, 0], rot: [0, Math.PI / 2, 0] });
      }
      // Helmet: rounded sallet with gold brow band, nose guard and a tall crest.
      part(head, sphere(headR * 1.1, 20, 14), steel, { pos: [-0.01, headY + 0.03, 0], scale: [1.02, 0.94, 0.98] });
      part(head, torus(headR * 1.08, 0.022), gold, { pos: [-0.01, headY + 0.02, 0], rot: [Math.PI / 2, 0, 0], scale: [1.02, 0.98, 1] });
      part(head, rbox(0.03, 0.12, 0.035, 0.012), gold, { pos: [headR * 1.08, headY - 0.02, 0] });
      for (const s of [-1, 1]) {
        // Cheek guards and little gold wings.
        part(head, rbox(0.12, 0.13, 0.03, 0.014), steel, { pos: [0.05, headY - 0.08, s * headR * 0.98] });
        const wing = group(head, [-0.04, headY + 0.08, s * headR * 1.02], [s * -0.2, 0, 0.5]);
        for (let k = 0; k < 3; k++) part(wing, rbox(0.04, 0.16 - k * 0.035, 0.016, 0.008), gold, { pos: [-k * 0.04, 0.07 - k * 0.01, 0], rot: [0, 0, 0.25 * k] });
      }
      // Crest: a fan of blue plume segments (also a cloth bone so it bobs).
      const crest = bone(ctx, head, -0.02, headY + headR * 0.98, 0);
      cloth.push(crest);
      for (let k = 0; k < 6; k++) {
        const a = -0.9 + k * 0.32;
        part(crest, capsule(0.035, 0.16 + Math.sin((k / 5) * Math.PI) * 0.06), k % 2 ? 0x2f5be0 : 0x3f7bff, { pos: [Math.sin(a) * 0.12 - 0.04, Math.cos(a) * 0.1 + 0.04, 0], rot: [0, 0, -a * 1.1], scale: [1, 1, 0.7] });
      }
      face(head, headY, headR, { eye: 0x2a3f8a, brows: P.hair, mouth: true });
      // Layered pauldrons.
      for (const sa of [shoulderLA, shoulderRA]) {
        part(sa, halfSphere(0.17), steel, { scale: [1.15, 0.85, 1.05] });
        part(sa, halfSphere(0.15), steel, { pos: [0, -0.07, 0], scale: [1.2, 0.8, 1.15] });
        part(sa, torus(0.165, 0.018), gold, { pos: [0, 0.0, 0], rot: [Math.PI / 2, 0, 0], scale: [1.15, 1.05, 1] });
      }
      // Gauntlet cuffs and knee guards.
      for (const fa of [farmL, farmR]) part(fa, cyl(0.09, 0.075, 0.1), gold, { pos: [0, -0.22, 0] });
      for (const sh of [shinL, shinR]) {
        part(sh, sphere(0.095), steel, { pos: [0.04, 0, 0], scale: [0.9, 1, 1] });
        part(sh, cyl(0.1, 0.09, 0.04), gold, { pos: [0, -0.22, 0] });
      }
      // Cape with a gold hem.
      const cape = bone(ctx, chest, -0.2, 0.4, 0);
      cloth.push(cape);
      part(cape, rbox(0.04, 1.05, 0.56, 0.018), P.cloth, { pos: [-0.02, -0.52, 0] });
      part(cape, rbox(0.042, 0.06, 0.58, 0.02), gold, { pos: [-0.02, -1.03, 0] });
      part(cape, rbox(0.035, 1.0, 0.5, 0.018), 0x1d3a9e, { pos: [0.005, -0.5, 0], scale: [1, 1, 1] });
      // Longsword: gem pommel, wide gold crossguard, blade with a glowing fuller.
      part(weapon, sphere(0.045, 12, 10), gold, { pos: [0, -0.08, 0] });
      part(weapon, cyl(0.028, 0.03, 0.2, 10), 0x4a2f1f, { pos: [0, 0.02, 0] });
      part(weapon, rbox(0.34, 0.06, 0.07, 0.025), gold, { pos: [0, 0.14, 0] });
      part(weapon, octa(0.04), glowS(0x6fc8ff, 2), { pos: [0, 0.14, 0.04] });
      part(weapon, blade(0.95, 0.13, 0.025, 0, 0.16), metal(0xeef3fb, 1), { pos: [0, 0.17, 0] });
      part(weapon, box(0.03, 0.78, 0.034), { color: 0xffffff, glow: 0.9, enchant: true }, { pos: [0, 0.56, 0] });
      weaponBase.position.set(0, 0.2, 0);
      weaponTip.position.set(0, 1.12, 0);
      // Heater shield on the left forearm, sun emblem on the face.
      const shield = group(farmL, [0, -0.15, -0.12], [0, 0, 0.08]);
      part(shield, heater(), steel, {});
      part(shield, heaterInner(), P.cloth, { pos: [0, 0, -0.08] });
      part(shield, star(12, 0.07, 0.15, 0.02), metal(P.trim, 1), { pos: [0, 0.02, -0.105], rot: [0, Math.PI, 0] });
      part(shield, sphere(0.05, 12, 10), glowS(0xffe08a, 1.6), { pos: [0, 0.02, -0.11], scale: [1, 1, 0.5] });
      break;
    }
    case 'ronin': {
      // Gi with crossed dark lapels and a red sash.
      part(chest, rbox(0.03, 0.4, 0.07, 0.01), P.dark, { pos: [0.205, 0.2, 0.05], rot: [0.55, 0, 0] });
      part(chest, rbox(0.03, 0.4, 0.07, 0.01), P.dark, { pos: [0.2, 0.2, -0.05], rot: [-0.55, 0, 0] });
      part(hips, torus(0.2, 0.055), P.trim, { pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], scale: [0.9, 1.15, 1] });
      part(hips, rbox(0.06, 0.08, 0.1, 0.02), P.trim, { pos: [0.18, 0.06, -0.08] }); // knot
      // Hakama: wide pleated legs.
      for (const th of [thighL, thighR]) {
        part(th, lathe('hakama', [[0.001, 0.02], [0.13, 0.0], [0.16, -0.2], [0.2, -0.42], [0.21, -0.5], [0.001, -0.5]], 12), P.pants, {});
      }
      part(hips, cyl(0.2, 0.25, 0.22, 14), P.pants, { pos: [0, -0.08, 0], scale: [0.9, 1, 1.05] });
      // Wide sleeves flare at the forearm.
      for (const fa of [farmL, farmR]) {
        part(fa, lathe('sleeve', [[0.08, 0.04], [0.1, -0.06], [0.115, -0.15], [0.1, -0.17], [0.065, -0.1]], 14), P.main, {});
        part(fa, cyl(0.06, 0.055, 0.1, 10), 0xe9e2d2, { pos: [0, -0.22, 0] }); // wraps
      }
      // Hair, topknot and flowing ponytail.
      part(head, sphere(headR * 1.04, 18, 12), P.hair, { pos: [-0.03, headY + 0.03, 0], scale: [1, 0.96, 1] });
      for (let k = 0; k < 4; k++) {
        part(head, cone(0.06, 0.16, 6), P.hair, { pos: [0.1 + k * 0.01, headY + 0.17 - k * 0.04, (k - 1.5) * 0.08], rot: [((k - 1.5) * 0.4), 0, -1.9] }); // bangs
      }
      const tail = bone(ctx, head, -0.15, headY + 0.14, 0);
      cloth.push(tail);
      part(tail, sphere(0.06, 10, 8), P.trim, {});
      part(tail, cone(0.07, 0.34, 8), P.hair, { pos: [-0.12, -0.12, 0], rot: [0, 0, 2.3] });
      face(head, headY, headR, { brows: P.hair, scar: true });
      // Kasa: wide straw cone with a red band.
      const hat = group(head, [0.0, headY + headR * 0.8, 0], [0, 0, 0.1]);
      part(hat, lathe('kasa', [[0.001, 0.18], [0.07, 0.16], [0.3, 0.05], [0.52, -0.04], [0.54, -0.06], [0.001, -0.02]], 22), 0xd9b26a, {});
      part(hat, torus(0.17, 0.018, Math.PI * 2, 6, 20), P.trim, { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 1] });
      // Long red scarf: knot at the neck, two trailing tails (cloth bones).
      part(chest, torus(0.11, 0.045), P.trim, { pos: [0.01, 0.46, 0], rot: [Math.PI / 2, 0, 0] });
      for (let k = 0; k < 2; k++) {
        const sc = bone(ctx, chest, -0.1, 0.44, (k - 0.5) * 0.06);
        cloth.push(sc);
        part(sc, rbox(0.62 - k * 0.14, 0.05, 0.12, 0.02), P.trim, { pos: [-(0.31 - k * 0.07), -0.02 - k * 0.04, 0], rot: [0, 0, -0.18 - k * 0.12] });
      }
      // Katana: curved blade, gold habaki, round tsuba, wrapped hilt.
      part(weapon, cyl(0.026, 0.026, 0.26, 8), 0x7a1824, { pos: [0, 0.0, 0] });
      for (let k = 0; k < 4; k++) part(weapon, torus(0.028, 0.008, Math.PI * 2, 4, 8), lineless(0x1a1420), { pos: [0, -0.09 + k * 0.06, 0], rot: [Math.PI / 2, 0, 0] });
      part(weapon, cyl(0.08, 0.08, 0.02, 16), metal(0x2a2430, 0.6), { pos: [0, 0.14, 0] });
      part(weapon, cyl(0.03, 0.03, 0.05, 8), metal(0xd9b04a, 1), { pos: [0, 0.17, 0] });
      part(weapon, blade(1.0, 0.07, 0.02, 0.09, 0.12), metal(0xf2f5fa, 1), { pos: [0, 0.18, 0] });
      part(weapon, box(0.016, 0.82, 0.026), { color: 0xffe8e8, glow: 0.8, enchant: true }, { pos: [0.032, 0.6, 0], rot: [0, 0, -0.05] });
      weaponBase.position.set(0, 0.2, 0);
      weaponTip.position.set(0.09, 1.16, 0);
      // Saya on the hip.
      part(hips, rbox(0.06, 0.8, 0.07, 0.025), metal(0x2a1a20, 0.5), { pos: [0.02, -0.05, -0.25], rot: [0, 0, 1.25] });
      part(hips, cyl(0.04, 0.04, 0.05, 8), metal(0xd9b04a), { pos: [0.33, 0.06, -0.25], rot: [0, 0, 1.25] });
      break;
    }
    case 'arcanist': {
      const gold = metal(0xf0c060, 1);
      // Layered robe skirt with a glowing hem, high collar mantle.
      part(hips, lathe('robe', [[0.001, 0.12], [0.2, 0.12], [0.26, -0.1], [0.36, -0.5], [0.46, -0.84], [0.001, -0.84]], 20), P.main, {});
      part(hips, lathe('robeIn', [[0.001, 0.0], [0.24, -0.1], [0.4, -0.86], [0.001, -0.86]], 20), P.dark, { pos: [0.02, 0, 0], scale: [1.02, 1, 0.96] });
      part(hips, torus(0.455, 0.022, Math.PI * 2, 6, 28), glowS(0x6ff3ff, 1.5), { pos: [0, -0.83, 0], rot: [Math.PI / 2, 0, 0] });
      part(hips, torus(0.21, 0.035), gold, { pos: [0, 0.09, 0], rot: [Math.PI / 2, 0, 0], scale: [0.9, 1.1, 1] });
      part(chest, rbox(0.03, 0.44, 0.09, 0.012), gold, { pos: [0.205, 0.16, 0] });
      part(chest, lathe('collar', [[0.12, 0.0], [0.22, 0.05], [0.27, 0.15], [0.25, 0.18], [0.19, 0.08], [0.12, 0.03]], 18), P.dark, { pos: [-0.04, 0.36, 0], scale: [0.85, 1, 1.05] });
      part(chest, torus(0.25, 0.016), gold, { pos: [-0.04, 0.53, 0], rot: [Math.PI / 2, 0, 0], scale: [0.85, 1.05, 1] });
      // Wide sleeves.
      for (const fa of [farmL, farmR]) {
        part(fa, lathe('asleeve', [[0.08, 0.04], [0.13, -0.08], [0.17, -0.2], [0.15, -0.22], [0.08, -0.12]], 14), P.main, {});
        part(fa, torus(0.16, 0.014), glowS(0x6ff3ff, 1.4), { pos: [0, -0.21, 0], rot: [Math.PI / 2, 0, 0] });
      }
      // Silver hair flowing out under the hat, glowing eyes.
      part(head, sphere(headR * 1.03, 18, 12), P.hair, { pos: [-0.04, headY + 0.02, 0], scale: [1, 1, 1.02] });
      const hairTail = bone(ctx, head, -0.16, headY - 0.02, 0);
      cloth.push(hairTail);
      part(hairTail, capsule(0.09, 0.3), P.hair, { pos: [-0.04, -0.16, 0], rot: [0, 0, 0.25], scale: [0.7, 1, 1.4] });
      face(head, headY, headR, { glowEyes: 0x6ff3ff, brows: 0xc8ccec, mouth: false });
      // Wizard hat: wide brim, gold band with gem, tall bent cone with a star charm.
      part(head, cyl(0.46, 0.48, 0.035, 26), P.main, { pos: [0, headY + 0.13, 0], rot: [0, 0, 0.06] });
      part(head, cyl(0.25, 0.27, 0.08, 18), gold, { pos: [0, headY + 0.18, 0] });
      part(head, octa(0.045), glowS(0x6ff3ff, 2.4), { pos: [0.26, headY + 0.18, 0] });
      const tip = bone(ctx, head, 0, headY + 0.2, 0);
      tip.rotation.z = 0.0;
      part(tip, lathe('hatA', [[0.25, 0], [0.19, 0.22], [0.13, 0.42], [0.001, 0.46]], 16), P.main, { rot: [0, 0, 0.18] });
      const tip2 = bone(ctx, tip, -0.1, 0.4, 0);
      cloth.push(tip2);
      part(tip2, cone(0.09, 0.32, 12), P.main, { pos: [-0.1, 0.1, 0], rot: [0, 0, 0.9] });
      part(tip2, star(5, 0.03, 0.07, 0.02), glowS(0xffe68a, 2.2), { pos: [-0.25, 0.12, 0] });
      // Spellbook at the hip.
      part(hips, rbox(0.2, 0.24, 0.07, 0.02), 0x6a2a1a, { pos: [0.0, -0.04, 0.24], rot: [0, 0, 0.1] });
      part(hips, rbox(0.17, 0.21, 0.075, 0.01), lineless(0xf1e6c8), { pos: [0.02, -0.04, 0.24], rot: [0, 0, 0.1] });
      // Gnarled staff with a crescent holding a floating crystal.
      const staff = group(handR, [0, -0.02, 0], [0, 0, -Math.PI / 2 + 0.2]);
      part(staff, cyl(0.032, 0.042, 1.75, 8), 0x5b3a22, { pos: [0, 0.25, 0] });
      for (let k = 0; k < 3; k++) part(staff, torus(0.04, 0.012, Math.PI * 2, 5, 10), gold, { pos: [0, 0.6 + k * 0.32, 0], rot: [Math.PI / 2, 0, 0] });
      part(staff, torus(0.15, 0.03, Math.PI * 1.35, 8, 18), gold, { pos: [0, 1.2, 0], rot: [0, 0, -0.65 - Math.PI / 2] });
      part(staff, octa(0.11), glowS(0x9ff8ff, 3.2), { pos: [0, 1.24, 0], scale: [0.8, 1.3, 0.8] });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        part(staff, octa(0.03), glowS(0x6ff3ff, 2.4), { pos: [Math.cos(a) * 0.2, 1.24 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.2] });
      }
      staff.add(weaponBase); staff.add(weaponTip);
      weaponBase.position.set(0, 0.9, 0);
      weaponTip.position.set(0, 1.24, 0);
      weapon.visible = false;
      break;
    }
    case 'brute': {
      const iron = metal(0x7d8594, 0.7);
      const leather = 0x5a3a22;
      const fur = 0xe2d2b0;
      // Belly muscles, war paint stripes, crossed strap.
      part(chest, rbox(0.04, 0.12, 0.3, 0.02), lineless(P.trim), { pos: [0.26, 0.26, 0], rot: [0, 0, 0.1] });
      part(chest, rbox(0.1, 0.7, 0.13, 0.03), leather, { pos: [0.19, 0.2, 0], rot: [0.75, 0, 0] });
      part(chest, rbox(0.1, 0.7, 0.13, 0.03), leather, { pos: [-0.2, 0.2, 0], rot: [-0.75, 0, 0] });
      // Fur mantle: ring of fluffy lumps over the shoulders.
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        part(chest, sphere(0.13, 10, 8), fur, { pos: [Math.cos(a) * 0.22 - 0.02, 0.44 + Math.sin(a * 2) * 0.02, Math.sin(a) * 0.32], scale: [1, 0.8, 1] });
      }
      // Belt with a big skull-ish buckle, loincloth flaps.
      part(hips, torus(0.21, 0.065), leather, { pos: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0], scale: [0.95, 1.2, 1] });
      part(hips, sphere(0.08, 12, 10), metal(0xe8dcc0, 0.4), { pos: [0.22, 0.08, 0], scale: [0.6, 1, 1] });
      part(hips, sphere(0.018, 6, 4), lineless(0x2a1a10), { pos: [0.27, 0.1, 0.03] });
      part(hips, sphere(0.018, 6, 4), lineless(0x2a1a10), { pos: [0.27, 0.1, -0.03] });
      for (const fx of [1, -1]) {
        const flap = bone(ctx, hips, fx * 0.16, 0.02, 0);
        cloth.push(flap);
        part(flap, rbox(0.03, 0.42, 0.26, 0.012), P.cloth, { pos: [0, -0.2, 0] });
      }
      // Fur boot cuffs, iron knee caps.
      for (const sh of [shinL, shinR]) {
        part(sh, torus(0.1, 0.05, Math.PI * 2, 6, 12), fur, { pos: [0, -0.22, 0], rot: [Math.PI / 2, 0, 0] });
        part(sh, sphere(0.1), iron, { pos: [0.05, 0, 0], scale: [0.8, 1, 1] });
      }
      // Horned helmet, braided beard, war paint.
      part(head, sphere(headR * 1.12, 18, 12), iron, { pos: [-0.01, headY + 0.06, 0], scale: [1, 0.8, 1] });
      part(head, torus(headR * 1.1, 0.025), metal(0xc9a24a, 0.9), { pos: [-0.01, headY + 0.02, 0], rot: [Math.PI / 2, 0, 0] });
      part(head, rbox(0.03, 0.13, 0.04, 0.012), iron, { pos: [headR * 1.08, headY, 0] });
      for (const s of [-1, 1]) {
        const hj = group(head, [-0.02, headY + 0.1, s * 0.19], [s * 1.0, 0, 0]);
        part(hj, cone(0.065, 0.24, 10), 0xf3ead6, { pos: [0, 0.1, 0], rot: [0, 0, -0.35] });
        part(hj, cone(0.035, 0.16, 8), 0xf3ead6, { pos: [-0.03, 0.27, 0], rot: [0, 0, -0.9] });
        part(head, rbox(0.012, 0.03, 0.06, 0.006), lineless(P.trim), { pos: [headR * 0.95, headY - 0.06, s * 0.08] });
      }
      face(head, headY, headR, { brows: P.hair, mouth: false });
      // Beard: chunky lumps tapering into a ringed braid.
      part(head, sphere(0.14, 12, 10), P.hair, { pos: [headR * 0.55, headY - headR * 0.62, 0], scale: [0.8, 0.8, 1.2] });
      part(head, sphere(0.1, 10, 8), P.hair, { pos: [headR * 0.7, headY - headR * 1.15, 0], scale: [0.9, 1, 1] });
      part(head, cone(0.07, 0.2, 8), P.hair, { pos: [headR * 0.75, headY - headR * 1.6, 0], rot: [0, 0, Math.PI - 0.2] });
      part(head, torus(0.06, 0.018, Math.PI * 2, 5, 10), metal(0xc9a24a), { pos: [headR * 0.73, headY - headR * 1.38, 0], rot: [Math.PI / 2, 0, -0.2] });
      // Spiked pauldron on one side, bracers both arms.
      part(shoulderLA, halfSphere(0.21), iron, { scale: [1.15, 0.95, 1.1] });
      for (let k = 0; k < 3; k++) part(shoulderLA, cone(0.045, 0.2, 6), 0xf3ead6, { pos: [(k - 1) * 0.1, 0.16 - Math.abs(k - 1) * 0.04, 0], rot: [0, 0, (1 - k) * 0.5] });
      part(shoulderRA, sphere(0.15, 10, 8), fur, { scale: [1.1, 0.8, 1] });
      for (const fa of [farmL, farmR]) {
        part(fa, cyl(0.12, 0.13, 0.16, 10), leather, { pos: [0, -0.17, 0] });
        part(fa, torus(0.125, 0.015, Math.PI * 2, 4, 12), iron, { pos: [0, -0.1, 0], rot: [Math.PI / 2, 0, 0] });
        part(fa, torus(0.125, 0.015, Math.PI * 2, 4, 12), iron, { pos: [0, -0.24, 0], rot: [Math.PI / 2, 0, 0] });
      }
      // Warhammer: wrapped haft, iron head with a glowing rune band and spike.
      part(weapon, cyl(0.042, 0.048, 1.3, 8), 0x6b4a2e, { pos: [0, 0.38, 0] });
      for (let k = 0; k < 3; k++) part(weapon, cyl(0.052, 0.052, 0.06, 8), leather, { pos: [0, -0.1 + k * 0.1, 0] });
      part(weapon, rbox(0.34, 0.36, 0.56, 0.06), iron, { pos: [0, 1.02, 0] });
      part(weapon, rbox(0.38, 0.08, 0.6, 0.03), metal(0x4d5260, 0.6), { pos: [0, 0.88, 0] });
      part(weapon, rbox(0.38, 0.08, 0.6, 0.03), metal(0x4d5260, 0.6), { pos: [0, 1.16, 0] });
      part(weapon, rbox(0.345, 0.12, 0.2, 0.02), { color: 0xff8a2a, glow: 2.2, enchant: true }, { pos: [0, 1.02, 0] });
      part(weapon, cone(0.06, 0.18, 6), iron, { pos: [0, 1.28, 0] });
      weaponBase.position.set(0, 0.85, 0);
      weaponTip.position.set(0, 1.2, 0);
      break;
    }
  }

  // --- Item gear -------------------------------------------------------------
  const orbiters: { item: ItemId; bone: Bone }[] = [];
  let phoenix: Bone | null = null;
  const beltZ = [-0.12, 0, 0.12];
  let beltSlot = 0;
  const belt = () => beltZ[beltSlot++ % 3];
  for (const id of items) {
    const col = ITEMS[id].color;
    switch (id) {
      case 'thornmail':
        for (const sh of [shoulderLA, shoulderRA]) {
          part(sh, torus(0.16, 0.025, Math.PI * 2, 5, 14), 0x2f7a3a, { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0] });
          for (let k = 0; k < 4; k++) part(sh, cone(0.03, 0.16, 5), 0x58c46b, { pos: [(k - 1.5) * 0.08, 0.12, 0], rot: [(k % 2 ? 0.3 : -0.3), 0, (1.5 - k) * 0.4] });
        }
        for (const fa of [farmL, farmR]) for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          part(fa, cone(0.022, 0.1, 5), 0x58c46b, { pos: [Math.cos(a) * 0.09, -0.12, Math.sin(a) * 0.09], rot: [Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4] });
        }
        break;
      case 'swift_boots':
        for (const sh of [shinL, shinR]) for (const s of [-1, 1]) {
          const wing = group(sh, [-0.04, -0.3, s * 0.09], [s * -0.3, 0, 0.7]);
          for (let k = 0; k < 3; k++) part(wing, rbox(0.03, 0.15 - k * 0.03, 0.012, 0.006), glowS(0x5effc8, 1.6), { pos: [-k * 0.035, 0.05, 0], rot: [0, 0, 0.3 * k] });
        }
        break;
      case 'berserker_mask': {
        part(head, rbox(0.05, 0.1, 0.3, 0.03), metal(0xb01818, 0.6), { pos: [headR * 0.92, headY + 0.02, 0] });
        for (const s of [-1, 1]) {
          part(head, sphere(0.024, 8, 6), glowS(0xff3020, 3), { pos: [headR * 0.95 + 0.03, headY + 0.03, s * 0.075], scale: [0.5, 0.8, 1.2] });
          part(head, cone(0.03, 0.14, 6), 0x2a0a0a, { pos: [headR * 0.6, headY + headR * 0.95, s * 0.12], rot: [s * 0.5, 0, -0.4] });
        }
        break;
      }
      case 'iron_will':
        for (const fa of [farmL, farmR]) for (let k = 0; k < 4; k++) {
          part(fa, torus(0.035, 0.012, Math.PI * 2, 4, 10), metal(0xa0a8b8, 0.9), { pos: [0.0, -0.06 - k * 0.055, (k % 2 ? 0.07 : -0.07)], rot: [k % 2 ? 0 : Math.PI / 2, 0.6, 0] });
        }
        break;
      case 'aegis_charm':
        part(chest, torus(0.12, 0.01, Math.PI * 2, 4, 16), metal(0xc9a24a), { pos: [0.12, 0.38, 0], rot: [0, 0, 1.1] });
        part(chest, octa(0.06), glowS(0xffe27a, 2.2), { pos: [0.24, 0.3, 0], scale: [0.6, 1, 1] });
        break;
      case 'phoenix_feather': {
        phoenix = bone(ctx, head, -0.08, headY + headR * 0.8, 0.12);
        for (let k = 0; k < 3; k++) {
          part(phoenix, cone(0.05 - k * 0.01, 0.42 - k * 0.08, 6), glowS(k === 0 ? 0xff8a2e : 0xffc04a, 1.8 - k * 0.3), { pos: [-0.06 - k * 0.03, 0.18 - k * 0.02, k * 0.03], rot: [0.2 * k, 0, 0.7 + k * 0.25], scale: [1, 1, 0.4] });
        }
        break;
      }
      case 'giants_belt':
        part(hips, torus(0.215, 0.075), 0x8a5a2a, { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], scale: [0.98, 1.22, 1] });
        part(hips, rbox(0.06, 0.16, 0.2, 0.03), metal(0xd9b04a, 1), { pos: [0.24, 0.03, 0] });
        break;
      case 'venom_vial':
        part(hips, cyl(0.035, 0.045, 0.1, 10), glowS(0x8cff3a, 1.6), { pos: [0.08, -0.06, 0.22 + belt() * 0.2] });
        part(hips, cyl(0.02, 0.02, 0.04, 8), 0x5a3a22, { pos: [0.08, 0.01, 0.22] });
        break;
      case 'vampiric_fang':
        part(chest, cone(0.025, 0.1, 6), 0xf3ead6, { pos: [0.25, 0.32, 0.05], rot: [0, 0, Math.PI] });
        part(chest, sphere(0.02, 8, 6), glowS(0xff2e55, 2.4), { pos: [0.25, 0.38, 0.05] });
        break;
      case 'executioner':
        part(hips, sphere(0.05, 10, 8), 0xe8e2d6, { pos: [0.1, 0.02, -0.22] });
        part(hips, sphere(0.012, 6, 4), lineless(0x111111), { pos: [0.14, 0.03, -0.2] });
        break;
      case 'ember_brand': case 'frost_core': case 'storm_sigil':
      case 'mirror_ward': case 'echo_stone': case 'hourglass': {
        if (id === 'ember_brand') {
          part(hips, octa(0.04), glowS(col, 2.2), { pos: [0.2, 0.07, belt()] });
          break;
        }
        if (id === 'frost_core') {
          for (let k = 0; k < 3; k++) part(weapon, octa(0.035), glowS(0xbff4ff, 2), { pos: [(k - 1) * 0.04, 0.16, 0.04], scale: [0.6, 1.6, 0.6] });
          break;
        }
        // Orbiting relic.
        const ob = new Bone();
        root.add(ob);
        ctx.bones.push(ob);
        if (id === 'storm_sigil') {
          part(ob, octa(0.09), glowS(0xbfe6ff, 2.6), { scale: [0.8, 1.3, 0.8] });
          part(ob, torus(0.13, 0.012, Math.PI * 2, 4, 16), glowS(0x9fd8ff, 1.8), { rot: [Math.PI / 2, 0, 0] });
        } else if (id === 'mirror_ward') {
          part(ob, cyl(0.13, 0.13, 0.02, 6), metal(0xd8e8f0, 1), { rot: [Math.PI / 2, 0, 0] });
          part(ob, cyl(0.1, 0.1, 0.025, 6), glowS(0xaff6ff, 1.8), { rot: [Math.PI / 2, 0, 0] });
        } else if (id === 'echo_stone') {
          part(ob, sphere(0.08, 12, 10), glowS(0x6b8cff, 2.4), {});
          part(ob, torus(0.12, 0.012, Math.PI * 2, 4, 16), glowS(0xb0c4ff, 1.6), { rot: [1.1, 0.4, 0] });
          part(ob, torus(0.14, 0.01, Math.PI * 2, 4, 16), glowS(0x6b8cff, 1.2), { rot: [-0.6, 0.9, 0] });
        } else {
          part(ob, cone(0.07, 0.1, 8), glowS(0xe0c8ff, 1.8), { pos: [0, 0.05, 0], rot: [Math.PI, 0, 0] });
          part(ob, cone(0.07, 0.1, 8), glowS(0xc8a2ff, 1.8), { pos: [0, -0.05, 0] });
          part(ob, cyl(0.09, 0.09, 0.02, 10), metal(0xc9a24a), { pos: [0, 0.11, 0] });
          part(ob, cyl(0.09, 0.09, 0.02, 10), metal(0xc9a24a), { pos: [0, -0.11, 0] });
        }
        orbiters.push({ item: id, bone: ob });
        break;
      }
    }
  }

  // --- Bake into skinned meshes ----------------------------------------------
  const { meshes, materials, enchantMaterial } = bake(root, ctx.bones, u, classId);
  return {
    root, body, joints, weaponBase, weaponTip, headTop, cloth, orbiters, phoenix,
    uniforms: u, materials, enchantMaterial, meshes,
  };
}

function bake(root: Group, bones: Bone[], u: FighterUniforms, classId: ClassId): { meshes: SkinnedMesh[]; materials: Material[]; enchantMaterial: MeshBasicMaterial | null } {
  root.updateMatrixWorld(true);
  const index = new Map<Object3D, number>();
  bones.forEach((b, i) => index.set(b, i));
  const lit = new MeshBuilder(true);
  const line = new MeshBuilder(true);
  const glowB = new MeshBuilder(true);
  const ench = new MeshBuilder(true);
  const authored: Mesh[] = [];
  root.traverse((o) => { if ((o as Mesh).isMesh && o.userData.spec) authored.push(o as Mesh); });
  for (const m of authored) {
    let a: Object3D | null = m.parent;
    while (a && !index.has(a)) a = a.parent;
    const bi = a ? index.get(a)! : J.HIPS;
    const s = m.userData.spec as PartSpec;
    if (s.enchant) ench.add(m.geometry, m.matrixWorld, s.color, 0, 0, bi, s.glow ?? 1);
    else if (s.glow) glowB.add(m.geometry, m.matrixWorld, s.color, 0, 0, bi, s.glow);
    else {
      lit.add(m.geometry, m.matrixWorld, s.color, s.gloss ?? 0, 0, bi);
      if (s.outline !== false) line.add(m.geometry, m.matrixWorld, s.color, 0, 0, bi);
    }
  }
  for (const m of authored) m.removeFromParent();

  const skeleton = new Skeleton(bones);
  const meshes: SkinnedMesh[] = [];
  const materials: Material[] = [];
  const add = (b: MeshBuilder, mat: Material, shadow: boolean, order = 0) => {
    if (b.empty) return null;
    const mesh = new SkinnedMesh(b.build(), mat);
    mesh.castShadow = shadow;
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    root.add(mesh);
    mesh.bind(skeleton);
    meshes.push(mesh);
    return mesh;
  };
  const body = fighterMaterial(u);
  materials.push(body);
  add(lit, body, true);
  add(line, outlineMaterial(), false);
  const gm = glowVertexMaterial();
  materials.push(gm);
  add(glowB, gm, false);
  let enchantMaterial: MeshBasicMaterial | null = null;
  if (!ench.empty) {
    enchantMaterial = glowVertexMaterial();
    materials.push(enchantMaterial);
    add(ench, enchantMaterial, false);
  }
  void classId;
  return { meshes, materials, enchantMaterial };
}

export const gearGeo = { sphere, box, cone, torus, cyl, ico, capsule, octa, star, rbox };
