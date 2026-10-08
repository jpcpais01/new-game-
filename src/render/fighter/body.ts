import type { Bone } from 'three';
import type { RigBuildApi } from './look';
import { J } from './poses';
import type { RigPartSpec } from './rig';
import { sculptBody } from './sculpt/body';
import { mixHex, paintedGeometry, type PaintColors } from './sculpt/paint';

/**
 * The fighter's base body: a sculpted, painted figure for the look's form
 * (see sculpt/body.ts), skinned along its bone chains so elbows, knees, hips
 * and the spine bend as one surface. Sculpts are cached per form and detail
 * tier; only the paint is redone per character.
 */

let detailTier = 2;
/** Sculpt detail for new fighters: 0 = low, 1 = medium, 2 = high (follows the render quality). */
export function setBodyDetail(tier: number): void { detailTier = Math.max(0, Math.min(2, Math.round(tier))); }
export function bodyDetail(): number { return detailTier; }

const TORSO = [J.HIPS, J.SPINE, J.CHEST, J.NECK, J.HEAD] as const;
const ARM_R = [J.UARM_R, J.FARM_R, J.HAND_R] as const;
const ARM_L = [J.UARM_L, J.FARM_L, J.HAND_L] as const;
const LEG_R = [J.THIGH_R, J.SHIN_R, J.FOOT_R] as const;
const LEG_L = [J.THIGH_L, J.SHIN_L, J.FOOT_L] as const;

/** Paint palette for a fighter's outfit from its look colours. */
export function bodyColors(api: RigBuildApi): PaintColors {
  const a = api.appearance;
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
  };
}

export function buildBody(api: RigBuildApi, j: Bone[]): void {
  const m = api.metrics;
  const sculpt = sculptBody(m.form.id, m.form.shape, m.hipH, m.ankleH, detailTier);
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
}
