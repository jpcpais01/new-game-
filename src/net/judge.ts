import type { CharacterBuild } from '../sim/loadout';
import type { Verdict } from './verdict';

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve(v: Verdict): void; reject(e: unknown): void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./judge.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.verdict) p.resolve(e.data.verdict); else p.reject(new Error(e.data.error));
    };
    worker.onerror = () => {
      // A broken worker: finish what was asked on the main thread and stop using it.
      worker?.terminate();
      worker = null;
      const waiting = [...pending.values()];
      pending.clear();
      for (const p of waiting) p.reject(new Error('worker failed'));
    };
  } catch {
    worker = null;
  }
  return worker;
}

async function onMainThread(seed: number, builds: [CharacterBuild, CharacterBuild]): Promise<Verdict> {
  const { judge } = await import('./verdict');
  // Let the frame that started the round paint first.
  await new Promise((r) => setTimeout(r, 50));
  return judge(seed, builds);
}

/** The round's verdict, computed in a worker (main thread if workers are unavailable). */
export function judgeRound(seed: number, builds: [CharacterBuild, CharacterBuild]): Promise<Verdict> {
  const w = getWorker();
  if (!w) return onMainThread(seed, builds);
  const id = nextId++;
  return new Promise<Verdict>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, seed, builds: JSON.parse(JSON.stringify(builds)) });
  }).catch(() => onMainThread(seed, builds));
}
