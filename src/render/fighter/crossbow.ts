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
const _qs = new Quaternion();
const _m = new Matrix4();
const _wrist = new Vector3();
const _pole = new Vector3();
const _target = new Vector3();

/** What the animator wants from the hand crossbow this frame. */
export interface XbowWant {
  /** The hand holding it (where fighter/holder.ts put it). */
  side: 'L' | 'R';
  /** That arm aims the crossbow (IK) instead of following the pose. */
  aim: number;
  /** 0..1: held low, pointed at the ground ahead. */
  low: number;
  /** Bolt loaded and string cocked. */
  loaded: boolean;
}

/**
 * Hand crossbow on top of the animated pose: aimed at the opponent's chest by
 * IK on the arm holding it (the left, or an archer's right), the string
 * snapping forward and the hand kicking up on the shot, then re-cocked with a
 * fresh bolt. Where it is held or carried is fighter/holder.ts's job.
 */
export class CrossbowRig {
  private readonly xbow: Object3D;
  private readonly strings: [Object3D, Object3D];
  private readonly bolt: Object3D;
  private aim = 0;
  private low = 1;
  private side: 'L' | 'R' = 'L';
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
    this.strings = [t.get('xbowStringL')!, t.get('xbowStringR')!];
    this.bolt = t.get('xbowBolt')!;
  }

  /** World position of the muzzle (where bolts leave). */
  muzzle(out: Vector3): Vector3 {
    return this.xbow.localToWorld(out.set(XBOW.tipX, 0, 0));
  }

  /** Aims the holding arm; call before the holder places the crossbow in that hand. */
  aimArm(dt: number, want: XbowWant, lookAt: Vector3 | null, ws: number): void {
    const rig = this.rig;
    const j = rig.joints;
    const k = dt > 0 ? 1 - Math.exp(-dt * 16) : 1;
    if (want.side !== this.side) { this.side = want.side; this.aim = 0; }
    this.aim += (want.aim - this.aim) * k;
    this.low += (want.low - this.low) * k;

    // --- Arm: aim from the shoulder at the opponent ------------------------------
    const yaw = rig.root.rotation.y;
    _side.set(Math.sin(yaw), 0, Math.cos(yaw)); // the fighter's right
    const left = this.side === 'L';
    const [uarm, farm, hand] = left ? [j[J.UARM_L], j[J.FARM_L], j[J.HAND_L]] : [j[J.UARM_R], j[J.FARM_R], j[J.HAND_R]];
    const shoulder = uarm.getWorldPosition(_p2);
    const aimW = this.aim;
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
      const sock = left ? rig.sockets.offHand : rig.sockets.mainHand;
      _q.copy(sock.quaternion).invert().premultiply(_qs);
      const reach = (rig.metrics.upperArm + rig.metrics.forearm) * ws * (0.9 - 0.15 * this.low);
      _target.copy(shoulder).addScaledVector(_aim, reach);
      _p.copy(sock.position).multiplyScalar(ws).applyQuaternion(_q);
      _wrist.copy(_target).sub(_p);
      farm.getWorldPosition(_pole);
      _pole.addScaledVector(_side, (left ? -0.3 : 0.3) * ws).y -= 0.25 * ws;
      solveTwoBone(uarm, farm, hand, _wrist, _pole, aimW);
      setWorldQuaternion(hand, _q, aimW);
    }
  }

  /** String, bolt and shot timing (local to the crossbow; any order). */
  apply(dt: number, want: XbowWant): void {
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
  }
}
