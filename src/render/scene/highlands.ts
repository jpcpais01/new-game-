import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute,
  InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, RingGeometry, type Scene, ShaderMaterial, TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA_HALF_WIDTH } from '../../sim/constants';
import { glow, sceneToon, STYLE, texturedMaterial } from '../materials';
import { composeMatrix, MeshBuilder, prng } from '../meshBuilder';
import type { AtmosphereSettings, GradeSettings } from '../renderer';
import { Arena, type ArenaFx, type ArenaOptions } from './arena';
import {
  canvasTexture, cloud, cloudSea, finish, G, godRays, lightPools, makeLights, mountain, pine, rock, roundTree, skyDome, tuft,
} from './common';

// -----------------------------------------------------------------------------
// Layout
//
// The duel sits on a stone dais near the tip of a grassy cliff-top plateau. A
// ruined colonnade and a great arch stand behind it; past the arch the ground
// ends at a cliff edge and the world drops away to a sea of clouds, with
// snowy peaks, floating islands and a distant mountain temple on the horizon.
// A stream runs down the right-hand hills and spills over the cliff as a
// waterfall. Everything static is merged into a handful of meshes.
// -----------------------------------------------------------------------------

const GROUND = -0.6;
const SEA_Y = -9;
const SUN = new Vector3(-0.55, 0.11, -1);

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Cliff edge line: the plateau ends here (z, as a function of x). */
const edgeZ = (x: number) => -38 - 2.6 * Math.sin(x * 0.08 + 0.5) - 1.6 * Math.sin(x * 0.21 + 2) + smooth(40, 110, Math.abs(x)) * 14;

/** Spring: a rocky outcrop right of the arch with a cascade into a pool. */
const POOL = new Vector3(15.5, 0, -28.6);
/** Stream centreline from the pool to the cliff lip. */
const STREAM = new CatmullRomCurve3([
  new Vector3(POOL.x, 0, POOL.z), new Vector3(15.8, 0, -31.5), new Vector3(14.6, 0, -34.5), new Vector3(13.6, 0, edgeZ(13.6) + 0.6),
]);
const STREAM_PTS = STREAM.getSpacedPoints(90);

function streamDist(x: number, z: number): number {
  let best = 1e9;
  for (const p of STREAM_PTS) {
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Uncarved terrain height. */
function hills(x: number, z: number): number {
  let y = 0.55 * Math.sin(x * 0.09 + 1) * Math.cos(z * 0.11) + 0.4 * Math.sin(x * 0.045 + z * 0.07 + 2);
  // Rolling hills on both flanks frame the shot and hide the plateau's ends.
  const side = smooth(24, 70, Math.abs(x));
  y += side * (5.5 + 3.5 * Math.sin(z * 0.07 + x * 0.03) + 2 * Math.sin(x * 0.11));
  // Level ground around the dais and along the processional path to the arch.
  const r = Math.hypot(x, z);
  const flat = 1 - smooth(17, 25, r);
  const path = (1 - smooth(3.5, 7.5, Math.abs(x))) * smooth(-6, -12, z) * smooth(edgeZ(x) + 1, edgeZ(x) + 5, z);
  const k = Math.max(flat, path * 0.85);
  // Behind the ruins the meadow slopes gently down to the cliff edge, so the
  // view opens onto the clouds below; a small lip marks the drop.
  const lip = smooth(edgeZ(x) + 5, edgeZ(x) + 1, z) * 0.3;
  const descent = smooth(-22, edgeZ(x) + 2, z) * 2.6;
  return GROUND + (y + lip) * (1 - k) - descent;
}

/** Ground height including the stream bed. */
function terrainY(x: number, z: number): number {
  const carve = 1 - smooth(1.1, 3.2, streamDist(x, z));
  return hills(x, z) - carve * 0.55;
}

// -----------------------------------------------------------------------------
// Dais floor texture
// -----------------------------------------------------------------------------

/** Weathered flagstone rings around an engraved sun medallion, mossy at the rim. */
function floorTexture(size: number) {
  return canvasTexture(size, (g, S, rnd) => {
    const k = S / 1024;
    const cx = S / 2;
    g.fillStyle = '#75684f';
    g.fillRect(0, 0, S, S);
    const rings = [92, 150, 212, 278, 350, 372, 440, 512];
    for (let r = 0; r < rings.length - 1; r++) {
      const r0 = rings[r] * k, r1 = rings[r + 1] * k;
      if (r === 4) continue; // the inlay band is painted below
      // Irregular stone widths around the ring.
      const target = Math.round((Math.PI * 2 * (r0 + r1) * 0.5) / ((r1 - r0) * (1.3 + rnd() * 0.4)));
      const cuts: number[] = [];
      let a = 0;
      for (let i = 0; i < target; i++) { cuts.push(a); a += (Math.PI * 2 / target) * (0.6 + rnd() * 0.8); }
      const scale = (Math.PI * 2) / a;
      const rot = rnd() * Math.PI;
      for (let i = 0; i < cuts.length; i++) {
        const a0 = cuts[i] * scale + rot, a1 = (i + 1 < cuts.length ? cuts[i + 1] : a) * scale + rot;
        const L = 50 + rnd() * 13 + (r % 2) * 3;
        const hue = 28 + rnd() * 14;
        const sat = 14 + rnd() * 14;
        const gap = 1.5 * k;
        const grd = g.createRadialGradient(cx, cx, r0, cx, cx, r1);
        grd.addColorStop(0, `hsl(${hue}, ${sat}%, ${L - 6}%)`);
        grd.addColorStop(0.5, `hsl(${hue}, ${sat}%, ${L}%)`);
        grd.addColorStop(1, `hsl(${hue + 4}, ${sat + 4}%, ${L + 4}%)`);
        g.fillStyle = grd;
        g.beginPath();
        g.arc(cx, cx, r1 - gap, a0 + gap / r1, a1 - gap / r1);
        g.arc(cx, cx, r0 + gap, a1 - gap / r0, a0 + gap / r0, true);
        g.closePath();
        g.fill();
        // Bevel: lit outer lip and a shaded inner edge.
        g.lineWidth = 2.5 * k;
        g.strokeStyle = `hsla(38, 35%, ${L + 16}%, 0.45)`;
        g.beginPath(); g.arc(cx, cx, r1 - gap - 2 * k, a0 + 0.01, a1 - 0.01); g.stroke();
        g.strokeStyle = `hsla(24, 30%, ${L - 22}%, 0.4)`;
        g.beginPath(); g.arc(cx, cx, r0 + gap + 2 * k, a0 + 0.01, a1 - 0.01); g.stroke();
        // Odd chipped corner.
        if (rnd() < 0.25) {
          const am = a0 + (a1 - a0) * rnd();
          g.fillStyle = '#75684f';
          g.beginPath(); g.arc(cx + Math.cos(am) * r1, cx + Math.sin(am) * r1, (4 + rnd() * 6) * k, 0, Math.PI * 2); g.fill();
        }
      }
    }
    // Inlay band: dark stone with a teal channel and gold edges.
    g.lineWidth = 22 * k;
    g.strokeStyle = '#3c3a40';
    g.beginPath(); g.arc(cx, cx, 361 * k, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 8 * k;
    g.strokeStyle = '#1f8f86';
    g.beginPath(); g.arc(cx, cx, 361 * k, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2.5 * k;
    g.strokeStyle = '#d8b66a';
    for (const rr of [350, 372]) { g.beginPath(); g.arc(cx, cx, rr * k, 0, Math.PI * 2); g.stroke(); }

    // Engraved sun medallion.
    const mg = g.createRadialGradient(cx, cx, 0, cx, cx, 92 * k);
    mg.addColorStop(0, '#e6d6b4');
    mg.addColorStop(1, '#cdb994');
    g.fillStyle = mg;
    g.beginPath(); g.arc(cx, cx, 90 * k, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(31,143,134,0.45)';
    g.lineWidth = 2.2 * k;
    for (const rr of [26, 60, 84]) { g.beginPath(); g.arc(cx, cx, rr * k, 0, Math.PI * 2); g.stroke(); }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r1 = (i % 2 ? 72 : 84) * k;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 30 * k, cx + Math.sin(a) * 30 * k);
      g.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
      g.stroke();
    }
    g.fillStyle = 'rgba(216,182,106,0.9)';
    g.beginPath(); g.arc(cx, cx, 12 * k, 0, Math.PI * 2); g.fill();

    // Cracks.
    g.strokeStyle = 'rgba(50,38,30,0.28)';
    g.lineWidth = 1.4 * k;
    for (let i = 0; i < 24; i++) {
      let x = rnd() * S, y = rnd() * S;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (rnd() - 0.5) * 46 * k; y += (rnd() - 0.5) * 46 * k; g.lineTo(x, y); }
      g.stroke();
    }
    // Moss in the outer seams and grass creeping over the rim.
    for (let i = 0; i < 1600; i++) {
      const a = rnd() * Math.PI * 2;
      const r = (400 + Math.pow(rnd(), 0.6) * 112) * k;
      g.fillStyle = `rgba(${70 + rnd() * 40},${118 + rnd() * 40},${52 + rnd() * 24},${0.22 + rnd() * 0.45})`;
      g.beginPath(); g.arc(cx + Math.cos(a) * r, cx + Math.sin(a) * r, (2 + rnd() * 8) * k, 0, Math.PI * 2); g.fill();
    }
    // Stains, grit and a few fallen blossom petals.
    for (let i = 0; i < 40; i++) {
      const x = rnd() * S, y = rnd() * S, r = (20 + rnd() * 70) * k;
      const sg = g.createRadialGradient(x, y, 0, x, y, r);
      sg.addColorStop(0, `rgba(${rnd() < 0.5 ? '50,40,30' : '255,245,220'},0.1)`);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sg;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '40,30,20' : '255,250,235'},${rnd() * 0.08})`;
      const s = (1.5 + rnd() * 5) * k;
      g.fillRect(rnd() * S, rnd() * S, s, s);
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,${150 + rnd() * 50},${190 + rnd() * 30},${0.5 + rnd() * 0.4})`;
      g.save();
      g.translate(rnd() * S * 0.5, rnd() * S);
      g.rotate(rnd() * 3);
      g.beginPath(); g.ellipse(0, 0, 4 * k, 2.2 * k, 0, 0, Math.PI * 2); g.fill();
      g.restore();
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

// -----------------------------------------------------------------------------
// Water
// -----------------------------------------------------------------------------

const WATER_VERT = /* glsl */ `
  attribute vec2 aFlow;   // x: across 0..1, y: distance along the flow (world units)
  varying vec2 vFlow;
  void main() {
    vFlow = aFlow;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uLen;
  uniform vec3 uDeep, uShallow, uFoam;
  varying vec2 vFlow;
  float hash(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float u = vFlow.x, v = vFlow.y;
    #ifdef FALL
      float flow = v * 0.22 - uTime * 1.7;
      float n = vnoise(vec2(u * 9.0, flow * 1.4)) * 0.65 + vnoise(vec2(u * 23.0, flow * 3.1)) * 0.35;
      float streak = smoothstep(0.5, 0.72, n);
      float lipFoam = 1.0 - smoothstep(0.0, 2.2, v);
      vec3 col = mix(uShallow, uFoam, streak * 0.75 + lipFoam * 0.8);
      float edge = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.88, u);
      col = mix(uFoam, col, edge);
      float a = (0.55 + 0.45 * n) * mix(0.6, 1.0, edge) * (1.0 - smoothstep(uLen * 0.55, uLen, v));
      gl_FragColor = vec4(max(col, vec3(0.0)), clamp(a, 0.0, 1.0));
    #else
      float flow = v * 0.45 - uTime * 0.85;
      float n = vnoise(vec2(u * 4.0 + sin(v * 0.4) * 0.6, flow * 2.0));
      float ripple = smoothstep(0.6, 0.68, n) - smoothstep(0.68, 0.8, n);
      float edge = smoothstep(0.0, 0.2, u) * smoothstep(1.0, 0.8, u);
      vec3 col = mix(uShallow, uDeep, edge * (0.6 + 0.4 * n));
      col = mix(col, uFoam, clamp(ripple * 0.7 + (1.0 - smoothstep(0.0, 0.1, min(u, 1.0 - u))) * 0.8, 0.0, 1.0));
      // Glint of the low sun across the surface.
      col += vec3(1.0, 0.85, 0.6) * smoothstep(0.82, 0.9, vnoise(vec2(u * 7.0, v * 0.9 - uTime * 1.3))) * 0.5;
      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    #endif
  }`;

/** Triangle strip along `pts` with a width at each point (side vector given per point). */
function ribbon(pts: Vector3[], side: (i: number) => Vector3, width: (i: number) => number): BufferGeometry {
  const pos: number[] = [], flow: number[] = [], idx: number[] = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) dist += pts[i].distanceTo(pts[i - 1]);
    const s = side(i).multiplyScalar(width(i) / 2);
    const p = pts[i];
    pos.push(p.x - s.x, p.y - s.y, p.z - s.z, p.x + s.x, p.y + s.y, p.z + s.z);
    flow.push(0, dist, 1, dist);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  (g.userData as { len: number }).len = dist;
  return g;
}

function waterMaterial(fall: boolean, len: number): ShaderMaterial {
  const m = new ShaderMaterial({
    defines: fall ? { FALL: 1 } : {},
    transparent: fall,
    depthWrite: !fall,
    side: DoubleSide,
    fog: false,
    uniforms: {
      uTime: STYLE.uTime, uLen: { value: len },
      uDeep: { value: new Color(0x1d6f8a) }, uShallow: { value: new Color(0x5cc6c9) }, uFoam: { value: new Color(0xf2fbff) },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  });
  m.userData.own = true;
  return m;
}

// -----------------------------------------------------------------------------
// Birds: a small flock gliding in wide circles, animated entirely on the GPU
// -----------------------------------------------------------------------------

function birds(count: number, rnd: () => number): Mesh {
  const g = new BufferGeometry();
  // Body plus two wings, flat; wing tips flap via the 'flap' attribute.
  const pos = [0, 0, 0.35, 0, 0.04, -0.3, 0, -0.04, -0.3, 0, 0, 0.12, -1, 0.05, -0.1, 0, 0, -0.18, 0, 0, 0.12, 1, 0.05, -0.1, 0, 0, -0.18];
  const flap = [0, 0, 0, 0, 1, 0, 0, 1, 0];
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('flap', new Float32BufferAttribute(flap, 1));
  const data = new Float32Array(count * 4), centre = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    data.set([rnd() * 6.28, 30 + rnd() * 40, 0.08 + rnd() * 0.06, 0.8 + rnd() * 0.5], i * 4);
    const flock = i % 2;
    centre.set([flock ? 40 : -50, 14 + rnd() * 10, flock ? -110 : -150], i * 3);
  }
  const ig = g;
  const m = new InstancedMesh(ig, new ShaderMaterial({
    side: DoubleSide,
    fog: false,
    uniforms: { uTime: STYLE.uTime, uColor: { value: new Color(0x3d3040) } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float flap;
      attribute vec4 aBird;   // phase, radius, angular speed, size
      attribute vec3 aCentre;
      void main() {
        float a = aBird.x + uTime * aBird.z;
        vec3 c = aCentre + vec3(cos(a) * aBird.y, sin(uTime * 0.3 + aBird.x) * 2.0, sin(a) * aBird.y * 0.45);
        vec3 fwd = normalize(vec3(-sin(a), 0.0, cos(a) * 0.45));
        vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
        vec3 p = position;
        p.y += flap * sin(uTime * 9.0 + aBird.x * 7.0) * 0.55;
        vec3 w = c + (right * p.x + vec3(0.0, p.y, 0.0) + fwd * p.z) * aBird.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  }), count);
  ig.setAttribute('aBird', new InstancedBufferAttribute(data, 4));
  ig.setAttribute('aCentre', new InstancedBufferAttribute(centre, 3));
  m.frustumCulled = false;
  (m.material as ShaderMaterial).userData.own = true;
  const id = new Matrix4();
  for (let i = 0; i < count; i++) m.setMatrixAt(i, id);
  return m;
}

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

const STONE = 0xd6c4a2, STONE_DK = 0xa8957a, STONE_LT = 0xe8dcc0, MOSS = 0x6f9a4a;

/** Fluted column with base and capital; `h` is the shaft height (broken if short). */
function column(bs: MeshBuilder[], x: number, y: number, z: number, h: number, broken: boolean, tilt = 0): void {
  for (const b of bs) {
    b.put(new RoundedBoxGeometry(1.5, 0.45, 1.5, 1, 0.06), STONE_DK, x, y + 0.22, z);
    b.put(G.cyl(12), STONE, x, y + 0.45, z, { s: [0.52, h, 0.52], rz: tilt });
    if (!broken) {
      b.put(G.cyl(12), STONE_LT, x, y + 0.45 + h, z, { s: [0.64, 0.22, 0.64] });
      b.put(new RoundedBoxGeometry(1.45, 0.4, 1.45, 1, 0.05), STONE_LT, x, y + 0.87 + h, z);
    }
  }
}

/** Floating chunk of land with grass, a tree and a thin waterfall. */
function island(far: MeshBuilder, rnd: () => number, x: number, y: number, z: number, s: number, falls: { x: number; y: number; z: number; len: number }[]): void {
  const m = composeMatrix(x, y, z, Math.PI, rnd() * 3, 0, [s, s * 1.5, s * 0.85]);
  far.addFn(G.cone(9), m, (p, _n, out) => {
    const k = (y - p.y) / (s * 1.5);
    out.setHex(k < 0.25 ? 0x8a7458 : k < 0.6 ? 0x7a6a8a : 0x5f5478);
  });
  for (let i = 0; i < 4; i++) rock(far, rnd, x + (rnd() - 0.5) * s, y - s * (0.3 + rnd() * 0.6), z + (rnd() - 0.5) * s * 0.5, s * 0.25, 0x6a5f80);
  far.put(G.cyl(10), 0x7db04c, x, y - 0.3, z, { s: [s * 1.03, 0.6, s * 0.88] });
  roundTree(far, rnd, x - s * 0.3, z, s * 0.28, 0xffb3cf, 0xe77aa3, 0x6b4a32, y + 0.2);
  pine(far, rnd, x + s * 0.35, z + s * 0.1, s * 0.3, 0x3f8f58, 0x24604a, y + 0.2);
  falls.push({ x: x + s * 0.7, y: y - 0.1, z: z + s * 0.4, len: s * 3.2 });
}

/** Big blossom tree with a forked trunk and layered canopy. */
function blossomTree(b: MeshBuilder, windy: MeshBuilder, rnd: () => number, x: number, y: number, z: number, s: number): void {
  b.put(G.taper(8), 0x5e4030, x, y, z, { s: [0.38 * s, 2.4 * s, 0.38 * s] });
  for (const k of [-1, 1]) b.put(G.taper(6), 0x5e4030, x + k * 0.3 * s, y + 2.1 * s, z, { s: [0.2 * s, 1.8 * s, 0.2 * s], rz: -k * 0.55 });
  const pinks = [0xffc4d8, 0xffa6c4, 0xf58bb0, 0xffd8e4];
  for (let i = 0; i < 13; i++) {
    const a = rnd() * Math.PI * 2, d = (0.3 + rnd() * 1.6) * s;
    const r = (0.75 + rnd() * 0.55) * s;
    windy.put(G.ico(1), pinks[i % pinks.length], x + Math.cos(a) * d, y + (3.1 + rnd() * 1.4) * s, z + Math.sin(a) * d * 0.7,
      { s: [r, r * 0.78, r], ry: rnd() * 3, wind: 0.22 });
  }
}

export class Highlands extends Arena {
  readonly grade: GradeSettings = {
    sat: 1.2, contrast: 1.06, shadows: [-0.02, 0.0, 0.05], highlights: [0.035, 0.02, -0.01], bloom: 1.05, vignette: 0.38,
  };
  readonly atmosphere: AtmosphereSettings = {
    fog: 0xf4c9ae, sun: 0xffcf96, sunDir: [SUN.x, SUN.y, SUN.z], density: 0.0013, falloff: 0.03, baseY: SEA_Y, max: 0.55, glow: 0.55, ao: 0.25,
  };
  private readonly rays: ShaderMaterial | null;
  private readonly crystals: Mesh[] = [];
  private readonly lip = new Vector3();

  constructor(scene: Scene, opts: ArenaOptions) {
    super(scene, opts);
    const d = opts.detail;
    this.brazierColor = 0x5ff0e0;
    this.setMood({
      shadow: [0.4, 0.38, 0.68], mid: [0.8, 0.75, 0.86], lit: [1.1, 1.0, 0.86], skyFill: [0.08, 0.09, 0.17],
      term: [0.22, 0.07, 0.0], groundY: GROUND,
    }, 0xf4c9ae, 80, 420);

    this.key = makeLights(this.group, {
      key: 0xffe0b8, keyIntensity: 3.1, keyPos: [-10, 11, 8], sky: 0xa8c4ff, ground: 0x7a8a52, hemiIntensity: 0.95,
      rim: 0xffb070, rimIntensity: 2.0, shadows: opts.shadows, shadowMapSize: opts.shadowMapSize,
    });

    const sky = skyDome({
      zenith: 0x2650b8, mid: 0x7ea6e2, horizon: 0xffc89a, ground: 0xf4c9ae, sunDir: SUN, sunColor: 0xfff0c8, sunSize: 1.5,
      clouds: { lit: 0xfff4ec, shade: 0xc4a8d0, cover: 0.57, scale: 1.1, speed: 1 },
    });
    sky.material.userData.own = true;
    this.group.add(sky);

    const rnd = prng(42);
    const near = new MeshBuilder();
    const far = new MeshBuilder();
    const windy = new MeshBuilder();
    const skyB = new MeshBuilder();

    // --- Dais ---------------------------------------------------------------------
    const floorMat = texturedMaterial(floorTexture(d >= 2 ? 1024 : 512), 'hl-floor');
    floorMat.userData.own = true;
    const floor = new Mesh(new CylinderGeometry(15, 15, 0.5, 80, 1), [sceneToon(0x8f7f68), floorMat, sceneToon(0x8f7f68)]);
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    this.group.add(floor);
    // Rim and two shallow steps down to the meadow.
    const rimGeo = new TorusGeometry(15.08, 0.3, 6, 80);
    near.add(rimGeo, composeMatrix(0, -0.1, 0, Math.PI / 2, 0, 0, [1, 1, 0.7]), 0xcdb894);
    near.add(new CylinderGeometry(15.9, 16.0, 0.3, 80, 1), composeMatrix(0, -0.4, 0), 0xb09c7e);
    near.add(new CylinderGeometry(16.8, 16.9, 0.3, 80, 1), composeMatrix(0, -0.62, 0), 0x9a876c);

    for (const s of [-1, 1]) {
      const line = new Mesh(G.plane(), glow(0x5ff0e0, 1.2));
      line.scale.set(0.14, 6, 1);
      line.rotation.x = -Math.PI / 2;
      line.position.set(s * (ARENA_HALF_WIDTH + 0.45), 0.012, 0);
      this.group.add(line);
    }

    // Rune obelisks with floating crystals at the lane ends.
    for (const sx of [-1, 1]) {
      const x = sx * (ARENA_HALF_WIDTH + 1.7);
      for (const z of [-2.4, 2.4]) {
        {
          const b = near;
          b.put(new RoundedBoxGeometry(1.3, 0.5, 1.3, 1, 0.06), STONE_DK, x, 0, z);
          b.put(G.taper(4), STONE, x, 0.5, z, { s: [0.55, 4.2, 0.55], ry: Math.PI / 4 });
          b.put(G.cone(4), STONE_LT, x, 4.7, z, { s: [0.42, 0.7, 0.42], ry: Math.PI / 4 });
        }
        near.put(new RoundedBoxGeometry(0.06, 2.4, 0.22, 1, 0.02), 0x2fb5a8, x - sx * 0.47, 1.4, z, { s: [1, 1, 1] });
        this.braziers.push(new Vector3(x, 6.1, z));
        const crystal = new Mesh(G.ico(0), glow(0x6ff7e8, 2.4));
        crystal.scale.set(0.3, 0.58, 0.3);
        crystal.position.set(x, 6.0, z);
        crystal.userData.bob = rnd() * 6;
        crystal.userData.y = 6.0;
        this.crystals.push(crystal);
        this.group.add(crystal);
      }
    }
    this.group.add(runeRing(10.58, 0.2, 0x5ff0e0));

    // --- Terrain ----------------------------------------------------------------------
    const ground = new PlaneGeometry(280, 110, 140, 55);
    ground.rotateX(-Math.PI / 2);
    ground.translate(0, 0, -5);
    {
      const p = ground.getAttribute('position') as BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        let z = p.getZ(i);
        const e = edgeZ(x);
        if (z < e) z = e;
        p.setXYZ(i, x, terrainY(x, z), z);
      }
      ground.computeVertexNormals();
    }
    const gLit = new Color(0x8fc456), gDark = new Color(0x4f8f3e), gDry = new Color(0xc2b860), gPath = new Color(0xb0a07a), gBank = new Color(0x55704a);
    far.addFn(ground, new Matrix4(), (p, n, out) => {
      const nse = Math.sin(p.x * 0.13) * Math.cos(p.z * 0.17) + Math.sin(p.x * 0.041 + p.z * 0.063) * 0.9 + Math.sin(p.x * 0.31 + p.z * 0.27) * 0.3;
      out.copy(gLit).lerp(gDark, Math.min(1, Math.max(0, 0.45 + nse * 0.35)));
      out.lerp(gDry, Math.max(0, Math.sin(p.x * 0.07 - p.z * 0.05) * 0.5 - 0.1));
      // Steep slopes show earth.
      if (n.y < 0.85) out.lerp(new Color(0x9a7a5a), Math.min(1, (0.85 - n.y) * 3));
      const path = (1 - smooth(1.5, 4, Math.abs(p.x))) * smooth(-14, -18, p.z);
      const r = Math.hypot(p.x, p.z);
      out.lerp(gPath, Math.max(path * 0.8, (1 - smooth(16.5, 19.5, r)) * 0.55));
      const sd = streamDist(p.x, p.z);
      if (sd < 3.4) out.lerp(gBank, (1 - smooth(1.4, 3.4, sd)) * 0.8);
      // Lip of the cliff: worn rock.
      if (p.z < edgeZ(p.x) + 1.2) out.lerp(new Color(0xb39a78), 0.7);
    });

    // --- Cliff face, strata and spires --------------------------------------------------
    {
      const rowsY = [0, -1.4, -3.4, -6, -9, -12, -15];
      const xs: number[] = [];
      for (let x = -140; x <= 140; x += 1.6) xs.push(x);
      const pos: number[] = [];
      const vtx = (x: number, r: number) => {
        const e = edgeZ(x);
        const top = r === 0 ? terrainY(x, e) : rowsY[r];
        const j = Math.sin(x * 1.7 + r * 3.1) * 0.9 + Math.sin(x * 0.53 + r) * 1.2;
        return new Vector3(x + Math.sin(r * 2.3 + x) * 0.3, top, e - r * 1.15 - (r > 0 ? Math.max(-0.6, j) : 0));
      };
      for (let i = 0; i < xs.length - 1; i++) {
        for (let r = 0; r < rowsY.length - 1; r++) {
          const a = vtx(xs[i], r), b = vtx(xs[i + 1], r), c = vtx(xs[i], r + 1), dd = vtx(xs[i + 1], r + 1);
          pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, dd.x, dd.y, dd.z);
        }
      }
      const cliff = new BufferGeometry();
      cliff.setAttribute('position', new Float32BufferAttribute(pos, 3));
      cliff.computeVertexNormals();
      far.addFn(cliff, new Matrix4(), (p, n, out) => {
        const band = Math.sin(p.y * 0.55 + Math.sin(p.x * 0.05) * 1.5);
        out.setHex(band > 0.35 ? 0xc9a27e : band > -0.4 ? 0xb08a6c : 0x93748a);
        if (p.y > -1.2) out.setHex(n.y > 0.3 ? 0x6f9a4a : 0x8a7a5a);
        if (n.x * 0.6 + n.z * 0.3 < -0.2) out.multiplyScalar(0.86);
      });
      // Rock spires stepping down from the lip into the clouds.
      for (let i = 0; i < 26; i++) {
        const x = -110 + i * 8.6 + (rnd() - 0.5) * 4;
        const e = edgeZ(x);
        const top = -1.5 - rnd() * 5;
        const z = e - 4 - rnd() * 7;
        const w = 2 + rnd() * 2.5;
        far.addFn(G.taper(6), composeMatrix(x, SEA_Y - 6, z, 0, rnd() * 3, 0, [w, top - SEA_Y + 6, w * 0.9]), (p, _n, out) => {
          const band = Math.sin(p.y * 0.6 + x);
          out.setHex(band > 0.2 ? 0xc29c7a : band > -0.5 ? 0xa7836a : 0x8a6c84);
        });
        far.put(G.cyl(8), 0x6f9a4a, x, top, z, { s: [w * 0.72, 0.4, w * 0.65] });
        if (rnd() < 0.5) pine(far, rnd, x, z, 0.9 + rnd() * 0.7, 0x3f8f58, 0x24604a, top + 0.3);
      }
      // Boulders and standing stones along the lip.
      for (let i = 0; i < 34; i++) {
        const x = -90 + rnd() * 180;
        const z = edgeZ(x) + 0.5 + rnd() * 2;
        rock(near, rnd, x, terrainY(x, z) - 0.2, z, 0.6 + rnd() * 1.6, 0xa89a9a, MOSS);
      }
    }

    // --- Sea of clouds, peaks, islands and the far temple ---------------------------------
    this.group.add(cloudSea(SEA_Y + 2, -230, 1100, 420, 0xfff2e8, 0xb39ac8, SUN));
    for (let i = 0; i < 46; i++) {
      const x = -260 + rnd() * 520, z = -70 - rnd() * 240;
      cloud(far, rnd, x, SEA_Y + 1 + rnd() * 3, z, 8 + rnd() * 12, rnd() < 0.5 ? 0xfff2ea : 0xf6dde6, 0.4);
    }
    // Cloud banks hugging the foot of the cliff.
    for (let x = -120; x <= 120; x += 9 + rnd() * 6) cloud(far, rnd, x, SEA_Y + 0.5, edgeZ(x) - 9 - rnd() * 6, 4 + rnd() * 3, 0xfff4ee, 0.45);
    const peaksNear = { rock: 0x6f73b4, rockDark: 0x4e5294, snow: 0xf7f3ff, snowLine: 0.6 };
    for (let i = 0; i < 8; i++) {
      const x = -170 + i * 48 + (rnd() - 0.5) * 20;
      if (Math.abs(x) < 18) continue; // keep the view through the arch open
      mountain(far, rnd, x, -105 - rnd() * 60, 18 + rnd() * 12, 16 + rnd() * 8, peaksNear, SEA_Y - 4);
    }
    const peaksFar = { rock: 0x8a8cc6, rockDark: 0x6c6eaa, snow: 0xfcf8ff, snowLine: 0.5 };
    for (let i = 0; i < 9; i++) mountain(far, rnd, -280 + i * 70 + rnd() * 25, -270 - rnd() * 40, 30 + rnd() * 16, 34 + rnd() * 14, peaksFar, SEA_Y - 4);
    // Mesa with a mountain temple: a far landmark seen through the arch.
    {
      const tx = -26, tz = -250, top = 12;
      far.addFn(G.taper(9), composeMatrix(tx, SEA_Y - 4, tz, 0, 0.4, 0, [16, top - SEA_Y + 4, 14]), (p, _n, out) => {
        const band = Math.sin(p.y * 0.35);
        out.setHex(band > 0 ? 0x9b90b8 : 0x8580ac);
      });
      far.put(G.cyl(9), 0x88b070, tx, top, tz, { s: [11.6, 0.5, 10] });
      const walls = 0xf0e4d0, roof = 0xc84a3c;
      for (let k = 0; k < 4; k++) {
        const w = 6 - k * 1.3, y = top + 0.5 + k * 3.1;
        far.put(new RoundedBoxGeometry(w, 2.2, w, 1, 0.1), walls, tx, y + 1.1, tz);
        far.put(G.cone(4), roof, tx, y + 2.1, tz, { s: [w * 0.9, 1.3, w * 0.9], ry: Math.PI / 4 });
      }
      far.put(G.cyl(6), 0xf3c24f, tx, top + 13.2, tz, { s: [0.2, 3, 0.2] });
      const lamp = new Mesh(G.ico(0), glow(0xffd27a, 3));
      lamp.position.set(tx, top + 3.2, tz + 3.05);
      lamp.scale.set(0.9, 0.9, 0.2);
      this.group.add(lamp);
    }
    const falls: { x: number; y: number; z: number; len: number }[] = [];
    island(far, rnd, -78, 16, -170, 9, falls);
    island(far, rnd, 64, 22, -205, 7, falls);
    island(far, rnd, 150, 30, -260, 11, falls);
    island(far, rnd, -170, 34, -280, 8, falls);
    for (let i = 0; i < 10; i++) cloud(skyB, rnd, -320 + i * 66 + rnd() * 30, 46 + rnd() * 40, -320, 12 + rnd() * 10, 0xffffff, 0.5);

    // --- Ruins: colonnade, great arch, banners -------------------------------------------
    const ruinCols = 11;
    for (let i = 0; i < ruinCols; i++) {
      const a = Math.PI - 1.05 + (i / (ruinCols - 1)) * 2.1;
      if (Math.abs(a - Math.PI) < 0.28) continue; // the processional path
      const r = 21.5;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const broken = rnd() < 0.4;
      const h = broken ? 1.2 + rnd() * 2.6 : 6.2;
      const y = terrainY(x, z) - 0.15;
      column([near], x, y, z, h, broken, broken ? (rnd() - 0.5) * 0.12 : 0);
      if (broken) {
        // Toppled drum and rubble.
        near.put(G.cyl(12), STONE, x + 1.6, y + 0.45, z + 0.8, { s: [0.5, 1.3, 0.5], rz: Math.PI / 2, ry: rnd() * 3 });
        rock(near, rnd, x - 1.2, y, z + 0.6, 0.35, STONE_DK);
      }
      // Moss and ivy at the base.
      for (let k = 0; k < 3; k++) windy.put(G.ico(1), k % 2 ? 0x5d9444 : 0x77ad52, x + (rnd() - 0.5) * 1.8, y + 0.3, z + (rnd() - 0.5) * 1.6, { s: [0.5 + rnd() * 0.4, 0.4, 0.5], wind: 0.05 });
    }
    // Lintels across standing neighbours.
    for (const [a0, a1] of [[Math.PI - 0.84, Math.PI - 0.63], [Math.PI + 0.63, Math.PI + 0.84]]) {
      const r = 21.5;
      const xm = Math.sin((a0 + a1) / 2) * r, zm = Math.cos((a0 + a1) / 2) * r;
      near.put(new RoundedBoxGeometry(5.2, 0.7, 1.3, 1, 0.08), STONE_LT, xm, terrainY(xm, zm) + 7.6, zm, { ry: (a0 + a1) / 2 });
    }
    // Great arch framing the vista.
    {
      const az = -35, span = 4.6, h = 5.2;
      const y = terrainY(0, az);
      for (const sx of [-1, 1]) {
        {
          const b = near;
          b.put(new RoundedBoxGeometry(2.4, 0.8, 2.4, 1, 0.08), STONE_DK, sx * span, y + 0.4, az);
          b.put(new RoundedBoxGeometry(1.7, h, 1.9, 1, 0.08), STONE, sx * span, y + 0.8 + h / 2, az);
          b.put(new RoundedBoxGeometry(2.1, 0.5, 2.2, 1, 0.06), STONE_LT, sx * span, y + 0.8 + h, az);
        }
      }
      const archGeo = new TorusGeometry(span, 0.85, 6, 20, Math.PI);
      near.add(archGeo, composeMatrix(0, y + 1.05 + h, az, 0, 0, 0, [1, 0.9, 1.25]), STONE);
      near.put(new RoundedBoxGeometry(1.3, 1.6, 2.3, 1, 0.08), STONE_LT, 0, y + 1.05 + h + span * 0.9, az);
      near.put(G.ico(0), 0xd9b04a, 0, y + 1.05 + h + span * 0.9, az + 1.18, { s: [0.35, 0.35, 0.1], gloss: 1 });
      // Ivy hanging from the arch.
      for (let i = 0; i < 16; i++) {
        const t = (i / 15) * Math.PI;
        const ax = Math.cos(t) * span * 1.0, ay = y + 1.05 + h + Math.sin(t) * span * 0.9;
        if (rnd() < 0.5) continue;
        const len = 0.6 + rnd() * rnd() * 2.4;
        const vine = new PlaneGeometry(0.16 + rnd() * 0.12, len, 1, 4);
        vine.translate(0, -len / 2, 0);
        windy.addFn(vine, composeMatrix(ax, ay - 0.5, az + 0.95 + rnd() * 0.2, 0, rnd() * 0.6 - 0.3, 0), (p, _n, out) => {
          out.setHex(rnd() < 0.5 ? 0x3f7a34 : 0x5a9440);
          return Math.min(1, (ay - p.y) / len) * 0.6;
        });
      }
      // Crystal hovering in the arch.
      const crystal = new Mesh(G.ico(0), glow(0x7ffcf0, 2.8));
      crystal.scale.set(0.5, 0.95, 0.5);
      crystal.position.set(0, y + 1.05 + h - 0.6, az);
      crystal.userData.bob = 1.3;
      crystal.userData.y = crystal.position.y;
      this.crystals.push(crystal);
      this.group.add(crystal);
      this.braziers.push(new Vector3(0, crystal.position.y + 0.4, az));
      // Banners on poles either side of the arch.
      for (const sx of [-1, 1]) {
        const x = sx * 9.5, z = az + 1.5;
        const by = terrainY(x, z);
        near.put(G.cyl(6), 0x6b4a32, x, by, z, { s: [0.09, 8.2, 0.09] });
        near.put(G.ico(0), 0xf3c24f, x, by + 8.3, z, { s: 0.18 });
        near.put(G.cyl(6), 0x6b4a32, x, by + 7.9, z, { s: [0.05, 1.5, 0.05], rz: Math.PI / 2 });
        const banner = new PlaneGeometry(1.3, 4.2, 1, 8);
        banner.translate(0, -2.1, 0);
        windy.addFn(banner, composeMatrix(x, by + 7.85, z, 0, 0, 0), (p, _n, out) => {
          out.setHex(sx < 0 ? 0x2f5be0 : 0xd8343f);
          if (p.y < by + 4.2 || Math.abs(p.x - x) > 0.5) out.setHex(0xf3c24f);
          return Math.min(1, (by + 7.85 - p.y) / 4.2) * 0.9;
        });
      }
    }

    // --- Stream and waterfall ---------------------------------------------------------------
    {
      const pts = STREAM_PTS.map((p) => new Vector3(p.x, hills(p.x, p.z) - 0.28, p.z));
      const sideOf = (i: number) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        return new Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
      };
      const sg = ribbon(pts, sideOf, (i) => 2.0 + Math.sin(i * 0.4) * 0.3);
      const stream = new Mesh(sg, waterMaterial(false, (sg.userData as { len: number }).len));
      stream.renderOrder = 1;
      this.group.add(stream);
      for (let i = 0; i < pts.length; i += 3) {
        const s = sideOf(i);
        for (const k of [-1, 1]) if (rnd() < 0.6) rock(near, rnd, pts[i].x + s.x * k * 1.6, pts[i].y + 0.1, pts[i].z + s.z * k * 1.6, 0.25 + rnd() * 0.35, 0x9a94a4, MOSS);
      }
      // Rocky outcrop with a spring cascading towards the camera into a pool.
      const base = hills(POOL.x, POOL.z);
      const oz = POOL.z - 3.2;
      const strata = (p: Vector3, _n: Vector3, out: Color) => {
        const band = Math.sin(p.y * 1.4 + p.x * 0.3);
        out.setHex(band > 0.3 ? 0xc29c7a : band > -0.4 ? 0xa8876c : 0x8f7488);
      };
      for (const [dx, dz, sx, sy, sz] of [[0, 0, 3.6, 6.2, 2.8], [-2.6, 0.6, 2.4, 4.2, 2.2], [2.8, -0.4, 2.6, 5.0, 2.4], [1.2, -2.4, 3.2, 7.4, 2.6], [-1.6, -2.2, 2.6, 5.6, 2.2]] as const) {
        near.addFn(G.dodeca(), composeMatrix(POOL.x + dx, base + sy * 0.32, oz + dz, rnd() * 0.3, rnd() * 3, rnd() * 0.2, [sx, sy * 0.62, sz]), strata);
        near.put(G.ico(1), MOSS, POOL.x + dx, base + sy * 0.58, oz + dz, { s: [sx * 0.62, 0.35, sz * 0.6] });
      }
      pine(near, rnd, POOL.x + 1.4, oz - 2.2, 1.5, 0x3f8f58, 0x24604a, base + 4.4);
      pine(near, rnd, POOL.x - 2.2, oz - 0.8, 1.1, 0x3f8f58, 0x24604a, base + 2.4);
      const topY = base + 3.7;
      const fpts: Vector3[] = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        fpts.push(new Vector3(POOL.x, topY - t * (topY - base + 0.2), oz + 1.5 + Math.sqrt(t) * 1.6));
      }
      const fg = ribbon(fpts, () => new Vector3(1, 0, 0), (i) => 1.6 + i * 0.06);
      const fall = new Mesh(fg, waterMaterial(true, (fg.userData as { len: number }).len * 1.8));
      fall.renderOrder = 3;
      this.group.add(fall);
      // Round pool at the foot of the cascade, ringed with stones.
      const poolGeo = new RingGeometry(0.01, 2.3, 24, 1);
      poolGeo.rotateX(-Math.PI / 2);
      const pf = new Float32Array(poolGeo.getAttribute('position').count * 2);
      const pp = poolGeo.getAttribute('position');
      for (let i = 0; i < pp.count; i++) { const r = Math.hypot(pp.getX(i), pp.getZ(i)) / 2.3; pf[i * 2] = 0.5 - r * 0.5; pf[i * 2 + 1] = Math.atan2(pp.getZ(i), pp.getX(i)) * 2; }
      poolGeo.setAttribute('aFlow', new BufferAttribute(pf, 2));
      const pool = new Mesh(poolGeo, waterMaterial(false, 10));
      pool.position.set(POOL.x, base - 0.3, POOL.z);
      pool.renderOrder = 1;
      this.group.add(pool);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + rnd() * 0.3;
        if (Math.sin(a) < -0.3 && Math.abs(Math.cos(a)) < 0.6) continue; // stream outlet
        rock(near, rnd, POOL.x + Math.cos(a) * 2.5, base - 0.2, POOL.z + Math.sin(a) * 2.2, 0.3 + rnd() * 0.35, 0x9a94a4, MOSS);
      }
      this.lip.set(POOL.x, base, POOL.z - 0.6);
      // The islands' falls share one mesh; flow distance is normalised to 20 units each.
      const ribs = falls.map((f) => {
        const ip: Vector3[] = [];
        for (let i = 0; i <= 10; i++) ip.push(new Vector3(f.x, f.y - (i / 10) * f.len, f.z + (i / 10) * 0.5));
        const g = ribbon(ip, () => new Vector3(1, 0, 0), () => 0.9);
        const fl = g.getAttribute('aFlow') as BufferAttribute;
        const k = 20 / Math.max(1, (g.userData as { len: number }).len);
        for (let i = 0; i < fl.count; i++) fl.setY(i, fl.getY(i) * k);
        return g;
      });
      const merged = mergeGeometries(ribs);
      if (merged) {
        const m = new Mesh(merged, waterMaterial(true, 20));
        m.renderOrder = 3;
        this.group.add(m);
      }
    }

    // --- Trees, bushes, flowers, grass -----------------------------------------------------
    blossomTree(near, windy, rnd, -24, terrainY(-24, -13), -13, 1.5);
    blossomTree(near, windy, rnd, 27, terrainY(27, -13), -13, 1.15);
    const treeCount = [16, 30, 46][d];
    for (let i = 0, placed = 0; i < 600 && placed < treeCount; i++) {
      const x = (rnd() - 0.5) * 200, z = 10 - rnd() * 48;
      if (z < edgeZ(x) + 3) continue;
      if (Math.hypot(x, z) < 24) continue;
      if (Math.abs(x) < 26 && (z > -34 || Math.abs(x) < 21)) continue; // keep the duel's backdrop and vista open
      if (streamDist(x, z) < 3.5) continue;
      placed++;
      const y = terrainY(x, z) - 0.1;
      const kind = rnd();
      if (kind < 0.5) pine(near, rnd, x, z, 1.5 + rnd() * 1.6, 0x3f8f58, 0x24604a, y);
      else if (kind < 0.68) roundTree(near, rnd, x, z, 1.3 + rnd() * 0.8, 0xffb3cf, 0xe77aa3, 0x6b4a32, y);
      else roundTree(near, rnd, x, z, 1.4 + rnd() * 1.0, 0x8fc456, 0x4f9a46, 0x6b4a32, y);
    }
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 18 + rnd() * 30;
      const x = Math.sin(a) * r * 1.3, z = Math.cos(a) * r;
      if (z > 8 || z < edgeZ(x) + 2) continue;
      rock(near, rnd, x, terrainY(x, z) - 0.15, z, 0.4 + rnd() * 1.2, 0xa29cb6, 0x74a852);
    }
    // Flower patches.
    const flowers = [0xffffff, 0xffe066, 0xff8ab0, 0xb88cff, 0x7ec8ff];
    for (let p = 0; p < 18 + d * 10; p++) {
      const cx = (rnd() - 0.5) * 90, cz = 6 - rnd() * 40;
      if (Math.hypot(cx, cz) < 18.5 || cz < edgeZ(cx) + 2 || streamDist(cx, cz) < 2.5) continue;
      const c = flowers[Math.floor(rnd() * flowers.length)];
      for (let k = 0; k < 8; k++) {
        const x = cx + (rnd() - 0.5) * 3, z = cz + (rnd() - 0.5) * 2.4;
        windy.put(G.ico(0), c, x, terrainY(x, z) + 0.25 + rnd() * 0.2, z, { s: 0.1, wind: 0.8 });
      }
    }
    const tufts = [350, 900, 1700][d];
    for (let i = 0; i < tufts; i++) {
      const a = rnd() * Math.PI * 2, r = 16.6 + Math.pow(rnd(), 0.75) * 46;
      const x = Math.sin(a) * r * 1.5, z = Math.cos(a) * r;
      if (z > 14 || z < edgeZ(x) + 0.8 || streamDist(x, z) < 1.3) continue;
      if (Math.abs(x) < 3.2 && z < -17) continue; // path
      tuft(windy, rnd, x, z, 1 + rnd() * 0.9, 0x4f8a3a, rnd() < 0.18 ? 0xe8d878 : 0xa8d860, terrainY(x, z));
    }

    finish(this.group, near, far, windy, skyB, opts.shadows);

    // Crystal light on the ground, birds, sun shafts.
    this.group.add(lightPools(this.braziers.map((b) => ({ x: b.x, z: b.z, r: 2.6, y: b.z < -20 ? terrainY(b.x, b.z) + 0.08 : 0.03 })), 0x5ff0e0, 0.5));
    if (d >= 1) this.group.add(birds(d >= 2 ? 22 : 12, rnd));
    const r = godRays(0xffd9a8, d >= 1 ? 5 : 0, new Vector3(-24, 16, -42), rnd);
    this.rays = d >= 1 ? r.mat : null;
    if (d >= 1) { r.mesh.material.userData.own = true; this.group.add(r.mesh); }
  }

  protected animate(time: number): void {
    if (this.rays) this.rays.uniforms.uTime.value = time;
    for (const c of this.crystals) {
      c.position.y = c.userData.y + Math.sin(time * 1.6 + c.userData.bob) * 0.15;
      c.rotation.y = time * 0.8 + c.userData.bob;
    }
  }

  protected ambient(_time: number, fx: ArenaFx): void {
    const d = this.opts.detail;
    // Blossom petals drifting off the big tree across the dais.
    if (Math.random() < 0.4 + d * 0.25) {
      const x = -30 + Math.random() * 14, y = 4 + Math.random() * 5, z = -16 + Math.random() * 8;
      fx.smoke.emit(x, y, z, 1.4 + Math.random() * 0.9, -0.4, 0.25, 9, 1.0, 0.74, 0.86, 0.07, 0, 0, 1, 0);
    }
    // Pollen motes in the low sun.
    if (Math.random() < 0.3 + d * 0.2) {
      fx.add.emit((Math.random() - 0.5) * 34, Math.random() * 1.5, -2 - Math.random() * 10, (Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.3, 0, 5,
        1.6, 1.4, 0.6, 0.045 + Math.random() * 0.03, -0.02, 0.1, 0.4, 0);
    }
    // Spray where the cascade hits the pool.
    if (d >= 1 && Math.random() < 0.5) {
      const l = this.lip;
      fx.smoke.emit(l.x + (Math.random() - 0.5) * 1.4, l.y + 0.1, l.z, (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.4, 0.3, 1.4,
        0.94, 0.98, 1.0, 0.18 + Math.random() * 0.15, 0.2, 0.8, 2.4, 0);
    }
  }
}
