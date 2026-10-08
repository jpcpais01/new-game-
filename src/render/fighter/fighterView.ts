import {
  AdditiveBlending, BackSide, Color, Group, Mesh, MeshBasicMaterial, Object3D, RingGeometry, ShaderMaterial, SphereGeometry,
  Vector3,
} from 'three';
import { clamp, damp, easeInCubic, easeOutCubic, smoothstep } from '../../core/math';
import { getStatus, stacksOf, type Fighter } from '../../sim/fighter';
import { FORMS } from '../../sim/forms';
import { gearOf } from '../../sim/gear';
import type { GearId } from '../../sim/types';
import { archetypeOf, isBig, type Archetype } from './archetype';
import { glow } from '../materials';
import type { Particles } from '../fx/particles';
import {
  actionPoses, HIPS_Y, HURT_ADD, J, JOINT_COUNT, lerpPose, POSE_SIZE, READY, VICTORY, type Pose,
} from './poses';
import { buildRig, gearGeo, type Rig } from './rig';

export interface FxContext {
  add: Particles;
  smoke: Particles;
}

/** Gear that tints the weapon edge and sheds particles from it. */
export const ENCHANTS: GearId[] = ['ember_core', 'frost_core', 'twin_daggers', 'vampiric_fang', 'executioner_hood', 'storm_crown'];
const _v = new Vector3();
const _v2 = new Vector3();

let bubbleGeo: SphereGeometry | null = null;
let teamRingGeo: RingGeometry | null = null;

function shieldMaterial(color: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uAlpha: { value: 1 }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        // Interpolated normals aren't unit length; clamp so pow never sees a
        // negative base (NaN on D3D, which bloom then smears across the screen).
        float f = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 3.5);
        float hex = 0.5 + 0.5 * sin(vP.y * 18.0 + uTime * 3.0) * sin(vP.x * 18.0 - uTime * 2.0);
        float a = (f * 0.9 + hex * 0.035) * uAlpha;
        a = max(a, 0.0);
        gl_FragColor = vec4(uColor * a * 1.6, a);
      }`,
  });
}

/**
 * Visual representation of one fighter: procedural pose animation driven by
 * the simulation state, item gear, status effects and item-specific FX.
 */
export class FighterView {
  readonly rig: Rig;
  readonly classId: Archetype;
  readonly group: Group;
  private readonly pose: Pose = new Float32Array(POSE_SIZE);
  private readonly target: Pose = new Float32Array(POSE_SIZE);
  private readonly tmp: Pose = new Float32Array(POSE_SIZE);
  private walkPhase = 0;
  private hurt = 0;
  private flash = 0;
  private yaw: number;
  private koT = 0;
  private lean = 0;
  private emitAcc = 0;
  private time = 0;
  private readonly enchantColor: Color | null;
  private readonly enchants: GearId[];
  private readonly shield: Mesh;
  private readonly shieldMat: ShaderMaterial;
  private readonly ice: Mesh;
  private readonly stars: Group;
  private readonly mark: Mesh;
  private readonly orbiters: { item: GearId; mesh: Object3D; phase: number; radius: number }[] = [];
  private readonly scale: number;
  private shieldShown = 0;
  private phoenix: Object3D | null = null;
  /** World-space positions kept for effects (weapon trail etc.). */
  readonly tipWorld = new Vector3();
  readonly baseWorld = new Vector3();
  readonly headWorld = new Vector3();

  private readonly teamRing: Mesh;

  constructor(f: Fighter, team: 0 | 1) {
    const classId = archetypeOf(f.gear);
    const items = f.gearIds;
    const facing = f.facing;
    this.classId = classId;
    this.rig = buildRig(classId, items, isBig(f), f.gear);
    this.group = this.rig.root;
    // Team identity: coloured rim light and a glowing ring at the feet, so
    // mirror matches stay readable.
    const teamColor = team === 0 ? 0x4d8bff : 0xff4d5e;
    this.rig.uniforms.uRim.value.setHex(teamColor);
    teamRingGeo ??= new RingGeometry(0.62, 0.74, 40).rotateX(-Math.PI / 2);
    this.teamRing = new Mesh(teamRingGeo, glow(teamColor, 1.1));
    this.teamRing.position.y = 0.03;
    this.group.add(this.teamRing);
    this.pose.set(READY[classId]);
    this.yaw = this.yawFor(facing);
    this.group.rotation.y = this.yaw;
    this.enchants = items.filter((i) => ENCHANTS.includes(i));
    this.enchantColor = this.enchants.length ? new Color(gearOf(this.enchants[0]).color) : null;
    this.scale = FORMS[f.form].body.height * (items.includes('colossus_boots') ? 1.05 : 1) / (isBig(f) ? 1.12 : 1);
    this.group.scale.setScalar(this.scale);

    if (this.rig.enchantMaterial) {
      // Weapon edge glow takes the enchant colour (white-hot steel otherwise).
      if (this.enchantColor) this.rig.enchantMaterial.color.copy(this.enchantColor).multiplyScalar(2.2);
      else this.rig.enchantMaterial.color.setRGB(1, 1, 1);
    }
    this.phoenix = this.rig.phoenix;
    this.rig.orbiters.forEach((o, i) => this.orbiters.push({ item: o.item, mesh: o.bone, phase: i * 2.1, radius: 0.78 + i * 0.08 }));

    // Shield bubble (Aegis or any shield).
    bubbleGeo ??= new SphereGeometry(1, 24, 16);
    this.shieldMat = shieldMaterial(0xffd76b);
    this.shield = new Mesh(bubbleGeo, this.shieldMat);
    this.shield.position.y = 1.05;
    this.shield.scale.set(0.95, 1.2, 0.95);
    this.shield.visible = false;
    this.shield.renderOrder = 8;
    this.group.add(this.shield);

    // Frozen crystal.
    const iceMat = new MeshBasicMaterial({ color: new Color(0x9fe9ff).multiplyScalar(0.7), transparent: true, opacity: 0.45, depthWrite: false, side: BackSide });
    this.ice = new Mesh(gearGeo.ico(1), iceMat);
    this.ice.position.y = 1.0;
    this.ice.scale.set(0.75, 1.25, 0.75);
    this.ice.visible = false;
    this.group.add(this.ice);
    const iceFront = new Mesh(gearGeo.ico(1), new MeshBasicMaterial({ color: new Color(0xc8f6ff).multiplyScalar(1.3), transparent: true, opacity: 0.25, depthWrite: false }));
    this.ice.add(iceFront);

    // Stun stars.
    this.stars = new Group();
    for (let i = 0; i < 3; i++) {
      const s = new Mesh(gearGeo.ico(0.07), glow(0xffe066, 3));
      s.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.32, 0, Math.sin((i / 3) * Math.PI * 2) * 0.32);
      this.stars.add(s);
    }
    this.stars.visible = false;
    this.group.add(this.stars);

    // Hex mark sigil.
    this.mark = new Mesh(gearGeo.torus(0.22, 0.035), glow(0xc04dff, 1.6));
    this.mark.rotation.x = Math.PI / 2;
    this.mark.visible = false;
    this.group.add(this.mark);
  }

  private yawFor(facing: number): number {
    // Turn slightly towards the camera so both fighters read in 3/4 view.
    return facing === 1 ? -0.42 : -Math.PI + 0.42;
  }

  onHit(heavy: boolean): void {
    this.flash = 1;
    this.hurt = heavy ? 1 : 0.6;
  }

  update(f: Fighter, alpha: number, dt: number, fx: FxContext, battleOver: boolean, winner: boolean, xScale = 1): void {
    this.time += dt;
    const x = (f.px + (f.x - f.px) * alpha) * xScale;
    const y = f.py + (f.y - f.py) * alpha;
    this.group.position.set(x, y, 0);

    // Turn to face (through the camera side).
    const targetYaw = this.yawFor(f.facing);
    this.yaw = damp(this.yaw, targetYaw, f.action && f.action.phase === 'active' ? 30 : 14, dt);
    this.group.rotation.y = this.yaw;

    this.computePose(f, battleOver, winner, dt);
    this.applyPose();

    // The ring stays on the ground while the fighter leaps.
    this.teamRing.position.y = 0.03 - y;
    this.teamRing.visible = f.alive;

    // KO fall.
    if (!f.alive) {
      this.koT = Math.min(1, this.koT + dt * 2.2);
      const k = easeOutCubic(this.koT);
      this.rig.body.rotation.z = k * 1.35;
      this.rig.body.position.y = k * 0.12;
    } else {
      this.koT = 0;
      this.rig.body.rotation.z = damp(this.rig.body.rotation.z, this.lean, 12, dt);
      this.rig.body.position.y = 0;
    }

    // Material uniforms: hit flash and status tint.
    this.flash = Math.max(0, this.flash - dt * 12);
    this.hurt = Math.max(0, this.hurt - dt * 4);
    const u = this.rig.uniforms;
    u.uFlash.value = this.flash * 0.45;
    let tint = 0;
    const frozen = !!getStatus(f, 'frozen');
    if (frozen) { u.uTint.value.setHex(0x8fe6ff); tint = 0.55; }
    else if (getStatus(f, 'ironskin')) { u.uTint.value.setHex(0x9aa6c0); tint = 0.38 + Math.sin(this.time * 12) * 0.05; }
    else if (getStatus(f, 'rage')) { u.uTint.value.setHex(0xff3020); tint = 0.22 + Math.sin(this.time * 9) * 0.08; }
    else if (stacksOf(f, 'chill')) { u.uTint.value.setHex(0x7fd8ff); tint = 0.045 * stacksOf(f, 'chill'); }
    else if (stacksOf(f, 'poison')) { u.uTint.value.setHex(0x7cff3a); tint = 0.03 * stacksOf(f, 'poison'); }
    if (f.invuln > 0 && f.alive) { u.uTint.value.setHex(0xdfe8ff); tint = Math.max(tint, 0.18); }
    u.uTintAmt.value = damp(u.uTintAmt.value, tint, 12, dt);

    // World anchors.
    this.rig.weaponTip.getWorldPosition(this.tipWorld);
    this.rig.weaponBase.getWorldPosition(this.baseWorld);
    this.rig.headTop.getWorldPosition(this.headWorld);

    this.updateStatusVisuals(f, dt, frozen);
    this.updateCloth(f, dt);
    this.emitParticles(f, dt, fx);
  }

  private computePose(f: Fighter, over: boolean, winner: boolean, dt: number): void {
    const ready = READY[this.classId];
    const target = this.target;
    target.set(ready);
    let lambda = 16;
    this.lean = 0;

    const frozen = !!getStatus(f, 'frozen');
    if (frozen) return; // hold the current pose — frozen solid

    if (!f.alive) {
      lerpPose(target, ready, HURT_ADD, 1);
      lambda = 8;
    } else if (over && winner) {
      lerpPose(target, ready, VICTORY[this.classId], smoothstep(0, 1, 1));
      lambda = 5;
    } else if (f.action) {
      const a = f.action;
      const ab = f.abilities[a.ability];
      const poses = actionPoses(this.classId, ab.anim);
      if (a.feint) {
        lerpPose(target, poses.windup, ready, easeOutCubic(clamp(a.t / a.recovery, 0, 1)));
        lambda = 25;
      } else if (a.phase === 'windup') {
        lerpPose(target, ready, poses.windup, easeOutCubic(clamp(a.t / a.windup, 0, 1)));
        lambda = 20;
        if (ab.slot === 'evade') this.lean = a.dir === f.facing ? -0.4 : 0.25;
      } else if (a.phase === 'active') {
        if (ab.anim === 'flurry') {
          const hits = ab.hits ?? 1;
          const k = (a.t / a.active) * hits;
          const ph = k - Math.floor(k);
          const even = Math.floor(k) % 2 === 0;
          lerpPose(target, even ? poses.windup : poses.strike, even ? poses.strike : poses.windup, easeOutCubic(clamp(ph * 2, 0, 1)));
          lambda = 60;
        } else {
          const k = clamp(a.t / Math.min(0.09, a.active), 0, 1);
          lerpPose(target, poses.windup, poses.strike, easeOutCubic(k));
          lambda = 45;
        }
        if (ab.slot === 'evade') {
          this.lean = a.dir === f.facing ? -0.6 : 0.35;
          if (a.through) this.lean = -0.9; // roll
        }
        if (ab.kind === 'dash' && ab.slot !== 'evade') this.lean = -0.25;
      } else {
        const r = clamp(a.t / a.recovery, 0, 1);
        lerpPose(target, poses.strike, ready, easeInCubic(clamp((r - 0.25) / 0.75, 0, 1)));
        lambda = 14;
      }
    } else {
      // Locomotion.
      const speed = Math.abs(f.vx);
      const moving = clamp(speed / 3.5, 0, 1);
      const back = Math.sign(f.vx) !== f.facing ? -1 : 1;
      this.walkPhase += speed * dt * 3.4 * back;
      const s = Math.sin(this.walkPhase), c = Math.cos(this.walkPhase);
      target[J.THIGH_L * 3 + 2] += s * 0.55 * moving;
      target[J.THIGH_R * 3 + 2] -= s * 0.55 * moving;
      target[J.SHIN_L * 3 + 2] -= Math.max(0, -c) * 0.7 * moving;
      target[J.SHIN_R * 3 + 2] -= Math.max(0, c) * 0.7 * moving;
      target[J.UARM_L * 3 + 2] -= s * 0.25 * moving;
      target[J.HIPS * 3 + 2] -= 0.1 * moving * back;
      target[HIPS_Y] += Math.abs(c) * 0.05 * moving - 0.03 * moving;
      this.lean = -0.06 * moving * back;
    }

    // Breathing / idle life.
    const breath = Math.sin(this.time * 2.4);
    target[J.CHEST * 3 + 2] += breath * 0.03;
    target[J.HEAD * 3 + 2] -= breath * 0.02;
    target[HIPS_Y] += breath * 0.012;

    // Stun wobble.
    if (getStatus(f, 'stun')) {
      target[J.HEAD * 3] += Math.sin(this.time * 7) * 0.3;
      target[J.CHEST * 3] += Math.sin(this.time * 7 + 1) * 0.15;
      target[J.UARM_R * 3 + 2] = 0.1; target[J.UARM_L * 3 + 2] = 0.1;
      target[HIPS_Y] -= 0.08;
    }

    // Hurt flinch (additive).
    if (this.hurt > 0 || f.stagger > 0) {
      const h = Math.max(this.hurt, f.stagger > 0 ? 0.5 : 0);
      for (let i = 0; i < POSE_SIZE; i++) target[i] += (HURT_ADD[i] - ready[i]) * h * 0.6;
    }

    // Airborne tuck from knockback.
    if (f.y > 0.2 && !(f.action && f.abilities[f.action.ability].airborne)) {
      target[J.THIGH_L * 3 + 2] += 0.6; target[J.SHIN_L * 3 + 2] -= 0.8;
      target[J.THIGH_R * 3 + 2] += 0.3; target[J.SHIN_R * 3 + 2] -= 0.6;
    }

    const t = 1 - Math.exp(-lambda * dt);
    const p = this.pose;
    for (let i = 0; i < POSE_SIZE; i++) p[i] += (target[i] - p[i]) * t;
    void this.tmp;
  }

  private applyPose(): void {
    const j = this.rig.joints;
    const p = this.pose;
    for (let i = 0; i < JOINT_COUNT; i++) {
      j[i].rotation.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    }
    j[J.HIPS].position.y = 0.98 + p[HIPS_Y];
  }

  private updateStatusVisuals(f: Fighter, dt: number, frozen: boolean): void {
    // Shield bubble.
    const want = f.shield > 0 && f.alive ? 1 : 0;
    this.shieldShown = damp(this.shieldShown, want, 10, dt);
    this.shield.visible = this.shieldShown > 0.02;
    if (this.shield.visible) {
      this.shieldMat.uniforms.uAlpha.value = this.shieldShown * (0.75 + Math.sin(this.time * 5) * 0.1);
      this.shieldMat.uniforms.uTime.value = this.time;
      const s = 0.9 + this.shieldShown * 0.1;
      this.shield.scale.set(0.95 * s, 1.2 * s, 0.95 * s);
    }

    this.ice.visible = frozen;
    if (frozen) this.ice.rotation.y += dt * 0.2;

    const stunned = !!getStatus(f, 'stun') && f.alive;
    this.stars.visible = stunned;
    if (stunned) {
      this.stars.position.set(0, 2.15, 0);
      this.stars.rotation.y += dt * 5;
    }
    const marked = !!getStatus(f, 'mark') && f.alive;
    this.mark.visible = marked;
    if (marked) {
      this.mark.position.set(0, 2.45 + Math.sin(this.time * 3) * 0.05, 0);
      this.mark.rotation.z += dt * 2;
    }

    // Orbiting item relics.
    for (const o of this.orbiters) {
      o.phase += dt * 1.6;
      const r = o.radius;
      o.mesh.position.set(Math.cos(o.phase) * r, 1.5 + Math.sin(o.phase * 1.7) * 0.15, Math.sin(o.phase) * r);
      o.mesh.rotation.y += dt * 3;
      let on = 1;
      if (o.item === 'mirror_aegis') on = f.mirrorCd <= 0 ? 1 : 0.35;
      if (o.item === 'storm_crown') on = 0.5 + f.stormCounter * 0.35;
      o.mesh.scale.setScalar(Math.max(0.01, (f.alive ? 1 : 0) * on * (1 + Math.sin(this.time * 6) * 0.05 * on)));
    }
    // Collapse the spent feather into the head (never scale to exactly zero: NaN normals).
    if (this.phoenix) this.phoenix.scale.setScalar(f.phoenixUsed ? 0.01 : 1);
  }

  private updateCloth(f: Fighter, dt: number): void {
    const v = f.vx * (this.yaw > -Math.PI / 2 ? 1 : -1);
    for (const c of this.rig.cloth) {
      const target = clamp(-v * 0.08, -0.5, 0.6) + Math.sin(this.time * 3 + c.id) * 0.06 + (f.y > 0.3 ? 0.4 : 0);
      c.rotation.z = damp(c.rotation.z, target, 6, dt);
    }
  }

  private emitParticles(f: Fighter, dt: number, fx: FxContext): void {
    if (!f.alive) return;
    this.emitAcc += dt;
    if (this.emitAcc < 1 / 30) return;
    const step = this.emitAcc;
    this.emitAcc = 0;
    const x = this.group.position.x, y = this.group.position.y;

    const burn = stacksOf(f, 'burn');
    if (burn) fx.add.burst({ x, y: y + 1.0, count: burn * 2, jitter: 0.35, jitterY: 0.6, dir: [0, 1, 0], spread: 0.3, speed: [0.8, 2], life: [0.35, 0.7], size: [0.12, 0.26], color: 0xff7a1a, intensity: 2.2, gravity: -2, sizeEnd: 0.1 });
    const poison = stacksOf(f, 'poison');
    if (poison) fx.add.burst({ x, y: y + 0.9, count: Math.ceil(poison / 2), jitter: 0.35, jitterY: 0.5, dir: [0, 1, 0], spread: 0.4, speed: [0.3, 0.8], life: [0.6, 1.0], size: [0.06, 0.12], color: 0x8cff3a, intensity: 1.6, gravity: -0.5, sizeEnd: 1.2 });
    const chill = stacksOf(f, 'chill') + (getStatus(f, 'frozen') ? 3 : 0);
    if (chill) fx.add.burst({ x, y: y + 1.0, count: chill, jitter: 0.4, jitterY: 0.7, speed: [0.1, 0.5], life: [0.5, 1.0], size: [0.04, 0.09], color: 0xbff4ff, intensity: 2.5, gravity: 0.6, sizeEnd: 0.3 });
    if (getStatus(f, 'rage')) fx.add.burst({ x, y: y + 0.4, count: 3, jitter: 0.4, dir: [0, 1, 0], spread: 0.2, speed: [1.5, 3], life: [0.3, 0.6], size: [0.1, 0.2], color: 0xff2a10, intensity: 2, sizeEnd: 0.1 });
    if (getStatus(f, 'ironskin')) fx.add.burst({ x, y: y + 1.0, count: 1, jitter: 0.5, jitterY: 0.8, speed: [0.1, 0.3], life: [0.3, 0.5], size: [0.05, 0.1], color: 0xdfe8ff, intensity: 3, sizeEnd: 0.1 });

    // Weapon enchant trails.
    if (this.enchants.length) {
      const tip = this.tipWorld, base = this.baseWorld;
      for (const id of this.enchants) {
        const t = Math.random();
        _v.lerpVectors(base, tip, t);
        const col = gearOf(id).color;
        const cfg = id === 'ember_core' ? { g: -2.5, sp: 0.6, life: 0.5, size: 0.11, i: 2.4 }
          : id === 'frost_core' ? { g: 0.8, sp: 0.2, life: 0.8, size: 0.06, i: 2.6 }
            : id === 'twin_daggers' ? { g: 3, sp: 0.1, life: 0.6, size: 0.06, i: 1.8 }
              : { g: 0, sp: 0.3, life: 0.4, size: 0.07, i: 2 };
        fx.add.emit(_v.x, _v.y, _v.z, (Math.random() - 0.5) * cfg.sp, cfg.sp * 0.5, 0, cfg.life,
          ((col >> 16) & 255) / 255 * cfg.i, ((col >> 8) & 255) / 255 * cfg.i, (col & 255) / 255 * cfg.i,
          cfg.size * (step * 30), cfg.g, 1, 0.2, 0);
      }
    }

    // Phoenix ember on the helmet.
    if (f.has.has('phoenix_feather') && !f.phoenixUsed && Math.random() < 0.5) {
      _v2.copy(this.headWorld);
      fx.add.emit(_v2.x, _v2.y - 0.1, _v2.z, (Math.random() - 0.5) * 0.3, 0.6, 0, 0.6, 2.5, 1.0, 0.25, 0.07, -1, 0.5, 0.2, 0);
    }
    // Footstep dust while running on the ground.
    if (y < 0.05 && Math.abs(f.vx) > 2.6 && Math.random() < 0.35) {
      fx.smoke.emit(x - Math.sign(f.vx) * 0.2, 0.08, (Math.random() - 0.5) * 0.3, -f.vx * 0.12, 0.35, 0, 0.55, 0.85, 0.8, 0.72, 0.22, 0, 2, 1.6, 0);
    }
    // Zephyr boots afterimage dust.
    if (f.has.has('zephyr_boots') && Math.abs(f.vx) > 3) {
      fx.add.emit(x, y + 0.1, 0, -f.vx * 0.1, 0.3, 0, 0.4, 0.4, 2.2, 1.6, 0.12, 0, 2, 0.1, 0);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of this.rig.materials) m.dispose();
    for (const m of this.rig.meshes) { m.geometry.dispose(); m.skeleton.dispose(); }
    this.shieldMat.dispose();
  }
}
