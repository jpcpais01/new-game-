import { sfx } from '../audio/sfx';
import { FORMS, FORM_IDS } from '../sim/forms';
import { GEAR_SLOTS, SLOT_NAMES, gearIdsFor, gearOf } from '../sim/gear';
import {
  buildAbilities, computeBaseStats, randomBuild, withGear, type CharacterBuild,
} from '../sim/loadout';
import type { FormId, GearId, GearSlot } from '../sim/types';
import { h, hex } from './dom';
import { fmtMult } from './format';
import { emptySlotIcon } from './itemIcons';
import { skinStrip, wornIcon } from './skinIcons';
import { withSkin } from '../gear/skins';
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
  /** Which corner the phone-portrait layout shows (both are shown everywhere else). */
  private activeSide: 0 | 1 = 0;
  private vsTabs: HTMLElement | null = null;

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
    const tab = (side: 0 | 1) => h(`button.vs-tab.side-${side}` + (this.activeSide === side ? '.on' : ''), {
      role: 'tab', 'aria-selected': String(this.activeSide === side),
      onclick: () => { if (this.activeSide === side) return; sfx.play('ui'); this.activeSide = side; this.render(); },
    }, h('small', null, side === 0 ? 'You' : 'Rival'), h('span', null, this.loadouts[side].name));
    this.el.replaceChildren(
      h('div.title', null, h('h1', null, 'CLASHBORN'), h('p', null, 'Auto Duel Arena')),
      this.vsTabs = h('div.vs-tabs', { role: 'tablist' }, tab(0), h('b', null, 'VS'), tab(1)),
      this.corner(0),
      this.corner(1),
      h('div.menu-bottom', null,
        this.arenaRow(),
        h('button.btn.icon-btn', { title: 'Settings', 'aria-label': 'Settings', onclick: () => { sfx.play('ui'); this.openSettings(); } },
          h('span.glyph', null, '⚙️'), h('span.lbl', null, 'Settings')),
        h('button.btn-fight', { onclick: () => this.cb.onFight() }, 'FIGHT'),
        h('button.btn.icon-btn', { title: 'New rival', 'aria-label': 'New rival', onclick: () => { sfx.play('ui'); this.cb.onNewRival(); } },
          h('span.glyph', null, '🎲'), h('span.lbl', null, 'New rival')),
      ),
    );
  }

  /** Share of the screen height the phone-portrait sheet covers from the bottom (0 in other layouts). */
  get bottomCover(): number {
    const tabs = this.vsTabs, hgt = this.el.clientHeight;
    if (this.el.hidden || !tabs?.offsetParent || !hgt) return 0;
    return 1 - tabs.offsetTop / hgt;
  }

  private setSettings(patch: Partial<MenuSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.cb.onSettings(this.settings);
    this.render();
  }

  /** Arena choice inline on roomy screens; phones pick it in the settings sheet. */
  private arenaRow(): HTMLElement {
    const s = this.settings;
    return h('div.arena-pick', null, ...ARENA_IDS.map((id) =>
      h('button.btn' + (s.arena === id ? '.on' : ''), {
        title: ARENA_NAMES[id],
        onclick: () => { if (s.arena === id) return; sfx.play('ui'); this.setSettings({ arena: id }); },
      }, h('span.glyph', null, ARENA_GLYPH[id]), ARENA_NAMES[id])));
  }

  private openSettings(): void {
    const seg = <T extends string>(title: string, options: [T, string][], cur: T, pick: (v: T) => void) =>
      h('section.set-row', null,
        h('h4', null, title),
        h('div.seg', null, ...options.map(([v, label]) =>
          h('button.btn' + (v === cur ? '.on' : ''), { onclick: () => { if (v === cur) return; sfx.play('ui'); pick(v); draw(); } }, label))));
    const body = h('div.modal-body.set-body');
    const draw = () => {
      const s = this.settings;
      body.replaceChildren(
        seg('Arena', ARENA_IDS.map((id) => [id, `${ARENA_GLYPH[id]} ${ARENA_NAMES[id]}`] as [ArenaId, string]), s.arena, (arena) => this.setSettings({ arena })),
        seg('Camera', ZOOM_ORDER.map((z) => [z, ZOOM_LABEL[z]] as [Zoom, string]), s.zoom, (zoom) => this.setSettings({ zoom })),
        seg('Graphics', [['auto', 'Auto'], ['high', 'High'], ['medium', 'Med'], ['low', 'Low']], s.quality, (quality) => this.setSettings({ quality })),
        seg('Sound', [['on', '🔊 On'], ['off', '🔇 Off']], s.sound ? 'on' : 'off', (v) => this.setSettings({ sound: v === 'on' })),
        seg('FPS counter', [['off', 'Off'], ['on', 'On']], s.fps ? 'on' : 'off', (v) => this.setSettings({ fps: v === 'on' })),
      );
    };
    draw();
    this.openModal('Settings', body, 'modal.settings-modal');
  }

  /** A centred sheet over the menu with a title, a close button and a scrolling body. */
  private openModal(title: string, body: HTMLElement, cls = 'modal'): void {
    this.picker?.remove();
    const close = () => { sfx.play('ui'); this.closeModal(); };
    const wrap: HTMLDivElement = h<HTMLDivElement>('div.modal-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
      h(`div.${cls}.glass`, { role: 'dialog', 'aria-label': title },
        h('header.modal-head', null,
          h('h3', null, title),
          h('button.btn.close', { title: 'Close', 'aria-label': 'Close', onclick: close }, '✕')),
        body,
      ),
    );
    this.picker = wrap;
    this.el.parentElement?.appendChild(wrap);
  }

  private closeModal(): void {
    this.picker?.remove();
    this.picker = null;
  }

  private corner(side: 0 | 1): HTMLElement {
    const lo = this.loadouts[side];
    const form = FORMS[lo.form];
    const stats = computeBaseStats(lo.form, lo.gear);
    const statRow = (label: string, v: number, max: number, shown: string) =>
      [h('span', null, label), h('div.bar', null, h('i', { style: { transform: `scaleX(${Math.min(1, v / max)})` } })), h('b', null, shown)];
    const set = (next: Loadout) => { sfx.play('ui'); this.loadouts[side] = next; this.changed(); };

    return h(`div.corner.glass.side-${side}` + (this.activeSide === side ? '.active' : ''), null,
      h('header', null,
        h('div', null,
          h('div.tag', null, side === 0 ? 'You · Blue corner' : 'Rival · Red corner'),
          h('div.name', null, lo.name),
          h('div.sub', null, `${form.name} · ${form.title}`),
        ),
        side === 0
          ? h('button.btn.icon-btn.edit', { title: 'Edit your fighter', 'aria-label': 'Edit your fighter', onclick: () => { sfx.play('ui'); this.cb.onEditCharacter(); } },
            h('span.glyph', null, '✎'), h('span.lbl', null, 'Edit'))
          : null,
      ),
      // Your form is part of who your character is: it changes in the editor.
      side === 0 ? null : h('div.classes.forms', null, ...FORM_IDS.map((id) =>
        h('button.class-btn' + (id === lo.form ? '.sel' : ''), {
          style: { '--c': hex(FORMS[id].color) },
          title: `${FORMS[id].name}: ${FORMS[id].blurb}`,
          'aria-label': FORMS[id].name,
          onclick: () => set({ ...lo, form: id }),
        }, h('span.glyph', null, FORM_GLYPH[id]), h('span.nm', null, FORMS[id].name)),
      )),
      h('p.blurb', null, form.blurb),
      h('div.stats', null,
        ...statRow('HP', stats.maxHp, 2400, String(Math.round(stats.maxHp))),
        ...statRow('Power', stats.power, 80, String(Math.round(stats.power))),
        ...statRow('Armor', stats.armor, 80, String(Math.round(stats.armor))),
        ...statRow('Resist', stats.resist, 80, String(Math.round(stats.resist))),
        ...statRow('Speed', stats.attackSpeed * stats.moveSpeed, 6.5, fmtMult(stats.attackSpeed)),
      ),
      h('div.abilities', null, ...buildAbilities(lo.gear).map((a) =>
        h('span.ability' + (a.slot === 'ultimate' ? '.ult' : ''), { title: a.desc }, a.name))),
      h('div.slots.gear-slots', null, ...GEAR_SLOTS.map((slot) => {
        const id = lo.gear[slot];
        const it = id ? gearOf(id) : null;
        return h('button.slot' + (it ? `.filled.r-${it.rarity}` : ''), {
          title: it ? `${SLOT_NAMES[slot]} · ${it.name}: ${it.desc}` : `${SLOT_NAMES[slot]}: choose`,
          onclick: () => { sfx.play('ui'); this.openPicker(side, slot); },
        }, h('span.slot-name', null, SLOT_NAMES[slot]), h('span.ico', null, id ? wornIcon(id, lo.skins) : emptySlotIcon(slot)), h('span.slot-item', null, it ? it.name : 'Empty'));
      })),
    );
  }

  private openPicker(side: 0 | 1, slot: GearSlot): void {
    const lo = this.loadouts[side];
    const choose = (id: GearId | null) => {
      sfx.play('ui');
      this.loadouts[side] = withGear(lo, slot, id);
      this.closeModal();
      this.changed();
    };
    const current = lo.gear[slot];
    // Skins of the equipped piece: picking one keeps the picker open so the
    // preview behind it updates.
    const strip = current ? skinStrip(current, lo.skins, (skin) => {
      sfx.play('ui');
      this.loadouts[side] = { ...lo, skins: withSkin(lo.skins, current, skin) };
      this.changed();
      this.openPicker(side, slot);
    }) : null;
    const body = h('div.modal-body', null,
      strip ? h('div.picker-skins', null, h('h4', null, `${gearOf(current!).name} skins`), strip) : null,
      h('div.picker-grid', null,
        ...gearIdsFor(slot).map((id) => {
          const it = gearOf(id);
          const grants = [...(it.abilities ?? []), ...(it.evade ? [it.evade] : [])].map((a) => a.name);
          return h(`button.item.r-${it.rarity}` + (id === current ? '.sel' : ''), { onclick: () => choose(id) },
            h('span.ico', null, wornIcon(id, lo.skins)), h('span.nm', null, it.name),
            h('span.ds', null, it.desc, grants.length ? h('em.grants', null, grants.join(' · ')) : null));
        }),
        current && slot !== 'main'
          ? h('button.item', { onclick: () => choose(null) }, h('span.ico', null, '✕'), h('span.nm', null, 'Remove'), h('span.ds', null, 'Leave this slot empty.'))
          : null,
      ),
    );
    this.openModal(`${SLOT_NAMES[slot]} · ${lo.name}`, body, 'modal.picker');
  }

  show(v: boolean): void {
    this.el.hidden = !v;
    if (!v) this.closeModal();
  }
}
