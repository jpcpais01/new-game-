import { it } from 'vitest';
import { Rng } from '../core/rng';
import { LegacyBrain } from './ai/legacy';
import { randomBuild } from './loadout';
import { runHeadless } from './headless';
import type { BattleConfig, BrainFactory } from './battle';

/**
 * Not a pass/fail test: pits the current AI against the previous one on
 * identical random builds (each pairing played from both sides) and prints
 * how often the new AI wins, overall and by main weapon (`npm run ai`).
 */
it('new AI vs legacy AI', () => {
  const N = Number(process.env.SIM_N ?? 300);
  const rng = new Rng(Number(process.env.SIM_SEED ?? 7));
  const legacy: BrainFactory = (f, v) => new LegacyBrain(f, v);
  const byWeapon: Record<string, [number, number]> = {};
  let wins = 0, games = 0, draws = 0, time = 0;
  for (let i = 0; i < N; i++) {
    const fa = randomBuild(rng), fb = randomBuild(rng);
    const seed = rng.int(0, 2 ** 31);
    // Same builds and seed, new AI on each side in turn.
    for (const side of [0, 1] as const) {
      const cfg: BattleConfig = { seed, fighters: [fa, fb], brains: side === 0 ? [undefined, legacy] : [legacy, undefined] };
      const r = runHeadless(cfg);
      games++;
      time += r.time;
      const k = (side === 0 ? fa : fb).gear.main;
      byWeapon[k] ??= [0, 0];
      byWeapon[k][1]++;
      if (r.winner === -1) draws++;
      else if (r.winner === side) { wins++; byWeapon[k][0]++; }
    }
  }
  const lines = ['', `New AI win rate vs legacy: ${((wins / games) * 100).toFixed(1)}% (${games} games, ${draws} draws, avg ${(time / games).toFixed(1)}s)`];
  for (const [k, [w, n]] of Object.entries(byWeapon).sort()) lines.push(`  with ${k.padEnd(14)} ${((w / n) * 100).toFixed(0)}% (${n})`);
  process.stdout.write(lines.join('\n') + '\n');
}, 1800000);
