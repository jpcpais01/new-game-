import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { BOW_STRING } from '../gear/models';
import { setWorldQuaternion, solveTwoBone } from './ik';
import { J } from './poses';
import type { Rig } from './rig';

const _anchor = new Vector3();
const _aim = new Vector3();
const _up = new Vector3();
const _side = new Vector3();
const _z = new Vector3();
const _p = new Vector3();
const _q = new Quaternion();
const _qs = new Quaternion();
const _m = new Matrix4();
const _wrist = new Vector3();
const _fingers = new Vector3();
const _pole = new Vector3();
const _target = new Vector3();

/** What the animator wants from the bow this frame (all 0..1). */
export interface BowWant {
  /** Bow arm raised and aimed (IK) instead of following the pose. */
  aim: number;
  /** How far the string is drawn. */
  draw: number;
  /** Right hand on the string (or following through after the loose). */
  hand: number;
  /** 0..1: bow lowered to a relaxed ready position, arrow pointing at the ground ahead. */
  low: number;
  /** 0..1: the hand has loosed the string and follows through past the jaw. */
  loose: number;
  /** Arrow on the string. */
  arrow: boolean;
  /** Extra draw shake for a heavy shot (radians-ish). */
  tremble: number;
}

/**
 * Bow handling on top of the animated pose: the left (bow) arm aims at the
 * opponent so the arrow line runs from the bow hand back to an anchor under
 * the chin; the right hand rides the string by IK; the string halves bend to
 * the nock point and twang after release; the nocked arrow slides with the
 * draw and disappears when loosed.
 */
export class BowRig {
  private readonly top: Object3D;
  private readonly bottom: Object3D;
  private readonly arrow: Object3D;
  private aim = 0;
  private hand = 0;
  private low = 1;
  private loose = 0;
  /** String draw (can overshoot past 0 when it twangs). */
  private draw = 0;
  private drawVel = 0;
  private readonly drawLen: number;

  static from(rig: Rig): BowRig | null {
    const t = rig.tags;
    return t.has('bowTop') && t.has('bowBottom') && t.has('arrow') ? new BowRig(rig) : null;
  }

  private constructor(private readonly rig: Rig) {
    this.top = rig.tags.get('bowTop')!;
    this.bottom = rig.tags.get('bowBottom')!;
    this.arrow = rig.tags.get('arrow')!;
    const m = rig.metrics;
    // A full draw brings the nock to the anchor: about one arm's length.
    this.drawLen = Math.min(BOW_STRING.arrowLen - 0.12, (m.upperArm + m.forearm) * 0.98);
  }

  apply(dt: number, want: BowWant, lookAt: Vector3 | null, ws: number): void {
    const rig = this.rig;
    const j = rig.joints;
    const k = dt > 0 ? 1 - Math.exp(-dt * 14) : 1;
    this.aim += (want.aim - this.aim) * k;
    this.low += (want.low - this.low) * k;
    const slow = dt > 0 ? 1 - Math.exp(-dt * 9) : 1;
    // Letting go is instant; reaching back for the string takes a moment.
    this.hand = want.hand < this.hand ? want.hand : this.hand + (want.hand - this.hand) * slow;
    this.loose = want.loose > this.loose ? want.loose : this.loose + (want.loose - this.loose) * slow;
    if (dt > 0) {
      if (this.hand > 0.5 && this.loose < 0.5) {
        // Held: the string follows the drawing hand smoothly.
        this.draw += (want.draw - this.draw) * (1 - Math.exp(-dt * 12));
        this.drawVel = 0;
      } else {
        // Loosed: a stiff, barely damped spring makes the string twang.
        const w = 70, z = 0.1;
        const steps = Math.ceil(dt / (1 / 240));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          this.drawVel += (-w * w * this.draw - 2 * z * w * this.drawVel) * h;
          this.draw += this.drawVel * h;
        }
      }
    }

    const head = j[J.HEAD];
    const m = rig.metrics;
    const r = m.headR;
    // Anchor: under the jaw on the drawing (right) side.
    _anchor.set(r * 0.45, m.headY - r * 0.85, r * 0.5);
    head.localToWorld(_anchor);

    // --- Bow arm: aim at the opponent ------------------------------------------
    const yaw = rig.root.rotation.y;
    _side.set(Math.sin(yaw), 0, Math.cos(yaw)); // the fighter's right
    if (lookAt) {
      _aim.subVectors(lookAt, _anchor);
      _aim.y -= 0.25 * ws; // the chest, not the head
    } else _aim.set(Math.cos(yaw), 0, -Math.sin(yaw));
    // Stay roughly level and in the fighting plane.
    _aim.addScaledVector(_side, -_aim.dot(_side));
    const horiz = Math.max(0.2, Math.hypot(_aim.x, _aim.z));
    _aim.y = Math.max(-0.35 * horiz, Math.min(0.35 * horiz, _aim.y));
    _aim.normalize();
    const low = this.low;
    if (low > 0.001) {
      // Ready position: bow held low in front, the arrow angled at the ground ahead.
      _anchor.y -= 0.34 * ws * low;
      _anchor.addScaledVector(_aim, 0.06 * ws * low);
      _aim.y -= 0.55 * low;
      _aim.normalize();
    }
    if (this.aim > 0.01) {
      // Bow canted (top towards the archer's left), more so when relaxed.
      _up.set(0, 1, 0).addScaledVector(_side, -0.12 - 0.22 * low);
      _up.addScaledVector(_aim, -_up.dot(_aim)).normalize();
      _m.makeBasis(_aim, _up, _z.crossVectors(_aim, _up));
      _qs.setFromRotationMatrix(_m);
      // Socket world rotation -> hand world rotation.
      const sock = rig.sockets.offHand;
      _q.copy(sock.quaternion).invert();
      _q.premultiply(_qs);
      // Bow socket position: one draw length (plus the string's offset) ahead of the anchor.
      _target.copy(_anchor).addScaledVector(_aim, (this.drawLen * (1 - 0.3 * low) + 0.025) * ws);
      _target.addScaledVector(_up, -BOW_STRING.arrowY * ws);
      _p.copy(sock.position).multiplyScalar(ws).applyQuaternion(_q);
      _wrist.copy(_target).sub(_p);
      // Elbow slightly bent and turned out, as an archer locks it.
      j[J.FARM_L].getWorldPosition(_pole);
      _pole.addScaledVector(_side, -0.3 * ws).y -= 0.2 * ws;
      solveTwoBone(j[J.UARM_L], j[J.FARM_L], j[J.HAND_L], _wrist, _pole, this.aim);
      setWorldQuaternion(j[J.HAND_L], _q, this.aim);
    }

    // --- String, arrow and drawing hand ----------------------------------------
    const tremble = this.hand > 0.5 && this.loose < 0.5 ? want.tremble : 0;
    const d = Math.max(-0.12, this.draw + tremble) * this.drawLen;
    const nx = -0.025 - d, ny = BOW_STRING.arrowY;
    const tip = BOW_STRING.tipY;
    for (const [bone, sy] of [[this.top, 1], [this.bottom, -1]] as const) {
      const dy = ny - sy * tip;
      const len = Math.hypot(-0.025 - nx, dy) || 1e-4;
      bone.position.set(-0.025, sy * tip, 0);
      // The half hangs along -Y (top) / +Y (bottom): turn it to the nock and stretch it.
      bone.rotation.set(0, 0, Math.atan2(sy * (nx + 0.025), sy * -dy));
      bone.scale.set(1, Math.max(0.05, len / tip), 1);
    }
    this.arrow.position.set(nx, ny, 0);
    this.arrow.scale.setScalar(want.arrow ? 1 : 0.001);

    if (this.hand > 0.01) {
      rig.root.updateMatrixWorld(true);
      _target.set(nx, ny, 0);
      rig.sockets.offHand.localToWorld(_target);
      if (this.loose > 0.001) {
        // Follow-through: the loosing hand carries on back along the jaw line.
        _p.copy(_anchor).addScaledVector(_aim, -0.14 * ws).addScaledVector(_side, 0.07 * ws);
        _p.y += 0.03 * ws;
        _target.lerp(_p, this.loose);
      }
      // Fingers on the string: solve for the wrist, then correct by where the fingers landed.
      const handR = j[J.HAND_R];
      _wrist.copy(_target);
      for (let it = 0; it < 2; it++) {
        j[J.FARM_R].getWorldPosition(_pole);
        _pole.addScaledVector(_side, 0.35 * ws).y += 0.1 * ws;
        solveTwoBone(j[J.UARM_R], j[J.FARM_R], handR, _wrist, _pole, this.hand);
        rig.sockets.mainHand.getWorldPosition(_fingers);
        _wrist.add(_p.subVectors(_target, _fingers).multiplyScalar(this.hand));
      }
    }
    rig.root.updateMatrixWorld(true);
  }
}
