import { ELEMENT_COLOR, resolveArt, weaponFamily, type Element, type ResolvedArt, type WeaponFamily } from '../../gear/art';
import { skinnedArt, skinOf } from '../../gear/skins';
import type { SkinChoice } from '../../sim/loadout';
import type { GearId, GearSet } from '../../sim/types';
import type { Particles } from '../fx/particles';

// -----------------------------------------------------------------------------
// Gear-driven effects: what a fighter's weapon trail, edge glow, ambient motes
// and impact sparks look like, derived from the same art data as the icons.
// -----------------------------------------------------------------------------

/** Items that imbue the main weapon with their element (edge glow, motes, sparks). */
export const ENCHANTS: GearId[] = ['ember_core', 'frost_core', 'vampiric_fang', 'storm_crown', 'executioner_hood'];

export interface WeaponVfx {
  look: ResolvedArt | null;
  family: WeaponFamily;
  /** Elements the weapon carries (its own, then enchants), strongest first. */
  elements: Element[];
  /** The element that colours trails and sparks ('none' for plain steel). */
  lead: Element;
  /** Slash trail colour. */
  trail: number;
  /** Slash trail lifetime in seconds (heavy weapons linger, daggers flick). */
  trailLife: number;
  /** Weapon edge glow colour, or null for plain white-hot steel. */
  edge: number | null;
  /** Main colour of impact sparks. */
  spark: number;
}

const TRAIL_LIFE: Record<WeaponFamily, number> = {
  blade: 0.2, heavy: 0.28, pole: 0.22, dagger: 0.13, staff: 0.22, bow: 0.16, fist: 0.12, thrown: 0.16, focus: 0.18, none: 0.18,
};

/** Resolved look of a gear piece as worn (skin included). */
const wornArt = (id: GearId, skins: SkinChoice | undefined) => resolveArt(skinnedArt(id, skinOf(id, skins)));

export function weaponVfx(gear: GearSet | undefined, skins?: SkinChoice): WeaponVfx {
  const main = gear?.main;
  const look = main ? wornArt(main, skins) : null;
  const own = look && look.element !== 'none' ? look.element : null;
  const imbued: Element[] = [];
  for (const id of Object.values(gear ?? {}) as GearId[]) {
    if (!ENCHANTS.includes(id)) continue;
    const e = wornArt(id, skins).element;
    if (e !== 'none' && e !== own && !imbued.includes(e)) imbued.push(e);
  }
  const elements = own ? [own, ...imbued] : imbued;
  const family = look ? weaponFamily(look.art) : 'none';
  // An enchant item overrides the weapon's own colour so the buff reads at a glance.
  const lead = imbued[0] ?? own;
  const trail = lead ? ELEMENT_COLOR[lead] : look?.tint ?? 0xffffff;
  return {
    look,
    family,
    elements,
    lead: lead ?? 'none',
    trail,
    trailLife: TRAIL_LIFE[family],
    edge: lead ? ELEMENT_COLOR[lead] : null,
    spark: lead ? ELEMENT_COLOR[lead] : 0xffd27a,
  };
}

// --- ambient motes drifting off an elemental weapon ---------------------------

interface Mote { g: number; sp: number; life: number; size: number; i: number; rate: number }
const MOTE: Record<Element, Mote | null> = {
  none: null,
  fire: { g: -2.5, sp: 0.6, life: 0.5, size: 0.11, i: 2.4, rate: 1 },
  frost: { g: 0.8, sp: 0.2, life: 0.8, size: 0.06, i: 2.6, rate: 0.8 },
  poison: { g: 3, sp: 0.1, life: 0.6, size: 0.06, i: 1.8, rate: 0.8 },
  lightning: { g: 0, sp: 1.6, life: 0.12, size: 0.05, i: 4, rate: 0.7 },
  arcane: { g: -0.6, sp: 0.4, life: 0.7, size: 0.07, i: 2.4, rate: 0.7 },
  holy: { g: -0.8, sp: 0.2, life: 0.7, size: 0.07, i: 2.4, rate: 0.6 },
  shadow: { g: -0.4, sp: 0.3, life: 0.8, size: 0.12, i: 1.4, rate: 0.6 },
  blood: { g: 4, sp: 0.1, life: 0.5, size: 0.06, i: 2, rate: 0.6 },
  nature: { g: 0.6, sp: 0.4, life: 0.9, size: 0.07, i: 1.8, rate: 0.5 },
  wind: { g: 0, sp: 1.0, life: 0.35, size: 0.05, i: 2, rate: 0.6 },
};

/** Emits this frame's motes for one point along the weapon. */
export function emitMote(add: Particles, e: Element, x: number, y: number, z: number, scale: number): void {
  const m = MOTE[e];
  if (!m || Math.random() > m.rate) return;
  const c = ELEMENT_COLOR[e];
  add.emit(x, y, z, (Math.random() - 0.5) * m.sp, m.sp * 0.5, (Math.random() - 0.5) * m.sp * 0.3, m.life,
    ((c >> 16) & 255) / 255 * m.i, ((c >> 8) & 255) / 255 * m.i, (c & 255) / 255 * m.i,
    m.size * scale, m.g, 1, 0.2, e === 'lightning' || e === 'wind' ? 0.05 : 0);
}

// --- impact flourishes -----------------------------------------------------------

/** Extra element-specific burst layered on a melee impact. */
export function elementImpact(add: Particles, smoke: Particles, e: Element, x: number, y: number, dir: number, heavy: boolean): void {
  const c = ELEMENT_COLOR[e];
  const n = heavy ? 1.6 : 1;
  switch (e) {
    case 'fire':
      add.burst({ x, y, count: Math.round(14 * n), jitter: 0.15, dir: [dir, 0.6, 0], spread: 1, speed: [1.5, 4], life: [0.35, 0.7], size: [0.1, 0.22], color: c, intensity: 2.6, gravity: -4, drag: 2, sizeEnd: 0.1 });
      smoke.burst({ x, y: y + 0.2, count: Math.round(2 * n), jitter: 0.2, speed: [0.3, 0.8], life: [0.5, 0.8], size: [0.3, 0.5], color: 0x3a2a2a, sizeEnd: 1.8 });
      break;
    case 'frost':
      add.burst({ x, y, count: Math.round(12 * n), dir: [dir, 0.3, 0], spread: 1.2, speed: [3, 7], life: [0.3, 0.6], size: [0.05, 0.1], color: 0xe8fbff, intensity: 3, gravity: 9, drag: 1.5, stretch: 0.05 });
      add.burst({ x, y, count: Math.round(6 * n), jitter: 0.3, speed: [0.1, 0.4], life: [0.6, 1.0], size: [0.05, 0.09], color: c, intensity: 2.4, gravity: 0.4 });
      break;
    case 'poison':
      add.burst({ x, y, count: Math.round(12 * n), dir: [dir, 0.8, 0], spread: 0.8, speed: [2, 5], life: [0.4, 0.7], size: [0.06, 0.12], color: c, intensity: 2, gravity: 10, drag: 1 });
      break;
    case 'lightning':
      add.burst({ x, y, count: Math.round(16 * n), speed: [6, 12], life: [0.08, 0.18], size: [0.03, 0.06], color: c, intensity: 4.5, drag: 4, stretch: 0.08 });
      break;
    case 'arcane':
    case 'shadow':
      add.burst({ x, y, count: Math.round(14 * n), jitter: 0.25, speed: [0.6, 2.4], life: [0.4, 0.8], size: [0.07, 0.14], color: c, intensity: e === 'arcane' ? 2.6 : 1.8, drag: 2, gravity: -1.2 });
      break;
    case 'holy':
      add.burst({ x, y, count: Math.round(10 * n), jitter: 0.1, dir: [0, 1, 0], spread: 0.6, speed: [1.5, 4], life: [0.4, 0.7], size: [0.06, 0.12], color: c, intensity: 3, drag: 2 });
      break;
    case 'blood':
      add.burst({ x, y, count: Math.round(14 * n), dir: [dir, 0.5, 0], spread: 0.7, speed: [3, 7], life: [0.3, 0.6], size: [0.05, 0.1], color: c, intensity: 1.8, gravity: 14, stretch: 0.03 });
      break;
    case 'nature':
      add.burst({ x, y, count: Math.round(10 * n), jitter: 0.2, dir: [dir, 0.6, 0], spread: 1, speed: [1.5, 4], life: [0.6, 1.0], size: [0.06, 0.11], color: c, intensity: 1.8, gravity: 2, drag: 2.5 });
      break;
    case 'wind':
      add.burst({ x, y, count: Math.round(12 * n), dir: [dir, 0.1, 0], spread: 0.25, speed: [7, 13], life: [0.15, 0.3], size: [0.03, 0.06], color: c, intensity: 2.4, drag: 3, stretch: 0.1 });
      break;
    case 'none':
      break;
  }
}
