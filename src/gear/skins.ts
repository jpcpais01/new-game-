import type { GearId } from '../sim/types';
import type { SkinChoice } from '../sim/loadout';
import { type ItemArt } from './art';
import { ITEM_ART } from './itemArt';

// -----------------------------------------------------------------------------
// Item skins: cosmetic variants of a gear piece. A skin swaps the item's 3D
// model, icon and effect colours; it never changes stats or abilities, so the
// simulation only carries the chosen ids along for the renderer.
//
// Skins come in themed sets: every theme has one look language (materials,
// glow colour, silhouette motifs) shared by its pieces, so wearing a whole
// set reads as one outfit.
// -----------------------------------------------------------------------------

export type SkinTheme = 'hellforge' | 'rimeborn' | 'dawnbringer' | 'voidborne' | 'wildwood' | 'neon';

export interface SkinThemeDef {
  id: SkinTheme;
  name: string;
  blurb: string;
  /** Signature glow colour (icon frame ornaments, UI accents). */
  color: number;
  /** Second accent, for themes with a two-tone glow. */
  color2: number;
}

export const SKIN_THEMES: Record<SkinTheme, SkinThemeDef> = {
  hellforge: { id: 'hellforge', name: 'Hellforge', blurb: 'Black iron quenched in living magma.', color: 0xff6a1a, color2: 0xffd04a },
  rimeborn: { id: 'rimeborn', name: 'Rimeborn', blurb: 'Carved from the heart of a glacier.', color: 0x8fe6ff, color2: 0xe8fbff },
  dawnbringer: { id: 'dawnbringer', name: 'Dawnbringer', blurb: 'White enamel, sunlit gold and a halo of light.', color: 0xffd76a, color2: 0xfff6d8 },
  voidborne: { id: 'voidborne', name: 'Voidborne', blurb: 'Forged where the stars went out.', color: 0xa45cff, color2: 0xff4fd8 },
  wildwood: { id: 'wildwood', name: 'Wildwood', blurb: 'Grown, not made: living wood, moss and bloom.', color: 0x7ee05a, color2: 0xff9ac8 },
  neon: { id: 'neon', name: 'Neon Circuit', blurb: 'Black chrome running with light.', color: 0x2ef2ff, color2: 0xff3ad6 },
};

export const SKIN_THEME_IDS = Object.keys(SKIN_THEMES) as SkinTheme[];

export interface SkinDef {
  id: string;
  gear: GearId;
  theme: SkinTheme;
  name: string;
  /** Overrides merged onto the item's own art (colours, material, element of its effects). */
  art: Partial<ItemArt>;
}

const S = (id: string, gear: GearId, theme: SkinTheme, name: string, art: Partial<ItemArt>): SkinDef => ({ id, gear, theme, name, art });

export const SKINS: SkinDef[] = [
  // Hellforge: obsidian iron, molten seams, horns and embers.
  S('hellforge_longsword', 'longsword', 'hellforge', 'Hellforge Blade', { metal: 'obsidian', tint: 0xff6a1a, element: 'fire' }),
  S('hellforge_warhammer', 'warhammer', 'hellforge', 'Magma Maul', { metal: 'obsidian', tint: 0xff5a10, element: 'fire' }),
  S('hellforge_gauntlet', 'iron_gauntlet', 'hellforge', 'Furnace Fist', { metal: 'obsidian', tint: 0xff6a1a, element: 'fire' }),
  S('hellforge_plate', 'plate_armor', 'hellforge', 'Hellforge Plate', { metal: 'obsidian', tint: 0xff6a1a, cloth: 0x5a1a12, element: 'fire' }),
  S('hellforge_helm', 'iron_helm', 'hellforge', 'Hellforge Helm', { metal: 'obsidian', tint: 0xff6a1a, cloth: 0xff7a1a, element: 'fire' }),
  S('hellforge_greaves', 'iron_greaves', 'hellforge', 'Cinder Greaves', { metal: 'obsidian', tint: 0xff6a1a, element: 'fire' }),
  S('hellforge_core', 'ember_core', 'hellforge', 'Forgeheart', { metal: 'obsidian', tint: 0xff7a1a, element: 'fire' }),

  // Rimeborn: glacier ice, frosted silver, snowflakes.
  S('rimeborn_katana', 'katana', 'rimeborn', 'Rimefang', { metal: 'crystal', tint: 0x8fe6ff, cloth: 0xe8f4ff, element: 'frost' }),
  S('rimeborn_spear', 'spear', 'rimeborn', 'Glacier Lance', { metal: 'crystal', tint: 0x8fe6ff, cloth: 0xd8ecff, element: 'frost' }),
  S('rimeborn_orb', 'frost_orb', 'rimeborn', "Winter's Eye", { metal: 'crystal', tint: 0x9fe9ff, element: 'frost' }),
  S('rimeborn_aegis', 'mirror_aegis', 'rimeborn', 'Frozen Aegis', { metal: 'crystal', tint: 0x8fe6ff, element: 'frost' }),
  S('rimeborn_circlet', 'chrono_circlet', 'rimeborn', 'Icicle Crown', { metal: 'crystal', tint: 0x9fe9ff, element: 'frost' }),
  S('rimeborn_boots', 'leather_boots', 'rimeborn', 'Snowstriders', { metal: 'steel', tint: 0x8fe6ff, cloth: 0xf2f6ff, element: 'frost' }),
  S('rimeborn_core', 'frost_core', 'rimeborn', 'Heart of Winter', { metal: 'crystal', tint: 0x8fe6ff, element: 'frost' }),

  // Dawnbringer: white enamel, gold, sunbursts, wings and halos.
  S('dawn_longsword', 'longsword', 'dawnbringer', 'Dawnbringer', { metal: 'gold', tint: 0xffe27a, element: 'holy' }),
  S('dawn_tower', 'tower_shield', 'dawnbringer', 'Sunwall', { metal: 'gold', tint: 0xffe27a, cloth: 0xf4efe4, element: 'holy' }),
  S('dawn_plate', 'plate_armor', 'dawnbringer', 'Seraph Plate', { metal: 'gold', tint: 0xffe27a, cloth: 0xf4efe4, element: 'holy' }),
  S('dawn_crown', 'storm_crown', 'dawnbringer', 'Halo of Dawn', { metal: 'gold', tint: 0xffe27a, element: 'holy' }),
  S('dawn_boots', 'zephyr_boots', 'dawnbringer', 'Seraph Steps', { metal: 'gold', tint: 0xfff0b0, cloth: 0xf4efe4, element: 'holy' }),
  S('dawn_relic', 'judgment_relic', 'dawnbringer', 'Sunfall Relic', { metal: 'gold', tint: 0xffd76a, element: 'holy' }),

  // Voidborne: black-violet glass, starfields, floating shards.
  S('void_katana', 'katana', 'voidborne', 'Eclipse', { metal: 'obsidian', tint: 0xb46bff, cloth: 0x1a1430, element: 'shadow' }),
  S('void_daggers', 'twin_daggers', 'voidborne', 'Void Fangs', { metal: 'obsidian', tint: 0xc07aff, element: 'shadow' }),
  S('void_cloak', 'phase_cloak', 'voidborne', 'Riftcloak', { metal: 'obsidian', tint: 0xc07aff, cloth: 0x15102a, element: 'shadow' }),
  S('void_hood', 'executioner_hood', 'voidborne', 'Voidgaze Hood', { metal: 'obsidian', tint: 0xd08aff, cloth: 0x1c1634, element: 'shadow' }),
  S('void_treads', 'shadow_treads', 'voidborne', 'Riftwalkers', { metal: 'obsidian', tint: 0xc07aff, element: 'shadow' }),
  S('void_blade', 'phantom_blade', 'voidborne', 'Abyssal Edge', { metal: 'obsidian', tint: 0xb46bff, element: 'shadow' }),

  // Wildwood: living wood, leaves, moss and blossoms.
  S('wild_bow', 'longbow', 'wildwood', 'Elderbough', { metal: 'wood', tint: 0x7ee05a, cloth: 0x4c8a3a, element: 'nature' }),
  S('wild_staff', 'arcane_staff', 'wildwood', 'Worldroot', { metal: 'wood', tint: 0x9cff6a, element: 'nature' }),
  S('wild_thorn', 'thornmail', 'wildwood', 'Bloomguard', { metal: 'wood', tint: 0xff9ac8, element: 'nature' }),
  S('wild_band', 'duelist_band', 'wildwood', 'Laurel of the Grove', { metal: 'gold', tint: 0x7ee05a, cloth: 0x4c8a3a, element: 'nature' }),
  S('wild_boots', 'leaping_boots', 'wildwood', 'Mossleapers', { metal: 'wood', tint: 0x7ee05a, cloth: 0x4c7a34, element: 'nature' }),
  S('wild_heart', 'earth_heart', 'wildwood', 'Heartseed', { metal: 'wood', tint: 0x9cff6a, element: 'nature' }),

  // Neon Circuit: black chrome, cyan and magenta light, hard-surface panels.
  S('neon_katana', 'katana', 'neon', 'Neon Edge', { metal: 'dark', tint: 0x2ef2ff, cloth: 0x15161f, element: 'lightning' }),
  S('neon_crossbow', 'hand_crossbow', 'neon', 'Arc Repeater', { metal: 'dark', tint: 0x2ef2ff, element: 'lightning' }),
  S('neon_chakram', 'wind_chakram', 'neon', 'Hyperdisc', { metal: 'dark', tint: 0xff3ad6, element: 'lightning' }),
  S('neon_helm', 'iron_helm', 'neon', 'Cyber Visor', { metal: 'dark', tint: 0x2ef2ff, cloth: 0xff3ad6, element: 'lightning' }),
  S('neon_boots', 'leaping_boots', 'neon', 'Hoverjets', { metal: 'dark', tint: 0x2ef2ff, cloth: 0x15161f, element: 'lightning' }),
  S('neon_core', 'echo_stone', 'neon', 'Data Core', { metal: 'dark', tint: 0x2ef2ff, element: 'lightning' }),
];

export const SKIN_BY_ID: Record<string, SkinDef> = Object.fromEntries(SKINS.map((s) => [s.id, s]));

/** Skins available for one gear piece, in catalogue order. */
export function skinsFor(gear: GearId): SkinDef[] {
  return SKINS.filter((s) => s.gear === gear);
}

/** The skin a character shows on a gear piece (null for the default look). */
export function skinOf(gear: GearId, skins: SkinChoice | undefined): SkinDef | null {
  const id = skins?.[gear];
  const s = id ? SKIN_BY_ID[id] : undefined;
  return s && s.gear === gear ? s : null;
}

/** How a gear piece looks with an optional skin. */
export function skinnedArt(gear: GearId, skin: SkinDef | null): ItemArt {
  return skin ? { ...ITEM_ART[gear], ...skin.art } : ITEM_ART[gear];
}

/** Drops unknown skins and skins that don't belong to their gear piece. */
export function validSkins(raw: unknown): SkinChoice {
  const out: SkinChoice = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [gear, id] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== 'string') continue;
    const s = SKIN_BY_ID[id];
    if (s && s.gear === gear) out[s.gear] = s.id;
  }
  return out;
}

/** Sets or clears (null) the skin of one gear piece. */
export function withSkin(skins: SkinChoice | undefined, gear: GearId, id: string | null): SkinChoice {
  const out: SkinChoice = { ...skins };
  if (id && SKIN_BY_ID[id]?.gear === gear) out[gear] = id;
  else delete out[gear];
  return out;
}

/**
 * Skins for a generated rival: usually one theme, sometimes a full set, so
 * skins show up in fights without every rival looking the same.
 */
export function randomSkins(gear: GearId[], r: () => number = Math.random): SkinChoice {
  const out: SkinChoice = {};
  if (r() < 0.25) return out;
  const theme = SKIN_THEME_IDS[Math.floor(r() * SKIN_THEME_IDS.length)];
  const full = r() < 0.35;
  for (const g of gear) {
    const options = skinsFor(g);
    if (!options.length) continue;
    const themed = options.find((s) => s.theme === theme);
    if (themed && (full || r() < 0.7)) out[g] = themed.id;
    else if (r() < 0.3) out[g] = options[Math.floor(r() * options.length)].id;
  }
  return out;
}
