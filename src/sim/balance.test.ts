import { it } from 'vitest';
import { Rng } from '../core/rng';
import { CLASS_IDS } from './classes';
import { ITEM_IDS } from './items';
import { runHeadless } from './headless';
import type { ClassId, ItemId } from './types';

/**
 * Not a pass/fail test: prints a class-vs-class win-rate matrix with random
 * loadouts so balance changes can be checked quickly (`npm run sim`).
 */
it('balance report', () => {
  const N = Number(process.env.SIM_N ?? 60);
  const rng = new Rng(42);
  const pickItems = (): ItemId[] => rng.shuffle(ITEM_IDS.slice()).slice(0, 3);
  const wins: Record<string, number> = {};
  const itemWins: Record<string, [number, number]> = {};
  let totalTime = 0, games = 0, timeouts = 0;
  const stats = { parries: 0, feints: 0, evades: 0 };

  for (const a of CLASS_IDS) for (const b of CLASS_IDS) {
    let w = 0;
    for (let i = 0; i < N; i++) {
      const ia = pickItems(), ib = pickItems();
      const side = i & 1;
      const fa = { classId: a as ClassId, items: ia }, fb = { classId: b as ClassId, items: ib };
      const r = runHeadless({ seed: rng.int(0, 2 ** 31), fighters: side ? [fb, fa] : [fa, fb] });
      const aWon = r.winner === (side ? 1 : 0);
      if (aWon) w++;
      totalTime += r.time; games++;
      if (r.time >= 99) timeouts++;
      for (const f of r.fighters) { stats.parries += f.totals.parries; stats.feints += f.totals.feints; stats.evades += f.totals.evades; }
      for (const it of ia) { itemWins[it] ??= [0, 0]; itemWins[it][1]++; if (aWon) itemWins[it][0]++; }
      for (const it of ib) { itemWins[it] ??= [0, 0]; itemWins[it][1]++; if (!aWon && r.winner !== -1) itemWins[it][0]++; }
    }
    wins[`${a} vs ${b}`] = w / N;
  }
  const lines = ['', 'Win rate (row vs column):', '            ' + CLASS_IDS.map((c) => c.padStart(9)).join('')];
  for (const a of CLASS_IDS) {
    lines.push(a.padEnd(12) + CLASS_IDS.map((b) => (wins[`${a} vs ${b}`] * 100).toFixed(0).padStart(8) + '%').join(''));
  }
  lines.push('', `avg battle ${(totalTime / games).toFixed(1)}s, timeouts ${timeouts}/${games}`);
  lines.push(`per game: parries ${(stats.parries / games).toFixed(2)}, feints ${(stats.feints / games).toFixed(2)}, evades ${(stats.evades / games).toFixed(2)}`);
  lines.push('', 'Item win rates:');
  for (const [k, [w, n]] of Object.entries(itemWins).sort((x, y) => y[1][0] / y[1][1] - x[1][0] / x[1][1])) {
    lines.push(`  ${k.padEnd(16)} ${((w / n) * 100).toFixed(0)}% (${n})`);
  }
  process.stdout.write(lines.join('\n') + '\n');
}, 120000);
