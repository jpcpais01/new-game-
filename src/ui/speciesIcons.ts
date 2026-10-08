import type { Appearance } from '../character/appearance';
import { SPECIES, type SpeciesId } from '../character/species';
import { h, hex } from './dom';

/**
 * Creator portraits of the species: an inked head of each creature, drawn as
 * inline SVG in the house line style. The chosen species is drawn in the
 * character's own colours, the others in their species' defaults.
 */

const INK = '#170f1d';
const S = `stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;

const ch = (c: number, k: number) => {
  const f = (v: number) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return hex((f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255));
};

/** A pair of big anime eyes: white, iris, pupil and a catch light. */
function eyes(y: number, dx: number, r: number, iris: string, sclera = '#fbf8f4', cx = 32): string {
  return [-1, 1].map((s) => {
    const x = cx + s * dx;
    return `<ellipse cx="${x}" cy="${y}" rx="${r * 0.85}" ry="${r}" fill="${sclera}" ${S}/>
      <ellipse cx="${x + s * 0.3}" cy="${y + r * 0.12}" rx="${r * 0.6}" ry="${r * 0.78}" fill="${iris}"/>
      <ellipse cx="${x + s * 0.3}" cy="${y + r * 0.2}" rx="${r * 0.3}" ry="${r * 0.42}" fill="${INK}"/>
      <circle cx="${x + s * 0.3 - r * 0.25}" cy="${y - r * 0.32}" r="${r * 0.24}" fill="#fff"/>`;
  }).join('');
}

function art(id: SpeciesId, skin: number, hair: number, iris: number): string {
  const sk = hex(skin), dk = ch(skin, -0.32), lt = ch(skin, 0.55), hr = hex(hair), ir = hex(iris);
  switch (id) {
    case 'kitsu':
      return `<path d="M20 27 L15 5 L29 20 Z M44 27 L49 5 L35 20 Z" fill="${sk}" ${S}/>
        <path d="M19.5 22 L16.5 9 L25 19 Z M44.5 22 L47.5 9 L39 19 Z" fill="#f2a0aa"/>
        <path d="M15.6 9 L15 5 L18.6 8.5 Z M48.4 9 L49 5 L45.4 8.5 Z" fill="${INK}"/>
        <path d="M17 38 L9 46 L19 44 L13 51 L23 47 Z M47 38 L55 46 L45 44 L51 51 L41 47 Z" fill="${lt}" ${S}/>
        <circle cx="32" cy="35" r="15.5" fill="${sk}" ${S}/>
        <path d="M24 43 Q32 39 40 43 Q40 51 32 52 Q24 51 24 43 Z" fill="${lt}" ${S}/>
        <ellipse cx="32" cy="42.5" rx="2.6" ry="2" fill="${INK}"/>
        <path d="M29 47 Q32 49 35 47" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
        ${eyes(34, 7.2, 4, ir)}`;
    case 'ogrin':
      return `<path d="M21 26 L17 13 L27 22 Z M43 26 L47 13 L37 22 Z" fill="#eadcbc" ${S}/>
        <path d="M13 37 L3 30 L12 42 Z M51 37 L61 30 L52 42 Z" fill="${sk}" ${S}/>
        <path d="M12 36 Q12 21 32 21 Q52 21 52 36 Q53 47 46 52 Q32 57 18 52 Q11 47 12 36 Z" fill="${sk}" ${S}/>
        <path d="M18 31 Q32 26 46 31" fill="none" stroke="${dk}" stroke-width="2.6" stroke-linecap="round"/>
        <ellipse cx="32" cy="40" rx="5.5" ry="3.2" fill="${dk}" ${S}/>
        <path d="M21 48 Q32 44 43 48" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
        <path d="M23 48 L24 42 L26.5 47.5 Z M41 48 L40 42 L37.5 47.5 Z" fill="#f6efdc" ${S}/>
        ${eyes(34, 8.5, 2.9, ir, '#f6f0d8')}`;
    case 'wisp': {
      const g = hex(hair);
      return `<path d="M20 33 L3 19 L19 39 Z M44 33 L61 19 L45 39 Z" fill="${sk}" ${S}/>
        <path d="M20 41 L7 41 L20 45 Z M44 41 L57 41 L44 45 Z" fill="${sk}" ${S}/>
        <path d="M18 22 Q20 4 30 12 Q32 2 37 12 Q46 5 46 22 Z" fill="${g}" ${S}/>
        <path d="M32 54 Q19 50 19 34 Q19 18 32 18 Q45 18 45 34 Q45 50 32 54 Z" fill="${sk}" ${S}/>
        <path d="M30 22 L32 19 L34 22 L32 25 Z" fill="${g}"/>
        <path d="M23 41 L22 47 M41 41 L42 47" stroke="${g}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M29.5 48 Q32 49.5 34.5 48" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
        ${eyes(35, 6.6, 4.6, ir, '#f4fbff')}`;
    }
    case 'lop':
      return `<path d="M17 18 Q6 26 7 48 Q9 58 15 56 Q20 52 20 34 Z M47 18 Q58 26 57 48 Q55 58 49 56 Q44 52 44 34 Z" fill="${sk}" ${S}/>
        <path d="M14 30 Q10 40 12 50 Q14 53 16 50 Q18 42 17 31 Z M50 30 Q54 40 52 50 Q50 53 48 50 Q46 42 47 31 Z" fill="#f2b8c0"/>
        <circle cx="32" cy="34" r="18" fill="${sk}" ${S}/>
        <path d="M24 13 Q30 9 34 14 Q38 9 42 16" fill="none" stroke="${hr}" stroke-width="4" stroke-linecap="round"/>
        <ellipse cx="21" cy="43" rx="4" ry="2.4" fill="#f2a0aa" opacity="0.6"/><ellipse cx="43" cy="43" rx="4" ry="2.4" fill="#f2a0aa" opacity="0.6"/>
        <ellipse cx="32" cy="41" rx="2" ry="1.4" fill="#e88a9a"/>
        <path d="M28.5 45 Q32 47.5 35.5 45" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
        <rect x="30.2" y="46" width="3.6" height="3.6" rx="0.8" fill="#fff" ${S} stroke-width="1.2"/>
        ${eyes(35, 7.6, 5.2, ir)}`;
    case 'imp':
      return `<path d="M25 23 Q20 10 9 8 Q16 12 18 20 Z M39 23 Q44 10 55 8 Q48 12 46 20 Z" fill="${ch(skin, -0.75)}" ${S}/>
        <path d="M19 36 L1 30 L19 42 Z M45 36 L63 30 L45 42 Z" fill="${sk}" ${S}/>
        <path d="M18 34 Q18 20 32 20 Q46 20 46 34 Q46 46 32 57 Q18 46 18 34 Z" fill="${sk}" ${S}/>
        <path d="M24 29 L29 31 M40 29 L35 31" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M24 44 Q32 50 40 43" fill="#3a1418" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M27 45.5 L28 48.5 L29.2 46.3 Z M37 45.3 L36 48.3 L34.8 46.1 Z" fill="#fff"/>
        ${eyes(36, 6.6, 3.6, ir, '#ffe9a0')}`;
    case 'golem': {
      const g = hex(hair);
      return `<path d="M26 22 L23 6 L30 20 Z M33 21 L36 3 L39 21 Z M40 23 L47 11 L44 25 Z" fill="${g}" ${S}/>
        <path d="M14 30 Q14 22 22 22 L42 22 Q50 22 50 30 L50 48 Q50 56 42 56 L22 56 Q14 56 14 48 Z" fill="${sk}" ${S}/>
        <path d="M14 31 L50 31 L48 37 L16 37 Z" fill="${dk}" ${S}/>
        <path d="M21 34.5 L28 34.5 M36 34.5 L43 34.5" stroke="${hex(iris)}" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M44 41 L39 46 L41 51 M19 44 L23 47" fill="none" stroke="${dk}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M26 49 L38 49" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
    }
  }
}

/** The portrait of a species on a soft disc of its colour. */
export function speciesIcon(id: SpeciesId, look?: Pick<Appearance, 'species' | 'skin' | 'hairColor' | 'eyeColor'>, className = 'item-icon'): HTMLElement {
  const sp = SPECIES[id];
  const own = look && look.species === id;
  const skin = own ? look.skin : sp.skins[0];
  const hair = own ? look.hairColor : sp.hair[0];
  const iris = own ? look.eyeColor : sp.eyes;
  const el = h('span.' + className.split(' ').join('.'));
  el.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs><radialGradient id="sg-${id}" cx="50%" cy="50%" r="55%"><stop offset="0" stop-color="${hex(skin)}" stop-opacity="0.45"/><stop offset="1" stop-color="${hex(skin)}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="32" cy="34" r="30" fill="url(#sg-${id})"/>
    <g>${art(id, skin, hair, iris)}</g></svg>`;
  return el;
}
