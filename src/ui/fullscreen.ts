// Fullscreen + landscape on phones, asked for by the game rather than the manifest.
//
// The manifest is plain standalone with no orientation (vite.config.ts): on Xiaomi
// HyperOS/MIUI a WebAPK installed with display "fullscreen" or any fixed orientation
// is added to the home screen but never launches. So the game does it itself: it tries
// the landscape lock at once (allowed in an installed app), and every tap that ends
// outside fullscreen goes fullscreen and locks landscape. Only the end of a touch is a
// user gesture that may go fullscreen (a pointerdown is not), hence pointerup. Leaving
// fullscreen (back gesture, app switch) goes back in on the next tap. A refusal
// changes nothing: the game plays on in the window it has.

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

async function lockLandscape(): Promise<void> {
  try {
    await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape');
  } catch { /* a browser tab outside fullscreen, or no lock API */ }
}

export function setupPhoneFullscreen(): void {
  // Desktops keep their window; only touch-first devices go fullscreen on a tap.
  if (!matchMedia('(pointer: coarse)').matches) return;
  void lockLandscape();
  let pending = false;
  const go = (): void => {
    const el = document.documentElement;
    if (pending || document.fullscreenElement || !el.requestFullscreen) return; // iPhone Safari has none.
    pending = true;
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(lockLandscape)
      .catch(() => {})
      .finally(() => { pending = false; });
  };
  document.addEventListener('pointerup', go, { capture: true, passive: true });
}
