import {
  AddEquation, Color, CustomBlending, OneFactor, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, NormalBlending,
  PlaneGeometry, ShaderMaterial,
} from 'three';

export interface BurstOptions {
  x: number; y: number; z?: number;
  count: number;
  /** Base direction (normalised internally). Omit for spherical bursts. */
  dir?: [number, number, number];
  /** Cone spread in radians around dir (PI = hemisphere). */
  spread?: number;
  speed: [number, number];
  life: [number, number];
  size: [number, number];
  color: number | Color;
  /** Random brightness/hue variation 0..1. */
  colorVar?: number;
  /** HDR multiplier on colour. */
  intensity?: number;
  gravity?: number;
  drag?: number;
  sizeEnd?: number;
  /** Velocity-aligned stretch factor (sparks/streaks). */
  stretch?: number;
  /** Positional jitter radius. */
  jitter?: number;
  jitterY?: number;
}

const tmpColor = new Color();

/**
 * Fully GPU-animated particles. The CPU only writes a particle once when it
 * is spawned (into a ring buffer, uploaded via partial update ranges); the
 * vertex shader integrates motion, drag, gravity, fade and size from the
 * spawn time. One draw call per system regardless of particle count.
 */
export class Particles {
  readonly mesh: Mesh;
  private readonly capacity: number;
  private readonly aPos: InstancedBufferAttribute;
  private readonly aVel: InstancedBufferAttribute;
  private readonly aCol: InstancedBufferAttribute;
  private readonly aExt: InstancedBufferAttribute;
  private readonly material: ShaderMaterial;
  private cursor = 0;
  private dirtyStart = -1;
  private dirtyEnd = -1;
  private wrapped = false;
  time = 0;

  constructor(capacity: number, additive: boolean) {
    this.capacity = capacity;
    const quad = new PlaneGeometry(1, 1);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.instanceCount = capacity;
    const mk = () => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(35048 /* DynamicDrawUsage */);
      return a;
    };
    this.aPos = mk(); this.aVel = mk(); this.aCol = mk(); this.aExt = mk();
    // Start every slot dead.
    for (let i = 0; i < capacity; i++) { this.aPos.array[i * 4 + 3] = -1e6; this.aVel.array[i * 4 + 3] = 0.001; }
    g.setAttribute('aPos', this.aPos);
    g.setAttribute('aVel', this.aVel);
    g.setAttribute('aCol', this.aCol);
    g.setAttribute('aExt', this.aExt);

    this.material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? CustomBlending : NormalBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute vec4 aPos;
        attribute vec4 aVel;
        attribute vec4 aCol;
        attribute vec4 aExt;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec2 vUv;
        varying float vT;
        void main() {
          float age = uTime - aPos.w;
          float life = aVel.w;
          if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float t = age / life;
          float g = aExt.x;
          float k = aExt.y;
          float decay = k > 0.0 ? (1.0 - exp(-k * age)) / k : age;
          vec3 p = aPos.xyz + aVel.xyz * decay + vec3(0.0, -0.5 * g * age * age, 0.0);
          vec3 vel = aVel.xyz * exp(-k * age) + vec3(0.0, -g * age, 0.0);
          float size = aCol.w * mix(1.0, aExt.z, t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vec2 corner = position.xy;
          if (aExt.w > 0.0) {
            vec2 v = (modelViewMatrix * vec4(vel, 0.0)).xy;
            float len = length(v);
            vec2 d = len > 1e-4 ? v / len : vec2(1.0, 0.0);
            vec2 n = vec2(-d.y, d.x);
            mv.xy += d * corner.x * size * (1.0 + len * aExt.w) + n * corner.y * size;
          } else {
            mv.xy += corner * size;
          }
          gl_Position = projectionMatrix * mv;
          vColor = aCol.rgb;
          vAlpha = smoothstep(0.0, 0.08, t) * max(0.0, 1.0 - t * t);
          vUv = corner + 0.5;
          vT = t;
        }`,
      // Additive: soft halo plus a white-hot core (reads as energy, not fuzz).
      // Normal: cartoon puffs with a lit top-left and a hard edge that eats
      // inwards as the puff dies, instead of a blurry fade.
      fragmentShader: additive ? /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        varying vec2 vUv;
        varying float vT;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float f = max(0.0, 1.0 - d);
          float halo = f * f * vAlpha;
          if (halo < 0.003) discard;
          float core = f * f * f * f * vAlpha;
          vec3 c = max(vColor, vec3(0.0));
          gl_FragColor = vec4(c * halo + vec3(core) * min(1.0, dot(c, vec3(0.3333))) * 0.9, halo);
        }` : /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        varying vec2 vUv;
        varying float vT;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float d = length(p);
          float r = mix(0.95, 0.15, vT * vT);
          float edge = 1.0 - smoothstep(r - 0.08, r, d);
          if (edge < 0.02) discard;
          float lit = smoothstep(-0.25, 0.1, dot(p, vec2(-0.45, 0.89)) + 0.15);
          vec3 c = max(vColor, vec3(0.0)) * mix(0.68, 1.12, lit);
          gl_FragColor = vec4(c, edge * min(1.0, vAlpha * 1.6) * 0.92);
        }`,
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 10 : 5;
  }

  emit(
    x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number,
    r: number, g: number, b: number, size: number,
    gravity = 0, drag = 0, sizeEnd = 0, stretch = 0,
  ): void {
    const i = this.cursor;
    const o = i * 4;
    const P = this.aPos.array as Float32Array, V = this.aVel.array as Float32Array;
    const C = this.aCol.array as Float32Array, E = this.aExt.array as Float32Array;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = this.time;
    V[o] = vx; V[o + 1] = vy; V[o + 2] = vz; V[o + 3] = life;
    C[o] = r; C[o + 1] = g; C[o + 2] = b; C[o + 3] = size;
    E[o] = gravity; E[o + 1] = drag; E[o + 2] = sizeEnd; E[o + 3] = stretch;
    if (this.dirtyStart < 0) { this.dirtyStart = i; this.dirtyEnd = i; }
    else if (i < this.dirtyStart) this.wrapped = true;
    else this.dirtyEnd = i;
    this.cursor = (i + 1) % this.capacity;
  }

  burst(o: BurstOptions): void {
    const base = o.color instanceof Color ? o.color : tmpColor.set(o.color);
    const br = base.r, bg = base.g, bb = base.b;
    const intensity = o.intensity ?? 1;
    let dx = 0, dy = 1, dz = 0;
    if (o.dir) {
      const l = Math.hypot(o.dir[0], o.dir[1], o.dir[2]) || 1;
      dx = o.dir[0] / l; dy = o.dir[1] / l; dz = o.dir[2] / l;
    }
    const spread = o.dir ? (o.spread ?? 0.5) : Math.PI;
    for (let n = 0; n < o.count; n++) {
      // Random direction inside a cone around (dx,dy,dz).
      let ux = Math.random() * 2 - 1, uy = Math.random() * 2 - 1, uz = Math.random() * 2 - 1;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      const s = Math.random() * (spread / Math.PI);
      let vx = dx + (ux - dx) * s * 2, vy = dy + (uy - dy) * s * 2, vz = dz + (uz - dz) * s * 2;
      if (!o.dir) { vx = ux; vy = uy; vz = uz; }
      const vl = Math.hypot(vx, vy, vz) || 1;
      const sp = o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]);
      vx = (vx / vl) * sp; vy = (vy / vl) * sp; vz = (vz / vl) * sp * 0.6;
      const cv = o.colorVar ?? 0.2;
      const k = intensity * (1 - cv * 0.5 + Math.random() * cv);
      const j = o.jitter ?? 0;
      const jy = o.jitterY ?? j;
      this.emit(
        o.x + (Math.random() * 2 - 1) * j, o.y + (Math.random() * 2 - 1) * jy, (o.z ?? 0) + (Math.random() * 2 - 1) * j * 0.6,
        vx, vy, vz,
        o.life[0] + Math.random() * (o.life[1] - o.life[0]),
        br * k, bg * k, bb * k,
        o.size[0] + Math.random() * (o.size[1] - o.size[0]),
        o.gravity ?? 0, o.drag ?? 0, o.sizeEnd ?? 0.2, o.stretch ?? 0,
      );
    }
  }

  update(time: number): void {
    this.time = time;
    this.material.uniforms.uTime.value = time;
    if (this.dirtyStart < 0) return;
    for (const a of [this.aPos, this.aVel, this.aCol, this.aExt]) {
      a.clearUpdateRanges();
      if (this.wrapped) a.addUpdateRange(0, this.capacity * 4);
      else a.addUpdateRange(this.dirtyStart * 4, (this.dirtyEnd - this.dirtyStart + 1) * 4);
      a.needsUpdate = true;
    }
    this.dirtyStart = this.dirtyEnd = -1;
    this.wrapped = false;
  }
}
