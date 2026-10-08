import { Quaternion, Vector3 } from 'three';
import { clamp, easeOutCubic, smoothstep } from '../../core/math';
import { getStatus, type Fighter } from '../../sim/fighter';
import type { BodyForm } from './forms';
import { Gait } from './gait';
import { setWorldQuaternion, solveTwoBone } from './ik';
import {
  actionPoses, addPose, HIPS_X, HIPS_Y, HURT_ADD, J, JOINT_COUNT, KO_FALL, KO_POSE, lerpPose, POSE_SIZE, stance,
  victoryPose, type Pose,
} from './poses';
import type { Rig } from './rig';

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _pole = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _fwd = new Vector3();
const _Z = new Vector3(0, 0, 1);
const desired: [Vector3, Vector3] = [new Vector3(), new Vector3()];
const hipL = new Vector3();
const hipR = new Vector3();
const ease = (t: number) => t * t * (3 - 2 * t);

/** Anims whose motion needs the off hand free, so a two-handed grip lets go. */
const FREE_OFFHAND = new Set(['roar', 'castBig', 'cast', 'bash', 'blink', 'throw', 'shoot']);

/**
 * Drives a rig from simulation state. Layers, in order:
 *  1. Target pose: stance for the weapon grip and form, action keyframes
 *     (anticipation, snap, follow-through, recovery), locomotion, reactions.
 *  2. A damped spring per channel moves the pose towards the target, so every
 *     transition has weight and overshoot that depends on the body form.
 *  3. Procedural feet: planted feet, alternating steps, hip drop to keep reach.
 *  4. Two-bone IK for legs (feet stay on the ground) and for the off hand on
 *     two-handed weapons, plus heel-toe roll and head look-at.
 */
export class Animator {
  readonly pose: Pose = new Float32Array(POSE_SIZE);
  private readonly vel: Float32Array = new Float32Array(POSE_SIZE);
  private readonly target: Pose = new Float32Array(POSE_SIZE);
  readonly gait = new Gait();
  private omega = 16;
  private zeta = 0.7;
  private plant = 1;
  private roll = 0;
  private koT = 0;
  private time = 0;
  private hipDrop = 0;
  private gripW = 0;
  private wasAir = false;
  private swing = 0;
  private lastAction: unknown = null;
  private flinch = 0;
  private runBlend = 0;
  /** World position the head looks at (the opponent's head), if any. */
  readonly lookAt = new Vector3();
  hasLookAt = false;
  /** Set when a foot lands or the body lands from the air (for dust). */
  landing = 0;

  constructor(private readonly rig: Rig, private readonly form: BodyForm) {
    this.pose.set(stance(rig.look.grip, rig.look.offhand, form));
  }

  private get ready(): Pose { return stance(this.rig.look.grip, this.rig.look.offhand, this.form); }

  /** Physical flinch: kicks the spring velocities. `from` is +1 when hit from the front. */
  hit(heavy: boolean, from = 1, blocked = false): void {
    const m = this.form.motion;
    const k = (heavy ? 1.6 : 1) * (blocked ? 0.45 : 1) * (1.25 - m.heavy * 0.55) * from;
    const v = this.vel;
    v[J.SPINE * 3 + 2] += 5 * k;
    v[J.CHEST * 3 + 2] += 9 * k;
    v[J.NECK * 3 + 2] += 6 * k;
    v[J.HEAD * 3 + 2] += 12 * k;
    v[J.HEAD * 3] += (Math.random() - 0.5) * 6 * k;
    v[J.UARM_L * 3 + 2] -= 6 * k;
    v[J.UARM_R * 3 + 2] -= 4 * k;
    v[HIPS_X] -= 0.9 * k;
    v[HIPS_Y] -= 0.5 * Math.abs(k);
    this.flinch = Math.max(this.flinch, heavy ? 1 : 0.6);
  }

  /** A successful parry: quick snap of the weapon arm. */
  parry(): void {
    this.vel[J.UARM_R * 3 + 2] += 14;
    this.vel[J.FARM_R * 3 + 2] -= 10;
    this.vel[J.CHEST * 3 + 1] += 6;
  }

  update(f: Fighter, dt: number, over: boolean, winner: boolean): void {
    if (dt <= 0) { this.apply(f, 0); return; }
    this.time += dt;
    const frozen = !!getStatus(f, 'frozen');
    if (frozen) {
      this.vel.fill(0);
      this.apply(f, 0);
      return;
    }
    this.computeTarget(f, over, winner, dt);
    this.integrate(dt);
    this.apply(f, dt);
  }

  // ---------------------------------------------------------------------------
  // 1. Target pose
  // ---------------------------------------------------------------------------

  private computeTarget(f: Fighter, over: boolean, winner: boolean, dt: number): void {
    const m = this.form.motion;
    const look = this.rig.look;
    const ready = this.ready;
    const t = this.target;
    t.set(ready);
    this.omega = m.omega;
    this.zeta = m.zeta;
    this.plant = 1;
    this.roll = 0;
    this.flinch = Math.max(0, this.flinch - dt * 3);
    let gripWant = this.rig.offGrip ? 1 : 0;

    if (!f.alive) {
      this.koT += dt;
      const k = this.koT;
      if (k < 0.22) {
        for (let i = 0; i < POSE_SIZE; i++) t[i] += (HURT_ADD[i]) * 1.6;
        this.omega = m.omega * 1.4;
      } else if (k < 0.55) {
        t.set(KO_FALL);
        this.omega = 12;
        this.zeta = 0.75;
        this.plant = 1 - smoothstep(0.3, 0.5, k);
      } else {
        t.set(KO_POSE);
        this.omega = 13;
        this.zeta = 0.42; // a little bounce when the body hits the ground
        this.plant = 0;
        // Settle: tiny breathing so the body isn't a statue.
        t[J.CHEST * 3 + 2] += Math.sin(this.time * 2) * 0.015;
      }
      gripWant = 0;
      this.gripW += (gripWant - this.gripW) * Math.min(1, dt * 10);
      return;
    }
    this.koT = 0;

    if (over && winner) {
      lerpPose(t, ready, victoryPose(look.grip, look.offhand, this.form), 1);
      // Cheer: a couple of hops.
      t[HIPS_Y] += Math.abs(Math.sin(this.time * 4.2)) * 0.05 * (1 - m.heavy * 0.5);
      this.omega = m.omega * 0.7;
      gripWant = 0;
    } else if (f.action) {
      gripWant = this.actionTarget(f, gripWant);
    } else {
      this.locomotion(f, dt);
    }

    // --- Additive layers ---
    const breath = Math.sin(this.time * (2.2 + (f.stats.maxHp > f.hp * 2 ? 1.4 : 0)));
    t[J.CHEST * 3 + 2] += breath * 0.035;
    t[J.SPINE * 3 + 2] += breath * 0.01;
    t[J.HEAD * 3 + 2] -= breath * 0.02;
    t[J.CLAV_L * 3 + 2] += breath * 0.03;
    t[J.CLAV_R * 3 + 2] += breath * 0.03;

    // Head tracks the opponent.
    if (this.hasLookAt && f.alive) {
      this.rig.joints[J.HEAD].getWorldPosition(_a);
      const dx = Math.abs(this.lookAt.x - _a.x);
      const dy = this.lookAt.y - _a.y;
      const ang = clamp(Math.atan2(dy, Math.max(0.4, dx)), -0.55, 0.6);
      t[J.NECK * 3 + 2] += ang * 0.35;
      t[J.HEAD * 3 + 2] += ang * 0.55;
    }

    if (getStatus(f, 'stun')) {
      const w = this.time * 6;
      t[J.HEAD * 3] += Math.sin(w) * 0.3;
      t[J.CHEST * 3] += Math.sin(w + 1) * 0.15;
      t[J.SPINE * 3 + 2] += 0.1;
      t[J.UARM_R * 3 + 2] = 0.15; t[J.UARM_L * 3 + 2] = 0.1;
      t[J.FARM_R * 3 + 2] = 0.3; t[J.FARM_L * 3 + 2] = 0.3;
      t[HIPS_Y] -= 0.1;
      t[HIPS_X] += Math.sin(w * 0.5) * 0.04;
      gripWant = 0;
    }

    // Staggered or freshly hit: hold a flinch shape on top of whatever is playing.
    const h = Math.max(this.flinch * 0.7, f.stagger > 0 ? 0.6 : 0);
    if (h > 0) for (let i = 0; i < POSE_SIZE; i++) t[i] += HURT_ADD[i] * h;

    // Airborne (knockback or jumps that aren't leaps): tuck the legs.
    const ab = f.action ? f.abilities[f.action.ability] : null;
    if (f.y > 0.15 && !(ab && ab.airborne)) {
      addPose(t, { THIGH_L: 40, SHIN_L: -60, THIGH_R: 20, SHIN_R: -40, SPINE: 10, UARM_L: 30, UARM_R: 20 }, clamp(f.y / 0.6, 0, 1));
    }

    this.gripW += (gripWant - this.gripW) * Math.min(1, dt * 12);
  }

  private actionTarget(f: Fighter, gripWant: number): number {
    const a = f.action!;
    const ab = f.abilities[a.ability];
    const look = this.rig.look;
    const m = this.form.motion;
    const t = this.target;
    const ready = this.ready;
    if (a !== this.lastAction) {
      this.lastAction = a;
      if (ab.slot === 'basic') this.swing++;
    }
    const ap = actionPoses(look.grip, look.offhand, this.form, ab.anim);
    const useAlt = !!ap.alt && this.swing % 2 === 0 && ab.slot === 'basic';
    const W = useAlt ? ap.alt!.windup : ap.windup;
    const S = useAlt ? ap.alt!.strike : ap.strike;
    if (FREE_OFFHAND.has(ab.anim)) gripWant = 0;
    const evade = ab.slot === 'evade';
    const fwd = a.dir === f.facing;

    if (a.feint) {
      lerpPose(t, W, ready, easeOutCubic(clamp(a.t / a.recovery, 0, 1)));
      this.omega = m.omega * 1.5;
    } else if (a.phase === 'windup') {
      const k = clamp(a.t / a.windup, 0, 1);
      lerpPose(t, ready, W, ease(Math.min(1, k * 1.25)));
      this.omega = m.omega * (ab.heavy ? 0.9 : 1.3);
      if (ab.heavy && k > 0.6) {
        // Telegraph: the body trembles with stored power before a heavy blow.
        const tr = (k - 0.6) * 0.06;
        t[J.CHEST * 3 + 1] += Math.sin(this.time * 55) * tr;
        t[J.UARM_R * 3 + 2] += Math.sin(this.time * 47) * tr;
      }
      if (evade) addPose(t, { HIPS: fwd ? -18 : 14, CHEST: fwd ? -10 : 10, hipsY: -0.12 });
      if (ab.kind === 'dash' && !evade) this.plant = 1;
    } else if (a.phase === 'active') {
      if (ab.anim === 'flurry') {
        const hits = ab.hits ?? 1;
        const k = (a.t / a.active) * hits;
        const ph = k - Math.floor(k);
        const even = Math.floor(k) % 2 === 0;
        lerpPose(t, even ? W : S, even ? S : W, easeOutCubic(clamp(ph * 2, 0, 1)));
        this.omega = m.omega * 4;
      } else {
        const k = clamp(a.t / Math.min(0.08, a.active), 0, 1);
        lerpPose(t, W, S, easeOutCubic(k));
        this.omega = Math.max(m.omega * 3, 40);
        this.zeta = Math.min(this.zeta, 0.6);
      }
      if (evade) {
        const p = clamp(a.t / a.active, 0, 1);
        if (a.through) {
          // Shadow roll: tuck and roll forward through the enemy.
          addPose(t, { SPINE: -30, CHEST: -40, NECK: -20, HEAD: -20, THIGH_L: 90, SHIN_L: -120, THIGH_R: 80, SHIN_R: -120, UARM_L: 60, UARM_R: 60, FARM_L: 60, FARM_R: 60, hipsY: -0.5 });
          this.roll = -Math.PI * 2 * ease(p);
          this.plant = 0;
        } else if (ab.airborne) {
          // Back leap: a backflip when leaping away.
          addPose(t, { THIGH_L: 70, SHIN_L: -100, THIGH_R: 60, SHIN_R: -100, SPINE: 20, CHEST: 20 });
          this.roll = (fwd ? -1 : 1) * Math.PI * 2 * ease(p);
          this.plant = 0;
        } else {
          addPose(t, { HIPS: fwd ? -28 : 20, CHEST: fwd ? -14 : 14, hipsY: -0.15 });
          this.plant = 0.4;
        }
      }
      if (ab.kind === 'dash' && !evade) this.plant = 0;
    } else {
      const r = clamp(a.t / a.recovery, 0, 1);
      // Follow-through: carry past the strike a little, hold, then settle back.
      const follow = Math.max(0, 1 - r * 3.5) * 0.12;
      for (let i = 0; i < POSE_SIZE; i++) t[i] = S[i] + (S[i] - W[i]) * follow;
      const back = ease(clamp((r - 0.28) / 0.72, 0, 1));
      lerpPose(t, t, ready, back);
      this.omega = m.omega * 1.1;
    }
    return gripWant;
  }

  private locomotion(f: Fighter, dt: number): void {
    const m = this.form.motion;
    const t = this.target;
    const speed = Math.abs(f.vx);
    const moving = clamp(speed / 3.2, 0, 1);
    const back = Math.sign(f.vx) !== f.facing ? -1 : 1;
    // Sustained fast movement turns the fighting shuffle into a real run.
    const runWant = Math.max(smoothstep(2.4, 3.8, speed) * (back > 0 ? 1 : 0.4), moving * 0.45);
    this.runBlend += (runWant - this.runBlend) * Math.min(1, dt * 5);
    const rb = this.runBlend;
    if (rb > 0.01) {
      // Neutral legs (feet under the hips) so the gait alternates and crosses.
      addPose(t, {
        THIGH_L: [0, 0, -t[J.THIGH_L * 3 + 2] * 57.3 + 4], SHIN_L: [0, 0, -t[J.SHIN_L * 3 + 2] * 57.3 - 8],
        THIGH_R: [0, 0, -t[J.THIGH_R * 3 + 2] * 57.3 + 4], SHIN_R: [0, 0, -t[J.SHIN_R * 3 + 2] * 57.3 - 8],
      }, rb);
    }
    // Lean into the movement; arms counter-swing with the feet.
    const [fl, fr] = this.gait.feet;
    this.rig.root.getWorldDirection(_fwd); // +Z of root; forward is +X rotated by yaw
    const yaw = this.rig.root.rotation.y;
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const stride = ((fl.pos.x - fr.pos.x) * fx + (fl.pos.z - fr.pos.z) * fz) / 0.5;
    const sw = clamp(stride, -1.2, 1.2) * moving * m.armSwing;
    addPose(t, {
      SPINE: -6 * moving * back - 6 * rb, CHEST: [0, 8 * sw, -4 * moving * back], HIPS: [0, -6 * sw, 0],
      UARM_L: [0, 0, -26 * sw * (0.5 + rb)], FARM_L: [0, 0, 20 * rb],
      UARM_R: [0, 0, 18 * sw * (0.3 + rb)],
      hipsX: 0.04 * moving * back,
    });
    // Combat bounce while standing, weight shift between the feet.
    const idle = 1 - moving;
    const ph = this.time * Math.PI * 2 * m.bounceHz;
    t[HIPS_Y] += (Math.sin(ph) * m.bounce) * idle;
    t[HIPS_X] += Math.sin(ph * 0.5) * 0.015 * idle;
    t[J.HIPS * 3] += Math.sin(ph * 0.5) * 0.04 * idle;
  }

  // ---------------------------------------------------------------------------
  // 2. Springs
  // ---------------------------------------------------------------------------

  private integrate(dt: number): void {
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    const w = this.omega, w2 = w * w, c = 2 * this.zeta * w;
    const x = this.pose, v = this.vel, t = this.target;
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < POSE_SIZE; i++) {
        v[i] += (w2 * (t[i] - x[i]) - c * v[i]) * h;
        x[i] += v[i] * h;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3-4. Apply, feet, IK
  // ---------------------------------------------------------------------------

  private apply(f: Fighter, dt: number): void {
    const rig = this.rig;
    const j = rig.joints;
    const p = this.pose;
    for (let i = 0; i < JOINT_COUNT; i++) j[i].rotation.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    const hips = j[J.HIPS];
    hips.position.set(p[HIPS_X], rig.metrics.hipH + p[HIPS_Y], 0);
    if (this.roll) {
      _q.setFromAxisAngle(_Z, this.roll);
      hips.quaternion.premultiply(_q);
    }
    rig.root.updateMatrixWorld(true);

    // World scale of the body (form scale x gear scale).
    const ws = rig.body.getWorldScale(_c).y;
    const air = f.y > 0.04;
    if (this.wasAir && !air) {
      // Landing: absorb the impact with the knees.
      this.vel[HIPS_Y] -= 1.6 + this.form.motion.heavy * 1.4;
      this.vel[J.CHEST * 3 + 2] -= 2;
      this.landing = 1;
    }
    this.wasAir = air;

    // Feet.
    const fl = j[J.FOOT_L], fr = j[J.FOOT_R];
    fl.getWorldPosition(desired[0]);
    fr.getWorldPosition(desired[1]);
    const groundY = rig.root.parent ? 0 : 0;
    const ankleY = groundY + rig.metrics.ankleH * ws;
    const speed = Math.abs(f.vx);
    const ground = air || speed > 8 ? 0 : this.plant;
    const m = this.form.motion;
    const stepT = m.stepTime;
    const threshold = Math.max(0.13 * ws, speed * stepT * 0.55);
    if (dt > 0) {
      j[J.THIGH_L].getWorldPosition(hipL);
      j[J.THIGH_R].getWorldPosition(hipR);
      const legLen = (rig.metrics.thigh + rig.metrics.shin) * ws;
      this.gait.update(dt, desired, {
        ankleY, vx: f.vx, stepTime: stepT, stepHeight: m.stepHeight * ws, threshold, ground, hips: [hipL, hipR], reach: legLen * 0.62,
      });
      if (this.gait.landed[0] || this.gait.landed[1]) this.landing = Math.max(this.landing, 0.4);
    }
    const feet = this.gait.feet;

    // Hip drop so both planted feet stay in reach.
    const reach = (rig.metrics.thigh + rig.metrics.shin) * ws * 0.985;
    let drop = 0;
    for (let i = 0; i < 2; i++) {
      if (feet[i].ground < 0.5) continue;
      j[i === 0 ? J.THIGH_L : J.THIGH_R].getWorldPosition(_a);
      const tgt = feet[i].pos;
      const hz = Math.hypot(_a.x - tgt.x, _a.z - tgt.z);
      const vy = _a.y - tgt.y;
      if (hz >= reach) { drop = Math.max(drop, vy); continue; }
      const maxV = Math.sqrt(reach * reach - hz * hz);
      if (vy > maxV) drop = Math.max(drop, vy - maxV);
    }
    // A little drop keeps planted feet down; more than that would read as a squat, so the leg straightens instead.
    drop = Math.min(drop, 0.14 * ws);
    const k = dt > 0 ? Math.min(1, dt * (drop > this.hipDrop ? 30 : 10)) : 1;
    this.hipDrop += (drop - this.hipDrop) * k;
    if (this.hipDrop > 1e-4) {
      hips.position.y -= this.hipDrop / ws;
      rig.root.updateMatrixWorld(true);
    }

    // Leg IK towards the gait targets; the FK knee (nudged forward) is the pole.
    const yaw = rig.root.rotation.y;
    _q2.setFromAxisAngle(_Y, yaw);
    for (let i = 0; i < 2; i++) {
      const foot = feet[i];
      const th = j[i === 0 ? J.THIGH_L : J.THIGH_R], sh = j[i === 0 ? J.SHIN_L : J.SHIN_R], ft = i === 0 ? fl : fr;
      if (foot.ground < 0.01 && !foot.stepping) continue;
      sh.getWorldPosition(_pole);
      _fwd.set(Math.cos(yaw), 0, -Math.sin(yaw));
      _pole.addScaledVector(_fwd, 0.4 * ws);
      solveTwoBone(th, sh, ft, foot.pos, _pole, 1);
      // Feet flat on the ground (with heel-toe roll), facing where the body faces.
      if (foot.ground > 0.01) {
        _q.setFromAxisAngle(_Z, foot.pitch);
        _q.premultiply(_q2);
        setWorldQuaternion(ft, _q, foot.ground);
      }
    }

    // Off hand onto the two-handed grip.
    if (rig.offGrip && this.gripW > 0.01) {
      rig.offGrip.getWorldPosition(_a);
      j[J.HAND_R].getWorldQuaternion(_q);
      // Wrist target: grip minus the fist offset, with the hand oriented like the main hand.
      _b.copy(rig.sockets.offHand.position).multiplyScalar(ws).applyQuaternion(_q);
      _a.sub(_b);
      j[J.FARM_L].getWorldPosition(_pole);
      _pole.y -= 0.3 * ws;
      solveTwoBone(j[J.UARM_L], j[J.FARM_L], j[J.HAND_L], _a, _pole, this.gripW);
      setWorldQuaternion(j[J.HAND_L], _q, this.gripW);
    }
    this.landing = Math.max(0, this.landing - dt * 4);
  }
}

const _Y = new Vector3(0, 1, 0);
