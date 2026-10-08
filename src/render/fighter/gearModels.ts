import { GEAR_BY_ID } from '../../sim/gear';
import type { GearId } from '../../sim/types';
import { gearDecorator } from '../gear/models';
import type { RigDecorator } from './look';

/**
 * 3D models for gear, keyed by gear id. Each entry is a decorator that adds
 * baked parts to the rig's sockets. The models themselves live in
 * src/render/gear/models.ts and are chosen from the item's art (gear/itemArt.ts),
 * so the 3D piece always matches its icon.
 */
export const GEAR_MODELS: Partial<Record<GearId, RigDecorator>> = {};
for (const id of Object.keys(GEAR_BY_ID) as GearId[]) GEAR_MODELS[id] = gearDecorator(id);
