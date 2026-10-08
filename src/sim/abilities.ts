import type { AbilityDef } from './types';

/**
 * Default evade (also what Leather Boots give): a quick backstep, or a roll
 * through when cornered. Other boots swap in their own evade (see gear.ts).
 */
export const EVADE: AbilityDef = {
  id: 'evade', name: 'Evade', slot: 'evade', kind: 'dash',
  range: 0, cost: 0, cooldown: 3.6,
  windup: 0.03, active: 0.26, recovery: 0.14,
  power: 0, damageType: 'physical',
  dash: { distance: 2.8, iframes: 0.3 },
  anim: 'evade',
  desc: 'Quick backstep with invulnerability. Rolls through the enemy when cornered.',
};
