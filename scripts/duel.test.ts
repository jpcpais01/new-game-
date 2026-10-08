import { it } from 'vitest';
// Usage: A=balanced B=agile GA=longsword,tower_shield GB=katana N=5 V=1 npm run duel
// GA/GB list gear ids (any order); unspecified slots stay empty except the
// main weapon, which defaults to the longsword.
import { Battle } from '../src/sim/battle';
import { gearOf } from '../src/sim/gear';
import type { CharacterBuild } from '../src/sim/loadout';
import type { FormId, GearId, GearSet } from '../src/sim/types';

function build(form: string, list: string, name: string): CharacterBuild {
  const gear = { main: 'longsword' } as GearSet;
  for (const id of list.split(',').filter(Boolean)) (gear as any)[gearOf(id as GearId).slot] = id;
  return { name, form: form as FormId, gear };
}

it('duel trace', () => {
  const A = build(process.env.A ?? 'balanced', process.env.GA ?? '', 'A');
  const B = build(process.env.B ?? 'agile', process.env.GB ?? 'katana', 'B');
  const verbose = !!process.env.V;
  const out: string[] = [];
  for (let s = 1; s <= Number(process.env.N ?? 5); s++) {
    const b = new Battle({ seed: s * 101, fighters: [A, B] });
    const uses: Record<string, number> = {};
    while (!b.over && b.tick < 60 * 120) {
      b.step();
      for (const e of b.drainEvents()) {
        if (e.type === 'actionStart') { const k = `${e.f}:${b.fighters[e.f].abilities[e.ability].id}`; uses[k] = (uses[k] ?? 0) + 1; }
        if (verbose && (e.type === 'thought' || e.type === 'plan')) out.push(`${b.time.toFixed(2)} [${e.f}] ${e.type === 'thought' ? e.text : 'PLAN ' + e.plan}`);
      }
    }
    const t = b.fighters.map((f) => `${f.form}/${f.gear.main} hp=${f.hp.toFixed(0)} dmg=${f.totals.damageDealt.toFixed(0)} hits=${f.totals.hits} par=${f.totals.parries} blk=${f.totals.blocks} ev=${f.totals.evades} feint=${f.totals.feints}`);
    out.push(`seed ${s}: winner ${b.winner} t=${b.time.toFixed(1)}\n  ${t.join('\n  ')}\n  ${JSON.stringify(uses)}`);
  }
  process.stdout.write(out.join('\n') + '\n');
});
