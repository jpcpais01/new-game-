import type { SpeciesId } from '../../character/species';
import type { FormMotion } from './forms';

/**
 * How each species is built and moves (render only). Proportions multiply the
 * Balanced body before the form reshapes it (see forms.ts shapeFor), so a
 * Robust Lop is still a big-headed Lop, just a stockier one. Heads, ears,
 * horns and tails are sculpted in sculpt/head.ts and sculpt/species.ts.
 */
export interface SpeciesBody {
  /** Overall height. */
  height: number;
  /** Leg, arm and torso length. */
  legs: number;
  arms: number;
  torso: number;
  /** Thickness of legs, torso depth and neck; of the arms. */
  bulk: number;
  limbBulk: number;
  /** Half widths: shoulder line, ribcage, waist, hips. */
  shoulders: number;
  chest: number;
  waist: number;
  hips: number;
  /** Head radius, hand and foot size. */
  head: number;
  hands: number;
  feet: number;
  /** Neck joint to head joint (m). */
  headLift: number;
  /** Extra forearm mass 0..1. */
  forePop: number;
  muscle: number;
  belly: number;
  /** Movement feel, met halfway by the form's. */
  motion: Partial<FormMotion>;
}

export const SPECIES_BODY: Record<SpeciesId, SpeciesBody> = {
  // Fox-folk: light and springy, a big head with tall ears, slim limbs.
  kitsu: {
    height: 0.97, legs: 1.06, arms: 1.0, torso: 0.92, bulk: 0.86, limbBulk: 0.88, shoulders: 0.92, chest: 0.9, waist: 0.8,
    hips: 0.95, head: 1.24, hands: 0.95, feet: 0.95, headLift: 0.085, forePop: 0, muscle: 0.25, belly: 0,
    motion: { lean: 9, bounce: 0.03, stepHeight: 0.17, omega: 19 },
  },
  // Little ogre: short legs, barrel body, low head, shovel hands.
  ogrin: {
    height: 0.88, legs: 0.7, arms: 0.98, torso: 0.96, bulk: 1.32, limbBulk: 1.3, shoulders: 1.26, chest: 1.3, waist: 1.5,
    hips: 1.3, head: 1.2, hands: 1.45, feet: 1.3, headLift: 0.035, forePop: 0.4, muscle: 0.7, belly: 0.8,
    motion: { omega: 12, zeta: 0.82, stepTime: 0.31, stepHeight: 0.1, bounce: 0.008, lean: 12, stance: 1.3, heavy: 0.9 },
  },
  // Spirit: tall, thin and long-limbed, drifting rather than walking.
  wisp: {
    height: 1.06, legs: 1.14, arms: 1.12, torso: 1.0, bulk: 0.7, limbBulk: 0.72, shoulders: 0.86, chest: 0.8, waist: 0.66,
    hips: 0.85, head: 1.04, hands: 0.86, feet: 0.78, headLift: 0.12, forePop: 0, muscle: 0, belly: 0,
    motion: { zeta: 0.52, bounce: 0.04, bounceHz: 0.8, lean: -3, heavy: 0.1, stepHeight: 0.18, armSwing: 0.6 },
  },
  // Burrower: a huge round head on a small sturdy body and big feet.
  lop: {
    height: 0.84, legs: 0.8, arms: 0.84, torso: 0.82, bulk: 0.98, limbBulk: 0.95, shoulders: 0.86, chest: 0.92, waist: 1.05,
    hips: 1.05, head: 1.62, hands: 1.1, feet: 1.35, headLift: 0.055, forePop: 0, muscle: 0.1, belly: 0.25,
    motion: { bounce: 0.045, bounceHz: 2.2, stepHeight: 0.18, stepTime: 0.22, heavy: 0.3 },
  },
  // Trickster: wiry and hunched, with long arms and big hands.
  imp: {
    height: 0.9, legs: 0.96, arms: 1.24, torso: 0.92, bulk: 0.76, limbBulk: 0.74, shoulders: 1.0, chest: 0.88, waist: 0.7,
    hips: 0.88, head: 1.16, hands: 1.25, feet: 1.0, headLift: 0.07, forePop: 0.1, muscle: 0.4, belly: 0,
    motion: { lean: 18, crouch: -0.06, omega: 21, bounce: 0.026, bounceHz: 2.4, armSwing: 1.3 },
  },
  // Living stone: top-heavy, tiny sunk head, huge forearms and fists.
  golem: {
    height: 1.06, legs: 0.78, arms: 1.14, torso: 1.04, bulk: 1.25, limbBulk: 1.35, shoulders: 1.42, chest: 1.42, waist: 1.0,
    hips: 1.1, head: 0.7, hands: 1.6, feet: 1.25, headLift: 0.02, forePop: 0.9, muscle: 0.9, belly: 0,
    motion: { omega: 10, zeta: 0.86, stepTime: 0.36, stepHeight: 0.09, bounce: 0.004, lean: 12, stance: 1.3, armSwing: 0.7, heavy: 1 },
  },
};

/** Eye placement in skull radii (right eye; mirrored for the left). */
export interface EyeSpec { x: number; y: number; z: number; r: number }

export interface SpeciesHead {
  /** Non-uniform head scale (depth, height, width): wide ogre heads, long fox heads. */
  scale: [number, number, number];
  eye: EyeSpec;
  /** Colour of the white of the eye. */
  sclera: number;
  /** Stone has no eyeballs: the eyes always glow. */
  glowEyes?: boolean;
  /** Hair is half self-lit (spirit flames). */
  hairGlow?: boolean;
}

export const SPECIES_HEAD: Record<SpeciesId, SpeciesHead> = {
  kitsu: { scale: [1, 1, 1], eye: { x: 0.62, y: -0.06, z: 0.39, r: 0.23 }, sclera: 0xfbf6ee },
  ogrin: { scale: [1, 0.94, 1.14], eye: { x: 0.66, y: 0.0, z: 0.4, r: 0.17 }, sclera: 0xf6f0d8 },
  wisp: { scale: [0.96, 1.06, 0.94], eye: { x: 0.6, y: -0.08, z: 0.4, r: 0.26 }, sclera: 0xf4fbff, hairGlow: true },
  lop: { scale: [1, 0.96, 1.04], eye: { x: 0.6, y: -0.12, z: 0.42, r: 0.27 }, sclera: 0xfbf8f4 },
  imp: { scale: [1, 1, 0.96], eye: { x: 0.64, y: -0.04, z: 0.38, r: 0.22 }, sclera: 0xffe9a0 },
  golem: { scale: [1, 0.92, 1.08], eye: { x: 0.72, y: 0.02, z: 0.36, r: 0.16 }, sclera: 0xffffff, glowEyes: true },
};
