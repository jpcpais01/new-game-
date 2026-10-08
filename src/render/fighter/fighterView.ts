import {
  AdditiveBlending, BackSide, Color, Group, Mesh, MeshBasicMaterial, Object3D, RingGeometry, ShaderMaterial, SphereGeometry,
  Quaternion, Vector3,
} from 'three';
import { clamp, damp } from '../../core/math';
import { getStatus, stacksOf, type Fighter } from '../../sim/fighter';
import { glow } from '../materials';
import type { Particles } from '../fx/particles';
import { Animator } from './animator';
import { bodyForm } from './forms';
import { gearGeo } from './geo';
import { lookFor, type FighterLook } from './look';
import { buildRig, type Rig } from './rig';
import { emitMote, weaponVfx, type WeaponVfx } from '../gear/vfx';

export interface FxContext {
  add: Particles;
  smoke: Particles;
}

const _v = new Vector3();
const _qr = new Quaternion();
const _qp = new Quaternion();
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
 * Visual representation of one fighter: the rig built from its look (form,
 * colours, gear), animated by an Animator from simulation state, plus status
 * effects and item-specific FX.
 */
export class FighterView {
  readonly rig: Rig;
  readonly look: FighterLook;
  readonly group: Group;
  readonly anim: Animator;
  private flash = 0;
  private yaw: number;
  private emitAcc = 0;
  private time = 0;
  /** Weapon trail, edge glow and element motes, derived from the gear art. */
  readonly vfx: WeaponVfx;
  private readonly shield: Mesh;
  private readonly shieldMat: ShaderMaterial;
  private readonly ice: Mesh;
  private readonly stars: Group;
  private readonly mark: Mesh;
  private readonly orbiters: { item: string; mesh: Object3D; phase: number; radius: number }[] = [];
  private readonly scale: number;
  private shieldShown = 0;
  private phoenix: Object3D | null = null;
  /** Bones that turn on their own (halos, rings, rotors on skinned gear). */
  private readonly spinners: Object3D[] = [];
  private readonly clothVel = new Map<Object3D, number>();
  private clothV = 0;
  private clothVy = 0;
  /** World-space positions kept for effects (weapon trail etc.). */
  readonly tipWorld = new Vector3();
  readonly baseWorld = new Vector3();
  readonly headWorld = new Vector3();

  private readonly teamRing: Mesh;

  constructor(f: Fighter, team: 0 | 1, look: FighterLook = lookFor(f)) {
    const items = f.gearIds;
    this.look = look;
    this.rig = buildRig(look);
    this.group = this.rig.root;
    this.anim = new Animator(this.rig, bodyForm(look.form));
    // Team identity: coloured rim light and a glowing ring at the feet, so
    // mirror matches stay readable.
    const teamColor = team === 0 ? 0x4d8bff : 0xff4d5e;
    this.rig.uniforms.uRim.value.setHex(teamColor);
    teamRingGeo ??= new RingGeometry(0.62, 0.74, 40).rotateX(-Math.PI / 2);
    this.teamRing = new Mesh(teamRingGeo, glow(teamColor, 1.1));
    this.teamRing.position.y = 0.03;
    this.group.add(this.teamRing);
    this.yaw = this.yawFor(f.facing);
    this.group.rotation.y = this.yaw;
    this.vfx = weaponVfx(f.gear, f.skins);
    // Form height lives in the rig body; gear can add a little on top.
    this.scale = items.includes('colossus_boots') ? 1.05 : 1;
    this.group.scale.setScalar(this.scale);

    if (this.rig.enchantMaterial) {
      // Weapon edge glow takes the enchant colour (white-hot steel otherwise).
      if (this.vfx.edge !== null) this.rig.enchantMaterial.color.setHex(this.vfx.edge).multiplyScalar(2.2);
      else this.rig.enchantMaterial.color.setRGB(1, 1, 1);
    }
    this.phoenix = this.rig.phoenix;
    for (const [name, o] of this.rig.tags) if (name.startsWith('spin:')) this.spinners.push(o);
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

  /** A hit landed on this fighter. `fromX` is the attacker's x (for direction). */
  onHit(heavy: boolean, fromX?: number, blocked = false): void {
    this.flash = blocked ? 0.4 : 1;
    const dir = fromX === undefined ? 1 : Math.sign((fromX - this.group.position.x) * Math.cos(this.yaw)) || 1;
    this.anim.hit(heavy, dir, blocked);
  }

  onParry(): void {
    this.anim.parry();
  }

  /** Where the head should look (the opponent's head), in world space. */
  setLookAt(p: Vector3 | null): void {
    this.anim.hasLookAt = !!p;
    if (p) this.anim.lookAt.copy(p);
  }

  update(f: Fighter, alpha: number, dt: number, fx: FxContext, battleOver: boolean, winner: boolean, xScale = 1): void {
    this.time += dt;
    const x = (f.px + (f.x - f.px) * alpha) * xScale;
    const y = f.py + (f.y - f.py) * alpha;
    this.group.position.set(x, y, 0);

    // Turn to face (through the camera side).
    const targetYaw = this.yawFor(f.facing);
    this.yaw = damp(this.yaw, targetYaw, f.action && f.action.phase === 'active' ? 30 : 12, dt);
    this.group.rotation.y = this.yaw;

    this.anim.update(f, dt, battleOver, winner);

    // The ring stays on the ground while the fighter leaps.
    this.teamRing.position.y = (0.03 - y) / this.scale;
    this.teamRing.visible = f.alive;

    // Material uniforms: hit flash and status tint.
    this.flash = Math.max(0, this.flash - dt * 12);
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
      this.stars.position.set(0, (this.headWorld.y - this.group.position.y) / this.scale + 0.12, 0);
      this.stars.rotation.y += dt * 5;
    }
    const marked = !!getStatus(f, 'mark') && f.alive;
    this.mark.visible = marked;
    if (marked) {
      this.mark.position.set(0, (this.headWorld.y - this.group.position.y) / this.scale + 0.42 + Math.sin(this.time * 3) * 0.05, 0);
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
      if (o.item === 'storm_crown') on = 0.5 + f.stormCounter * 0.25;
      o.mesh.scale.setScalar(Math.max(0.01, (f.alive ? 1 : 0) * on * (1 + Math.sin(this.time * 6) * 0.05 * on)));
    }
    // Collapse the spent feather into the head (never scale to exactly zero: NaN normals).
    if (this.phoenix) this.phoenix.scale.setScalar(f.phoenixUsed ? 0.01 : 1);
    for (const o of this.spinners) o.rotation.y += (o.userData.spin as number) * dt;
  }

  private updateCloth(f: Fighter, dt: number): void {
    if (dt <= 0) return;
    // Swing back against the motion, lift when airborne, settle with a soft spring.
    const v = f.vx * (this.yaw > -Math.PI / 2 ? 1 : -1);
    // Speeding up or stopping kicks the cloth the other way; so do jumps and landings.
    const dv = v - this.clothV;
    const dy = f.vy - this.clothVy;
    this.clothV = v;
    this.clothVy = f.vy;
    this.rig.root.getWorldQuaternion(_qr).invert();
    for (const c of this.rig.cloth) {
      const k = (c.userData.stiffness as number | undefined) ?? 1;
      const target = clamp(-v * 0.09, -0.6, 0.7) + Math.sin(this.time * 2.6 + c.id) * 0.06 + (f.y > 0.3 ? 0.5 : 0) + (f.alive ? 0 : 0.3);
      const w = 9 * k;
      let vel = this.clothVel.get(c) ?? 0;
      // Inertia: when the parent (head, hips) swings, the cloth keeps its heading for a moment and trails behind.
      c.parent!.getWorldQuaternion(_qp).premultiply(_qr);
      _v.set(0, 1, 0).applyQuaternion(_qp);
      const ang = Math.atan2(-_v.x, _v.y);
      const prev = c.userData.parentAng as number | undefined;
      c.userData.parentAng = ang;
      if (prev !== undefined) {
        let d = ang - prev;
        if (d > Math.PI) d -= Math.PI * 2;
        else if (d < -Math.PI) d += Math.PI * 2;
        c.rotation.z -= clamp(d, -0.5, 0.5) * 0.85 / k;
      }
      vel += clamp(-dv * 1.6 - Math.abs(dy) * 0.4, -6, 6) / k;
      vel += (w * w * (target - c.rotation.z) - 2 * 0.35 * w * vel) * dt;
      c.rotation.z = clamp(c.rotation.z + vel * dt, -1.4, 1.4);
      this.clothVel.set(c, vel);
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

    // Elemental weapons shed motes along the blade.
    if (this.vfx.elements.length) {
      const tip = this.tipWorld, base = this.baseWorld;
      for (const e of this.vfx.elements) {
        _v.lerpVectors(base, tip, Math.random());
        emitMote(fx.add, e, _v.x, _v.y, _v.z, step * 30);
      }
    }

    // Phoenix ember on the helmet.
    if (f.has.has('phoenix_feather') && !f.phoenixUsed && Math.random() < 0.5) {
      _v2.copy(this.headWorld);
      fx.add.emit(_v2.x, _v2.y - 0.1, _v2.z, (Math.random() - 0.5) * 0.3, 0.6, 0, 0.6, 2.5, 1.0, 0.25, 0.07, -1, 0.5, 0.2, 0);
    }
    // Dust where feet land while running, and a puff when landing from the air.
    const g = this.anim.gait;
    for (let i = 0; i < 2; i++) {
      if (!g.landed[i] || Math.abs(f.vx) < 2.2) continue;
      const p = g.feet[i].pos;
      fx.smoke.emit(p.x, 0.06, p.z, -f.vx * 0.1, 0.3, 0, 0.5, 0.85, 0.8, 0.72, 0.2, 0, 2, 1.6, 0);
    }
    if (this.anim.landing > 0.9 && y < 0.05) {
      fx.smoke.burst({ x, y: 0.06, count: 8, jitter: 0.3, dir: [0, 1, 0], spread: 1.2, speed: [0.6, 1.6], life: [0.4, 0.8], size: [0.18, 0.3], color: 0xd8ccb8, intensity: 0.85, gravity: 0, sizeEnd: 2 });
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
