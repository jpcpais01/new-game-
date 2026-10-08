import type { Scene } from 'three';
import { DEFAULT_APPEARANCE, randomAppearance, type Appearance } from './character/appearance';
import { createFighter, type Fighter } from './sim/fighter';
import type { FormId, GearSet } from './sim/types';
import type { FightCamera } from './render/camera';
import { FighterView, type FxContext } from './render/fighter/fighterView';

/**
 * Animation lab (`?lab`): every body form side by side, each with a different
 * weapon, cycling through idle, steps, attacks, guards, dodges, hits and a
 * knockout. Used to review bodies and motion without waiting for a duel.
 * `?lab=walk` only walks, `?lab=ko` loops knockouts, `?lab=<anim>` loops one action slot.
 * Review options: `&focus=N` close-up on one actor, `&shot=body|bust|face` a
 * portrait camera on it (with `&yaw=deg` to orbit), `&looks=random|N` gives
 * the actors creator looks (seeded), `&bare` strips their gear.
 */

interface Actor { f: Fighter; v: FighterView; home: number; clock: number }

const ROSTER: { form: FormId; gear: GearSet }[] = [
  { form: 'robust', gear: { main: 'warhammer', defense: 'plate_armor', head: 'iron_helm' } },
  { form: 'agile', gear: { main: 'twin_daggers', boots: 'zephyr_boots' } },
  { form: 'balanced', gear: { main: 'longsword', defense: 'tower_shield' } },
  { form: 'slender', gear: { main: 'spear', head: 'storm_crown' } },
  { form: 'mighty', gear: { main: 'katana', defense: 'thornmail', head: 'berserker_mask' } },
  { form: 'ethereal', gear: { main: 'arcane_staff', offhand: 'frost_orb', head: 'chrono_circlet', special: 'phoenix_feather' } },
];

/** Script of [seconds, what] the actors loop through. */
type Beat = 'idle' | 'walkF' | 'walkB' | 'basic' | 'basic2' | 'skill' | 'guard' | 'evade' | 'hit' | 'heavyHit' | 'ko' | 'run';
const SCRIPT: [number, Beat][] = [
  [1.2, 'idle'], [1.0, 'walkF'], [0.9, 'basic'], [0.9, 'basic2'], [1.0, 'walkB'], [1.4, 'skill'], [0.6, 'hit'],
  [1.0, 'guard'], [1.0, 'evade'], [0.8, 'heavyHit'], [0.9, 'run'], [0.9, 'idle'], [2.6, 'ko'],
];

export function installLab(o: { scene: Scene; fx: FxContext; cam: FightCamera; hide: () => void; mode: string; focus?: number }): (dt: number) => void {
  o.hide();
  const q = new URLSearchParams(location.search);
  const looks = q.get('looks');
  let seed = Number(looks) || 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const lookFor = (i: number): Appearance | undefined => {
    if (looks === null) return undefined;
    let a = looks === 'default' ? DEFAULT_APPEARANCE : randomAppearance(rnd);
    if (i === 0 && looks === '') a = DEFAULT_APPEARANCE;
    // Per-field overrides, e.g. `&hairStyle=long&eyes=sharp&skin=0xc08a60`.
    const o: Record<string, unknown> = { ...a };
    for (const k of Object.keys(DEFAULT_APPEARANCE)) {
      const v = q.get(k);
      if (v !== null) o[k] = typeof o[k] === 'number' ? Number(v) : v;
    }
    return o as unknown as Appearance;
  };
  const actors: Actor[] = ROSTER.map((r, i) => {
    const f = createFighter((i % 2) as 0 | 1, { name: r.form, form: r.form, gear: q.has('bare') ? { main: r.gear.main } : r.gear, look: lookFor(i) });
    const home = (i - (ROSTER.length - 1) / 2) * 2.3;
    f.x = f.px = home;
    f.facing = 1;
    const v = new FighterView(f, (i % 2) as 0 | 1);
    o.scene.add(v.group);
    return { f, v, home, clock: i * 0.37 };
  });
  const script: [number, Beat][] = o.mode === 'idle' ? [[10, 'idle']] : o.mode === 'walk' ? [[1.5, 'walkF'], [1.5, 'walkB'], [1, 'run'], [1, 'idle']]
    : o.mode === 'ko' ? [[1, 'idle'], [3, 'ko']]
      : ['basic', 'skill', 'guard', 'evade', 'hit'].includes(o.mode) ? [[1, 'idle'], [1.2, o.mode as Beat]]
        : SCRIPT;
  const total = script.reduce((s, [d]) => s + d, 0);

  const startAction = (f: Fighter, slot: string, nth = 0) => {
    let idx = -1, seen = 0;
    f.abilities.forEach((a, i) => { if (a.slot === slot && idx < 0 && seen++ === nth) idx = i; });
    if (idx < 0) f.abilities.forEach((a, i) => { if (a.slot === slot && idx < 0) idx = i; });
    if (idx < 0) return;
    const a = f.abilities[idx];
    f.action = {
      ability: idx, phase: 'windup', t: 0, total: 0, windup: a.windup, active: a.active, recovery: a.recovery,
      hitsDone: 0, connected: false, feint: false, targetX: f.x + 3, startX: f.x, isCounter: false, dir: slot === 'evade' ? -f.facing : f.facing,
      through: !!a.dash?.through,
    };
  };

  return (dt: number) => {
    for (const ac of actors) {
      const f = ac.f;
      ac.clock = (ac.clock + dt) % total;
      let t = ac.clock, beat: Beat = 'idle', bt = 0;
      for (const [d, b] of script) { if (t < d) { beat = b; bt = t; break; } t -= d; }
      const prev = (f as unknown as { _beat?: Beat })._beat;
      const fresh = prev !== beat;
      (f as unknown as { _beat?: Beat })._beat = beat;
      f.px = f.x; f.py = f.y;
      f.vx = 0;
      f.alive = true;
      f.stagger = Math.max(0, f.stagger - dt);
      if (fresh) {
        f.action = null;
        if (beat === 'basic') startAction(f, 'basic');
        if (beat === 'basic2') startAction(f, 'basic');
        if (beat === 'skill') startAction(f, 'skill');
        if (beat === 'guard') startAction(f, 'defense');
        if (beat === 'evade') startAction(f, 'evade');
        if (beat === 'hit') { ac.v.onHit(false, f.x + 1); f.stagger = 0.25; }
        if (beat === 'heavyHit') { ac.v.onHit(true, f.x + 1); f.stagger = 0.4; }
      }
      const sp = f.stats.moveSpeed;
      if (beat === 'walkF') f.vx = sp * 0.55;
      if (beat === 'walkB') f.vx = -sp * 0.5;
      if (beat === 'run') f.vx = (Math.floor(ac.clock) % 2 ? -1 : 1) * sp;
      if (beat === 'heavyHit' && bt < 0.25) f.vx = -5;
      if (beat === 'ko') f.alive = bt > 0.3 ? false : true;
      if (beat === 'ko' && bt < 0.3) f.vx = -3;
      // Drift back home when idle so the lineup stays tidy.
      if (beat === 'idle' || beat === 'ko') f.x += (ac.home - f.x) * Math.min(1, dt * (beat === 'idle' ? 1.5 : 0));
      if (f.action) {
        const a = f.action;
        a.t += dt * f.stats.attackSpeed;
        a.total += dt;
        const ab = f.abilities[a.ability];
        if (a.phase === 'windup' && a.t >= a.windup) { a.phase = 'active'; a.t = 0; }
        else if (a.phase === 'active' && a.t >= a.active) { a.phase = 'recovery'; a.t = 0; }
        else if (a.phase === 'recovery' && a.t >= a.recovery) f.action = null;
        if (f.action && (a.phase === 'active') && (ab.lunge || ab.dash)) {
          const dist = ab.dash ? Math.min(2.5, ab.dash.distance) : ab.lunge ?? 0;
          f.vx = (dist / Math.max(0.05, a.active)) * a.dir;
        }
        if (f.action && ab.airborne && a.phase !== 'recovery') {
          const k = a.phase === 'windup' ? a.t / a.windup : 1 + a.t / a.active;
          f.y = Math.max(0, Math.sin(Math.min(1, k / 2) * Math.PI) * 1.2);
        } else f.y = Math.max(0, f.y - dt * 6);
      } else f.y = Math.max(0, f.y - dt * 6);
      f.x += f.vx * dt;
      f.x = Math.max(ac.home - 1.0, Math.min(ac.home + 1.0, f.x));
      ac.v.setLookAt(null);
      ac.v.update(f, 1, dt, o.fx, false, false, 1);
    }
    o.cam.showcase = 0;
    const shot = q.get('shot');
    if (shot && o.focus !== undefined && actors[o.focus]) {
      // Portrait camera for reviewing bodies and faces up close (other actors hidden).
      const ac = actors[o.focus];
      for (const other of actors) other.v.group.visible = other === ac;
      const yaw = (Number(q.get('yaw')) || 0) * Math.PI / 180;
      const head = ac.v.headWorld;
      const [h, d] = shot === 'face' ? [head.y - 0.14, Number(q.get('dist')) || 1.25] : shot === 'bust' ? [head.y - 0.45, 2.4] : [head.y * 0.55, 5.2];
      const c = o.cam.camera;
      const x = shot === 'body' ? ac.f.x : head.x;
      o.cam.update(dt, x - 1, x + 1, 0, 0);
      c.position.set(x + Math.sin(yaw) * d, h + (shot === 'face' ? 0.02 : 0.15), Math.cos(yaw) * d);
      c.lookAt(x, h, 0);
      return;
    }
    if (o.focus !== undefined && actors[o.focus]) {
      // Close-up on one actor.
      o.cam.zoom = 'close';
      const x = actors[o.focus].home;
      o.cam.update(dt, x - 1.2, x + 1.2, 0, 0);
    } else {
      o.cam.zoom = 'normal';
      o.cam.update(dt, actors[0].home - 0.8, actors[actors.length - 1].home + 0.8, 0, 0);
    }
  };
}
