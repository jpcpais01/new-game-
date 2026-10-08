import { FORMS } from '../../sim/forms';
import { GEAR, type Grip } from '../../sim/gear';
import type { Fighter } from '../../sim/fighter';
import type { GearSet } from '../../sim/types';

/**
 * The rig still ships four outfit + weapon presets from the class era. Until
 * every gear slot has its own model, the preset is picked from the main
 * weapon's grip and the body size from the form.
 */
export type Archetype = 'vanguard' | 'ronin' | 'arcanist' | 'brute';

const BY_GRIP: Record<Grip, Archetype> = {
  oneHand: 'vanguard', twoHand: 'brute', polearm: 'vanguard', dual: 'ronin', staff: 'arcanist', bow: 'arcanist',
};

export function archetypeOf(gear: GearSet): Archetype {
  if (gear.main === 'katana') return 'ronin';
  return BY_GRIP[GEAR.main[gear.main].weapon!.grip];
}

/** Accent colour for a fighter's effects: its main weapon's colour. */
export function accentOf(f: Fighter): number {
  return GEAR.main[f.gear.main].color;
}

/** Heavy-set forms use the broad anatomy. */
export function isBig(f: Fighter): boolean {
  return FORMS[f.form].body.bulk >= 1.2;
}
