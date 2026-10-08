import { ALL_ART, ART_SLOTS, slotOfArt, type ArtKey, type ItemArt, type Rarity } from '../gear/art';
import { itemIconUrl } from '../ui/itemIcons';
import { GEAR, GEAR_SLOTS, SLOT_NAMES, type GearDef } from '../sim/gear';
import { ITEM_ART } from '../gear/itemArt';
import type { GearSlot } from '../sim/types';

// Review page for item art: every icon in a few colourways, and (below) the 3D
// gear models on a turntable. Open /gallery.html on any preview deploy.

const SAMPLE: Partial<Record<ArtKey, ItemArt>> = {};
const TINTS = [0xff6a1a, 0x8fe6ff, 0xb47aff, 0x8cff3a];
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const style = document.createElement('style');
style.textContent = `
  body { margin: 0; background: #0d0f1a; color: #e9e6f5; font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 22px; margin: 20px 16px 4px; letter-spacing: .08em; }
  h2 { font-size: 15px; margin: 22px 16px 8px; text-transform: uppercase; letter-spacing: .12em; color: #a99fd0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; padding: 0 16px; }
  .card { background: #171a2b; border-radius: 12px; padding: 10px; text-align: center; }
  .card img.big { width: 96px; height: 96px; display: block; margin: 0 auto 6px; }
  .row { display: flex; gap: 4px; justify-content: center; margin-top: 4px; }
  .row img { width: 30px; height: 30px; }
  .name { font-weight: 600; font-size: 12px; color: #cfc8ee; }
  .rar { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; opacity: .7; }
  .r-common { color: #a9b0bf; } .r-rare { color: #4da3ff; } .r-epic { color: #b46bff; } .r-legendary { color: #ffa630; }
  #models { width: 100%; height: 92vh; display: block; cursor: pointer; }
`;
document.head.append(style);

const h1 = document.createElement('h1');
h1.textContent = 'Clashborn gear gallery';
document.body.append(h1);

const params = new URLSearchParams(location.search);
const big = params.get('big');
const view = params.get('view');

// 3D models: ?view=3d (all slots) or ?view=3d&slot=head.
if (view === '3d' || !big) {
  const h2 = document.createElement('h2');
  h2.textContent = '3D gear (click to pause)';
  const canvas = document.createElement('canvas');
  canvas.id = 'models';
  document.body.append(h2, canvas);
  const slot = params.get('slot') as GearSlot | null;
  void import('./models').then((m) => m.mountModels(canvas, slot ?? undefined, Number(params.get('cols')) || undefined));
}

// The real catalog first: every gear piece with its icon.
if (!big && view !== '3d') {
  for (const slot of GEAR_SLOTS) {
    const h2 = document.createElement('h2');
    h2.textContent = SLOT_NAMES[slot];
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const g of Object.values(GEAR[slot]) as GearDef[]) {
      const card = document.createElement('div');
      card.className = 'card';
      const im = new Image();
      im.className = 'big';
      im.src = itemIconUrl(ITEM_ART[g.id], { rarity: g.rarity });
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = g.name;
      const r = document.createElement('div');
      r.className = 'rar r-' + g.rarity;
      r.textContent = g.rarity;
      card.append(im, name, r);
      grid.append(card);
    }
    document.body.append(h2, grid);
  }
  const h = document.createElement('h1');
  h.textContent = 'All drawings';
  document.body.append(h);
}

if (big) {
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;padding:16px';
  for (const art of ALL_ART.filter((a) => big === 'all' || slotOfArt(a) === big)) {
    const im = new Image();
    im.src = itemIconUrl({ art }, { rarity: 'legendary' });
    im.width = im.height = 160;
    im.title = art;
    grid.append(im);
  }
  document.body.append(grid);
}

for (const slot of big || view === '3d' ? [] : ART_SLOTS) {
  const h2 = document.createElement('h2');
  h2.textContent = slot;
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const art of ALL_ART.filter((a) => slotOfArt(a) === slot)) {
    const base = SAMPLE[art] ?? { art };
    const card = document.createElement('div');
    card.className = 'card';
    const big = new Image();
    big.className = 'big';
    big.src = itemIconUrl(base, { rarity: 'epic' });
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = art;
    const row = document.createElement('div');
    row.className = 'row';
    TINTS.forEach((tint, i) => {
      const im = new Image();
      im.src = itemIconUrl({ ...base, tint }, { rarity: RARITIES[(i + 1) % RARITIES.length] });
      row.append(im);
    });
    card.append(big, name, row);
    grid.append(card);
  }
  document.body.append(h2, grid);
}
