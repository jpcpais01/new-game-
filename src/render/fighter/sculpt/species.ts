import type { SpeciesId } from '../../../character/species';
import { backAt, furred, sideAt, type ArmCtx, type ClothPiece, type TorsoCtx } from './outfits/kit';
import { M } from './paint';
import { cone, ell, Paint, rbox, Squash, strand, union, type Sdf, type Vec3 } from './sdf';

/**
 * What a species grows on its body, on top of whatever outfit it wears:
 * tails and spirit streamers hang from the hips on their own swaying bones,
 * a golem's boulders and crystals break through the clothes. Heads, ears and
 * horns live in head.ts.
 */
export interface SpeciesSculpt {
  torso?(c: TorsoCtx, dressed: Sdf): Sdf;
  arm?(c: ArmCtx, dressed: Sdf): Sdf;
  cloth?(c: TorsoCtx): ClothPiece[];
}

/** Where a tail leaves the body: the back of the pelvis, just above the seat. */
function tailRoot(c: TorsoCtx): Vec3 {
  const p = backAt(c.pelvis, c.yH - 0.05);
  return [p[0] + 0.02, p[1], 0];
}

const add = (a: Vec3, x: number, y: number, z: number): Vec3 => [a[0] + x, a[1] + y, a[2] + z];

const SCULPTS: Partial<Record<SpeciesId, SpeciesSculpt>> = {
  kitsu: {
    // A big bushy fox tail curling up behind, its tip pale.
    cloth: (c) => {
      const tail = strand(
        [[0, 0, 0], [-0.13, -0.07, 0], [-0.32, -0.04, 0], [-0.47, 0.12, 0], [-0.53, 0.34, 0], [-0.5, 0.46, 0]],
        [0.032, 0.085, 0.118, 0.112, 0.07, 0.012], M.SKIN, 0.03,
      );
      const field = new Paint(furred(tail, 0.012, 34), (_x, y, _z, m) => (y > 0.27 ? M.TIP : m));
      return [{ field, root: tailRoot(c), bone: 'hips', stiffness: 1.1 }];
    },
  },
  lop: {
    // A round cotton puff.
    cloth: (c) => [{ field: furred(ell([-0.045, 0.005, 0], [0.07, 0.065, 0.075], M.TIP), 0.01, 40), root: tailRoot(c), bone: 'hips', stiffness: 2.2 }],
  },
  imp: {
    // A thin whip of a tail ending in a spade.
    cloth: (c) => {
      const whip = strand(
        [[0, 0, 0], [-0.14, -0.13, 0], [-0.33, -0.15, 0], [-0.48, -0.02, 0], [-0.54, 0.15, 0]],
        [0.026, 0.02, 0.016, 0.013, 0.011], M.SKIN, 0.01,
      );
      const spade = new Squash(union(0.01,
        ell([-0.56, 0.24, 0], [0.04, 0.07, 0.05], M.SKIN_DARK, [0, 0, 0.35]),
        cone([-0.56, 0.22, 0], [-0.6, 0.34, 0], 0.035, 0.004, M.SKIN_DARK),
      ), [-0.56, 0.24, 0], [1, 1, 0.32]);
      return [{ field: union(0.012, whip, spade), root: tailRoot(c), bone: 'hips', stiffness: 0.7 }];
    },
  },
  wisp: {
    // Two flame-like streamers of spirit light trailing from the lower back.
    cloth: (c) => {
      const flame = (z: number, s: number) => new Squash(strand(
        [[0, 0, z], [-0.12, -0.08 * s, z * 1.4], [-0.24, -0.3 * s, z * 1.8], [-0.24, -0.56 * s, z * 1.6]],
        [0.045, 0.04, 0.024, 0.003], M.SPIRIT, 0.02,
      ), [0, 0, z], [1, 1, 0.4]);
      return [{ field: union(0.01, flame(0.035, 1), flame(-0.035, 0.82)), root: tailRoot(c), bone: 'hips', stiffness: 0.6 }];
    },
  },
  golem: {
    // Boulders on the shoulders and a ridge of glowing crystals down the upper back.
    torso: (c, dressed) => {
      const { s, j, yU, nl } = c;
      const rocks: Sdf[] = [];
      for (const sz of [-1, 1]) {
        const at: Vec3 = [j.shoulder[0] - 0.02, yU + 0.035, sz * (s.shoulderW - 0.045)];
        rocks.push(rbox(at, [0.1, 0.065, 0.085], 0.03, M.SKIN_DARK, [0.25 * sz, 0.3, 0.1 * sz]));
        rocks.push(rbox(add(at, -0.06, -0.03, -sz * 0.07), [0.07, 0.05, 0.06], 0.025, M.SKIN_DARK, [-0.3 * sz, -0.2, 0.2]));
      }
      const crystals: Sdf[] = [];
      const spots: [number, number, number, number][] = [[0.82, 0, 0.2, 0.05], [0.7, 0.09, 0.15, 0.04], [0.7, -0.09, 0.14, 0.038], [0.55, 0.0, 0.11, 0.032]];
      for (const [fy, z, len, r] of spots) {
        const b = backAt(c.core, c.yC + nl * fy, z);
        crystals.push(cone(add(b, 0.03, 0, 0), add(b, -len * 0.7, len, z * 1.6), r, 0.004, M.CRYSTAL));
      }
      return union(0.012, dressed, union(0.02, ...rocks), ...crystals);
    },
    // A stone plate on the outside of each forearm.
    arm: (c, dressed) => {
      const { E, Wr, z, s } = c;
      const mid: Vec3 = [(E[0] + Wr[0]) / 2, E[1] * 0.45 + Wr[1] * 0.55, z];
      const side = sideAt(c.fore, mid[1], mid[0]);
      return union(0.01, dressed,
        rbox([side[0], side[1], side[2] - 0.01], [s.forearm * 0.28, s.forearm * 0.24, 0.035], 0.02, M.SKIN_DARK, [0, 0.15, 0]),
        rbox(add(c.U, -0.01, 0.01, 0.03), [0.07, 0.05, 0.06], 0.022, M.SKIN_DARK, [0.2, 0.2, 0.3]),
      );
    },
  },
};

export function speciesSculpt(id: string | undefined): SpeciesSculpt {
  return SCULPTS[id as SpeciesId] ?? {};
}
