import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import type { Holdable } from './look';
import type { Rig } from './rig';

/** Where a left-hand item is: in a hand, where it is carried, or out of sight (thrown). */
export type Spot = 'L' | 'R' | 'carry' | 'gone';

interface Held {
  item: Holdable;
  bone: Object3D;
  /** Carried spot (sheath, holster, back); null when the item has none (knives). */
  carry: Object3D | null;
  /** Where the bone is parented: the left hand, or its carried spot. */
  rest: Spot;
  from: Spot;
  to: Spot;
  /** 0..1 progress from `from` to `to`. */
  t: number;
}

const ITEMS: Holdable[] = ['dagger', 'parry', 'xbow', 'knives', 'chakram'];
/** Draw/sheathe speed (1 / seconds). */
const RATE = 8;

const _a = new Matrix4();
const _b = new Matrix4();
const _pa = new Vector3();
const _pb = new Vector3();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _sa = new Vector3();
const _sb = new Vector3();

/**
 * Moves left-hand items (second dagger, parrying dagger, crossbow, knives,
 * chakram) between the hands and where they are carried, following the
 * HandPlan: each rests where the plan puts it, and the animator asks for an
 * item in a hand while an ability uses it. Each item's bone is modelled in the
 * hand's grip frame, so a hand socket, a sheath or a holster is just a world
 * transform to blend towards.
 */
export class Holder {
  private readonly held: Held[] = [];
  /** Where each item should be this frame; items left out go back to rest. */
  readonly want: Partial<Record<Holdable, Spot>> = {};

  static from(rig: Rig): Holder | null {
    const h = new Holder(rig);
    return h.held.length ? h : null;
  }

  private constructor(private readonly rig: Rig) {
    for (const item of ITEMS) {
      const bone = rig.tags.get(`hold:${item}`);
      if (!bone) continue;
      const carry = rig.tags.get(`carry:${item}`) ?? null;
      const rest: Spot = rig.look.hands.left === item ? 'L' : 'carry';
      this.held.push({ item, bone, carry, rest, from: rest, to: rest, t: 1 });
    }
  }

  /** Where an item rests when nothing uses it. */
  restOf(item: Holdable): Spot | null {
    return this.held.find((h) => h.item === item)?.rest ?? null;
  }

  /** The bone an item is modelled on (null when the loadout lacks it). */
  bone(item: Holdable): Object3D | null {
    return this.held.find((h) => h.item === item)?.bone ?? null;
  }

  /** Clears this frame's requests (everything heads back to rest). */
  reset(): void {
    for (const item of ITEMS) delete this.want[item];
  }

  /** Places every item; call after the arms have their final pose. */
  apply(dt: number): void {
    let synced = false;
    for (const h of this.held) {
      const want = this.want[h.item] ?? h.rest;
      if (want !== h.to) {
        // Retargeting mid-move starts from whichever end it was closer to.
        h.from = h.t < 0.5 ? h.from : h.to;
        h.to = want;
        h.t = 0;
      }
      h.t = dt > 0 ? Math.min(1, h.t + dt * RATE) : 1;
      const bone = h.bone;
      if (h.t >= 1 && h.to === h.rest) {
        bone.position.set(0, 0, 0);
        bone.quaternion.identity();
        bone.scale.setScalar(h.rest === 'carry' && !h.carry ? 0.001 : 1);
        continue;
      }
      if (!synced) { this.rig.root.updateMatrixWorld(true); synced = true; }
      const a = this.spot(h, h.from), b = this.spot(h, h.to);
      const k = h.t * h.t * (3 - 2 * h.t);
      // An item that appears or vanishes (knives, a thrown chakram) pops at the midpoint.
      const visible = !!(k < 0.5 ? a : b);
      const from = a ?? b, to = b ?? a;
      if (!from || !to) { bone.scale.setScalar(0.001); continue; }
      from.matrixWorld.decompose(_pa, _qa, _sa);
      to.matrixWorld.decompose(_pb, _qb, _sb);
      _pa.lerp(_pb, k);
      _qa.slerp(_qb, k);
      _sa.lerp(_sb, k);
      _a.compose(_pa, _qa, _sa);
      _a.premultiply(_b.copy(bone.parent!.matrixWorld).invert());
      _a.decompose(bone.position, bone.quaternion, bone.scale);
      if (!visible) bone.scale.setScalar(0.001);
    }
  }

  private spot(h: Held, s: Spot): Object3D | null {
    const k = this.rig.sockets;
    return s === 'L' ? k.offHand : s === 'R' ? k.mainHand : s === 'carry' ? h.carry : null;
  }
}
