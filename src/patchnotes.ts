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
    version: '0.8.1',
    date: '2026-10-08',
    title: 'Blocking turns the right way',
    notes: [
      'Raising a shield now turns the shield shoulder into the attack instead of away from it.',
      'Shield users always block with the shield, even with fists or a staff.',
      'Dual blades guard with the off-hand blade in front, and a successful parry snaps the arm that actually parried.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-08',
    title: 'Special auras',
    notes: [
      'Every special item now wears a signature aura: a glowing sigil on the ground under your fighter, themed particles around you and your orbiting relic.',
      'Each one is its own: falling stars for the Meteor Sigil, rays of light for the Relic of Judgment, spectral cuts for the Phantom Blade, hopping pebbles for the Heart of the Mountain, a spiral of embers for the Phoenix Feather, echoing rings for the Echo Stone, a crimson pull for the Vampiric Fang, heat for the Ember Core and snowfall for the Frost Core.',
      'Special skins get their own auras too: forge ash for Forgeheart, glittering ice for Heart of Winter, falling light feathers for Sunfall Relic, a swallowing rift for Abyssal Edge, leaves and petals for Heartseed, and data streams for Data Core.',
      'Ultimates build up: the aura grows as your energy fills, shimmers when the ultimate is ready and erupts into a pillar of light when you cast it.',
      'Passives flare when they trigger: an echo, a lifesteal heal, an ignite or chill, or the phoenix rebirth.',
      'Auras use fewer particles on Low graphics quality.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-08',
    title: 'Character skins',
    notes: [
      'Three character skins that dress your fighter head to toe, fitted to every body form: Ember Warlord, Frost Warden and Neon Runner.',
      'Ember Warlord: blackened plate with fire leaking from every seam, horned pauldrons and a crimson war tabard.',
      'Frost Warden: a quilted greatcoat with a split tail, a heavy fur mantle and fur-topped boots.',
      'Neon Runner: a black chrome bodysuit traced with light, a glowing chest core and a streaming data scarf.',
      'Pick one under Outfit in the Skins tab when you create or edit your fighter. Rivals sometimes wear them too.',
      'Skins only change how you look; stats and abilities stay the same.',
    ],
  },
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
