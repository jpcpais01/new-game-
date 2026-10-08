import type { Scene } from 'three';
import { createFighter, type Fighter } from './sim/fighter';
import type { FormId, GearSet } from './sim/types';
import { SKINS } from './gear/skins';
import type { FightCamera } from './render/camera';
import { FighterView, type FxContext } from './render/fighter/fighterView';

/**
 * Animation lab (`?lab`): every body form side by side, each with a different
 * weapon, cycling through idle, steps, attacks, guards, dodges, hits and a
 * knockout. Used to review bodies and motion without waiting for a duel.
 * `?lab=walk` only walks, `?lab=ko` loops knockouts, `?lab=<anim>` loops one action slot.
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

/** `?lab=ranged`: bows on three builds plus every ranged secondary. */
const RANGED: { form: FormId; gear: GearSet }[] = [
  { form: 'balanced', gear: { main: 'longbow' } },
  { form: 'mighty', gear: { main: 'longbow', head: 'iron_helm' } },
  { form: 'robust', gear: { main: 'longsword', offhand: 'hand_crossbow' } },
  { form: 'agile', gear: { main: 'spear', offhand: 'hand_crossbow' } },
  { form: 'slender', gear: { main: 'katana', offhand: 'throwing_knives' } },
  { form: 'ethereal', gear: { main: 'longsword', offhand: 'wind_chakram' } },
];

/**
 * `?lab=combos&page=N`: every main weapon side by side with one left-hand item
 * per page (none, shields, parrying blade, each secondary, shield + crossbow),
 * to check that any combination is held sensibly.
 */
const MAINS: GearSet['main'][] = ['longsword', 'katana', 'warhammer', 'spear', 'twin_daggers', 'arcane_staff', 'longbow'];
const LEFTS: Partial<GearSet>[] = [
  {}, { defense: 'tower_shield' }, { defense: 'mirror_aegis' }, { defense: 'parrying_blade' }, { offhand: 'hand_crossbow' },
  { offhand: 'throwing_knives' }, { offhand: 'wind_chakram' }, { offhand: 'frost_orb' }, { offhand: 'iron_gauntlet' },
  { defense: 'tower_shield', offhand: 'hand_crossbow' }, { defense: 'parrying_blade', offhand: 'throwing_knives' },
  { defense: 'parrying_blade', offhand: 'hand_crossbow' },
];
const FORMS_CYCLE: FormId[] = ['balanced', 'robust', 'mighty', 'slender', 'agile', 'ethereal', 'balanced'];

/** Script of [seconds, what] the actors loop through. */
type Beat = 'idle' | 'walkF' | 'walkB' | 'basic' | 'basic2' | 'skill' | 'skill2' | 'guard' | 'evade' | 'hit' | 'heavyHit' | 'ko' | 'run' | 'ranged' | 'ranged2';
const SCRIPT: [number, Beat][] = [
  [1.2, 'idle'], [1.0, 'walkF'], [0.9, 'basic'], [0.9, 'basic2'], [1.0, 'walkB'], [1.4, 'skill'], [0.6, 'hit'],
  [1.0, 'guard'], [1.0, 'evade'], [0.8, 'heavyHit'], [0.9, 'run'], [0.9, 'idle'], [2.6, 'ko'],
];

export function installLab(o: { scene: Scene; fx: FxContext; cam: FightCamera; hide: () => void; mode: string; focus?: number }): (dt: number) => void {
  o.hide();
  const q = new URLSearchParams(location.search);
  const page = Number(q.get('page')) || 0;
  // &skin=<theme>: wear that theme's skin on every piece that has one.
  const theme = q.get('skin');
  const skinsOf = (g: GearSet) => Object.fromEntries(SKINS.filter((k) => k.theme === theme && Object.values(g).includes(k.gear)).map((k) => [k.gear, k.id]));
  const roster = o.mode === 'ranged' ? RANGED
    : o.mode === 'combos' ? MAINS.map((main, i) => ({ form: FORMS_CYCLE[i], gear: { main, ...LEFTS[page % LEFTS.length] } as GearSet }))
      : ROSTER;
  const actors: Actor[] = roster.map((r, i) => {
    const f = createFighter((i % 2) as 0 | 1, { name: r.form, form: r.form, gear: r.gear, skins: skinsOf(r.gear) });
    const home = (i - (roster.length - 1) / 2) * 2.3;
    f.x = f.px = home;
    f.facing = new URLSearchParams(location.search).has('flip') ? -1 : 1;
    const v = new FighterView(f, (i % 2) as 0 | 1);
    o.scene.add(v.group);
    return { f, v, home, clock: o.mode === 'combos' ? 0 : i * 0.37 };
  });
  const script: [number, Beat][] = o.mode === 'idle' ? [[10, 'idle']] : o.mode === 'walk' ? [[1.5, 'walkF'], [1.5, 'walkB'], [1, 'run'], [1, 'idle']]
    : o.mode === 'ko' ? [[1, 'idle'], [3, 'ko']]
      : ['basic', 'skill', 'guard', 'evade', 'hit'].includes(o.mode) ? [[1, 'idle'], [1.2, o.mode as Beat]]
        : o.mode === 'ranged' ? [[0.9, 'idle'], [1.0, 'ranged'], [0.4, 'idle'], [1.4, 'ranged2'], [0.8, 'walkB']]
          : o.mode === 'combos' ? [[1, 'idle'], [0.9, 'basic'], [1.2, 'skill'], [1.3, 'skill2'], [1.1, 'guard'], [0.8, 'walkF'], [0.8, 'walkB']]
          : SCRIPT;
  const total = script.reduce((s, [d]) => s + d, 0);

  const startAction = (f: Fighter, slot: string, nth = 0) => {
    let idx = -1, seen = 0;
    f.abilities.forEach((a, i) => { if (a.slot === slot && idx < 0 && seen++ === nth) idx = i; });
    if (idx < 0) f.abilities.forEach((a, i) => { if (a.slot === slot && idx < 0) idx = i; });
    if (idx >= 0) startAbility(f, idx, slot);
  };
  /** Starts the nth projectile ability (bow shots, throws, bolts). */
  const startRanged = (f: Fighter, nth: number) => {
    const ids = f.abilities.map((a, i) => (a.kind === 'projectile' ? i : -1)).filter((i) => i >= 0);
    if (ids.length) startAbility(f, ids[Math.min(nth, ids.length - 1)], 'skill');
  };
  const startAbility = (f: Fighter, idx: number, slot: string) => {
    const a = f.abilities[idx];
    f.action = {
      ability: idx, phase: 'windup', t: 0, total: 0, windup: a.windup, active: a.active, recovery: a.recovery,
      hitsDone: 0, connected: false, feint: false, targetX: f.x + 3, startX: f.x, isCounter: false, dir: slot === 'evade' ? -f.facing : f.facing,
      through: !!a.dash?.through,
    };
  };

  // `&slow=0.25` plays everything at a quarter speed, to study fast moves.
  const slow = Number(new URLSearchParams(location.search).get('slow')) || 1;
  // `&freeze=2.4` stops the script at that second and lets the poses settle, for stills.
  const freeze = Number(new URLSearchParams(location.search).get('freeze')) || 0;
  return (realDt: number) => {
    for (const ac of actors) {
      const f = ac.f;
      const dt = freeze ? Math.max(0, Math.min(realDt * slow, freeze - ac.clock)) : realDt * slow;
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
        if (beat === 'skill2') startAction(f, 'skill', 1);
        if (beat === 'guard') startAction(f, 'defense');
        if (beat === 'ranged') startRanged(f, 0);
        if (beat === 'ranged2') startRanged(f, 1);
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
      if (freeze && ac.clock >= freeze - 1e-6) {
        // Frozen: tell screenshot scripts, with what each actor is doing.
        const a = f.action;
        document.body.dataset.frozen = '1';
        document.body.dataset[`actor${actors.indexOf(ac)}`] = `${beat}@${ac.clock.toFixed(2)} ${a ? `${f.abilities[a.ability].id}:${a.phase}:${a.t.toFixed(2)}` : '-'}`;
      }
      ac.v.setLookAt(null);
      ac.v.update(f, 1, realDt * slow, o.fx, false, false, 1);
    }
    o.cam.showcase = 0;
    if (o.focus !== undefined && actors[o.focus]) {
      // Close-up on one actor.
      o.cam.zoom = 'close';
      const x = actors[o.focus].home;
      o.cam.update(realDt, x - 1.2, x + 1.2, 0, 0);
    } else {
      o.cam.zoom = 'normal';
      o.cam.update(realDt, actors[0].home - 0.8, actors[actors.length - 1].home + 0.8, 0, 0);
    }
  };
}
