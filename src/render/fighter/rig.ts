import {
  Bone, BufferAttribute, BufferGeometry, Color, Group, Matrix3, Mesh, MeshBasicMaterial, Object3D, Skeleton,
  SkinnedMesh, Vector3, type Material,
} from 'three';
import { smoothstep } from '../../core/math';
import {
  createFighterUniforms, fighterMaterial, glowVertexMaterial, outlineMaterial, type FighterUniforms,
} from '../materials';
import type { PartSpec } from '../meshBuilder';
import { buildBody } from './body';
import { bodyForm } from './forms';
import { gearGeo } from './geo';
import type { BodyMetrics, FighterLook, PartOpts, RigBuildApi, Sockets } from './look';
import { J, JOINT_COUNT, JOINT_PARENT } from './poses';

export { gearGeo };

/** PartSpec plus rig-only options. */
export interface RigPartSpec extends PartSpec {
  /** Blend skin weights across joints so the part bends smoothly (body flesh, cloth sleeves). */
  smooth?: boolean;
  /** Per-vertex colour from the vertex position in the part's own geometry space. */
  paint?: (p: Vector3) => number;
  /**
   * Skin each vertex to the nearest bone of this joint chain (then blend
   * across joints like `smooth`): one sculpted mesh spanning several bones.
   */
  chain?: readonly number[];
  /** Use the geometry's own `color` and `gloss` attributes (painted sculpts). */
  vertexColors?: boolean;
}

export interface Rig {
  root: Group;
  /** Child of root that holds the body; carries the form scale. */
  body: Group;
  joints: Bone[];
  sockets: Sockets;
  metrics: BodyMetrics;
  look: FighterLook;
  weaponBase: Object3D;
  weaponTip: Object3D;
  headTop: Object3D;
  /** Second-hand grip on two-handed weapons (child of the main-hand socket), if any. */
  offGrip: Object3D | null;
  /** Swaying cloth bones (cape, scarf, hair) animated by the view. */
  cloth: Bone[];
  /** Bones of item relics that orbit the fighter. */
  orbiters: { item: string; bone: Bone }[];
  /** Named bones registered by decorators. */
  tags: Map<string, Object3D>;
  /** Bone of the phoenix feather (collapsed once the revive is spent). */
  phoenix: Object3D | null;
  uniforms: FighterUniforms;
  materials: Material[];
  /** Material of the enchant-tinted glow (weapon edge). */
  enchantMaterial: MeshBasicMaterial | null;
  meshes: SkinnedMesh[];
}

const AUTHOR_MAT = new MeshBasicMaterial();

function makeMetrics(look: FighterLook): BodyMetrics {
  const form = bodyForm(look.form);
  const s = form.shape;
  const ankleH = 0.085 * s.footS;
  return {
    form,
    headR: s.headR,
    headY: s.headR * 0.95,
    shoulderW: s.shoulderW,
    chestW: s.chestW,
    chestD: s.chestD,
    armR: s.armR,
    foreR: s.foreR,
    thighR: s.thighR,
    calfR: s.calfR,
    handS: s.handS,
    footS: s.footS,
    upperArm: s.upperArm,
    forearm: s.forearm,
    thigh: s.thigh,
    shin: s.shin,
    ankleH,
    hipH: ankleH + s.thigh + s.shin + 0.06,
  };
}

/**
 * Builds a fighter: an anatomical body for the look's form, face and hair, and
 * every decorator (gear, costume pieces), then bakes all parts into three
 * skinned meshes (lit body, coloured outline, emissive glow) that share one
 * skeleton, so a fully geared fighter costs ~4 draw calls. Body flesh gets
 * blended weights across joints so elbows, knees and the spine bend smoothly.
 * Forward is +X, up is +Y, the fighter's right side is +Z.
 */
export function buildRig(look: FighterLook): Rig {
  const u = createFighterUniforms(look.accent);
  const metrics = makeMetrics(look);
  const s = metrics.form.shape;
  const root = new Group();
  const body = new Group();
  body.scale.setScalar(s.scale);
  root.add(body);

  const bones: Bone[] = [];
  const mk = (parent: Object3D, x: number, y: number, z: number) => {
    const b = new Bone();
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };

  // Skeleton (indices match the J table).
  const joints: Bone[] = new Array(JOINT_COUNT);
  const hips = joints[J.HIPS] = mk(body, 0, metrics.hipH, 0);
  const spine = joints[J.SPINE] = mk(hips, 0, s.waistLen, 0);
  const chest = joints[J.CHEST] = mk(spine, 0, s.chestLen, 0);
  const neck = joints[J.NECK] = mk(chest, 0.012, s.neckLen, 0);
  const head = joints[J.HEAD] = mk(neck, 0.018, 0.095 + s.neckR * 0.2, 0);
  const clavY = s.neckLen * 0.8;
  const clavL = joints[J.CLAV_L] = mk(chest, -0.01, clavY, -0.06);
  const uarmL = joints[J.UARM_L] = mk(clavL, 0, 0.01, -(s.shoulderW - 0.06));
  const farmL = joints[J.FARM_L] = mk(uarmL, 0, -s.upperArm, 0);
  const handL = joints[J.HAND_L] = mk(farmL, 0, -s.forearm, 0);
  const clavR = joints[J.CLAV_R] = mk(chest, -0.01, clavY, 0.06);
  const uarmR = joints[J.UARM_R] = mk(clavR, 0, 0.01, s.shoulderW - 0.06);
  const farmR = joints[J.FARM_R] = mk(uarmR, 0, -s.upperArm, 0);
  const handR = joints[J.HAND_R] = mk(farmR, 0, -s.forearm, 0);
  const thighL = joints[J.THIGH_L] = mk(hips, 0, -0.06, -s.hipW);
  const shinL = joints[J.SHIN_L] = mk(thighL, 0, -s.thigh, 0);
  const footL = joints[J.FOOT_L] = mk(shinL, 0, -s.shin, 0);
  const thighR = joints[J.THIGH_R] = mk(hips, 0, -0.06, s.hipW);
  const shinR = joints[J.SHIN_R] = mk(thighR, 0, -s.thigh, 0);
  const footR = joints[J.FOOT_R] = mk(shinR, 0, -s.shin, 0);
  bones.push(...joints);

  // Sockets.
  const sock = (parent: Object3D, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) => {
    const o = new Object3D();
    o.position.set(...pos);
    o.rotation.set(...rot);
    parent.add(o);
    return o;
  };
  const fist = 0.055 * s.handS;
  const sockets: Sockets = {
    hips: sock(hips),
    belt: sock(hips, [0, 0.07, 0]),
    spine: sock(spine),
    chest: sock(chest),
    back: sock(chest, [-s.chestD * 0.75, s.neckLen * 0.6, 0]),
    neck: sock(neck),
    head: sock(head),
    skull: sock(head, [0, metrics.headY, 0]),
    headTop: sock(head, [0, metrics.headY + s.headR, 0]),
    face: sock(head, [s.headR * 0.9, metrics.headY + s.headR * 0.1, 0]),
    shoulderL: sock(chest, [-0.01, clavY + 0.04, -s.shoulderW]),
    shoulderR: sock(chest, [-0.01, clavY + 0.04, s.shoulderW]),
    upperArmL: sock(uarmL),
    upperArmR: sock(uarmR),
    forearmL: sock(farmL),
    forearmR: sock(farmR),
    shieldArm: sock(farmL, [0, -s.forearm * 0.5, -(s.foreR + 0.06)], [0, 0, 0.08]),
    mainHand: sock(handR, [0.008, -fist, 0], [0, 0, -Math.PI / 2]),
    offHand: sock(handL, [0.008, -fist, 0], [0, 0, -Math.PI / 2]),
    thighL: sock(thighL),
    thighR: sock(thighR),
    shinL: sock(shinL),
    shinR: sock(shinR),
    footL: sock(footL),
    footR: sock(footR),
  };

  const headTop = sockets.headTop;
  const weaponBase = sock(sockets.mainHand, [0, 0.2, 0]);
  const weaponTip = sock(sockets.mainHand, [0, 1.0, 0]);
  let offGrip: Object3D | null = null;
  const cloth: Bone[] = [];
  const orbiters: { item: string; bone: Bone }[] = [];
  const tags = new Map<string, Object3D>();
  const hidden = new Set<string>();

  const api: RigBuildApi = {
    look, metrics, sockets, appearance: look.appearance,
    part(parent, g, spec, o: PartOpts = {}) {
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
    },
    group(parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
      return sock(parent, pos, rot);
    },
    cloth(parent, x, y, z, stiffness = 1) {
      const b = mk(parent, x, y, z);
      b.userData.stiffness = stiffness;
      bones.push(b);
      cloth.push(b);
      return b;
    },
    orbiter(id) {
      const b = mk(root, 0, 1.5, 0);
      bones.push(b);
      orbiters.push({ item: id, bone: b });
      return b;
    },
    setWeapon(base, tip) {
      weaponBase.position.set(...base);
      weaponTip.position.set(...tip);
    },
    setOffGrip(pos) {
      if (!pos) { offGrip?.removeFromParent(); offGrip = null; return; }
      offGrip ??= sock(sockets.mainHand);
      offGrip.position.set(...pos);
    },
    hide(what) { hidden.add(what); },
    isHidden(what) { return hidden.has(what); },
    bone(parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
      const b = mk(parent, ...pos);
      b.rotation.set(...rot);
      bones.push(b);
      return b;
    },
    tag(name, o) {
      tags.set(name, o);
    },
  };

  buildBody(api, joints);
  for (const d of look.decorators) d(api);
  // The head goes last so it sees what the gear hides (helmets hide hair).
  look.head?.(api);

  const { meshes, materials, enchantMaterial } = bake(root, bones, u);
  return {
    root, body, joints, sockets, metrics, look, weaponBase, weaponTip, headTop, offGrip, cloth, orbiters, tags,
    phoenix: tags.get('phoenix') ?? null,
    uniforms: u, materials, enchantMaterial, meshes,
  };
}

// -----------------------------------------------------------------------------
// Baking
// -----------------------------------------------------------------------------

/** Primary child of each joint (where its flesh continues into). */
const JOINT_CHILD: number[] = (() => {
  const c = new Array(JOINT_COUNT).fill(-1);
  c[J.HIPS] = J.SPINE; c[J.SPINE] = J.CHEST; c[J.CHEST] = J.NECK; c[J.NECK] = J.HEAD;
  c[J.CLAV_L] = J.UARM_L; c[J.UARM_L] = J.FARM_L; c[J.FARM_L] = J.HAND_L;
  c[J.CLAV_R] = J.UARM_R; c[J.UARM_R] = J.FARM_R; c[J.FARM_R] = J.HAND_R;
  c[J.THIGH_L] = J.SHIN_L; c[J.SHIN_L] = J.FOOT_L;
  c[J.THIGH_R] = J.SHIN_R; c[J.SHIN_R] = J.FOOT_R;
  return c;
})();

/**
 * Half-width of the soft blend at the joint between a bone and its parent
 * (body-space metres; 0 = rigid) and how far from the bone axis it reaches.
 * Shoulders stay rigid: they rotate up to ~200 degrees, which linear blend
 * skinning would collapse; the deltoid hides the seam instead.
 */
const BLEND: Record<number, [number, number]> = {
  [J.SPINE]: [0.08, 1], [J.CHEST]: [0.09, 1], [J.NECK]: [0.05, 0.13], [J.HEAD]: [0.035, 0.1],
  [J.FARM_L]: [0.07, 1], [J.FARM_R]: [0.07, 1], [J.HAND_L]: [0.025, 1], [J.HAND_R]: [0.025, 1],
  [J.THIGH_L]: [0.05, 0.16], [J.THIGH_R]: [0.05, 0.16], [J.SHIN_L]: [0.09, 1], [J.SHIN_R]: [0.09, 1],
  [J.FOOT_L]: [0.035, 1], [J.FOOT_R]: [0.035, 1],
};

interface JointFrame { pos: Vector3; axis: Vector3 }

const _v = new Vector3();
const _n = new Vector3();
const _d = new Vector3();
const _m3 = new Matrix3();
const _c = new Color();

class SkinBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  gloss: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];
  count = 0;
  get empty(): boolean { return this.count === 0; }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('gloss', new BufferAttribute(new Float32Array(this.gloss), 1));
    g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(this.si), 4));
    g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(this.sw), 4));
    const IndexArray = this.count > 65535 ? Uint32Array : Uint16Array;
    g.setIndex(new BufferAttribute(new IndexArray(this.idx), 1));
    g.computeBoundingSphere();
    return g;
  }
}

function bake(root: Group, bones: Bone[], u: FighterUniforms): { meshes: SkinnedMesh[]; materials: Material[]; enchantMaterial: MeshBasicMaterial | null } {
  root.updateMatrixWorld(true);
  const index = new Map<Object3D, number>();
  bones.forEach((b, i) => index.set(b, i));

  // Bind-pose frames of the anatomical joints.
  const frames: JointFrame[] = [];
  for (let j = 0; j < JOINT_COUNT; j++) frames.push({ pos: bones[j].getWorldPosition(new Vector3()), axis: new Vector3(0, 1, 0) });
  for (let j = 0; j < JOINT_COUNT; j++) {
    const c = JOINT_CHILD[j];
    if (c >= 0) frames[j].axis.subVectors(frames[c].pos, frames[j].pos).normalize();
    else if (JOINT_PARENT[j] >= 0 && j !== J.HEAD) frames[j].axis.subVectors(frames[j].pos, frames[JOINT_PARENT[j]].pos).normalize();
  }
  const scale = bones[J.HIPS].parent!.getWorldScale(new Vector3()).x;
  // Bone segments for chain skinning: joint to child (leaf bones get a short stub).
  const segEnd: Vector3[] = frames.map((f, j) => {
    const c = JOINT_CHILD[j];
    if (c >= 0) return frames[c].pos.clone();
    if (j === J.FOOT_L || j === J.FOOT_R) return f.pos.clone().add(new Vector3(0.14, -0.05, 0).multiplyScalar(scale));
    if (j === J.HEAD) return f.pos.clone().add(new Vector3(0, 0.3, 0).multiplyScalar(scale));
    return f.pos.clone().addScaledVector(f.axis, 0.08 * scale);
  });
  const nearestBone = (chain: readonly number[], p: Vector3): number => {
    let best = chain[0], bd = Infinity;
    for (const b of chain) {
      const a = frames[b].pos, e = segEnd[b];
      _d.subVectors(e, a);
      const l2 = _d.lengthSq();
      const t = l2 > 0 ? Math.max(0, Math.min(1, _n.subVectors(p, a).dot(_d) / l2)) : 0;
      const dx = a.x + _d.x * t - p.x, dy = a.y + _d.y * t - p.y, dz = a.z + _d.z * t - p.z;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bd) { bd = dist; best = b; }
    }
    return best;
  };

  const lit = new SkinBuilder();
  const line = new SkinBuilder();
  const glowB = new SkinBuilder();
  const ench = new SkinBuilder();
  const authored: Mesh[] = [];
  root.traverse((o) => { if ((o as Mesh).isMesh && o.userData.spec) authored.push(o as Mesh); });

  const w = [0, 0, 0];
  const wi = [0, 0, 0];
  /** Fills w/wi for a world-space vertex on bone b; returns the number of influences. */
  const weigh = (b: number, p: Vector3): number => {
    wi[0] = b; w[0] = 1; let n = 1;
    if (b >= JOINT_COUNT) return n;
    const f = frames[b];
    const par = JOINT_PARENT[b];
    const jb = BLEND[b];
    if (par >= 0 && jb) {
      const r = jb[0] * scale;
      const sAx = _d.subVectors(p, f.pos).dot(f.axis);
      const radial = _d.addScaledVector(f.axis, -sAx).length();
      if (radial < jb[1] * scale) {
        const wp = 1 - smoothstep(-r, r, sAx);
        if (wp > 0.001) { wi[n] = par; w[n] = wp; n++; }
      }
    }
    const c = JOINT_CHILD[b];
    const jc = c >= 0 ? BLEND[c] : undefined;
    if (c >= 0 && jc) {
      const r = jc[0] * scale;
      const sAx = _d.subVectors(p, frames[c].pos).dot(f.axis);
      const radial = _d.addScaledVector(f.axis, -sAx).length();
      if (radial < jc[1] * scale) {
        const wc = smoothstep(-r, r, sAx);
        if (wc > 0.001) { wi[n] = c; w[n] = wc; n++; }
      }
    }
    let other = 0;
    for (let i = 1; i < n; i++) other += w[i];
    if (other > 1) { for (let i = 1; i < n; i++) w[i] /= other; w[0] = 0; }
    else w[0] = 1 - other;
    return n;
  };

  const add = (sb: SkinBuilder, m: Mesh, s: RigPartSpec, bone: number, colorScale: number, gloss: number) => {
    const g = m.geometry;
    const p = g.getAttribute('position');
    const nAttr = g.getAttribute('normal');
    const cAttr = s.vertexColors ? g.getAttribute('color') : undefined;
    const gAttr = s.vertexColors ? g.getAttribute('gloss') : undefined;
    const base = sb.count;
    _m3.getNormalMatrix(m.matrixWorld);
    _c.setHex(s.color);
    let cr = _c.r * colorScale, cg = _c.g * colorScale, cb = _c.b * colorScale;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      if (cAttr) {
        cr = cAttr.getX(i) * colorScale; cg = cAttr.getY(i) * colorScale; cb = cAttr.getZ(i) * colorScale;
      } else if (s.paint) {
        _c.setHex(s.paint(_v));
        cr = _c.r * colorScale; cg = _c.g * colorScale; cb = _c.b * colorScale;
      }
      _v.applyMatrix4(m.matrixWorld);
      sb.pos.push(_v.x, _v.y, _v.z);
      if (nAttr) { _n.fromBufferAttribute(nAttr, i).applyMatrix3(_m3).normalize(); sb.nor.push(_n.x, _n.y, _n.z); }
      else sb.nor.push(0, 1, 0);
      sb.col.push(cr, cg, cb);
      sb.gloss.push(gAttr ? gAttr.getX(i) : gloss);
      const vb = s.chain ? nearestBone(s.chain, _v) : bone;
      const n = s.smooth || s.chain ? weigh(vb, _v) : (wi[0] = bone, w[0] = 1, 1);
      for (let k = 0; k < 4; k++) {
        sb.si.push(k < n ? wi[k] : 0);
        sb.sw.push(k < n ? w[k] : 0);
      }
    }
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) sb.idx.push(base + ix.getX(i));
    else for (let i = 0; i < p.count; i++) sb.idx.push(base + i);
    sb.count += p.count;
  };

  for (const m of authored) {
    let a: Object3D | null = m.parent;
    while (a && !index.has(a)) a = a.parent;
    const bi = a ? index.get(a)! : J.HIPS;
    const s = m.userData.spec as RigPartSpec;
    if (s.enchant) add(ench, m, s, bi, s.glow ?? 1, 0);
    else if (s.glow) add(glowB, m, s, bi, s.glow, 0);
    else {
      add(lit, m, s, bi, 1, s.gloss ?? 0);
      if (s.outline !== false) add(line, m, s, bi, 1, 0);
    }
  }
  for (const m of authored) m.removeFromParent();

  const skeleton = new Skeleton(bones);
  const meshes: SkinnedMesh[] = [];
  const materials: Material[] = [];
  const mkMesh = (b: SkinBuilder, mat: Material, shadow: boolean) => {
    if (b.empty) return;
    const mesh = new SkinnedMesh(b.build(), mat);
    mesh.castShadow = shadow;
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(skeleton);
    meshes.push(mesh);
  };
  const bodyMat = fighterMaterial(u);
  materials.push(bodyMat);
  mkMesh(lit, bodyMat, true);
  mkMesh(line, outlineMaterial(), false);
  const gm = glowVertexMaterial();
  materials.push(gm);
  mkMesh(glowB, gm, false);
  let enchantMaterial: MeshBasicMaterial | null = null;
  if (!ench.empty) {
    enchantMaterial = glowVertexMaterial();
    materials.push(enchantMaterial);
    mkMesh(ench, enchantMaterial, false);
  }
  return { meshes, materials, enchantMaterial };
}
