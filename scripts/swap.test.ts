import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { runHeadless } from '../src/sim/headless';
import { randomBuild } from '../src/sim/loadout';
import type { GearSlot } from '../src/sim/types';

// Controlled gear test: the same random build with slot SLOT set to A vs B (both sides new AI).
// SLOT=defense A=phase_cloak B=tower_shield npx vitest run scripts/swap.test.ts --dir .
it('gear swap', () => {
  const slot = (process.env.SLOT ?? 'defense') as GearSlot;
  const A = process.env.A ?? 'phase_cloak', B = process.env.B ?? 'tower_shield';
  const rng = new Rng(Number(process.env.SEED ?? 4));
  const byMain: Record<string, [number, number]> = {};
  let w = 0, n = 0;
  for (let i = 0; i < Number(process.env.SIM_N ?? 100); i++) {
    const base = randomBuild(rng);
    const a = { ...base, gear: { ...base.gear, [slot]: A } }, b = { ...base, gear: { ...base.gear, [slot]: B } };
    if (B === 'none') delete (b.gear as Record<string, unknown>)[slot];
    const seed = rng.int(0, 1e9);
    for (const side of [0, 1]) {
      const r = runHeadless({ seed, fighters: side ? [b, a] : [a, b] } as never);
      n++;
      const k = base.gear.main;
      byMain[k] ??= [0, 0]; byMain[k][1]++;
      if (r.winner === side) { w++; byMain[k][0]++; }
    }
  }
  process.stdout.write(`SWAP ${A} vs ${B} in ${slot}: ${((w / n) * 100).toFixed(1)}% (${n})\n`);
  for (const [k, [x, m]] of Object.entries(byMain)) process.stdout.write(`  ${k.padEnd(13)} ${((x / m) * 100).toFixed(0)}%\n`);
}, 600000);
