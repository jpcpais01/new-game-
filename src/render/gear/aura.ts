import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, Mesh, ShaderMaterial, type Object3D, type Vector3 } from 'three';
import { skinOf } from '../../gear/skins';
import type { Fighter } from '../../sim/fighter';
import type { SkinChoice } from '../../sim/loadout';
import type { GearId } from '../../sim/types';
import type { Particles } from '../fx/particles';

// -----------------------------------------------------------------------------
// Special auras: every special item (and every skin of one) wears its own
// signature aura while equipped: themed particles around the body and a
// pillar of light when it flares. Ultimates build up with the energy bar and
// erupt on the cast; passives flare when they proc (an echo, a lifesteal
// heal, an ignite or chill, the phoenix rebirth).
//
// Cost: one draw for the pillar, only while it flares; particles go through
// the shared GPU particle systems, so no extra draws.
// -----------------------------------------------------------------------------

/** What makes an aura flare besides its own ultimate. */
export type AuraTrigger = 'echo' | 'heal' | 'burn' | 'chill' | 'frozen' | 'revive';

interface Emit {
  add: Particles;
  smoke: Particles;
  /** Fighter feet (world). */
  x: number; y: number;
  /** Head top (world). */
  head: Vector3;
  /** Overall strength: about 0.4 idle, 1 charged, up to 3 at the peak of a flare. */
  k: number;
  /** Flare only (0..1.6). */
  flare: number;
  t: number;
  c1: RGB; c2: RGB;
  /** Particle count for a base rate per tick, scaled by strength and quality. */
  n(base: number): number;
}

type RGB = [number, number, number];

interface AuraDef {
  c1: number;
  c2: number;
  /** Pillar colour when it flares (defaults to c1). */
  pillar?: number;
  triggers?: AuraTrigger[];
  emit(e: Emit): void;
}

// --- emit helpers ---------------------------------------------------------------

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** One glowing mote: colour (0..1 RGB) times intensity `i`. */
function mote(p: Particles, x: number, y: number, z: number, vx: number, vy: number, vz: number,
  life: number, c: RGB, i: number, size: number, g = 0, drag = 0, sizeEnd = 0.2, stretch = 0): void {
  p.emit(x, y, z, vx, vy, vz, life, c[0] * i, c[1] * i, c[2] * i, size * 1.5, g, drag, sizeEnd, stretch);
}

/** A random point on a ring of radius r around the feet (z squashed: the arena is seen from the side). */
function onRing(e: Emit, r: number, h = 0): [number, number, number, number] {
  const a = Math.random() * Math.PI * 2;
  return [e.x + Math.cos(a) * r, e.y + h, Math.sin(a) * r * 0.8, a];
}

// Shared motifs.

/** Embers rising from the ground around the feet. */
function embers(e: Emit, rate: number, c: RGB, up = 1.2, i = 2.4): void {
  for (let k = e.n(rate); k > 0; k--) {
    const [x, y, z] = onRing(e, rnd(0.25, 0.9), 0.05);
    mote(e.add, x, y, z, rnd(-0.2, 0.2), rnd(up * 0.6, up * 1.3), rnd(-0.1, 0.1), rnd(0.6, 1.1), c, i, rnd(0.05, 0.1), -1.2, 0.6, 0.1);
  }
}

/** Motes spiralling up around the body. */
function spiral(e: Emit, rate: number, c: RGB, r = 0.55, i = 2.4, speed = 2.4): void {
  for (let k = e.n(rate); k > 0; k--) {
    const [x, y, z, a] = onRing(e, r, rnd(0.1, 0.5));
    const tx = -Math.sin(a) * speed, tz = Math.cos(a) * speed * 0.8;
    mote(e.add, x, y, z, tx, rnd(0.9, 1.6), tz, rnd(0.5, 0.8), c, i, rnd(0.05, 0.09), -0.5, 2.2, 0.15, 0.03);
  }
}

/** Little sparks winking in and out around the body. */
function glints(e: Emit, rate: number, c: RGB, i = 2.6): void {
  for (let k = e.n(rate); k > 0; k--) {
    const [x, y, z] = onRing(e, rnd(0.35, 0.7), rnd(0.5, 1.8));
    mote(e.add, x, y, z, rnd(-0.3, 0.3), rnd(-0.1, 0.4), rnd(-0.3, 0.3), rnd(0.3, 0.6), c, i, rnd(0.04, 0.08), 0, 1.5, 0.1);
  }
}

/** Vertical light streaks shooting up from the ground. */
function rays(e: Emit, rate: number, c: RGB, i = 2.6, speed = 4): void {
  for (let k = e.n(rate); k > 0; k--) {
    const [x, y, z] = onRing(e, rnd(0.3, 0.95), 0.05);
    mote(e.add, x, y, z, 0, rnd(speed * 0.6, speed), 0, rnd(0.3, 0.55), c, i, rnd(0.03, 0.05), 0, 1.5, 0.3, 0.12);
  }
}

/** Motes pulled in from outside towards the body. */
function converge(e: Emit, rate: number, c: RGB, i = 2.2, r = 1.25, swirl = 0): void {
  for (let k = e.n(rate); k > 0; k--) {
    const [x, , z, a] = onRing(e, r);
    const h = rnd(0.2, 1.7);
    const life = rnd(0.45, 0.7);
    const vx = (-Math.cos(a) * r - Math.sin(a) * swirl) / life;
    const vz = (-Math.sin(a) * r * 0.8 + Math.cos(a) * swirl * 0.8) / life;
    mote(e.add, x, e.y + h, z, vx, (1.0 - h) * 0.4 / life, vz, life, c, i, rnd(0.05, 0.09), 0, 0, 0.1, 0.02);
  }
}

// --- the auras -----------------------------------------------------------------------

const AURAS: Record<string, AuraDef> = {
  // ---------------------------------------------------------------- base specials
  meteor_sigil: {
    c1: 0xff6a1a, c2: 0xffd36a,
    emit(e) {
      embers(e, 0.9, e.c1, 1.3);
      // Falling stars streaking down around the fighter, more as the ultimate charges.
      for (let k = e.n(0.12); k > 0; k--) {
        const x = e.x + rnd(-0.9, 0.9), z = rnd(-0.5, 0.5);
        mote(e.add, x + 1.2, e.y + rnd(2.6, 3.2), z, -2.4, -5.5, 0, rnd(0.4, 0.55), e.c2, 3.2, 0.06, 0, 0, 0.3, 0.07);
      }
      glints(e, 0.6, e.c1);
    },
  },
  judgment_relic: {
    c1: 0xffe08a, c2: 0xffffff,
    emit(e) {
      rays(e, 0.7, e.c1);
      for (let k = e.n(0.5); k > 0; k--) {
        const [x, y, z] = onRing(e, rnd(0.2, 0.7), rnd(0.3, 1.8));
        mote(e.add, x, y, z, 0, rnd(0.2, 0.5), 0, rnd(0.8, 1.2), e.c2, 2.2, rnd(0.04, 0.07), -0.2, 0.5, 0.2);
      }
      glints(e, 0.5, e.c1);
    },
  },
  phantom_blade: {
    c1: 0xb0c8ff, c2: 0xe8f0ff,
    emit(e) {
      // Spectral cuts circling the body: fast tangential streaks.
      for (let k = e.n(0.7); k > 0; k--) {
        const [x, y, z, a] = onRing(e, rnd(0.5, 0.75), rnd(0.4, 1.6));
        const s = rnd(3, 5);
        mote(e.add, x, y, z, -Math.sin(a) * s, rnd(-0.2, 0.4), Math.cos(a) * s * 0.8, rnd(0.18, 0.3), e.c1, 2.8, rnd(0.03, 0.05), 0, 3, 0.3, 0.1);
      }
      for (let k = e.n(0.3); k > 0; k--) {
        const [x, y, z] = onRing(e, rnd(0.3, 0.7), rnd(0.2, 1.5));
        mote(e.add, x, y, z, 0, 0.35, 0, rnd(0.8, 1.2), e.c2, 1.4, rnd(0.1, 0.16), -0.2, 0.5, 1.4);
      }
      glints(e, 0.5, e.c2);
    },
  },
  earth_heart: {
    c1: 0xffa040, c2: 0xc07a3a,
    emit(e) {
      // Pebbles hopping off the ground and amber light seeping from the cracks.
      for (let k = e.n(0.35); k > 0; k--) {
        const [x, , z] = onRing(e, rnd(0.3, 0.95));
        e.smoke.emit(x, e.y + 0.05, z, rnd(-0.3, 0.3), rnd(1.4, 2.6), 0, rnd(0.5, 0.75), 0.42, 0.3, 0.22, rnd(0.04, 0.08), 7, 0.2, 0.8, 0);
      }
      embers(e, 0.5, e.c1, 0.7, 2);
      glints(e, 0.4, e.c1);
    },
  },
  phoenix_feather: {
    c1: 0xff9a2e, c2: 0xffe36a, pillar: 0xff7a1a, triggers: ['revive'],
    emit(e) {
      spiral(e, 0.9, e.c1, 0.5, 2.6, 2.6);
      embers(e, 0.4, e.c2, 1.5, 2.8);
    },
  },
  echo_stone: {
    c1: 0x6b8cff, c2: 0xb8c8ff, triggers: ['echo'],
    emit(e) {
      // Motes on a ring at the waist, each with a fainter echo trailing it.
      for (let k = e.n(0.6); k > 0; k--) {
        const [x, , z, a] = onRing(e, 0.6);
        const y = e.y + 1.0 + Math.sin(e.t * 2 + a * 2) * 0.12;
        const tx = -Math.sin(a) * 1.4, tz = Math.cos(a) * 1.1;
        mote(e.add, x, y, z, tx, 0, tz, 0.5, e.c1, 2.6, 0.06, 0, 0.5, 0.3);
        mote(e.add, x - tx * 0.08, y, z - tz * 0.08, tx, 0, tz, 0.5, e.c2, 1.1, 0.05, 0, 0.5, 0.3);
      }
      glints(e, 0.5, e.c2);
    },
  },
  vampiric_fang: {
    c1: 0xff2e55, c2: 0x9a0a28, triggers: ['heal'],
    emit(e) {
      converge(e, 0.6, e.c1, 2.2, 1.2, 0.6);
      // Dark droplets falling around the body.
      for (let k = e.n(0.25); k > 0; k--) {
        const [x, y, z] = onRing(e, rnd(0.3, 0.6), rnd(0.9, 1.6));
        mote(e.add, x, y, z, 0, -0.2, 0, 0.6, e.c2, 2, 0.05, 8, 0, 0.6);
      }
    },
  },
  ember_core: {
    c1: 0xff6a1a, c2: 0xffb347, triggers: ['burn'],
    emit(e) {
      embers(e, 0.8, e.c1, 1.6, 2.6);
      if (Math.random() < 0.15 * e.k) e.smoke.emit(e.x + rnd(-0.4, 0.4), e.y + 0.2, rnd(-0.3, 0.3), 0, 0.8, 0, 0.9, 0.22, 0.17, 0.16, 0.18, -0.4, 0.5, 2.2, 0);
      glints(e, 0.5, e.c2);
    },
  },
  frost_core: {
    c1: 0x7fe0ff, c2: 0xe8fbff, triggers: ['chill', 'frozen'],
    emit(e) {
      // Snow falling around the fighter and a cold mist at the feet.
      for (let k = e.n(0.6); k > 0; k--) {
        const x = e.x + rnd(-0.9, 0.9);
        mote(e.add, x, e.y + rnd(2.0, 2.4), rnd(-0.4, 0.4), rnd(-0.15, 0.15), -0.6, 0, rnd(1.6, 2.2), e.c2, 2.2, rnd(0.03, 0.06), 0.2, 0.3, 0.6);
      }
      if (Math.random() < 0.3 * e.k) {
        const [x, , z] = onRing(e, rnd(0.2, 0.8));
        e.smoke.emit(x, e.y + 0.08, z, rnd(-0.3, 0.3), 0.08, 0, 1.0, 0.8, 0.92, 1.0, 0.2, 0, 1, 2.4, 0);
      }
      glints(e, 0.5, e.c1);
    },
  },

  // ---------------------------------------------------------------- skins
  hellforge_core: {
    c1: 0xff5a10, c2: 0xffc040, triggers: ['burn'],
    emit(e) {
      embers(e, 1.0, e.c1, 1.8, 3);
      // Black ash flakes riding the heat.
      for (let k = e.n(0.35); k > 0; k--) {
        const [x, , z] = onRing(e, rnd(0.2, 0.8));
        e.smoke.emit(x, e.y + rnd(0.2, 0.8), z, rnd(-0.2, 0.2), rnd(0.8, 1.3), 0, rnd(0.8, 1.2), 0.08, 0.06, 0.06, rnd(0.03, 0.05), -0.6, 0.6, 1, 0);
      }
      glints(e, 0.7, e.c2, 3);
    },
  },
  rimeborn_core: {
    c1: 0x8fe6ff, c2: 0xffffff, triggers: ['chill', 'frozen'],
    emit(e) {
      // Glittering ice shards orbiting slowly, flickering as they turn.
      for (let k = e.n(0.6); k > 0; k--) {
        const [x, , z, a] = onRing(e, rnd(0.55, 0.8));
        mote(e.add, x, e.y + rnd(0.3, 1.8), z, -Math.sin(a) * 0.9, rnd(-0.1, 0.2), Math.cos(a) * 0.7, rnd(0.5, 0.9), Math.random() < 0.5 ? e.c1 : e.c2, 3, rnd(0.03, 0.05), 0, 0.5, 0.2, 0.06);
      }
      for (let k = e.n(0.35); k > 0; k--) {
        mote(e.add, e.x + rnd(-0.8, 0.8), e.y + rnd(2.0, 2.3), rnd(-0.4, 0.4), 0, -0.5, 0, 2, e.c2, 2, rnd(0.03, 0.05), 0.2, 0.4, 0.6);
      }
      glints(e, 0.6, e.c2, 3);
    },
  },
  dawn_relic: {
    c1: 0xffd76a, c2: 0xfff6d8,
    emit(e) {
      rays(e, 0.6, e.c1, 2.8, 5);
      // Feathers of light drifting down, swaying as they fall.
      for (let k = e.n(0.3); k > 0; k--) {
        const x = e.x + rnd(-0.8, 0.8);
        mote(e.add, x, e.y + rnd(2.1, 2.5), rnd(-0.3, 0.3), rnd(-0.5, 0.5), -0.5, 0, rnd(1.4, 2), e.c2, 2.4, rnd(0.06, 0.09), 0.1, 0.8, 0.3, 0.12);
      }
      glints(e, 0.6, e.c2, 3);
    },
  },
  void_blade: {
    c1: 0xb46bff, c2: 0xff6ad5,
    emit(e) {
      // The rift swallows light: motes swirling inwards, and pin-prick stars.
      converge(e, 0.8, e.c1, 2.2, 1.3, 1.2);
      for (let k = e.n(0.4); k > 0; k--) {
        const [x, y, z] = onRing(e, rnd(0.2, 1.0), rnd(0.1, 2.0));
        mote(e.add, x, y, z, 0, 0, 0, rnd(0.15, 0.3), [1, 0.95, 1], 4, rnd(0.03, 0.05), 0, 0, 0.1);
      }
      glints(e, 0.6, e.c2, 3);
    },
  },
  wild_heart: {
    c1: 0x9cff6a, c2: 0xffb4d6,
    emit(e) {
      // Leaves and petals tumbling down, glowing pollen rising.
      for (let k = e.n(0.3); k > 0; k--) {
        const pink = Math.random() < 0.35;
        e.smoke.emit(e.x + rnd(-0.9, 0.9), e.y + rnd(1.8, 2.3), rnd(-0.4, 0.4), rnd(-0.5, 0.5), -0.4, 0, rnd(1.6, 2.2),
          pink ? 1 : 0.42, pink ? 0.7 : 0.78, pink ? 0.84 : 0.26, rnd(0.05, 0.08), 0.15, 0.8, 0.9, 0);
      }
      for (let k = e.n(0.5); k > 0; k--) {
        const [x, , z] = onRing(e, rnd(0.2, 0.9));
        mote(e.add, x, e.y + rnd(0.05, 0.5), z, rnd(-0.1, 0.1), rnd(0.3, 0.7), 0, rnd(1, 1.5), e.c1, 2.2, rnd(0.03, 0.06), -0.2, 0.5, 0.3);
      }
      glints(e, 0.5, e.c1);
    },
  },
  neon_core: {
    c1: 0x2ef2ff, c2: 0xff3ad6, triggers: ['echo'],
    emit(e) {
      // Data streaks rising in two colours, and a bright scanline ring.
      for (let k = e.n(0.9); k > 0; k--) {
        const [x, y, z] = onRing(e, rnd(0.25, 0.9), 0.05);
        mote(e.add, x, y, z, 0, rnd(2, 3.5), 0, rnd(0.35, 0.6), Math.random() < 0.6 ? e.c1 : e.c2, 3, 0.03, 0, 0.5, 1, 0.1);
      }
      if (Math.random() < 0.2 * e.k) {
        const h = e.y + rnd(0.2, 1.8);
        for (let s = 0; s < 10; s++) {
          const a = (s / 10) * Math.PI * 2;
          mote(e.add, e.x + Math.cos(a) * 0.55, h, Math.sin(a) * 0.45, 0, 0, 0, 0.18, e.c1, 3, 0.04);
        }
      }
      glints(e, 0.6, e.c2, 3);
    },
  },
};

// --- quality ------------------------------------------------------------------------

let detailMul = 1;
/** Particle density for the render quality (0 low, 1 medium, 2 high). */
export function setAuraDetail(tier: number): void {
  detailMul = tier <= 0 ? 0.35 : tier === 1 ? 0.7 : 1;
}

// --- meshes -----------------------------------------------------------------------------

let pillarGeo: CylinderGeometry | null = null;

const PILLAR_FRAG = /* glsl */ `
  uniform float uTime, uK;
  uniform vec3 uC;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float edge = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.5);
    float bands = 0.6 + 0.4 * sin(vUv.y * 14.0 - uTime * 9.0 + vUv.x * 37.7);
    float fade = (1.0 - vUv.y) * smoothstep(0.0, 0.08, vUv.y);
    float a = clamp((0.25 + edge) * bands * fade * max(uK, 0.0), 0.0, 3.0);
    gl_FragColor = vec4(uC * a, a);
  }`;

const toRGB = (c: number): RGB => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

/**
 * The aura of one fighter's special item. Lives in the fighter view: call
 * update() every frame and pulse() when the special fires or procs.
 */
export class SpecialAura {
  readonly id: string;
  private readonly def: AuraDef;
  private readonly pillar: Mesh;
  private readonly pillarMat: ShaderMaterial;
  private readonly c1: RGB;
  private readonly c2: RGB;
  private flare = 0;
  private charge = 0;
  private time = 0;
  private acc = 0;

  /** The aura for a fighter's special (null when it has none). */
  static for(gear: { special?: GearId }, skins: SkinChoice | undefined): SpecialAura | null {
    const id = gear.special;
    if (!id) return null;
    const key = skinOf(id, skins)?.id ?? id;
    const def = AURAS[key] ?? AURAS[id];
    return def ? new SpecialAura(key, def) : null;
  }

  private constructor(id: string, def: AuraDef) {
    this.id = id;
    this.def = def;
    this.c1 = toRGB(def.c1);
    this.c2 = toRGB(def.c2);
    pillarGeo ??= new CylinderGeometry(0.62, 0.78, 2.6, 28, 1, true).translate(0, 1.3, 0);
    this.pillarMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uC: { value: new Color(def.pillar ?? def.c1) } },
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: PILLAR_FRAG,
    });
    this.pillar = new Mesh(pillarGeo, this.pillarMat);
    this.pillar.renderOrder = 9;
    this.pillar.visible = false;
  }

  /** Adds the pillar to the fighter group. */
  attach(group: Object3D): void {
    group.add(this.pillar);
  }

  /** The special fired ('cast'), procced ('proc') or did something huge ('big'). */
  pulse(kind: 'cast' | 'proc' | 'big'): void {
    this.flare = Math.max(this.flare, kind === 'big' ? 1.6 : kind === 'cast' ? 1.15 : 0.6);
  }

  /** A battle event that may trigger this aura (only flares if it is one of its triggers). */
  trigger(t: AuraTrigger): void {
    if (this.def.triggers?.includes(t)) this.pulse(t === 'revive' ? 'big' : 'proc');
  }

  /** `x`, `groundY`: the fighter's feet in world space; `scale`: the fighter group's scale. */
  update(f: Fighter, dt: number, add: Particles, smoke: Particles, x: number, groundY: number, head: Vector3, scale: number): void {
    this.time += dt;
    // Ultimates build up with the energy bar; passives hum at a steady level.
    const ult = f.abilities.find((a) => a.slot === 'ultimate');
    const want = !f.alive ? 0
      : ult ? Math.min(1, f.energy / Math.max(1, ult.cost))
      : f.has.has('phoenix_feather') && f.phoenixUsed ? 0.1 : 0.6;
    this.charge += (want - this.charge) * Math.min(1, dt * 3);
    // While the ultimate is being performed the aura stays lit.
    const a = f.action;
    if (a && f.abilities[a.ability]?.slot === 'ultimate' && a.phase !== 'recovery') this.flare = Math.max(this.flare, 0.9);
    this.flare = Math.max(0, this.flare - dt * (0.7 + this.flare * 0.6));
    const ready = ult && this.charge > 0.98 ? 0.25 + Math.sin(this.time * 6) * 0.15 : 0;
    const level = f.alive ? 0.4 + this.charge * 0.6 + ready : 0;
    const k = level + this.flare * 1.6;

    const pk = Math.min(1, this.flare) * 1.4;
    this.pillar.visible = pk > 0.03;
    if (this.pillar.visible) {
      // Rooted on the ground, even while the fighter leaps.
      this.pillar.position.y = (0.045 - groundY) / scale;
      this.pillar.scale.set(1 + (1 - Math.min(1, this.flare)) * 0.4, 0.7 + Math.min(1, this.flare) * 0.4, 1 + (1 - Math.min(1, this.flare)) * 0.4);
      this.pillarMat.uniforms.uTime.value = this.time;
      this.pillarMat.uniforms.uK.value = pk;
    }

    // Particles at 30 Hz.
    if (!f.alive || dt <= 0) return;
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    const step = Math.min(this.acc * 30, 3);
    this.acc = 0;
    const mul = detailMul * step;
    this.def.emit({
      add, smoke, x, y: groundY, head, k, flare: this.flare, t: this.time, c1: this.c1, c2: this.c2,
      n: (base) => { const v = base * k * mul * 1.5; return Math.floor(v + Math.random()); },
    });
  }

  dispose(): void {
    this.pillar.removeFromParent();
    this.pillarMat.dispose();
  }
}
