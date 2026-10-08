import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, Mesh,
  RingGeometry, ShaderMaterial, Vector3,
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

const TRAIL_N = 22;
const TRAIL_LIFE = 0.16;

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
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA; varying float vEdge;
        void main() { float a = vA * vA * mix(0.25, 1.0, vEdge); gl_FragColor = vec4(uColor * a, a); }`,
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

interface Pulse { mesh: Mesh; mat: ShaderMaterial; t: number; life: number; radius: number; active: boolean; kind: 'ring' | 'pillar' }

const ringGeo = new RingGeometry(0.7, 1, 48, 1);
ringGeo.rotateX(-Math.PI / 2);
const pillarGeo = new CylinderGeometry(1, 1, 1, 24, 1, true);
pillarGeo.translate(0, 0.5, 0);

function pulseMaterial(pillar: boolean): ShaderMaterial {
  return new ShaderMaterial({
    ...additiveShader(),
    uniforms: { uColor: { value: new Color() }, uT: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying float vR; void main() { vUv = uv; vR = length(position.xz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: pillar ? /* glsl */ `
      uniform vec3 uColor; uniform float uT; varying vec2 vUv; varying float vR;
      void main() { float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.5) * (1.0 - uT) * (1.0 - uT) * 0.4; gl_FragColor = vec4(uColor * a, a); }` : /* glsl */ `
      uniform vec3 uColor; uniform float uT; varying vec2 vUv; varying float vR;
      void main() { float edge = smoothstep(0.7, 0.97, vR) * (1.0 - smoothstep(0.97, 1.0, vR) * 0.6); float a = edge * max(0.0, 1.0 - uT) * max(0.0, 1.0 - uT); gl_FragColor = vec4(uColor * a, a); }`,
  });
}

export class Pulses {
  readonly group = new Group();
  private readonly pool: Pulse[] = [];

  constructor() {
    for (let i = 0; i < 14; i++) {
      const pillar = i >= 10;
      const mat = pulseMaterial(pillar);
      const mesh = new Mesh(pillar ? pillarGeo : ringGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      this.group.add(mesh);
      this.pool.push({ mesh, mat, t: 0, life: 0.4, radius: 1, active: false, kind: pillar ? 'pillar' : 'ring' });
    }
  }

  spawn(kind: 'ring' | 'pillar', x: number, y: number, radius: number, color: number, life = 0.45, intensity = 2.5): void {
    const p = this.pool.find((q) => !q.active && q.kind === kind) ?? this.pool.find((q) => q.kind === kind)!;
    p.active = true;
    p.t = 0;
    p.life = life;
    p.radius = radius;
    p.mesh.position.set(x, y, 0);
    p.mat.uniforms.uColor.value.setHex(color).multiplyScalar(intensity);
    p.mesh.visible = true;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.t += dt / p.life;
      if (p.t >= 1) { p.active = false; p.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - p.t, 3);
      if (p.kind === 'ring') p.mesh.scale.setScalar(0.2 + e * p.radius);
      else p.mesh.scale.set(p.radius * (0.6 + e * 0.6), 9 * (0.3 + e), p.radius * (0.6 + e * 0.6));
      p.mat.uniforms.uT.value = p.t;
    }
  }
}

// -----------------------------------------------------------------------------
// Lightning bolts
// -----------------------------------------------------------------------------

const BOLT_SEG = 14;

interface Bolt { mesh: Mesh; pos: Float32Array; t: number; active: boolean }

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
      this.group.add(mesh);
      this.bolts.push({ mesh, pos, t: 0, active: false });
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
    }
    b.mesh.geometry.attributes.position.needsUpdate = true;
    b.mesh.visible = true;
  }

  update(dt: number): void {
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.t += dt;
      const m = b.mesh.material as ShaderMaterial;
      const flicker = b.t < 0.08 ? 1 : Math.random() < 0.5 ? 0.2 : 0.8;
      m.uniforms.uColor.value.setHex(0xb8e4ff).multiplyScalar(4 * flicker * Math.max(0, 1 - b.t / 0.28));
      if (b.t > 0.28) { b.active = false; b.mesh.visible = false; }
    }
  }
}
