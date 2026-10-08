import {
  AddEquation, AdditiveBlending, Color, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, CylinderGeometry, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, type Object3D, type Vector3,
} from 'three';
import { skinOf } from '../../gear/skins';
import type { Fighter } from '../../sim/fighter';
import type { SkinChoice } from '../../sim/loadout';
import type { GearId } from '../../sim/types';
import type { Particles } from '../fx/particles';

// -----------------------------------------------------------------------------
// Special auras: every special item (and every skin of one) wears its own
// signature aura while equipped: a glowing sigil on the ground under the
// fighter, themed particles around the body and its orbiting relic, and a
// pillar of light when it flares. Ultimates build up with the energy bar and
// erupt on the cast; passives flare when they proc (an echo, a lifesteal
// heal, an ignite or chill, the phoenix rebirth).
//
// Cost: one draw for the sigil (plus one for the pillar while it flares);
// particles go through the shared GPU particle systems, so no extra draws.
// -----------------------------------------------------------------------------

/** What makes an aura flare besides its own ultimate. */
export type AuraTrigger = 'echo' | 'heal' | 'burn' | 'chill' | 'frozen' | 'revive';

/** Ground sigil patterns (see the fragment shader). */
const SIGIL = {
  runes: 0, sunburst: 1, blades: 2, cracks: 3, flame: 4, ripples: 5, thorns: 6, snowflake: 7,
  spiral: 8, circuit: 9, bloom: 10, forge: 11, halo: 12, frost: 13,
} as const;
type Sigil = keyof typeof SIGIL;

interface Emit {
  add: Particles;
  smoke: Particles;
  /** Fighter feet (world). */
  x: number; y: number;
  /** Head top and orbiting relic (world). */
  head: Vector3;
  orb: Vector3 | null;
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
  sigil: Sigil;
  c1: number;
  c2: number;
  /** Sigil size (radius in metres) and spin (rad/s). */
  radius?: number;
  spin?: number;
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

/** Embers rising off the sigil's rim. */
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

/** Little sparks around the orbiting relic. */
function relicSparks(e: Emit, rate: number, c: RGB, i = 2.6): void {
  if (!e.orb) return;
  for (let k = e.n(rate); k > 0; k--) {
    mote(e.add, e.orb.x + rnd(-0.08, 0.08), e.orb.y + rnd(-0.08, 0.08), e.orb.z + rnd(-0.08, 0.08),
      rnd(-0.3, 0.3), rnd(-0.1, 0.4), rnd(-0.3, 0.3), rnd(0.3, 0.6), c, i, rnd(0.04, 0.08), 0, 1.5, 0.1);
  }
}

/** Vertical light streaks shooting up from the sigil. */
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
    sigil: 'runes', c1: 0xff6a1a, c2: 0xffd36a, spin: 0.35,
    emit(e) {
      embers(e, 0.9, e.c1, 1.3);
      // Falling stars streaking down onto the sigil, more as the ultimate charges.
      for (let k = e.n(0.12); k > 0; k--) {
        const x = e.x + rnd(-0.9, 0.9), z = rnd(-0.5, 0.5);
        mote(e.add, x + 1.2, e.y + rnd(2.6, 3.2), z, -2.4, -5.5, 0, rnd(0.4, 0.55), e.c2, 3.2, 0.06, 0, 0, 0.3, 0.07);
      }
      relicSparks(e, 0.6, e.c1);
    },
  },
  judgment_relic: {
    sigil: 'sunburst', c1: 0xffe08a, c2: 0xffffff, spin: 0.15,
    emit(e) {
      rays(e, 0.7, e.c1);
      for (let k = e.n(0.5); k > 0; k--) {
        const [x, y, z] = onRing(e, rnd(0.2, 0.7), rnd(0.3, 1.8));
        mote(e.add, x, y, z, 0, rnd(0.2, 0.5), 0, rnd(0.8, 1.2), e.c2, 2.2, rnd(0.04, 0.07), -0.2, 0.5, 0.2);
      }
      relicSparks(e, 0.5, e.c1);
    },
  },
  phantom_blade: {
    sigil: 'blades', c1: 0xb0c8ff, c2: 0xe8f0ff, spin: 0.6,
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
      relicSparks(e, 0.5, e.c2);
    },
  },
  earth_heart: {
    sigil: 'cracks', c1: 0xffa040, c2: 0xc07a3a, spin: 0.05,
    emit(e) {
      // Pebbles hopping off the ground and amber light seeping from the cracks.
      for (let k = e.n(0.35); k > 0; k--) {
        const [x, , z] = onRing(e, rnd(0.3, 0.95));
        e.smoke.emit(x, e.y + 0.05, z, rnd(-0.3, 0.3), rnd(1.4, 2.6), 0, rnd(0.5, 0.75), 0.42, 0.3, 0.22, rnd(0.04, 0.08), 7, 0.2, 0.8, 0);
      }
      embers(e, 0.5, e.c1, 0.7, 2);
      relicSparks(e, 0.4, e.c1);
    },
  },
  phoenix_feather: {
    sigil: 'flame', c1: 0xff9a2e, c2: 0xffe36a, spin: 0.4, pillar: 0xff7a1a, triggers: ['revive'],
    emit(e) {
      spiral(e, 0.9, e.c1, 0.5, 2.6, 2.6);
      embers(e, 0.4, e.c2, 1.5, 2.8);
    },
  },
  echo_stone: {
    sigil: 'ripples', c1: 0x6b8cff, c2: 0xb8c8ff, spin: 0.2, triggers: ['echo'],
    emit(e) {
      // Motes on a ring at the waist, each with a fainter echo trailing it.
      for (let k = e.n(0.6); k > 0; k--) {
        const [x, , z, a] = onRing(e, 0.6);
        const y = e.y + 1.0 + Math.sin(e.t * 2 + a * 2) * 0.12;
        const tx = -Math.sin(a) * 1.4, tz = Math.cos(a) * 1.1;
        mote(e.add, x, y, z, tx, 0, tz, 0.5, e.c1, 2.6, 0.06, 0, 0.5, 0.3);
        mote(e.add, x - tx * 0.08, y, z - tz * 0.08, tx, 0, tz, 0.5, e.c2, 1.1, 0.05, 0, 0.5, 0.3);
      }
      relicSparks(e, 0.5, e.c2);
    },
  },
  vampiric_fang: {
    sigil: 'thorns', c1: 0xff2e55, c2: 0x9a0a28, spin: -0.25, triggers: ['heal'],
    emit(e) {
      converge(e, 0.6, e.c1, 2.2, 1.2, 0.6);
      // Dark droplets dripping off the relic.
      if (e.orb) for (let k = e.n(0.25); k > 0; k--) mote(e.add, e.orb.x, e.orb.y - 0.08, e.orb.z, 0, -0.2, 0, 0.6, e.c2, 2, 0.05, 8, 0, 0.6);
    },
  },
  ember_core: {
    sigil: 'flame', c1: 0xff6a1a, c2: 0xffb347, spin: 0.5, triggers: ['burn'],
    emit(e) {
      embers(e, 0.8, e.c1, 1.6, 2.6);
      if (Math.random() < 0.15 * e.k) e.smoke.emit(e.x + rnd(-0.4, 0.4), e.y + 0.2, rnd(-0.3, 0.3), 0, 0.8, 0, 0.9, 0.22, 0.17, 0.16, 0.18, -0.4, 0.5, 2.2, 0);
      relicSparks(e, 0.5, e.c2);
    },
  },
  frost_core: {
    sigil: 'snowflake', c1: 0x7fe0ff, c2: 0xe8fbff, spin: 0.2, triggers: ['chill', 'frozen'],
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
      relicSparks(e, 0.5, e.c1);
    },
  },

  // ---------------------------------------------------------------- skins
  hellforge_core: {
    sigil: 'forge', c1: 0xff5a10, c2: 0xffc040, spin: 0.3, triggers: ['burn'],
    emit(e) {
      embers(e, 1.0, e.c1, 1.8, 3);
      // Black ash flakes riding the heat.
      for (let k = e.n(0.35); k > 0; k--) {
        const [x, , z] = onRing(e, rnd(0.2, 0.8));
        e.smoke.emit(x, e.y + rnd(0.2, 0.8), z, rnd(-0.2, 0.2), rnd(0.8, 1.3), 0, rnd(0.8, 1.2), 0.08, 0.06, 0.06, rnd(0.03, 0.05), -0.6, 0.6, 1, 0);
      }
      relicSparks(e, 0.7, e.c2, 3);
    },
  },
  rimeborn_core: {
    sigil: 'frost', c1: 0x8fe6ff, c2: 0xffffff, spin: -0.15, triggers: ['chill', 'frozen'],
    emit(e) {
      // Glittering ice shards orbiting slowly, flickering as they turn.
      for (let k = e.n(0.6); k > 0; k--) {
        const [x, , z, a] = onRing(e, rnd(0.55, 0.8));
        mote(e.add, x, e.y + rnd(0.3, 1.8), z, -Math.sin(a) * 0.9, rnd(-0.1, 0.2), Math.cos(a) * 0.7, rnd(0.5, 0.9), Math.random() < 0.5 ? e.c1 : e.c2, 3, rnd(0.03, 0.05), 0, 0.5, 0.2, 0.06);
      }
      for (let k = e.n(0.35); k > 0; k--) {
        mote(e.add, e.x + rnd(-0.8, 0.8), e.y + rnd(2.0, 2.3), rnd(-0.4, 0.4), 0, -0.5, 0, 2, e.c2, 2, rnd(0.03, 0.05), 0.2, 0.4, 0.6);
      }
      relicSparks(e, 0.6, e.c2, 3);
    },
  },
  dawn_relic: {
    sigil: 'halo', c1: 0xffd76a, c2: 0xfff6d8, spin: 0.12,
    emit(e) {
      rays(e, 0.6, e.c1, 2.8, 5);
      // Feathers of light drifting down, swaying as they fall.
      for (let k = e.n(0.3); k > 0; k--) {
        const x = e.x + rnd(-0.8, 0.8);
        mote(e.add, x, e.y + rnd(2.1, 2.5), rnd(-0.3, 0.3), rnd(-0.5, 0.5), -0.5, 0, rnd(1.4, 2), e.c2, 2.4, rnd(0.06, 0.09), 0.1, 0.8, 0.3, 0.12);
      }
      relicSparks(e, 0.6, e.c2, 3);
    },
  },
  void_blade: {
    sigil: 'spiral', c1: 0xb46bff, c2: 0xff6ad5, spin: 0.9,
    emit(e) {
      // The rift swallows light: motes swirling inwards, and pin-prick stars.
      converge(e, 0.8, e.c1, 2.2, 1.3, 1.2);
      for (let k = e.n(0.4); k > 0; k--) {
        const [x, y, z] = onRing(e, rnd(0.2, 1.0), rnd(0.1, 2.0));
        mote(e.add, x, y, z, 0, 0, 0, rnd(0.15, 0.3), [1, 0.95, 1], 4, rnd(0.03, 0.05), 0, 0, 0.1);
      }
      relicSparks(e, 0.6, e.c2, 3);
    },
  },
  wild_heart: {
    sigil: 'bloom', c1: 0x9cff6a, c2: 0xffb4d6, spin: 0.1,
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
      relicSparks(e, 0.5, e.c1);
    },
  },
  neon_core: {
    sigil: 'circuit', c1: 0x2ef2ff, c2: 0xff3ad6, spin: 0.3, triggers: ['echo'],
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
      relicSparks(e, 0.6, e.c2, 3);
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

let sigilGeo: PlaneGeometry | null = null;
let pillarGeo: CylinderGeometry | null = null;

const SIGIL_FRAG = /* glsl */ `
  uniform float uTime, uK, uStyle, uSpin;
  uniform vec3 uC1, uC2;
  varying vec2 vUv;
  #define PI 3.14159265
  #define TAU 6.2831853
  // Lines are drawn a touch wider than asked: the arena is seen at a grazing angle.
  float band(float r, float c, float w) { return 1.0 - smoothstep(0.0, w * 1.6, abs(r - c)); }
  // 1 on n evenly spaced spokes, w = angular half width (fraction of the gap).
  float spokes(float a, float n, float w) { float s = abs(fract(a * n / TAU + 0.5) - 0.5) * 2.0; return 1.0 - smoothstep(0.0, w * 1.4, s); }
  float hexR(float a, float r) { return r * cos(mod(a, PI / 3.0) - PI / 6.0); }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    // Offset keeps atan away from (0, 0), which is undefined (NaN on some GPUs).
    float a0 = atan(p.y, p.x + 1e-5);
    float t = uTime;
    float a = a0 + t * uSpin;
    float m = 0.0;
    float st = uStyle;
    if (st < 0.5) { // runes
      m = band(r, 0.93, 0.02) + band(r, 0.78, 0.012) * 0.8
        + spokes(a, 16.0, 0.18) * step(0.8, r) * step(r, 0.9) * (0.6 + 0.4 * sin(a0 * 5.0 + t * 2.0))
        + band(r, 0.5, 0.012) * step(0.5, fract(a0 * 4.0 / PI - t * 0.4)) * 0.8
        + spokes(a0 - t * uSpin * 2.0, 3.0, 0.03) * step(r, 0.5) * 0.5;
    } else if (st < 1.5) { // sunburst
      float w = 0.3 * clamp(1.0 - (r - 0.32) / 0.6, 0.0, 1.0);
      m = band(r, 0.3, 0.025) + spokes(a, 12.0, w) * step(0.32, r) * step(r, 0.92) * 0.9
        + spokes(-a, 24.0, 0.06) * band(r, 0.95, 0.03) + band(r, 0.18, 0.06) * 0.6;
    } else if (st < 2.5) { // blades
      m = band(r, 0.92, 0.015) + spokes(a, 4.0, 0.025) * step(r, 0.9) * (1.1 - r * 0.5)
        + spokes(a + PI / 4.0, 4.0, 0.02) * step(r, 0.62) * 0.7 + band(r, 0.32, 0.015);
    } else if (st < 3.5) { // cracks
      float j = a0 + sin(r * 21.0 + a0 * 3.0) * 0.08 + sin(r * 47.0) * 0.03;
      m = spokes(j, 7.0, 0.035) * step(r, 0.95) * (1.3 - r) + spokes(j + 0.4, 11.0, 0.02) * step(0.45, r) * step(r, 0.8) * 0.7
        + band(r, 0.93, 0.02) * step(0.3, fract(a0 * 3.0 / PI)) + (1.0 - smoothstep(0.0, 0.22, r)) * 0.8;
    } else if (st < 4.5) { // flame petals
      float f = 0.55 + 0.32 * pow(abs(cos(a * 3.0)), 3.0) + 0.04 * sin(a0 * 9.0 + t * 6.0);
      m = band(r, f, 0.03) + band(r, 0.93, 0.015) + band(r, 0.36, 0.02) * 0.7 + band(r, f * 0.62, 0.02) * 0.6;
    } else if (st < 5.5) { // ripples
      float w = fract(r * 2.6 - t * 0.55);
      m = band(w, 0.5, 0.06) * (1.0 - r) * 1.4 + band(r, 0.94, 0.015) + spokes(a, 6.0, 0.03) * band(r, 0.94, 0.06);
    } else if (st < 6.5) { // thorns
      float g = abs(fract(a * 10.0 / TAU + 0.5) - 0.5) * 2.0;
      float thorn = step(g, (0.9 - r) * 2.4) * step(0.55, r) * step(r, 0.9);
      m = band(r, 0.9, 0.025) + thorn * 0.8 + band(r, 0.42, 0.015) + spokes(-a * 2.0, 10.0, 0.05) * band(r, 0.42, 0.05);
    } else if (st < 7.5) { // snowflake
      float main6 = spokes(a, 6.0, 0.025) * step(r, 0.85);
      float branch = spokes(a, 12.0, 0.05) * (band(r, 0.5, 0.08) + band(r, 0.7, 0.06));
      m = main6 + branch * 0.7 + band(r, hexR(a, 0.92) / cos(PI / 6.0) * 0.92, 0.02);
    } else if (st < 8.5) { // spiral rift
      float s = sin(a0 * 3.0 + log(r + 0.02) * 6.0 - t * uSpin * 3.0);
      m = smoothstep(0.65, 1.0, s) * (1.1 - r) * 1.2 + band(r, 0.94, 0.015) + (1.0 - smoothstep(0.0, 0.18, r)) * 0.7;
    } else if (st < 9.5) { // circuit
      vec2 q = p * 6.0;
      vec2 c = abs(fract(q) - 0.5);
      float grid = (1.0 - smoothstep(0.0, 0.06, min(c.x, c.y))) * step(r, 0.88) * 0.25;
      float sweep = exp(-mod(a0 - t * 2.2, TAU) * 1.5);
      m = grid * (0.4 + sweep * 2.0) + band(r, 0.92, 0.015) + band(r, 0.55, 0.012) * step(0.4, fract(a0 * 8.0 / PI))
        + sweep * band(r, 0.92, 0.05) * 1.5;
    } else if (st < 10.5) { // bloom
      float petal = 0.88 * pow(abs(cos(a * 4.0)), 0.6);
      float inner = 0.52 * pow(abs(cos(a * 4.0 + PI / 2.0)), 0.6);
      m = band(r, petal, 0.025) * step(0.12, r) + band(r, inner, 0.02) * 0.8 + band(r, 0.94, 0.012) * 0.6 + band(r, 0.12, 0.04);
    } else if (st < 11.5) { // forge
      m = band(r, hexR(a, 0.92), 0.02) + band(r, hexR(-a * 1.5 + 0.5, 0.6), 0.02) * 0.9;
      float j = a0 + sin(r * 25.0 + a0 * 2.0) * 0.06;
      m += spokes(j, 6.0, 0.03) * step(r, 0.6) * (1.2 - r);
    } else if (st < 12.5) { // halo
      float w = 0.22 * clamp(1.0 - (r - 0.45) / 0.45, 0.0, 1.0);
      m = band(r, 0.42, 0.03) * 1.3 + band(r, 0.94, 0.02) + spokes(a, 16.0, w) * step(0.45, r) * step(r, 0.9) * 0.7
        + spokes(-a, 8.0, 0.03) * step(r, 0.4) * 0.5;
    } else { // frost (ornate snowflake)
      float main6 = spokes(a, 6.0, 0.02) * step(r, 0.9);
      float tips = spokes(a, 6.0, 0.3) * band(r, 0.8, 0.02);
      float barbs = spokes(a + PI / 6.0, 6.0, 0.02) * step(r, 0.5);
      m = main6 + tips + barbs * 0.7 + band(r, hexR(a, 0.95) / cos(PI / 6.0) * 0.95, 0.015) * 0.8 + band(r, 0.3, 0.02);
    }
    // A soft pool of light under it all, fading at the rim.
    float pool = (1.0 - r) * 0.18;
    float fade = 1.0 - smoothstep(0.9, 1.0, r);
    float k = max(uK, 0.0);
    vec3 col = mix(uC2, uC1, smoothstep(0.0, 0.9, r));
    // Premultiplied over, with an emissive boost: the lines cover the floor
    // (so they read on sunlit stone) and glow past the bloom threshold.
    float cover = clamp(m * fade, 0.0, 1.0);
    float alpha = clamp(cover * min(k, 1.0) * 0.9 + pool * k, 0.0, 1.0);
    gl_FragColor = vec4(col * (cover * (0.5 + k * 0.9) + pool * k * 1.5), alpha);
  }`;

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
  private readonly sigil: Mesh;
  private readonly pillar: Mesh;
  private readonly sigilMat: ShaderMaterial;
  private readonly pillarMat: ShaderMaterial;
  private readonly c1: RGB;
  private readonly c2: RGB;
  private flare = 0;
  private charge = 0;
  private time = 0;
  private acc = 0;
  private ringY = 0;

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
    sigilGeo ??= new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    pillarGeo ??= new CylinderGeometry(0.62, 0.78, 2.6, 28, 1, true).translate(0, 1.3, 0);
    this.sigilMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uK: { value: 0 }, uStyle: { value: SIGIL[def.sigil] }, uSpin: { value: def.spin ?? 0.3 },
        uC1: { value: new Color(def.c1) }, uC2: { value: new Color(def.c2) },
      },
      transparent: true, depthWrite: false,
      blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: SIGIL_FRAG,
    });
    this.sigil = new Mesh(sigilGeo, this.sigilMat);
    this.sigil.renderOrder = 4;
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

  /** Adds the meshes to the fighter group. */
  attach(group: Object3D): void {
    group.add(this.sigil, this.pillar);
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
  update(f: Fighter, dt: number, add: Particles, smoke: Particles, x: number, groundY: number, head: Vector3, orb: Vector3 | null, scale: number): void {
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

    // Sigil on the ground (stays there while the fighter leaps), swelling with the flare.
    const s = (this.def.radius ?? 1.15) * (1 + this.flare * 0.25);
    this.ringY = (0.045 - groundY) / scale;
    this.sigil.position.y = this.ringY;
    this.sigil.scale.setScalar(s);
    this.sigil.visible = k > 0.01;
    const u = this.sigilMat.uniforms;
    u.uTime.value = this.time;
    u.uK.value = k > 0.01 ? 0.25 + k * 0.55 : 0;

    const pk = Math.min(1, this.flare) * 1.4;
    this.pillar.visible = pk > 0.03;
    if (this.pillar.visible) {
      this.pillar.position.y = this.ringY;
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
      add, smoke, x, y: groundY, head, orb, k, flare: this.flare, t: this.time, c1: this.c1, c2: this.c2,
      n: (base) => { const v = base * k * mul * 1.5; return Math.floor(v + Math.random()); },
    });
  }

  dispose(): void {
    this.sigil.removeFromParent();
    this.pillar.removeFromParent();
    this.sigilMat.dispose();
    this.pillarMat.dispose();
  }
}
