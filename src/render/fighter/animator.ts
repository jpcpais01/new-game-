import { Quaternion, Vector3, type Object3D } from 'three';
import { clamp, easeOutCubic, smoothstep } from '../../core/math';
import { getStatus, type Fighter } from '../../sim/fighter';
import type { BodyForm } from './forms';
import { BowRig, type BowWant } from './bow';
import { CrossbowRig, type XbowWant } from './crossbow';
import { Gait } from './gait';
import { Holder } from './holder';
import { setWorldQuaternion, solveTwoBone } from './ik';
import {
  actionPoses, addPose, HIPS_X, HIPS_Y, HURT_ADD, J, JOINT_COUNT, KO_FALL, KO_POSE, lerpPose, POSE_SIZE, stance,
  victoryPose, type Pose, type PoseKey,
} from './poses';
import type { HandPlan, Holdable } from './look';
import type { Rig } from './rig';
import type { AbilityDef, AnimKey } from '../../sim/types';

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

/**
 * Overlapping action: how quickly each joint follows its target relative to
 * the body's spring (and how much it overshoots). The core leads, the head
 * and the arms trail it out to the hands, so motion ripples outwards like a
 * whip instead of every joint arriving at once.
 */
const LAG = new Float32Array(POSE_SIZE).fill(1);
const SNAP = new Float32Array(POSE_SIZE).fill(1);
{
  const set = (j: number, w: number, z = 1) => { for (let a = 0; a < 3; a++) { LAG[j * 3 + a] = w; SNAP[j * 3 + a] = z; } };
  set(J.HIPS, 1.12); set(J.SPINE, 1.06); set(J.CHEST, 1); set(J.NECK, 0.88, 0.95); set(J.HEAD, 0.78, 0.9);
  for (const [c, u, f, h] of [[J.CLAV_L, J.UARM_L, J.FARM_L, J.HAND_L], [J.CLAV_R, J.UARM_R, J.FARM_R, J.HAND_R]]) {
    set(c, 0.96); set(u, 0.92, 0.95); set(f, 0.85, 0.9); set(h, 0.76, 0.85);
  }
  for (const j of [J.THIGH_L, J.SHIN_L, J.FOOT_L, J.THIGH_R, J.SHIN_R, J.FOOT_R]) set(j, 1.05);
  LAG[HIPS_X] = LAG[HIPS_Y] = 1.1;
}

/** Anims whose motion needs the off hand free, so a two-handed grip lets go. */
const FREE_OFFHAND = new Set(['roar', 'castBig', 'cast', 'bash', 'blink', 'throw', 'shoot']);
const HOLDABLE = new Set<string>(['dagger', 'parry', 'xbow', 'knives', 'chakram']);
type Draw = HandPlan['draws'][string];

/** The move an ability plays, given the hand its item is drawn into. */
function poseKey(anim: AnimKey, draw: Draw | undefined): PoseKey {
  if (draw?.item === 'knives') return draw.hand === 'R' ? 'throwR' : 'throw';
  if (draw?.item === 'chakram') return draw.hand === 'R' ? 'spin' : 'spinL';
  return anim;
}

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
  /** Whether the current or last action parries with the left hand. */
  private parryLeft = false;
  private flinch = 0;
  private runBlend = 0;
  /** How strongly the core leads the limbs this frame (1 = normal, more during strikes). */
  private lead = 1;
  /** World position the head looks at (the opponent's head), if any. */
  readonly lookAt = new Vector3();
  hasLookAt = false;
  /** Set when a foot lands or the body lands from the air (for dust). */
  landing = 0;
  /** Bow string, arrow and aiming arms, when the rig carries a bow. */
  private readonly bow: BowRig | null;
  private readonly bowWant: BowWant = { aim: 1, draw: 0, hand: 1, low: 1, loose: 0, arrow: true, tremble: 0 };
  /** Left-hand items moved between the hands and where they are carried. */
  private readonly holder: Holder | null;
  /** Hand crossbow (secondary): aimed, fired and re-cocked. */
  private readonly xbow: CrossbowRig | null;
  private readonly xbowWant: XbowWant = { side: 'L', aim: 1, low: 1, loaded: true };

  /** Upper lid bones (they turn about the eye to blink) and the blink clock. */
  private readonly lids: Object3D[];
  private blinkAt = 1 + Math.random() * 3;
  private blinkT = 9;
  private lidClose = 0;

  constructor(private readonly rig: Rig, private readonly form: BodyForm) {
    this.pose.set(stance(rig.look.grip, rig.look.offhand, form));
    this.bow = BowRig.from(rig);
    this.holder = Holder.from(rig);
    this.xbow = CrossbowRig.from(rig);
    this.lids = ['lidL', 'lidR'].map((k) => rig.tags.get(k)).filter((b): b is Object3D => !!b);
  }

  private get ready(): Pose { return stance(this.rig.look.grip, this.rig.look.offhand, this.form); }

  /**
   * Where a projectile of this ability visibly leaves the fighter (world):
   * the crossbow's muzzle, the hand throwing knives or a chakram, the bow, a
   * staff's tip. False when it should start where the simulation puts it.
   */
  launchPoint(ab: AbilityDef, out: Vector3): boolean {
    const rig = this.rig;
    const draw = rig.look.hands.draws[ab.id];
    if (draw?.item === 'xbow' && this.xbow) { this.xbow.muzzle(out); return true; }
    const held = draw && this.holder?.bone(draw.item);
    if (held) { held.getWorldPosition(out); return true; }
    if (ab.projectile?.ground) return false;
    if (rig.look.grip === 'bow' && ab.anim === 'shoot') { rig.sockets.offHand.getWorldPosition(out); return true; }
    if (ab.anim === 'cast') { rig.weaponTip.getWorldPosition(out); return true; }
    return false;
  }

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

  /**
   * A successful parry: a quick snap of the arm that parried, the chest turning
   * that shoulder into the blow (a shield or off-hand blade parries with the left).
   */
  parry(): void {
    const left = this.parryLeft;
    this.vel[(left ? J.UARM_L : J.UARM_R) * 3 + 2] += 14;
    this.vel[(left ? J.FARM_L : J.FARM_R) * 3 + 2] -= 10;
    this.vel[J.CHEST * 3 + 1] += left ? -6 : 6;
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
    this.blink(f, dt);
  }

  /** Blinks now and then (sometimes twice), squeezes the eyes shut on hits, droops when stunned, closes on a knockout. */
  private blink(f: Fighter, dt: number): void {
    if (!this.lids.length) return;
    this.blinkT += dt;
    if (this.time > this.blinkAt) {
      this.blinkT = 0;
      this.blinkAt = this.time + (Math.random() < 0.2 ? 0.28 : 1.8 + Math.random() * 3.2);
    }
    const b = this.blinkT;
    let want = b < 0.06 ? b / 0.06 : b < 0.16 ? 1 - (b - 0.06) / 0.1 : 0;
    want = Math.max(want, this.flinch * 0.85, getStatus(f, 'stun') ? 0.55 : 0, f.alive ? 0 : 1);
    // Lids close fast and open a little slower.
    this.lidClose += (want - this.lidClose) * Math.min(1, dt * (want > this.lidClose ? 40 : 22));
    for (const lid of this.lids) {
      const base = lid.userData.base as Quaternion | undefined;
      if (!base) continue;
      _q2.setFromAxisAngle(_Z, -this.lidClose * (lid.userData.shut as number));
      lid.quaternion.copy(base).multiply(_q2);
    }
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
    this.lead = 1;
    this.plant = 1;
    this.roll = 0;
    this.flinch = Math.max(0, this.flinch - dt * 3);
    let gripWant = this.rig.offGrip ? 1 : 0;
    // Bow at rest: lowered, an arrow nocked, the right hand on the string.
    const bw = this.bowWant;
    bw.aim = 1; bw.low = 1; bw.loose = 0; bw.draw = 0.04; bw.hand = 1; bw.arrow = true; bw.tremble = 0;
    // Everything held or carried where the HandPlan puts it; a crossbow that
    // rests in the left hand is held low.
    this.holder?.reset();
    const xw = this.xbowWant;
    xw.side = 'L'; xw.aim = this.holder?.restOf('xbow') === 'L' ? 1 : 0; xw.low = 1; xw.loaded = true;

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
      bw.hand = 0; bw.aim = 0; bw.arrow = false;
      xw.aim = 0;
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
      bw.hand = 0; bw.aim = 0; xw.aim = 0;
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
      bw.hand = 0; bw.aim = 0; xw.aim = 0;
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
    // An ability that uses a carried item draws it into a hand (see HandPlan.draws).
    const draw = look.hands.draws[ab.id];
    const ap = actionPoses(look.grip, look.offhand, this.form, poseKey(ab.anim, draw));
    const useAlt = !!ap.alt && this.swing % 2 === 0 && ab.slot === 'basic';
    const W = useAlt ? ap.alt!.windup : ap.windup;
    const S = useAlt ? ap.alt!.strike : ap.strike;
    if (FREE_OFFHAND.has(ab.anim) || draw?.hand === 'L') gripWant = 0;
    this.parryLeft = look.offhand === 'shield' || look.offhand === 'weapon' || (draw?.item === 'parry' && draw.hand === 'L');
    if (draw && this.holder) this.drawAction(f, draw);
    if (this.bow) this.bowAction(f, draw);
    if (this.xbow) this.xbowAction(f, draw);
    const evade = ab.slot === 'evade';
    const fwd = a.dir === f.facing;

    if (a.feint) {
      lerpPose(t, W, ready, easeOutCubic(clamp(a.t / a.recovery, 0, 1)));
      this.omega = m.omega * 1.5;
    } else if (a.phase === 'windup') {
      const k = clamp(a.t / a.windup, 0, 1);
      lerpPose(t, ready, W, ease(Math.min(1, k * 1.25)));
      this.omega = m.omega * (ab.heavy ? 0.9 : 1.3);
      this.lead = 1.3;
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
        // The hips and chest fire first; the weapon arm cracks through after them.
        this.lead = 1.8;
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

  /** Turns a hand so the weapon along its socket's +Y keeps only a little depth. */
  private flatten(hand: Object3D, socket: Object3D): void {
    const root = this.rig.root;
    socket.getWorldQuaternion(_qh);
    _dir.set(0, 1, 0).applyQuaternion(_qh);
    root.getWorldQuaternion(_qr);
    _want.copy(_dir).applyQuaternion(_qr.invert());
    const z = Math.abs(_want.z);
    if (z < PLANE_FREE) return;
    _want.z = Math.sign(_want.z) * (PLANE_FREE + (z - PLANE_FREE) * PLANE_KEEP);
    _want.normalize().applyQuaternion(_qr.invert());
    _q.setFromUnitVectors(_dir, _want);
    hand.getWorldQuaternion(_qh);
    setWorldQuaternion(hand, _qh.premultiply(_q), 1);
  }

  /** Bow timeline: raise and aim, draw to the anchor, loose, then nock the next arrow. */
  private bowAction(f: Fighter, draw: Draw | undefined): void {
    const a = f.action!;
    const ab = f.abilities[a.ability];
    const bw = this.bowWant;
    if (draw?.hand === 'R') {
      // The drawing hand lets go of the string for a crossbow, knives or a
      // chakram; the bow stays low in the left hand.
      bw.hand = 0; bw.arrow = false;
      return;
    }
    if (ab.anim !== 'shoot') {
      // Bashing or dodging: the bow arm follows the move, the drawing hand lets go.
      bw.hand = 0; bw.aim = 0;
      return;
    }
    const full = ab.heavy ? 1 : 0.9;
    if (a.feint) {
      // A feinted shot: ease the draw back down without loosing.
      bw.low = smoothstep(0.2, 1, a.t / a.recovery);
      return;
    }
    if (a.phase === 'windup') {
      const k = clamp(a.t / a.windup, 0, 1);
      bw.low = 1 - smoothstep(0, 0.35, k);
      bw.draw = full * ease(clamp((k - 0.12) / 0.75, 0, 1));
      if (ab.heavy && k > 0.6) bw.tremble = Math.sin(this.time * 61) * (k - 0.6) * 0.05;
    } else if (a.phase === 'active') {
      bw.low = 0; bw.draw = 0; bw.loose = 1; bw.arrow = false;
    } else {
      // Hold the follow-through, then reach back to the string and nock the next arrow.
      const r = clamp(a.t / a.recovery, 0, 1);
      bw.low = smoothstep(0.3, 0.95, r);
      bw.draw = 0;
      bw.loose = r < 0.3 ? 1 : 0;
      bw.arrow = r > 0.7;
    }
  }

  /**
   * Draw timeline for a carried item: in the hand from the windup, put back
   * late in the recovery; thrown items (knives, chakram) leave the hand at
   * release and are back by the end. While the left hand is lent, its own item
   * (second dagger, parrying dagger...) goes to its sheath or holster.
   */
  private drawAction(f: Fighter, draw: Draw): void {
    const a = f.action!;
    const want = this.holder!.want;
    const thrown = draw.item === 'knives' || draw.item === 'chakram';
    let out = false, gone = false;
    if (a.feint) out = a.t / a.recovery < 0.7;
    else if (a.phase === 'windup') out = true;
    else if (a.phase === 'active') { out = !thrown; gone = thrown; }
    else {
      const r = clamp(a.t / a.recovery, 0, 1);
      out = !thrown && r < 0.8;
      gone = thrown && r < 0.6;
    }
    if (gone) want[draw.item] = 'gone';
    else if (out) want[draw.item] = draw.hand;
    const rest = this.rig.look.hands.left;
    if (draw.hand === 'L' && (out || gone) && rest !== draw.item && HOLDABLE.has(rest)) want[rest as Holdable] = 'carry';
  }

  /** Crossbow timeline: aim with the hand holding it, shoot with a kick, re-cock, lower it. */
  private xbowAction(f: Fighter, draw: Draw | undefined): void {
    const a = f.action!;
    const xw = this.xbowWant;
    if (draw?.item !== 'xbow') {
      // Any other move: a held crossbow follows the arm's animation.
      xw.aim = 0;
      return;
    }
    xw.side = draw.hand;
    if (a.feint) { xw.aim = 1 - smoothstep(0.3, 1, a.t / a.recovery); return; }
    if (a.phase === 'windup') {
      const k = clamp(a.t / a.windup, 0, 1);
      xw.aim = smoothstep(0, 0.35, k);
      xw.low = 1 - smoothstep(0.1, 0.55, k);
    } else if (a.phase === 'active') {
      xw.aim = 1; xw.low = 0; xw.loaded = false;
    } else {
      const r = clamp(a.t / a.recovery, 0, 1);
      xw.loaded = r > 0.55;
      xw.low = smoothstep(0.4, 1, r);
      // A crossbow that goes back to the holster lowers the arm on the way.
      if (draw.hand === 'R' || this.holder?.restOf('xbow') !== 'L') xw.aim = 1 - smoothstep(0.5, 0.8, r);
    }
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
    const x = this.pose, v = this.vel, t = this.target;
    const lead = this.lead;
    for (let i = 0; i < POSE_SIZE; i++) {
      const w = this.omega * (lead === 1 ? LAG[i] : Math.pow(LAG[i], lead)), w2 = w * w;
      const c = 2 * this.zeta * SNAP[i] * w;
      let vi = v[i], xi = x[i];
      const ti = t[i];
      for (let s = 0; s < n; s++) {
        vi += (w2 * (ti - xi) - c * vi) * h;
        xi += vi * h;
      }
      v[i] = vi; x[i] = xi;
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

    // Keep held blades in the fighting plane: poses authored for one weapon
    // can leave another pointing at the camera, so swing it back towards the
    // side-view plane around the wrist (before the second hand grips it).
    if (rig.look.grip !== 'bow') this.flatten(j[J.HAND_R], rig.sockets.mainHand);
    const left = rig.look.hands.left;
    const ab = f.action ? f.abilities[f.action.ability] : null;
    const lent = !!ab && (FREE_OFFHAND.has(ab.anim) || rig.look.hands.draws[ab.id]?.hand === 'L');
    if ((left === 'dagger' || left === 'parry') && !lent) this.flatten(j[J.HAND_L], rig.sockets.offHand);

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
    // Arms first (bow, crossbow aim), then the held items follow the hands.
    this.bow?.apply(dt, this.bowWant, this.hasLookAt ? this.lookAt : null, ws);
    this.xbow?.aimArm(dt, this.xbowWant, this.hasLookAt ? this.lookAt : null, ws);
    this.holder?.apply(dt);
    this.xbow?.apply(dt, this.xbowWant);
    this.landing = Math.max(0, this.landing - dt * 4);
  }
}

const _Y = new Vector3(0, 1, 0);
const _dir = new Vector3();
const _want = new Vector3();
const _qr = new Quaternion();
const _qh = new Quaternion();
/** Depth (towards/away from the camera) a weapon may point freely, and how much of the rest is kept. */
const PLANE_FREE = 0.15;
const PLANE_KEEP = 0.25;
