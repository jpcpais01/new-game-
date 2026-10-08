import type { FormId, Stats } from './types';

/** Temperament the AI starts from. Gear nudges it (see `buildProfile`). */
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

/**
 * Proportions for the renderer, relative to the Balanced body (all 1).
 * The sim never reads these.
 */
export interface BodyShape {
  /** Overall height. */
  height: number;
  /** Width and depth of torso and limbs. */
  bulk: number;
  /** Shoulder width relative to the hips. */
  shoulders: number;
  /** Arm and leg length relative to height. */
  limbs: number;
  /** Head size relative to the body. */
  head: number;
}

export interface FormDef {
  id: FormId;
  name: string;
  /** One-line identity shown under the name. */
  title: string;
  blurb: string;
  /** UI accent colour. */
  color: number;
  base: Stats;
  body: BodyShape;
  personality: Personality;
}

export const BASE_STATS: Stats = {
  maxHp: 1450, power: 60, armor: 20, resist: 20, attackSpeed: 1, moveSpeed: 3.9,
  critChance: 0.05, critMult: 1.6, lifesteal: 0, cdr: 0, energyRegen: 1, tenacity: 0,
  thorns: 0, healMult: 1, damageMult: 1, damageTakenMult: 1,
  poise: 0.18, reach: 1, force: 1, knockbackTaken: 1,
};

const stats = (s: Partial<Stats>): Stats => ({ ...BASE_STATS, ...s });

export const FORMS: Record<FormId, FormDef> = {
  robust: {
    id: 'robust', name: 'Robust', title: 'Big and hard to move',
    blurb: 'Tall and heavy. The most health and armor, shrugs off light hits and knockback, but slow on its feet.',
    color: 0x6f8fb8,
    base: stats({ maxHp: 1660, power: 58, armor: 28, resist: 22, attackSpeed: 0.94, moveSpeed: 3.55, poise: 0.28, knockbackTaken: 0.8, force: 1.05 }),
    body: { height: 1.1, bulk: 1.3, shoulders: 1.2, limbs: 0.98, head: 0.92 },
    personality: { aggression: 0.55, caution: 0.55, cunning: 0.35, adaptivity: 0.55, reaction: 0.22 },
  },
  agile: {
    id: 'agile', name: 'Agile', title: 'Small and quick',
    blurb: 'Short and light. Fastest movement and attacks, but fragile and easily knocked around.',
    color: 0x52d6a0,
    base: stats({ maxHp: 1300, power: 57, armor: 18, resist: 18, attackSpeed: 1.16, moveSpeed: 4.6, critChance: 0.1, poise: 0.1, knockbackTaken: 1.15, reach: 0.95 }),
    body: { height: 0.88, bulk: 0.85, shoulders: 0.95, limbs: 1.0, head: 1.08 },
    personality: { aggression: 0.7, caution: 0.4, cunning: 0.75, adaptivity: 0.7, reaction: 0.16 },
  },
  balanced: {
    id: 'balanced', name: 'Balanced', title: 'Even in everything',
    blurb: 'Average height and build. No weaknesses, no extremes: a clean canvas for any gear.',
    color: 0xd8c27a,
    base: stats({ maxHp: 1520, power: 60, armor: 22, resist: 22, attackSpeed: 1, moveSpeed: 3.95, poise: 0.18 }),
    body: { height: 1, bulk: 1, shoulders: 1, limbs: 1, head: 1 },
    personality: { aggression: 0.55, caution: 0.5, cunning: 0.5, adaptivity: 0.65, reaction: 0.19 },
  },
  slender: {
    id: 'slender', name: 'Slender', title: 'Long reach, precise strikes',
    blurb: 'Tall and lean with long limbs. Melee reach and critical hits are its edge; light on health.',
    color: 0x9b8cff,
    base: stats({ maxHp: 1400, power: 60, armor: 18, resist: 22, attackSpeed: 1.02, moveSpeed: 4.1, critChance: 0.1, critMult: 1.75, poise: 0.14, reach: 1.15 }),
    body: { height: 1.12, bulk: 0.82, shoulders: 0.95, limbs: 1.15, head: 0.95 },
    personality: { aggression: 0.5, caution: 0.55, cunning: 0.7, adaptivity: 0.7, reaction: 0.18 },
  },
  mighty: {
    id: 'mighty', name: 'Mighty', title: 'Raw strength',
    blurb: 'Broad shoulders and heavy muscle. Hits the hardest and sends enemies flying, but resists magic poorly.',
    color: 0xe0703a,
    base: stats({ maxHp: 1500, power: 61, armor: 22, resist: 16, attackSpeed: 0.96, moveSpeed: 3.8, poise: 0.22, force: 1.15 }),
    body: { height: 1.04, bulk: 1.2, shoulders: 1.35, limbs: 1.02, head: 0.9 },
    personality: { aggression: 0.8, caution: 0.3, cunning: 0.3, adaptivity: 0.5, reaction: 0.22 },
  },
  ethereal: {
    id: 'ethereal', name: 'Ethereal', title: 'Light body, deep reserves',
    blurb: 'Slight and graceful. Regenerates energy faster with shorter cooldowns and high magic resist, but little armor.',
    color: 0x7fd8ff,
    base: stats({ maxHp: 1460, power: 64, armor: 20, resist: 34, attackSpeed: 1, moveSpeed: 4.0, energyRegen: 1.4, cdr: 0.15, poise: 0.1 }),
    body: { height: 1.02, bulk: 0.8, shoulders: 0.9, limbs: 1.05, head: 1.0 },
    personality: { aggression: 0.4, caution: 0.65, cunning: 0.7, adaptivity: 0.75, reaction: 0.19 },
  },
};

export const FORM_IDS: FormId[] = ['robust', 'agile', 'balanced', 'slender', 'mighty', 'ethereal'];
