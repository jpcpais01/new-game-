import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { LegacyBrain } from '../src/sim/ai/legacy';
import { Battle, type BrainFactory } from '../src/sim/battle';
import { randomBuild } from '../src/sim/loadout';

// Side-by-side behaviour stats, current AI vs legacy, on identical builds.
it('ai stats', () => {
  const N = Number(process.env.SIM_N ?? 100);
  const rng = new Rng(11);
  const legacy: BrainFactory = (f, v) => new LegacyBrain(f, v);
  const agg = [{} as Record<string, number>, {} as Record<string, number>]; // 0 = new, 1 = legacy
  const add = (who: number, k: string, v = 1) => { agg[who][k] = (agg[who][k] ?? 0) + v; };
  for (let i = 0; i < N; i++) {
    const fa = randomBuild(rng), fb = randomBuild(rng);
    const seed = rng.int(0, 2 ** 31);
    for (const side of [0, 1]) {
      const bt = new Battle({ seed, fighters: [fa, fb], brains: side === 0 ? [undefined, legacy] : [legacy, undefined] });
      const who = (f: number) => (f === side ? 0 : 1);
      while (!bt.over && bt.tick < 60 * 110) {
        bt.step();
        for (const e of bt.drainEvents()) {
          if (e.type === 'actionStart') add(who(e.f), 'use:' + bt.fighters[e.f].abilities[e.ability].slot);
          if (e.type === 'hit') {
            const ab = bt.fighters[e.attacker].abilities.find((x) => x.id === e.ability);
            add(who(e.attacker), 'dmg', e.amount);
            add(who(e.attacker), 'dmg:' + (e.dot ? 'dot/' + e.ability : ab ? ab.slot : e.ability), e.amount);
            if (e.blocked) add(who(e.target), 'blocked');
          }
          if (e.type === 'parry') add(who(e.defender), 'parries');
          if (e.type === 'feint') add(who(e.f), 'feints');
          if (e.type === 'wallSplat') add(who(e.f), 'gotWallSplat');
        }
      }
      if (bt.winner !== -1) add(who(bt.winner), 'wins');
      for (const f of bt.fighters) add(who(f.id), 'evades', f.totals.evades);
    }
  }
  const keys = [...new Set([...Object.keys(agg[0]), ...Object.keys(agg[1])])].sort();
  const lines = ['', 'stat'.padEnd(22) + 'new'.padStart(10) + 'legacy'.padStart(10)];
  for (const k of keys) lines.push(k.padEnd(22) + (agg[0][k] ?? 0).toFixed(0).padStart(10) + (agg[1][k] ?? 0).toFixed(0).padStart(10));
  process.stdout.write(lines.join('\n') + '\n');
}, 1800000);
