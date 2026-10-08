import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, Mesh,
  PlaneGeometry, RingGeometry, ShaderMaterial, Vector3,
} from 'three';

const additiveShader = (doubleSided = true) => ({
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  side: doubleSided ? DoubleSide : undefined,
});

// -----------------------------------------------------------------------------
// Weapon trails
// -----------------------------------------------------------------------------

const TRAIL_N = 26;
const TRAIL_LIFE = 0.2;

/** Ribbon swept by the weapon (base→tip) over the last few frames. */
export class WeaponTrail {
  readonly mesh: Mesh;
  private readonly pos: Float32Array;
  private readonly alpha: Float32Array;
  private readonly samplesB: Vector3[] = [];
  private readonly samplesT: Vector3[] = [];
  private readonly ages: number[] = [];
  private readonly mat: ShaderMaterial;

  constructor(color: number) {
    const g = new BufferGeometry();
    this.pos = new Float32Array(TRAIL_N * 2 * 3);
    this.alpha = new Float32Array(TRAIL_N * 2);
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(35048));
    g.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1).setUsage(35048));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    this.mat = new ShaderMaterial({
      ...additiveShader(),
      uniforms: { uColor: { value: new Color(color).multiplyScalar(2.2) } },
      vertexShader: /* glsl */ `
        attribute float aAlpha; varying float vA; varying float vEdge;
        void main() { vA = aAlpha; vEdge = mod(float(gl_VertexID), 2.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // Crescent slash: transparent near the hilt, solid colour mid-blade and a
      // white-hot leading edge at the tip; the tail thins out as it ages.
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA; varying float vEdge;
        void main() {
          float a = clamp(vA, 0.0, 1.0);
          float body = smoothstep(0.05, 0.55, vEdge);
          float hot = smoothstep(0.8, 1.0, vEdge) * smoothstep(0.35, 0.9, a);
          float alpha = a * a * body;
          vec3 c = mix(uColor, vec3(2.4), hot * 0.75);
          gl_FragColor = vec4(c * alpha, alpha);
        }`,
    });
    this.mesh = new Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    for (let i = 0; i < TRAIL_N; i++) {
      this.samplesB.push(new Vector3()); this.samplesT.push(new Vector3()); this.ages.push(99);
    }
  }

  setColor(c: number): void { this.mat.uniforms.uColor.value.setHex(c).multiplyScalar(2.2); }

  update(dt: number, base: Vector3, tip: Vector3, emitting: boolean): void {
    for (let i = 0; i < TRAIL_N; i++) this.ages[i] += dt;
    if (emitting) {
      // Shift samples (tiny arrays; cheaper than a ring buffer for re-indexing).
      const lb = this.samplesB.pop()!, lt = this.samplesT.pop()!;
      this.ages.pop();
      lb.copy(base); lt.copy(tip);
      this.samplesB.unshift(lb); this.samplesT.unshift(lt); this.ages.unshift(0);
    }
    let any = false;
    for (let i = 0; i < TRAIL_N; i++) {
      const b = this.samplesB[i], t = this.samplesT[i];
      const o = i * 6;
      this.pos[o] = b.x; this.pos[o + 1] = b.y; this.pos[o + 2] = b.z;
      this.pos[o + 3] = t.x; this.pos[o + 4] = t.y; this.pos[o + 5] = t.z;
      const a = Math.max(0, 1 - this.ages[i] / TRAIL_LIFE) * (1 - i / TRAIL_N);
      this.alpha[i * 2] = a; this.alpha[i * 2 + 1] = a;
      if (a > 0) any = true;
    }
    this.mesh.visible = any;
    if (any) {
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
    }
  }
}

// -----------------------------------------------------------------------------
// Shockwave rings and light pillars
// -----------------------------------------------------------------------------

type PulseKind = 'ring' | 'pillar' | 'star' | 'crack';
interface Pulse { mesh: Mesh; mat: ShaderMaterial; t: number; life: number; radius: number; active: boolean; kind: PulseKind }

const ringGeo = new RingGeometry(0.7, 1, 48, 1);
ringGeo.rotateX(-Math.PI / 2);
const pillarGeo = new CylinderGeometry(1, 1, 1, 24, 1, true);
pillarGeo.translate(0, 0.5, 0);

/** Anime impact star: long thin spikes, drawn in the screen-facing XY plane. */
function starGeometry(points: number): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const len = i % 2 === 0 ? 1 : 0.55;
    const w = 0.13;
    pos.push(0, 0, 0, Math.cos(a - w) * 0.22, Math.sin(a - w) * 0.22, 0, Math.cos(a) * len, Math.sin(a) * len, 0);
    pos.push(0, 0, 0, Math.cos(a) * len, Math.sin(a) * len, 0, Math.cos(a + w) * 0.22, Math.sin(a + w) * 0.22, 0);
    uv.push(0, 0, 0.3, 0, 1, 0, 0, 0, 1, 0, 0.3, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  return g;
}
const starGeo = starGeometry(10);
const crackGeo = new PlaneGeometry(2, 2);
crackGeo.rotateX(-Math.PI / 2);

function crackMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { uColor: { value: new Color() }, uT: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    // Radial ground cracks with a glowing core that cools down to dark scorch.
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uT; uniform float uSeed; varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float ang = atan(p.y, p.x);
        float seg = ang * 1.5915 * 1.3 + sin(r * 11.0 + uSeed) * 0.22 + sin(r * 23.0 + uSeed * 2.0) * 0.08 + uSeed;
        float dl = abs(fract(seg) - 0.5) * 2.0;
        float w = 0.12 * (1.0 - r) + 0.02;
        float line = 1.0 - smoothstep(w * 0.5, w, 1.0 - dl);
        float ring = 1.0 - smoothstep(0.015, 0.04, abs(r - 0.42 - sin(ang * 5.0 + uSeed) * 0.05));
        float scorch = (1.0 - smoothstep(0.0, 0.55, r)) * 0.45;
        float m = max(max(line * (1.0 - r * 0.6), ring * 0.7 * step(r, 0.7)), scorch);
        float fade = 1.0 - smoothstep(0.55, 1.0, uT);
        float hot = (1.0 - smoothstep(0.0, 0.35, uT)) * (1.0 - r);
        vec3 c = mix(vec3(0.08, 0.06, 0.06), uColor * 2.5, clamp(hot * max(line, ring), 0.0, 1.0));
        float a = clamp(m * fade * 0.85, 0.0, 1.0);
        gl_FragColor = vec4(c, a);
      }`,
  });
}

function starMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    ...additiveShader(),
    uniforms: { uColor: { value: new Color() }, uT: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uT; varying vec2 vUv;
      void main() {
        float k = 1.0 - clamp(uT, 0.0, 1.0);
        float tip = clamp(vUv.x, 0.0, 1.0);
        float a = (1.0 - tip * 0.85) * k;
        vec3 c = mix(vec3(3.0), uColor, smoothstep(0.0, 0.6, tip));
        gl_FragColor = vec4(c * a, a);
      }`,
  });
}

function pulseMaterial(pillar: boolean): ShaderMaterial {
  return new ShaderMaterial({
    ...additiveShader(),
    uniforms: { uColor: { value: new Color() }, uT: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying float vR; void main() { vUv = uv; vR = length(position.xz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: pillar ? /* glsl */ `
      uniform vec3 uColor; uniform float uT; varying vec2 vUv; varying float vR;
      void main() { float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.5) * (1.0 - uT) * (1.0 - uT) * 0.4; gl_FragColor = vec4(uColor * a, a); }` : /* glsl */ `
      uniform vec3 uColor; uniform float uT; varying vec2 vUv; varying float vR;
      void main() {
        float k = max(0.0, 1.0 - uT);
        float band = smoothstep(0.7 + uT * 0.22, 0.76 + uT * 0.22, vR) * (1.0 - smoothstep(0.95, 1.0, vR));
        float inner = smoothstep(0.7, 1.0, vR) * 0.25;
        float a = (band + inner) * k * k;
        gl_FragColor = vec4(uColor * a * mix(1.6, 1.0, uT), a);
      }`,
  });
}

export class Pulses {
  readonly group = new Group();
  private readonly pool: Pulse[] = [];

  constructor() {
    const make = (kind: PulseKind, n: number) => {
      for (let i = 0; i < n; i++) {
        const mat = kind === 'star' ? starMaterial() : kind === 'crack' ? crackMaterial() : pulseMaterial(kind === 'pillar');
        const geo = kind === 'star' ? starGeo : kind === 'crack' ? crackGeo : kind === 'pillar' ? pillarGeo : ringGeo;
        const mesh = new Mesh(geo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = kind === 'crack' ? 3 : 9;
        this.group.add(mesh);
        this.pool.push({ mesh, mat, t: 0, life: 0.4, radius: 1, active: false, kind });
      }
    };
    make('ring', 10);
    make('pillar', 4);
    make('star', 6);
    make('crack', 4);
  }

  spawn(kind: PulseKind, x: number, y: number, radius: number, color: number, life = 0.45, intensity = 2.5): void {
    const p = this.pool.find((q) => !q.active && q.kind === kind) ?? this.pool.find((q) => q.kind === kind)!;
    p.active = true;
    p.t = 0;
    p.life = life;
    p.radius = radius;
    p.mesh.position.set(x, kind === 'crack' ? 0.025 : y, kind === 'star' ? 0.3 : 0);
    p.mat.uniforms.uColor.value.setHex(color).multiplyScalar(kind === 'crack' ? 1 : intensity);
    if (kind === 'star') p.mesh.rotation.z = Math.random() * Math.PI;
    if (kind === 'crack') { p.mat.uniforms.uSeed.value = Math.random() * 10; p.mesh.scale.setScalar(radius); p.mesh.rotation.y = Math.random() * 6; }
    p.mesh.visible = true;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.t += dt / p.life;
      if (p.t >= 1) { p.active = false; p.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - p.t, 3);
      if (p.kind === 'ring') p.mesh.scale.setScalar(0.2 + e * p.radius);
      else if (p.kind === 'star') p.mesh.scale.setScalar(p.radius * (p.t < 0.25 ? 0.4 + (p.t / 0.25) * 0.8 : 1.2 - (p.t - 0.25) * 0.5));
      else if (p.kind === 'pillar') p.mesh.scale.set(p.radius * (0.6 + e * 0.6), 9 * (0.3 + e), p.radius * (0.6 + e * 0.6));
      p.mat.uniforms.uT.value = p.t;
    }
  }
}

// -----------------------------------------------------------------------------
// Lightning bolts
// -----------------------------------------------------------------------------

const BOLT_SEG = 14;

interface Bolt { mesh: Mesh; pos: Float32Array; halo: Float32Array; t: number; active: boolean }

export class Lightning {
  readonly group = new Group();
  private readonly bolts: Bolt[] = [];
  private readonly mat: ShaderMaterial;

  constructor() {
    this.mat = new ShaderMaterial({
      ...additiveShader(),
      uniforms: { uColor: { value: new Color(0xb8e4ff).multiplyScalar(4) }, uA: { value: 1 } },
      vertexShader: /* glsl */ `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); }`,
    });
    for (let i = 0; i < 4; i++) {
      const g = new BufferGeometry();
      const pos = new Float32Array((BOLT_SEG + 1) * 2 * 3);
      g.setAttribute('position', new BufferAttribute(pos, 3).setUsage(35048));
      const idx: number[] = [];
      for (let s = 0; s < BOLT_SEG; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const mesh = new Mesh(g, this.mat.clone());
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 11;
      // Wide soft halo around the core (same geometry, scaled out in z-facing width via a second strip).
      const hg = new BufferGeometry();
      const hpos = new Float32Array(pos.length);
      hg.setAttribute('position', new BufferAttribute(hpos, 3).setUsage(35048));
      hg.setIndex(idx);
      const halo = new Mesh(hg, this.mat.clone());
      halo.frustumCulled = false;
      halo.renderOrder = 10;
      mesh.add(halo);
      this.group.add(mesh);
      this.bolts.push({ mesh, pos, halo: hpos, t: 0, active: false });
    }
  }

  strike(x: number, y: number, fromY = 12): void {
    const b = this.bolts.find((q) => !q.active) ?? this.bolts[0];
    b.active = true;
    b.t = 0;
    let cx = x + (Math.random() - 0.5) * 3;
    for (let s = 0; s <= BOLT_SEG; s++) {
      const k = s / BOLT_SEG;
      const py = fromY + (y - fromY) * k;
      const jitter = s === BOLT_SEG ? 0 : (Math.random() - 0.5) * 0.9;
      cx = cx + (x - cx) * (1 / (BOLT_SEG - s + 1)) + jitter;
      const px = s === BOLT_SEG ? x : cx;
      const w = 0.09 * (1 - k * 0.5);
      const o = s * 6;
      b.pos[o] = px - w; b.pos[o + 1] = py; b.pos[o + 2] = 0.2;
      b.pos[o + 3] = px + w; b.pos[o + 4] = py; b.pos[o + 5] = 0.2;
      const hw = w * 5;
      b.halo[o] = px - hw; b.halo[o + 1] = py; b.halo[o + 2] = 0.18;
      b.halo[o + 3] = px + hw; b.halo[o + 4] = py; b.halo[o + 5] = 0.18;
    }
    b.mesh.geometry.attributes.position.needsUpdate = true;
    ((b.mesh.children[0] as Mesh).geometry.attributes.position).needsUpdate = true;
    b.mesh.visible = true;
  }

  update(dt: number): void {
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.t += dt;
      const m = b.mesh.material as ShaderMaterial;
      const flicker = b.t < 0.08 ? 1 : Math.random() < 0.5 ? 0.2 : 0.8;
      m.uniforms.uColor.value.setHex(0xe8f6ff).multiplyScalar(4 * flicker * Math.max(0, 1 - b.t / 0.28));
      ((b.mesh.children[0] as Mesh).material as ShaderMaterial).uniforms.uColor.value.setHex(0x5aa8ff).multiplyScalar(0.5 * flicker * Math.max(0, 1 - b.t / 0.28));
      if (b.t > 0.28) { b.active = false; b.mesh.visible = false; }
    }
  }
}
