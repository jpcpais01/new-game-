import type { SkinModel } from '../models';
import { DAWNBRINGER } from './dawnbringer';
import { HELLFORGE } from './hellforge';
import { NEON } from './neon';
import { RIMEBORN } from './rimeborn';
import { VOIDBORNE } from './voidborne';
import { WILDWOOD } from './wildwood';

/** 3D models of every skin that brings its own shape, keyed by skin id (gear/skins.ts). */
export const SKIN_MODELS: Record<string, SkinModel> = {
  ...HELLFORGE,
  ...RIMEBORN,
  ...DAWNBRINGER,
  ...VOIDBORNE,
  ...WILDWOOD,
  ...NEON,
};
