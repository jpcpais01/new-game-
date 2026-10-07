import {
  BackSide, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CapsuleGeometry, Color, CylinderGeometry,
  DirectionalLight, DoubleSide, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshToonMaterial, PlaneGeometry, Quaternion, RingGeometry, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace,
  TorusGeometry, Vector3, type IUniform,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA_HALF_WIDTH } from '../../sim/constants';
import { glow, sceneToon, toonGradient } from '../materials';
import type { Particles } from '../fx/particles';

export interface ArenaOptions {
  shadows: boolean;
  shadowMapSize: number;
  crowd: number;
}

/** Procedural floor texture: stone tiles, rings and a central sigil. */
function floorTexture(): CanvasTexture {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const cx = size / 2;
  g.fillStyle = '#4a4552';
  g.fillRect(0, 0, size, size);
  // Radial tiles
  const rings = [60, 120, 190, 260, 330, 400, 470, 512];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < rings.length - 1; r++) {
    const r0 = rings[r], r1 = rings[r + 1];
    const n = 8 + r * 6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const l = 30 + rnd() * 9 + (r % 2) * 5;
      g.fillStyle = `hsl(${22 + rnd() * 18}, ${10 + rnd() * 8}%, ${l}%)`;
      g.beginPath();
      g.arc(cx, cx, r1 - 3, a0 + 0.006, a1 - 0.006);
      g.arc(cx, cx, r0 + 3, a1 - 0.006, a0 + 0.006, true);
      g.closePath();
      g.fill();
    }
  }
  // Grout lines
  g.strokeStyle = 'rgba(20,16,30,0.6)';
  g.lineWidth = 4;
  for (const r of rings) { g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.stroke(); }
  // Gold inlay ring + sigil
  g.strokeStyle = '#d9b25a';
  g.lineWidth = 10;
  g.beginPath(); g.arc(cx, cx, 330, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 6;
  g.beginPath(); g.arc(cx, cx, 120, 0, Math.PI * 2); g.stroke();
  // Sunburst emblem: alternating long and short rays.
  g.fillStyle = '#d9b25a';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const long = i % 2 === 0;
    const r0 = 128, r1 = long ? 300 : 210, w = long ? 0.06 : 0.04;
    g.beginPath();
    g.moveTo(cx + Math.cos(a - w) * r0, cx + Math.sin(a - w) * r0);
    g.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
    g.lineTo(cx + Math.cos(a + w) * r0, cx + Math.sin(a + w) * r0);
    g.closePath();
    g.fill();
  }
  g.beginPath(); g.arc(cx, cx, 60, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4a4552';
  g.beginPath(); g.arc(cx, cx, 44, 0, Math.PI * 2); g.fill();
  // Wear / noise
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.06})`;
    const s = 2 + rnd() * 8;
    g.fillRect(rnd() * size, rnd() * size, s, s);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function skyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        float h = vDir.y;
        vec3 zenith = vec3(0.05, 0.04, 0.16);
        vec3 mid = vec3(0.32, 0.12, 0.38);
        vec3 horizon = vec3(1.0, 0.45, 0.28);
        vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.18, h));
        col = mix(col, zenith, smoothstep(0.15, 0.6, h));
        // Sun glow behind the arena.
        vec3 sunDir = normalize(vec3(-0.35, 0.06, -1.0));
        float s = max(0.0, dot(vDir, sunDir));
        col += vec3(1.0, 0.55, 0.3) * pow(s, 24.0) * 1.2 + vec3(1.0, 0.8, 0.5) * pow(s, 400.0) * 4.0;
        // Stars.
        vec3 sp = floor(vDir * 220.0);
        float st = step(0.9975, hash(sp)) * smoothstep(0.2, 0.6, h);
        st *= 0.6 + 0.4 * sin(uTime * 2.0 + hash(sp + 3.0) * 30.0);
        col += vec3(st) * 1.5;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function mountains(z: number, height: number, color: number, seed: number): Mesh {
  const n = 80;
  const width = 260;
  const pos: number[] = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let prev = 0;
  for (let i = 0; i <= n; i++) {
    const x = -width / 2 + (i / n) * width;
    const y = Math.max(0, height * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.37 + seed)) * (0.6 + rnd() * 0.4)));
    const h = prev * 0.4 + y * 0.6;
    prev = h;
    pos.push(x, -2, z, x, h, z);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return new Mesh(g, new MeshBasicMaterial({ color, fog: true }));
}

/**
 * The arena: sky, mountains, stone platform, gate pillars with braziers,
 * curved stands with an instanced crowd, and banners. Static geometry is
 * merged so the whole set costs only a handful of draw calls.
 */
export class Arena {
  readonly group = new Group();
  readonly key: DirectionalLight;
  private readonly sky: ShaderMaterial;
  private readonly crowdTime: IUniform<number> = { value: 0 };
  private readonly crowdExcite: IUniform<number> = { value: 0 };
  private readonly bannerTime: IUniform<number> = { value: 0 };
  private excitement = 0;
  readonly braziers: Vector3[] = [];
  private emberAcc = 0;

  constructor(scene: Scene, opts: ArenaOptions) {
    scene.add(this.group);

    // Lights
    const hemi = new HemisphereLight(0x8f86ff, 0x3a2418, 0.85);
    this.group.add(hemi);
    this.key = new DirectionalLight(0xffd2a0, 3.0);
    this.key.position.set(5, 12, 9);
    this.key.target.position.set(0, 0, 0);
    this.group.add(this.key, this.key.target);
    if (opts.shadows) {
      this.key.castShadow = true;
      const sc = this.key.shadow.camera;
      sc.left = -12; sc.right = 12; sc.top = 7; sc.bottom = -4; sc.near = 2; sc.far = 30;
      this.key.shadow.mapSize.set(opts.shadowMapSize, opts.shadowMapSize);
      this.key.shadow.bias = -0.0008;
      this.key.shadow.normalBias = 0.03;
    }
    const rim = new DirectionalLight(0x6fc8ff, 2.0);
    rim.position.set(-8, 6, -10);
    this.group.add(rim);

    // Sky + mountains
    this.sky = skyMaterial();
    const sky = new Mesh(new SphereGeometry(150, 32, 16), this.sky);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.group.add(sky);
    this.group.add(mountains(-110, 22, 0x4a2a52, 3));
    this.group.add(mountains(-80, 14, 0x3a2040, 11));
    this.group.add(mountains(-60, 8, 0x2a1830, 29));

    // Floor
    const floorTop = new MeshToonMaterial({ map: floorTexture(), gradientMap: toonGradient() });
    const floorSide = sceneToon(0x4c4658);
    const floor = new Mesh(new CylinderGeometry(15, 15.6, 1.4, 72), [floorSide, floorTop, floorSide]);
    floor.position.y = -0.7;
    floor.receiveShadow = true;
    this.group.add(floor);
    const lip = new Mesh(new TorusGeometry(15, 0.22, 6, 72), sceneToon(0xd9b25a));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.02;
    this.group.add(lip);

    // Boundary rune lines at the walls of the fighting lane.
    for (const s of [-1, 1]) {
      const line = new Mesh(new BoxGeometry(0.08, 0.02, 6), glow(s < 0 ? 0x5a8dff : 0xff5a6a, 2.2));
      line.position.set(s * (ARENA_HALF_WIDTH + 0.45), 0.02, 0);
      this.group.add(line);
    }

    this.buildPillars();
    this.buildStands(opts.crowd);
    this.buildBanners();

    scene.background = new Color(0x1a1028);
  }

  private buildPillars(): void {
    const stone: BufferGeometry[] = [];
    const gold: BufferGeometry[] = [];
    const m = new Matrix4();
    const q = new Quaternion();
    const add = (list: BufferGeometry[], g: BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      m.compose(new Vector3(x, y, z), q, new Vector3(sx, sy, sz));
      list.push(g.clone().applyMatrix4(m));
    };
    const shaft = new CylinderGeometry(0.55, 0.65, 6, 12);
    const base = new BoxGeometry(1.6, 0.6, 1.6);
    const capital = new BoxGeometry(1.5, 0.35, 1.5);
    const bowl = new CylinderGeometry(0.7, 0.35, 0.5, 12);
    for (const sx of [-1, 1]) {
      for (const z of [-2.2, 2.2]) {
        const x = sx * (ARENA_HALF_WIDTH + 1.6);
        add(stone, base, x, 0.3, z);
        add(stone, shaft, x, 3.3, z);
        add(gold, capital, x, 6.4, z);
        add(gold, bowl, x, 6.85, z);
        this.braziers.push(new Vector3(x, 7.15, z));
      }
      // Gate arch spanning the pillars.
      add(stone, new BoxGeometry(1.2, 0.8, 5.6), sx * (ARENA_HALF_WIDTH + 1.6), 6.0, 0);
    }
    const stoneMesh = new Mesh(mergeGeometries(stone), sceneToon(0x8a8299));
    stoneMesh.castShadow = false;
    stoneMesh.receiveShadow = true;
    const goldMesh = new Mesh(mergeGeometries(gold), sceneToon(0xd9b25a));
    this.group.add(stoneMesh, goldMesh);
    // Brazier flames: glowing cores (fire particles are emitted in update()).
    for (const b of this.braziers) {
      const core = new Mesh(new SphereGeometry(0.35, 10, 8), glow(0xff8a2a, 3));
      core.position.copy(b);
      core.scale.y = 0.6;
      this.group.add(core);
    }
  }

  private buildStands(crowdCount: number): void {
    // Curved tiers behind the arena.
    const tiers: BufferGeometry[] = [];
    // Three's cylinder angles start at +Z; the stands span the back half (-Z).
    const HALF = Math.PI * 0.42;
    const arc0 = Math.PI - HALF, arc1 = Math.PI + HALF;
    for (let t = 0; t < 4; t++) {
      const r = 19 + t * 2.4;
      const h = 1.2 + t * 1.3;
      const g = new CylinderGeometry(r, r, h, 48, 1, true, arc0, arc1 - arc0);
      g.translate(0, h / 2 - 0.2, 0);
      tiers.push(g);
      // Walkway on top of the tier (a flat ring segment, not a full disc).
      const top = new RingGeometry(r, r + 2.4, 48, 1, Math.PI / 2 - HALF, HALF * 2);
      top.rotateX(-Math.PI / 2);
      top.translate(0, h - 0.2, 0);
      top.deleteAttribute('uv');
      g.deleteAttribute('uv');
      tiers.push(top);
    }
    const wall = new Mesh(mergeGeometries(tiers), new MeshToonMaterial({ color: 0x3e3446, gradientMap: toonGradient(), side: DoubleSide }));
    this.group.add(wall);

    // Crowd: one instanced draw call, bobbing in the vertex shader.
    const body = new CapsuleGeometry(0.28, 0.45, 2, 6);
    body.translate(0, 0.5, 0);
    const mat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() });
    const time = this.crowdTime, excite = this.crowdExcite;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.uniforms.uExcite = excite;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uExcite;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float fid = float(gl_InstanceID);
          float ph = fid * 1.37;
          float jump = max(0.0, sin(uTime * (3.0 + mod(fid, 5.0)) + ph)) * (0.06 + uExcite * 0.35);
          transformed.y += jump;`);
    };
    const crowd = new InstancedMesh(body, mat, crowdCount);
    const m = new Matrix4();
    const q = new Quaternion();
    const palette = [0x3a6cf0, 0xe0404a, 0xffd36b, 0x7144d8, 0xff8a2a, 0x58c46b, 0xf3ede1, 0x2a2f45];
    const col = new Color();
    let seed = 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < crowdCount; i++) {
      const t = Math.floor(rnd() * 4);
      const r = 19 + t * 2.4 + 1.2;
      const a = arc0 + rnd() * (arc1 - arc0);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const s = 0.7 + rnd() * 0.25;
      m.compose(new Vector3(x, 1.2 + t * 1.3 - 0.2, z), q, new Vector3(s, s, s));
      crowd.setMatrixAt(i, m);
      crowd.setColorAt(i, col.setHex(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.18 + rnd() * 0.2));
    }
    crowd.instanceMatrix.needsUpdate = true;
    crowd.frustumCulled = false;
    this.group.add(crowd);
  }

  private buildBanners(): void {
    const time = this.bannerTime;
    const geo = new PlaneGeometry(1.4, 3.2, 1, 8);
    geo.translate(0, -1.6, 0);
    const make = (color: number) => {
      const m = new MeshToonMaterial({ color, gradientMap: toonGradient(), side: DoubleSide });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = time;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float k = -position.y / 3.2;
            transformed.z += sin(uTime * 2.0 + position.y * 1.5 + modelMatrix[3][0]) * 0.25 * k;`);
      };
      return m;
    };
    const blue = make(0x2f5fe0), red = make(0xd8343f);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = Math.PI - Math.PI * 0.36 + (i / (n - 1)) * Math.PI * 0.72;
      const r = 27.6;
      const b = new Mesh(geo, i < n / 2 ? blue : red);
      b.position.set(Math.sin(a) * r, 6.4, Math.cos(a) * r);
      b.lookAt(0, 6.4, 0);
      this.group.add(b);
    }
  }

  /** Crowd reacts to big moments. */
  excite(amount: number): void {
    this.excitement = Math.min(1, this.excitement + amount);
  }

  update(time: number, dt: number, fx: { add: Particles; smoke: Particles }): void {
    this.sky.uniforms.uTime.value = time;
    this.crowdTime.value = time;
    this.bannerTime.value = time;
    this.excitement = Math.max(0, this.excitement - dt * 0.35);
    this.crowdExcite.value = this.excitement;

    this.emberAcc += dt;
    if (this.emberAcc > 1 / 30) {
      this.emberAcc = 0;
      for (const b of this.braziers) {
        fx.add.burst({ x: b.x, y: b.y + 0.1, z: b.z, count: 2, jitter: 0.25, dir: [0, 1, 0], spread: 0.25, speed: [1, 2.4], life: [0.4, 0.8], size: [0.25, 0.45], color: 0xff7a22, intensity: 2.2, gravity: -1.5, sizeEnd: 0.1 });
      }
      // Ambient floating embers.
      if (Math.random() < 0.6) {
        fx.add.emit((Math.random() - 0.5) * 30, Math.random() * 2, -3 - Math.random() * 6, (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.5, 0, 5,
          2.0, 0.7, 0.3, 0.05 + Math.random() * 0.04, -0.05, 0.1, 0.4, 0);
      }
    }
  }
}
