import { it } from 'vitest';
import { Battle } from '../src/sim/battle';
import type { ClassId, ItemId } from '../src/sim/types';

it('duel trace', () => {
  const A = (process.env.A ?? 'vanguard') as ClassId, B = (process.env.B ?? 'ronin') as ClassId;
  const IA = (process.env.IA ?? '').split(',').filter(Boolean) as ItemId[];
  const IB = (process.env.IB ?? '').split(',').filter(Boolean) as ItemId[];
  const verbose = !!process.env.V;
  const out: string[] = [];
  for (let s = 1; s <= Number(process.env.N ?? 5); s++) {
    const b = new Battle({ seed: s * 101, fighters: [{ classId: A, items: IA }, { classId: B, items: IB }] });
    const uses: Record<string, number> = {};
    while (!b.over && b.tick < 60 * 120) {
      b.step();
      for (const e of b.drainEvents()) {
        if (e.type === 'actionStart') { const k = `${e.f}:${b.fighters[e.f].abilities[e.ability].id}`; uses[k] = (uses[k] ?? 0) + 1; }
        if (verbose && (e.type === 'thought' || e.type === 'plan')) out.push(`${b.time.toFixed(2)} [${e.f}] ${e.type === 'thought' ? e.text : 'PLAN ' + e.plan}`);
      }
    }
    const t = b.fighters.map((f) => `${f.classId} hp=${f.hp.toFixed(0)} dmg=${f.totals.damageDealt.toFixed(0)} hits=${f.totals.hits} par=${f.totals.parries} blk=${f.totals.blocks} ev=${f.totals.evades} feint=${f.totals.feints}`);
    out.push(`seed ${s}: winner ${b.winner} t=${b.time.toFixed(1)}\n  ${t.join('\n  ')}\n  ${JSON.stringify(uses)}`);
  }
  process.stdout.write(out.join('\n') + '\n');
});
