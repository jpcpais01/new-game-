import { describe, expect, it } from 'vitest';
import { runHeadless } from './headless';
import { Battle } from './battle';
import type { BattleConfig } from './battle';
import { DEFAULT_BUILDS } from './loadout';

const cfg = (seed: number): BattleConfig => ({
  seed,
  fighters: [DEFAULT_BUILDS[0], DEFAULT_BUILDS[1]],
});

describe('battle simulation', () => {
  it('is deterministic for a given seed', () => {
    const a = runHeadless(cfg(1234));
    const b = runHeadless(cfg(1234));
    expect(a.tick).toBe(b.tick);
    expect(a.winner).toBe(b.winner);
    expect(a.fighters[0].hp).toBe(b.fighters[0].hp);
    expect(a.fighters[1].hp).toBe(b.fighters[1].hp);
  });

  it('diverges with different seeds', () => {
    const results = new Set<string>();
    for (let s = 1; s <= 6; s++) {
      const r = runHeadless(cfg(s));
      results.add(`${r.tick}:${r.fighters[0].hp}:${r.fighters[1].hp}`);
    }
    expect(results.size).toBeGreaterThan(3);
  });

  it('always finishes', () => {
    for (let s = 0; s < 20; s++) {
      const r = runHeadless(cfg(s * 7919));
      expect(r.over).toBe(true);
    }
  });

  it('produces events', () => {
    const b = new Battle(cfg(99));
    let hits = 0;
    for (let i = 0; i < 60 * 20; i++) {
      b.step();
      for (const e of b.drainEvents()) if (e.type === 'hit') hits++;
    }
    expect(hits).toBeGreaterThan(5);
  });
});
