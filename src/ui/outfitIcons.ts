import type { Appearance } from '../character/appearance';
import { OUTFIT_IDS, OUTFITS, type OutfitId } from '../character/outfits';
import { SKIN_THEMES } from '../gear/skins';
import { h, hex } from './dom';

/**
 * Picker art for character skins: an inked bust of each outfit on a disc of
 * its theme's glow, drawn as inline SVG like the rest of the UI icons. The
 * house outfit is drawn in the character's own colours.
 */

const INK = '#170f1d';
const TORSO = 'M11 62 C11 42 13 32 21 28.5 L27 25 L37 25 L43 28.5 C51 32 53 42 53 62 Z';
const NECK = 'M27 26 L27 15 Q32 12 37 15 L37 26 Z';

function art(id: OutfitId, look: Pick<Appearance, 'primary' | 'secondary' | 'skin'>): string {
  const skin = hex(look.skin);
  const neck = `<path d="${NECK}" fill="${skin}" stroke="${INK}" stroke-width="2"/>`;
  switch (id) {
    case 'tunic': {
      const main = hex(look.primary), trim = hex(look.secondary);
      return `${neck}<path d="${TORSO}" fill="${main}" stroke="${INK}" stroke-width="2.2"/>
        <path d="M27 25 L32 38 L37 25 Z" fill="${skin}"/>
        <path d="M26 25.5 L32 39 L38 25.5" fill="none" stroke="${trim}" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M32 39 L24 50" stroke="${trim}" stroke-width="1.8"/>
        <rect x="12" y="49" width="40" height="5.5" fill="${trim}" stroke="${INK}" stroke-width="1.6"/>
        <circle cx="39" cy="52" r="3.4" fill="${trim}" stroke="${INK}" stroke-width="1.6"/>`;
    }
    case 'warlord':
      return `${neck}<path d="${TORSO}" fill="#3d363b" stroke="${INK}" stroke-width="2.2"/>
        <path d="M24 18 L40 18 L41 27 L23 27 Z" fill="#2c262a" stroke="${INK}" stroke-width="1.8"/>
        <path d="M24 18.5 L40 18.5" stroke="#c08a3e" stroke-width="2"/>
        <path d="M21 34 L32 44 L43 34" fill="none" stroke="#ff6a1a" stroke-width="2.6" stroke-linejoin="round"/>
        <circle cx="32" cy="45" r="3.6" fill="#ffc23a" stroke="#ff6a1a" stroke-width="1.4"/>
        <path d="M15 51.5 H49 M14 56.5 H50" stroke="#ff6a1a" stroke-width="1.6"/>
        <path d="M12 60 V48 M52 60 V48" stroke="${INK}" stroke-width="1.4"/>
        <ellipse cx="14.5" cy="32" rx="9" ry="7.5" fill="#4a4248" stroke="${INK}" stroke-width="2"/>
        <ellipse cx="49.5" cy="32" rx="9" ry="7.5" fill="#4a4248" stroke="${INK}" stroke-width="2"/>
        <path d="M7 34.5 Q14.5 38 22 34.5 M42 34.5 Q49.5 38 57 34.5" fill="none" stroke="#ff6a1a" stroke-width="1.4"/>
        <path d="M11 27 Q6 20 9 11" fill="none" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/>
        <path d="M53 27 Q58 20 55 11" fill="none" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/>
        <path d="M11 27 Q6 20 9 11" fill="none" stroke="#2c262a" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M53 27 Q58 20 55 11" fill="none" stroke="#2c262a" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="9" cy="11.5" r="1.6" fill="#ffc23a"/><circle cx="55" cy="11.5" r="1.6" fill="#ffc23a"/>`;
    case 'warden':
      return `${neck}<path d="${TORSO}" fill="#c4d7ec" stroke="${INK}" stroke-width="2.2"/>
        <path d="M16 40 L28 52 M16 50 L26 60 M40 52 L50 42 M38 60 L50 48 M22 36 L34 48" stroke="#b9cde0" stroke-width="1.2"/>
        <path d="M32 31 V62" stroke="#4f8fc4" stroke-width="3"/>
        <path d="M47 30 L17 58" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
        <path d="M47 30 L17 58" stroke="#5a4436" stroke-width="4.6" stroke-linecap="round"/>
        <path d="M8 31 Q9 22 18 22 Q22 18 27 21 Q32 17 37 21 Q42 18 46 22 Q55 22 56 31 Q52 35 46 33 Q42 37 37 34 Q32 38 27 34 Q22 37 18 33 Q12 35 8 31 Z"
          fill="#f2efe8" stroke="${INK}" stroke-width="2"/>
        <path d="M14 27 Q16 25 19 26.5 M25 24.5 Q28 23 31 25 M36 25 Q39 23 42 24.5 M46 26.5 Q49 25 51 27" fill="none" stroke="#c9c4bc" stroke-width="1.3"/>
        <path d="M29 40 H35 M29 46 H35 M29 52 H35" stroke="#cfdbe8" stroke-width="2.4" stroke-linecap="round"/>
        <g stroke="#8fe6ff" stroke-width="1.8" stroke-linecap="round"><path d="M21 37 V45 M17.5 39 L24.5 43 M17.5 43 L24.5 39"/></g>
        <circle cx="21" cy="41" r="1.6" fill="#e8fbff"/>`;
    case 'runner':
      return `${neck}<path d="M26 26 L26 17 Q32 15 38 17 L38 26 Z" fill="#17171f" stroke="${INK}" stroke-width="1.8"/>
        <path d="M26.5 17.6 Q32 15.6 37.5 17.6" fill="none" stroke="#2ef2ff" stroke-width="1.8"/>
        <path d="${TORSO}" fill="#17171f" stroke="${INK}" stroke-width="2.2"/>
        <path d="M15.5 36 V62 M48.5 36 V62" stroke="#2ef2ff" stroke-width="1.8"/>
        <path d="M19 30 L45 30 L43 45 L32 52 L21 45 Z" fill="#2c2c38" stroke="#2ef2ff" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M22 37 L28 37 M36 37 L42 37" stroke="#17171f" stroke-width="1.4"/>
        <circle cx="32" cy="40" r="4" fill="#ff3ad6" stroke="${INK}" stroke-width="1.2"/>
        <circle cx="32" cy="40" r="1.6" fill="#ffd0f4"/>
        <path d="M12 57 H52" stroke="#ff3ad6" stroke-width="2"/>
        <path d="M13 31 L21 28.5 L22 34 L13.5 37 Z M51 31 L43 28.5 L42 34 L50.5 37 Z" fill="#2c2c38" stroke="${INK}" stroke-width="1.4"/>`;
  }
}

/** The bust of an outfit on its theme disc. */
export function outfitIcon(id: OutfitId, look: Pick<Appearance, 'primary' | 'secondary' | 'skin'>, className = 'item-icon'): HTMLElement {
  const def = OUTFITS[id];
  const glow = def.theme ? hex(SKIN_THEMES[def.theme].color) : hex(look.secondary);
  const el = h('span.' + className.split(' ').join('.'));
  el.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs><radialGradient id="og-${id}" cx="50%" cy="42%" r="55%"><stop offset="0" stop-color="${glow}" stop-opacity="0.55"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="32" cy="34" r="30" fill="url(#og-${id})"/>
    <g>${art(id, look)}</g></svg>`;
  return el;
}

/** The character-skin picker strip (creator Skins tab). */
export function outfitStrip(look: Appearance, onPick: (id: OutfitId) => void): HTMLElement {
  const opt = (id: OutfitId) => {
    const def = OUTFITS[id];
    return h('button.skin-opt.outfit-opt' + (look.outfit === id ? '.on' : ''), {
      style: { '--sc': def.theme ? hex(SKIN_THEMES[def.theme].color) : hex(look.secondary) },
      title: def.blurb,
      onclick: () => { if (look.outfit !== id) onPick(id); },
    }, outfitIcon(id, look), h('span', null, def.name));
  };
  return h('div.skin-strip', null, ...OUTFIT_IDS.map(opt));
}
