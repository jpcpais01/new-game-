import { Vector3 } from 'three';

/** One foot of the procedural gait, in world space (y = ankle height). */
export class Foot {
  /** Where the foot is drawn this frame. */
  readonly pos = new Vector3();
  /** Last planted spot. */
  readonly planted = new Vector3();
  private readonly from = new Vector3();
  stepping = false;
  /** 0..1 progress of the current step. */
  t = 0;
  private dur = 0.25;
  private height = 0.12;
  /** Toe pitch for heel-toe roll (radians, + = toe up). */
  pitch = 0;
  /** 1 while on the ground (or stepping), 0 when following the animation freely. */
  ground = 1;

  plantAt(p: Vector3): void {
    this.planted.copy(p);
    this.pos.copy(p);
    this.stepping = false;
    this.t = 0;
  }

  startStep(dur: number, height: number): void {
    this.from.copy(this.pos);
    this.stepping = true;
    this.t = 0;
    this.dur = dur;
    this.height = height;
  }

  /** Advances a step towards `to` (which may move while stepping). Returns true when it lands. */
  advance(dt: number, to: Vector3, ankleY: number): boolean {
    this.t = Math.min(1, this.t + dt / this.dur);
    const t = this.t;
    const e = t * t * (3 - 2 * t);
    this.pos.lerpVectors(this.from, to, e);
    const dist = Math.hypot(to.x - this.from.x, to.z - this.from.z);
    const lift = Math.sin(Math.PI * Math.min(1, t * 1.1)) * this.height * Math.min(1, 0.35 + dist * 2.5);
    this.pos.y = ankleY + Math.max(0, lift) + (to.y - ankleY) * e;
    // Toe-off at the start, heel strike at the end.
    this.pitch = t < 0.5 ? -0.55 * Math.sin(t * Math.PI * 2) : 0.35 * Math.sin((t - 0.5) * Math.PI * 2);
    if (t >= 1) {
      this.planted.copy(to);
      this.planted.y = ankleY;
      this.pos.copy(this.planted);
      this.stepping = false;
      this.pitch = 0;
      return true;
    }
    return false;
  }
}

export interface GaitParams {
  /** Ankle height above the ground in world units. */
  ankleY: number;
  /** World velocity along x (m/s). */
  vx: number;
  /** Seconds per step at walking pace. */
  stepTime: number;
  stepHeight: number;
  /** Distance a planted foot may drift from where the pose wants it before stepping. */
  threshold: number;
  /** 0..1: how much the feet stick to the ground (0 = airborne, follow the animation). */
  ground: number;
  /** Hip joints (world), to keep step targets within reach. */
  hips: [Vector3, Vector3];
  /** Max horizontal distance a foot may land from its hip. */
  reach: number;
}

const _want = [new Vector3(), new Vector3()];

/**
 * Procedural stepping: each foot stays planted where it landed until the
 * animated (FK) foot position drifts too far from it, then it steps there in a
 * lifted arc, alternating feet. Walking, lunges, knockback stumbles and
 * stance changes all come out of the same rule, and feet never slide.
 */
export class Gait {
  readonly feet: [Foot, Foot] = [new Foot(), new Foot()];
  private init = false;
  /** Feet strike the ground this frame (for dust/sfx). */
  landed: [boolean, boolean] = [false, false];

  reset(): void { this.init = false; }

  update(dt: number, desired: [Vector3, Vector3], p: GaitParams): [Vector3, Vector3] {
    const [a, b] = this.feet;
    this.landed[0] = this.landed[1] = false;
    if (!this.init) {
      for (let i = 0; i < 2; i++) {
        const want = _want[i].copy(desired[i]);
        want.y = p.ankleY;
        this.feet[i].plantAt(want);
      }
      this.init = true;
    }
    const speed = Math.abs(p.vx);
    const dur = Math.max(0.11, Math.min(0.42, p.stepTime * (1.12 - Math.min(0.55, speed * 0.075))));
    // Lead: aim each step ahead of the body so it lands under the next stance.
    const lead = p.vx * dur * 0.5;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const want = _want[i].copy(desired[i]);
      want.x += lead;
      // A pose that lifts the foot well above the ground (kicks, tucks) frees it.
      const lifted = Math.max(0, Math.min(1, (desired[i].y - p.ankleY - 0.1) / 0.15));
      const ground = Math.min(p.ground, 1 - lifted);
      const wasFree = f.ground < 0.5;
      f.ground = ground;
      if (ground < 0.5) {
        // Free: follow the animation; re-plant where it is when it comes down.
        f.pos.copy(desired[i]);
        f.stepping = false;
        f.pitch = 0;
        continue;
      }
      if (wasFree) {
        _want[i].copy(f.pos);
        _want[i].y = p.ankleY;
        f.plantAt(_want[i]);
        this.landed[i] = true;
      }
      want.y = Math.max(p.ankleY, Math.min(desired[i].y, p.ankleY + 0.02));
      // Never aim a step further than the leg can reach.
      const hx = want.x - p.hips[i].x, hz = want.z - p.hips[i].z;
      const hd = Math.hypot(hx, hz);
      if (hd > p.reach) { want.x = p.hips[i].x + hx * p.reach / hd; want.z = p.hips[i].z + hz * p.reach / hd; }
      if (f.stepping) {
        if (f.advance(dt, want, p.ankleY)) this.landed[i] = true;
        continue;
      }
      const other = this.feet[1 - i];
      const drift = Math.hypot(want.x - f.planted.x, want.z - f.planted.z);
      const otherBusy = other.stepping && other.t < 0.7;
      // Moving fast lets both feet be in the air briefly (running); otherwise alternate.
      const urgent = drift > p.threshold * (speed > 3 ? 1.6 : 3);
      if (drift > p.threshold && (!otherBusy || urgent)) {
        // The foot that is further behind goes first.
        if (!otherBusy && !other.stepping) {
          const otherDrift = Math.hypot(_want[1 - i].x - other.planted.x, _want[1 - i].z - other.planted.z);
          if (otherDrift > drift * 1.25 && i === 0 && !urgent) continue;
        }
        f.startStep(dur, p.stepHeight);
        f.advance(dt, want, p.ankleY);
      } else {
        f.pos.copy(f.planted);
      }
    }
    void a; void b;
    return [this.feet[0].pos, this.feet[1].pos];
  }
}
