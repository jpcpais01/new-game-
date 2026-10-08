import { Group, Mesh, Object3D, type Scene } from 'three';
import { sfx } from '../audio/sfx';
import { Battle } from '../sim/battle';
import type { BattleEvent, Projectile, ProjectileStyle } from '../sim/types';
import type { FloatingText } from '../ui/floatingText';
import type { FightCamera } from './camera';
import { Lightning, Pulses, WeaponTrail } from './fx/effects';
import type { Particles } from './fx/particles';
import { accentOf } from './fighter/archetype';
import { FighterView, type FxContext } from './fighter/fighterView';
import { elementImpact } from './gear/vfx';
import { gearGeo } from './fighter/rig';
import * as kit from './gear/kit';
import { resolveArt } from '../gear/art';
import { itemArt } from '../gear/itemArt';
import { gearOf } from '../sim/gear';
import { glow, sceneToon } from './materials';
import type { GameRenderer } from './renderer';
import type { Arena } from './scene/arena';

interface ProjectileView {
  obj: Object3D;
  style: ProjectileStyle;
  /** Accent colour of the item that fired it. */
  tint: number;
  seen: boolean;
}

const STYLE_COLOR: Record<ProjectileStyle, number> = {
  arcane: 0x7fe8ff, hex: 0xc04dff, wave: 0xfff0f0, groundwave: 0xffa040, meteor: 0xff6a1a,
  arrow: 0xfff2c8, knife: 0xe8eef8, bolt: 0xffd0a0,
};

export interface ViewListener {
  onEvent(e: BattleEvent): void;
}

/**
 * Turns simulation state + events into everything on screen: fighter views,
 * projectiles, particles, camera shake, sounds and floating text.
 */
export class BattleView {
  battle: Battle | null = null;
  readonly fighters: [FighterView | null, FighterView | null] = [null, null];
  private readonly trails: [WeaponTrail, WeaponTrail];
  private readonly projectiles = new Map<number, ProjectileView>();
  private readonly projGroup = new Group();
  readonly pulses = new Pulses();
  readonly lightning = new Lightning();
  /** Real-time slow motion requested by dramatic moments. */
  timeScale = 1;
  private slowmoT = 0;
  private slowmoScale = 1;
  private time = 0;
  listener: ViewListener | null = null;
  /** Last time a callout of a given kind was shown per fighter, to avoid spam. */
  private readonly calloutAt = new Map<string, number>();

  constructor(
    private readonly scene: Scene,
    private readonly fx: FxContext & { add: Particles; smoke: Particles },
    private readonly cam: FightCamera,
    private readonly renderer: GameRenderer,
    public arena: Arena,
    private readonly text: FloatingText,
  ) {
    scene.add(this.projGroup, this.pulses.group, this.lightning.group);
    this.trails = [new WeaponTrail(0xffffff), new WeaponTrail(0xffffff)];
    for (const t of this.trails) scene.add(t.mesh);
  }

  /** Swap in a new battle and rebuild fighter models when loadouts change. */
  setBattle(b: Battle): void {
    this.battle = b;
    for (let i = 0; i < 2; i++) {
      const f = b.fighters[i];
      const old = this.fighters[i];
      if (old) old.dispose();
      const v = new FighterView(f, f.id);
      this.scene.add(v.group);
      this.fighters[i] = v;
      this.trails[i].setColor(v.vfx.look ? v.vfx.trail : accentOf(f));
      this.trails[i].setLife(v.vfx.trailLife);
    }
    for (const p of this.projectiles.values()) p.obj.removeFromParent();
    this.projectiles.clear();
    this.text.clear();
    this.timeScale = 1;
    this.slowmoT = 0;
  }

  slowmo(scale: number, duration: number): void {
    this.slowmoScale = scale;
    this.slowmoT = duration;
  }

  /** Called every rendered frame. `alpha` interpolates between sim steps. */
  update(dt: number, alpha: number, active: boolean): void {
    const b = this.battle;
    if (!b) return;
    this.time += dt;

    if (this.slowmoT > 0) {
      this.slowmoT -= dt;
      this.timeScale = this.slowmoT > 0 ? this.slowmoScale : 1;
    }

    for (const e of b.drainEvents()) this.handle(e);

    const [fa, fb] = b.fighters;
    this.cam.showcase += ((active ? 0 : 1) - this.cam.showcase) * Math.min(1, dt * 2);
    // In the loadout screen the fighters stand closer so they sit between the panels.
    const xScale = 1 - this.cam.showcase * 0.55;
    for (let i = 0; i < 2; i++) {
      const f = b.fighters[i];
      const v = this.fighters[i]!;
      v.update(f, alpha, dt, this.fx, b.over, b.winner === i, xScale);
      const a = f.action;
      const ab = a ? f.abilities[a.ability] : null;
      const swinging = !!a && !!ab && !a.feint && ab.power > 0 && ab.kind !== 'projectile' && ab.kind !== 'meteor'
        && (a.phase === 'active' || (a.phase === 'windup' && a.t > a.windup * 0.8) || (a.phase === 'recovery' && a.t < 0.06));
      this.trails[i].update(dt, v.baseWorld, v.tipWorld, swinging);
    }

    this.syncProjectiles(b, alpha);
    this.pulses.update(dt);
    this.lightning.update(dt);

    const ax = (fa.px + (fa.x - fa.px) * alpha) * xScale, bx = (fb.px + (fb.x - fb.px) * alpha) * xScale;
    this.cam.update(dt, ax, bx, fa.y, fb.y);
  }

  private syncProjectiles(b: Battle, alpha: number): void {
    for (const pv of this.projectiles.values()) pv.seen = false;
    for (const p of b.projectiles) {
      let pv = this.projectiles.get(p.id);
      if (!pv) {
        const tint = this.projectileTint(p);
        pv = { obj: this.makeProjectile(p, tint), style: p.style, tint, seen: true };
        this.projectiles.set(p.id, pv);
        this.projGroup.add(pv.obj);
      }
      pv.seen = true;
      const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha;
      pv.obj.position.set(x, y, 0);
      pv.obj.scale.x = Math.sign(p.vx) || 1;
      this.projectileTrail(p, x, y, pv.tint);
      pv.obj.rotation.z += p.style === 'meteor' ? 0.05 : 0;
      if (p.style === 'hex') pv.obj.rotation.y += 0.1;
      // Thrown blades tumble; the chakram spins in its own plane.
      const spinner = pv.obj.children[0];
      if (p.style === 'knife' && spinner) spinner.rotation.z -= 0.55;
      if (p.style === 'wave' && spinner) spinner.rotation.z -= 0.45;
      // Arrows and bolts follow their arc.
      if ((p.style === 'arrow' || p.style === 'bolt') && p.vx) pv.obj.rotation.z = Math.atan2(p.vy, Math.abs(p.vx)) * (Math.sign(p.vx) || 1);
    }
    for (const [id, pv] of this.projectiles) {
      if (!pv.seen) { pv.obj.removeFromParent(); this.projectiles.delete(id); }
    }
  }

  /** Tint of the gear piece whose ability fired this projectile. */
  private projectileTint(p: Projectile): number {
    const f = this.battle!.fighters[p.owner];
    const ab = f.abilities[p.ability];
    const id = ab && f.gearIds.find((g) => gearOf(g).abilities?.some((a) => a.id === ab.id));
    return id ? resolveArt(itemArt(id)).tint : STYLE_COLOR[p.style];
  }

  private makeProjectile(p: Projectile, tint: number): Object3D {
    const g = new Group();
    const c = STYLE_COLOR[p.style];
    switch (p.style) {
      case 'arcane': {
        g.add(new Mesh(gearGeo.sphere(0.12), glow(0xffffff, 5)));
        const shard = new Mesh(gearGeo.octa(0.2), glow(c, 2.4));
        shard.scale.set(1.8, 0.7, 0.7);
        g.add(shard);
        const ring = new Mesh(gearGeo.torus(0.24, 0.02), glow(0xbff8ff, 3));
        ring.rotation.y = Math.PI / 2;
        g.add(ring);
        break;
      }
      case 'hex': {
        g.add(new Mesh(gearGeo.sphere(0.28), glow(0x1a0628, 1)));
        const r = new Mesh(gearGeo.torus(0.42, 0.035), glow(c, 3));
        g.add(r);
        const r2 = new Mesh(gearGeo.torus(0.34, 0.02), glow(0xff8aff, 2.5));
        r2.rotation.x = Math.PI / 2;
        g.add(r2);
        for (let i = 0; i < 3; i++) {
          const o = new Mesh(gearGeo.octa(0.07), glow(0xe0a0ff, 3));
          const a = (i / 3) * Math.PI * 2;
          o.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0);
          g.add(o);
        }
        g.add(new Mesh(gearGeo.sphere(0.16), glow(c, 2.5)));
        break;
      }
      case 'wave': {
        // Spinning chakram riding a crescent of wind.
        const disc = new Group();
        disc.add(new Mesh(kit.torus(0.26, 0.035, Math.PI * 2, 4, 24), sceneToon(0xdfe6f2, tint, 0.25)));
        disc.add(new Mesh(kit.torus(0.17, 0.02, Math.PI * 2, 4, 18), glow(tint, 2.6)));
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const b = new Mesh(kit.cone(0.05, 0.18, 3), sceneToon(0xeef2fa));
          b.position.set(Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0);
          b.rotation.z = a - Math.PI / 2 - 0.5;
          b.scale.z = 0.35;
          disc.add(b);
        }
        g.add(disc);
        const arc = new Mesh(gearGeo.torus(0.7, 0.06, Math.PI * 0.9), glow(tint, 2.6));
        arc.rotation.z = -Math.PI * 0.45;
        arc.position.x = -0.25;
        g.add(arc);
        const arc2 = new Mesh(gearGeo.torus(0.58, 0.1, Math.PI * 0.8), glow(0xffffff, 0.9));
        arc2.rotation.z = -Math.PI * 0.4;
        arc2.position.x = -0.3;
        g.add(arc2);
        break;
      }
      case 'groundwave': {
        const m = new Mesh(gearGeo.box(1.0, 0.12, 0.8), glow(c, 2));
        m.position.y = -0.2;
        g.add(m);
        for (let i = 0; i < 3; i++) {
          const rock = new Mesh(gearGeo.cone(0.18, 0.6 - i * 0.12, 5), sceneToon(0x7a6a5a));
          rock.position.set(-i * 0.35, 0.05, (i - 1) * 0.2);
          g.add(rock);
        }
        break;
      }
      case 'arrow': case 'bolt': {
        // Models point along +X; the group is mirrored for leftward shots.
        const bolt = p.style === 'bolt';
        const len = bolt ? 0.6 : 0.95;
        const r = bolt ? 0.024 : 0.016;
        const shaft = new Mesh(kit.cyl(r, r, len, 6), sceneToon(bolt ? 0x6a4428 : 0x9a6a3a));
        shaft.rotation.z = Math.PI / 2;
        g.add(shaft);
        const head = new Mesh(kit.cone(bolt ? 0.06 : 0.055, bolt ? 0.16 : 0.2, 4), sceneToon(0xd6dde9, 0xffffff, 0.15));
        head.rotation.z = -Math.PI / 2;
        head.scale.z = 0.35;
        head.position.x = len / 2 + 0.08;
        g.add(head);
        const edge = new Mesh(kit.cone(0.03, 0.12, 4), glow(tint, 2.4));
        edge.rotation.z = -Math.PI / 2;
        edge.position.x = len / 2 + 0.1;
        g.add(edge);
        for (let i = 0; i < 3; i++) {
          // Fletching: three vanes around the tail in the item's colour.
          const vane = new Mesh(kit.box(bolt ? 0.12 : 0.2, bolt ? 0.07 : 0.09, 0.01), bolt ? sceneToon(0xc8cfdc) : sceneToon(tint));
          const a = (i / 3) * Math.PI * 2;
          vane.position.set(-len / 2 + 0.1, Math.cos(a) * 0.05, Math.sin(a) * 0.05);
          vane.rotation.x = a;
          g.add(vane);
        }
        break;
      }
      case 'knife': {
        const k = new Group();
        const bladeM = new Mesh(kit.blade(0.26, 0.07, 0.016, 0, 0.35, 0.2), sceneToon(0xe2e8f2, 0xffffff, 0.15));
        bladeM.position.y = 0.02;
        k.add(bladeM);
        const guard = new Mesh(kit.box(0.1, 0.02, 0.03), sceneToon(0xc8a050));
        k.add(guard);
        const handle = new Mesh(kit.cyl(0.018, 0.018, 0.1, 6), sceneToon(0x3a2418));
        handle.position.y = -0.06;
        k.add(handle);
        const ring = new Mesh(kit.torus(0.025, 0.008, Math.PI * 2, 4, 8), glow(tint, 2.2));
        ring.position.y = -0.125;
        k.add(ring);
        k.scale.setScalar(1.3);
        g.add(k);
        break;
      }
      case 'meteor': {
        g.add(new Mesh(gearGeo.ico(0.75), sceneToon(0x3a2620, 0xff4a10, 0.35)));
        const core = new Mesh(gearGeo.ico(0.68, 1), glow(0xff7a20, 2.6));
        g.add(core);
        for (let i = 0; i < 5; i++) {
          const chunk = new Mesh(gearGeo.ico(0.22), sceneToon(0x4a3228, 0xff5a10, 0.5));
          chunk.position.set(Math.cos(i * 1.3) * 0.7, Math.sin(i * 2.1) * 0.6, Math.sin(i * 1.3) * 0.5);
          g.add(chunk);
        }
        break;
      }
    }
    return g;
  }

  private projectileTrail(p: Projectile, x: number, y: number, tint: number): void {
    const add = this.fx.add;
    if (!p.ground) {
      // Soft additive halo, re-emitted every frame (cheaper and softer than a glow mesh).
      const c = STYLE_COLOR[p.style];
      const k = p.style === 'meteor' ? 1.4 : 1.1;
      add.emit(x, y, 0.05, 0, 0, 0, 0.05, ((c >> 16) & 255) / 255 * k, ((c >> 8) & 255) / 255 * k, (c & 255) / 255 * k,
        p.style === 'meteor' ? 3.2 : p.style === 'hex' ? 1.4 : 1.0, 0, 0, 1, 0);
    }
    switch (p.style) {
      case 'arcane':
        add.burst({ x, y, count: 2, jitter: 0.08, speed: [0.2, 0.8], life: [0.2, 0.4], size: [0.12, 0.22], color: STYLE_COLOR.arcane, intensity: 2.2 });
        break;
      case 'hex':
        add.burst({ x, y, count: 2, jitter: 0.2, speed: [0.2, 0.6], life: [0.3, 0.6], size: [0.15, 0.3], color: 0xa040ff, intensity: 1.8 });
        break;
      case 'wave':
        add.burst({ x, y, count: 3, jitter: 0.4, dir: [-Math.sign(p.vx) || -1, 0, 0], spread: 0.3, speed: [2, 5], life: [0.15, 0.3], size: [0.04, 0.08], color: tint, intensity: 2.4, stretch: 0.08 });
        break;
      case 'arrow': case 'bolt': case 'knife':
        // Thin streak behind fast shots.
        add.burst({ x: x - Math.sign(p.vx) * 0.3, y, count: 1, speed: [0, 0.2], life: [0.12, 0.2], size: [0.04, 0.07], color: tint, intensity: 2.2, sizeEnd: 0.2 });
        break;
      case 'groundwave':
        add.burst({ x, y: 0.1, count: 3, jitter: 0.3, dir: [0, 1, 0], spread: 0.6, speed: [2, 5], life: [0.3, 0.6], size: [0.08, 0.16], color: 0xffa040, intensity: 2, gravity: 14, stretch: 0.06 });
        this.fx.smoke.burst({ x, y: 0.2, count: 1, jitter: 0.3, speed: [0.2, 0.6], life: [0.5, 0.9], size: [0.5, 0.8], color: 0x8a7a6a, sizeEnd: 1.8 });
        break;
      case 'meteor':
        add.burst({ x, y, count: 6, jitter: 0.5, speed: [0.5, 2], life: [0.3, 0.7], size: [0.4, 0.8], color: 0xff6a1a, intensity: 2.2, gravity: -2 });
        this.fx.smoke.burst({ x, y: y + 0.5, count: 2, jitter: 0.4, speed: [0.2, 0.6], life: [0.8, 1.4], size: [0.8, 1.3], color: 0x2a2028, sizeEnd: 2 });
        break;
    }
  }

  private callout(key: string, gap = 1.2): boolean {
    const last = this.calloutAt.get(key) ?? -99;
    if (this.time - last < gap) return false;
    this.calloutAt.set(key, this.time);
    return true;
  }

  private pan(x: number): number {
    return (x - this.cam.camera.position.x) / 9;
  }

  private headY(i: number): number {
    return this.fighters[i]?.headWorld.y ?? 2.2;
  }

  private handle(e: BattleEvent): void {
    this.listener?.onEvent(e);
    const b = this.battle!;
    const add = this.fx.add, smoke = this.fx.smoke;
    switch (e.type) {
      case 'actionStart': {
        const f = b.fighters[e.f];
        const ab = f.abilities[e.ability];
        if (ab.slot === 'ultimate') {
          this.renderer.impact(0.9, accentOf(f));
          this.cam.kick(0.5);
          this.arena.excite(0.5);
          sfx.play('castBig', this.pan(f.x));
          add.burst({ x: f.x, y: 1.2, count: 40, jitter: 1.2, speed: [-3, -1], life: [0.4, 0.7], size: [0.08, 0.16], color: accentOf(f), intensity: 3, drag: 1 });
          this.pulses.spawn('ring', f.x, 0.05, 2.2, accentOf(f), 0.5, 3);
        } else if (ab.kind === 'projectile' || ab.kind === 'meteor') {
          sfx.play('cast', this.pan(f.x), 0.8);
        } else if (ab.id === 'war_cry' || ab.id === 'iron_skin') {
          sfx.play('roar', this.pan(f.x));
        }
        break;
      }
      case 'actionActive': {
        const f = b.fighters[e.f];
        const ab = f.abilities[e.ability];
        if (ab.kind === 'melee' || (ab.kind === 'dash' && ab.slot !== 'evade')) sfx.play(ab.heavy ? 'swingHeavy' : 'swing', this.pan(f.x));
        if (ab.kind === 'buff') {
          const col = ab.id === 'war_cry' ? 0xff3020 : 0xc8d4ff;
          this.pulses.spawn('ring', f.x, 0.05, 2.5, col, 0.6, 3);
          add.burst({ x: f.x, y: 1.2, count: 30, speed: [3, 7], life: [0.3, 0.6], size: [0.08, 0.16], color: col, intensity: 2.5, drag: 3, stretch: 0.05 });
          if (ab.id === 'war_cry') this.cam.shake(0.25);
        }
        if (ab.kind === 'dash' && ab.slot !== 'evade') {
          smoke.burst({ x: f.x, y: 0.15, count: 6, jitter: 0.3, dir: [-f.facing, 0.3, 0], spread: 0.5, speed: [1, 3], life: [0.4, 0.7], size: [0.35, 0.6], color: 0xd8c8b0, sizeEnd: 1.8, drag: 2 });
          add.burst({ x: f.x, y: 1.0, count: 20, dir: [-f.facing, 0, 0], spread: 0.3, speed: [4, 9], life: [0.2, 0.4], size: [0.06, 0.12], color: 0xffffff, intensity: 2.5, stretch: 0.08 });
        }
        break;
      }
      case 'hit': {
        const tv = this.fighters[e.target];
        if (e.dot) {
          if (e.amount > 0) this.text.spawn(String(e.amount), e.x, e.y, e.ability === 'poison' ? 'dot poison' : e.ability === 'thorns' ? 'dot thorns' : 'dot', 0.75, 0.7);
          break;
        }
        tv?.onHit(e.heavy);
        const att = b.fighters[e.attacker];
        const dir = Math.sign(e.x - att.x) || 1;
        const heavy = e.heavy || e.crit;
        // Weapon strikes carry the weapon's element: tinted sparks plus an element flourish.
        const kind = att.abilities.find((a) => a.id === e.ability)?.kind;
        const weaponHit = kind === 'melee' || kind === 'dash';
        const vfx = this.fighters[e.attacker]?.vfx;
        const elemental = weaponHit && !!vfx && vfx.lead !== 'none';
        const color = e.blocked ? 0xbfd8ff : elemental ? vfx!.spark : e.dtype === 'magic' ? 0xc58cff : e.ability === 'lightning' ? 0xaedcff : 0xffd27a;
        if (elemental && !e.blocked) elementImpact(add, smoke, vfx!.lead, e.x, e.y, dir, heavy);
        add.burst({
          x: e.x, y: e.y, count: e.blocked ? 10 : heavy ? 34 : 16, dir: [dir, 0.4, 0], spread: e.blocked ? 1.2 : 0.9,
          speed: heavy ? [6, 14] : [4, 9], life: [0.15, 0.4], size: [0.05, 0.11], color, intensity: 3, gravity: 9, drag: 2, stretch: 0.045,
        });
        add.burst({ x: e.x, y: e.y, count: 1, speed: [0, 0], life: [0.12, 0.12], size: [heavy ? 1.1 : 0.7, heavy ? 1.1 : 0.7], color, intensity: 1.2, sizeEnd: 1.4 });
        this.pulses.spawn('star', e.x, e.y, e.blocked ? 0.55 : heavy ? 1.35 : 0.85, color, heavy ? 0.18 : 0.12, 2.2);
        if (heavy && !e.blocked) {
          this.pulses.spawn('ring', e.x, e.y, 1.6, color, 0.3, 2.5);
          smoke.burst({ x: e.x, y: 0.15, count: 6, jitter: 0.4, speed: [0.5, 2], life: [0.5, 0.9], size: [0.4, 0.7], color: 0x8a8090, sizeEnd: 2 });
        }
        const pan = this.pan(e.x);
        if (e.blocked) sfx.play('block', pan);
        else sfx.play(heavy ? 'hitHeavy' : 'hit', pan, e.echo ? 0.5 : 1);
        if (e.crit) sfx.play('crit', pan);
        this.cam.shake(e.blocked ? 0.08 : e.killing ? 0.8 : heavy ? 0.35 : 0.12);
        if (heavy) { this.cam.kick(0.25); this.renderer.impact(0.6); this.arena.excite(0.25); }

        const cls = e.blocked ? 'blocked' : e.crit ? 'crit' : e.echo ? 'echo' : e.dtype === 'magic' ? 'magic' : heavy ? 'heavy' : '';
        const label = e.blocked ? `${e.amount}` : e.crit ? `${e.amount}!` : String(e.amount);
        this.text.spawn(label, e.x, e.y + 0.4, `dmg ${cls}`, e.crit ? 1.35 : heavy ? 1.15 : 1);
        if (e.blocked && this.callout(`block${e.target}`, 0.8)) this.text.spawn('BLOCK', e.x, e.y + 1.0, 'callout blocked', 0.8);
        if (e.ability === 'wall') this.text.spawn('WALL SPLAT!', e.x, e.y + 1.2, 'callout heavy', 1.2, 1.1);
        break;
      }
      case 'parry':
        this.pulses.spawn('ring', e.x, e.y, 1.4, 0xffffff, 0.3, 4);
        this.pulses.spawn('star', e.x, e.y, 1.6, 0xbfe4ff, 0.2, 3);
        add.burst({ x: e.x, y: e.y, count: 30, speed: [6, 12], life: [0.15, 0.35], size: [0.05, 0.1], color: 0xe8f4ff, intensity: 4, drag: 3, stretch: 0.06 });
        sfx.play('parry', this.pan(e.x));
        this.text.spawn('PARRY!', e.x, e.y + 1.3, 'callout parry', 1.3, 1.1);
        this.cam.shake(0.25);
        this.cam.kick(0.3);
        this.renderer.impact(0.4);
        this.arena.excite(0.4);
        break;
      case 'evade': break;
      case 'heal':
        add.burst({ x: b.fighters[e.f].x, y: 1.0, count: 6, jitter: 0.4, dir: [0, 1, 0], spread: 0.3, speed: [0.8, 1.6], life: [0.5, 0.8], size: [0.08, 0.14], color: 0x6dff8a, intensity: 2 });
        if (e.amount >= 15) this.text.spawn(`+${e.amount}`, b.fighters[e.f].x, this.headY(e.f), 'heal', 0.85);
        break;
      case 'shield':
        this.pulses.spawn('ring', b.fighters[e.f].x, 1.0, 1.4, 0xffd76b, 0.4, 2);
        sfx.play('shield', this.pan(b.fighters[e.f].x));
        break;
      case 'shieldBreak':
        add.burst({ x: b.fighters[e.f].x, y: 1.1, count: 26, speed: [3, 7], life: [0.3, 0.6], size: [0.06, 0.12], color: 0xffd76b, intensity: 3, gravity: 8, stretch: 0.03 });
        this.text.spawn('SHIELD BROKEN', b.fighters[e.f].x, this.headY(e.f), 'callout', 0.8);
        break;
      case 'status': {
        const f = b.fighters[e.f];
        if (e.status === 'frozen') {
          add.burst({ x: f.x, y: 1.0, count: 40, jitter: 0.4, speed: [2, 6], life: [0.3, 0.7], size: [0.06, 0.14], color: 0xbff4ff, intensity: 3, gravity: 6 });
          sfx.play('freeze', this.pan(f.x));
          this.text.spawn('FROZEN!', f.x, this.headY(e.f) + 0.2, 'callout frost', 1.1, 1);
        } else if (e.status === 'stun') {
          if (this.callout(`stun${e.f}`, 1.5)) this.text.spawn('STUNNED', f.x, this.headY(e.f) + 0.2, 'callout stun', 0.9);
        } else if (e.status === 'rage') {
          this.text.spawn('ENRAGED', f.x, this.headY(e.f) + 0.2, 'callout heavy', 0.9);
        } else if (e.status === 'mark' && e.stacks === 1) {
          this.text.spawn('HEXED', f.x, this.headY(e.f) + 0.2, 'callout magic', 0.8);
        }
        break;
      }
      case 'wallSplat':
        this.pulses.spawn('star', e.x, 1.2, 1.5, 0xffd27a, 0.2, 2.5);
        smoke.burst({ x: e.x, y: 1, count: 14, jitter: 0.5, jitterY: 0.8, speed: [1, 3], life: [0.6, 1.0], size: [0.5, 0.9], color: 0x9a90a0, sizeEnd: 2 });
        add.burst({ x: e.x, y: 1.2, count: 20, speed: [3, 8], life: [0.2, 0.5], size: [0.06, 0.12], color: 0xffc070, intensity: 3, gravity: 10, stretch: 0.04 });
        this.cam.shake(0.45);
        this.arena.excite(0.4);
        break;
      case 'revive': {
        const f = b.fighters[e.f];
        this.pulses.spawn('pillar', f.x, 0, 0.9, 0xff8a2a, 1.0, 3);
        this.pulses.spawn('ring', f.x, 0.05, 3.5, 0xff8a2a, 0.7, 3);
        add.burst({ x: f.x, y: 1, count: 80, jitter: 0.5, speed: [2, 9], life: [0.5, 1.1], size: [0.15, 0.35], color: 0xff7a1a, intensity: 3, gravity: -3, drag: 1.5 });
        sfx.play('revive', this.pan(f.x));
        this.text.spawn('REVIVE!', f.x, this.headY(e.f) + 0.4, 'callout fire', 1.4, 1.4);
        this.cam.shake(0.4);
        this.arena.excite(0.8);
        this.slowmo(0.35, 0.6);
        break;
      }
      case 'lightning':
        this.lightning.strike(e.x, 1.2);
        this.lightning.strike(e.x + (Math.random() - 0.5) * 0.4, 1.0);
        add.burst({ x: e.x, y: 1.2, count: 24, speed: [3, 8], life: [0.15, 0.35], size: [0.05, 0.1], color: 0xaedcff, intensity: 4, stretch: 0.05 });
        this.pulses.spawn('ring', e.x, 0.05, 1.8, 0xaedcff, 0.35, 3);
        sfx.play('lightning', this.pan(e.x));
        this.cam.shake(0.3);
        break;
      case 'reflect':
        this.pulses.spawn('ring', e.x, e.y, 1.0, 0xaff6ff, 0.3, 4);
        this.text.spawn('REFLECT!', e.x, e.y + 1, 'callout frost', 1);
        sfx.play('parry', this.pan(e.x), 0.7);
        break;
      case 'shockwave': {
        const col = e.style === 'nova' ? 0x9fe8ff : e.style === 'meteor' ? 0xff6a1a : e.style === 'judgment' ? 0xffe08a : 0xffa040;
        this.pulses.spawn('ring', e.x, 0.06, e.radius * 1.3, col, 0.55, 3);
        if (e.style !== 'nova') this.pulses.spawn('crack', e.x, 0, e.radius * (e.style === 'meteor' ? 1.0 : 0.75), col, 2.4);
        if (e.style === 'meteor' || e.style === 'judgment') {
          this.pulses.spawn('pillar', e.x, 0, e.radius * 0.45, col, 0.6, 2.5);
          this.renderer.impact(1.2, col);
          add.burst({ x: e.x, y: 0.3, count: 70, jitter: 0.6, dir: [0, 1, 0], spread: 1.2, speed: [4, 12], life: [0.4, 1.0], size: [0.12, 0.3], color: col, intensity: 3, gravity: 10, drag: 1 });
          smoke.burst({ x: e.x, y: 0.4, count: 18, jitter: 1, speed: [1, 4], life: [0.8, 1.5], size: [0.8, 1.4], color: 0x5a4a50, sizeEnd: 2.2, drag: 1.5 });
          sfx.play('explosion', this.pan(e.x));
          this.cam.shake(0.7);
          this.renderer.impact(1);
          this.arena.excite(0.7);
        } else if (e.style === 'nova') {
          add.burst({ x: e.x, y: 1, count: 50, speed: [5, 10], life: [0.3, 0.6], size: [0.06, 0.14], color: col, intensity: 3, drag: 3, stretch: 0.04 });
          sfx.play('freeze', this.pan(e.x));
          this.cam.shake(0.2);
        } else {
          smoke.burst({ x: e.x, y: 0.3, count: 14, jitter: 0.8, speed: [1, 4], life: [0.6, 1.1], size: [0.6, 1.1], color: 0x7a6a60, sizeEnd: 2, drag: 1.5 });
          add.burst({ x: e.x, y: 0.2, count: 30, jitter: 0.6, dir: [0, 1, 0], spread: 1, speed: [3, 8], life: [0.3, 0.7], size: [0.08, 0.16], color: col, intensity: 2.5, gravity: 14 });
          sfx.play('hitHeavy', this.pan(e.x));
          this.cam.shake(0.5);
        }
        break;
      }
      case 'projectileEnd': {
        if (!e.hit && e.style !== 'meteor') {
          add.burst({ x: e.x, y: e.y, count: 8, speed: [1, 3], life: [0.2, 0.4], size: [0.08, 0.14], color: STYLE_COLOR[e.style], intensity: 2 });
        } else if (e.style !== 'meteor') {
          add.burst({ x: e.x, y: e.y, count: 20, speed: [2, 6], life: [0.2, 0.5], size: [0.08, 0.18], color: STYLE_COLOR[e.style], intensity: 3, drag: 2 });
        }
        break;
      }
      case 'blink': {
        const col = 0xb07aff;
        for (const x of [e.from, e.to]) {
          add.burst({ x, y: 1, count: 30, jitter: 0.3, jitterY: 0.8, speed: [1, 4], life: [0.3, 0.6], size: [0.06, 0.14], color: col, intensity: 3, drag: 2 });
        }
        this.pulses.spawn('ring', e.to, 0.05, 1.2, col, 0.35, 3);
        sfx.play('whoosh', this.pan(e.to));
        break;
      }
      case 'feint': {
        const f = b.fighters[e.f];
        this.text.spawn('FEINT', f.x, this.headY(e.f) + 0.1, 'callout', 0.8);
        break;
      }
      case 'ko': {
        const f = b.fighters[e.f];
        this.pulses.spawn('ring', f.x, 0.05, 4, 0xffffff, 0.8, 3);
        add.burst({ x: f.x, y: 1.2, count: 60, speed: [4, 12], life: [0.4, 0.9], size: [0.08, 0.18], color: 0xfff0c0, intensity: 3.5, gravity: 6, drag: 1, stretch: 0.04 });
        sfx.play('ko', this.pan(f.x));
        this.cam.shake(1);
        this.cam.kick(0.8);
        this.renderer.impact(1.6);
        this.pulses.spawn('star', f.x, 1.2, 2.2, 0xfff0c0, 0.3, 3);
        this.arena.excite(1);
        this.slowmo(0.22, 1.4);
        break;
      }
      case 'end':
        if (e.reason === 'time') sfx.play('ko');
        break;
      default:
        break;
    }
    if (e.type === 'actionStart') {
      const f = b.fighters[e.f];
      if (f.abilities[e.ability].slot === 'evade') {
        smoke.burst({ x: f.x, y: 0.15, count: 5, jitter: 0.3, speed: [0.5, 1.5], life: [0.4, 0.7], size: [0.3, 0.5], color: 0x9a90a0, sizeEnd: 1.8 });
        sfx.play('whoosh', this.pan(f.x), 0.7);
      }
    }
  }

  dispose(): void {
    for (const v of this.fighters) v?.dispose();
  }
}
