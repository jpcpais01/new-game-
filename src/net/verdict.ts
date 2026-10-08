import { Battle } from '../sim/battle';
import { DT, ROUND_TIME } from '../sim/constants';
import type { CharacterBuild } from '../sim/loadout';

/** How a round ended, computed without rendering. Both players compute it and compare hashes. */
export interface Verdict {
  winner: 0 | 1 | -1;
  reason: 'ko' | 'time';
  /** Battle seconds until the end (for pacing the next round). */
  time: number;
  hash: string;
  /** State hashes every CHECK_EVERY ticks, to tell where two runs drifted apart. */
  checks: string[];
}

const CHECK_EVERY = 600;

/** FNV-1a over the battle's state at this moment. Numbers print exactly (shortest round trip). */
export function stateHash(b: Battle): string {
  const parts: (number | string | boolean)[] = [b.tick, b.time, b.winner, b.hitstop, b.projectiles.length];
  for (const f of b.fighters) {
    parts.push(f.hp, f.shield, f.energy, f.x, f.y, f.vx, f.vy, f.stagger, f.alive, f.action?.ability ?? -1, f.statuses.length);
    for (const c of f.cooldowns) parts.push(c);
    const t = f.totals;
    parts.push(t.damageDealt, t.damageTaken, t.hits, t.crits, t.parries, t.blocks, t.evades, t.feints, t.biggestHit, t.healed);
  }
  for (const p of b.projectiles) parts.push(p.x, p.y);
  const s = parts.join('|');
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** Runs the round to its end exactly as the watched battle will play it. */
export function judge(seed: number, builds: [CharacterBuild, CharacterBuild]): Verdict {
  const b = new Battle({ seed, fighters: [{ ...builds[0] }, { ...builds[1] }] });
  const checks: string[] = [];
  const maxSteps = Math.ceil((ROUND_TIME + 30) / DT);
  let lastCheck = 0;
  for (let i = 0; i < maxSteps && !b.over; i++) {
    b.step();
    b.events.length = 0;
    if (b.tick % CHECK_EVERY === 0 && b.tick !== lastCheck) { lastCheck = b.tick; checks.push(stateHash(b)); }
  }
  return {
    winner: b.winner,
    reason: b.time >= ROUND_TIME ? 'time' : 'ko',
    time: b.time,
    hash: stateHash(b),
    checks,
  };
}
