// Computes round verdicts off the main thread so the watched battle never hitches.
import { judge } from './verdict';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(m: unknown): void;
};

ctx.onmessage = (e) => {
  const { id, seed, builds } = e.data;
  try {
    ctx.postMessage({ id, verdict: judge(seed, builds) });
  } catch (err) {
    ctx.postMessage({ id, error: String(err) });
  }
};
