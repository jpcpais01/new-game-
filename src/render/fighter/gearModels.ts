import { SKIN_BY_ID } from '../../gear/skins';
import type { GearId } from '../../sim/types';
import { gearDecorator } from '../gear/models';
import { SKIN_MODELS } from '../gear/skins';
import type { RigDecorator } from './look';

/**
 * 3D models for gear, keyed by gear id and skin. Each entry is a decorator that
 * adds baked parts to the rig's sockets. The models themselves live in
 * src/render/gear/models.ts (and gear/skins/ for skins) and are chosen from the
 * item's art (gear/itemArt.ts, gear/skins.ts), so the 3D piece always matches
 * its icon.
 */
const cache = new Map<string, RigDecorator>();

export function gearModel(id: GearId, skin?: string): RigDecorator {
  const s = skin ? SKIN_BY_ID[skin] : undefined;
  const sk = s && s.gear === id ? s : null;
  const key = sk ? `${id}:${sk.id}` : id;
  let d = cache.get(key);
  if (!d) { d = gearDecorator(id, sk, sk ? SKIN_MODELS[sk.id] ?? null : null); cache.set(key, d); }
  return d;
}
