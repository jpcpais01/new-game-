import { OUTFIT_IDS, OUTFIT_SKINS, type OutfitId } from './outfits';
import { SPECIES, SPECIES_IDS, type SpeciesId } from './species';

/**
 * The look of a character: face, hair, colours and outfit. Pure data (no three.js) so
 * it can be stored, validated and generated anywhere. The renderer turns it
 * into geometry in render/fighter/appearance.ts; the simulation never sees it.
 */

export const HAIR_STYLES = ['short', 'swept', 'spiky', 'buzz', 'ponytail', 'long', 'bun', 'mohawk', 'braids', 'bald'] as const;
export const EYE_STYLES = ['round', 'sharp', 'narrow', 'wide', 'glow'] as const;
export const BROW_STYLES = ['soft', 'straight', 'angry', 'thick', 'none'] as const;
export const MOUTH_STYLES = ['neutral', 'smile', 'grin', 'frown'] as const;
export const NOSE_STYLES = ['button', 'round', 'long'] as const;
export const JAW_STYLES = ['soft', 'square', 'narrow'] as const;
export const FACIAL_HAIR = ['none', 'stubble', 'mustache', 'goatee', 'beard', 'braid'] as const;
export const MARKINGS = ['none', 'scar', 'warpaint', 'freckles', 'tattoo'] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type EyeStyle = (typeof EYE_STYLES)[number];
export type BrowStyle = (typeof BROW_STYLES)[number];
export type MouthStyle = (typeof MOUTH_STYLES)[number];
export type NoseStyle = (typeof NOSE_STYLES)[number];
export type JawStyle = (typeof JAW_STYLES)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type Marking = (typeof MARKINGS)[number];

export interface Appearance {
  /** The kind of creature (character/species.ts): silhouette, head, ears, horns, tail. */
  species: SpeciesId;
  /** Skin, fur or stone colour. */
  skin: number;
  hairStyle: HairStyle;
  hairColor: number;
  eyes: EyeStyle;
  eyeColor: number;
  brows: BrowStyle;
  mouth: MouthStyle;
  nose: NoseStyle;
  jaw: JawStyle;
  facialHair: FacialHair;
  marking: Marking;
  /** Main clothing colour. */
  primary: number;
  /** Trim, sash and detail colour. */
  secondary: number;
  /** Character skin: the outfit the body is sculpted in (see outfits.ts). */
  outfit: OutfitId;
}

/** Every species' skin colours (the creator shows the chosen species' own). */
export const SKIN_TONES = SPECIES_IDS.flatMap((id) => SPECIES[id].skins);
export const HAIR_COLORS = [
  0x15121c, 0x3a2418, 0x6a3e22, 0x8a5a2b, 0xc8873a, 0xe8c070, 0xd8642a, 0xa8281e,
  0xe9ecff, 0x9aa0b0, 0x4a7cff, 0x58d0a0, 0xc06bff, 0xff7ab6,
];
export const EYE_COLORS = [0x1c1a2a, 0x5a3a22, 0x2a6a3a, 0x2a3f8a, 0x6a8aa0, 0xa8702a, 0x6ff3ff, 0xff4040, 0xc06bff, 0xffd36b];
export const OUTFIT_COLORS = [
  0x2f5be0, 0x3d2596, 0x6c3ad6, 0xd6283c, 0x8a3a22, 0xff8a2a, 0xf3c24f, 0x2f7a3a,
  0x1f8a8a, 0xf2ecdf, 0x6b4428, 0x2b2633, 0x7d8594, 0xe85a9a,
];

export const DEFAULT_APPEARANCE: Appearance = {
  species: 'kitsu', skin: 0xe8873a, hairStyle: 'swept', hairColor: 0xf4efe6, eyes: 'round', eyeColor: 0xa8702a,
  brows: 'soft', mouth: 'neutral', nose: 'button', jaw: 'soft', facialHair: 'none', marking: 'none',
  primary: 0x2f5be0, secondary: 0xf3c24f, outfit: 'tunic',
};

const pick = <T>(arr: readonly T[], r: () => number): T => arr[Math.floor(r() * arr.length) % arr.length];

/** A coherent random look (used for "Randomize" and generated opponents). */
export function randomAppearance(r: () => number = Math.random, species?: SpeciesId): Appearance {
  const sp = SPECIES[species ?? pick(SPECIES_IDS, r)];
  // The species' own colours most of the time, an odd one out sometimes.
  const skin = r() < 0.9 ? pick(sp.skins, r) : pick(SKIN_TONES, r);
  const hairColor = r() < 0.7 ? pick(sp.hair, r) : pick(HAIR_COLORS, r);
  const primary = pick(OUTFIT_COLORS, r);
  let secondary = pick(OUTFIT_COLORS, r);
  if (secondary === primary) secondary = 0xf3c24f;
  return {
    species: sp.id,
    skin,
    hairStyle: pick(HAIR_STYLES, r),
    hairColor,
    eyes: r() < 0.08 ? 'glow' : pick(EYE_STYLES.slice(0, 4), r),
    eyeColor: r() < 0.45 ? sp.eyes : pick(EYE_COLORS, r),
    brows: pick(BROW_STYLES.slice(0, 4), r),
    mouth: pick(MOUTH_STYLES, r),
    nose: pick(NOSE_STYLES, r),
    jaw: pick(JAW_STYLES, r),
    facialHair: !sp.beards || r() < 0.6 ? 'none' : pick(FACIAL_HAIR.slice(1), r),
    marking: r() < 0.6 ? 'none' : pick(MARKINGS.slice(1), r),
    primary,
    secondary,
    // Some rivals show up in a character skin.
    outfit: r() < 0.3 ? pick(OUTFIT_SKINS, r) : 'tunic',
  };
}

/**
 * Switches a look to another species: the skin and eyes move into the new
 * species' range unless they already fit it; everything else stays.
 */
export function withSpecies(a: Appearance, id: SpeciesId): Appearance {
  if (a.species === id) return a;
  const from = SPECIES[a.species], to = SPECIES[id];
  return {
    ...a,
    species: id,
    skin: to.skins.includes(a.skin) ? a.skin : to.skins[Math.max(0, from.skins.indexOf(a.skin))] ?? to.skins[0],
    eyeColor: a.eyeColor === from.eyes ? to.eyes : a.eyeColor,
  };
}

const isColor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff;
const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T => (list.includes(v as T) ? (v as T) : fb);

/** Repairs anything read from storage so a corrupt or older save never breaks the game. */
export function sanitizeAppearance(raw: unknown): Appearance {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Appearance, unknown>>;
  const d = DEFAULT_APPEARANCE;
  return {
    species: oneOf(a.species, SPECIES_IDS, d.species),
    skin: isColor(a.skin) ? a.skin : d.skin,
    hairStyle: oneOf(a.hairStyle, HAIR_STYLES, d.hairStyle),
    hairColor: isColor(a.hairColor) ? a.hairColor : d.hairColor,
    eyes: oneOf(a.eyes, EYE_STYLES, d.eyes),
    eyeColor: isColor(a.eyeColor) ? a.eyeColor : d.eyeColor,
    brows: oneOf(a.brows, BROW_STYLES, d.brows),
    mouth: oneOf(a.mouth, MOUTH_STYLES, d.mouth),
    nose: oneOf(a.nose, NOSE_STYLES, d.nose),
    jaw: oneOf(a.jaw, JAW_STYLES, d.jaw),
    facialHair: oneOf(a.facialHair, FACIAL_HAIR, d.facialHair),
    marking: oneOf(a.marking, MARKINGS, d.marking),
    primary: isColor(a.primary) ? a.primary : d.primary,
    secondary: isColor(a.secondary) ? a.secondary : d.secondary,
    outfit: oneOf(a.outfit, OUTFIT_IDS, d.outfit),
  };
}
