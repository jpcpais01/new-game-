import { AdditiveBlending, Color, CylinderGeometry, Mesh, PlaneGeometry, RingGeometry, type Scene, ShaderMaterial, TorusGeometry, Vector3 } from 'three';
import { ARENA_HALF_WIDTH } from '../../sim/constants';
import { glow, sceneToon, STYLE, texturedMaterial } from '../materials';
import { composeMatrix, MeshBuilder, prng } from '../meshBuilder';
import type { AtmosphereSettings, GradeSettings } from '../renderer';
import { Arena, type ArenaFx, type ArenaOptions } from './arena';
import {
  canvasTexture, cloud, cloudSea, finish, G, godRays, lightPools, makeLights, mountain, pine, rock, roundTree, skyDome, tuft,
} from './common';

/** Light sandstone ring tiles with teal inlay, worn and overgrown at the rim. */
function floorTexture(size: number) {
  return canvasTexture(size, (g, S, rnd) => {
    const k = S / 1024;
    const cx = S / 2;
    g.fillStyle = '#6e604f';
    g.fillRect(0, 0, S, S);
    const rings = [0, 70, 140, 215, 290, 365, 440, 512].map((r) => r * k);
    for (let r = 1; r < rings.length - 1; r++) {
      const r0 = rings[r], r1 = rings[r + 1];
      const n = 10 + r * 7;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const L = 55 + rnd() * 10 - (r % 2) * 4;
        g.fillStyle = `hsl(${28 + rnd() * 14}, ${16 + rnd() * 12}%, ${L}%)`;
        g.beginPath();
        g.arc(cx, cx, r1 - 3 * k, a0 + 0.008, a1 - 0.008);
        g.arc(cx, cx, r0 + 3 * k, a1 - 0.008, a0 + 0.008, true);
        g.closePath();
        g.fill();
        // Bevelled edges: light lip on the outer edge, shade on the inner one.
        g.strokeStyle = `hsla(36, 30%, ${L + 12}%, 0.5)`;
        g.lineWidth = 3 * k;
        g.beginPath(); g.arc(cx, cx, r1 - 5 * k, a0 + 0.012, a1 - 0.012); g.stroke();
        g.strokeStyle = `hsla(24, 25%, ${L - 16}%, 0.45)`;
        g.beginPath(); g.arc(cx, cx, r0 + 5 * k, a0 + 0.012, a1 - 0.012); g.stroke();
      }
    }
    g.fillStyle = '#c9b597';
    g.beginPath(); g.arc(cx, cx, 70 * k, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(70,52,40,0.55)';
    g.lineWidth = 5 * k;
    for (const r of rings) { g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.stroke(); }
    // Teal inlay ring and an eight-point compass emblem.
    g.strokeStyle = '#2fb5a8';
    g.lineWidth = 12 * k;
    g.beginPath(); g.arc(cx, cx, 365 * k, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 5 * k;
    g.beginPath(); g.arc(cx, cx, 352 * k, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const long = i % 2 === 0;
      const r1 = (long ? 270 : 180) * k, w = long ? 0.11 : 0.09;
      g.fillStyle = long ? 'rgba(47,181,168,0.75)' : '#e3d2b0';
      g.beginPath();
      g.moveTo(cx + Math.cos(a - w) * 80 * k, cx + Math.sin(a - w) * 80 * k);
      g.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a + w) * 80 * k, cx + Math.sin(a + w) * 80 * k);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#e9d9b8';
    g.beginPath(); g.arc(cx, cx, 62 * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(47,181,168,0.8)';
    g.beginPath(); g.arc(cx, cx, 26 * k, 0, Math.PI * 2); g.fill();
    // Cracks.
    g.strokeStyle = 'rgba(60,44,34,0.35)';
    g.lineWidth = 2 * k;
    for (let i = 0; i < 40; i++) {
      let x = rnd() * S, y = rnd() * S;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 50 * k; y += (rnd() - 0.5) * 50 * k; g.lineTo(x, y); }
      g.stroke();
    }
    // Moss creeping in at the rim and in seams.
    for (let i = 0; i < 900; i++) {
      const a = rnd() * Math.PI * 2;
      const r = (380 + Math.pow(rnd(), 0.5) * 140) * k;
      g.fillStyle = `rgba(${80 + rnd() * 30},${130 + rnd() * 30},${60 + rnd() * 20},${0.25 + rnd() * 0.4})`;
      g.beginPath(); g.arc(cx + Math.cos(a) * r, cx + Math.sin(a) * r, (3 + rnd() * 9) * k, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '40,30,20' : '255,250,235'},${rnd() * 0.07})`;
      const s = (2 + rnd() * 7) * k;
      g.fillRect(rnd() * S, rnd() * S, s, s);
    }
  }, 11);
}

/** Additive ring of glowing rune dashes drifting around the floor inlay. */
function runeRing(r: number, w: number, color: number): Mesh {
  const geo = new RingGeometry(r - w / 2, r + w / 2, 160, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false,
    polygonOffset: true, polygonOffsetFactor: -1,
    uniforms: { uColor: { value: new Color(color) }, uTime: STYLE.uTime },
    vertexShader: /* glsl */ `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime; varying vec3 vP;
      void main() {
        float a = atan(vP.z, vP.x);
        float t = fract(a * 9.549 + uTime * 0.05);        // 60 glyph cells around the ring
        float glyph = step(0.18, t) * step(t, 0.82) * (0.55 + 0.45 * step(0.5, fract(t * 3.0 + floor(a * 9.549) * 0.37)));
        float pulse = 0.55 + 0.45 * sin(a * 2.0 - uTime * 1.3);
        float k = glyph * pulse * 0.9;
        gl_FragColor = vec4(uColor * k, 1.0);
      }`,
  });
  mat.userData.own = true;
  const m = new Mesh(geo, mat);
  m.position.y = 0.02;
  m.renderOrder = 2;
  return m;
}

/**
 * Skyreach Highlands: a sun-washed stone ring on a mountain meadow, with
 * ruined columns, wind-blown grass and trees, and snowy peaks rising out of a
 * sea of clouds at golden hour. No crowd.
 */
export class Highlands extends Arena {
  readonly grade: GradeSettings = { sat: 1.1, contrast: 1.08, shadows: [-0.015, 0.0, 0.035], highlights: [0.035, 0.016, -0.015], bloom: 1.05, vignette: 0.5 };
  readonly atmosphere: AtmosphereSettings = {
    fog: 0xf2c9b4, sun: 0xffd29a, sunDir: [-0.5, 0.1, -1], density: 0.0045, falloff: 0.03, baseY: -18, max: 0.8, glow: 0.5, ao: 0.4,
  };
  private readonly rays: ShaderMaterial | null;

  constructor(scene: Scene, opts: ArenaOptions) {
    super(scene, opts);
    const d = opts.detail;
    this.brazierColor = 0x5ff0e0;
    this.setMood({
      shadow: [0.4, 0.4, 0.68], mid: [0.8, 0.76, 0.86], lit: [1.08, 1.0, 0.88], skyFill: [0.07, 0.09, 0.16],
      term: [0.2, 0.07, 0.0], groundY: -0.4,
    }, 0xeec7b4, 70, 420);

    this.key = makeLights(this.group, {
      key: 0xffe4bf, keyPos: [-9, 12, 7], sky: 0xa8c8ff, ground: 0x7a8a52, rim: 0xffbf86, rimIntensity: 1.6,
      shadows: opts.shadows, shadowMapSize: opts.shadowMapSize,
    });

    const sky = skyDome({ zenith: 0x2a5cc4, mid: 0x86b4ea, horizon: 0xffd0a6, ground: 0xeec7b4, sunDir: new Vector3(-0.5, 0.1, -1), sunColor: 0xfff0c8, sunSize: 1.4,
      clouds: { lit: 0xfff4ec, shade: 0xc9b2d6, cover: 0.56, scale: 1.1, speed: 1 } });
    sky.material.userData.own = true;
    this.group.add(sky);

    const rnd = prng(42);
    const near = new MeshBuilder();
    const far = new MeshBuilder();
    const windy = new MeshBuilder();
    const lines = new MeshBuilder();
    const skyB = new MeshBuilder();

    // --- Arena platform ---------------------------------------------------------
    const floorMat = texturedMaterial(floorTexture(d >= 2 ? 1024 : 512), 'hl-floor');
    floorMat.userData.own = true;
    const floor = new Mesh(new CylinderGeometry(15, 15, 0.5, 72, 1), [sceneToon(0x9a8a72), floorMat, sceneToon(0x9a8a72)]);
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    this.group.add(floor);
    const stone = 0xb8a68a, stoneDark = 0x8a7a68;
    const rimGeo = new TorusGeometry(15.1, 0.32, 6, 72);
    near.add(rimGeo, composeMatrix(0, -0.12, 0, Math.PI / 2, 0, 0, [1, 1, 0.7]), 0xcbb998);
    lines.add(rimGeo, composeMatrix(0, -0.12, 0, Math.PI / 2, 0, 0, [1, 1, 0.7]), 0xcbb998);
    near.add(new CylinderGeometry(15.9, 16.4, 0.5, 72, 1, true), composeMatrix(0, -0.45, 0), stoneDark);
    near.add(new RingGeometry(15.3, 15.95, 72, 1), composeMatrix(0, -0.2, 0, -Math.PI / 2), stone);

    // Lane boundary runes.
    for (const s of [-1, 1]) {
      const line = new Mesh(G.plane(), glow(0x5ff0e0, 1.2));
      line.scale.set(0.14, 6, 1);
      line.rotation.x = -Math.PI / 2;
      line.position.set(s * (ARENA_HALF_WIDTH + 0.45), 0.012, 0);
      this.group.add(line);
    }

    // Gate pillars with floating crystals at the lane ends.
    for (const sx of [-1, 1]) {
      const x = sx * (ARENA_HALF_WIDTH + 1.6);
      for (const z of [-2.2, 2.2]) {
        for (const b of [near, lines]) {
          b.put(G.cyl(8), stone, x, 0, z, { s: [0.85, 0.45, 0.85] });
          b.put(G.cyl(10), 0xd2c3a6, x, 0.45, z, { s: [0.5, 4.6, 0.5] });
          b.put(G.cyl(8), stone, x, 5.0, z, { s: [0.75, 0.4, 0.75] });
        }
        this.braziers.push(new Vector3(x, 6.6, z));
        const crystal = new Mesh(G.ico(0), glow(0x6ff7e8, 2.4));
        crystal.scale.set(0.32, 0.6, 0.32);
        crystal.position.set(x, 6.4, z);
        crystal.userData.bob = Math.random() * 6;
        this.crystals.push(crystal);
        this.group.add(crystal);
      }
      for (const b of [near, lines]) b.put(G.cyl(4), 0xc9b897, x, 5.4, 0, { s: [0.75, 0.6, 3.5], ry: Math.PI / 4, rx: 0 });
      for (const b of [near, lines]) b.put(G.cyl(8), 0x2fb5a8, x, 5.1, 0, { s: [0.35, 0.25, 0.35] });
    }

    // Pools of crystal light at the gates and a slow rune circle in the inlay.
    this.group.add(lightPools(this.braziers.map((b) => ({ x: b.x, z: b.z, r: 2.4 })), 0x5ff0e0, 0.5));
    this.group.add(runeRing(10.7, 0.22, 0x5ff0e0));

    // --- Meadow ground ----------------------------------------------------------
    const ground = new PlaneGeometry(320, 130, 80, 32);
    ground.rotateX(-Math.PI / 2);
    const gDark = new Color(0x4e8c3c), gPath = new Color(0x9c9a62);
    far.addFn(ground, composeMatrix(0, -0.4, -2), (p, _n, out) => {
      const nse = Math.sin(p.x * 0.11) * Math.cos(p.z * 0.13) + Math.sin(p.x * 0.031 + p.z * 0.05) * 0.8;
      out.setHex(0x7fb24a).lerp(gDark, Math.min(1, Math.max(0, 0.5 + nse * 0.4)));
      const r = Math.hypot(p.x, p.z);
      if (r < 18) out.lerp(gPath, Math.min(1, (18 - r) / 4) * 0.6);
      if (p.z < -55) out.setHex(0x6a8a50);
    });
    // Cliff edge: a ragged band of rocks dropping away behind the meadow.
    for (let i = 0; i < 60; i++) {
      const x = -150 + i * 5 + rnd() * 3;
      rock(far, rnd, x, -3 - rnd() * 3, -66 - rnd() * 4, 5 + rnd() * 4, i % 3 ? 0x8b86a8 : 0x77739a, 0x6f9a52);
    }

    // --- Sea of clouds and distant peaks ---------------------------------------
    this.group.add(cloudSea(-19, -300, 1400, 520, 0xfff1e8, 0xc8a8c8, new Vector3(-0.5, 0.1, -1)));
    for (let i = 0; i < 70; i++) {
      const x = -260 + rnd() * 520, z = -90 - rnd() * 230;
      cloud(far, rnd, x, -16 + rnd() * 4, z, 9 + rnd() * 12, rnd() < 0.5 ? 0xfff2ea : 0xf8dfe8, 0.4);
    }
    const mtn = { rock: 0x7a78ad, rockDark: 0x5a5a90, snow: 0xf7f3ff, snowLine: 0.62 };
    for (let i = 0; i < 9; i++) mountain(far, rnd, -200 + i * 50 + rnd() * 20, -130 - rnd() * 25, 34 + rnd() * 26, 22 + rnd() * 10, mtn, -18);
    const mtn2 = { rock: 0x8f8fc0, rockDark: 0x7272a8, snow: 0xfaf6ff, snowLine: 0.55 };
    for (let i = 0; i < 8; i++) mountain(far, rnd, -260 + i * 75 + rnd() * 30, -230 - rnd() * 40, 60 + rnd() * 40, 40 + rnd() * 15, mtn2, -18);
    // Floating island with its own little tree.
    const fx = -62, fy = 26, fz = -150;
    far.put(G.cone(7), 0x7c7098, fx, fy, fz, { rx: Math.PI, s: [9, 12, 8] });
    far.put(G.cyl(9), 0x6fae4a, fx, fy - 0.2, fz, { s: [9.2, 0.8, 8.2] });
    roundTree(far, rnd, fx - 2, fz, 2.2, 0xffa8c8, 0xe0709a, 0x6b4a32, fy + 0.6);
    pine(far, rnd, fx + 3, fz + 1, 2.4, 0x3f8a52, 0x2a6a44, fy + 0.6);

    // Sky clouds (no fog, always crisp).
    for (let i = 0; i < 12; i++) {
      cloud(skyB, rnd, -300 + i * 52 + rnd() * 30, 40 + rnd() * 50, -300 - rnd() * 40, 12 + rnd() * 10, 0xffffff, 0.5);
    }

    // --- Ruins, trees, rocks and grass around the ring --------------------------
    const ruins = 8;
    for (let i = 0; i < ruins; i++) {
      const a = Math.PI * 0.62 + (i / (ruins - 1)) * Math.PI * 0.76; // back arc (-Z)
      const r = 19 + rnd() * 3;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const h = 1.2 + rnd() * 4.5;
      for (const b of [near, lines]) {
        b.put(G.cyl(8), stone, x, -0.3, z, { s: [0.95, 0.5, 0.95] });
        b.put(G.cyl(10), 0xd0c0a2, x, 0.2, z, { s: [0.55, h, 0.55], rz: (rnd() - 0.5) * 0.08 });
      }
      if (rnd() < 0.6) near.put(G.cyl(10), 0xc7b697, x + 1.4, 0.3, z + 0.6, { s: [0.5, 1.4, 0.5], rz: Math.PI / 2, ry: rnd() * 3 });
      if (h > 4) near.put(G.cyl(4), 0xc9b897, x, 0.2 + h, z, { s: [0.75, 0.35, 0.75], ry: Math.PI / 4 });
    }
    // Banners on poles beside the gates.
    for (const sx of [-1, 1]) {
      const x = sx * 13.5;
      near.put(G.cyl(6), 0x6b4a32, x, 0, -6, { s: [0.08, 6.5, 0.08] });
      near.put(G.ico(0), 0xf3c24f, x, 6.6, -6, { s: 0.16 });
      const banner = new PlaneGeometry(1.1, 3, 1, 6);
      banner.translate(0.6, -1.5, 0);
      windy.addFn(banner, composeMatrix(x, 6.3, -6, 0, sx > 0 ? Math.PI : 0, 0), (p, _n, out) => {
        out.setHex(sx < 0 ? 0x2f5be0 : 0xd8343f);
        if (p.y < 3.5) out.setHex(0xf3c24f);
        return Math.min(1, Math.abs(p.x - x) * 0.9) * 0.9 + 0.1;
      });
    }

    const treeCount = [14, 26, 42][d];
    for (let i = 0, placed = 0; i < 400 && placed < treeCount; i++) {
      const x = (rnd() - 0.5) * 150, z = -15 - rnd() * 45;
      if (Math.abs(x) < 16 && z > -24) continue;
      if (Math.abs(x) < 30 && rnd() < 0.75) continue; // keep the vista behind the duel open
      placed++;
      const kind = rnd();
      if (kind < 0.42) pine(near, rnd, x, z, 1.4 + rnd() * 1.4, 0x3f8f58, 0x24604a, -0.4);
      else if (kind < 0.62) roundTree(near, rnd, x, z, 1.3 + rnd() * 0.8, 0xffb3cf, 0xe77aa3, 0x6b4a32, -0.4);
      else roundTree(near, rnd, x, z, 1.4 + rnd() * 1.0, 0x8fc456, 0x4f9a46, 0x6b4a32, -0.4);
    }
    // Side groves (frame the shot in distant zoom).
    for (const sx of [-1, 1]) for (let i = 0; i < 3 + d * 2; i++) {
      const x = sx * (26 + rnd() * 30), z = -10 + rnd() * 18;
      if (rnd() < 0.5) pine(near, rnd, x, z, 1.6 + rnd(), 0x3f8f58, 0x24604a, -0.4);
      else roundTree(near, rnd, x, z, 1.6 + rnd() * 0.8, 0x8fc456, 0x4f9a46, 0x6b4a32, -0.4);
    }
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2, r = 17 + rnd() * 40;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (z > 10) continue;
      rock(near, rnd, x, -0.4, z, 0.5 + rnd() * 1.3, 0x9a94b4, 0x74a852);
    }
    const tufts = [300, 800, 1500][d];
    for (let i = 0; i < tufts; i++) {
      const a = rnd() * Math.PI * 2, r = 15.8 + Math.pow(rnd(), 0.7) * 45;
      const x = Math.sin(a) * r * 1.4, z = Math.cos(a) * r;
      if (z > 13) continue;
      tuft(windy, rnd, x, z, 1 + rnd() * 0.8, 0x4f8a3a, rnd() < 0.15 ? 0xe8d878 : 0xa8d860, -0.4);
      if (rnd() < 0.12) {
        const c = [0xffffff, 0xffe066, 0xff8ab0, 0xb88cff][Math.floor(rnd() * 4)];
        windy.put(G.ico(0), c, x + 0.15, 0.1 + rnd() * 0.25, z, { s: 0.09, wind: 0.8 });
      }
    }

    finish(this.group, near, far, lines, windy, skyB, opts.shadows);
    const r = godRays(0xffd9a8, d >= 1 ? 4 : 0, new Vector3(-30, 20, -40), rnd);
    this.rays = d >= 1 ? r.mat : null;
    if (d >= 1) { r.mesh.material.userData.own = true; this.group.add(r.mesh); }
  }

  private readonly crystals: Mesh[] = [];

  protected animate(time: number): void {
    if (this.rays) this.rays.uniforms.uTime.value = time;
    for (const c of this.crystals) {
      c.position.y = 6.4 + Math.sin(time * 1.6 + c.userData.bob) * 0.15;
      c.rotation.y = time * 0.8 + c.userData.bob;
    }
  }

  protected ambient(_time: number, fx: ArenaFx): void {
    const d = this.opts.detail;
    // Drifting blossom petals and rising pollen motes.
    if (Math.random() < 0.35 + d * 0.25) {
      const x = -26 + Math.random() * 40, y = 3 + Math.random() * 6, z = -10 + Math.random() * 14;
      fx.smoke.emit(x, y, z, 1.2 + Math.random() * 0.8, -0.35, 0.1, 6, 1.0, 0.72, 0.84, 0.07, 0, 0, 1, 0);
    }
    if (Math.random() < 0.3 + d * 0.2) {
      fx.add.emit((Math.random() - 0.5) * 34, Math.random() * 1.5, -2 - Math.random() * 10, (Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.3, 0, 5,
        1.6, 1.4, 0.6, 0.045 + Math.random() * 0.03, -0.02, 0.1, 0.4, 0);
    }
  }
}
