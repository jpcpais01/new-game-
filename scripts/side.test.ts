import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { runHeadless } from '../src/sim/headless';
import { ITEM_IDS } from '../src/sim/items';
import type { ClassId, ItemId } from '../src/sim/types';

it('side bias + item isolation', () => {
  const rng = new Rng(7);
  let s0 = 0, n = 0, draws = 0;
  for (const c of ['vanguard', 'ronin', 'arcanist', 'brute'] as ClassId[]) {
    for (let i = 0; i < 100; i++) {
      const r = runHeadless({ seed: rng.int(0, 1e9), fighters: [{ classId: c, items: [] }, { classId: c, items: [] }] });
      if (r.winner === 0) s0++; if (r.winner === -1) draws++; n++;
    }
  }
  const out = [`side0 wins ${(s0 / n * 100).toFixed(1)}% draws ${draws}`];
  // Each item alone vs nothing, mirrored classes.
  for (const it of ITEM_IDS) {
    let w = 0, m = 0;
    for (const c of ['vanguard', 'ronin', 'arcanist', 'brute'] as ClassId[]) for (let i = 0; i < 40; i++) {
      const side = i & 1;
      const A = { classId: c, items: [it] as ItemId[] }, B = { classId: c, items: [] as ItemId[] };
      const r = runHeadless({ seed: rng.int(0, 1e9), fighters: side ? [B, A] : [A, B] });
      if (r.winner === side) w++; m++;
    }
    out.push(`${it.padEnd(16)} ${(w / m * 100).toFixed(0)}%`);
  }
  process.stdout.write(out.join('\n') + '\n');
}, 120000);
