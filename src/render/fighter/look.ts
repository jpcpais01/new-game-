import type { BufferGeometry, Object3D, Vector3 } from 'three';
import { GEAR } from '../../sim/gear';
import { gearIds, type Appearance as SimAppearance } from '../../sim/loadout';
import type { FormId, GearSet } from '../../sim/types';
import type { PartSpec } from '../meshBuilder';
import { headLook, lookPalette } from './appearance';
import type { BodyForm } from './forms';
import { GEAR_MODELS } from './gearModels';

/**
 * Everything the renderer needs to build and animate one fighter. Gameplay
 * data (form, gear, appearance) is mapped to a FighterLook in one adapter, so
 * the rig never depends on the simulation's data model.
 */

/** How the main-hand weapon is held; picks stances and swing shapes. */
export type GripStyle = 'oneHand' | 'twoHand' | 'polearm' | 'dual' | 'staff' | 'fist' | 'bow';
/** What the off hand carries. */
export type OffhandStyle = 'none' | 'shield' | 'weapon' | 'focus';

/**
 * Who gets the left hand and arm, resolved once for any gear combination so
 * models and animation agree:
 * - `left`: what the left hand holds at rest. A bow, the second grip of a
 *   two-handed weapon, the second twin dagger or the parrying dagger, in that
 *   order; `free` lets a secondary (knives, crossbow, chakram) sit in it.
 * - `shield`: a shield straps to the left forearm, or is slung on the back
 *   when the left arm holds a bow.
 * - `twoHanded`: a two-hander or spear is gripped with both hands; with a
 *   shield on the arm it is wielded one-handed instead (spear and shield).
 * Items that lose the hand are carried instead: the parrying dagger and the
 * second twin dagger sheathed on the hip, the crossbow holstered (drawn to
 * shoot), throwing knives in the bandolier (one drawn to throw).
 */
export interface HandPlan {
  left: 'bow' | 'grip' | 'dagger' | 'parry' | 'free';
  shield: 'none' | 'arm' | 'back';
  twoHanded: boolean;
}

const SHIELDS = new Set<string>(['tower_shield', 'mirror_aegis']);

export function handPlan(gear: GearSet): HandPlan {
  const grip = gripOf(gear);
  const hasShield = !!gear.defense && SHIELDS.has(gear.defense);
  const shield: HandPlan['shield'] = !hasShield ? 'none' : grip === 'bow' ? 'back' : 'arm';
  const twoHanded = (grip === 'twoHand' || grip === 'polearm') && shield !== 'arm';
  let left: HandPlan['left'] = 'free';
  if (grip === 'bow') left = 'bow';
  else if (twoHanded) left = 'grip';
  else if (grip === 'dual' && shield !== 'arm') left = 'dagger';
  else if (gear.defense === 'parrying_blade' && shield !== 'arm') left = 'parry';
  return { left, shield, twoHanded };
}

export interface Appearance {
  skin: number;
  hair: number;
  eyes: number;
  /** Clothing: shirt, trousers and trims. */
  primary: number;
  secondary: number;
  accent: number;
  /** Leather/boots tone. */
  leather: number;
}

export interface FighterLook {
  /** Form id (see forms.ts). */
  form: string;
  appearance: Appearance;
  /** Face and hair style ids from head.ts registries (defaults when missing). */
  face?: string;
  hair?: string;
  grip: GripStyle;
  offhand: OffhandStyle;
  /** Who holds what in the left hand (see HandPlan). */
  hands: HandPlan;
  /** Gear, costume and accessory builders, run in order before baking. */
  decorators: RigDecorator[];
  /** A character's custom head (face, hair) built after the gear; replaces the face/hair presets. */
  head?: RigDecorator;
  /** Colour of team rim light / trail accents when no enchant overrides it. */
  accent: number;
}

/** Proportions resolved for a built rig (unscaled body space, metres). */
export interface BodyMetrics {
  form: BodyForm;
  headR: number;
  /** Head centre height in the HEAD bone's space. */
  headY: number;
  shoulderW: number;
  chestW: number;
  chestD: number;
  armR: number;
  foreR: number;
  thighR: number;
  calfR: number;
  handS: number;
  footS: number;
  upperArm: number;
  forearm: number;
  thigh: number;
  shin: number;
  /** HIPS bone rest height. */
  hipH: number;
  /** Foot bone (ankle) rest height. */
  ankleH: number;
}

/** Named attach points. Each is an Object3D parented to a bone. */
export interface Sockets {
  hips: Object3D;
  /** Belt line, front at +X. */
  belt: Object3D;
  spine: Object3D;
  chest: Object3D;
  /** Upper back between the shoulder blades (capes, quivers, sheaths). */
  back: Object3D;
  neck: Object3D;
  head: Object3D;
  /** Centre of the skull, same frame as head but offset to headY. */
  skull: Object3D;
  /** Top of the head (hats, plumes). */
  headTop: Object3D;
  /** Front of the face at eye height, +X out of the face. */
  face: Object3D;
  shoulderL: Object3D;
  shoulderR: Object3D;
  upperArmL: Object3D;
  upperArmR: Object3D;
  forearmL: Object3D;
  forearmR: Object3D;
  /** Left forearm mount for shields; face points forward (-Z of the shield is its face). */
  shieldArm: Object3D;
  /** Grip in the right hand; +Y runs along the blade/haft. */
  mainHand: Object3D;
  /** Grip in the left hand, same convention as mainHand. */
  offHand: Object3D;
  thighL: Object3D;
  thighR: Object3D;
  shinL: Object3D;
  shinR: Object3D;
  footL: Object3D;
  footR: Object3D;
}

export interface PartOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
}

/** Builder API handed to decorators (gear, hair, faces, costumes). */
export interface RigBuildApi {
  look: FighterLook;
  metrics: BodyMetrics;
  sockets: Sockets;
  appearance: Appearance;
  /** Adds a baked part under any socket/bone/group. A number spec is a plain colour. */
  part(parent: Object3D, g: BufferGeometry, spec: PartSpec | number, o?: PartOpts): Object3D;
  group(parent: Object3D, pos?: [number, number, number], rot?: [number, number, number]): Object3D;
  /** A swaying bone (capes, tails, ponytails). Animated by the view. */
  cloth(parent: Object3D, x: number, y: number, z: number, stiffness?: number): Object3D;
  /** An orbiting relic bone parented to the root. */
  orbiter(id: string): Object3D;
  /** Weapon trail / enchant particle anchors in mainHand space (offHand space for a bow, held in the left hand). */
  setWeapon(base: [number, number, number], tip: [number, number, number], hand?: 'main' | 'off'): void;
  /** Two-handed grip point in mainHand space: the left hand reaches it by IK. */
  setOffGrip(pos: [number, number, number] | null): void;
  /** Hide body pieces covered by gear (e.g. a robe hides the legs' trousers seams). */
  hide(what: 'hair' | 'ears'): void;
  isHidden(what: 'hair' | 'ears'): boolean;
  /** An extra animatable bone (parts under it move with it after baking). */
  bone(parent: Object3D, pos?: [number, number, number], rot?: [number, number, number]): Object3D;
  /** Registers a bone made with `bone()`/`cloth()` under a name the view can drive (e.g. 'phoenix'). */
  tag(name: string, o: Object3D): void;
}

export type RigDecorator = (api: RigBuildApi) => void;

export type { Vector3 };

// -----------------------------------------------------------------------------
// Adapter: sim character -> look
// -----------------------------------------------------------------------------

/** Default outfits per form when a character has no saved appearance yet. */
const FORM_LOOKS: Record<FormId, Appearance> = {
  balanced: { skin: 0xf0c49c, hair: 0x6a4228, eyes: 0x2a3f8a, primary: 0x3a6ad8, secondary: 0x2b3352, accent: 0xf3c24f, leather: 0x5a3e2a },
  robust: { skin: 0xc98a5c, hair: 0x3a2418, eyes: 0x3a2a1a, primary: 0x8a3a22, secondary: 0x4c3322, accent: 0xd9b04a, leather: 0x3d2a1e },
  agile: { skin: 0xf2d0b0, hair: 0x15121c, eyes: 0x1c1a2a, primary: 0xf2ecdf, secondary: 0x2c2d4c, accent: 0xd6283c, leather: 0x2b2633 },
  slender: { skin: 0xe8c4b2, hair: 0xe9ecff, eyes: 0x4a7a6a, primary: 0x6c3ad6, secondary: 0x2e2360, accent: 0x6ff3ff, leather: 0x3a2e50 },
  mighty: { skin: 0xb07a52, hair: 0xd8642a, eyes: 0x2a3a1a, primary: 0x2f7a5a, secondary: 0x3a3226, accent: 0xff8a2a, leather: 0x4a3020 },
  ethereal: { skin: 0xf6e0d4, hair: 0xb8e8ff, eyes: 0x3a8ab8, primary: 0xe8f2ff, secondary: 0x5a7ab0, accent: 0x7fd8ff, leather: 0x6a5a7a },
};
const FORM_HAIR: Record<FormId, string> = { balanced: 'short', robust: 'buzz', agile: 'topknot', slender: 'long', mighty: 'mohawk', ethereal: 'ponytail' };
const FORM_FACE: Record<FormId, string> = { balanced: 'default', robust: 'determined', agile: 'sharp', slender: 'gentle', mighty: 'fierce', ethereal: 'gentle' };

/** Minimal view of a fighter/character the adapter needs. */
export interface LookSource {
  form: FormId;
  gear: GearSet;
  look?: SimAppearance;
}

export function gripOf(gear: GearSet): GripStyle {
  return (GEAR.main[gear.main]?.weapon?.grip ?? 'oneHand') as GripStyle;
}

export function offhandOf(gear: GearSet, hands: HandPlan = handPlan(gear)): OffhandStyle {
  if (hands.shield === 'arm') return 'shield';
  if (hands.left === 'dagger' || hands.left === 'parry') return 'weapon';
  if (gear.offhand === 'frost_orb' && hands.left === 'free') return 'focus';
  return 'none';
}

/** Builds the render look for a character: form, colours, stance and gear models. */
export function lookFor(src: LookSource): FighterLook {
  const base = FORM_LOOKS[src.form] ?? FORM_LOOKS.balanced;
  const sim = src.look;
  // A creator look sets the skin, eye and hair colours and derives the outfit from its two colours.
  const pal = sim ? lookPalette(sim) : null;
  const appearance: Appearance = sim && pal
    ? { skin: sim.skin, hair: sim.hairColor, eyes: sim.eyeColor, primary: pal.main, secondary: pal.pants, accent: pal.trim, leather: pal.boots }
    : base;
  const grip = gripOf(src.gear);
  const hands = handPlan(src.gear);
  const decorators: RigDecorator[] = [];
  for (const id of gearIds(src.gear)) {
    const d = GEAR_MODELS[id];
    if (d) decorators.push(d);
  }
  return {
    form: src.form,
    appearance,
    face: FORM_FACE[src.form],
    hair: FORM_HAIR[src.form],
    head: sim ? headLook(sim) : undefined,
    grip,
    offhand: offhandOf(src.gear, hands),
    hands,
    decorators,
    accent: GEAR.main[src.gear.main]?.color ?? 0xffffff,
  };
}

/** Accent colour for a fighter's effects: its main weapon's colour. */
export function accentOf(f: { gear: GearSet }): number {
  return GEAR.main[f.gear.main]?.color ?? 0xffffff;
}
