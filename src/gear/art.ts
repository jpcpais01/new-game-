// -----------------------------------------------------------------------------
// Item art vocabulary shared by the 2D icons (src/ui/itemIcons.ts) and the 3D
// gear models (src/render/gear). The simulation never imports this: an item
// only names an art key and a few colours, and both renderers draw from that.
// -----------------------------------------------------------------------------

import type { GearSlot } from '../sim/types';

export const ART_SLOTS: GearSlot[] = ['main', 'offhand', 'defense', 'head', 'boots', 'special'];

export const ART_WEAPONS = [
  'sword', 'greatsword', 'katana', 'rapier', 'dagger', 'axe', 'greataxe', 'mace', 'warhammer', 'flail',
  'spear', 'halberd', 'scythe', 'staff', 'wand', 'scepter', 'bow', 'crossbow', 'gauntlets', 'claws',
  'chakram', 'throwing_knives', 'tome', 'orb', 'torch', 'twin_daggers',
] as const;
export const ART_DEFENSIVE = [
  'buckler', 'round_shield', 'kite_shield', 'tower_shield', 'spiked_shield', 'mirror_shield',
  'plate_armor', 'chainmail', 'leather_vest', 'robe', 'cloak', 'bracers', 'thorn_armor', 'parrying_dagger',
] as const;
export const ART_HATS = [
  'knight_helm', 'horned_helm', 'hood', 'wizard_hat', 'crown', 'circlet', 'kasa', 'bandana', 'demon_mask',
  'feathered_cap', 'skull_helm',
] as const;
export const ART_BOOTS = ['plate_greaves', 'leather_boots', 'winged_boots', 'sandals', 'spiked_boots', 'cloud_boots'] as const;
export const ART_SPECIALS = [
  'amulet', 'ring', 'feather', 'hourglass', 'relic_orb', 'totem', 'vial', 'rune_stone', 'skull', 'horn',
  'lantern', 'mirror', 'fang', 'heart', 'belt', 'sigil', 'chain', 'core', 'holy_relic', 'spectral_sword',
] as const;

export type ArtKey =
  | typeof ART_WEAPONS[number] | typeof ART_DEFENSIVE[number] | typeof ART_HATS[number]
  | typeof ART_BOOTS[number] | typeof ART_SPECIALS[number];

export const ALL_ART: ArtKey[] = [...ART_WEAPONS, ...ART_DEFENSIVE, ...ART_HATS, ...ART_BOOTS, ...ART_SPECIALS];

/** Base material of the item's main body. */
export type Metal = 'steel' | 'gold' | 'bronze' | 'dark' | 'bone' | 'wood' | 'crystal' | 'obsidian';

/** Elemental flavour: drives glow colours, trails, impact sparks and auras. */
export type Element = 'none' | 'fire' | 'frost' | 'poison' | 'lightning' | 'arcane' | 'holy' | 'shadow' | 'blood' | 'nature' | 'wind';

export const ELEMENT_COLOR: Record<Element, number> = {
  none: 0xfff4dc, fire: 0xff6a1a, frost: 0x8fe6ff, poison: 0x8cff3a, lightning: 0xaedcff, arcane: 0xb47aff,
  holy: 0xffe27a, shadow: 0x9a4dff, blood: 0xff2e55, nature: 0x6ddc5a, wind: 0x5effc8,
};

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0xa9b0bf, uncommon: 0x6fdc7a, rare: 0x4da3ff, epic: 0xb46bff, legendary: 0xffa630,
};

/** How an item looks. Everything but `art` is optional. */
export interface ItemArt {
  art: ArtKey;
  /** Accent colour: gems, enchant glow, cloth trim. */
  tint?: number;
  /** Main material. Each art key has a sensible default. */
  metal?: Metal;
  /** Cloth / leather colour where the art has fabric (cloaks, hoods, wraps). */
  cloth?: number;
  element?: Element;
}

/** Fully resolved look (no optional fields). */
export interface ResolvedArt {
  art: ArtKey;
  tint: number;
  metal: Metal;
  cloth: number;
  element: Element;
}

export type WeaponFamily = 'blade' | 'heavy' | 'pole' | 'dagger' | 'staff' | 'bow' | 'fist' | 'thrown' | 'focus' | 'none';

/** Animation / VFX family of a weapon art. */
export const WEAPON_FAMILY: Partial<Record<ArtKey, WeaponFamily>> = {
  sword: 'blade', greatsword: 'heavy', katana: 'blade', rapier: 'blade', dagger: 'dagger', axe: 'blade',
  greataxe: 'heavy', mace: 'heavy', warhammer: 'heavy', flail: 'heavy', spear: 'pole', halberd: 'pole',
  scythe: 'pole', staff: 'staff', wand: 'focus', scepter: 'focus', bow: 'bow', crossbow: 'bow', gauntlets: 'fist',
  claws: 'fist', chakram: 'thrown', throwing_knives: 'thrown', tome: 'focus', orb: 'focus', torch: 'blade',
  twin_daggers: 'dagger', parrying_dagger: 'dagger',
};

export function weaponFamily(art: ArtKey): WeaponFamily {
  return WEAPON_FAMILY[art] ?? 'none';
}

/** Which slot an art key naturally belongs to (used for fallbacks and the gallery). */
export function slotOfArt(art: ArtKey): GearSlot {
  if ((ART_HATS as readonly string[]).includes(art)) return 'head';
  if ((ART_BOOTS as readonly string[]).includes(art)) return 'boots';
  if ((ART_SPECIALS as readonly string[]).includes(art)) return 'special';
  if ((ART_DEFENSIVE as readonly string[]).includes(art)) return 'defense';
  if (art === 'tome' || art === 'orb' || art === 'torch' || art === 'throwing_knives' || art === 'gauntlets' || art === 'crossbow' || art === 'chakram') return 'offhand';
  return 'main';
}

const DEFAULT_METAL: Partial<Record<ArtKey, Metal>> = {
  staff: 'wood', wand: 'wood', bow: 'wood', crossbow: 'wood', torch: 'wood', tome: 'gold', orb: 'gold',
  scepter: 'gold', crown: 'gold', circlet: 'gold', amulet: 'gold', ring: 'gold', hourglass: 'gold',
  relic_orb: 'gold', totem: 'wood', skull: 'bone', horn: 'bone', fang: 'bone', skull_helm: 'bone',
  leather_vest: 'bronze', hood: 'bronze', cloak: 'gold', robe: 'gold', bandana: 'steel', kasa: 'wood',
  wizard_hat: 'gold', feathered_cap: 'gold', leather_boots: 'bronze', sandals: 'bronze', cloud_boots: 'gold',
  winged_boots: 'gold', feather: 'gold', heart: 'gold', belt: 'gold', sigil: 'gold', rune_stone: 'obsidian',
  lantern: 'bronze', mirror: 'gold', vial: 'bronze', thorn_armor: 'wood', demon_mask: 'dark', scythe: 'dark',
  core: 'gold', holy_relic: 'gold', spectral_sword: 'crystal',
};

const DEFAULT_CLOTH: Partial<Record<ArtKey, number>> = {
  hood: 0x3a4a3a, cloak: 0x3d2596, robe: 0x4a2fa8, wizard_hat: 0x4a2fa8, bandana: 0xd6283c,
  feathered_cap: 0x2f6a5a, leather_vest: 0x7a4524, tome: 0x7a2a2a, kasa: 0xd6283c, totem: 0x9a3a22,
};

export function resolveArt(a: ItemArt, fallbackTint = 0xffd27a): ResolvedArt {
  const element = a.element ?? 'none';
  return {
    art: a.art,
    tint: a.tint ?? (element !== 'none' ? ELEMENT_COLOR[element] : fallbackTint),
    metal: a.metal ?? DEFAULT_METAL[a.art] ?? 'steel',
    cloth: a.cloth ?? DEFAULT_CLOTH[a.art] ?? 0x2f5be0,
    element,
  };
}
