import { Battle, type BattleConfig } from './battle';
import { DT, ROUND_TIME } from './constants';

/** Runs a battle to completion without rendering. Used by tests and balance checks. */
export function runHeadless(cfg: BattleConfig, maxSeconds = ROUND_TIME + 5): Battle {
  const b = new Battle(cfg);
  const maxTicks = Math.ceil(maxSeconds / DT) + 2000;
  for (let i = 0; i < maxTicks && !b.over; i++) {
    b.step();
    b.events.length = 0;
  }
  return b;
}
