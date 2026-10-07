import type { ClassId, Stats } from './types';

export interface Personality {
  /** Desire to close distance and trade. */
  aggression: number;
  /** Weight given to avoiding damage. */
  caution: number;
  /** Likelihood of feints, baits and reads. */
  cunning: number;
  /** How quickly it updates its model of the opponent. */
  adaptivity: number;
  /** Seconds before it can react to an enemy windup. */
  reaction: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  title: string;
  /** Primary color (hex) used by the renderer and UI. */
  color: number;
  accent: number;
  base: Stats;
  personality: Personality;
  /** Ideal fighting distance (centre to centre). */
  preferredRange: number;
  ranged: boolean;
  /** Hits with less stagger than this don't interrupt windups. */
  poise: number;
  blurb: string;
}

const baseStats = (s: Partial<Stats>): Stats => ({
  maxHp: 1450, power: 60, armor: 20, resist: 20, attackSpeed: 1, moveSpeed: 3.8,
  critChance: 0.05, critMult: 1.6, lifesteal: 0, cdr: 0, energyRegen: 1, tenacity: 0,
  thorns: 0, healMult: 1, damageMult: 1, damageTakenMult: 1,
  ...s,
});

export const CLASSES: Record<ClassId, ClassDef> = {
  vanguard: {
    id: 'vanguard', name: 'Vanguard', title: 'Shield of the Dawn',
    color: 0x3d7bff, accent: 0xffd36b,
    base: baseStats({ maxHp: 1570, power: 66, armor: 42, resist: 24, moveSpeed: 3.7 }),
    personality: { aggression: 0.55, caution: 0.6, cunning: 0.45, adaptivity: 0.6, reaction: 0.2 },
    preferredRange: 1.75, ranged: false, poise: 0.21,
    blurb: 'Sword and board. Parries telegraphs, punishes with stuns and a holy leap.',
  },
  ronin: {
    id: 'ronin', name: 'Ronin', title: 'Wandering Blade',
    color: 0xe0404a, accent: 0xf5f0e6,
    base: baseStats({ maxHp: 1180, power: 56, armor: 22, resist: 20, attackSpeed: 1.15, moveSpeed: 4.6, critChance: 0.15 }),
    personality: { aggression: 0.7, caution: 0.4, cunning: 0.75, adaptivity: 0.7, reaction: 0.16 },
    preferredRange: 1.7, ranged: false, poise: 0.12,
    blurb: 'Blinding speed. Counters, dash-throughs and an eight-hit finisher.',
  },
  arcanist: {
    id: 'arcanist', name: 'Arcanist', title: 'Starfire Savant',
    color: 0x9b5cff, accent: 0x6ff3ff,
    base: baseStats({ maxHp: 1160, power: 66, armor: 12, resist: 42, moveSpeed: 3.9 }),
    personality: { aggression: 0.35, caution: 0.7, cunning: 0.7, adaptivity: 0.75, reaction: 0.2 },
    preferredRange: 6.5, ranged: true, poise: 0.1,
    blurb: 'Zones with bolts and curses, freezes rushers, ends it with a meteor.',
  },
  brute: {
    id: 'brute', name: 'Brute', title: 'Mountainbreaker',
    color: 0xff8a2a, accent: 0x5a3a22,
    base: baseStats({ maxHp: 1830, power: 64, armor: 30, resist: 16, attackSpeed: 0.92, moveSpeed: 3.65 }),
    personality: { aggression: 0.8, caution: 0.3, cunning: 0.3, adaptivity: 0.5, reaction: 0.24 },
    preferredRange: 1.9, ranged: false, poise: 0.3,
    blurb: 'Unstoppable swings, ground shockwaves and an earth-shattering leap.',
  },
};

export const CLASS_IDS: ClassId[] = ['vanguard', 'ronin', 'arcanist', 'brute'];
