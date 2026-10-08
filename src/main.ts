import '@fontsource-variable/bricolage-grotesque/wdth.css';
import './ui/styles.css';
import { Scene } from 'three';
import { registerSW } from 'virtual:pwa-register';
import { sfx } from './audio/sfx';
import { randomSeed } from './core/rng';
import { BattleView } from './render/battleView';
import { FightCamera, NO_INSETS, type Zoom } from './render/camera';
import { Particles } from './render/fx/particles';
import { detectQuality, GameRenderer, settingsFor, type Quality } from './render/renderer';
import { ARENA_IDS, createArena, type Arena, type ArenaId } from './render/scene/arena';
import { Battle } from './sim/battle';
import { DT } from './sim/constants';
import { h, save, store } from './ui/dom';
import { icon } from './ui/icons';
import { FloatingText } from './ui/floatingText';
import { Hud } from './ui/hud';
import { DEFAULT_BUILDS, sanitizeBuild } from './sim/loadout';
import { Menu, ZOOM_LABEL, ZOOM_ORDER, type Loadout, type MenuSettings } from './ui/menu';
import { Results } from './ui/results';
import { setupPhoneFullscreen } from './ui/fullscreen';
import { Creator } from './ui/creator';
import { versionBadge } from './ui/patchNotes';
import { CharacterStage } from './render/characterStage';
import { detailFor, setBodyDetail } from './render/fighter/body';
import { setAuraDetail } from './render/gear/aura';
import {
  generateRival, loadCharacter, newCharacter, randomName, saveCharacter, type PlayerCharacter,
} from './character/profile';
import { ROUND_TIME } from './sim/constants';
import type { CharacterBuild } from './sim/loadout';
import { GuestSession, HostSession, savedMatch, type OnlineSession } from './net/session';
import { matchWinner, normalizeCode, scoreOf, CODE_LENGTH, type RoundResult, type Snapshot } from './net/protocol';
import { confirmLeave, Lobby, NetBanner, openOnlineSheet } from './ui/online';
import type { OnlinePick } from './ui/menu';

type State = 'create' | 'menu' | 'intro' | 'battle' | 'ending' | 'results';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const fxLayer = document.getElementById('fx-layer')!;

const params = new URLSearchParams(location.search);
const settings: MenuSettings = { quality: 'auto', sound: true, fps: false, feed: true, arena: 'highlands', zoom: 'normal', ...store<Partial<MenuSettings>>('cb.settings', {}) };
// URL overrides for testing/sharing: ?arena=colosseum&zoom=close
if (ARENA_IDS.includes(params.get('arena') as ArenaId)) settings.arena = params.get('arena') as ArenaId;
if (ZOOM_ORDER.includes(params.get('zoom') as Zoom)) settings.zoom = params.get('zoom') as Zoom;
const resolveQuality = (q: MenuSettings['quality']): Quality => (q === 'auto' ? detectQuality() : q);

setBodyDetail(detailFor(resolveQuality(settings.quality)));
setAuraDetail(settingsFor(resolveQuality(settings.quality)).detail);
const renderer = new GameRenderer(canvas, resolveQuality(settings.quality));
const scene = new Scene();
const cam = new FightCamera(renderer.aspect);
cam.resize(renderer.aspect);
cam.zoom = settings.zoom;
// ?orbit=yaw,pitch (degrees) starts with the view turned, for checking angles.
if (params.has('orbit')) { const [y = 0, p = 0] = params.get('orbit')!.split(',').map(Number); cam.orbit((y || 0) * Math.PI / 180, (p || 0) * Math.PI / 180); }
const arenaOpts = () => {
  const q = settingsFor(resolveQuality(settings.quality));
  return { shadows: q.shadows, shadowMapSize: q.shadowMapSize, crowd: q.crowd, detail: q.detail };
};
let arena: Arena = await createArena(settings.arena, scene, arenaOpts());
renderer.setLook(arena);
let arenaToken = 0;
/** Swaps the arena (or rebuilds it for a new quality tier). */
async function loadArena(id: ArenaId): Promise<void> {
  const token = ++arenaToken;
  const next = await createArena(id, scene, arenaOpts());
  if (token !== arenaToken) { next.dispose(); return; }
  arena.dispose();
  arena = next;
  view.arena = next;
  renderer.setLook(next);
  try { await renderer.renderer.compileAsync(scene, cam.camera); } catch { /* optional */ }
}
const fx = { add: new Particles(6144, true), smoke: new Particles(1536, false) };
scene.add(fx.smoke.mesh, fx.add.mesh);
const floating = new FloatingText(fxLayer);
const view = new BattleView(scene, fx, cam, renderer, arena, floating);
renderer.setupPasses(scene, cam.camera);

// The player's one persistent character (blue) against a generated rival (red).
// Before a character exists, a guest stands in (demo mode, behind the creator);
// its gear comes from an older blue-corner loadout so existing setups carry over.
let player: PlayerCharacter | null = loadCharacter();
const legacy = sanitizeBuild(store<unknown[]>('cb.loadouts', [])?.[0], DEFAULT_BUILDS[0]);
const guest: PlayerCharacter = { ...newCharacter(legacy), name: randomName() };
let loadouts: [Loadout, Loadout] = [player ?? guest, generateRival(player?.name)];
const stage = new CharacterStage(scene, fx);
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

function cycleZoom(): void {
  const z = ZOOM_ORDER[(ZOOM_ORDER.indexOf(settings.zoom) + 1) % ZOOM_ORDER.length];
  applySettings({ ...settings, zoom: z });
  menu.settings = { ...settings };
  if (state === 'menu') menu.render();
  sfx.play('ui');
}

const hud = new Hud({
  onZoom: () => cycleZoom(),
  onSpeed: (s) => { speed = s; hud.setSpeed(s); sfx.play('ui'); },
  onPause: () => togglePause(),
  onExit: () => (session ? askLeave() : toMenu()),
});
const results = new Results({
  onReplay: () => startFight(lastSeed),
  onRematch: () => startFight(randomSeed()),
  onLoadout: () => toMenu(),
  onNextRound: () => { sfx.play('ui'); session?.finishedWatching(netRound); },
  onAskRematch: () => { sfx.play('ui'); session?.rematch(); },
  onLeaveMatch: () => { sfx.play('ui'); askLeave(); },
});
const menu = new Menu(loadouts, settings, {
  onChange: (l) => {
    loadouts = l;
    if (session) {
      // An online pick is just for this round: the saved character stays as it is.
      session.draft = l[session.you];
      newBattle(randomSeed());
      return;
    }
    // Gear and skin changes on the blue corner belong to the persistent character.
    if (player) { player = { ...player, gear: { ...l[0].gear }, skins: { ...l[0].skins } }; saveCharacter(player); }
    newBattle(randomSeed());
  },
  onEditCharacter: () => openCreator(),
  onNewRival: () => {
    loadouts = [loadouts[0], generateRival(player?.name)];
    menu.loadouts = loadouts;
    newBattle(randomSeed());
    menu.render();
  },
  onFight: () => startFight(randomSeed()),
  onSettings: (s) => applySettings(s),
  onOnline: () => openOnlineSheet(ui, { onHost: () => startOnline('host'), onJoin: (code) => startOnline('guest', code) }),
  onReady: () => {
    const s = session;
    if (!s?.snap) return;
    if (s.snap.ready[s.you]) s.unlock(); else s.lock(s.draft);
  },
  onLeave: () => askLeave(),
});
const creator = new Creator({
  onPreview: (c, cheer) => { stage.set(c); if (cheer) stage.cheer(); },
  onFocus: (f) => { stage.focus = f; },
  onSave: (c) => {
    player = c;
    saveCharacter(c);
    loadouts = [c, loadouts[1].name === c.name ? generateRival(c.name) : loadouts[1]];
    closeCreator();
    // Arrived through an invite link before having a fighter: join now.
    if (pendingRoom) { const code = pendingRoom; pendingRoom = ''; startOnline('guest', code); }
  },
  onCancel: () => closeCreator(),
});
const fpsEl = h('div.fps');
const lobby = new Lobby({ onCancel: () => endOnline(true), onRetry: () => retryOnline() });
const netBanner = new NetBanner();
ui.append(hud.el, menu.el, results.el, creator.el, lobby.el, netBanner.el, fpsEl);
// First in #ui so every panel paints over it instead of the other way round.
ui.prepend(versionBadge(__APP_VERSION__));
hud.show(false);

function applySettings(s: MenuSettings): void {
  const prevQuality = settings.quality;
  const prevArena = settings.arena;
  Object.assign(settings, s);
  save('cb.settings', settings);
  sfx.setMuted(!s.sound);
  fpsEl.hidden = !s.fps;
  hud.setFeed(s.feed);
  cam.zoom = s.zoom;
  hud.setZoom(ZOOM_LABEL[s.zoom]);
  if (s.quality !== prevQuality) {
    const q = resolveQuality(s.quality);
    renderer.setQuality(q);
    setBodyDetail(detailFor(q));
    setAuraDetail(settingsFor(q).detail);
    renderer.setupPasses(scene, cam.camera);
  }
  if (s.quality !== prevQuality || s.arena !== prevArena) void loadArena(s.arena);
}

function togglePause(): void {
  // Online fights run on both devices at once: no pausing.
  if (session || (state !== 'battle' && state !== 'intro')) return;
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

/** Character creation (first launch) or editing (from the menu). */
function openCreator(): void {
  state = 'create';
  paused = false;
  menu.show(false);
  results.hide();
  hud.show(false);
  for (const f of view.fighters) if (f) f.group.visible = false;
  stage.snap(cam.camera);
  stage.show(true);
  creator.open(player ?? guest, !player);
  cam.setInsets(NO_INSETS, true);
  layoutStage();
}

function closeCreator(): void {
  creator.close();
  stage.show(false);
  toMenu();
}

/** Keeps the character clear of the creator panel (side panel, or bottom sheet on phones). */
function layoutStage(): void {
  const p = creator.panel;
  const w = window.innerWidth, hgt = window.innerHeight;
  if (!p || !w || !hgt) return;
  // Offsets ignore the panel's slide-in transform, so the camera aims at where it settles.
  if (p.offsetTop > hgt * 0.25) {
    stage.screenX = 0;
    stage.bottomInset = Math.min(0.62, Math.max(0, (hgt - p.offsetTop + 8) / hgt));
  } else {
    stage.screenX = (Math.max(0, p.offsetLeft - 16) / 2 / w) * 2 - 1;
    stage.bottomInset = 0;
  }
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
// Online matches: best of five against a friend. Both devices run the same
// fights from the host's seed; this side only follows the session's state.
// -----------------------------------------------------------------------------

let session: OnlineSession | null = null;
/** Invite code waiting for the first character to be made. */
let pendingRoom = '';
/** The match and round whose fight is loaded here, and the round being picked. */
let netMatch = '';
let netRound = 0;
let netPick = '';
let netPickShown = '';

function startOnline(role: 'host' | 'guest', code = '', resume?: ReturnType<typeof savedMatch>): void {
  if (!player) { pendingRoom = role === 'guest' ? code : ''; openCreator(); return; }
  endOnline(false);
  sfx.unlock();
  const me: CharacterBuild = { name: player.name, form: player.form, gear: { ...player.gear }, look: player.look, skins: { ...player.skins } };
  const s: OnlineSession = role === 'host' ? new HostSession(me, resume ?? undefined) : new GuestSession(code, me, resume ?? undefined);
  session = s;
  netMatch = ''; netRound = 0; netPick = ''; netPickShown = '';
  s.onChange = () => { if (session === s) syncOnline(); };
  // The duel preview stays behind the lobby.
  state = 'menu';
  paused = false;
  menu.show(false);
  results.hide();
  hud.show(false);
  syncOnline();
  void (s as HostSession | GuestSession).start();
}

function retryOnline(): void {
  const s = session as HostSession | GuestSession | null;
  s?.retry();
}

/** Ends the online session (telling the rival when `bye`) and goes back to the menu. */
function endOnline(bye: boolean): void {
  const s = session;
  if (!s) return;
  session = null;
  if (bye) s.leave(); else s.close();
  lobby.hide();
  netBanner.hide();
  menu.online = null;
  hud.setMatch(null);
  loadouts = [player ?? guest, generateRival(player?.name)];
  toMenu();
}

function askLeave(): void {
  if (!session) return;
  // Nothing left to lose: leave straight away.
  if (!session.snap || session.conn === 'left' || session.conn === 'error') { endOnline(true); return; }
  confirmLeave(ui, () => endOnline(true));
}

/** Brings the screens in line with the session after every change. */
function syncOnline(): void {
  const s = session;
  if (!s) return;
  const snap = s.snap;
  if (!snap) {
    netBanner.hide();
    if (s.conn === 'error') lobby.show({ kind: 'error', code: s.code, error: s.error ?? 'offline', canRetry: true });
    else if (s.role === 'host') lobby.show(s.conn === 'starting' ? { kind: 'opening' } : { kind: 'waiting', code: s.code });
    else lobby.show({ kind: 'joining', code: s.code });
    return;
  }
  lobby.hide();
  syncBanner(s, snap);
  if (snap.phase === 'pick') {
    const key = `${snap.id}:${snap.round}`;
    if (netPick !== key) enterPick(s, snap, key);
    else updatePick(s, snap);
  } else if (netMatch !== snap.id || netRound !== snap.round) {
    // A new fight (or the last one, when coming back to a finished match).
    startNetFight(snap);
  } else if (state === 'results') {
    results.updateOnline(onlineOutcome(s, snap));
  }
}

function syncBanner(s: OnlineSession, snap: Snapshot): void {
  const rivalName = snap.builds[s.rival].name;
  const leave = { label: 'Leave', icon: 'exit' as const, onClick: () => askLeave() };
  const back = { label: 'Back to menu', primary: true, onClick: () => endOnline(false) };
  if (s.conn === 'lost') {
    netBanner.show(
      s.role === 'host' ? `${rivalName} disconnected` : 'Connection lost',
      s.role === 'host' ? 'Waiting for them to come back. The pick clock is paused.' : 'Getting you back into the match',
      [leave], true);
  } else if (s.conn === 'left') {
    netBanner.show(`${rivalName} left the match`, '', [back], false);
  } else if (s.conn === 'error') {
    netBanner.show("Can't get back into the match", s.error === 'version' ? 'Your versions differ: both reload the game.' : '', [back], false);
  } else {
    netBanner.hide();
  }
}

function pickInfo(s: OnlineSession, snap: Snapshot): OnlinePick {
  return { you: s.you, round: snap.round, score: scoreOf(snap.results), ready: [snap.ready[0], snap.ready[1]], deadline: s.pickDeadline };
}

/** A new round: everyone picks a build, starting from what they fought with last. */
function enterPick(s: OnlineSession, snap: Snapshot, key: string): void {
  netPick = key;
  const draft = s.draft;
  loadouts = s.you === 0 ? [draft, snap.builds[1]] : [snap.builds[0], draft];
  state = 'menu';
  paused = false;
  results.hide();
  hud.show(false);
  menu.online = pickInfo(s, snap);
  menu.activeCorner(s.you);
  netPickShown = JSON.stringify([snap.ready, snap.held, snap.builds[s.rival].name]);
  menu.loadouts = loadouts;
  menu.render();
  menu.show(true);
  newBattle(randomSeed());
}

function updatePick(s: OnlineSession, snap: Snapshot): void {
  menu.online = pickInfo(s, snap);
  const shown = JSON.stringify([snap.ready, snap.held, snap.builds[s.rival].name]);
  if (shown === netPickShown || state !== 'menu') return;
  netPickShown = shown;
  menu.render();
}

/** Both builds are in: play the round from the host's seed. */
function startNetFight(snap: Snapshot): void {
  netMatch = snap.id;
  netRound = snap.round;
  netPick = '';
  menu.online = null;
  menu.show(false);
  loadouts = [snap.builds[0], snap.builds[1]];
  hud.setMatch({ round: snap.round, score: scoreOf(snap.results, snap.round - 1) });
  newBattle(snap.seed);
  startFight(snap.seed);
}

/** The round's result: the host's official one, or this device's own until it arrives. */
function onlineOutcome(s: OnlineSession, snap: Snapshot) {
  const official = snap.results.find((r) => r.round === netRound);
  const local: RoundResult = { round: netRound, winner: battle.winner, reason: battle.time >= ROUND_TIME ? 'time' : 'ko' };
  const r = official ?? local;
  const all = official ? snap.results : [...snap.results, local];
  const mw = matchWinner(all, netRound);
  return {
    you: s.you, round: netRound, winner: r.winner, reason: r.reason,
    score: scoreOf(all, netRound), matchWinner: mw, desync: !!r.desync,
    waiting: mw !== -1 ? snap.rematch[s.you] : snap.done[s.you] || snap.round !== netRound,
    rivalRematch: snap.rematch[s.rival],
    offline: s.conn !== 'open',
  };
}

function showOnlineResults(): void {
  const s = session;
  if (!s?.snap) return;
  results.showOnline(battle, onlineOutcome(s, s.snap));
}

// -----------------------------------------------------------------------------
// Main loop: fixed-step simulation, interpolated rendering.
// -----------------------------------------------------------------------------

let last = performance.now();
let fpsT = 0;

let cpuMs = 0;
let debugHooks: import('./debug').DebugHooks | null = null;
let lab: ((dt: number) => void) | null = null;
let logicMs = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  renderer.trackFrame(realDt);

  // Safety net: re-fit when the canvas's shown shape or the camera's aspect drifts
  // from the drawing buffer (a phone rotating into fullscreen can settle after
  // the last resize event). Cheap: the canvas is fixed-position.
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (cw && ch && (Math.abs(cw / ch - renderer.aspect) > 0.002 || Math.abs(cam.camera.aspect - renderer.aspect) > 0.002)) onResize();
  if (state === 'create') layoutStage();
  // Frame the duel in the space the loadout panels leave free (phones mostly).
  else cam.setInsets(state === 'menu' ? menu.insets : NO_INSETS);
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
      if (session) showOnlineResults();
      else results.show(battle, battle.time >= 99 ? 'time' : 'ko', !params.has('demo'));
      sfx.play('win');
    }
  }

  const dt = paused ? 0 : realDt * (simulating ? Math.max(0.35, view.timeScale) : 1);
  const time = now / 1000;
  fx.add.update(time);
  fx.smoke.update(time);
  arena.update(time, dt, fx);
  if (lab) lab(realDt * (paused ? 0 : 1));
  else if (state === 'create') stage.update(realDt, cam.camera);
  else view.update(dt, acc / DT, state !== 'menu');
  if (state !== 'menu' && state !== 'create') hud.update();
  else if (session && state === 'menu') menu.tick();
  const showReset = cam.orbited && state !== 'create' && !lab;
  if (camReset.hidden === showReset) camReset.hidden = !showReset;
  floating.update(dt, cam.camera, window.innerWidth, window.innerHeight);
  const t1 = performance.now();
  debugHooks?.beforeRender();
  renderer.render(scene, cam.camera, realDt);
  debugHooks?.afterRender(realDt);
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
  menu.relayout();
  renderer.resize();
  cam.resize(renderer.aspect);
}
renderer.onResize = () => { menu.relayout(); cam.resize(renderer.aspect); };
// Panel sizes change once the UI font arrives.
void document.fonts?.ready.then(() => menu.relayout());
window.addEventListener('resize', onResize);
screen.orientation?.addEventListener?.('change', onResize);
document.addEventListener('fullscreenchange', onResize);

window.addEventListener('keydown', (e) => {
  if (e.repeat || state === 'create') return;
  if (session) {
    // Online: only the view keys (speed, zoom, camera); Escape asks before leaving.
    if (e.key === '1' || e.key === '2' || e.key === '4') { speed = Number(e.key); hud.setSpeed(speed); }
    else if (e.key.toLowerCase() === 'z') cycleZoom();
    else if (e.key.toLowerCase() === 'c') cam.resetOrbit();
    else if (e.key === 'Escape') askLeave();
    return;
  }
  if (e.key === ' ' ) { e.preventDefault(); togglePause(); }
  else if (e.key === '1' || e.key === '2' || e.key === '4') { speed = Number(e.key); hud.setSpeed(speed); }
  else if (e.key === 'Escape' && state !== 'menu') toMenu();
  else if (e.key.toLowerCase() === 'z') cycleZoom();
  else if (e.key.toLowerCase() === 'c') cam.resetOrbit();
  else if (e.key === 'Enter' && (state === 'menu' || state === 'results')) startFight(randomSeed());
  else if (e.key.toLowerCase() === 'r' && state === 'menu') { loadouts = [loadouts[0], generateRival(player?.name)]; menu.loadouts = loadouts; menu.render(); newBattle(randomSeed()); }
});
// Drag the character around on the creation turntable; anywhere else a drag orbits the view.
let dragId = -1;
let dragX = 0;
let dragY = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (dragId !== -1 || lab || (e.pointerType === 'mouse' && e.button !== 0)) return;
  dragId = e.pointerId;
  dragX = e.clientX;
  dragY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== dragId) return;
  const dx = e.clientX - dragX, dy = e.clientY - dragY;
  dragX = e.clientX;
  dragY = e.clientY;
  if (state === 'create') { stage.drag(dx); return; }
  const s = Math.PI / Math.max(320, Math.min(window.innerWidth, window.innerHeight * 1.6));
  cam.orbit(-dx * s * 1.1, dy * s * 0.8);
});
const endDrag = (e: PointerEvent) => {
  if (e.pointerId !== dragId) return;
  dragId = -1;
  if (state === 'create') stage.release();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
// Brings the camera back to the default angle; only shown while the view is turned.
const camReset = h<HTMLButtonElement>('button.btn.cam-reset', {
  onclick: () => { cam.resetOrbit(); sfx.play('ui'); }, title: 'Reset camera (C)', 'aria-label': 'Reset camera',
}, icon('recenter', 'glyph'), h('span.lbl', null, 'Reset view'));
camReset.hidden = true;
ui.append(camReset);
setupPhoneFullscreen();
// Audio needs a user gesture; unlock on the first one.
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'battle' && !paused) togglePause();
  last = performance.now();
  renderer.resetTiming();
});

async function boot(): Promise<void> {
  hud.setZoom(ZOOM_LABEL[settings.zoom]);
  sfx.setMuted(!settings.sound);
  fpsEl.hidden = !settings.fps;
  hud.setFeed(settings.feed);
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
if (params.has('speed')) speed = Math.min(8, Math.max(1, Number(params.get('speed')) || 1));

void boot().then(async () => {
  if (params.has('debug')) {
    const { installDebug } = await import('./debug');
    debugHooks = installDebug({ renderer, scene, camera: cam.camera, getState: () => (paused ? `${state} (paused)` : state) });
  }
  if (params.has('lab')) {
    const { installLab } = await import('./lab');
    lab = installLab({
      scene, fx, cam, mode: params.get('lab') ?? '', focus: params.has('focus') ? Number(params.get('focus')) : undefined,
      hide: () => { menu.show(false); for (const v of view.fighters) if (v) v.group.visible = false; },
    });
  }
  if (params.has('demo')) {
    loadouts = [generateRival(), generateRival()];
    // `&main=longbow,spear` (and `&offhand=`, `&defense=`) force gear slots (for checking animations).
    for (const slot of ['main', 'offhand', 'defense'] as const) {
      params.get(slot)?.split(',').forEach((id, i) => {
        if (loadouts[i] && id) loadouts[i] = sanitizeBuild({ ...loadouts[i], gear: { ...loadouts[i].gear, [slot]: id } }, loadouts[i]);
      });
    }
    startFight(randomSeed());
  } else if (!lab && params.has('room')) {
    // An invite link: join the room (after making a fighter on a first visit).
    const code = normalizeCode(params.get('room') ?? '');
    params.delete('room');
    history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash);
    if (code.length !== CODE_LENGTH) { if (!player) openCreator(); }
    else if (player) startOnline('guest', code);
    else { pendingRoom = code; openCreator(); }
  } else if (!lab && (!player || params.has('create'))) {
    // First launch: meet your fighter before anything else.
    openCreator();
  } else if (!lab) {
    // A reload mid-match picks the match back up.
    const saved = savedMatch();
    if (saved && player) startOnline(saved.role, saved.code, saved);
  }
});
if (import.meta.env.PROD) registerSW({ immediate: true });
