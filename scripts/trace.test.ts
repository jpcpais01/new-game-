import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { LegacyBrain } from '../src/sim/ai/legacy';
import { Brain } from '../src/sim/ai/brain';
import { Battle, type BrainFactory } from '../src/sim/battle';
import { randomBuild } from '../src/sim/loadout';
import type { MainWeaponId } from '../src/sim/types';

// Prints a timeline of one battle. W=spear (main weapon of side 0), S=seed, L=1 legacy on side 1.
it('trace', () => {
  const rng = new Rng(Number(process.env.S ?? 3));
  const fa = randomBuild(rng), fb = randomBuild(rng);
  if (process.env.W) fa.gear.main = process.env.W as MainWeaponId;
  if (process.env.W2) fb.gear.main = process.env.W2 as MainWeaponId;
  const legacy: BrainFactory = (f, v) => new LegacyBrain(f, v);
  const bt = new Battle({ seed: 5, fighters: [fa, fb], brains: [undefined, process.env.L ? legacy : undefined] });
  const out: string[] = [JSON.stringify(fa), JSON.stringify(fb)];
  const br = bt.brains[0] as Brain;
  out.push('matchup ' + JSON.stringify((br as any).m ?? null));
  let lastT = -1;
  while (!bt.over && bt.tick < 60 * 100) {
    bt.step();
    if (bt.tick === 2) out.push('matchup ' + JSON.stringify((br as any).m), 'p ' + JSON.stringify(br.p));
    for (const e of bt.drainEvents()) {
      const t = bt.time.toFixed(2);
      if (e.type === 'actionStart') out.push(`${t} [${e.f}] ${bt.fighters[e.f].abilities[e.ability].id} d=${Math.abs(bt.fighters[0].x - bt.fighters[1].x).toFixed(2)}`);
      if (e.type === 'hit') out.push(`${t}   hit ${e.attacker}->${e.target} ${e.ability} ${e.amount}${e.blocked ? ' blk' : ''}`);
      if (e.type === 'thought') out.push(`${t} [${e.f}] "${e.text}"`);
      if (e.type === 'plan') out.push(`${t} [${e.f}] PLAN ${e.plan}`);
      if (e.type === 'parry') out.push(`${t} [${e.defender}] PARRY`);
    }
    if (Math.floor(bt.time) !== lastT) {
      lastT = Math.floor(bt.time);
      out.push(`-- t=${lastT} x0=${bt.fighters[0].x.toFixed(2)} x1=${bt.fighters[1].x.toFixed(2)} hp ${bt.fighters[0].hp.toFixed(0)}/${bt.fighters[1].hp.toFixed(0)}`);
    }
  }
  out.push(`winner ${bt.winner} at ${bt.time.toFixed(1)}`);
  process.stdout.write(out.join('\n') + '\n');
});
