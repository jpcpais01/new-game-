import './ui/styles.css';
import { Fog, Scene } from 'three';
import { registerSW } from 'virtual:pwa-register';
import { sfx } from './audio/sfx';
import { randomSeed } from './core/rng';
import { BattleView } from './render/battleView';
import { FightCamera } from './render/camera';
import { Particles } from './render/fx/particles';
import { detectQuality, GameRenderer, settingsFor, type Quality } from './render/renderer';
import { Arena } from './render/scene/arena';
import { Battle } from './sim/battle';
import { DT } from './sim/constants';
import { h, save, store } from './ui/dom';
import { FloatingText } from './ui/floatingText';
import { Hud } from './ui/hud';
import { Menu, randomLoadout, type Loadout, type MenuSettings } from './ui/menu';
import { Results } from './ui/results';

type State = 'menu' | 'intro' | 'battle' | 'ending' | 'results';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const fxLayer = document.getElementById('fx-layer')!;

const settings = store<MenuSettings>('cb.settings', { quality: 'auto', sound: true, fps: false });
const resolveQuality = (q: MenuSettings['quality']): Quality => (q === 'auto' ? detectQuality() : q);

const renderer = new GameRenderer(canvas, resolveQuality(settings.quality));
const scene = new Scene();
scene.fog = new Fog(0x3a1f45, 38, 140);
const cam = new FightCamera(renderer.aspect);
cam.resize(renderer.aspect);
const q0 = settingsFor(resolveQuality(settings.quality));
const arena = new Arena(scene, { shadows: q0.shadows, shadowMapSize: q0.shadowMapSize, crowd: q0.crowd });
const fx = { add: new Particles(6144, true), smoke: new Particles(1536, false) };
scene.add(fx.smoke.mesh, fx.add.mesh);
const floating = new FloatingText(fxLayer);
const view = new BattleView(scene, fx, cam, renderer, arena, floating);
renderer.setupPasses(scene, cam.camera);

let loadouts = store<[Loadout, Loadout]>('cb.loadouts', [
  { classId: 'vanguard', items: ['thornmail', 'storm_sigil', 'aegis_charm'] },
  { classId: 'arcanist', items: ['frost_core', 'mirror_ward', 'hourglass'] },
]);
let state: State = 'menu';
let speed = 1;
let paused = false;
let battle: Battle;
let stepped = false;
let phaseT = 0;
let acc = 0;
let lastSeed = randomSeed();

function newBattle(seed: number): void {
  lastSeed = seed;
  battle = new Battle({ seed, fighters: [{ ...loadouts[0] }, { ...loadouts[1] }] });
  stepped = false;
  acc = 0;
  view.setBattle(battle);
  hud.setup(battle, speed);
}

const hud = new Hud({
  onSpeed: (s) => { speed = s; hud.setSpeed(s); sfx.play('ui'); },
  onPause: () => togglePause(),
  onExit: () => toMenu(),
});
const results = new Results({
  onReplay: () => startFight(lastSeed),
  onRematch: () => startFight(randomSeed()),
  onLoadout: () => toMenu(),
});
const menu = new Menu(loadouts, settings, {
  onChange: (l) => {
    loadouts = l;
    save('cb.loadouts', l);
    newBattle(randomSeed());
  },
  onFight: () => startFight(randomSeed()),
  onSettings: (s) => applySettings(s),
});
const fpsEl = h('div.fps');
ui.append(hud.el, menu.el, results.el, fpsEl);
hud.show(false);

function applySettings(s: MenuSettings): void {
  const prevQuality = settings.quality;
  Object.assign(settings, s);
  save('cb.settings', settings);
  sfx.setMuted(!s.sound);
  fpsEl.hidden = !s.fps;
  if (s.quality !== prevQuality) {
    const q = resolveQuality(s.quality);
    renderer.setQuality(q);
    const qs = settingsFor(q);
    arena.key.castShadow = qs.shadows;
    arena.key.shadow.mapSize.set(qs.shadowMapSize, qs.shadowMapSize);
    arena.key.shadow.map?.dispose();
    arena.key.shadow.map = null;
    renderer.setupPasses(scene, cam.camera);
  }
}

function togglePause(): void {
  if (state !== 'battle' && state !== 'intro') return;
  paused = !paused;
  hud.setPaused(paused);
  sfx.play('ui');
}

function startFight(seed: number): void {
  sfx.unlock();
  if (stepped || seed !== lastSeed) newBattle(seed);
  state = 'intro';
  phaseT = 0;
  paused = false;
  hud.setPaused(false);
  menu.show(false);
  results.hide();
  hud.show(true);
  hud.showBanner('READY');
  sfx.play('ui');
}

function toMenu(): void {
  state = 'menu';
  paused = false;
  results.hide();
  hud.show(false);
  menu.loadouts = loadouts;
  menu.render();
  menu.show(true);
  newBattle(randomSeed());
}

view.listener = {
  onEvent: (e) => {
    hud.onEvent(e);
    if (e.type === 'end') {
      state = 'ending';
      phaseT = 0;
      hud.showBanner(e.reason === 'ko' ? 'K.O.' : 'TIME!', true);
    }
  },
};

// -----------------------------------------------------------------------------
// Main loop: fixed-step simulation, interpolated rendering.
// -----------------------------------------------------------------------------

let last = performance.now();
let fpsT = 0;

let cpuMs = 0;
let logicMs = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  renderer.trackFrame(realDt);

  const simulating = state === 'battle' || state === 'ending' || state === 'results';
  if (state === 'intro' && !paused) {
    phaseT += realDt;
    if (phaseT > 0.9 && phaseT - realDt <= 0.9) { hud.showBanner('FIGHT!'); sfx.play('start'); arena.excite(0.6); }
    if (phaseT > 1.25) state = 'battle';
  }

  if (simulating && !paused) {
    acc += realDt * speed * view.timeScale;
    let steps = 0;
    const maxSteps = 4 * speed + 2;
    while (acc >= DT && steps < maxSteps) {
      battle.step();
      stepped = true;
      acc -= DT;
      steps++;
    }
    if (steps === maxSteps) acc = 0; // drop backlog instead of spiralling
  }
  if (state === 'ending') {
    phaseT += realDt;
    if (phaseT > 2.6) {
      state = 'results';
      results.show(battle, battle.time >= 99 ? 'time' : 'ko');
      sfx.play('win');
    }
  }

  const dt = paused ? 0 : realDt * (simulating ? Math.max(0.35, view.timeScale) : 1);
  const time = now / 1000;
  fx.add.update(time);
  fx.smoke.update(time);
  arena.update(time, dt, fx);
  view.update(dt, acc / DT, state !== 'menu');
  if (state !== 'menu') hud.update();
  floating.update(dt, cam.camera, window.innerWidth, window.innerHeight);
  const t1 = performance.now();
  renderer.render(scene, cam.camera, realDt);
  // JS time for simulation + scene/HUD updates, and for draw submission.
  logicMs += (t1 - t0 - logicMs) * 0.1;
  cpuMs += (performance.now() - t0 - cpuMs) * 0.1;

  if (settings.fps) {
    fpsT += realDt;
    if (fpsT > 0.25) {
      fpsT = 0;
      const info = renderer.renderer.info.render;
      fpsEl.textContent = `${renderer.fps.toFixed(0)} fps · logic ${logicMs.toFixed(1)}ms · cpu ${cpuMs.toFixed(1)}ms · ${(renderer.renderScale * 100).toFixed(0)}% res · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris`;
    }
  }
}

function onResize(): void {
  renderer.resize();
  cam.resize(renderer.aspect);
}
window.addEventListener('resize', onResize);
screen.orientation?.addEventListener?.('change', onResize);

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === ' ' ) { e.preventDefault(); togglePause(); }
  else if (e.key === '1' || e.key === '2' || e.key === '4') { speed = Number(e.key); hud.setSpeed(speed); }
  else if (e.key === 'Escape' && state !== 'menu') toMenu();
  else if (e.key === 'Enter' && (state === 'menu' || state === 'results')) startFight(randomSeed());
  else if (e.key.toLowerCase() === 'r' && state === 'menu') { loadouts = [randomLoadout(), randomLoadout()]; menu.loadouts = loadouts; menu.render(); newBattle(randomSeed()); }
});
// Audio needs a user gesture; unlock on the first one.
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'battle' && !paused) togglePause();
  last = performance.now();
});

async function boot(): Promise<void> {
  sfx.setMuted(!settings.sound);
  fpsEl.hidden = !settings.fps;
  newBattle(randomSeed());
  view.update(0, 0, false);
  // Compile every shader up front so the first hit doesn't hitch.
  try {
    await renderer.renderer.compileAsync(scene, cam.camera);
  } catch { /* compileAsync is an optimisation only */ }
  requestAnimationFrame((t) => { last = t; frame(t); });
  document.getElementById('boot')?.classList.add('done');
  setTimeout(() => document.getElementById('boot')?.remove(), 600);
}

// URL options: ?demo starts a random duel straight away (kiosk/attract mode), ?speed=2|4.
const params = new URLSearchParams(location.search);
if (params.has('speed')) speed = Math.min(8, Math.max(1, Number(params.get('speed')) || 1));

void boot().then(() => {
  if (params.has('demo')) {
    loadouts = [randomLoadout(), randomLoadout()];
    startFight(randomSeed());
  }
});
if (import.meta.env.PROD) registerSW({ immediate: true });
