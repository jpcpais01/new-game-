import type { OutfitId } from '../../../../character/outfits';
import type { OutfitColors, OutfitSculpt } from './kit';
import { RUNNER } from './runner';
import { TUNIC } from './tunic';
import { WARDEN } from './warden';
import { WARLORD } from './warlord';

/** Sculpt builders per outfit (see character/outfits.ts for the catalogue). */
const SCULPTS: Record<OutfitId, OutfitSculpt> = { tunic: TUNIC, warlord: WARLORD, warden: WARDEN, runner: RUNNER };

export function outfitSculpt(id: string | undefined): OutfitSculpt {
  return SCULPTS[id as OutfitId] ?? TUNIC;
}

/**
 * Fixed palettes of the character skins, painted over the house colours (the
 * house outfit takes the character's own outfit colours instead).
 */
export const OUTFIT_COLORS: Partial<Record<OutfitId, Partial<OutfitColors>>> = {
  warlord: {
    shirt: 0x3b2326, trim: 0xb07a3a, pants: 0x2a2124, boot: 0x241c20, wrap: 0x4a3328, sash: 0x8c1c14,
    plate: 0x3d363b, leather: 0x3a2a24, metal: 0xc08a3e, glow: 0xff6a1a, glow2: 0xffc23a,
  },
  warden: {
    shirt: 0xc4d7ec, trim: 0x4f8fc4, pants: 0x3c4a66, boot: 0x4a3c38, wrap: 0x8a7a6a, sash: 0x2e5c8a,
    fur: 0xf7f4ee, leather: 0x5a4436, metal: 0xcfdbe8, glow: 0x8fe6ff, glow2: 0xe8fbff,
  },
  runner: {
    shirt: 0x1d1d28, suit: 0x17171f, trim: 0x3a3a4c, pants: 0x17171f, boot: 0xe6e6ee, wrap: 0x3a3a4c, sash: 0x17171f,
    plate: 0x2c2c38, leather: 0x22222c, metal: 0x9aa4b8, glow: 0x2ef2ff, glow2: 0xff3ad6,
  },
};
