import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { XBOW } from '../gear/models';
import { setWorldQuaternion, solveTwoBone } from './ik';
import { J } from './poses';
import type { Rig } from './rig';

const _aim = new Vector3();
const _up = new Vector3();
const _side = new Vector3();
const _z = new Vector3();
const _p = new Vector3();
const _p2 = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _qs = new Quaternion();
const _s = new Vector3();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _wrist = new Vector3();
const _pole = new Vector3();
const _target = new Vector3();

/** What the animator wants from the hand crossbow this frame. */
export interface XbowWant {
  /** 1 = in the left hand, 0 = on the hip holster (when the hand is busy). */
  hand: number;
  /** Left arm aims the crossbow (IK) instead of following the pose. */
  aim: number;
  /** 0..1: held low, pointed at the ground ahead. */
  low: number;
  /** Bolt loaded and string cocked. */
  loaded: boolean;
}

/**
 * Hand crossbow on top of the animated pose: drawn from the hip when the left
 * hand is free for it, aimed at the opponent's chest with the arm by IK, the
 * string snapping forward and the hand kicking up on the shot, then re-cocked
 * with a fresh bolt.
 */
export class CrossbowRig {
  private readonly xbow: Object3D;
  private readonly holster: Object3D | null;
  private readonly strings: [Object3D, Object3D];
  private readonly bolt: Object3D;
  private hand: number;
  private aim = 0;
  private low = 1;
  /** 1 cocked, 0 relaxed (overshoots below 0 when the string snaps). */
  private cock = 1;
  private cockVel = 0;
  private recoil = 0;
  private recoilVel = 0;
  private wasLoaded = true;

  static from(rig: Rig): CrossbowRig | null {
    return rig.tags.has('xbow') ? new CrossbowRig(rig) : null;
  }

  private constructor(private readonly rig: Rig) {
    const t = rig.tags;
    this.xbow = t.get('xbow')!;
    this.holster = t.get('xbowHolster') ?? null;
    this.strings = [t.get('xbowStringL')!, t.get('xbowStringR')!];
    this.bolt = t.get('xbowBolt')!;
    this.hand = this.holster ? 0 : 1;
  }

  /** True when the crossbow is always in the left hand (nothing else holds it). */
  get inHand(): boolean { return !this.holster; }

  apply(dt: number, want: XbowWant, lookAt: Vector3 | null, ws: number): void {
    const rig = this.rig;
    const j = rig.joints;
    const k = dt > 0 ? 1 - Math.exp(-dt * 16) : 1;
    this.aim += (want.aim - this.aim) * k;
    this.low += (want.low - this.low) * k;
    const handWant = this.holster ? want.hand : 1;
    this.hand += (handWant - this.hand) * (dt > 0 ? 1 - Math.exp(-dt * 22) : 1);

    if (dt > 0) {
      if (this.wasLoaded && !want.loaded) {
        // Shot: the string snaps forward and the hand kicks up.
        this.cock = 0.15;
        this.cockVel = -40;
        this.recoilVel += 9;
      }
      if (want.loaded) {
        this.cock += (1 - this.cock) * (1 - Math.exp(-dt * 10));
        this.cockVel = 0;
      } else {
        const steps = Math.ceil(dt / (1 / 240));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          this.cockVel += (-90 * 90 * this.cock - 2 * 0.12 * 90 * this.cockVel) * h;
          this.cock += this.cockVel * h;
          this.recoilVel += (-26 * 26 * this.recoil - 2 * 0.55 * 26 * this.recoilVel) * h;
          this.recoil += this.recoilVel * h;
        }
      }
      if (want.loaded) {
        this.recoil += (0 - this.recoil) * (1 - Math.exp(-dt * 12));
        this.recoilVel = 0;
      }
    }
    this.wasLoaded = want.loaded;

    // --- Arm: aim from the left shoulder at the opponent ------------------------
    const yaw = rig.root.rotation.y;
    _side.set(Math.sin(yaw), 0, Math.cos(yaw)); // the fighter's right
    const shoulder = j[J.UARM_L].getWorldPosition(_p2);
    const aimW = this.aim * this.hand;
    if (aimW > 0.01) {
      if (lookAt) {
        _aim.subVectors(lookAt, shoulder);
        _aim.y -= 0.3 * ws;
      } else _aim.set(Math.cos(yaw), 0, -Math.sin(yaw));
      _aim.addScaledVector(_side, -_aim.dot(_side));
      const horiz = Math.max(0.2, Math.hypot(_aim.x, _aim.z));
      _aim.y = Math.max(-0.35 * horiz, Math.min(0.35 * horiz, _aim.y)) / horiz;
      _aim.x /= horiz; _aim.z /= horiz;
      _aim.y += this.recoil - 0.6 * this.low;
      _aim.normalize();
      _up.set(0, 1, 0).addScaledVector(_aim, -_aim.y).normalize();
      _m.makeBasis(_aim, _up, _z.crossVectors(_aim, _up));
      _qs.setFromRotationMatrix(_m);
      const sock = rig.sockets.offHand;
      _q.copy(sock.quaternion).invert().premultiply(_qs);
      const reach = (rig.metrics.upperArm + rig.metrics.forearm) * ws * (0.9 - 0.15 * this.low);
      _target.copy(shoulder).addScaledVector(_aim, reach);
      _p.copy(sock.position).multiplyScalar(ws).applyQuaternion(_q);
      _wrist.copy(_target).sub(_p);
      j[J.FARM_L].getWorldPosition(_pole);
      _pole.addScaledVector(_side, -0.3 * ws).y -= 0.25 * ws;
      solveTwoBone(j[J.UARM_L], j[J.FARM_L], j[J.HAND_L], _wrist, _pole, aimW);
      setWorldQuaternion(j[J.HAND_L], _q, aimW);
    }

    // --- Where the crossbow is: hand or holster ----------------------------------
    this.xbow.position.set(0, 0, 0);
    this.xbow.quaternion.identity();
    this.xbow.scale.setScalar(1);
    if (this.holster && this.hand < 0.999) {
      rig.root.updateMatrixWorld(true);
      // Blend the world transform from the holster to the hand, then express it under the hand.
      this.holster.matrixWorld.decompose(_target, _q2, _s);
      const parent = this.xbow.parent!;
      parent.matrixWorld.decompose(_p, _q, _s);
      _p.lerp(_target, 1 - this.hand);
      _q.slerp(_q2, 1 - this.hand);
      _m.compose(_p, _q, _s);
      _m.premultiply(_m2.copy(parent.matrixWorld).invert());
      _m.decompose(this.xbow.position, this.xbow.quaternion, this.xbow.scale);
    }

    // --- String and bolt -----------------------------------------------------------
    const latchX = XBOW.tipX + (XBOW.cockX - XBOW.tipX) * Math.max(-0.25, this.cock);
    const dx = latchX - XBOW.tipX;
    const len = Math.hypot(dx, XBOW.tipZ);
    const [left, right] = this.strings;
    // Right half hangs along -Z, left half along +Z: swing each to the latch and stretch it.
    right.rotation.set(0, Math.atan2(-dx, XBOW.tipZ), 0);
    left.rotation.set(0, Math.atan2(dx, XBOW.tipZ), 0);
    right.scale.set(1, 1, len / XBOW.tipZ);
    left.scale.set(1, 1, len / XBOW.tipZ);
    this.bolt.position.x = latchX;
    this.bolt.scale.setScalar(want.loaded && this.cock > 0.9 ? 1 : 0.001);
    rig.root.updateMatrixWorld(true);
  }
}
