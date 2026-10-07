import { sfx } from '../audio/sfx';
import { CLASS_ABILITIES } from '../sim/abilities';
import { CLASSES, CLASS_IDS } from '../sim/classes';
import { computeBaseStats } from '../sim/fighter';
import { ITEMS, ITEM_IDS, MAX_ITEMS } from '../sim/items';
import type { ClassId, ItemId } from '../sim/types';
import { h, hex } from './dom';

export interface Loadout {
  classId: ClassId;
  items: ItemId[];
}

export const CLASS_GLYPH: Record<ClassId, string> = { vanguard: '🛡️', ronin: '⚔️', arcanist: '✨', brute: '🔨' };

export interface MenuSettings {
  quality: 'auto' | 'high' | 'medium' | 'low';
  sound: boolean;
  fps: boolean;
}

export interface MenuCallbacks {
  onChange(loadouts: [Loadout, Loadout]): void;
  onFight(): void;
  onSettings(s: MenuSettings): void;
}

export function randomLoadout(): Loadout {
  const classId = CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)];
  const items = ITEM_IDS.slice().sort(() => Math.random() - 0.5).slice(0, MAX_ITEMS);
  return { classId, items };
}

/** Pre-battle loadout screen: class + 3 items per corner, with the live 3D preview behind it. */
export class Menu {
  readonly el: HTMLDivElement;
  private picker: HTMLDivElement | null = null;

  constructor(
    public loadouts: [Loadout, Loadout],
    public settings: MenuSettings,
    private readonly cb: MenuCallbacks,
  ) {
    this.el = h<HTMLDivElement>('div.menu');
    this.render();
  }

  private changed(): void {
    this.cb.onChange(this.loadouts);
    this.render();
  }

  render(): void {
    this.el.replaceChildren(
      h('div.title', null, h('h1', null, 'CLASHBORN'), h('p', null, 'Auto Duel Arena')),
      this.corner(0),
      this.corner(1),
      h('div.menu-bottom', null,
        h('button.btn', { onclick: () => { sfx.play('ui'); this.loadouts = [randomLoadout(), randomLoadout()]; this.changed(); } }, '🎲 Random duel'),
        h('button.btn-fight', { onclick: () => this.cb.onFight() }, 'FIGHT'),
        this.settingsRow(),
      ),
    );
  }

  private settingsRow(): HTMLElement {
    const s = this.settings;
    const q = { auto: 'Auto', high: 'High', medium: 'Med', low: 'Low' }[s.quality];
    const order: MenuSettings['quality'][] = ['auto', 'high', 'medium', 'low'];
    const set = (patch: Partial<MenuSettings>) => {
      this.settings = { ...s, ...patch };
      this.cb.onSettings(this.settings);
      this.render();
    };
    return h('div.settings', null,
      h('button.btn', { title: 'Graphics quality', onclick: () => set({ quality: order[(order.indexOf(s.quality) + 1) % order.length] }) }, `⚙ ${q}`),
      h('button.btn', { title: 'Sound', onclick: () => set({ sound: !s.sound }) }, s.sound ? '🔊' : '🔇'),
      h('button.btn' + (s.fps ? '.on' : ''), { title: 'Show FPS', onclick: () => set({ fps: !s.fps }) }, 'FPS'),
    );
  }

  private corner(side: 0 | 1): HTMLElement {
    const lo = this.loadouts[side];
    const cls = CLASSES[lo.classId];
    const stats = computeBaseStats(lo.classId, lo.items);
    const statRow = (label: string, v: number, max: number, shown: string) =>
      [h('span', null, label), h('div.bar', null, h('i', { style: { transform: `scaleX(${Math.min(1, v / max)})` } })), h('b', null, shown)];

    return h(`div.corner.glass.side-${side}`, null,
      h('header', null,
        h('div', null,
          h('div.tag', null, side === 0 ? 'Blue corner' : 'Red corner'),
          h('div.name', null, cls.name),
          h('div.sub', null, cls.title),
        ),
        h('button.btn', { title: 'Randomize', onclick: () => { sfx.play('ui'); this.loadouts[side] = randomLoadout(); this.changed(); } }, '🎲'),
      ),
      h('div.classes', null, ...CLASS_IDS.map((id) =>
        h('button.class-btn' + (id === lo.classId ? '.sel' : ''), {
          style: { '--c': hex(CLASSES[id].color) },
          onclick: () => { sfx.play('ui'); this.loadouts[side] = { ...lo, classId: id }; this.changed(); },
        }, h('span.glyph', null, CLASS_GLYPH[id]), CLASSES[id].name),
      )),
      h('p.blurb', null, cls.blurb),
      h('div.stats', null,
        ...statRow('HP', stats.maxHp, 2400, String(Math.round(stats.maxHp))),
        ...statRow('Power', stats.power, 80, String(Math.round(stats.power))),
        ...statRow('Armor', stats.armor, 80, String(Math.round(stats.armor))),
        ...statRow('Speed', stats.attackSpeed * stats.moveSpeed, 6.5, stats.attackSpeed.toFixed(2) + 'x'),
      ),
      h('div.abilities', null, ...CLASS_ABILITIES[lo.classId].map((a) =>
        h('span.ability' + (a.slot === 'ultimate' ? '.ult' : ''), { title: a.desc }, a.name))),
      h('div.slots', null, ...[0, 1, 2].map((i) => {
        const id = lo.items[i];
        const it = id ? ITEMS[id] : null;
        return h('button.slot' + (it ? `.filled.r-${it.rarity}` : ''), {
          title: it ? `${it.name}: ${it.desc}` : 'Choose an item',
          onclick: () => { sfx.play('ui'); this.openPicker(side, i); },
        }, h('span.ico', null, it ? it.icon : '+'), it ? it.name : 'Empty');
      })),
    );
  }

  private openPicker(side: 0 | 1, slot: number): void {
    this.picker?.remove();
    const lo = this.loadouts[side];
    const close = () => { this.picker?.remove(); this.picker = null; };
    const choose = (id: ItemId | null) => {
      sfx.play('ui');
      const items = lo.items.slice();
      if (id) items[slot] = id; else items.splice(slot, 1);
      this.loadouts[side] = { ...lo, items: items.filter(Boolean).slice(0, MAX_ITEMS) };
      close();
      this.changed();
    };
    const wrap: HTMLDivElement = h<HTMLDivElement>('div.picker-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
      h('div.picker.glass', null,
        h('h3', null, `Choose gear — ${side === 0 ? 'Blue' : 'Red'} ${CLASSES[lo.classId].name}`),
        h('div.picker-grid', null,
          ...ITEM_IDS.map((id) => {
            const it = ITEMS[id];
            const taken = lo.items.includes(id) && lo.items[slot] !== id;
            return h(`button.item.r-${it.rarity}`, { disabled: taken, onclick: () => choose(id) },
              h('span.ico', null, it.icon), h('span.nm', null, it.name), h('span.ds', null, it.desc));
          }),
          lo.items[slot] ? h('button.item', { onclick: () => choose(null) }, h('span.ico', null, '✕'), h('span.nm', null, 'Remove'), h('span.ds', null, 'Leave this slot empty.')) : null,
        ),
      ),
    );
    this.picker = wrap;
    this.el.parentElement?.appendChild(wrap);
  }

  show(v: boolean): void {
    this.el.hidden = !v;
    if (!v) { this.picker?.remove(); this.picker = null; }
  }
}
