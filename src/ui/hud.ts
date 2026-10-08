import { PLAN_LABELS, type Plan } from '../sim/ai/brain';
import type { Battle } from '../sim/battle';
import { ROUND_TIME } from '../sim/constants';
import { FORMS } from '../sim/forms';
import { gearOf } from '../sim/gear';
import type { BattleEvent, StatusId } from '../sim/types';
import { h } from './dom';
import { fmtHp } from './format';
import { wornIcon } from './skinIcons';
import { icon, statusIcon } from './icons';
import { pips } from './online';

/** Online: the round and score shown under the clock. */
export interface HudMatch { round: number; score: [number, number] }

const SPEEDS = [1, 2, 4];

const STATUS_NAME: Record<StatusId, string> = {
  burn: 'Burning', poison: 'Poisoned', chill: 'Chilled', frozen: 'Frozen', stun: 'Stunned', rage: 'Enraged',
  haste: 'Hasted', mark: 'Marked', ironskin: 'Ironskin', vulnerable: 'Vulnerable',
};

interface SideEls {
  fill: HTMLElement;
  ghost: HTMLElement;
  shield: HTMLElement;
  num: HTMLElement;
  en: HTMLElement;
  enWrap: HTMLElement;
  plan: HTMLElement;
  ult: HTMLElement;
  statuses: HTMLElement;
  last: { hp: number; shield: number; en: number; full: boolean; st: string };
}

export interface HudCallbacks {
  onSpeed(s: number): void;
  onPause(): void;
  onExit(): void;
  onZoom(): void;
}

/**
 * Battle HUD. Every per-frame write is guarded by a changed-value check and
 * only touches `transform` / text, so it never forces layout.
 */
export class Hud {
  readonly el: HTMLDivElement;
  private sides: SideEls[] = [];
  private clock!: HTMLElement;
  private feed!: HTMLElement;
  private banner!: HTMLElement;
  private ultCalls: HTMLElement[] = [];
  private speedBtn!: HTMLButtonElement;
  private feedOn = true;
  private pauseBtn!: HTMLButtonElement;
  private zoomBtn!: HTMLButtonElement;
  private zoomLabel = 'Normal';
  private lastClock = -1;
  private speed = 1;
  private battle: Battle | null = null;
  private match: HudMatch | null = null;
  private matchChip!: HTMLElement;

  constructor(private readonly cb: HudCallbacks) {
    this.el = h<HTMLDivElement>('div.hud');
  }

  setup(b: Battle, speed: number): void {
    this.battle = b;
    this.sides = [];
    const top = h('div.hud-top');
    for (const side of [0, 1] as const) {
      const f = b.fighters[side];
      const fill = h('i.fill'), ghost = h('i.ghost'), shield = h('i.shield'), num = h('span.num');
      // Tenths of the bar, drawn over the fill so big hits read at a glance.
      const ticks = h('i.ticks');
      const en = h('i');
      const enWrap = h('div.en', null, en);
      const plan = h('span.chip.plan', null, PLAN_LABELS[b.brains[side].plan]);
      const ult = h('span.chip.ult', { hidden: true }, 'Ult ready');
      const statuses = h('div.ico-row');
      const items = h('div.ico-row.gear-row', null, ...f.gearIds.map((id) => {
        const g = gearOf(id);
        return h(`span.mini.gear.r-${g.rarity}`, { title: `${g.name}: ${g.desc}` }, wornIcon(id, f.skins, { frame: false }));
      }));
      const bar = h(`div.fbar.side-${side}`, null,
        h('div.who', null, h('span.nm', null, f.name), h('small', null, FORMS[f.form].name)),
        h('div.hp', null, ghost, fill, shield, ticks, num),
        enWrap,
        h('div.meta', null, plan, ult, statuses),
        items,
      );
      this.sides.push({ fill, ghost, shield, num, en, enWrap, plan, ult, statuses, last: { hp: -1, shield: -1, en: -1, full: false, st: '' } });
      if (side === 0) top.append(bar);
      else {
        this.clock = h('div.clock', null, h('span', null, String(ROUND_TIME)));
        this.matchChip = h('div.match-chip');
        top.append(h('div.mid', null, this.clock, this.matchChip), bar);
      }
    }

    this.feed = h('div.feed');
    this.feed.hidden = !this.feedOn;
    // One button cycles 1× → 2× → 4× → 1×.
    this.speedBtn = h<HTMLButtonElement>('button.btn.speed-cycle', {
      title: 'Speed (1 / 2 / 4)',
      onclick: () => this.cb.onSpeed(SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length]),
    });
    this.setSpeed(speed);
    this.pauseBtn = h<HTMLButtonElement>('button.btn', { onclick: () => this.cb.onPause(), title: 'Pause', 'aria-label': 'Pause' }, icon('pause'));
    this.zoomBtn = h<HTMLButtonElement>('button.btn.zoom', { onclick: () => this.cb.onZoom(), title: 'Camera zoom (Z)', 'aria-label': 'Camera zoom' });
    this.setZoom(this.zoomLabel);
    const controls = h('div.controls', null, this.zoomBtn, this.speedBtn, this.pauseBtn,
      h('button.btn', { onclick: () => this.cb.onExit(), title: 'Back to loadout', 'aria-label': 'Back to loadout' }, icon('close')));
    const bottom = h('div.hud-bottom', null, this.feed, controls);
    this.banner = h('div.banner');
    this.ultCalls = [0, 1].map((s) => h(`div.ult-call.side-${s}`));
    this.el.replaceChildren(top, bottom, this.banner, ...this.ultCalls);
    this.lastClock = -1;
    this.setMatch(this.match);
  }

  /** Online matches show the score under the clock and can't be paused. */
  setMatch(m: HudMatch | null): void {
    this.match = m;
    if (!this.matchChip) return;
    this.matchChip.hidden = !m;
    this.pauseBtn.hidden = !!m;
    if (m) this.matchChip.replaceChildren(pips(0, m.score[0]), h('small', null, `R${m.round}`), pips(1, m.score[1]));
  }

  setZoom(label: string): void {
    this.zoomLabel = label;
    this.zoomBtn?.replaceChildren(icon('zoom', 'glyph'), h('span.lbl', null, label));
  }

  setSpeed(s: number): void {
    this.speed = s;
    const b = this.speedBtn;
    if (!b) return;
    b.replaceChildren(icon('haste', 'glyph'), h('span.val', null, `${s}×`));
    b.classList.toggle('fast', s > 1);
    b.setAttribute('aria-label', `Speed ${s}×, tap to change`);
  }

  /** Shows or hides the fighters' running commentary (the battle feed). */
  setFeed(on: boolean): void {
    this.feedOn = on;
    if (this.feed) {
      this.feed.hidden = !on;
      if (!on) this.feed.replaceChildren();
    }
  }

  setPaused(p: boolean): void {
    this.pauseBtn.replaceChildren(icon(p ? 'play' : 'pause'));
    this.pauseBtn.title = p ? 'Resume' : 'Pause';
    this.pauseBtn.classList.toggle('on', p);
  }

  showBanner(text: string, ko = false): void {
    const b = this.banner;
    b.textContent = text;
    b.className = 'banner' + (ko ? ' ko' : '');
    void b.offsetWidth; // restart the animation
    b.classList.add('show');
  }

  onEvent(e: BattleEvent): void {
    const b = this.battle;
    if (!b) return;
    if (e.type === 'thought') { if (this.feedOn) this.pushFeed(e.f, e.text); }
    else if (e.type === 'plan') {
      const s = this.sides[e.f];
      if (s) s.plan.textContent = PLAN_LABELS[e.plan as Plan];
    } else if (e.type === 'actionStart') {
      const ab = b.fighters[e.f].abilities[e.ability];
      if (ab.slot === 'ultimate') {
        const el = this.ultCalls[e.f];
        el.textContent = ab.name.toUpperCase() + '!';
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');
      }
    }
  }

  private pushFeed(side: number, text: string): void {
    const b = this.battle!;
    const name = b.fighters[side].name;
    const line = h(`div.side-${side}`, null, h('b', null, name), text);
    this.feed.prepend(line);
    while (this.feed.childElementCount > 4) this.feed.lastElementChild!.remove();
  }

  update(): void {
    const b = this.battle;
    if (!b) return;
    for (let i = 0; i < 2; i++) {
      const f = b.fighters[i];
      const s = this.sides[i];
      const hp = Math.max(0, f.hp) / f.stats.maxHp;
      const hpQ = Math.round(hp * 1000);
      if (hpQ !== s.last.hp) {
        s.last.hp = hpQ;
        const t = `scaleX(${(hpQ / 1000).toFixed(3)})`;
        s.fill.style.transform = t;
        s.ghost.style.transform = t;
        s.num.textContent = fmtHp(f.hp, f.alive);
      }
      const sh = Math.round(Math.min(1, f.shield / f.stats.maxHp) * 1000);
      if (sh !== s.last.shield) {
        s.last.shield = sh;
        s.shield.style.transform = `scaleX(${(sh / 1000).toFixed(3)})`;
      }
      const en = Math.round(f.energy);
      if (en !== s.last.en) {
        s.last.en = en;
        s.en.style.transform = `scaleX(${(en / 100).toFixed(2)})`;
        const full = en >= 100;
        if (full !== s.last.full) {
          s.last.full = full;
          s.enWrap.classList.toggle('full', full);
          s.ult.hidden = !full;
        }
      }
      let st = '';
      for (const x of f.statuses) st += x.id + x.stacks;
      if (st !== s.last.st) {
        s.last.st = st;
        s.statuses.replaceChildren(...f.statuses.map((x) =>
          h(`span.mini.st-${x.id}`, { title: STATUS_NAME[x.id] }, statusIcon(x.id), x.stacks > 1 ? h('sub', null, String(x.stacks)) : null)));
      }
    }
    const left = Math.max(0, Math.ceil(ROUND_TIME - b.time));
    if (left !== this.lastClock) {
      this.lastClock = left;
      this.clock.firstElementChild!.textContent = String(left);
      this.clock.classList.toggle('low', left <= 10);
    }
  }

  show(v: boolean): void {
    this.el.hidden = !v;
  }
}
