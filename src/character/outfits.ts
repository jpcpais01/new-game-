import type { SkinTheme } from '../gear/skins';

/**
 * Character skins: whole-body outfits worn by the fighter itself (separate
 * from item skins, which reskin gear). An outfit replaces the clothes the
 * body is sculpted in and brings its own palette; the face, hair, skin and
 * eye colours stay the character's. Purely cosmetic: the simulation never
 * sees it. Every outfit is built from each form's own anatomy, so it fits
 * all six body forms.
 */

export const OUTFIT_IDS = ['tunic', 'warlord', 'warden', 'runner'] as const;
export type OutfitId = (typeof OUTFIT_IDS)[number];

export interface OutfitDef {
  id: OutfitId;
  name: string;
  /** The item-skin theme it is made to be worn with (null for the house outfit). */
  theme: SkinTheme | null;
  blurb: string;
  /** Picker swatch: main, trim, accent (glow). */
  swatch: [number, number, number];
}

export const OUTFITS: Record<OutfitId, OutfitDef> = {
  tunic: {
    id: 'tunic', name: 'Wanderer', theme: null,
    blurb: 'The wrap tunic and sash you started in, in your own colours.',
    swatch: [0x2f5be0, 0xf3c24f, 0xf3c24f],
  },
  warlord: {
    id: 'warlord', name: 'Ember Warlord', theme: 'hellforge',
    blurb: 'Blackened plate quenched in magma, fire leaking from every seam.',
    swatch: [0x3a3438, 0xc08a3e, 0xff6a1a],
  },
  warden: {
    id: 'warden', name: 'Frost Warden', theme: 'rimeborn',
    blurb: 'A quilted greatcoat and a heavy fur mantle from the glacier passes.',
    swatch: [0xc4d7ec, 0x4f8fc4, 0x8fe6ff],
  },
  runner: {
    id: 'runner', name: 'Neon Runner', theme: 'neon',
    blurb: 'A black chrome bodysuit running with light.',
    swatch: [0x1d1d28, 0x2ef2ff, 0xff3ad6],
  },
};

/** The character skins proper (everything but the house outfit). */
export const OUTFIT_SKINS: OutfitId[] = OUTFIT_IDS.filter((id) => id !== 'tunic');
