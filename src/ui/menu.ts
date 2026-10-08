import { sfx } from '../audio/sfx';
import { FORMS, FORM_IDS } from '../sim/forms';
import { GEAR_SLOTS, SLOT_NAMES, gearIdsFor, gearOf } from '../sim/gear';
import {
  buildAbilities, computeBaseStats, randomBuild, withGear, type CharacterBuild,
} from '../sim/loadout';
import type { FormId, GearId, GearSlot } from '../sim/types';
import { h, hex } from './dom';
import { emptySlotIcon, gearIcon } from './itemIcons';
import { ARENA_IDS, ARENA_NAMES, type ArenaId } from '../render/scene/arena';
import type { Zoom } from '../render/camera';

export const ZOOM_LABEL: Record<Zoom, string> = { close: 'Close', normal: 'Normal', distant: 'Distant' };
export const ZOOM_ORDER: Zoom[] = ['close', 'normal', 'distant'];
const ARENA_GLYPH: Record<ArenaId, string> = { highlands: '🏔️', colosseum: '🏛️' };

/** A corner's character: name, body form and six gear slots. */
export type Loadout = CharacterBuild;

export const FORM_GLYPH: Record<FormId, string> = {
  robust: '🐻', agile: '🦊', balanced: '⚖️', slender: '🦒', mighty: '💪', ethereal: '🌙',
};


export interface MenuSettings {
  quality: 'auto' | 'high' | 'medium' | 'low';
  sound: boolean;
  fps: boolean;
  arena: ArenaId;
  zoom: Zoom;
}

export interface MenuCallbacks {
  onChange(loadouts: [Loadout, Loadout]): void;
  /** Open the character editor (name, form and look of the player's fighter). */
  onEditCharacter(): void;
  /** Replace the red corner with a newly generated rival. */
  onNewRival(): void;
  onFight(): void;
  onSettings(s: MenuSettings): void;
}

export function randomLoadout(): Loadout {
  return randomBuild();
}

/** Pre-battle loadout screen: form + six gear slots per corner, with the live 3D preview behind it. */
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
        this.arenaRow(),
        h('button.btn', { onclick: () => { sfx.play('ui'); this.cb.onNewRival(); } }, '🎲 New rival'),
        h('button.btn-fight', { onclick: () => this.cb.onFight() }, 'FIGHT'),
        this.settingsRow(),
      ),
    );
  }

  private arenaRow(): HTMLElement {
    const s = this.settings;
    return h('div.arena-pick', null, ...ARENA_IDS.map((id) =>
      h('button.btn' + (s.arena === id ? '.on' : ''), {
        title: ARENA_NAMES[id],
        onclick: () => { if (s.arena === id) return; sfx.play('ui'); this.settings = { ...s, arena: id }; this.cb.onSettings(this.settings); this.render(); },
      }, h('span.glyph', null, ARENA_GLYPH[id]), ARENA_NAMES[id])));
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
      h('button.btn', { title: 'Camera zoom (Z)', onclick: () => set({ zoom: ZOOM_ORDER[(ZOOM_ORDER.indexOf(s.zoom) + 1) % 3] }) }, `🔍 ${ZOOM_LABEL[s.zoom]}`),
      h('button.btn', { title: 'Sound', onclick: () => set({ sound: !s.sound }) }, s.sound ? '🔊' : '🔇'),
      h('button.btn' + (s.fps ? '.on' : ''), { title: 'Show FPS', onclick: () => set({ fps: !s.fps }) }, 'FPS'),
    );
  }

  private corner(side: 0 | 1): HTMLElement {
    const lo = this.loadouts[side];
    const form = FORMS[lo.form];
    const stats = computeBaseStats(lo.form, lo.gear);
    const statRow = (label: string, v: number, max: number, shown: string) =>
      [h('span', null, label), h('div.bar', null, h('i', { style: { transform: `scaleX(${Math.min(1, v / max)})` } })), h('b', null, shown)];
    const set = (next: Loadout) => { sfx.play('ui'); this.loadouts[side] = next; this.changed(); };

    return h(`div.corner.glass.side-${side}`, null,
      h('header', null,
        h('div', null,
          h('div.tag', null, side === 0 ? 'You · Blue corner' : 'Rival · Red corner'),
          h('div.name', null, lo.name),
          h('div.sub', null, `${form.name} · ${form.title}`),
        ),
        side === 0
          ? h('button.btn', { title: 'Edit your fighter', onclick: () => { sfx.play('ui'); this.cb.onEditCharacter(); } }, '✎ Edit')
          : h('button.btn', { title: 'New rival', onclick: () => { sfx.play('ui'); this.cb.onNewRival(); } }, '🎲'),
      ),
      // Your form is part of who your character is: it changes in the editor.
      side === 0 ? null : h('div.classes.forms', null, ...FORM_IDS.map((id) =>
        h('button.class-btn' + (id === lo.form ? '.sel' : ''), {
          style: { '--c': hex(FORMS[id].color) },
          title: FORMS[id].blurb,
          onclick: () => set({ ...lo, form: id }),
        }, h('span.glyph', null, FORM_GLYPH[id]), FORMS[id].name),
      )),
      h('p.blurb', null, form.blurb),
      h('div.stats', null,
        ...statRow('HP', stats.maxHp, 2400, String(Math.round(stats.maxHp))),
        ...statRow('Power', stats.power, 80, String(Math.round(stats.power))),
        ...statRow('Armor', stats.armor, 80, String(Math.round(stats.armor))),
        ...statRow('Resist', stats.resist, 80, String(Math.round(stats.resist))),
        ...statRow('Speed', stats.attackSpeed * stats.moveSpeed, 6.5, stats.attackSpeed.toFixed(2) + 'x'),
      ),
      h('div.abilities', null, ...buildAbilities(lo.gear).map((a) =>
        h('span.ability' + (a.slot === 'ultimate' ? '.ult' : ''), { title: a.desc }, a.name))),
      h('div.slots.gear-slots', null, ...GEAR_SLOTS.map((slot) => {
        const id = lo.gear[slot];
        const it = id ? gearOf(id) : null;
        return h('button.slot' + (it ? `.filled.r-${it.rarity}` : ''), {
          title: it ? `${SLOT_NAMES[slot]} · ${it.name}: ${it.desc}` : `${SLOT_NAMES[slot]}: choose`,
          onclick: () => { sfx.play('ui'); this.openPicker(side, slot); },
        }, h('span.slot-name', null, SLOT_NAMES[slot]), h('span.ico', null, id ? gearIcon(id) : emptySlotIcon(slot)), it ? it.name : 'Empty');
      })),
    );
  }

  private openPicker(side: 0 | 1, slot: GearSlot): void {
    this.picker?.remove();
    const lo = this.loadouts[side];
    const close = () => { this.picker?.remove(); this.picker = null; };
    const choose = (id: GearId | null) => {
      sfx.play('ui');
      this.loadouts[side] = withGear(lo, slot, id);
      close();
      this.changed();
    };
    const current = lo.gear[slot];
    const wrap: HTMLDivElement = h<HTMLDivElement>('div.picker-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
      h('div.picker.glass', null,
        h('h3', null, `${SLOT_NAMES[slot]} — ${lo.name}`),
        h('div.picker-grid', null,
          ...gearIdsFor(slot).map((id) => {
            const it = gearOf(id);
            const grants = [...(it.abilities ?? []), ...(it.evade ? [it.evade] : [])].map((a) => a.name);
            return h(`button.item.r-${it.rarity}` + (id === current ? '.sel' : ''), { onclick: () => choose(id) },
              h('span.ico', null, gearIcon(id)), h('span.nm', null, it.name),
              h('span.ds', null, it.desc, grants.length ? h('em.grants', null, grants.join(' · ')) : null));
          }),
          current && slot !== 'main'
            ? h('button.item', { onclick: () => choose(null) }, h('span.ico', null, '✕'), h('span.nm', null, 'Remove'), h('span.ds', null, 'Leave this slot empty.'))
            : null,
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
