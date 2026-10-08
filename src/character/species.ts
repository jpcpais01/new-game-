/**
 * Species: the kind of creature a character is. Purely visual: the species
 * sets the silhouette (proportions, head, ears, horns, tail) and its colour
 * range, while the body form (sim/forms.ts) keeps deciding stats and only
 * reshapes the build on top. The simulation never sees it.
 */

export const SPECIES_IDS = ['kitsu', 'ogrin', 'wisp', 'lop', 'imp', 'golem'] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  /** One-line identity under the name. */
  title: string;
  blurb: string;
  /** Skin (fur, hide, stone) colours offered in the creator; the first is the default. */
  skins: number[];
  /** Hair colours that suit the species (the full list stays available). */
  hair: number[];
  /** Default eye colour. */
  eyes: number;
  /** The creator's nose option changes this species' face. */
  noses: boolean;
  /** The species has eyebrows (the creator shows the option). */
  brows: boolean;
  /** Facial hair grows on this species. */
  beards: boolean;
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  kitsu: {
    id: 'kitsu', name: 'Kitsu', title: 'Fox spirit',
    blurb: 'Quick, sly fox-folk with tall ears, a pointed muzzle and a tail as big as their pride.',
    skins: [0xe8873a, 0xd86a2a, 0xf0b25e, 0xf4efe6, 0x3a3440, 0xa8a4b4, 0xb8582a, 0xe6c06a],
    hair: [0xf4efe6, 0xe8873a, 0x3a3440, 0xd8642a, 0xe9ecff, 0xc06bff],
    eyes: 0xa8702a, noses: false, brows: true, beards: false,
  },
  ogrin: {
    id: 'ogrin', name: 'Ogrin', title: 'Little ogre',
    blurb: 'Short, wide and stubborn. Tusks, stubby horns, hands like shovels and a belly built for feasts.',
    skins: [0x82ad5c, 0x5f8f4e, 0xa4bf6e, 0x67a39a, 0xc7a35a, 0x8f8270, 0xb47a5a, 0x6a8796],
    hair: [0x15121c, 0x3a2418, 0x8a5a2b, 0xd8642a, 0x9aa0b0, 0xa8281e],
    eyes: 0xffd36b, noses: true, brows: true, beards: true,
  },
  wisp: {
    id: 'wisp', name: 'Wisp', title: 'Spirit being',
    blurb: 'A slender spirit given form: long limbs, huge eyes, finned ears and markings that glow.',
    skins: [0xbfe3ff, 0xd8ccff, 0xc4f5e4, 0xf2f4ff, 0x9fcff0, 0xffd6ec, 0xaab6ff, 0x9fe8d8],
    hair: [0x6ff3ff, 0xe9ecff, 0xc06bff, 0xff7ab6, 0x58d0a0, 0xffd36b],
    eyes: 0x6ff3ff, noses: false, brows: false, beards: false,
  },
  lop: {
    id: 'lop', name: 'Lop', title: 'Long-eared burrower',
    blurb: 'A big round head on a small sturdy body, with long floppy ears that bounce with every step.',
    skins: [0xf6ead8, 0xe8d0b0, 0xd9b48c, 0xb8865c, 0x8f6a52, 0xc9c4c4, 0x6e6a72, 0xf2dde6],
    hair: [0xf6ead8, 0x8a5a2b, 0x6a3e22, 0xc8873a, 0xff7ab6, 0x9aa0b0],
    eyes: 0x5a3a22, noses: false, brows: true, beards: false,
  },
  imp: {
    id: 'imp', name: 'Imp', title: 'Horned trickster',
    blurb: 'Wiry and restless, with long arms, curled horns, pointed ears, a sharp grin and a whip of a tail.',
    skins: [0xd8443a, 0xb8324a, 0x8e3c8e, 0x6a3aa8, 0xe8703a, 0x4c3c70, 0x3a86a8, 0xc8506e],
    hair: [0x15121c, 0xe9ecff, 0xffd36b, 0xa8281e, 0xc06bff, 0x2b2633],
    eyes: 0xffd36b, noses: true, brows: true, beards: true,
  },
  golem: {
    id: 'golem', name: 'Golem', title: 'Living stone',
    blurb: 'A walking boulder: huge shoulders and fists, a small head sunk between them and a glowing core.',
    skins: [0x9a958c, 0xb8a080, 0x6a6670, 0x7aa08a, 0xa07a6a, 0x8a9aaa, 0xcfc6b4, 0x5a7a6a],
    hair: [0x58d0a0, 0x6ff3ff, 0xff8a2a, 0xc06bff, 0x2f7a3a, 0xe9ecff],
    eyes: 0x6ff3ff, noses: false, brows: false, beards: false,
  },
};

export const isSpecies = (v: unknown): v is SpeciesId => typeof v === 'string' && (SPECIES_IDS as readonly string[]).includes(v);
