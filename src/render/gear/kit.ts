import {
  BoxGeometry, BufferGeometry, CapsuleGeometry, Color, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group,
  IcosahedronGeometry, LatheGeometry, Mesh, MeshBasicMaterial, Object3D, OctahedronGeometry, Shape, SphereGeometry,
  TorusGeometry, Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Metal, ResolvedArt } from '../../gear/art';
import type { PartSpec } from '../meshBuilder';

// -----------------------------------------------------------------------------
// Authoring kit for gear models. Parts are plain meshes tagged with a PartSpec;
// the rig's bake() merges every tagged part into the fighter's few skinned
// meshes, so detailed gear costs vertices, never draw calls.
// -----------------------------------------------------------------------------

const cache = new Map<string, BufferGeometry>();
function geo<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = cache.get(key);
  if (!g) { g = make(); cache.set(key, g); }
  return g as T;
}

export const capsule = (r: number, len: number, rs = 10) => geo(`cap${r}:${len}:${rs}`, () => new CapsuleGeometry(r, len, 3, rs));
export const sphere = (r: number, w = 14, h = 10) => geo(`sph${r}:${w}:${h}`, () => new SphereGeometry(r, w, h));
export const halfSphere = (r: number, w = 14) => geo(`hsph${r}:${w}`, () => new SphereGeometry(r, w, 7, 0, Math.PI * 2, 0, Math.PI / 2));
export const box = (x: number, y: number, z: number) => geo(`box${x}:${y}:${z}`, () => new BoxGeometry(x, y, z));
export const rbox = (x: number, y: number, z: number, r = 0.02) =>
  geo(`rbox${x}:${y}:${z}:${r}`, () => new RoundedBoxGeometry(x, y, z, 2, Math.min(r, x / 2.01, y / 2.01, z / 2.01)));
export const cyl = (rt: number, rb: number, h: number, s = 12, open = false) =>
  geo(`cyl${rt}:${rb}:${h}:${s}:${open}`, () => new CylinderGeometry(rt, rb, h, s, 1, open));
export const cone = (r: number, h: number, s = 10) => geo(`cone${r}:${h}:${s}`, () => new ConeGeometry(r, h, s));
export const torus = (r: number, t: number, arc = Math.PI * 2, rs = 6, ts = 18) =>
  geo(`tor${r}:${t}:${arc}:${rs}:${ts}`, () => new TorusGeometry(r, t, rs, ts, arc));
export const ico = (r: number, d = 0) => geo(`ico${r}:${d}`, () => new IcosahedronGeometry(r, d));
export const octa = (r: number) => geo(`oct${r}`, () => new OctahedronGeometry(r, 0));

/** Revolved profile: points are [radius, y]. */
export function lathe(key: string, pts: [number, number][], seg = 16): LatheGeometry {
  return geo(`lathe${key}`, () => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg));
}

/** Flat shape (XY, facing +Z) extruded with a small bevel. */
export function slab(key: string, pts: [number, number][], depth: number, bevel = 0.01): BufferGeometry {
  return geo(`slab${key}:${depth}:${bevel}`, () => {
    const s = new Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    const g = new ExtrudeGeometry(s, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6, steps: 1,
    });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  });
}

/** Blade along +Y from y=0, broad side in X, optional curve towards +X. */
export function blade(len: number, width: number, thick: number, curve = 0, tip = 0.18, leaf = 0): BufferGeometry {
  return geo(`blade${len}:${width}:${thick}:${curve}:${tip}:${leaf}`, () => {
    const s = new Shape();
    const tipLen = len * tip;
    const w = width / 2;
    s.moveTo(-w, 0);
    s.lineTo(w, 0);
    if (leaf) s.quadraticCurveTo(w * (1 + leaf), (len - tipLen) * 0.6, w, len - tipLen);
    else s.lineTo(w, len - tipLen);
    s.lineTo(0, len);
    s.lineTo(-w, len - tipLen);
    if (leaf) s.quadraticCurveTo(-w * (1 + leaf), (len - tipLen) * 0.6, -w, 0);
    else s.lineTo(-w, 0);
    const g = new ExtrudeGeometry(s, {
      depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45, bevelSize: Math.min(w * 0.35, 0.014),
      bevelSegments: 1, steps: 1, curveSegments: 4,
    });
    g.translate(0, 0, -thick / 2);
    if (curve) {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / len;
        p.setX(i, p.getX(i) + curve * y * y);
      }
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Tube along a quadratic curve in the XY plane (bow limbs, horns, hooks). */
export function bent(key: string, pts: [number, number][], r0: number, r1: number, seg = 10): BufferGeometry {
  return geo(`bent${key}:${r0}:${r1}:${seg}`, () => {
    // Build by stacking short cylinders' vertices along the polyline (smooth enough at this scale).
    const g = new CylinderGeometry(1, 1, 1, 8, seg, false);
    const p = g.getAttribute('position');
    const [a, b, c] = pts;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5; // 0..1 along the tube
      const u = 1 - t;
      const x = u * u * a[0] + 2 * u * t * b[0] + t * t * c[0];
      const y = u * u * a[1] + 2 * u * t * b[1] + t * t * c[1];
      // Tangent for the cross-section orientation.
      const tx = 2 * u * (b[0] - a[0]) + 2 * t * (c[0] - b[0]);
      const ty = 2 * u * (b[1] - a[1]) + 2 * t * (c[1] - b[1]);
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const r = r0 + (r1 - r0) * t;
      const ox = p.getX(i) * r, oz = p.getZ(i) * r;
      p.setXYZ(i, x + nx * ox, y + ny * ox, oz);
    }
    g.computeVertexNormals();
    return g;
  });
}

const AUTHOR_MAT = new MeshBasicMaterial();

export type Spec = PartSpec | number;
export interface PartOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
}

/** Adds one authored part (baked later by the rig). */
export function part(parent: Object3D, g: BufferGeometry, spec: Spec, o: PartOpts = {}): Mesh {
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

export function group(parent: Object3D, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale = 1): Group {
  const g = new Group();
  g.position.set(...pos);
  g.rotation.set(...rot);
  g.scale.setScalar(scale);
  parent.add(g);
  return g;
}

// --- materials -------------------------------------------------------------

const METAL_COLOR: Record<Metal, number> = {
  steel: 0xd6dde9, gold: 0xf0c050, bronze: 0xc8823e, dark: 0x5a5e74, bone: 0xf0e6cf, wood: 0x7c5230,
  crystal: 0xc8f2ff, obsidian: 0x3a2f52,
};
const METAL_GLOSS: Record<Metal, number> = {
  steel: 0.95, gold: 1, bronze: 0.8, dark: 0.6, bone: 0.15, wood: 0, crystal: 1, obsidian: 0.9,
};
const TRIM: Record<Metal, Metal> = {
  steel: 'gold', gold: 'bronze', bronze: 'gold', dark: 'gold', bone: 'dark', wood: 'gold', crystal: 'steel', obsidian: 'gold',
};

/** Palette of PartSpecs for one item look. */
export interface Mats {
  main: PartSpec;
  trim: PartSpec;
  steel: PartSpec;
  gold: PartSpec;
  wood: PartSpec;
  leather: PartSpec;
  wrap: PartSpec;
  bone: PartSpec;
  dark: PartSpec;
  cloth: PartSpec;
  clothDark: PartSpec;
  /** Glowing gem / rune in the item's tint. */
  gem: PartSpec;
  /** Bright glow (cores, orbs). */
  glow: PartSpec;
  /** Weapon-edge glow tinted at runtime by enchants. */
  edge: PartSpec;
  tint: number;
  look: ResolvedArt;
}

const _c = new Color();
const shade = (c: number, k: number) => _c.setHex(c).multiplyScalar(k).getHex();

export function mats(look: ResolvedArt): Mats {
  const m = look.metal, t = TRIM[m];
  const mainColor = m === 'crystal' ? _c.setHex(look.tint).lerp(new Color(0xffffff), 0.55).getHex() : METAL_COLOR[m];
  return {
    main: { color: mainColor, gloss: METAL_GLOSS[m] },
    trim: { color: METAL_COLOR[t], gloss: METAL_GLOSS[t] },
    steel: { color: METAL_COLOR.steel, gloss: 0.95 },
    gold: { color: METAL_COLOR.gold, gloss: 1 },
    wood: { color: METAL_COLOR.wood },
    leather: { color: 0x6a3f22 },
    wrap: { color: 0x3a2418 },
    bone: { color: METAL_COLOR.bone, gloss: 0.15 },
    dark: { color: 0x2a2838, gloss: 0.4 },
    cloth: { color: look.cloth },
    clothDark: { color: shade(look.cloth, 0.62) },
    gem: { color: look.tint, glow: 2.2 },
    glow: { color: look.tint, glow: 2.8 },
    edge: { color: 0xffffff, glow: 0.9, enchant: true },
    tint: look.tint,
    look,
  };
}

export const lineless = (spec: PartSpec): PartSpec => ({ ...spec, outline: false });
