import { sanitizeAppearance, type Appearance } from '../character/appearance';
import type { Rng } from '../core/rng';
import { EVADE } from './abilities';
import { FORMS, FORM_IDS, type Personality } from './forms';
import { GEAR, GEAR_BY_ID, GEAR_SLOTS, gearIdsFor, gearOf, type GearDef } from './gear';
import type { AbilityDef, FormId, GearId, GearSet, GearSlot, Stats } from './types';

/** Cosmetic look of a character: the sim carries it, the renderer draws it. */
export type { Appearance } from '../character/appearance';

/**
 * One persistent character: who the player is. There are no classes: the form
 * is the body, and the gear decides how it fights.
 */
export interface CharacterBuild {
  name: string;
  form: FormId;
  gear: GearSet;
  look?: Appearance;
  /** Cosmetic skin chosen per gear piece (ids from gear/skins.ts; the sim only carries them). */
  skins?: SkinChoice;
}

/** Skin id per gear piece. Purely cosmetic: validated and drawn by the renderer. */
export type SkinChoice = Partial<Record<GearId, string>>;

/** Fighting habits the AI derives from form + gear. */
export interface CombatProfile {
  personality: Personality;
  /** Ideal fighting distance (centre to centre). */
  preferredRange: number;
  /** Prefers to fight from range. */
  ranged: boolean;
}

/** Equipped gear pieces, in slot order. */
export function equipped(gear: GearSet): GearDef[] {
  const out: GearDef[] = [];
  for (const s of GEAR_SLOTS) {
    const id = gear[s];
    if (id) out.push(gearOf(id));
  }
  return out;
}

export function gearIds(gear: GearSet): GearId[] {
  return equipped(gear).map((g) => g.id);
}

/**
 * Abilities a build can use, in a stable order: main weapon (basic, skill),
 * offhand skill, defensive ability, ultimate, and always the evade last.
 */
export function buildAbilities(gear: GearSet): AbilityDef[] {
  const out: AbilityDef[] = [];
  for (const g of equipped(gear)) if (g.abilities) out.push(...g.abilities);
  const boots = gear.boots ? GEAR.boots[gear.boots] : null;
  out.push(boots?.evade ?? EVADE);
  return out;
}

/** Form base stats + gear additions, then gear multipliers. */
export function computeBaseStats(form: FormId, gear: GearSet): Stats {
  const s: Stats = { ...FORMS[form].base };
  const pieces = equipped(gear);
  for (const it of pieces) if (it.add) for (const k in it.add) (s as any)[k] += (it.add as any)[k];
  for (const it of pieces) if (it.mul) for (const k in it.mul) (s as any)[k] *= (it.mul as any)[k];
  s.cdr = Math.min(s.cdr, 0.6);
  s.tenacity = Math.min(s.tenacity, 0.7);
  return s;
}

const clamp01 = (v: number) => Math.min(0.95, Math.max(0.05, v));

/** Temperament and spacing for the AI, from the body and what it carries. */
export function buildProfile(form: FormId, gear: GearSet): CombatProfile {
  const p = { ...FORMS[form].personality };
  const weapon = GEAR.main[gear.main].weapon!;
  const tags = new Set(equipped(gear).flatMap((g) => g.tags));
  if (weapon.ranged) { p.aggression -= 0.15; p.caution += 0.1; }
  if (tags.has('heavy')) p.aggression += 0.08;
  if (tags.has('tank')) p.caution -= 0.04;
  if (tags.has('parry')) p.cunning += 0.06;
  if (gear.head === 'berserker_mask') p.aggression += 0.12;
  if (tags.has('sustain')) p.caution += 0.03;
  return {
    personality: {
      aggression: clamp01(p.aggression), caution: clamp01(p.caution), cunning: clamp01(p.cunning),
      adaptivity: p.adaptivity, reaction: p.reaction,
    },
    preferredRange: weapon.preferredRange,
    ranged: weapon.ranged,
  };
}

export const DEFAULT_BUILDS: [CharacterBuild, CharacterBuild] = [
  {
    name: 'Aren', form: 'balanced',
    gear: { main: 'longsword', offhand: 'iron_gauntlet', defense: 'tower_shield', head: 'storm_crown', boots: 'leather_boots', special: 'judgment_relic' },
  },
  {
    name: 'Vesper', form: 'ethereal',
    gear: { main: 'arcane_staff', offhand: 'frost_orb', defense: 'phase_cloak', head: 'chrono_circlet', boots: 'zephyr_boots', special: 'meteor_sigil' },
  },
];

const NAMES = ['Aren', 'Vesper', 'Kael', 'Brakka', 'Lyra', 'Tor', 'Mira', 'Soren', 'Ysolde', 'Dax', 'Nyx', 'Oren'];

/** A random, fully equipped character. Uses `Math.random` unless an Rng is given. */
export function randomBuild(rng?: Rng): CharacterBuild {
  const r = () => (rng ? rng.next() : Math.random());
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const gear = { main: pick(gearIdsFor('main')) } as GearSet;
  for (const s of GEAR_SLOTS) if (s !== 'main') (gear as any)[s] = pick(gearIdsFor(s));
  return { name: pick(NAMES), form: pick(FORM_IDS), gear };
}

/**
 * Validates data from storage or the network. Unknown forms or gear (for
 * example saves from the old class system) fall back to `fallback`.
 */
export function sanitizeBuild(raw: unknown, fallback: CharacterBuild): CharacterBuild {
  if (!raw || typeof raw !== 'object') return fallback;
  const o = raw as Record<string, any>;
  const form: FormId = FORM_IDS.includes(o.form) ? o.form : fallback.form;
  const g = (o.gear && typeof o.gear === 'object') ? o.gear : {};
  const gear = {} as GearSet;
  for (const s of GEAR_SLOTS) {
    const id = g[s];
    if (typeof id === 'string' && id in GEAR[s]) (gear as any)[s] = id;
  }
  if (!gear.main) return fallback;
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 16) : fallback.name;
  const look = o.look && typeof o.look === 'object' ? sanitizeAppearance(o.look) : fallback.look;
  const skins: SkinChoice = {};
  if (o.skins && typeof o.skins === 'object') {
    for (const [k, v] of Object.entries(o.skins as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length <= 40 && k in GEAR_BY_ID) (skins as Record<string, string>)[k] = v;
    }
  }
  return { name, form, gear, look, skins };
}

/** Replaces one slot, keeping the rest. Passing null empties it (not allowed for `main`). */
export function withGear(build: CharacterBuild, slot: GearSlot, id: GearId | null): CharacterBuild {
  const gear = { ...build.gear } as Record<GearSlot, GearId | undefined>;
  if (id) {
    if (gearOf(id).slot !== slot) throw new Error(`${id} does not go in ${slot}`);
    gear[slot] = id;
  } else if (slot !== 'main') {
    delete gear[slot];
  }
  return { ...build, gear: gear as GearSet };
}
