import { it } from 'vitest';
import { Rng } from '../core/rng';
import { FORM_IDS } from './forms';
import { GEAR_SLOTS } from './gear';
import { randomBuild, type CharacterBuild } from './loadout';
import { runHeadless } from './headless';
import type { FormId } from './types';

/**
 * Not a pass/fail test: prints a form-vs-form win-rate matrix with random
 * gear, plus per-gear win rates, so balance changes can be checked quickly
 * (`npm run sim`).
 */
it('balance report', () => {
  const N = Number(process.env.SIM_N ?? 60);
  const rng = new Rng(42);
  const wins: Record<string, number> = {};
  const gearWins: Record<string, [number, number]> = {};
  let totalTime = 0, games = 0, timeouts = 0;
  const stats = { parries: 0, feints: 0, evades: 0 };
  const count = (b: CharacterBuild, won: boolean) => {
    for (const s of GEAR_SLOTS) {
      const id = b.gear[s];
      if (!id) continue;
      const k = `${s}:${id}`;
      gearWins[k] ??= [0, 0];
      gearWins[k][1]++;
      if (won) gearWins[k][0]++;
    }
  };

  for (const a of FORM_IDS) for (const b of FORM_IDS) {
    let w = 0;
    for (let i = 0; i < N; i++) {
      const fa = { ...randomBuild(rng), form: a as FormId }, fb = { ...randomBuild(rng), form: b as FormId };
      const side = i & 1;
      const r = runHeadless({ seed: rng.int(0, 2 ** 31), fighters: side ? [fb, fa] : [fa, fb] });
      const aWon = r.winner === (side ? 1 : 0);
      const bWon = r.winner === (side ? 0 : 1);
      if (aWon) w++;
      totalTime += r.time; games++;
      if (r.time >= 99) timeouts++;
      for (const f of r.fighters) { stats.parries += f.totals.parries; stats.feints += f.totals.feints; stats.evades += f.totals.evades; }
      count(fa, aWon);
      count(fb, bWon);
    }
    wins[`${a} vs ${b}`] = w / N;
  }
  const lines = ['', 'Form win rate (row vs column):', '            ' + FORM_IDS.map((c) => c.padStart(9)).join('')];
  for (const a of FORM_IDS) {
    lines.push(a.padEnd(12) + FORM_IDS.map((b) => (wins[`${a} vs ${b}`] * 100).toFixed(0).padStart(8) + '%').join(''));
  }
  lines.push('', `avg battle ${(totalTime / games).toFixed(1)}s, timeouts ${timeouts}/${games}`);
  lines.push(`per game: parries ${(stats.parries / games).toFixed(2)}, feints ${(stats.feints / games).toFixed(2)}, evades ${(stats.evades / games).toFixed(2)}`);
  for (const slot of GEAR_SLOTS) {
    lines.push('', `${slot} win rates:`);
    const rows = Object.entries(gearWins).filter(([k]) => k.startsWith(slot + ':'));
    for (const [k, [w, n]] of rows.sort((x, y) => y[1][0] / y[1][1] - x[1][0] / x[1][1])) {
      lines.push(`  ${k.slice(slot.length + 1).padEnd(18)} ${((w / n) * 100).toFixed(0)}% (${n})`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}, 300000);
