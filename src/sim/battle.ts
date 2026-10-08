import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import { Brain, type FighterBrain } from './ai/brain';
import {
  ARENA_HALF_WIDTH, BASE_ENERGY_REGEN, BODY_GAP, DT, ENERGY_ON_DEAL, ENERGY_ON_TAKE, MAX_ENERGY,
  ROUND_TIME, START_GAP, WALL_SPLAT_SPEED,
} from './constants';
import {
  createFighter, getStatus, isDisabled, reachOf, refreshStats, type Fighter, type FighterConfig,
} from './fighter';
import type {
  AbilityDef, BattleEvent, DamageType, FighterId, Projectile, StatusApply, StatusId,
} from './types';

export interface BattleConfig {
  seed: number;
  fighters: [FighterConfig, FighterConfig];
  /** Overrides the AI controller per side (benchmarks against older AIs). */
  brains?: [BrainFactory?, BrainFactory?];
}

export type BrainFactory = (f: Fighter, variance: number) => FighterBrain;

interface HitOptions {
  mult?: number;
  isCounter?: boolean;
  fromProjectile?: Projectile;
  /** Hit came from an AoE, so facing does not matter for guards. */
  aoe?: boolean;
  /** Overrides the ability's heavy flag (multi-hit flurries). */
  heavyOverride?: boolean;
}

const BODY_HEIGHT = 1.9;
const GRAVITY = 30;

/**
 * Deterministic battle simulation. Pure data in, events out; it knows nothing
 * about rendering. Advance with `step()` at a fixed DT.
 */
export class Battle {
  readonly rng: Rng;
  readonly seed: number;
  readonly fighters: [Fighter, Fighter];
  readonly brains: [FighterBrain, FighterBrain];
  readonly projectiles: Projectile[] = [];
  /** Events produced since the consumer last drained them. */
  events: BattleEvent[] = [];
  tick = 0;
  time = 0;
  hitstop = 0;
  over = false;
  winner: FighterId | -1 = -1;
  /** Seconds since the battle ended (physics keeps running for the KO). */
  endTime = 0;
  private nextProjectileId = 1;

  constructor(cfg: BattleConfig) {
    this.seed = cfg.seed >>> 0;
    this.rng = new Rng(this.seed);
    const a = createFighter(0, cfg.fighters[0]);
    const b = createFighter(1, cfg.fighters[1]);
    a.x = a.px = -START_GAP;
    b.x = b.px = START_GAP;
    this.fighters = [a, b];
    const make = (i: 0 | 1, f: Fighter, v: number): FighterBrain => cfg.brains?.[i]?.(f, v) ?? new Brain(f, v);
    this.brains = [make(0, a, this.rng.next()), make(1, b, this.rng.next())];
    for (const f of this.fighters) refreshStats(f);
  }

  emit(e: BattleEvent): void {
    if (!this.sandbox) this.events.push(e);
  }

  /** True for look-ahead copies made by `fork`: their events are dropped. */
  sandbox = false;

  /**
   * Independent copy of the whole battle for AI look-ahead. The copy draws
   * from its own RNG (`seed`) so it can't peek at the real battle's future
   * rolls, drops its events, and is driven by the brains `brains` returns.
   */
  fork(seed: number, brains: (copy: Battle) => [FighterBrain, FighterBrain]): Battle {
    const c = Object.create(Battle.prototype) as Battle;
    const w = c as unknown as Record<string, unknown>;
    for (const k of Object.keys(this)) w[k] = cloneValue((this as unknown as Record<string, unknown>)[k]);
    w.rng = new Rng(seed);
    w.fighters = [cloneFighter(this.fighters[0]), cloneFighter(this.fighters[1])];
    w.events = [];
    c.sandbox = true;
    w.brains = brains(c);
    return c;
  }

  /** Remove and return all pending events. */
  drainEvents(): BattleEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  other(f: Fighter): Fighter {
    return this.fighters[f.id === 0 ? 1 : 0];
  }

  // ---------------------------------------------------------------------------
  // Main step
  // ---------------------------------------------------------------------------

  step(): void {
    for (const f of this.fighters) { f.px = f.x; f.py = f.y; }
    for (const p of this.projectiles) { p.px = p.x; p.py = p.y; }

    if (this.hitstop > 0) {
      this.hitstop -= DT;
      return;
    }
    this.tick++;

    if (this.over) {
      this.endTime += DT;
      for (const f of this.fighters) {
        this.updateStatuses(f, false);
        if (f.action && f.alive) this.updateAction(f);
        this.physics(f);
      }
      this.updateProjectiles();
      return;
    }

    this.time += DT;
    const [a, b] = this.fighters;

    for (const f of this.fighters) {
      this.updateTimers(f);
      refreshStats(f);
    }

    // Alternate think order every tick so neither side gets a systematic edge.
    const first = (this.tick & 1) === 0 ? 0 : 1;
    this.brains[first].think(this);
    this.brains[1 - first].think(this);

    if ((this.tick & 1) === 0) { this.updateAction(a); this.updateAction(b); }
    else { this.updateAction(b); this.updateAction(a); }

    this.physics(a);
    this.physics(b);
    this.resolveBodies();
    this.updateFacing(a);
    this.updateFacing(b);
    this.updateProjectiles();
    this.checkEnd();
  }

  // ---------------------------------------------------------------------------
  // Timers, statuses, energy
  // ---------------------------------------------------------------------------

  private updateTimers(f: Fighter): void {
    if (!f.alive) return;
    for (let i = 0; i < f.cooldowns.length; i++) if (f.cooldowns[i] > 0) f.cooldowns[i] -= DT;
    if (f.stagger > 0) f.stagger -= DT;
    if (f.invuln > 0) f.invuln -= DT;
    if (f.mirrorCd > 0) f.mirrorCd -= DT;
    if (f.ironWillCd > 0) f.ironWillCd -= DT;
    f.sinceHurt += DT;
    f.sinceHit += DT;

    f.energy = Math.min(MAX_ENERGY, f.energy + BASE_ENERGY_REGEN * f.stats.energyRegen * DT);

    for (let i = f.echoQueue.length - 1; i >= 0; i--) {
      const e = f.echoQueue[i];
      e.delay -= DT;
      if (e.delay <= 0) {
        f.echoQueue.splice(i, 1);
        const t = this.other(f);
        if (t.alive && t.invuln <= 0) {
          const dealt = this.applyDamage(f, t, e.amount, 'true');
          this.emit({ type: 'hit', attacker: f.id, target: t.id, amount: dealt, crit: false, dtype: e.dtype,
            blocked: false, heavy: false, ability: 'echo', x: t.x, y: t.y + 1.2, killing: !t.alive, echo: true });
        }
      }
    }

    this.updateStatuses(f, true);
  }

  private updateStatuses(f: Fighter, dots: boolean): void {
    const list = f.statuses;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (!s) continue;
      s.remaining -= DT;
      if (dots && (s.id === 'burn' || s.id === 'poison') && f.alive) {
        const dps = s.id === 'burn' ? s.sourcePower * 0.2 * s.stacks : s.sourcePower * 0.09 * s.stacks;
        s.acc += dps * DT;
        s.tickT += DT;
        if (s.tickT >= 0.5 || s.remaining <= 0) {
          const src = this.fighters[s.source];
          const dealt = this.applyDamage(src, f, s.acc, s.id === 'burn' ? 'magic' : 'true');
          if (dealt > 0) {
            this.emit({ type: 'hit', attacker: src.id, target: f.id, amount: dealt, crit: false, dtype: 'magic',
              blocked: false, heavy: false, ability: s.id, x: f.x, y: f.y + 1.4, killing: !f.alive, dot: true });
          }
          s.acc = 0;
          s.tickT = 0;
          // A revive replaces the status list; stop iterating the stale one.
          if (f.statuses !== list) return;
        }
      }
      if (s.remaining <= 0) list.splice(i, 1);
    }
  }

  applyStatus(target: Fighter, source: Fighter, apply: StatusApply): void {
    if (!target.alive) return;
    let dur = apply.duration;
    const cc = apply.status === 'stun' || apply.status === 'frozen';
    const debuff = cc || apply.status === 'chill' || apply.status === 'burn' || apply.status === 'poison'
      || apply.status === 'mark' || apply.status === 'vulnerable';
    if (debuff && target.id !== source.id) dur *= 1 - target.stats.tenacity;
    if (cc) {
      if (target.has.has('iron_helm') && target.ironWillCd <= 0) {
        target.ironWillCd = 10;
        this.emit({ type: 'thought', f: target.id, text: 'Iron Will shrugs off the stun!' });
        return;
      }
      if (target.action && !target.action.feint) target.action = null;
    }
    const maxStacks: Partial<Record<StatusId, number>> = { burn: 3, poison: 5, chill: 5 };
    const existing = getStatus(target, apply.status);
    const add = apply.stacks ?? 1;
    if (existing) {
      existing.remaining = Math.max(existing.remaining, dur);
      existing.stacks = Math.min(maxStacks[apply.status] ?? 1, existing.stacks + add);
      existing.sourcePower = Math.max(existing.sourcePower, source.stats.power);
      existing.source = source.id;
    } else {
      target.statuses.push({
        id: apply.status, remaining: dur, stacks: Math.min(maxStacks[apply.status] ?? 1, add),
        sourcePower: source.stats.power, source: source.id, acc: 0, tickT: 0,
      });
    }
    const st = getStatus(target, apply.status)!;
    if (apply.status === 'chill' && st.stacks >= 5) {
      target.statuses.splice(target.statuses.indexOf(st), 1);
      this.applyStatus(target, source, { status: 'frozen', duration: 1.0 });
      return;
    }
    this.emit({ type: 'status', f: target.id, status: apply.status, stacks: st.stacks });
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  canUse(f: Fighter, idx: number): boolean {
    if (!f.alive || f.action || isDisabled(f)) return false;
    const ab = f.abilities[idx];
    return f.cooldowns[idx] <= 0 && f.energy >= ab.cost;
  }

  /** Effective cooldown after reductions. */
  cooldownOf(f: Fighter, ab: AbilityDef): number {
    return ab.cooldown * (1 - f.stats.cdr);
  }

  startAction(f: Fighter, idx: number): boolean {
    if (!this.canUse(f, idx)) return false;
    const ab = f.abilities[idx];
    const e = this.other(f);
    const spd = f.stats.attackSpeed;
    f.cooldowns[idx] = this.cooldownOf(f, ab);
    f.energy -= ab.cost;

    let dir: number = f.facing;
    let through = !!ab.dash?.through;
    if (ab.slot === 'evade') {
      // Backstep by default; roll through when cornered, or whenever the enemy
      // is in reach if the boots allow it (Shadow Treads).
      dir = -f.facing;
      through = false;
      const dest = f.x + dir * ab.dash!.distance;
      const rollThrough = ab.dash!.through && Math.abs(e.x - f.x) < ab.dash!.distance - 0.6;
      if (rollThrough || Math.abs(dest) > ARENA_HALF_WIDTH - 0.6) {
        dir = f.facing;
        through = true;
      }
    }

    let targetX = e.x;
    if (ab.kind === 'meteor') {
      // Lead the target: where will they be when the meteor lands?
      const fall = 12 / ab.projectile!.speed;
      const lead = (ab.windup / spd + fall) * e.vx * 0.6;
      targetX = clamp(e.x + lead, -ARENA_HALF_WIDTH + 1, ARENA_HALF_WIDTH - 1);
    }

    f.action = {
      ability: idx, phase: 'windup', t: 0, total: 0,
      windup: ab.windup / spd,
      active: ab.hits && ab.hits > 1 ? ab.active / Math.sqrt(spd) : ab.active,
      recovery: ab.recovery / spd,
      hitsDone: 0, connected: false, feint: false, targetX, startX: f.x, isCounter: false,
      dir, through,
    };
    f.move = 0;
    if (ab.slot === 'evade') f.totals.evades++;
    this.emit({ type: 'actionStart', f: f.id, ability: idx });
    return true;
  }

  /** Cancel a windup (feint). Only allowed in the first part of a windup. */
  feint(f: Fighter): boolean {
    const a = f.action;
    if (!a || a.phase !== 'windup' || a.feint) return false;
    const ab = f.abilities[a.ability];
    if (a.t > a.windup * 0.7) return false;
    a.feint = true;
    a.phase = 'recovery';
    a.t = 0;
    a.recovery = 0.12;
    // Feinting refunds most of the cooldown so the real attack can follow.
    f.cooldowns[a.ability] = Math.min(f.cooldowns[a.ability], 0.6);
    f.energy = Math.min(MAX_ENERGY, f.energy + ab.cost);
    f.totals.feints++;
    this.emit({ type: 'feint', f: f.id });
    return true;
  }

  private updateAction(f: Fighter): void {
    const a = f.action;
    if (!a || !f.alive) return;
    const ab = f.abilities[a.ability];
    const e = this.other(f);
    a.t += DT;
    a.total += DT;

    if (a.phase === 'windup') {
      if (ab.lunge && !a.feint) f.x += a.dir * (ab.lunge * 0.25) / a.windup * DT;
      const leapAttack = ab.airborne && ab.kind !== 'dash';
      if (leapAttack) {
        const p = a.t / a.windup;
        f.y = Math.sin(Math.min(1, p) * Math.PI) * 2.2;
      }
      if (a.t >= a.windup) {
        a.phase = 'active';
        a.t = 0;
        if (leapAttack) f.y = 0;
        this.emit({ type: 'actionActive', f: f.id, ability: a.ability });
        this.enterActive(f, e, ab);
      }
      return;
    }

    if (a.phase === 'active') {
      if (ab.lunge) f.x += a.dir * (ab.lunge * 0.75) / Math.max(a.active, DT) * DT;

      if (ab.kind === 'melee') {
        const hits = ab.hits ?? 1;
        // Distribute hits over the active window, first one immediately.
        const due = hits === 1 ? 1 : Math.min(hits, 1 + Math.floor((a.t / a.active) * hits));
        while (a.hitsDone < due) {
          a.hitsDone++;
          if (this.inMeleeReach(f, e, reachOf(f, ab))) {
            const last = a.hitsDone === hits;
            this.abilityHit(f, e, ab, { heavyOverride: hits > 1 && !last ? false : undefined });
          }
        }
      } else if (ab.kind === 'dash') {
        const speed = ab.dash!.distance / a.active;
        const before = Math.sign(e.x - f.x);
        f.x += a.dir * speed * DT;
        // Leaping evades arc over the ground.
        if (ab.airborne) f.y = Math.sin(Math.min(1, a.t / a.active) * Math.PI) * 1.3;
        if (a.through && ab.dash!.strike && !a.connected) {
          const after = Math.sign(e.x - f.x);
          if (before !== after && before !== 0 && Math.abs(e.y - f.y) < 1.5) {
            a.connected = true;
            this.abilityHit(f, e, ab, {});
          }
        }
        if (a.through) f.x = clamp(f.x, -ARENA_HALF_WIDTH, ARENA_HALF_WIDTH);
      }

      if (a.t >= a.active) {
        a.phase = 'recovery';
        a.t = 0;
        if (ab.kind === 'dash') f.vx = a.dir * 2;
      }
      return;
    }

    if (a.t >= a.recovery) {
      f.action = null;
    }
  }

  private enterActive(f: Fighter, e: Fighter, ab: AbilityDef): void {
    const a = f.action!;
    switch (ab.kind) {
      case 'projectile':
        this.spawnProjectile(f, ab, a.ability);
        break;
      case 'meteor':
        this.spawnMeteor(f, ab, a.ability, a.targetX);
        break;
      case 'aoe': {
        const style = ab.id === 'frost_nova' ? 'nova' : ab.id === 'judgment' ? 'judgment' : 'slam';
        const radius = reachOf(f, ab);
        this.emit({ type: 'shockwave', x: f.x, radius, f: f.id, style });
        if (Math.abs(e.x - f.x) <= radius && e.y < 1.6) this.abilityHit(f, e, ab, { aoe: true });
        break;
      }
      case 'buff':
        if (ab.buff) for (const b of ab.buff) this.applyStatus(f, f, b);
        if (ab.heal) this.heal(f, f.stats.maxHp * ab.heal);
        if (ab.shieldGain) {
          const amount = f.stats.maxHp * ab.shieldGain;
          f.shield = Math.max(f.shield, amount);
          this.emit({ type: 'shield', f: f.id, amount });
        }
        break;
      case 'blink': {
        const from = f.x;
        let dest = f.x - f.facing * ab.dash!.distance;
        if (Math.abs(dest) > ARENA_HALF_WIDTH - 0.5) {
          // Cornered: appear behind the enemy instead.
          dest = e.x + f.facing * 2.2;
          if (Math.abs(dest) > ARENA_HALF_WIDTH - 0.5) dest = clamp(dest, -ARENA_HALF_WIDTH + 0.5, ARENA_HALF_WIDTH - 0.5);
        }
        f.x = f.px = dest;
        f.vx = 0;
        f.invuln = Math.max(f.invuln, ab.iframes ?? 0.2);
        this.emit({ type: 'blink', f: f.id, from, to: dest });
        break;
      }
      case 'dash':
        f.invuln = Math.max(f.invuln, ab.dash!.iframes);
        break;
      case 'guard':
      case 'melee':
        break;
    }
  }

  private inMeleeReach(f: Fighter, e: Fighter, range: number): boolean {
    const dx = e.x - f.x;
    const dist = Math.abs(dx);
    if (dist > range) return false;
    if (dist > 0.7 && Math.sign(dx) !== f.facing) return false;
    return e.y < 2.2;
  }

  private spawnProjectile(f: Fighter, ab: AbilityDef, idx: number): void {
    const pr = ab.projectile!;
    const ground = !!pr.ground;
    this.projectiles.push({
      id: this.nextProjectileId++, owner: f.id, style: pr.style,
      x: f.x + f.facing * 0.7, y: ground ? 0.25 : 1.25, px: f.x, py: ground ? 0.25 : 1.25,
      vx: f.facing * pr.speed, vy: 0, radius: pr.radius, life: 2.2, ability: idx,
      power: f.stats.power, ground, reflected: false, targetX: 0, alive: true,
    });
  }

  private spawnMeteor(f: Fighter, ab: AbilityDef, idx: number, targetX: number): void {
    const pr = ab.projectile!;
    const startX = targetX - f.facing * 4;
    const y0 = 12;
    const fall = y0 / pr.speed;
    this.projectiles.push({
      id: this.nextProjectileId++, owner: f.id, style: 'meteor',
      x: startX, y: y0, px: startX, py: y0,
      vx: (targetX - startX) / fall, vy: -pr.speed, radius: pr.radius, life: fall + 0.5, ability: idx,
      power: f.stats.power, ground: false, reflected: false, targetX, alive: true,
    });
  }

  private updateProjectiles(): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.life -= DT;
      const owner = this.fighters[p.owner];
      const target = this.other(owner);
      const ab = owner.abilities[p.ability];

      if (p.style === 'meteor') {
        if (p.y <= 0.4) {
          p.alive = false;
          this.emit({ type: 'shockwave', x: p.x, radius: p.radius, f: owner.id, style: 'meteor' });
          const hit = !this.over && target.alive && Math.abs(target.x - p.x) <= p.radius + 0.4 && target.invuln <= 0;
          if (hit) this.abilityHit(owner, target, ab, { fromProjectile: p, aoe: true });
          this.emit({ type: 'projectileEnd', id: p.id, x: p.x, y: 0.2, style: p.style, hit });
        }
        continue;
      }

      if (!this.over && target.alive) {
        const dx = Math.abs(target.x - p.x);
        const vertical = p.ground ? target.y < 0.45 : target.y < 1.6;
        if (dx < p.radius + 0.45 && vertical) {
          if (target.invuln > 0) {
            // Phases through; keep flying.
          } else if (target.has.has('mirror_aegis') && target.mirrorCd <= 0 && !p.ground) {
            target.mirrorCd = 4;
            this.reflectProjectile(p, target);
            continue;
          } else {
            const res = this.guardCheck(target, owner, ab, p);
            if (res === 'reflect') {
              this.reflectProjectile(p, target);
              continue;
            }
            p.alive = false;
            if (res !== 'parry') this.abilityHit(owner, target, ab, { fromProjectile: p }, res === 'block');
            this.emit({ type: 'projectileEnd', id: p.id, x: p.x, y: p.y, style: p.style, hit: true });
            continue;
          }
        }
      }

      if (p.life <= 0 || Math.abs(p.x) > ARENA_HALF_WIDTH + 2) {
        p.alive = false;
        this.emit({ type: 'projectileEnd', id: p.id, x: p.x, y: p.y, style: p.style, hit: false });
      }
    }
    // Compact dead projectiles without allocating.
    let w = 0;
    for (let r = 0; r < this.projectiles.length; r++) {
      const p = this.projectiles[r];
      if (p.alive) this.projectiles[w++] = p;
    }
    this.projectiles.length = w;
  }

  private reflectProjectile(p: Projectile, by: Fighter): void {
    p.owner = by.id;
    p.vx = -p.vx * 1.15;
    p.reflected = true;
    p.life = 2;
    p.power = Math.max(p.power, by.stats.power);
    this.emit({ type: 'reflect', f: by.id, x: p.x, y: p.y });
    this.emit({ type: 'thought', f: by.id, text: 'Reflected it straight back!' });
  }

  // ---------------------------------------------------------------------------
  // Hits and damage
  // ---------------------------------------------------------------------------

  /**
   * Checks whether `defender` is guarding against `attacker`.
   * Returns 'parry', 'block', 'reflect' or null.
   */
  private guardCheck(defender: Fighter, attacker: Fighter, ab: AbilityDef, p?: Projectile, aoe = false):
    'parry' | 'block' | 'reflect' | null {
    const a = defender.action;
    if (!a || a.feint) return null;
    const g = defender.abilities[a.ability];
    if (g.kind !== 'guard' || a.phase === 'recovery') return null;
    if (ab.unblockable) return null;
    const srcX = p ? p.x - Math.sign(p.vx) : attacker.x;
    const fromFront = Math.sign(srcX - defender.x) === defender.facing || Math.abs(srcX - defender.x) < 0.3;
    if (!fromFront && !aoe) return null;
    const guardTime = a.phase === 'windup' ? 0 : a.t;
    const duelist = defender.has.has('duelist_band');
    const isParry = guardTime <= g.guard!.parryWindow * (duelist ? 1.4 : 1);
    if (isParry) {
      defender.totals.parries++;
      // A parry ends the guard quickly so the defender can punish.
      a.phase = 'recovery';
      a.t = 0;
      a.recovery = 0.1;
      defender.energy = Math.min(MAX_ENERGY, defender.energy + (duelist ? 22 : 12));
      this.hitstop = Math.max(this.hitstop, 0.1);
      this.emit({ type: 'parry', defender: defender.id, attacker: attacker.id, x: defender.x + defender.facing * 0.6, y: 1.3 });
      if (p) {
        if (g.guard!.reflectProjectiles) return 'reflect';
        return 'parry';
      }
      // Punish the attacker.
      attacker.stagger = Math.max(attacker.stagger, 0.65);
      if (attacker.action && !attacker.abilities[attacker.action.ability].hyperArmor) attacker.action = null;
      this.applyStatus(attacker, defender, { status: 'vulnerable', duration: 1.4 });
      if (g.guard!.counterPower) {
        // Instant riposte.
        const counter: AbilityDef = {
          ...g, id: 'riposte', kind: 'melee', power: g.guard!.counterPower, stagger: 0.4, knockback: 4,
          heavy: true, range: 2.5 * defender.stats.reach,
        };
        defender.action = {
          ability: a.ability, phase: 'recovery', t: 0, total: a.total, windup: 0, active: 0,
          recovery: 0.3, hitsDone: 1, connected: true, feint: false, targetX: attacker.x, startX: defender.x,
          isCounter: true, dir: defender.facing, through: false,
        };
        this.abilityHit(defender, attacker, counter, { isCounter: true });
        this.emit({ type: 'thought', f: defender.id, text: 'Perfect parry — riposte!' });
      }
      return 'parry';
    }
    defender.totals.blocks++;
    return 'block';
  }

  private abilityHit(att: Fighter, tgt: Fighter, ab: AbilityDef, opts: HitOptions, blocked = false): void {
    if (!tgt.alive) return;
    if (tgt.invuln > 0) {
      if (tgt.action && tgt.abilities[tgt.action.ability].slot === 'evade') {
        this.emit({ type: 'thought', f: tgt.id, text: 'Clean dodge.' });
      }
      return;
    }
    if (!opts.fromProjectile && !opts.isCounter && !blocked) {
      const g = this.guardCheck(tgt, att, ab, undefined, !!opts.aoe);
      if (g === 'parry') return;
      if (g === 'block') blocked = true;
    }

    const heavy = opts.heavyOverride ?? !!ab.heavy;
    let raw = att.stats.power * ab.power * (opts.mult ?? 1) * att.stats.damageMult;
    if (opts.fromProjectile) raw = opts.fromProjectile.power * ab.power * (opts.mult ?? 1) * att.stats.damageMult;
    let crit = false;
    if (ab.damageType !== 'true' && this.rng.chance(att.stats.critChance)) {
      crit = true;
      raw *= att.stats.critMult;
      if (att.has.has('executioner_hood') && tgt.hp / tgt.stats.maxHp < 0.3) raw *= 1.5;
    }
    if (blocked) {
      const g = tgt.abilities[tgt.action!.ability];
      raw *= 1 - (g.guard?.reduction ?? 0.5);
    }

    const hpBefore = tgt.hp;
    const dealt = this.applyDamage(att, tgt, raw, ab.damageType);
    const killing = !tgt.alive;
    att.totals.hits++;
    if (crit) att.totals.crits++;
    att.totals.biggestHit = Math.max(att.totals.biggestHit, dealt);

    this.emit({
      type: 'hit', attacker: att.id, target: tgt.id, amount: dealt, crit, dtype: ab.damageType,
      blocked, heavy, ability: ab.id, x: tgt.x, y: tgt.y + 1.2, killing,
    });

    if (heavy && !blocked) this.hitstop = Math.max(this.hitstop, crit ? 0.11 : 0.08);
    else if (crit) this.hitstop = Math.max(this.hitstop, 0.05);
    if (killing) this.hitstop = Math.max(this.hitstop, 0.22);

    // Lifesteal (reduced by poison on the attacker).
    if (att.stats.lifesteal > 0 && dealt > 0) this.heal(att, dealt * att.stats.lifesteal);

    // Thorns.
    if (tgt.stats.thorns > 0 && !opts.fromProjectile && ab.kind !== 'aoe' && att.alive && dealt > 0) {
      const back = this.applyDamage(tgt, att, dealt * tgt.stats.thorns, 'true');
      if (back > 0) {
        this.emit({ type: 'hit', attacker: tgt.id, target: att.id, amount: back, crit: false, dtype: 'true',
          blocked: false, heavy: false, ability: 'thorns', x: att.x, y: att.y + 1.4, killing: !att.alive, dot: true });
      }
    }

    if (!tgt.alive && hpBefore > 0) return;
    if (!tgt.alive) return;

    // Crowd control & displacement.
    if (!blocked) {
      if (ab.stun) this.applyStatus(tgt, att, { status: 'stun', duration: ab.stun });
      const ironskin = !!getStatus(tgt, 'ironskin');
      if (ab.stagger && !ironskin) {
        const ta = tgt.action;
        // Light hits only flinch fighters with low poise; strong bodies hit harder.
        if (ab.stagger * att.stats.force > tgt.stats.poise || heavy || !ta) {
          if (ta && ta.phase !== 'active' && !tgt.abilities[ta.ability].hyperArmor) tgt.action = null;
          if (!tgt.action) tgt.stagger = Math.max(tgt.stagger, ab.stagger * (1 - tgt.stats.tenacity * 0.5));
        }
      }
      if (ab.knockback) {
        const dir = Math.sign(tgt.x - att.x) || att.facing;
        const kb = ab.knockback * att.stats.force * tgt.stats.knockbackTaken * (ironskin ? 0.3 : 1);
        tgt.vx += dir * kb;
        if (heavy && kb > 5) tgt.vy = Math.max(tgt.vy, kb * 0.45);
      }
      if (ab.applies) for (const s of ab.applies) this.applyStatus(tgt, att, s);
    } else {
      tgt.vx += (Math.sign(tgt.x - att.x) || att.facing) * 1.5;
    }

    // On-hit items (only for real ability hits, not DoTs/echoes).
    if (ab.slot !== 'evade' && !blocked) {
      if (att.has.has('frost_core')) this.applyStatus(tgt, att, { status: 'chill', duration: 2.5 });
      if (att.has.has('ember_core')) this.applyStatus(tgt, att, { status: 'burn', duration: 3 });
      if (att.has.has('storm_crown')) {
        att.stormCounter++;
        if (att.stormCounter >= 3) {
          att.stormCounter = 0;
          this.emit({ type: 'lightning', f: att.id, x: tgt.x });
          const zap = this.applyDamage(att, tgt, att.stats.power * 0.9, 'magic');
          this.emit({ type: 'hit', attacker: att.id, target: tgt.id, amount: zap, crit: false, dtype: 'magic',
            blocked: false, heavy: true, ability: 'lightning', x: tgt.x, y: tgt.y + 2, killing: !tgt.alive });
          if (tgt.alive) this.applyStatus(tgt, att, { status: 'stun', duration: 0.35 });
        }
      }
      if (att.has.has('echo_stone') && dealt > 0 && this.rng.chance(0.35)) {
        att.echoQueue.push({ delay: 0.35, amount: dealt * 0.6, dtype: ab.damageType });
      }
    }
  }

  /** Applies mitigation, shields, death and revive. Returns HP damage dealt. */
  applyDamage(att: Fighter, tgt: Fighter, raw: number, dtype: DamageType): number {
    if (!tgt.alive || raw <= 0) return 0;
    let dmg = raw;
    if (dtype === 'physical') dmg *= 100 / (100 + Math.max(0, tgt.stats.armor));
    else if (dtype === 'magic') dmg *= 100 / (100 + Math.max(0, tgt.stats.resist));
    dmg *= tgt.stats.damageTakenMult;
    dmg = Math.round(dmg);
    if (dmg <= 0) return 0;

    tgt.sinceHurt = 0;
    att.sinceHit = 0;
    if (tgt.shield > 0) {
      const absorbed = Math.min(tgt.shield, dmg);
      tgt.shield -= absorbed;
      dmg -= absorbed;
      if (tgt.shield <= 0) this.emit({ type: 'shieldBreak', f: tgt.id });
      att.totals.damageDealt += absorbed;
      if (dmg <= 0) return absorbed;
    }

    tgt.hp -= dmg;
    att.totals.damageDealt += dmg;
    tgt.totals.damageTaken += dmg;
    att.energy = Math.min(MAX_ENERGY, att.energy + dmg * ENERGY_ON_DEAL);
    tgt.energy = Math.min(MAX_ENERGY, tgt.energy + dmg * ENERGY_ON_TAKE);

    if (tgt.hp <= 0) {
      if (tgt.has.has('phoenix_feather') && !tgt.phoenixUsed) {
        tgt.phoenixUsed = true;
        tgt.hp = Math.round(tgt.stats.maxHp * 0.3);
        tgt.invuln = 1.3;
        tgt.action = null;
        tgt.stagger = 0;
        tgt.statuses = tgt.statuses.filter((s) => s.id === 'rage' || s.id === 'haste' || s.id === 'ironskin');
        this.emit({ type: 'revive', f: tgt.id });
        this.emit({ type: 'thought', f: tgt.id, text: 'Rises from the ashes!' });
        const e = this.other(tgt);
        if (Math.abs(e.x - tgt.x) < 3.2 && e.alive) {
          e.vx += Math.sign(e.x - tgt.x) * 9;
          this.applyStatus(e, tgt, { status: 'burn', duration: 4, stacks: 3 });
        }
        this.hitstop = Math.max(this.hitstop, 0.18);
        return dmg;
      }
      tgt.hp = 0;
      tgt.alive = false;
      tgt.action = null;
      tgt.vx += Math.sign(tgt.x - att.x || -tgt.facing) * 7;
      tgt.vy = 7;
      this.emit({ type: 'ko', f: tgt.id });
    }
    return dmg;
  }

  heal(f: Fighter, amount: number): void {
    if (!f.alive) return;
    const h = Math.min(f.stats.maxHp - f.hp, amount * f.stats.healMult);
    if (h <= 0) return;
    f.hp += h;
    f.totals.healed += h;
    if (h >= 4) this.emit({ type: 'heal', f: f.id, amount: Math.round(h) });
  }

  // ---------------------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------------------

  private physics(f: Fighter): void {
    const a = f.action;
    const ab = a ? f.abilities[a.ability] : null;
    const locked = !!a || isDisabled(f) || !f.alive;
    if (!locked) {
      const target = f.move * f.stats.moveSpeed;
      const accel = 28;
      const dv = target - f.vx;
      f.vx += clamp(dv, -accel * DT, accel * DT);
    } else {
      // Friction on knockback while busy.
      const fr = f.y > 0.01 ? 2 : 10;
      f.vx -= f.vx * Math.min(1, fr * DT);
    }

    // Airborne from knockback (leaps are driven by the action).
    const leaping = !!ab?.airborne && (a!.phase === 'windup' || (ab.kind === 'dash' && a!.phase === 'active'));
    if (!leaping) {
      if (f.y > 0 || f.vy > 0) {
        f.vy -= GRAVITY * DT;
        f.y += f.vy * DT;
        if (f.y <= 0) { f.y = 0; f.vy = 0; }
      }
    }

    f.x += f.vx * DT;

    const lim = ARENA_HALF_WIDTH;
    if (f.x < -lim || f.x > lim) {
      const impact = Math.abs(f.vx);
      f.x = clamp(f.x, -lim, lim);
      if (impact > WALL_SPLAT_SPEED && f.alive && !this.over) {
        const e = this.other(f);
        const dmg = this.applyDamage(e, f, f.stats.maxHp * 0.04 + impact * 4, 'true');
        f.stagger = Math.max(f.stagger, 0.45);
        if (f.action && !f.abilities[f.action.ability].hyperArmor) f.action = null;
        this.emit({ type: 'wallSplat', f: f.id, x: f.x });
        this.emit({ type: 'hit', attacker: e.id, target: f.id, amount: dmg, crit: false, dtype: 'true',
          blocked: false, heavy: true, ability: 'wall', x: f.x, y: f.y + 1.2, killing: !f.alive });
        this.hitstop = Math.max(this.hitstop, 0.07);
      }
      f.vx = -f.vx * 0.15;
    }
  }

  private resolveBodies(): void {
    const [a, b] = this.fighters;
    if (!a.alive || !b.alive) return;
    const passing = (f: Fighter) => !!f.action && f.action.through && f.action.phase !== 'recovery';
    if (passing(a) || passing(b)) return;
    if (Math.abs(a.y - b.y) > BODY_HEIGHT * 0.8) return;
    const dx = b.x - a.x;
    const dist = Math.abs(dx);
    if (dist < BODY_GAP) {
      const push = (BODY_GAP - dist) * 0.5;
      const s = dx === 0 ? (a.facing === 1 ? 1 : -1) : Math.sign(dx);
      a.x -= s * push;
      b.x += s * push;
      // Keep inside the walls; whoever is pinned pushes the other.
      const lim = ARENA_HALF_WIDTH;
      if (Math.abs(a.x) > lim) { const o = Math.abs(a.x) - lim; a.x -= Math.sign(a.x) * o; b.x -= Math.sign(a.x) * o; }
      if (Math.abs(b.x) > lim) { const o = Math.abs(b.x) - lim; b.x -= Math.sign(b.x) * o; a.x -= Math.sign(b.x) * o; }
    }
  }

  private updateFacing(f: Fighter): void {
    if (!f.alive) return;
    const a = f.action;
    if (a && (a.phase === 'active' || (a.phase === 'recovery' && a.through))) return;
    if (a && a.phase === 'recovery' && f.abilities[a.ability].slot === 'evade') return;
    const e = this.other(f);
    const dx = e.x - f.x;
    if (Math.abs(dx) > 0.05) f.facing = dx > 0 ? 1 : -1;
  }

  private checkEnd(): void {
    const [a, b] = this.fighters;
    if (!a.alive || !b.alive) {
      this.over = true;
      this.winner = a.alive ? 0 : b.alive ? 1 : -1;
      this.emit({ type: 'end', winner: this.winner, reason: 'ko' });
      return;
    }
    if (this.time >= ROUND_TIME) {
      this.over = true;
      const ra = a.hp / a.stats.maxHp, rb = b.hp / b.stats.maxHp;
      this.winner = Math.abs(ra - rb) < 1e-6 ? -1 : ra > rb ? 0 : 1;
      this.emit({ type: 'end', winner: this.winner, reason: 'time' });
    }
  }
}

// -----------------------------------------------------------------------------
// Forking helpers
// -----------------------------------------------------------------------------

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

/** One level deeper than a shallow copy: arrays of records and plain records are copied. */
function cloneValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => (isPlain(x) ? { ...x } : x));
  if (isPlain(v)) return { ...v };
  return v;
}

/** Fighter fields that never change during a battle and can be shared by forks. */
const SHARED_FIGHTER_KEYS = new Set(['abilities', 'has', 'base', 'gear', 'gearIds', 'look', 'profile']);

function cloneFighter(f: Fighter): Fighter {
  const c = { ...f } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) if (!SHARED_FIGHTER_KEYS.has(k)) c[k] = cloneValue(c[k]);
  return c as unknown as Fighter;
}
