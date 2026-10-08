import { sfx } from '../audio/sfx';
import {
  BROW_STYLES, EYE_COLORS, EYE_STYLES, FACIAL_HAIR, HAIR_COLORS, HAIR_STYLES, JAW_STYLES, MARKINGS, MOUTH_STYLES,
  NOSE_STYLES, OUTFIT_COLORS, randomAppearance, SKIN_TONES, type Appearance,
} from '../character/appearance';
import { cleanName, NAME_MAX, randomName, type PlayerCharacter } from '../character/profile';
import { FORM_IDS, FORMS } from '../sim/forms';
import { GEAR_SLOTS, gearOf, SLOT_NAMES } from '../sim/gear';
import { SKIN_THEME_IDS, SKIN_THEMES, skinOf, skinsFor, withSkin, type SkinTheme } from '../gear/skins';
import { skinStrip } from './skinIcons';
import type { FormId, Stats } from '../sim/types';
import { FORM_GLYPH } from './menu';
import { h, hex } from './dom';

type Tab = 'form' | 'face' | 'hair' | 'colors' | 'skins';
const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'form', label: 'Form', glyph: '🧍' },
  { id: 'face', label: 'Face', glyph: '🙂' },
  { id: 'hair', label: 'Hair', glyph: '💇' },
  { id: 'colors', label: 'Colours', glyph: '🎨' },
  { id: 'skins', label: 'Skins', glyph: '✨' },
];

const LABELS: Record<string, string> = {
  short: 'Short', swept: 'Swept', spiky: 'Spiky', buzz: 'Buzz', ponytail: 'Ponytail', long: 'Long', bun: 'Bun',
  mohawk: 'Mohawk', braids: 'Braids', bald: 'Bald',
  round: 'Round', sharp: 'Sharp', narrow: 'Narrow', wide: 'Wide', glow: 'Glowing',
  soft: 'Soft', straight: 'Straight', angry: 'Fierce', thick: 'Thick', none: 'None',
  neutral: 'Calm', smile: 'Smile', grin: 'Grin', frown: 'Frown',
  button: 'Button', square: 'Square',
  stubble: 'Stubble', mustache: 'Moustache', goatee: 'Goatee', beard: 'Beard', braid: 'Braided',
  scar: 'Scar', warpaint: 'War paint', freckles: 'Freckles', tattoo: 'Rune',
};
const label = (v: string) => LABELS[v] ?? v[0].toUpperCase() + v.slice(1);

export interface CreatorCallbacks {
  /** Live preview: called on every change; `cheer` for big changes (form, randomise). */
  onPreview(p: PlayerCharacter, cheer?: boolean): void;
  /** Which part of the body the camera should frame. */
  onFocus(focus: 'body' | 'face'): void;
  onSave(p: PlayerCharacter): void;
  onCancel(): void;
}

/**
 * Character creation and editing. First launch opens it before anything else;
 * later it's reached from the menu to edit the one persistent character.
 */
export class Creator {
  readonly el: HTMLDivElement;
  private draft!: PlayerCharacter;
  private original: PlayerCharacter | null = null;
  private tab: Tab = 'form';
  private nameInput!: HTMLInputElement;
  private body!: HTMLDivElement;
  private tabsEl!: HTMLDivElement;
  /** The editing panel: a side panel on wide screens, a bottom sheet on phones in portrait. */
  panel: HTMLElement | null = null;

  constructor(private readonly cb: CreatorCallbacks) {
    this.el = h<HTMLDivElement>('div.creator');
    this.el.hidden = true;
  }

  /** Opens with a fresh draft (`firstTime`) or a copy of the existing character. */
  open(p: PlayerCharacter, firstTime: boolean): void {
    this.original = firstTime ? null : p;
    // A new fighter starts nameless: naming them is the first thing you do.
    this.draft = { ...p, name: firstTime ? '' : p.name, gear: { ...p.gear }, skins: { ...p.skins }, look: { ...p.look } };
    this.tab = 'form';
    this.build();
    this.el.hidden = false;
    this.cb.onFocus('body');
    this.cb.onPreview(this.draft);
    if (firstTime) setTimeout(() => this.nameInput.focus({ preventScroll: true }), 400);
  }

  close(): void {
    this.el.hidden = true;
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  private build(): void {
    const first = !this.original;
    this.nameInput = h<HTMLInputElement>('input.name-input', {
      type: 'text', maxlength: String(NAME_MAX), placeholder: 'Your fighter\'s name', value: this.draft.name,
      autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Name',
      oninput: () => { this.draft.name = this.nameInput.value.slice(0, NAME_MAX); this.nameInput.classList.remove('bad'); },
      onkeydown: (e: KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Enter') this.nameInput.blur(); },
      onblur: () => { this.draft.name = cleanName(this.nameInput.value); this.nameInput.value = this.draft.name; },
    });
    this.tabsEl = h<HTMLDivElement>('div.cr-tabs', { role: 'tablist' });
    this.body = h<HTMLDivElement>('div.cr-body');
    this.panel = h('div.cr-panel.glass', null,
        h('header.cr-head', null,
          h('div.cr-kicker', null, first ? 'A new challenger' : 'Your fighter'),
          h('h2', null, first ? 'Create your fighter' : 'Edit your fighter'),
          h('p.cr-sub', null, first
            ? 'One fighter, yours for good. Every weapon, power and piece of gear you earn will be theirs.'
            : 'Change the look or the body form. Your progress stays with you.'),
          h('div.name-row', null,
            this.nameInput,
            h('button.btn.dice', { title: 'Random name', 'aria-label': 'Random name', onclick: () => {
              sfx.play('ui');
              this.draft.name = randomName();
              this.nameInput.value = this.draft.name;
              this.nameInput.classList.remove('bad');
            } }, '🎲'),
          ),
        ),
        this.tabsEl,
        this.body,
        h('footer.cr-foot', null,
          h('button.btn.surprise', { title: 'Randomise look', 'aria-label': 'Randomise look', onclick: () => this.randomize() },
            h('span.glyph', null, '🎲'), h('span.lbl', null, 'Surprise me')),
          first ? null : h('button.btn', { onclick: () => { sfx.play('ui'); this.cb.onCancel(); } }, 'Cancel'),
          h('button.btn-fight.cr-go', { onclick: () => this.save() }, first ? 'BEGIN' : 'SAVE'),
        ),
      );
    this.el.replaceChildren(this.panel, h('div.cr-hint', null, 'Drag to turn'));
    this.renderTabs();
    this.renderBody();
  }

  private renderTabs(): void {
    this.tabsEl.replaceChildren(...TABS.map((t) =>
      h('button.cr-tab' + (t.id === this.tab ? '.on' : ''), {
        role: 'tab', 'aria-selected': String(t.id === this.tab),
        onclick: () => {
          if (this.tab === t.id) return;
          sfx.play('ui');
          this.tab = t.id;
          this.cb.onFocus(t.id === 'face' || t.id === 'hair' ? 'face' : 'body');
          this.renderTabs();
          this.renderBody();
        },
      }, h('span.glyph', null, t.glyph), t.label)));
  }

  private renderBody(): void {
    let content: (HTMLElement | null)[];
    switch (this.tab) {
      case 'form':
        content = [h('div.form-grid', null, ...FORM_IDS.map((id) => this.formCard(id)))];
        break;
      case 'face':
        content = [
          this.swatches('Skin', SKIN_TONES, 'skin'),
          this.chips('Eyes', EYE_STYLES, 'eyes'),
          this.swatches('Eye colour', EYE_COLORS, 'eyeColor'),
          this.chips('Brows', BROW_STYLES, 'brows'),
          this.chips('Nose', NOSE_STYLES, 'nose'),
          this.chips('Mouth', MOUTH_STYLES, 'mouth'),
          this.chips('Jaw', JAW_STYLES, 'jaw'),
          this.chips('Marks', MARKINGS, 'marking'),
        ];
        break;
      case 'hair':
        content = [
          this.chips('Style', HAIR_STYLES, 'hairStyle'),
          this.swatches('Colour', HAIR_COLORS, 'hairColor'),
          this.chips('Facial hair', FACIAL_HAIR, 'facialHair'),
        ];
        break;
      case 'colors':
        content = [
          this.swatches('Main colour', OUTFIT_COLORS, 'primary'),
          this.swatches('Trim colour', OUTFIT_COLORS, 'secondary'),
          h('p.cr-note', null, 'Outfit colours tint your clothes. Weapons and gear keep their own materials.'),
        ];
        break;
      case 'skins':
        content = this.skinRows();
        break;
    }
    const scroll = this.body.scrollTop;
    this.body.replaceChildren(...content.filter(Boolean) as HTMLElement[]);
    this.body.scrollTop = scroll;
  }

  private formCard(id: FormId): HTMLElement {
    const f = FORMS[id];
    const r = formRatings(id);
    const pips = (n: number) => h('span.pips', null, ...[1, 2, 3, 4, 5].map((i) => h('i' + (i <= n ? '.on' : ''))));
    return h('button.form-card' + (this.draft.form === id ? '.sel' : ''), {
      style: { '--fc': hex(f.color) },
      title: f.blurb,
      onclick: () => {
        if (this.draft.form === id) return;
        sfx.play('ui');
        this.draft.form = id;
        this.changed(true);
      },
    },
      h('div.fc-top', null, h('span.glyph', null, FORM_GLYPH[id]), h('span', null, h('b', null, f.name), h('small', null, f.title))),
      h('p', null, f.blurb),
      h('div.fc-stats', null,
        h('span', null, 'Health'), pips(r.hp),
        h('span', null, 'Power'), pips(r.power),
        h('span', null, 'Defence'), pips(r.defense),
        h('span', null, 'Speed'), pips(r.speed),
      ),
    );
  }

  private chips<K extends keyof Appearance>(title: string, options: readonly Appearance[K][], key: K, names: Record<string, string> = {}): HTMLElement {
    const cur = this.draft.look[key];
    return h('section.cr-row', null,
      h('h4', null, title),
      h('div.chips', null, ...options.map((o) =>
        h('button.chip-btn' + (o === cur ? '.on' : ''), {
          onclick: () => { if (this.draft.look[key] === o) return; sfx.play('ui'); this.draft.look[key] = o; this.changed(); },
        }, names[String(o)] ?? label(String(o))))),
    );
  }

  private swatches<K extends keyof Appearance>(title: string, colors: number[], key: K): HTMLElement {
    const cur = this.draft.look[key] as number;
    const custom = !colors.includes(cur);
    const picker = h<HTMLInputElement>('input', {
      type: 'color', value: hex(cur), 'aria-label': `${title}: custom`,
      oninput: () => { (this.draft.look[key] as number) = parseInt(picker.value.slice(1), 16); this.cb.onPreview(this.draft); },
      onchange: () => this.renderBody(),
    });
    return h('section.cr-row', null,
      h('h4', null, title),
      h('div.swatches', null,
        ...colors.map((c) => h('button.sw' + (c === cur ? '.on' : ''), {
          style: { '--c': hex(c) }, title: hex(c), 'aria-label': `${title} ${hex(c)}`,
          onclick: () => { if (cur === c) return; sfx.play('ui'); (this.draft.look[key] as number) = c; this.changed(); },
        })),
        h('label.sw.custom' + (custom ? '.on' : ''), { style: { '--c': hex(cur) }, title: 'Custom colour' }, picker),
      ),
    );
  }

  /** Skins tab: whole themed sets first, then a strip per equipped piece. */
  private skinRows(): (HTMLElement | null)[] {
    const gear = GEAR_SLOTS.map((slot) => this.draft.gear[slot]).filter((g) => g !== undefined);
    const skinnable = gear.filter((g) => skinsFor(g).length);
    if (!skinnable.length) return [h('p.cr-note', null, 'None of your gear has skins yet.')];
    const wearing = (t: SkinTheme | null) => skinnable.every((g) => {
      const s = skinOf(g, this.draft.skins);
      return t ? s?.theme === t || !skinsFor(g).some((k) => k.theme === t) : !s;
    });
    const wear = (t: SkinTheme | null) => {
      sfx.play('ui');
      let next = this.draft.skins;
      for (const g of skinnable) next = withSkin(next, g, t ? skinsFor(g).find((k) => k.theme === t)?.id ?? skinOf(g, next)?.id ?? null : null);
      this.draft.skins = next;
      this.changed(true);
    };
    const sets = SKIN_THEME_IDS.filter((t) => skinnable.some((g) => skinsFor(g).some((k) => k.theme === t)));
    return [
      h('section.cr-row', null,
        h('h4', null, 'Sets'),
        h('div.chips', null,
          h('button.chip-btn' + (wearing(null) ? '.on' : ''), { onclick: () => wear(null) }, 'Default'),
          ...sets.map((t) => h('button.chip-btn.theme-chip' + (wearing(t) ? '.on' : ''), {
            style: { '--sc': hex(SKIN_THEMES[t].color) }, title: SKIN_THEMES[t].blurb, onclick: () => wear(t),
          }, SKIN_THEMES[t].name)),
        ),
      ),
      ...GEAR_SLOTS.map((slot) => {
        const g = this.draft.gear[slot];
        const strip = g ? skinStrip(g, this.draft.skins, (id) => {
          sfx.play('ui');
          this.draft.skins = withSkin(this.draft.skins, g, id);
          this.changed();
        }) : null;
        return strip && g ? h('section.cr-row', null, h('h4', null, `${SLOT_NAMES[slot]} · ${gearOf(g).name}`), strip) : null;
      }),
      h('p.cr-note', null, 'Skins only change how gear looks. Stats and abilities stay the same.'),
    ];
  }

  private changed(cheer = false): void {
    this.cb.onPreview(this.draft, cheer);
    this.renderBody();
  }

  private randomize(): void {
    sfx.play('ui');
    this.draft.look = randomAppearance();
    this.changed(true);
  }

  private save(): void {
    const name = cleanName(this.nameInput.value);
    if (!name) {
      sfx.play('ui');
      this.nameInput.classList.remove('bad');
      void this.nameInput.offsetWidth;
      this.nameInput.classList.add('bad');
      this.nameInput.focus({ preventScroll: true });
      return;
    }
    this.draft.name = name;
    sfx.play('start');
    this.cb.onSave({ ...this.draft, skins: { ...this.draft.skins }, look: { ...this.draft.look } });
  }
}

/** 1..5 ratings for a form, relative to the other forms (for the creation cards). */
function formRatings(id: FormId): { hp: number; power: number; defense: number; speed: number } {
  const metric = {
    hp: (b: Stats) => b.maxHp,
    power: (b: Stats) => b.power * b.force * (1 + b.critChance * (b.critMult - 1)),
    defense: (b: Stats) => b.armor + b.resist + b.poise * 60,
    speed: (b: Stats) => b.moveSpeed * b.attackSpeed,
  };
  const out = {} as Record<keyof typeof metric, number>;
  for (const k of Object.keys(metric) as (keyof typeof metric)[]) {
    const vals = FORM_IDS.map((f) => metric[k](FORMS[f].base));
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const t = hi > lo ? (metric[k](FORMS[id].base) - lo) / (hi - lo) : 0.5;
    out[k] = 1 + Math.round(t * 4);
  }
  return out;
}
