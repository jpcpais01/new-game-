import {
  BoxGeometry, BufferAttribute, CapsuleGeometry, Color, ConeGeometry, CylinderGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh,
  PlaneGeometry, Quaternion, RingGeometry, type Scene, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ARENA_HALF_WIDTH } from '../../sim/constants';
import { customStyled, glow, sceneToon, texturedMaterial } from '../materials';
import { composeMatrix, MeshBuilder, prng } from '../meshBuilder';
import type { AtmosphereSettings, GradeSettings } from '../renderer';
import { Arena, type ArenaFx, type ArenaOptions } from './arena';
import { canvasTexture, cloud, finish, G, godRays, lightPools, makeLights, skyDome } from './common';

/**
 * Raked sand: warm base with large soft tonal patches, combed rake arcs, a
 * faded painted duel ring and laurel, scuffed footwork zones at both corners,
 * drag marks, footprints and darker, trampled sand towards the wall.
 */
function sandTexture(size: number) {
  return canvasTexture(size, (g, S, rnd) => {
    const k = S / 1024, cx = S / 2;
    const grd = g.createRadialGradient(cx, cx, 0, cx, cx, S / 2);
    grd.addColorStop(0, '#dcb985');
    grd.addColorStop(0.62, '#d2ab74');
    grd.addColorStop(0.9, '#b98e5c');
    grd.addColorStop(1, '#9c7448');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    // Large, soft tonal patches (damp and dry sand).
    for (let i = 0; i < 70; i++) {
      const x = rnd() * S, y = rnd() * S, r = (40 + rnd() * 120) * k;
      const pg = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = rnd() < 0.55;
      pg.addColorStop(0, dark ? 'rgba(140,96,52,0.12)' : 'rgba(255,236,196,0.12)');
      pg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = pg;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // Combed rake arcs in overlapping fans.
    g.lineCap = 'round';
    for (let f = 0; f < 18; f++) {
      const ox = rnd() * S, oy = rnd() * S, r0 = (60 + rnd() * 160) * k;
      const a0 = rnd() * Math.PI * 2, span = 0.6 + rnd() * 1.2;
      for (let t = 0; t < 7; t++) {
        const r = r0 + t * 6 * k;
        g.strokeStyle = `rgba(${t % 2 ? '120,82,44,0.10' : '255,240,210,0.10'})`;
        g.lineWidth = 2.2 * k;
        g.beginPath(); g.arc(ox, oy, r, a0, a0 + span); g.stroke();
      }
    }
    // Faded painted duel ring, centre disc and laurel.
    g.strokeStyle = 'rgba(250,244,230,0.42)';
    g.lineWidth = 7 * k;
    g.beginPath(); g.arc(cx, cx, 345 * k, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(160,48,38,0.32)';
    g.lineWidth = 16 * k;
    g.beginPath(); g.arc(cx, cx, 368 * k, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(214,170,80,0.22)';
    g.beginPath(); g.arc(cx, cx, 95 * k, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(250,244,230,0.32)';
    g.lineWidth = 4 * k;
    g.beginPath(); g.arc(cx, cx, 95 * k, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(150,110,40,0.22)';
    for (const sgn of [-1, 1]) for (let i = 0; i < 9; i++) {
      const a = Math.PI / 2 + sgn * (0.35 + i * 0.27);
      g.save();
      g.translate(cx + Math.cos(a) * 70 * k, cx + Math.sin(a) * 70 * k);
      g.rotate(a + sgn * 0.9);
      g.beginPath(); g.ellipse(0, 0, 11 * k, 4.5 * k, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // Scuffed footwork zones at both corners and drag marks between them.
    for (const sx of [-1, 1]) {
      const zx = cx + sx * 250 * k;
      for (let i = 0; i < 90; i++) {
        const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.7) * 90 * k;
        g.fillStyle = `rgba(${rnd() < 0.6 ? '110,74,40' : '250,232,196'},${0.05 + rnd() * 0.08})`;
        g.beginPath(); g.ellipse(zx + Math.cos(a) * r, cx + Math.sin(a) * r * 0.7, (8 + rnd() * 22) * k, (3 + rnd() * 7) * k, rnd() * 3, 0, Math.PI * 2); g.fill();
      }
    }
    for (let i = 0; i < 26; i++) {
      let x = cx + (rnd() - 0.5) * 600 * k, y = cx + (rnd() - 0.5) * 300 * k;
      const dir = rnd() * Math.PI * 2;
      g.strokeStyle = 'rgba(105,70,38,0.10)';
      g.lineWidth = (3 + rnd() * 5) * k;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += Math.cos(dir + (rnd() - 0.5) * 0.6) * 22 * k; y += Math.sin(dir + (rnd() - 0.5) * 0.6) * 22 * k; g.lineTo(x, y); }
      g.stroke();
    }
    // Footprints.
    for (let i = 0; i < 160; i++) {
      const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = 'rgba(110,74,40,0.12)';
      g.beginPath(); g.ellipse(-5 * k, 0, 5 * k, 2.4 * k, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(6 * k, 5 * k, 5 * k, 2.4 * k, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // Grit.
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '90,60,30' : '255,245,220'},${rnd() * 0.1})`;
      const s = (1 + rnd() * 2.5) * k;
      g.fillRect(rnd() * S, rnd() * S, s, s);
    }
  }, 23);
}

// -----------------------------------------------------------------------------
// Crowd
// -----------------------------------------------------------------------------

/**
 * One spectator, a big-headed little creature facing +X. Vertex attribute
 * aInfo = (part, armSide, extra): part 0 clothes, 1 skin, 2 hair, 3 flag
 * cloth, 4 dark (trousers, pole, horns); extra 1 = flag, 2..5 = the species
 * features (fox ears, horns, long ears, pointed ears), each folded away
 * unless the spectator's iKind picks it.
 */
function spectatorGeometry() {
  const b = new MeshBuilder();
  const put = (geo: import('three').BufferGeometry, m: Matrix4, part: number, side = 0, flag = 0) =>
    b.addFn(geo, m, (_p, _n, out) => { out.setRGB(part, side, flag); });
  // Kept very low-poly (~110 triangles): there are up to 1500 of them.
  put(new BoxGeometry(0.3, 0.5, 0.34), composeMatrix(0, 0.25, 0), 4);
  put(new CylinderGeometry(0.17, 0.2, 0.52, 6, 1, true), composeMatrix(0, 0.74, 0), 0);
  put(new SphereGeometry(0.2, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), composeMatrix(0, 0.98, 0, 0, 0, 0, [0.9, 0.5, 1.2]), 0); // shoulders
  put(new SphereGeometry(0.19, 7, 5), composeMatrix(0.01, 1.22, 0), 1);
  put(new SphereGeometry(0.2, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.55), composeMatrix(-0.02, 1.25, 0, 0, 0, 0.35), 2);
  for (const s of [-1, 1]) {
    put(new ConeGeometry(0.075, 0.2, 4), composeMatrix(-0.03, 1.46, s * 0.11, s * 0.35, 0, 0), 1, 0, 2);
    put(new ConeGeometry(0.035, 0.16, 4), composeMatrix(0.05, 1.42, s * 0.1, s * 0.5, 0, -0.3), 4, 0, 3);
    put(new SphereGeometry(0.055, 5, 3), composeMatrix(-0.05, 1.52, s * 0.08, s * 0.15, 0, 0, [0.6, 2.4, 1]), 1, 0, 4);
    put(new ConeGeometry(0.05, 0.2, 4), composeMatrix(-0.02, 1.24, s * 0.26, s * Math.PI * 0.55, 0, 0), 1, 0, 5);
  }
  for (const s of [-1, 1]) {
    const arm = new CylinderGeometry(0.06, 0.055, 0.42, 4, 1, true);
    put(arm, composeMatrix(0, 0.95 - 0.2, s * 0.25), 0, s);
    put(new BoxGeometry(0.1, 0.1, 0.1), composeMatrix(0, 0.95 - 0.43, s * 0.25), 1, s);
  }
  // Flag on a pole held in the right hand (collapsed for most spectators).
  put(new CylinderGeometry(0.015, 0.015, 1.0, 3), composeMatrix(0, 0.95 - 0.39 - 0.3, 0.25), 4, 1, 1);
  const cloth = new PlaneGeometry(0.5, 0.32, 2, 1);
  cloth.translate(-0.25, 0, 0);
  put(cloth, composeMatrix(0, 0.95 - 0.39 - 0.62, 0.25, 0, Math.PI / 2, 0), 3, 1, 1);
  const g = b.build();
  g.setAttribute('aInfo', g.getAttribute('color'));
  g.deleteAttribute('color');
  g.deleteAttribute('gloss');
  return g;
}

const CROWD_PARS = /* glsl */ `
attribute vec3 aInfo;
attribute vec3 iCloth;
attribute vec3 iSkin;
attribute vec3 iHair;
attribute vec4 iData;
attribute float iKind;
uniform float uExcite;
uniform float uWave;
uniform float uWaveAmt;
varying vec3 vCrowdCol;
vec3 crowdRot(vec3 q, float side, float a) {
  float ang = -side * a;
  float c = cos(ang), s = sin(ang);
  return vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
}
`;

const CROWD_NORMAL = /* glsl */ `
  float crowdWave = uWaveAmt * smoothstep(0.86, 1.0, cos(iData.y - uWave));
  float crowdHype = clamp(uExcite * (0.45 + iData.z), 0.0, 1.0);
  float crowdCheer = max(crowdWave, crowdHype * (0.55 + 0.45 * sin(uTime * (4.0 + iData.z * 4.0) + iData.x * 6.28)));
  float crowdArm = abs(aInfo.g) > 0.5 ? clamp(crowdCheer * 2.7 + 0.12 * sin(uTime * 2.0 + iData.x * 9.0), 0.0, 2.9) : 0.0;
  if (abs(aInfo.g) > 0.5) objectNormal = crowdRot(objectNormal, aInfo.g, crowdArm);
`;

const CROWD_VERTEX = /* glsl */ `
  {
    vec3 piv = vec3(0.0, 0.95, aInfo.g * 0.25);
    if (abs(aInfo.g) > 0.5) transformed = crowdRot(transformed - piv, aInfo.g, crowdArm) + piv;
    float flagOn = step(0.5, iData.w);
    if (aInfo.b > 1.5) {
      // Species features: only the spectator's own kind unfolds.
      float mine = 1.0 - step(0.5, abs(iKind - (aInfo.b - 1.0)));
      transformed = mix(vec3(0.0, 1.22, 0.0), transformed, mine);
    } else if (aInfo.b > 0.5) {
      vec3 hand = crowdRot(vec3(0.0, -0.39, 0.0), 1.0, crowdArm) + vec3(0.0, 0.95, 0.25);
      transformed = mix(hand, transformed, flagOn);
      if (aInfo.r > 2.5 && aInfo.r < 3.5) transformed.x += sin(uTime * 9.0 + transformed.x * 8.0 + iData.x * 5.0) * 0.05 * (0.3 + crowdCheer);
    }
    transformed.y += max(0.0, sin(uTime * (6.0 + iData.z * 3.0) + iData.x * 6.28)) * crowdCheer * 0.2 + sin(uTime * 1.2 + iData.x * 6.28) * 0.012;
    float pt = aInfo.r;
    vec3 flagCol = iData.w > 1.5 ? vec3(0.75, 0.06, 0.08) : vec3(0.08, 0.2, 0.85);
    vCrowdCol = pt < 0.5 ? iCloth : pt < 1.5 ? iSkin : pt < 2.5 ? iHair : pt < 3.5 ? flagCol : iCloth * 0.3 + vec3(0.02);
    // Soften toy colours a touch, and put the top rows in the awnings' shade.
    vCrowdCol = mix(vec3(dot(vCrowdCol, vec3(0.3, 0.59, 0.11))), vCrowdCol, 0.8);
    float crowdY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
    vCrowdCol *= mix(1.0, 0.6, smoothstep(9.0, 13.5, crowdY));
  }
`;

class Crowd {
  readonly mesh: InstancedMesh;
  readonly excite = { value: 0 };
  readonly wave = { value: 0 };
  readonly waveAmt = { value: 0 };

  constructor(seats: { x: number; y: number; z: number; a: number }[], rnd: () => number) {
    const geo = spectatorGeometry();
    const n = seats.length;
    const cloth = new Float32Array(n * 3), skin = new Float32Array(n * 3), hair = new Float32Array(n * 3), data = new Float32Array(n * 4);
    const clothes = [0xc0392b, 0x2e6fd8, 0xf2c94c, 0xf4efe4, 0x27ae60, 0x8e44ad, 0xe67e22, 0x16a3b8, 0xd35d8a, 0x7a5a3a, 0xe8e0d0, 0x34495e];
    // The stands are full of the same creatures as the fighters: fur, hide and stone.
    const skins = [0xe8873a, 0xf4efe6, 0x82ad5c, 0x67a39a, 0xbfe3ff, 0xd8ccff, 0xf6ead8, 0xb8865c, 0xd8443a, 0x8e3c8e, 0x9a958c, 0xb8a080];
    // Feature per skin: 1 fox ears, 2 horns, 3 long ears, 4 pointed ears, 0 none (stone).
    const kinds = [1, 1, 2, 4, 4, 4, 3, 3, 2, 2, 0, 0];
    const kind = new Float32Array(n);
    const hairs = [0x2a1d14, 0x5a3a20, 0x111018, 0xb8823a, 0xd8c08a, 0x8a3a1a, 0x9a9aa0];
    const c = new Color();
    const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0);
    this.mesh = new InstancedMesh(geo, undefined, n);
    for (let i = 0; i < n; i++) {
      const s = seats[i];
      const blue = s.x < 0;
      // Fans lean towards their corner's colour on their side of the stands.
      const team = rnd() < 0.3;
      c.setHex(team ? (blue ? 0x2e6fd8 : 0xc0392b) : clothes[Math.floor(rnd() * clothes.length)]).multiplyScalar(0.85 + rnd() * 0.3);
      c.toArray(cloth, i * 3);
      const si = Math.floor(rnd() * skins.length);
      c.setHex(skins[si]).toArray(skin, i * 3);
      kind[i] = kinds[si];
      c.setHex(hairs[Math.floor(rnd() * hairs.length)]).toArray(hair, i * 3);
      const flag = rnd() < 0.09 ? (blue ? 1 : 2) : 0;
      data.set([rnd(), s.a, rnd(), flag], i * 4);
      const sc = 0.78 + rnd() * 0.16;
      q.setFromAxisAngle(up, Math.atan2(s.z, -s.x) + (rnd() - 0.5) * 0.4);
      m.compose(new Vector3(s.x, s.y, s.z), q, new Vector3(sc, sc * (0.92 + rnd() * 0.16), sc));
      this.mesh.setMatrixAt(i, m);
    }
    geo.setAttribute('iCloth', new InstancedBufferAttribute(cloth, 3));
    geo.setAttribute('iSkin', new InstancedBufferAttribute(skin, 3));
    geo.setAttribute('iHair', new InstancedBufferAttribute(hair, 3));
    geo.setAttribute('iData', new InstancedBufferAttribute(data, 4));
    geo.setAttribute('iKind', new InstancedBufferAttribute(kind, 1));
    const mat = customStyled('cb-crowd', {
      vertexPars: CROWD_PARS,
      normalVertex: CROWD_NORMAL,
      vertex: CROWD_VERTEX,
      fragmentPars: 'varying vec3 vCrowdCol;\n',
      fragmentColor: 'diffuseColor.rgb = vCrowdCol;',
    });
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev.call(mat, sh, r);
      sh.uniforms.uExcite = this.excite;
      sh.uniforms.uWave = this.wave;
      sh.uniforms.uWaveAmt = this.waveAmt;
    };
    mat.userData.own = true;
    this.mesh.material = mat;
    this.mesh.frustumCulled = false;
    void BufferAttribute;
  }
}

// -----------------------------------------------------------------------------
// Arena
// -----------------------------------------------------------------------------

const ARC0 = Math.PI - 1.8, ARC1 = Math.PI + 1.8;
/** Mirror open cylinders so their faces point inwards, at the camera. */
const INNER: [number, number, number] = [-1, 1, 1];
const ROWS = 12;
const rowR = (i: number) => 19 + i * 1.25;
const rowH = (i: number) => 2.6 + i * 0.95;

/**
 * Grand Colosseum: sand floor ringed by a painted podium wall, raked marble
 * stands packed with an animated crowd (cheers, flags, Mexican waves), an
 * arcaded upper wall with striped awnings, gates, statues and an imperial box.
 */
export class Colosseum extends Arena {
  readonly grade: GradeSettings = { sat: 1.18, contrast: 1.06, shadows: [-0.02, -0.005, 0.05], highlights: [0.035, 0.02, -0.01], bloom: 1.1, vignette: 0.42 };
  readonly atmosphere: AtmosphereSettings = {
    fog: 0xe9c29a, sun: 0xffc27a, sunDir: [0.75, 0.22, -0.62], density: 0.0045, falloff: 0.06, baseY: 0, max: 0.5, glow: 0.5, ao: 0.3,
  };
  private readonly crowd: Crowd | null;
  private rays: import('three').ShaderMaterial | null = null;
  private waveT = -1;
  private nextWave = 8;

  constructor(scene: Scene, opts: ArenaOptions) {
    super(scene, opts);
    const d = opts.detail;
    this.setMood({
      shadow: [0.36, 0.34, 0.62], mid: [0.78, 0.72, 0.8], lit: [1.12, 0.98, 0.82], skyFill: [0.08, 0.08, 0.15],
      term: [0.22, 0.07, 0.0], ramp: [0.48, 0.72],
    }, 0xe9c29a, 70, 420);
    // Late afternoon: a low, warm sun raking across the sand from the right.
    this.key = makeLights(this.group, {
      key: 0xffd9a6, keyIntensity: 3.3, keyPos: [13, 9.5, 5], sky: 0x9fb8ec, ground: 0xb07850, hemiIntensity: 0.9, rim: 0xff9f62, rimIntensity: 1.8,
      shadows: opts.shadows, shadowMapSize: opts.shadowMapSize,
    });
    const sky = skyDome({
      zenith: 0x34509e, mid: 0x7f9fd6, horizon: 0xffc690, ground: 0xe9c29a, sunDir: new Vector3(0.75, 0.22, -0.62), sunColor: 0xffd8a0, sunSize: 1.6,
      clouds: { lit: 0xffe2c4, shade: 0xb48aa8, cover: 0.58, scale: 1.3, speed: 0.8 },
    });
    sky.material.userData.own = true;
    this.group.add(sky);

    const rnd = prng(77);
    const near = new MeshBuilder();
    const far = new MeshBuilder();
    const windy = new MeshBuilder();
    const skyB = new MeshBuilder();

    // --- Floor ------------------------------------------------------------------
    const sandMat = texturedMaterial(sandTexture(d >= 2 ? 1024 : 512), 'col-sand');
    sandMat.userData.own = true;
    const floor = new Mesh(new CylinderGeometry(17.2, 17.2, 0.4, 80, 1), [sceneToon(0xc9a26c), sandMat, sceneToon(0xc9a26c)]);
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.group.add(floor);
    const front = new PlaneGeometry(200, 80);
    front.rotateX(-Math.PI / 2);
    far.put(front, 0xa57d50, 0, -0.03, 45);
    for (const s of [-1, 1]) {
      const line = new Mesh(G.plane(), glow(0xffd36b, 1.0));
      line.scale.set(0.14, 6, 1);
      line.rotation.x = -Math.PI / 2;
      line.position.set(s * (ARENA_HALF_WIDTH + 0.45), 0.012, 0);
      this.group.add(line);
    }

    // --- Podium wall (back arc) ---------------------------------------------------
    const span = ARC1 - ARC0;
    const wallSeg = 64;
    const wallR = 17.4;
    near.add(new CylinderGeometry(wallR, wallR, 2.8, wallSeg, 1, true, ARC0, span), composeMatrix(0, 1.2, 0, 0, 0, 0, INNER), 0x8a2a2a);
    near.add(new CylinderGeometry(wallR + 0.05, wallR + 0.05, 0.5, wallSeg, 1, true, ARC0, span), composeMatrix(0, 0.05, 0, 0, 0, 0, INNER), 0x6b5a4a);
    near.add(new CylinderGeometry(wallR + 0.22, wallR + 0.22, 0.32, wallSeg, 1, true, ARC0, span), composeMatrix(0, 2.62, 0, 0, 0, 0, INNER), 0xe2cca6);
    near.add(new CylinderGeometry(wallR + 0.12, wallR + 0.12, 0.14, wallSeg, 1, true, ARC0, span), composeMatrix(0, 2.38, 0, 0, 0, 0, INNER), 0xd9b04a, 0.8);
    near.add(new RingGeometry(wallR, rowR(0), wallSeg, 1, Math.PI / 2 - (ARC1 - Math.PI), span), composeMatrix(0, 2.62, 0, -Math.PI / 2), 0xcdb48e);
    // Gold-framed panels along the wall.
    for (let i = 0; i < 28; i++) {
      const a = ARC0 + ((i + 0.5) / 28) * span;
      if (Math.abs(a - (Math.PI - 1.15)) < 0.1 || Math.abs(a - (Math.PI + 1.15)) < 0.1) continue;
      const x = Math.sin(a) * (wallR - 0.06), z = Math.cos(a) * (wallR - 0.06);
      near.put(new RoundedBoxGeometry(2.4, 1.4, 0.08, 1, 0.03), 0xd9b04a, x, 1.25, z, { ry: a, gloss: 0.8 });
      near.put(new RoundedBoxGeometry(2.1, 1.15, 0.1, 1, 0.03), i % 2 ? 0xa83232 : 0x2f4f9a, x, 1.25, z, { ry: a });
    }

    // --- Raked stands --------------------------------------------------------------
    const marbleA = new Color(0xe0caa4), marbleB = new Color(0xc9b18a);
    for (let i = 0; i < ROWS; i++) {
      const r0 = rowR(i), r1 = rowR(i + 1), h0 = i === 0 ? 2.6 : rowH(i - 1), h1 = rowH(i);
      far.add(new CylinderGeometry(r0, r0, h1 - h0, wallSeg, 1, true, ARC0, span), composeMatrix(0, (h0 + h1) / 2, 0, 0, 0, 0, INNER), i % 2 ? 0xa8906e : 0x9c8464);
      far.add(new RingGeometry(r0, r1, wallSeg, 1, Math.PI / 2 - (ARC1 - Math.PI), span), composeMatrix(0, h1, 0, -Math.PI / 2), i % 2 ? marbleA : marbleB);
    }
    // Stair aisles.
    const aisles: number[] = [];
    for (let k = 0; k <= 8; k++) aisles.push(ARC0 + 0.12 + (k / 8) * (span - 0.24));
    // Aisles: darker runner strips up the stands (kept free of spectators).
    for (const a of aisles) {
      for (let i = 0; i < ROWS; i++) {
        const r = rowR(i) + 0.62;
        far.put(new RoundedBoxGeometry(1.0, 0.06, 1.25, 1, 0.02), 0x8a7458, Math.sin(a) * r, rowH(i) + 0.02, Math.cos(a) * r, { ry: a });
      }
    }

    // --- Upper arcade, awnings and banners -----------------------------------------------
    const topR = rowR(ROWS) + 0.4, topY = rowH(ROWS - 1);
    far.add(new CylinderGeometry(topR + 1.2, topR + 1.2, 10, wallSeg, 1, true, ARC0, span), composeMatrix(0, topY + 5, 0, 0, 0, 0, INNER), 0x4a3a32); // dark recess behind arches
    const arches = 34;
    for (let i = 0; i <= arches; i++) {
      const a = ARC0 + (i / arches) * span;
      const x = Math.sin(a) * topR, z = Math.cos(a) * topR;
      far.put(new RoundedBoxGeometry(1.1, 8.6, 1.4, 1, 0.1), 0xd9c19a, x, topY + 4.3, z, { ry: a });
      if (i < arches) {
        const am = a + span / arches / 2;
        const ax = Math.sin(am) * topR, az = Math.cos(am) * topR;
        far.put(new TorusGeometry(1.28, 0.32, 4, 10, Math.PI), 0xd9c19a, ax, topY + 6.4, az, { ry: am, s: [1, 1.15, 1.6] });
        // Hanging banners every few bays.
        if (i % 4 === 1) {
          const banner = new PlaneGeometry(1.3, 4.6, 1, 6);
          banner.translate(0, -2.3, 0);
          const col = [0x2f5be0, 0xd8343f, 0xf3c24f][(i >> 2) % 3];
          windy.addFn(banner, composeMatrix(ax * 0.985, topY + 8.2, az * 0.985, 0, am + Math.PI, 0), (p, _n, out) => {
            out.setHex(col);
            if (p.y < topY + 4.2) out.setHex(0xf3e2b0);
            return Math.min(1, (topY + 8.2 - p.y) / 4.6) * 0.5;
          });
        }
      }
    }
    for (const b of [far]) {
      b.add(new CylinderGeometry(topR + 0.75, topR + 0.75, 1.1, wallSeg, 1, true, ARC0, span), composeMatrix(0, topY + 9.1, 0, 0, 0, 0, INNER), 0xe6d0a8);
      b.add(new CylinderGeometry(topR + 0.75, topR + 0.75, 0.7, wallSeg, 1, true, ARC0, span), composeMatrix(0, topY + 0.35, 0, 0, 0, 0, INNER), 0xc0a67e);
    }
    // Velarium: striped awnings slanting in over the top rows.
    for (let i = 0; i < arches; i += 2) {
      const a0 = ARC0 + (i / arches) * span, a1 = ARC0 + ((i + 2) / arches) * span;
      const rOut = topR + 0.6, rIn = topR - 6;
      const pts = [
        [Math.sin(a0) * rOut, topY + 10.6, Math.cos(a0) * rOut], [Math.sin(a1) * rOut, topY + 10.6, Math.cos(a1) * rOut],
        [Math.sin((a0 + a1) / 2) * rIn, topY + 8.4, Math.cos((a0 + a1) / 2) * rIn],
      ];
      const tri = new (PlaneGeometry)(1, 1);
      const pos = tri.getAttribute('position') as BufferAttribute;
      pos.setXYZ(0, pts[0][0], pts[0][1], pts[0][2]);
      pos.setXYZ(1, pts[1][0], pts[1][1], pts[1][2]);
      pos.setXYZ(2, pts[2][0], pts[2][1], pts[2][2]);
      pos.setXYZ(3, pts[2][0], pts[2][1], pts[2][2]);
      tri.computeVertexNormals();
      windy.addFn(tri, new Matrix4(), (p, _n, out) => {
        out.setHex(i % 4 === 0 ? 0xc0392b : 0xf3e8d2);
        return Math.min(1, (topY + 10.6 - p.y) / 2.2) * 0.35;
      });
      far.put(G.cyl(6), 0x6b4a32, pts[0][0], topY + 9.6, pts[0][2], { s: [0.12, 2.4, 0.12] });
    }

    // --- Gates, statues, braziers -----------------------------------------------------
    for (const sx of [-1, 1]) {
      const a = Math.PI - sx * 1.15;
      const x = Math.sin(a) * (wallR + 0.05), z = Math.cos(a) * (wallR + 0.05);
      {
        const b = near;
        b.put(new RoundedBoxGeometry(0.8, 4.4, 1.0, 1, 0.08), 0xe2cca6, x + Math.cos(a) * 1.9, 2.2, z - Math.sin(a) * 1.9, { ry: a });
        b.put(new RoundedBoxGeometry(0.8, 4.4, 1.0, 1, 0.08), 0xe2cca6, x - Math.cos(a) * 1.9, 2.2, z + Math.sin(a) * 1.9, { ry: a });
        b.put(new TorusGeometry(1.9, 0.4, 5, 12, Math.PI), 0xe2cca6, x, 4.0, z, { ry: a, s: [1, 0.8, 1.2] });
      }
      near.put(new PlaneGeometry(3.0, 4.6), 0x241c18, x * 0.997, 2.3, z * 0.997, { ry: a + Math.PI });
      for (let k = -3; k <= 3; k++) near.put(G.cyl(4), 0x3a3a44, x + Math.cos(a) * k * 0.42, 0, z - Math.sin(a) * k * 0.42, { s: [0.05, 3.6, 0.05], gloss: 0.6 });
      for (let k = 0; k < 4; k++) near.put(G.cyl(4), 0x3a3a44, x, 0.5 + k * 0.9, z, { s: [0.05, 3.0, 0.05], rz: Math.PI / 2, ry: a, gloss: 0.6 });
      // Statue of a champion on a pedestal beside the gate.
      const sa = a - sx * 0.22;
      const px = Math.sin(sa) * (wallR - 1.2), pz = Math.cos(sa) * (wallR - 1.2);
      const marble = 0xf2ece0;
      {
        const b = near;
        b.put(new RoundedBoxGeometry(1.4, 1.6, 1.4, 1, 0.08), 0xc9b897, px, 0.8, pz, { ry: sa });
        b.put(new CylinderGeometry(0.28, 0.36, 1.3, 8), marble, px, 2.25, pz);
        b.put(new SphereGeometry(0.25, 10, 8), marble, px, 3.15, pz);
        b.put(new CapsuleGeometry(0.1, 0.6, 2, 6), marble, px + sx * 0.0, 3.3, pz, { rz: sx * 0.6, ry: sa });
        b.put(new RoundedBoxGeometry(0.08, 1.4, 0.18, 1, 0.03), marble, px + Math.cos(sa) * sx * 0.55, 4.1, pz - Math.sin(sa) * sx * 0.55, { ry: sa, rz: -sx * 0.2 });
        b.put(new CylinderGeometry(0.45, 0.25, 0.8, 8), marble, px, 1.85, pz);
      }
      // Brazier on a tripod in front of the gate pillar.
      const bx = sx * (ARENA_HALF_WIDTH + 2.2), bz = -4.5;
      {
        const b = near;
        b.put(G.cyl(6), 0x3a3030, bx, 0, bz, { s: [0.12, 2.4, 0.12] });
        b.put(new CylinderGeometry(0.6, 0.3, 0.45, 10), 0xc9a24a, bx, 2.55, bz, { gloss: 0.8 });
      }
      this.braziers.push(new Vector3(bx, 2.85, bz));
      const core = new Mesh(new SphereGeometry(0.35, 10, 8), glow(0xff8a2a, 3));
      core.position.set(bx, 2.82, bz);
      core.scale.y = 0.6;
      this.group.add(core);
    }

    // Wall torches between the gates: bracket, bowl and a live flame.
    const pools: { x: number; z: number; r: number }[] = [];
    for (const a of [Math.PI - 0.82, Math.PI - 0.42, Math.PI + 0.42, Math.PI + 0.82]) {
      const r = wallR - 0.25;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      {
        const b = near;
        b.put(new RoundedBoxGeometry(0.16, 0.7, 0.5, 1, 0.03), 0x3a3030, x, 2.2, z, { ry: a });
        b.put(new CylinderGeometry(0.34, 0.18, 0.3, 8), 0xc9a24a, Math.sin(a) * (r - 0.35), 2.7, Math.cos(a) * (r - 0.35), { gloss: 0.8 });
      }
      const fx = Math.sin(a) * (r - 0.35), fz = Math.cos(a) * (r - 0.35);
      this.braziers.push(new Vector3(fx, 2.95, fz));
      const core = new Mesh(new SphereGeometry(0.22, 8, 6), glow(0xff8a2a, 3));
      core.position.set(fx, 2.92, fz);
      core.scale.y = 0.7;
      this.group.add(core);
      pools.push({ x: Math.sin(a) * (r - 1.6), z: Math.cos(a) * (r - 1.6), r: 2.6 });
    }
    for (const p of this.braziers.slice(0, 2)) pools.push({ x: p.x, z: p.z, r: 3.2 });
    this.group.add(lightPools(pools, 0xff9a48, 0.55));
    if (d >= 1) {
      const rays = godRays(0xffcf8f, 5, new Vector3(-4, 18, -12), rnd, -1, 0.8);
      rays.mat.userData.own = true;
      this.rays = rays.mat;
      this.group.add(rays.mesh);
    }

    // --- Imperial box at the back centre ----------------------------------------------
    {
      const a = Math.PI, r = rowR(3);
      const x = Math.sin(a) * r, z = Math.cos(a) * r, y = rowH(2);
      {
        const b = near;
        b.put(new RoundedBoxGeometry(6.4, 1.3, 3.2, 1, 0.1), 0xe2cca6, x, y + 0.65, z + 0.6);
        for (const k of [-1, 1]) b.put(G.cyl(10), 0xd9b04a, x + k * 2.9, y + 1.3, z + 1.8, { s: [0.18, 3.6, 0.18], gloss: 0.8 });
        b.put(new RoundedBoxGeometry(7.2, 0.4, 3.8, 1, 0.1), 0x6a2a8a, x, y + 5.0, z + 0.4);
        b.put(new RoundedBoxGeometry(6.0, 0.6, 0.3, 1, 0.1), 0xd9b04a, x, y + 4.6, z + 2.2, { gloss: 0.8 });
      }
      near.put(new PlaneGeometry(5.4, 1.1), 0x7a2a9a, x, y + 0.6, z + 2.22);
      near.put(new PlaneGeometry(1.0, 0.6), 0xf3c24f, x, y + 0.65, z + 2.24);
      for (let k = 0; k < 3; k++) {
        const ex = x + (k - 1) * 1.4;
        near.put(new CylinderGeometry(0.2, 0.26, 0.7, 8), k === 1 ? 0xf3f0ea : 0x7a2a9a, ex, y + 1.6, z + 0.9);
        near.put(new SphereGeometry(0.17, 8, 6), 0xf0c8a4, ex, y + 2.1, z + 0.9);
        if (k === 1) near.put(new TorusGeometry(0.14, 0.035, 4, 10), 0xf3c24f, ex, y + 2.24, z + 0.9, { rx: Math.PI / 2, gloss: 1 });
      }
    }

    // Sky clouds over the rim.
    for (let i = 0; i < 10; i++) cloud(skyB, rnd, -320 + i * 70 + rnd() * 30, 60 + rnd() * 50, -330, 14 + rnd() * 10, 0xffffff, 0.5);

    finish(this.group, near, far, windy, skyB, opts.shadows);

    // --- Crowd ---------------------------------------------------------------------
    const seats: { x: number; y: number; z: number; a: number }[] = [];
    const want = Math.max(0, opts.crowd);
    let total = 0;
    for (let i = 0; i < ROWS; i++) total += (span * (rowR(i) + 0.6)) / 0.7;
    const keep = Math.min(1, want / total);
    for (let i = 0; i < ROWS; i++) {
      const r = rowR(i) + 0.62;
      const n = Math.floor((span * r) / 0.7);
      for (let k = 0; k < n; k++) {
        const a = ARC0 + ((k + 0.5) / n) * span + (rnd() - 0.5) * 0.008;
        if (aisles.some((x) => Math.abs(x - a) * r < 0.55)) continue;
        if (Math.abs(a - Math.PI) * r < 3.8 && i >= 1 && i <= 6) continue; // imperial box
        if (rnd() > keep) continue;
        seats.push({ x: Math.sin(a) * r, y: rowH(i), z: Math.cos(a) * r, a });
      }
    }
    this.crowd = seats.length ? new Crowd(seats, rnd) : null;
    if (this.crowd) this.group.add(this.crowd.mesh);
    void Quaternion;
  }

  protected animate(time: number, dt: number): void {
    if (this.rays) this.rays.uniforms.uTime.value = time;
    const c = this.crowd;
    if (!c) return;
    c.excite.value = 0.12 + this.excitement * 0.88;
    // A Mexican wave every so often, or right after a huge moment.
    this.nextWave -= dt;
    if (this.waveT < 0 && (this.nextWave <= 0 || this.excitement > 0.95)) { this.waveT = 0; this.nextWave = 14 + Math.random() * 10; }
    if (this.waveT >= 0) {
      this.waveT += dt;
      const k = this.waveT / 4.5;
      c.wave.value = ARC0 - 0.4 + k * (ARC1 - ARC0 + 0.8);
      c.waveAmt.value = Math.min(1, this.waveT * 3) * Math.min(1, (1 - k) * 4);
      if (k >= 1) { this.waveT = -1; c.waveAmt.value = 0; }
    }
    void time;
  }

  protected ambient(_time: number, fx: ArenaFx): void {
    // Dust motes and the odd thrown flower petal.
    if (Math.random() < 0.25 + this.opts.detail * 0.15) {
      fx.add.emit((Math.random() - 0.5) * 30, 0.5 + Math.random() * 3, -2 - Math.random() * 8, (Math.random() - 0.5) * 0.3, 0.1 + Math.random() * 0.2, 0, 5,
        1.4, 1.2, 0.8, 0.04 + Math.random() * 0.03, -0.02, 0.1, 0.4, 0);
    }
    if (this.excitement > 0.5 && Math.random() < this.excitement * 0.6) {
      const a = ARC0 + Math.random() * (ARC1 - ARC0), r = rowR(2);
      fx.smoke.emit(Math.sin(a) * r, rowH(2) + 1.5, Math.cos(a) * r, -Math.sin(a) * 3, 2.5, -Math.cos(a) * 3, 2.5,
        Math.random() < 0.5 ? 1.0 : 0.95, Math.random() < 0.5 ? 0.4 : 0.85, 0.5, 0.12, 2.2, 0.2, 0.8, 0);
    }
  }
}
