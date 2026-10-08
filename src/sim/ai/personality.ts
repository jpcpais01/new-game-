import { clamp } from '../../core/math';
import type { Fighter } from '../fighter';
import type { Personality } from '../forms';
import type { Kit } from './kit';

export type { Personality };

/**
 * A fighter's temperament: the body's nature (form) nudged by its gear (see
 * `buildProfile`), then by what its stats and kit actually reward — lifesteal
 * and thorns make it brave, a counter-parry makes it tricky, a pure ranged kit
 * makes it careful. A per-fighter random temper keeps two identical builds
 * from playing the same.
 */
export function derivePersonality(f: Fighter, kit: Kit, temper: number, temper2: number): Personality {
  const base = f.profile.personality;
  const s = f.base;
  const counters = kit.defenses.some((d) => !!d.ab.guard?.counterPower);
  const heavyHitters = kit.info.filter((a) => a.offensive && a.ab.heavy && !a.ultimate).length;

  let aggression = base.aggression + s.lifesteal * 0.5 + s.thorns * 0.3 + (kit.ranged && !f.profile.ranged ? -0.08 : 0);
  let caution = base.caution - s.lifesteal * 0.2 + (kit.ranged ? 0.05 : 0);
  let cunning = base.cunning + (counters ? 0.08 : 0) + heavyHitters * 0.03;

  // Temper: some fighters are hot-headed, some cold and patient.
  const t = (temper - 0.5) * 0.24;
  aggression += t;
  caution -= t * 0.7;
  cunning += (temper2 - 0.5) * 0.16;

  return {
    aggression: clamp(aggression, 0.06, 0.95),
    caution: clamp(caution, 0.06, 0.92),
    cunning: clamp(cunning, 0.1, 0.92),
    adaptivity: clamp(base.adaptivity + (temper2 - 0.5) * 0.1, 0.3, 0.95),
    reaction: clamp(base.reaction + (temper2 - 0.5) * 0.03, 0.13, 0.28),
  };
}
