// Player-facing patch notes, newest first. Every change merged to main bumps
// package.json's version and adds an entry here (patchnotes.test.ts checks the
// top entry matches package.json). Write for players: what changed in the game,
// not how the code changed.

export interface PatchNote {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  notes: string[];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: '0.6.1',
    date: '2026-10-08',
    title: 'Heads to match the body',
    notes: [
      'Head size now follows the body: Robust and Mighty get bigger heads, Agile and Ethereal lighter ones.',
      'The face close-up in the character creator follows each body form, so hats stay in frame.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-08',
    title: 'Patch notes',
    notes: [
      'A notes button next to the version number opens these patch notes.',
      'A dot on the button means there is an update you have not read yet.',
    ],
  },
  {
    version: '0.5.3',
    date: '2026-10-08',
    title: 'Clearer duels on phones',
    notes: [
      'A Battle feed switch in Settings turns the move-by-move feed on or off.',
      'Speed is one button that cycles 1×, 2× and 4×.',
      'On landscape phones the corners are compact strips, and the camera keeps both fighters clear of the panels.',
    ],
  },
  {
    version: '0.5.2',
    date: '2026-10-08',
    title: 'Tidier tunics',
    notes: ['Flatter chests, so tunics and shirts sit cleanly on every body form.'],
  },
  {
    version: '0.5.1',
    date: '2026-10-08',
    title: 'New faces',
    notes: ['Faces redone in a clean, stylized look.'],
  },
  {
    version: '0.5.0',
    date: '2026-10-08',
    title: 'A look of its own',
    notes: [
      'The whole interface is redesigned: inked plaques, keycap buttons that press down and a slanted ember style.',
      'A new typeface for titles and text.',
    ],
  },
  {
    version: '0.4.1',
    date: '2026-10-08',
    title: 'Sharper on phones',
    notes: ['Fixed the stretched 3D picture on phones.'],
  },
  {
    version: '0.4.0',
    date: '2026-10-08',
    title: 'Version label',
    notes: ['The game version shows small in a corner, so you can tell when the app has updated.'],
  },
  {
    version: '0.3.0',
    date: '2026-10-08',
    title: 'Skins and sculpted fighters',
    notes: [
      'Item skins: six themed sets with their own 3D models and icons, picked from the item picker or the creator\'s Skins tab.',
      'Sculpted characters with detailed bodies, faces and hair, and livelier motion.',
      'Fighters carry every hand-held item where it belongs and draw it to use it, whatever gear they combine.',
      'Bows and hand crossbows aim properly, with nocked arrows and loaded bolts.',
      'Skyreach Highlands rebuilt as a cliff-top sanctuary above the clouds.',
      'Clean layouts on phones in portrait and landscape, with a new Settings sheet.',
      'The camera fits any screen shape instead of stretching the picture.',
      'The installed app now opens on Xiaomi phones.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-08',
    title: 'Your fighter, your gear',
    notes: [
      'Classes are gone: pick one of six body forms and fill six gear slots (main weapon, secondary, defensive, hat, boots and a special item). Your abilities come from your gear.',
      'Create one persistent fighter with your own name, face, hair and colours.',
      'A smarter battle AI that reads both kits, learns its opponent and thinks a few moves ahead.',
      'Item icons, 3D gear models and gear-driven effects.',
      'Stylised characters, two arenas (Skyreach Highlands and the Grand Colosseum), camera zoom and new effects.',
      'Anatomical bodies with planted feet and weapon-aware animation.',
      'Rebalanced ultimates, passive specials and Phase Cloak.',
      'Drag to turn your fighter in the creator; every number on screen is rounded.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-08',
    title: 'First fight',
    notes: [
      'Fully automatic 1v1 duels in a 3D arena, driven by an adaptive AI.',
      'Smooth, fast battles at up to 4× speed.',
      'Install it as an app on your phone or desktop.',
    ],
  },
];
