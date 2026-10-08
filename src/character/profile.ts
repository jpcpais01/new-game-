import { randomSkins, validSkins } from '../gear/skins';
import { DEFAULT_BUILDS, gearIds, randomBuild, sanitizeBuild, type CharacterBuild } from '../sim/loadout';
import { randomAppearance, sanitizeAppearance, type Appearance } from './appearance';

/**
 * The player's one persistent character. It represents the player through all
 * progression (there are no interchangeable champions): name, body form, look
 * and the gear it carries. Stored locally.
 */
export interface PlayerCharacter extends CharacterBuild {
  look: Appearance;
}

/** Any fighter with a look: the player's character or a generated rival. */
export type Character = CharacterBuild & { look: Appearance };

const KEY = 'cb.character';
export const NAME_MAX = 16;

/** Trims, collapses whitespace and drops control characters and markup. */
export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function loadCharacter(): PlayerCharacter | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof o?.name === 'string' ? cleanName(o.name) : '';
    if (!name) return null;
    const b = sanitizeBuild(o, { ...DEFAULT_BUILDS[0], name });
    return { ...b, name, look: sanitizeAppearance(o.look), skins: validSkins(b.skins) };
  } catch {
    return null;
  }
}

export function saveCharacter(c: PlayerCharacter): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode: lives for this session only */ }
}

/**
 * Starting point for a brand-new character. Gear comes from an older blue-corner
 * loadout when there is one, so existing players keep what they had set up.
 */
export function newCharacter(previous?: CharacterBuild): PlayerCharacter {
  const base = previous ?? DEFAULT_BUILDS[0];
  return { name: '', form: 'balanced', gear: { ...base.gear }, look: { ...randomAppearance(), outfit: 'tunic' }, skins: {} };
}

const FIRST = [
  'Kael', 'Brisa', 'Vex', 'Ícaro', 'Nara', 'Orin', 'Selene', 'Draven', 'Lúcia', 'Thorne', 'Mara', 'Rui',
  'Zara', 'Bento', 'Irina', 'Kato', 'Leona', 'Duarte', 'Yara', 'Sven', 'Inês', 'Rook', 'Talia', 'Gil',
];
// First name + epithet always fits NAME_MAX (6 + 1 + 9).
const EPITHET = ['Ironhide', 'Ashfall', 'Stormborn', 'the Quick', 'Emberfang', 'Frostjaw', 'Duskblade', 'Stonefist', 'the Bold', 'Wildheart'];

export function randomName(r: () => number = Math.random): string {
  const f = FIRST[Math.floor(r() * FIRST.length)];
  return r() < 0.4 ? cleanName(`${f} ${EPITHET[Math.floor(r() * EPITHET.length)]}`) : f;
}

/** A generated rival: random name, form, gear and look. */
export function generateRival(avoidName?: string): Character {
  let name = randomName();
  for (let i = 0; i < 4 && name === avoidName; i++) name = randomName();
  const build = randomBuild();
  return { ...build, name, look: randomAppearance(), skins: randomSkins(gearIds(build.gear)) };
}
