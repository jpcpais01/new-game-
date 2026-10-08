import {
  BufferAttribute, BufferGeometry, Color, Matrix3, Matrix4, Object3D, Quaternion, Vector3, type Mesh,
} from 'three';

/** Look of one baked part. */
export interface PartSpec {
  color: number;
  /** 0..1: hard specular glint and bright edge (metal, gems, lacquer). */
  gloss?: number;
  /** Unlit HDR emissive part with this intensity (goes to the glow layer). */
  glow?: number;
  /** Glow part tinted by the weapon enchant colour at runtime. */
  enchant?: boolean;
  /** Draw an outline around this part (lit parts only). Default true. */
  outline?: boolean;
  /** Wind sway weight 0..1 (scenery). */
  wind?: number;
  /** Scenery: whether the part casts shadows. Default true. */
  shadow?: boolean;
}

const _c = new Color();
const _v = new Vector3();
const _n = new Vector3();
const _m3 = new Matrix3();

/**
 * Accumulates transformed, vertex-coloured copies of geometry and merges them
 * into one indexed BufferGeometry. Static scenery and whole characters are
 * built this way so they cost one draw call per material instead of one per
 * primitive.
 */
export class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private gloss: number[] = [];
  private wind: number[] = [];
  private skin: number[] = [];
  private idx: number[] = [];
  private count = 0;
  constructor(private readonly skinned = false) {}

  get empty(): boolean { return this.count === 0; }

  /** Adds geometry whose colour (and optionally wind) is computed per vertex in world space. */
  addFn(g: BufferGeometry, matrix: Matrix4, fn: (p: Vector3, n: Vector3, out: Color) => number | void, gloss = 0): this {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const base = this.count;
    _m3.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      if (n) _n.fromBufferAttribute(n, i).applyMatrix3(_m3).normalize(); else _n.set(0, 1, 0);
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      const w = fn(_v, _n, _c);
      this.col.push(_c.r, _c.g, _c.b);
      this.gloss.push(gloss);
      this.wind.push(typeof w === 'number' ? w : 0);
      if (this.skinned) this.skin.push(0);
    }
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    this.count += p.count;
    return this;
  }

  add(g: BufferGeometry, matrix: Matrix4, color: number | Color, gloss = 0, wind = 0, bone = 0, colorScale = 1): this {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const base = this.count;
    _m3.getNormalMatrix(matrix);
    if (typeof color === 'number') _c.setHex(color); else _c.copy(color);
    const cr = _c.r * colorScale, cg = _c.g * colorScale, cb = _c.b * colorScale;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      if (n) { _n.fromBufferAttribute(n, i).applyMatrix3(_m3).normalize(); this.nor.push(_n.x, _n.y, _n.z); }
      else this.nor.push(0, 1, 0);
      this.col.push(cr, cg, cb);
      this.gloss.push(gloss);
      this.wind.push(wind);
      if (this.skinned) this.skin.push(bone);
    }
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    this.count += p.count;
    return this;
  }

  /** Convenience: position/rotation/scale instead of a matrix. */
  put(g: BufferGeometry, color: number | Color, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number; s?: number | [number, number, number]; gloss?: number; wind?: number } = {}): this {
    const m = composeMatrix(x, y, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, o.s ?? 1);
    return this.add(g, m, color, o.gloss ?? 0, o.wind ?? 0);
  }

  build(attrs: { wind?: boolean } = {}): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('gloss', new BufferAttribute(new Float32Array(this.gloss), 1));
    if (attrs.wind) g.setAttribute('wind', new BufferAttribute(new Float32Array(this.wind), 1));
    if (this.skinned) {
      const si = new Uint16Array(this.count * 4);
      const sw = new Float32Array(this.count * 4);
      for (let i = 0; i < this.count; i++) { si[i * 4] = this.skin[i]; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
    }
    const IndexArray = this.count > 65535 ? Uint32Array : Uint16Array;
    g.setIndex(new BufferAttribute(new IndexArray(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _q = new Quaternion();
const _e = new Object3D();
export function composeMatrix(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: number | [number, number, number] = 1): Matrix4 {
  _e.rotation.set(rx, ry, rz);
  _q.setFromEuler(_e.rotation);
  const sc = typeof s === 'number' ? _v.set(s, s, s) : _v.set(s[0], s[1], s[2]);
  return new Matrix4().compose(new Vector3(x, y, z), _q, sc.clone());
}

/** Reads the PartSpec stored on an authoring mesh. */
export function specOf(m: Mesh): PartSpec {
  return m.userData.spec as PartSpec;
}

/** Deterministic PRNG for procedural scenery. */
export function prng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
