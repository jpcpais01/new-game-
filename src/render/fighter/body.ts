import { Vector3, type Bone } from 'three';
import type { RigBuildApi } from './look';
import { J } from './poses';
import type { RigPartSpec } from './rig';
import { sculptBody } from './sculpt/body';
import { OUTFIT_COLORS } from './sculpt/outfits';
import { mixHex, paintedGeometry, type PaintColors } from './sculpt/paint';

/**
 * The fighter's base body: a sculpted, painted figure for the look's form
 * (see sculpt/body.ts), skinned along its bone chains so elbows, knees, hips
 * and the spine bend as one surface. Sculpts are cached per form and detail
 * tier and outfit (character skin); only the paint is redone per character.
 */

let detailTier = 2;
/** Sculpt detail for new fighters: 0 = low, 1 = medium, 2 = high (follows the render quality). */
export function setBodyDetail(tier: number): void { detailTier = Math.max(0, Math.min(2, Math.round(tier))); }
export function bodyDetail(): number { return detailTier; }
/** Sculpt detail for the render quality: close-ups (the creator) get one tier more. */
export function detailFor(quality: 'high' | 'medium' | 'low', closeUp = false): number {
  return (quality === 'high' ? 1 : 0) + (closeUp ? 1 : 0);
}
/** Runs `fn` with a different sculpt detail (close-up views). */
export function withBodyDetail<T>(tier: number, fn: () => T): T {
  const prev = detailTier;
  setBodyDetail(tier);
  try { return fn(); } finally { detailTier = prev; }
}

const TORSO = [J.HIPS, J.SPINE, J.CHEST, J.NECK, J.HEAD] as const;
const ARM_R = [J.UARM_R, J.FARM_R, J.HAND_R] as const;
const ARM_L = [J.UARM_L, J.FARM_L, J.HAND_L] as const;
const LEG_R = [J.THIGH_R, J.SHIN_R, J.FOOT_R] as const;
const LEG_L = [J.THIGH_L, J.SHIN_L, J.FOOT_L] as const;

/**
 * Paint palette for a fighter: the house outfit takes the look's colours, a
 * character skin brings its own palette (skin, hair and eyes stay theirs).
 */
export function bodyColors(api: RigBuildApi): PaintColors {
  const a = api.appearance;
  const skin = a.outfit ? OUTFIT_COLORS[a.outfit as keyof typeof OUTFIT_COLORS] : undefined;
  return {
    skin: a.skin,
    shirt: a.primary,
    trim: a.accent,
    pants: a.secondary,
    boot: a.leather,
    wrap: mixHex(a.leather, 0xd8c8a8, 0.45),
    hair: a.hair,
    eyes: a.eyes,
    sash: a.accent,
    mark: a.accent,
    ...speciesColors(a.species, a.skin, a.hair),
    ...skin,
  };
}

/** Horn, fur-tip, spirit and crystal colours of a species. */
export function speciesColors(species: string | undefined, skin: number, hair: number): Partial<PaintColors> {
  switch (species) {
    case 'imp': return { horn: mixHex(0xeee0c8, skin, 0.22) };
    case 'golem': return { crystal: hair };
    case 'wisp': return { spirit: mixHex(hair, 0xffffff, 0.15) };
    case 'kitsu': {
      // Fox tips are pale on dark fur and darker on pale fur.
      const l = (((skin >> 16) & 255) * 0.3 + ((skin >> 8) & 255) * 0.59 + (skin & 255) * 0.11) / 255;
      return { tip: l > 0.82 ? mixHex(skin, 0x3a3440, 0.5) : mixHex(skin, 0xfffaf2, 0.85) };
    }
    default: return { horn: 0xeadcbc };
  }
}

export function buildBody(api: RigBuildApi, j: Bone[]): void {
  const m = api.metrics;
  const sculpt = sculptBody(m.form.id, m.form.shape, m.hipH, m.ankleH, detailTier, api.appearance.outfit, m.form.species);
  const colors = bodyColors(api);
  const bodySpace = j[J.HIPS].parent!;
  const put = (s: typeof sculpt.torso, chain: readonly number[]) => {
    const spec: RigPartSpec = { color: 0xffffff, vertexColors: true, chain };
    api.part(bodySpace, paintedGeometry(s, colors), spec);
  };
  put(sculpt.torso, TORSO);
  put(sculpt.armR, ARM_R);
  put(sculpt.armL, ARM_L);
  put(sculpt.legR, LEG_R);
  put(sculpt.legL, LEG_L);
  // Loose cloth (sash ends, tabards, coat tails, scarves) sways from its root.
  bodySpace.updateWorldMatrix(true, true);
  for (const c of sculpt.cloth) {
    const bone = j[c.bone === 'chest' ? J.CHEST : J.HIPS];
    const at = bone.worldToLocal(bodySpace.localToWorld(new Vector3(...c.root)));
    const tail = api.cloth(bone, at.x, at.y, at.z, c.stiffness);
    api.part(tail, paintedGeometry(c.mesh, colors), { color: 0xffffff, vertexColors: true } as RigPartSpec);
  }
}
