import type { GearId } from '../sim/types';
import type { ItemArt } from './art';

/**
 * How every gear piece looks: which drawing/model it uses and its colours.
 * The 2D icon and the 3D model both read this, so they always match.
 */
export const ITEM_ART: Record<GearId, ItemArt> = {
  // Main weapons.
  longsword: { art: 'sword', metal: 'steel', tint: 0x6fc8ff },
  katana: { art: 'katana', metal: 'steel', cloth: 0xc8202e, tint: 0xff5a64 },
  warhammer: { art: 'warhammer', metal: 'steel', tint: 0xff8a2a, element: 'fire' },
  spear: { art: 'spear', metal: 'steel', cloth: 0xc8202e, tint: 0xe8f07a },
  twin_daggers: { art: 'twin_daggers', metal: 'steel', tint: 0x8cff3a, element: 'poison' },
  arcane_staff: { art: 'staff', metal: 'wood', tint: 0xb47aff, element: 'arcane' },
  longbow: { art: 'bow', metal: 'wood', cloth: 0xe8e0cc, tint: 0xfff2c8 },
  // Secondary weapons.
  throwing_knives: { art: 'throwing_knives', metal: 'steel', cloth: 0x2f5be0, tint: 0xcfd6e0 },
  hand_crossbow: { art: 'crossbow', metal: 'wood', tint: 0xffb070 },
  wind_chakram: { art: 'chakram', metal: 'steel', tint: 0x5effc8, element: 'wind' },
  frost_orb: { art: 'orb', metal: 'steel', tint: 0x7fe0ff, element: 'frost' },
  iron_gauntlet: { art: 'gauntlets', metal: 'steel', tint: 0xff6a3a },
  war_horn: { art: 'horn', metal: 'bone', tint: 0xff3020, cloth: 0xd12020 },
  // Defensive.
  tower_shield: { art: 'tower_shield', metal: 'steel', cloth: 0x2f5be0, tint: 0xffd36b, element: 'holy' },
  parrying_blade: { art: 'parrying_dagger', metal: 'steel', tint: 0xff4a58 },
  plate_armor: { art: 'plate_armor', metal: 'steel', tint: 0x6fc8ff },
  phase_cloak: { art: 'cloak', metal: 'gold', cloth: 0x1f4f7a, tint: 0x6ff3ff, element: 'arcane' },
  thornmail: { art: 'thorn_armor', metal: 'wood', tint: 0x58c46b, element: 'nature' },
  mirror_aegis: { art: 'mirror_shield', metal: 'gold', tint: 0xaff6ff, element: 'frost' },
  // Head.
  berserker_mask: { art: 'demon_mask', metal: 'dark', cloth: 0xb81c1c, tint: 0xff3020, element: 'blood' },
  iron_helm: { art: 'knight_helm', metal: 'steel', cloth: 0xc8202e, tint: 0x9aa4b8 },
  chrono_circlet: { art: 'circlet', metal: 'gold', tint: 0xc8a2ff, element: 'arcane' },
  executioner_hood: { art: 'hood', metal: 'dark', cloth: 0x2b2a36, tint: 0xff3a3a, element: 'blood' },
  storm_crown: { art: 'crown', metal: 'steel', tint: 0x9fd8ff, element: 'lightning' },
  duelist_band: { art: 'bandana', metal: 'gold', cloth: 0xc23040, tint: 0xf3c24f },
  // Boots.
  leather_boots: { art: 'leather_boots', metal: 'bronze', cloth: 0x6a4a2a, tint: 0xd9a060 },
  zephyr_boots: { art: 'winged_boots', metal: 'steel', tint: 0x5effc8, element: 'wind' },
  iron_greaves: { art: 'plate_greaves', metal: 'steel', tint: 0x6fc8ff },
  shadow_treads: { art: 'spiked_boots', metal: 'obsidian', tint: 0x9a4dff, element: 'shadow' },
  colossus_boots: { art: 'plate_greaves', metal: 'bronze', tint: 0xffa040 },
  leaping_boots: { art: 'cloud_boots', metal: 'gold', cloth: 0xe0a830, tint: 0xffe27a, element: 'wind' },
  // Specials.
  phoenix_feather: { art: 'feather', metal: 'gold', tint: 0xff9a2e, element: 'fire' },
  echo_stone: { art: 'relic_orb', metal: 'gold', tint: 0x6b8cff, element: 'arcane' },
  vampiric_fang: { art: 'fang', metal: 'bone', tint: 0xff2e55, element: 'blood' },
  ember_core: { art: 'core', metal: 'dark', tint: 0xff6a1a, element: 'fire' },
  frost_core: { art: 'core', metal: 'steel', tint: 0x7fe0ff, element: 'frost' },
  meteor_sigil: { art: 'sigil', metal: 'obsidian', tint: 0xff6a1a, element: 'fire' },
  judgment_relic: { art: 'holy_relic', metal: 'gold', tint: 0xffe08a, element: 'holy' },
  phantom_blade: { art: 'spectral_sword', metal: 'crystal', tint: 0xb0c8ff, element: 'arcane' },
  earth_heart: { art: 'heart', metal: 'bronze', tint: 0xff9a3a, element: 'nature' },
};

export function itemArt(id: GearId): ItemArt {
  return ITEM_ART[id];
}
