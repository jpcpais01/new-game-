import {
  AdditiveBlending, BackSide, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DirectionalLight,
  DodecahedronGeometry, DoubleSide, Group, HemisphereLight, IcosahedronGeometry, Mesh, PlaneGeometry, ShaderMaterial,
  SphereGeometry, SRGBColorSpace, Vector3, type Material,
} from 'three';
import { envMaterial, outlineMaterial } from '../materials';
import { composeMatrix, MeshBuilder, prng } from '../meshBuilder';

// -----------------------------------------------------------------------------
// Sky
// -----------------------------------------------------------------------------

export interface SkyParams {
  zenith: number;
  mid: number;
  horizon: number;
  /** Colour below the horizon line (match the fog). */
  ground: number;
  sunDir: Vector3;
  sunColor: number;
  sunSize?: number;
}

/** Gradient sky dome with a soft sun and halo. Cheap: no noise, no textures. */
export function skyDome(p: SkyParams): Mesh<SphereGeometry, ShaderMaterial> {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new Color(p.zenith) },
      uMid: { value: new Color(p.mid) },
      uHorizon: { value: new Color(p.horizon) },
      uGround: { value: new Color(p.ground) },
      uSunDir: { value: p.sunDir.clone().normalize() },
      uSun: { value: new Color(p.sunColor) },
      uSunSize: { value: p.sunSize ?? 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uMid, uHorizon, uGround, uSun, uSunDir;
      uniform float uSunSize;
      varying vec3 vDir;
      void main() {
        vec3 d = vDir * inversesqrt(max(dot(vDir, vDir), 1e-8));
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
        col = mix(col, uZenith, smoothstep(0.2, 0.75, h));
        col = mix(col, uGround, smoothstep(0.0, -0.08, h));
        float s = clamp(dot(d, uSunDir), 0.0, 1.0);
        col += uSun * (pow(s, 6.0) * 0.25 + pow(s, 48.0) * 0.5) ;
        col = mix(col, uSun * 1.6, smoothstep(0.9993 - 0.0004 * uSunSize, 0.9996 - 0.0002 * uSunSize, s));
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }`,
  });
  const m = new Mesh(new SphereGeometry(380, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// -----------------------------------------------------------------------------
// Lights
// -----------------------------------------------------------------------------

export interface LightParams {
  key: number;
  keyIntensity?: number;
  keyPos: [number, number, number];
  sky: number;
  ground: number;
  hemiIntensity?: number;
  rim: number;
  rimIntensity?: number;
  shadows: boolean;
  shadowMapSize: number;
}

export function makeLights(group: Group, p: LightParams): DirectionalLight {
  group.add(new HemisphereLight(p.sky, p.ground, p.hemiIntensity ?? 1.0));
  const key = new DirectionalLight(p.key, p.keyIntensity ?? 3.0);
  key.position.set(...p.keyPos);
  key.target.position.set(0, 0, 0);
  group.add(key, key.target);
  if (p.shadows) {
    key.castShadow = true;
    const sc = key.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 9; sc.bottom = -6; sc.near = 1; sc.far = 50;
    key.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.035;
  }
  const rim = new DirectionalLight(p.rim, p.rimIntensity ?? 1.4);
  rim.position.set(-8, 6, -10);
  group.add(rim);
  return key;
}

// -----------------------------------------------------------------------------
// Procedural props, all written into MeshBuilders
// -----------------------------------------------------------------------------

const cache = new Map<string, BufferGeometry>();
function g<T extends BufferGeometry>(k: string, make: () => T): T {
  let x = cache.get(k);
  if (!x) { x = make(); cache.set(k, x); }
  return x as T;
}
export const G = {
  ico: (d = 1) => g(`ico${d}`, () => new IcosahedronGeometry(1, d)),
  dodeca: () => g('dod', () => new DodecahedronGeometry(1, 0)),
  cone: (s = 7) => g(`cone${s}`, () => new ConeGeometry(1, 1, s, 1).translate(0, 0.5, 0)),
  cyl: (s = 10) => g(`cyl${s}`, () => new CylinderGeometry(1, 1, 1, s, 1).translate(0, 0.5, 0)),
  taper: (s = 8) => g(`tap${s}`, () => new CylinderGeometry(0.7, 1, 1, s, 1).translate(0, 0.5, 0)),
  blade: () => g('blade', () => new ConeGeometry(1, 1, 3, 1).translate(0, 0.5, 0)),
  plane: () => g('plane', () => new PlaneGeometry(1, 1)),
};

const _col = new Color();
const _col2 = new Color();

/** Low-poly cumulus made of a cluster of spheres (toon-shaded by the ramp). */
export function cloud(b: MeshBuilder, rnd: () => number, x: number, y: number, z: number, size: number, color: number, flat = 0.55): void {
  const n = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const r = size * (0.45 + (1 - Math.abs(t) * 1.6) * 0.45 + rnd() * 0.15);
    b.put(G.ico(1), color, x + t * size * 2.6 + (rnd() - 0.5) * size * 0.3, y + r * 0.3 + rnd() * size * 0.2, z + (rnd() - 0.5) * size * 0.5,
      { s: [r, r * flat * (1.2 - Math.abs(t) * 0.4), r * 0.8], ry: rnd() * 3 });
  }
  b.put(G.ico(1), color, x, y, z, { s: [size * 1.6, size * 0.35, size * 0.8] });
}

export interface MountainOpts {
  rock: number;
  rockDark: number;
  snow: number;
  grass?: number;
  snowLine: number;
}

/** Faceted mountain peak with snow above a height and grass at the base. */
export function mountain(b: MeshBuilder, rnd: () => number, x: number, z: number, h: number, r: number, o: MountainOpts, baseY = 0): void {
  const geo = g(`mtn${Math.floor(rnd() * 6)}`, () => {
    const c = new ConeGeometry(1, 1, 8, 4).translate(0, 0.5, 0).toNonIndexed();
    const p = c.getAttribute('position');
    const seed = cache.size * 13.7;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      if (py > 0.99) continue;
      const k = Math.sin(px * 12.9 + pz * 7.3 + seed) * 43758.5;
      const j = (k - Math.floor(k)) - 0.5;
      p.setX(i, px * (1 + j * 0.5));
      p.setZ(i, pz * (1 + j * 0.5));
      p.setY(i, py + j * 0.12 * (1 - py));
    }
    c.computeVertexNormals();
    return c;
  });
  const m = composeMatrix(x, baseY, z, 0, rnd() * 6, 0, [r, h, r * (0.7 + rnd() * 0.5)]);
  const top = baseY + h;
  b.addFn(geo, m, (p, n, out) => {
    const rel = (p.y - baseY) / Math.max(1, top - baseY);
    if (rel > o.snowLine + (n.y - 0.5) * 0.12) out.setHex(o.snow);
    else if (o.grass !== undefined && rel < 0.18) out.setHex(o.grass);
    else out.setHex(n.x + n.z * 0.3 > 0 ? o.rock : o.rockDark);
  });
}

/** Round-canopy stylised tree. */
export function roundTree(b: MeshBuilder, rnd: () => number, x: number, z: number, s: number, leaf: number, leafDark: number, trunk = 0x6b4a32, y = 0): void {
  b.put(G.taper(7), trunk, x, y, z, { s: [0.22 * s, 2.0 * s, 0.22 * s] });
  const n = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd();
    const r = (0.6 + rnd() * 0.35) * s;
    const d = i === 0 ? 0 : 0.6 * s;
    _col.setHex(leaf).lerp(_col2.setHex(leafDark), rnd() * 0.6);
    b.put(G.ico(1), _col, x + Math.cos(a) * d, y + 2.3 * s + (i === 0 ? 0.4 * s : rnd() * 0.5 * s), z + Math.sin(a) * d * 0.8,
      { s: [r, r * 0.85, r], ry: rnd() * 3, wind: 0.35 });
  }
}

/** Stacked-cone pine. */
export function pine(b: MeshBuilder, rnd: () => number, x: number, z: number, s: number, leaf: number, leafDark: number, y = 0): void {
  b.put(G.cyl(6), 0x5a3d2a, x, y, z, { s: [0.14 * s, 1.0 * s, 0.14 * s] });
  for (let i = 0; i < 3; i++) {
    _col.setHex(leaf).lerp(_col2.setHex(leafDark), i * 0.25 + rnd() * 0.2);
    b.put(G.cone(8), _col, x, y + (0.7 + i * 0.75) * s, z, { s: [(1.05 - i * 0.28) * s, 1.3 * s, (1.05 - i * 0.28) * s], ry: rnd() * 3, wind: 0.12 + i * 0.08 });
  }
}

export function rock(b: MeshBuilder, rnd: () => number, x: number, y: number, z: number, s: number, color: number, moss?: number): void {
  const m = composeMatrix(x, y, z, rnd() * 0.5, rnd() * 6, rnd() * 0.5, [s * (1 + rnd() * 0.6), s * (0.6 + rnd() * 0.4), s * (1 + rnd() * 0.5)]);
  b.addFn(G.dodeca(), m, (_p, n, out) => {
    out.setHex(moss !== undefined && n.y > 0.6 ? moss : color);
  });
}

/** Grass tuft: a few thin blades swaying in the wind. */
export function tuft(b: MeshBuilder, rnd: () => number, x: number, z: number, s: number, color: number, tip: number, y = 0): void {
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const h = (0.35 + rnd() * 0.35) * s;
    const m = composeMatrix(x + Math.cos(a) * 0.08 * s, y, z + Math.sin(a) * 0.08 * s, Math.cos(a) * 0.35, rnd() * 3, Math.sin(a) * 0.35, [0.05 * s, h, 0.05 * s]);
    b.addFn(G.blade(), m, (p, _n, out) => {
      const k = Math.min(1, Math.max(0, (p.y - y) / Math.max(0.01, h)));
      out.setHex(color).lerp(_col2.setHex(tip), k);
      return k;
    });
  }
}

/** Builds the merged scenery meshes and adds them to the group. */
export function finish(group: Group, near: MeshBuilder, far: MeshBuilder, lines: MeshBuilder | null, windy: MeshBuilder | null, sky: MeshBuilder | null, shadows: boolean): void {
  if (!near.empty) {
    const m = new Mesh(near.build(), envMaterial());
    m.castShadow = shadows; m.receiveShadow = shadows;
    m.userData.casts = true;
    group.add(m);
  }
  if (!far.empty) {
    const m = new Mesh(far.build(), envMaterial());
    m.receiveShadow = true;
    group.add(m);
  }
  if (windy && !windy.empty) {
    const m = new Mesh(windy.build({ wind: true }), envMaterial(true));
    m.receiveShadow = shadows;
    group.add(m);
  }
  if (lines && !lines.empty) group.add(new Mesh(lines.build(), outlineMaterial()));
  if (sky && !sky.empty) {
    const m = new Mesh(sky.build(), envMaterial(false, false));
    m.renderOrder = -9;
    group.add(m);
  }
}

// -----------------------------------------------------------------------------
// Soft light shafts (additive, very cheap)
// -----------------------------------------------------------------------------

export function godRays(color: number, count: number, origin: Vector3, rnd: () => number): { mesh: Mesh<BufferGeometry, ShaderMaterial>; mat: ShaderMaterial } {
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false,
    uniforms: { uColor: { value: new Color(color) }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying float vId; attribute float ray;
      void main() { vUv = uv; vId = ray; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying float vId;
      void main() {
        float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float fade = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        float pulse = 0.65 + 0.35 * sin(uTime * 0.4 + vId * 2.1);
        float a = clamp(edge * fade * pulse * 0.07, 0.0, 1.0);
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const geos: BufferGeometry[] = [];
  const b = new MeshBuilder();
  void geos;
  for (let i = 0; i < count; i++) {
    const w = 6 + rnd() * 10;
    b.add(G.plane(), composeMatrix(origin.x + (i - count / 2) * 14 + rnd() * 6, origin.y, origin.z - rnd() * 10, 0, 0, -0.5 - rnd() * 0.15, [w, 90, 1]), 0xffffff, 0, i);
  }
  const geo = b.build({ wind: true });
  // Reuse the wind attribute as a per-ray id.
  geo.setAttribute('ray', geo.getAttribute('wind'));
  const uv = new Float32Array(geo.getAttribute('position').count * 2);
  const src = G.plane().getAttribute('uv');
  for (let i = 0; i < uv.length / 2; i++) { uv[i * 2] = src.getX(i % 4); uv[i * 2 + 1] = src.getY(i % 4); }
  geo.setAttribute('uv', new (geo.getAttribute('position').constructor as typeof import('three').BufferAttribute)(uv, 2));
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return { mesh, mat };
}

// -----------------------------------------------------------------------------
// Canvas textures
// -----------------------------------------------------------------------------

export function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, size: number, rnd: () => number) => void, seed = 7): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size, prng(seed));
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Frees geometry plus any material/texture flagged `userData.own` (shared cached materials stay). */
export function disposeGroup(group: Group): void {
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const x of mats) {
      if (!x.userData.own) continue;
      (x as Material & { map?: { dispose(): void } | null }).map?.dispose();
      x.dispose();
    }
  });
}
