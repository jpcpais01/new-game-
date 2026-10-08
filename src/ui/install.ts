// "Install app" for browsers that offer it (Chrome, Edge, Android). The browser's
// own prompt is held back and shown from the Settings sheet instead, when asked.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

export const canInstall = (): boolean => deferred !== null;

export async function promptInstall(): Promise<void> {
  const e = deferred;
  if (!e) return;
  deferred = null;
  try {
    await e.prompt();
    await e.userChoice;
  } catch { /* already used or blocked */ }
  notify();
}

/** Calls `f` whenever installing becomes possible or stops being possible; returns an unsubscribe. */
export function onInstallChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
