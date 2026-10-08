import { it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Battle } from '../src/sim/battle';
import { randomBuild } from '../src/sim/loadout';

// Cost of the simulation (with AI look-ahead) per simulated second.
it('perf', () => {
  const rng = new Rng(9);
  let ticks = 0, worst = 0; const over: number[] = [];
  const t0 = performance.now();
  for (let i = 0; i < 40; i++) {
    const bt = new Battle({ seed: rng.int(0, 1e9), fighters: [randomBuild(rng), randomBuild(rng)] });
    while (!bt.over && bt.tick < 6000) {
      const s = performance.now();
      bt.step();
      const d = performance.now() - s;
      if (i > 2) { worst = Math.max(worst, d); if (d > 2) over.push(d); }
      bt.events.length = 0;
      ticks++;
    }
  }
  const ms = performance.now() - t0;
  process.stdout.write(`PERF ${(ms / (ticks / 60)).toFixed(2)} ms per simulated second, worst tick ${worst.toFixed(2)} ms, ticks over 2ms: ${over.length}/${ticks}, over 4ms: ${over.filter((x) => x > 4).length}\n`);
}, 600000);
