import { sfx } from '../audio/sfx';
import { FORMS, FORM_IDS } from '../sim/forms';
import { GEAR_SLOTS, SLOT_NAMES, gearIdsFor, gearOf } from '../sim/gear';
import {
  buildAbilities, computeBaseStats, randomBuild, withGear, type CharacterBuild,
} from '../sim/loadout';
import type { GearId, GearSlot } from '../sim/types';
import { h, hex } from './dom';
import { fmtMult } from './format';
import { emptySlotIcon } from './itemIcons';
import { skinStrip, wornIcon } from './skinIcons';
import { formIcon, icon, type IconName } from './icons';
import { canInstall, onInstallChange, promptInstall } from './install';
import { withSkin } from '../gear/skins';
import { ARENA_IDS, ARENA_NAMES, type ArenaId } from '../render/scene/arena';
import { NO_INSETS, type Insets, type Zoom } from '../render/camera';
import { pips } from './online';

export const ZOOM_LABEL: Record<Zoom, string> = { close: 'Close', normal: 'Normal', distant: 'Distant' };
export const ZOOM_ORDER: Zoom[] = ['close', 'normal', 'distant'];
const ARENA_ICON: Record<ArenaId, IconName> = { highlands: 'highlands', colosseum: 'colosseum' };

/** A corner's character: name, body form and six gear slots. */
export type Loadout = CharacterBuild;


export interface MenuSettings {
  quality: 'auto' | 'high' | 'medium' | 'low';
  sound: boolean;
  fps: boolean;
  /** The fighters' running commentary in the battle's bottom corner. */
  feed: boolean;
  arena: ArenaId;
  zoom: Zoom;
}

/** The pick screen of an online match: whose corner is whose, the score and the clock. */
export interface OnlinePick {
  you: 0 | 1;
  round: number;
  score: [number, number];
  ready: [boolean, boolean];
  /** performance.now() time the pick timer runs out (Infinity while it's frozen). */
  deadline: number;
}

export interface MenuCallbacks {
  onChange(loadouts: [Loadout, Loadout]): void;
  /** Open the character editor (name, form and look of the player's fighter). */
  onEditCharacter(): void;
  /** Replace the red corner with a newly generated rival. */
  onNewRival(): void;
  onFight(): void;
  onSettings(s: MenuSettings): void;
  onOnline(): void;
  /** Online pick: lock the build in, or unlock it to keep editing. */
  onReady(): void;
  onLeave(): void;
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
  private insetCache: Insets | null = null;
  /** Set while picking a build for an online round. */
  online: OnlinePick | null = null;
  private clockEl: HTMLElement | null = null;
  private clockShown = '';

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

  /** Which corner the phone-portrait layout opens on. */
  activeCorner(side: 0 | 1): void {
    this.activeSide = side;
  }

  /** The player's own corner: blue offline, whichever side they hold online. */
  private get mine(): 0 | 1 {
    return this.online?.you ?? 0;
  }

  render(): void {
    this.insetCache = null;
    const on = this.online;
    const tab = (side: 0 | 1) => h(`button.vs-tab.side-${side}` + (this.activeSide === side ? '.on' : ''), {
      role: 'tab', 'aria-selected': String(this.activeSide === side),
      onclick: () => { if (this.activeSide === side) return; sfx.play('ui'); this.activeSide = side; this.render(); },
    }, h('small', null, side === this.mine ? 'You' : on?.ready[side] ? 'Rival · Ready' : 'Rival'), h('span', null, this.loadouts[side].name));
    const settingsBtn = h('button.btn.icon-btn', { title: 'Settings', 'aria-label': 'Settings', onclick: () => { sfx.play('ui'); this.openSettings(); } },
      icon('settings', 'glyph'), h('span.lbl', null, 'Settings'));
    this.el.replaceChildren(
      on ? this.matchBar(on) : h('div.title', null, h('h1.wordmark', { 'aria-label': 'Clashborn' }, 'CLASH', h('em', null, 'BORN')), h('p', null, 'Auto Duel Arena')),
      this.vsTabs = h('div.vs-tabs', { role: 'tablist' }, tab(0), h('b', null, 'VS'), tab(1)),
      this.corner(0),
      this.corner(1),
      on
        ? h('div.menu-bottom.online', null,
          this.arenaRow(),
          settingsBtn,
          h('button.btn-fight.ready-btn' + (on.ready[on.you] ? '.locked' : ''), {
            title: on.ready[on.you] ? 'Locked in: tap to change your build' : 'Lock in this build',
            onclick: () => { sfx.play('ui'); this.cb.onReady(); },
          }, h('span.face', null, icon('check'), on.ready[on.you] ? 'LOCKED' : 'READY')),
          h('button.btn.icon-btn', { title: 'Leave match', 'aria-label': 'Leave match', onclick: () => { sfx.play('ui'); this.cb.onLeave(); } },
            icon('exit', 'glyph'), h('span.lbl', null, 'Leave')))
        : h('div.menu-bottom', null,
          this.arenaRow(),
          settingsBtn,
          h('button.btn.icon-btn', { title: 'Play online', 'aria-label': 'Play online', onclick: () => { sfx.play('ui'); this.cb.onOnline(); } },
            icon('globe', 'glyph'), h('span.lbl', null, 'Online')),
          h('button.btn-fight', { onclick: () => this.cb.onFight() }, h('span.face', null, icon('swords'), 'FIGHT')),
          h('button.btn.icon-btn', { title: 'New rival', 'aria-label': 'New rival', onclick: () => { sfx.play('ui'); this.cb.onNewRival(); } },
            icon('dice', 'glyph'), h('span.lbl', null, 'New rival')),
        ),
    );
    this.tick();
  }

  /** Online: score, round and pick clock where the wordmark usually sits. */
  private matchBar(on: OnlinePick): HTMLElement {
    const rival = on.you === 0 ? 1 : 0;
    const status = on.ready[on.you] && on.ready[rival] ? 'Fight!'
      : on.ready[on.you] ? 'Waiting for your rival'
        : on.ready[rival] ? 'Your rival is ready' : 'Pick your build';
    this.clockEl = h('b.mb-clock');
    this.clockShown = '';
    return h('div.title.match-title', null,
      h('div.match-bar', null,
        pips(0, on.score[0]),
        h('div.mb-mid', null, h('small', null, `Round ${on.round}`), this.clockEl),
        pips(1, on.score[1])),
      h('p', null, status));
  }

  /** Ticks the pick clock (cheap: writes only when the shown second changes). */
  tick(): void {
    const el = this.clockEl, on = this.online;
    if (!el || !on || this.el.hidden) return;
    const left = on.deadline === Infinity ? -1 : Math.max(0, Math.ceil((on.deadline - performance.now()) / 1000));
    const shown = left < 0 ? '–:––' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (shown === this.clockShown) return;
    this.clockShown = shown;
    el.textContent = shown;
    el.classList.toggle('low', left >= 0 && left <= 10 && !on.ready[on.you]);
  }

  /**
   * How much of each screen edge the menu covers, so the camera can frame the duel
   * in the space left over. Measured once per layout (call `relayout` on resize).
   */
  get insets(): Insets {
    if (this.el.hidden) return NO_INSETS;
    return this.insetCache ??= this.measure();
  }

  relayout(): void {
    this.insetCache = null;
  }

  private measure(): Insets {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    const corners = [...this.el.querySelectorAll<HTMLElement>('.corner')].filter((c) => c.offsetParent);
    const bottomRow = this.el.querySelector<HTMLElement>('.menu-bottom');
    const title = this.el.querySelector<HTMLElement>('.title h1, .title .match-bar');
    if (!W || !H || !corners.length || !bottomRow) return NO_INSETS;
    const rc = corners.map((c) => c.getBoundingClientRect());
    const t = (title?.getBoundingClientRect().bottom ?? 0) / H;
    // Phone portrait: one corner in a bottom sheet under the VS tabs.
    if (this.vsTabs?.offsetParent) return { l: 0, r: 0, t, b: 1 - this.vsTabs.getBoundingClientRect().top / H };
    // Corners along the bottom (narrow windows, tablets in portrait).
    const top = Math.min(...rc.map((r) => r.top));
    if (top > H * 0.3) return { l: 0, r: 0, t, b: 1 - top / H };
    // Corners down the sides: phones in landscape. Roomy desktops keep the full width.
    if (H > 560 || rc.length < 2) return NO_INSETS;
    return { l: rc[0].right / W, r: 1 - rc[1].left / W, t, b: 1 - bottomRow.getBoundingClientRect().top / H };
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
      }, icon(ARENA_ICON[id], 'glyph'), ARENA_NAMES[id])));
  }

  private openSettings(): void {
    const seg = <T extends string>(title: string, options: [T, string, IconName?][], cur: T, pick: (v: T) => void) =>
      h('section.set-row', null,
        h('h4', null, title),
        h('div.seg', null, ...options.map(([v, label, ic]) =>
          h('button.btn' + (v === cur ? '.on' : ''), { onclick: () => { if (v === cur) return; sfx.play('ui'); pick(v); draw(); } },
            ic ? icon(ic, 'glyph') : null, label))));
    const body = h('div.modal-body.set-body');
    const draw = () => {
      const s = this.settings;
      body.replaceChildren(
        seg('Arena', ARENA_IDS.map((id) => [id, ARENA_NAMES[id], ARENA_ICON[id]] as [ArenaId, string, IconName]), s.arena, (arena) => this.setSettings({ arena })),
        seg('Camera', ZOOM_ORDER.map((z) => [z, ZOOM_LABEL[z]] as [Zoom, string]), s.zoom, (zoom) => this.setSettings({ zoom })),
        seg('Graphics', [['auto', 'Auto'], ['high', 'High'], ['medium', 'Med'], ['low', 'Low']], s.quality, (quality) => this.setSettings({ quality })),
        seg('Sound', [['on', 'On', 'soundOn'], ['off', 'Off', 'soundOff']], s.sound ? 'on' : 'off', (v) => this.setSettings({ sound: v === 'on' })),
        seg('Battle feed', [['on', 'On'], ['off', 'Off']], s.feed ? 'on' : 'off', (v) => this.setSettings({ feed: v === 'on' })),
        seg('FPS counter', [['off', 'Off'], ['on', 'On']], s.fps ? 'on' : 'off', (v) => this.setSettings({ fps: v === 'on' })),
        // Only when the browser offers it (Chrome/Edge/Android, not yet installed).
        canInstall() ? h('section.set-row.set-install', null,
          h('h4', null, 'App'),
          h('button.btn.install-btn', { onclick: () => { sfx.play('ui'); void promptInstall(); } },
            icon('install', 'glyph'), 'Install Clashborn')) : '',
      );
    };
    draw();
    const off = onInstallChange(() => { if (body.isConnected) draw(); else off(); });
    this.openModal('Settings', body, 'modal.settings-modal');
  }

  /** A centred sheet over the menu with a title, a close button and a scrolling body. */
  private openModal(title: string, body: HTMLElement, cls = 'modal'): void {
    this.picker?.remove();
    const close = () => { sfx.play('ui'); this.closeModal(); };
    const wrap: HTMLDivElement = h<HTMLDivElement>('div.modal-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
      h(`div.${cls}.plate`, { role: 'dialog', 'aria-label': title },
        h('header.modal-head', null,
          h('h3', null, title),
          h('button.btn.close', { title: 'Close', 'aria-label': 'Close', onclick: close }, icon('close'))),
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
    const on = this.online;
    const mine = side === this.mine;
    // Online, only your own corner is yours to change, and only until you lock it in.
    const editable = !on || (mine && !on.ready[side]);
    const formRow = on ? mine : side === 1;
    const form = FORMS[lo.form];
    const stats = computeBaseStats(lo.form, lo.gear);
    const statRow = (label: string, v: number, max: number, shown: string) =>
      [h('span', null, label), h('div.bar', null, h('i', { style: { transform: `scaleX(${Math.min(1, v / max)})` } })), h('b', null, shown)];
    const set = (next: Loadout) => { sfx.play('ui'); this.loadouts[side] = next; this.changed(); };

    return h(`div.corner.plate.side-${side}` + (this.activeSide === side ? '.active' : ''), null,
      h('header', null,
        // The emblem is the way in: your fighter's editor, or the form (rival offline, yours online).
        h('button.medal' + (editable ? '' : '.ro'), {
          style: { '--c': hex(form.color) },
          title: !editable ? form.name : on || side === 1 ? `${form.name}: change the form` : `${form.name}: edit your fighter`,
          'aria-label': !editable ? form.name : on || side === 1 ? 'Change form' : 'Edit your fighter',
          onclick: () => {
            if (!editable) return;
            sfx.play('ui');
            if (!on && side === 0) this.cb.onEditCharacter(); else this.openFormPicker(side);
          },
        }, formIcon(lo.form), editable ? h('span.medal-badge', null, icon('edit')) : null),
        h('div.who', null,
          h('div.tag', null, on
            ? (mine ? `You · ${side === 0 ? 'Blue' : 'Red'} corner` : on.ready[side] ? 'Rival · Ready' : 'Rival · Picking')
            : side === 0 ? 'You · Blue corner' : 'Rival · Red corner'),
          h('div.name', null, lo.name),
          h('div.sub', null, `${form.name} · ${form.title}`),
        ),
        !on && side === 0
          ? h('button.btn.icon-btn.edit', { title: 'Edit your fighter', 'aria-label': 'Edit your fighter', onclick: () => { sfx.play('ui'); this.cb.onEditCharacter(); } },
            icon('edit', 'glyph'), h('span.lbl', null, 'Edit'))
          : null,
      ),
      // Offline your form is part of who your character is (it changes in the editor);
      // online every round is a fresh pick, form included.
      !formRow || !editable ? null : h('div.classes.forms', null, ...FORM_IDS.map((id) =>
        h('button.class-btn' + (id === lo.form ? '.sel' : ''), {
          style: { '--c': hex(FORMS[id].color) },
          title: `${FORMS[id].name}: ${FORMS[id].blurb}`,
          'aria-label': FORMS[id].name,
          onclick: () => set({ ...lo, form: id }),
        }, h('span.glyph', null, formIcon(id)), h('span.nm', null, FORMS[id].name)),
      )),
      h('p.blurb', null, on && !mine
        ? (on.round === 1 ? 'Their saved build. They can change everything before the fight; you see their pick when it starts.' : 'What they fought with last round. Their new pick shows when the fight starts.')
        : form.blurb),
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
        return h('button.slot' + (it ? `.filled.r-${it.rarity}` : '') + (editable ? '' : '.ro'), {
          title: it ? `${SLOT_NAMES[slot]} · ${it.name}: ${it.desc}` : editable ? `${SLOT_NAMES[slot]}: choose` : `${SLOT_NAMES[slot]}: empty`,
          tabindex: editable ? undefined : '-1',
          onclick: editable ? () => { sfx.play('ui'); this.openPicker(side, slot); } : undefined,
        }, h('span.slot-name', null, SLOT_NAMES[slot]), h('span.ico', null, id ? wornIcon(id, lo.skins) : emptySlotIcon(slot)), h('span.slot-item', null, it ? it.name : 'Empty'));
      })),
    );
  }

  /** A corner's body form, as a sheet (phones in landscape hide the inline choice). */
  private openFormPicker(side: 0 | 1): void {
    const lo = this.loadouts[side];
    const body = h('div.modal-body', null, h('div.classes.forms.form-sheet', null, ...FORM_IDS.map((id) =>
      h('button.class-btn' + (id === lo.form ? '.sel' : ''), {
        style: { '--c': hex(FORMS[id].color) },
        onclick: () => {
          sfx.play('ui');
          this.closeModal();
          if (id !== lo.form) { this.loadouts[side] = { ...lo, form: id }; this.changed(); }
        },
      }, h('span.glyph', null, formIcon(id)), h('span.nm', null, FORMS[id].name), h('small', null, FORMS[id].title)))));
    this.openModal(`Form · ${lo.name}`, body, `modal.form-modal.side-${side}`);
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
          ? h('button.item.remove', { onclick: () => choose(null) }, h('span.ico', null, icon('close')), h('span.nm', null, 'Remove'), h('span.ds', null, 'Leave this slot empty.'))
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
