import { describe, expect, it } from 'vitest';
import { runHeadless } from '../sim/headless';
import { DEFAULT_BUILDS, sanitizeBuild } from '../sim/loadout';
import { GEAR_BY_ID } from '../sim/gear';
import { SKIN_MODELS } from '../render/gear/skins';
import { SKIN_THEME_IDS, SKINS, skinsFor, validSkins, withSkin } from './skins';

describe('item skins', () => {
  it('are unique, belong to real gear and each has its own 3D model', () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
    for (const s of SKINS) {
      expect(GEAR_BY_ID[s.gear], s.id).toBeTruthy();
      expect(SKIN_MODELS[s.id], s.id).toBeTruthy();
    }
    for (const t of SKIN_THEME_IDS) expect(SKINS.filter((s) => s.theme === t).length).toBeGreaterThanOrEqual(5);
  });

  it('drops unknown skins and skins worn on the wrong gear', () => {
    expect(validSkins({ longsword: 'hellforge_longsword', katana: 'hellforge_longsword', spear: 'nope', bogus: 'x' }))
      .toEqual({ longsword: 'hellforge_longsword' });
    expect(validSkins('junk')).toEqual({});
    expect(withSkin({ longsword: 'hellforge_longsword' }, 'longsword', null)).toEqual({});
    expect(withSkin({}, 'katana', 'hellforge_longsword')).toEqual({});
  });

  it('survive a saved build', () => {
    const b = sanitizeBuild({ ...DEFAULT_BUILDS[0], skins: { longsword: 'dawn_longsword', nonsense: 3 } }, DEFAULT_BUILDS[0]);
    expect(b.skins?.longsword).toBe('dawn_longsword');
  });

  it('are cosmetic: a fight plays out the same with or without them', () => {
    const [a, b] = DEFAULT_BUILDS;
    // Every piece that has a skin wears its first one.
    const dressed = (x: typeof a) => ({
      ...x, skins: Object.fromEntries(Object.values(x.gear).flatMap((g) => skinsFor(g).slice(0, 1).map((s) => [g, s.id]))),
    });
    expect(Object.keys(dressed(a).skins).length + Object.keys(dressed(b).skins).length).toBeGreaterThan(0);
    for (const seed of [3, 77, 2024]) {
      const plain = runHeadless({ seed, fighters: [a, b] });
      const skinned = runHeadless({ seed, fighters: [dressed(a), dressed(b)] });
      expect(skinned.tick).toBe(plain.tick);
      expect(skinned.winner).toBe(plain.winner);
      expect(skinned.fighters.map((f) => f.hp)).toEqual(plain.fighters.map((f) => f.hp));
    }
  });
});
