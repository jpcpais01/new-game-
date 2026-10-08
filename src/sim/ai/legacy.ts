import { clamp, lerp } from '../../core/math';
import type { Battle } from '../battle';
import type { Personality } from '../forms';
import { ARENA_HALF_WIDTH, DT, ROUND_TIME } from '../constants';
import { getStatus, isDisabled, reachOf, stacksOf, type Fighter } from '../fighter';
import type { AbilityDef } from '../types';
import type { Plan } from './brain';


interface Threat {
  /** Seconds until the hit lands. */
  tti: number;
  /** Expected damage as a fraction of my max HP. */
  danger: number;
  blockable: boolean;
  /** Hit is a projectile (affects guard facing / mirror). */
  projectile: boolean;
  heavy: boolean;
}

interface PendingOutcome {
  idx: number;
  resolveAt: number;
  hits: number;
  eBlocks: number;
  eParries: number;
  eEvades: number;
  eHp: number;
}

/**
 * Utility AI with three layers:
 *  1. Perception — sees enemy windups only after a reaction delay, reads
 *     projectiles in flight, cooldowns and visible item states.
 *  2. Strategy — picks a plan every ~1.5s from health, kit, items and what it
 *     has learned about the opponent.
 *  3. Tactics — scores every usable ability (expected damage × hit chance −
 *     punish risk), defensive answers to perceived threats, and spacing moves.
 *
 * It also adapts: exponential moving averages of how the enemy reacts to its
 * windups and how often each of its abilities actually connects reshape the
 * scores over the course of a fight.
 */
/** The previous AI (class era, adapted to gear), kept only as a benchmark opponent for `npm run ai`. */
export class LegacyBrain {
  readonly f: Fighter;
  readonly p: Personality;
  plan: Plan = 'pressure';
  private planTimer = 0.4;
  private decideTimer = 0;
  private thoughtCd = 0;
  private bobPhase: number;

  // Perception
  private seenKey = -1;
  private seenAt = 0;
  private lastEnemyActionKey = -1;

  // Memory (adaptive)
  /** How often the enemy defends (guard/evade/blink) during my windups. */
  enemyDefends = 0.3;
  /** How often the enemy walks toward me. */
  enemyAggro = 0.5;
  /** Running hit rate per ability. */
  hitRate: number[];
  private myWindupWatch: { key: number; reacted: boolean } | null = null;
  private pending: PendingOutcome[] = [];
  private sampleT = 0;
  private parriedRecently = 0;
  private feintKey = -1;
  /** Whether the special slot grants an ultimate worth saving energy for. */
  private readonly hasUlt: boolean;

  constructor(f: Fighter, variance: number) {
    this.f = f;
    // Temperament comes from the body (form) and is nudged by the gear.
    const base = f.profile.personality;
    // Each fighter instance has a slightly different temperament.
    const v = (k: number) => clamp(k + (variance - 0.5) * 0.2, 0.05, 0.95);
    this.p = {
      aggression: v(base.aggression),
      caution: v(base.caution),
      cunning: v(base.cunning),
      adaptivity: base.adaptivity,
      reaction: base.reaction,
    };
    this.hitRate = f.abilities.map(() => 0.65);
    this.hasUlt = f.abilities.some((a) => a.slot === 'ultimate');
    this.bobPhase = variance * 10;
  }

  private thought(b: Battle, text: string, force = false): void {
    if (this.thoughtCd > 0 && !force) return;
    this.thoughtCd = 1.6;
    b.emit({ type: 'thought', f: this.f.id, text });
  }

  think(b: Battle): void {
    const f = this.f;
    const e = b.other(f);
    if (this.thoughtCd > 0) this.thoughtCd -= DT;
    if (!f.alive || b.over) { f.move = 0; return; }

    this.perceive(b, e);
    this.learn(b, e);

    this.planTimer -= DT;
    if (this.planTimer <= 0) this.choosePlan(b, e);

    // Mid-action decisions: feints.
    if (f.action) {
      this.considerFeint(b, e);
      return;
    }
    if (isDisabled(f)) { f.move = 0; return; }

    const threat = this.readThreat(b, e);
    const enemyOpen = this.enemyOpenFor(e);
    const urgent = (threat !== null && threat.tti < 0.6) || enemyOpen > 0.25;
    this.decideTimer -= DT;
    if (this.decideTimer > 0 && !urgent) return;
    this.decideTimer = (0.07 + (1 - this.p.aggression) * 0.08) * (0.7 + b.rng.next() * 0.6);

    this.decide(b, e, threat, enemyOpen);
  }

  // ---------------------------------------------------------------------------
  // Perception
  // ---------------------------------------------------------------------------

  private actionKey(f: Fighter): number {
    const a = f.action;
    if (!a) return -1;
    // Unique-enough identity for an action instance.
    return a.ability * 100000 + Math.round((a.startX + 50) * 100) + Math.round(a.windup * 1000) * 7;
  }

  private perceive(b: Battle, e: Fighter): void {
    const key = this.actionKey(e);
    if (key !== this.seenKey) {
      this.seenKey = key;
      // Small human-like jitter on reaction time.
      this.seenAt = b.time + this.p.reaction * (0.85 + b.rng.next() * 0.35);
    }
  }

  /** Has the enemy's current action been "seen" yet? */
  private perceived(b: Battle): boolean {
    return this.seenKey !== -1 && b.time >= this.seenAt;
  }

  private readThreat(b: Battle, e: Fighter): Threat | null {
    const f = this.f;
    let best: Threat | null = null;
    const consider = (t: Threat) => {
      if (!best || t.danger / Math.max(0.05, t.tti) > best.danger / Math.max(0.05, best.tti)) best = t;
    };

    // Projectiles in flight are always visible.
    for (const p of b.projectiles) {
      if (p.owner === f.id) continue;
      const ab = b.fighters[p.owner].abilities[p.ability];
      let tti: number;
      if (p.style === 'meteor') {
        if (Math.abs(p.targetX - f.x) > p.radius + 0.8) continue;
        tti = Math.max(0, (p.y - 0.4) / Math.abs(p.vy));
      } else {
        const dx = f.x - p.x;
        if (Math.sign(dx) !== Math.sign(p.vx)) continue;
        tti = Math.max(0, (Math.abs(dx) - p.radius - 0.45) / Math.abs(p.vx));
        if (tti > 1.4) continue;
      }
      consider({
        tti, danger: this.estDamage(b.fighters[p.owner], ab, f) * (p.reflected ? 1 : 1),
        blockable: !ab.unblockable, projectile: true, heavy: !!ab.heavy,
      });
    }

    const a = e.action;
    if (a && a.phase === 'windup' && !a.feint && this.perceived(b)) {
      const ab = e.abilities[a.ability];
      if (ab.power > 0 || ab.stun) {
        const remaining = a.windup - a.t;
        const dist = Math.abs(e.x - f.x);
        let reach = false;
        let tti = remaining;
        switch (ab.kind) {
          case 'melee': reach = dist <= reachOf(e, ab) + (ab.lunge ?? 0) + 0.4; break;
          case 'aoe': reach = dist <= reachOf(e, ab) + (ab.lunge ?? 0) + 0.3; break;
          case 'dash': reach = dist <= (ab.dash?.distance ?? 0) + 0.2; tti += 0.06; break;
          case 'projectile': reach = true; tti += Math.max(0, dist - 1) / ab.projectile!.speed; break;
          case 'meteor': reach = true; tti += 12 / ab.projectile!.speed; break;
        }
        if (reach) {
          consider({
            tti, danger: this.estDamage(e, ab, f), blockable: !ab.unblockable,
            projectile: ab.kind === 'projectile', heavy: !!ab.heavy,
          });
        }
      }
    }
    return best;
  }

  /**
   * How long (seconds) the enemy is guaranteed unable to respond: stunned,
   * staggered, or stuck in recovery. 0 when they can act.
   */
  private enemyOpenFor(e: Fighter): number {
    let open = 0;
    const stun = getStatus(e, 'stun') ?? getStatus(e, 'frozen');
    if (stun) open = Math.max(open, stun.remaining);
    if (e.stagger > 0) open = Math.max(open, e.stagger);
    const a = e.action;
    if (a) {
      const ab = e.abilities[a.ability];
      if (a.phase === 'recovery') open = Math.max(open, a.recovery - a.t);
      else if (a.phase === 'active' && ab.kind !== 'guard' && ab.kind !== 'dash')
        open = Math.max(open, a.active - a.t + a.recovery);
      if (a.phase === 'windup' && ab.kind === 'buff') open = Math.max(open, a.windup - a.t + a.active);
    }
    if (e.invuln > 0) open = 0;
    return open;
  }

  // ---------------------------------------------------------------------------
  // Learning
  // ---------------------------------------------------------------------------

  private learn(b: Battle, e: Fighter): void {
    const f = this.f;
    const rate = 0.12 + this.p.adaptivity * 0.25;

    // Did the enemy react to my windup?
    const myKey = this.actionKey(f);
    if (f.action && f.action.phase === 'windup' && f.abilities[f.action.ability].power > 0) {
      if (!this.myWindupWatch || this.myWindupWatch.key !== myKey) {
        this.myWindupWatch = { key: myKey, reacted: false };
      }
      const ea = e.action;
      if (ea && this.actionKey(e) !== this.lastEnemyActionKey) {
        const k = e.abilities[ea.ability].kind;
        if (k === 'guard' || k === 'blink' || e.abilities[ea.ability].slot === 'evade') this.myWindupWatch.reacted = true;
      }
    } else if (this.myWindupWatch) {
      this.enemyDefends = lerp(this.enemyDefends, this.myWindupWatch.reacted ? 1 : 0, rate * 0.6);
      this.myWindupWatch = null;
    }
    this.lastEnemyActionKey = this.actionKey(e);

    // Resolve outcomes of my attacks.
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const o = this.pending[i];
      if (b.time < o.resolveAt) continue;
      this.pending.splice(i, 1);
      const landed = f.totals.hits > o.hits && e.totals.parries === o.eParries;
      const parried = e.totals.parries > o.eParries;
      const blocked = e.totals.blocks > o.eBlocks;
      let score = landed ? (blocked ? 0.4 : 1) : 0;
      if (parried) { score = 0; this.parriedRecently += 1; }
      this.hitRate[o.idx] = lerp(this.hitRate[o.idx], score, rate);
    }
    this.parriedRecently = Math.max(0, this.parriedRecently - DT * 0.08);

    this.sampleT += DT;
    if (this.sampleT >= 0.5) {
      this.sampleT = 0;
      const toward = e.move !== 0 && Math.sign(e.move) === Math.sign(f.x - e.x) ? 1 : 0;
      this.enemyAggro = lerp(this.enemyAggro, toward, rate * 0.3);
    }
  }

  private track(b: Battle, idx: number): void {
    const f = this.f;
    const e = b.other(f);
    const ab = f.abilities[idx];
    if (ab.power <= 0) return;
    let window = ab.windup / f.stats.attackSpeed + ab.active + 0.15;
    if (ab.projectile) window += Math.abs(e.x - f.x) / ab.projectile.speed + (ab.kind === 'meteor' ? 1 : 0);
    this.pending.push({
      idx, resolveAt: b.time + window, hits: f.totals.hits,
      eBlocks: e.totals.blocks, eParries: e.totals.parries, eEvades: e.totals.evades, eHp: e.hp,
    });
  }

  // ---------------------------------------------------------------------------
  // Strategy
  // ---------------------------------------------------------------------------

  private choosePlan(b: Battle, e: Fighter): void {
    const f = this.f;
    const me = f.profile;
    const them = e.profile;
    const myHp = f.hp / f.stats.maxHp;
    const enHp = e.hp / e.stats.maxHp;
    const p = this.p;
    const rnd = () => b.rng.next() * 0.12;
    const enemyBuffed = !!getStatus(e, 'rage') || !!getStatus(e, 'ironskin');
    const enemyDots = stacksOf(e, 'burn') + stacksOf(e, 'poison');
    const ultReady = this.hasUlt && f.energy >= 100;
    const losingOnTime = b.time > ROUND_TIME - 15 && myHp <= enHp;

    const scores: Record<Plan, number> = {
      pressure: 0.45 + p.aggression * 0.4 + (them.ranged ? 0.35 : 0) + (enHp < myHp ? 0.1 : 0) - (me.ranged ? 0.45 : 0) + rnd(),
      kite: (me.ranged ? 0.85 : 0) + (me.ranged && enemyDots > 0 ? 0.15 : 0) + p.caution * 0.15 - (them.ranged ? 0.25 : 0) + rnd(),
      bait: p.cunning * 0.45 + (this.enemyAggro > 0.55 ? 0.2 : 0) + this.enemyDefends * 0.35 + (them.ranged ? -0.3 : 0) + rnd(),
      turtle: p.caution * 0.3 + (myHp < 0.35 ? 0.2 : 0) + (enemyBuffed ? 0.3 : 0) - p.aggression * 0.2 + rnd(),
      allin: (ultReady ? 0.3 : 0) + (enHp < 0.3 ? 0.45 : 0) + (isDisabled(e) ? 0.3 : 0)
        + (f.has.has('berserker_mask') && myHp < 0.4 ? 0.4 : 0)
        + (f.has.has('phoenix_feather') && !f.phoenixUsed && myHp < 0.35 ? 0.3 : 0)
        + (losingOnTime ? 0.6 : 0) + rnd(),
      recover: (enemyBuffed && !me.ranged ? 0.25 : 0) + (myHp < 0.2 && !f.phoenixUsed && f.has.has('phoenix_feather') ? -0.3 : 0)
        + (myHp < 0.25 && enHp > 0.5 ? 0.3 : 0) + (f.stats.lifesteal > 0.1 ? -0.2 : 0) + rnd(),
    };
    scores[this.plan] += 0.1; // inertia

    let best: Plan = 'pressure';
    for (const k in scores) if (scores[k as Plan] > scores[best]) best = k as Plan;
    this.planTimer = 1.1 + b.rng.next() * 1.0;

    if (best !== this.plan) {
      this.plan = best;
      b.emit({ type: 'plan', f: f.id, plan: best });
      const why: Record<Plan, string> = {
        pressure: them.ranged ? 'Closing in on the caster.' : 'Takes the initiative.',
        kite: 'Keeps distance and zones.',
        bait: this.enemyDefends > 0.45 ? 'They react to windups — time to bait.' : 'Dances at the edge of range.',
        turtle: enemyBuffed ? 'Waits out the enemy buff.' : 'Plays safe for a moment.',
        allin: losingOnTime ? 'Clock is running out — goes all in!' : enHp < 0.3 ? 'Smells blood — all in!' : 'Commits to the kill.',
        recover: 'Backs off to regroup.',
      };
      this.thought(b, why[best]);
    }
  }

  // ---------------------------------------------------------------------------
  // Tactics
  // ---------------------------------------------------------------------------

  /** Expected damage of `ab` from `src` on `dst`, as a fraction of dst max HP. */
  private estDamage(src: Fighter, ab: AbilityDef, dst: Fighter): number {
    let dmg = src.stats.power * ab.power * (ab.hits ?? 1) * src.stats.damageMult;
    dmg *= 1 + src.stats.critChance * (src.stats.critMult - 1);
    if (ab.damageType === 'physical') dmg *= 100 / (100 + dst.stats.armor);
    else if (ab.damageType === 'magic') dmg *= 100 / (100 + dst.stats.resist);
    dmg *= dst.stats.damageTakenMult;
    let frac = dmg / dst.stats.maxHp;
    if (ab.stun) frac += ab.stun * 0.05;
    if (ab.applies) frac += ab.applies.length * 0.02;
    return frac;
  }

  private nearWallBehind(f: Fighter, margin: number): boolean {
    return Math.abs(f.x - f.facing * margin) > ARENA_HALF_WIDTH - 0.2 && Math.sign(f.x) === -f.facing;
  }

  private decide(b: Battle, e: Fighter, threat: Threat | null, enemyOpen: number): void {
    const f = this.f;
    const dist = Math.abs(e.x - f.x);
    const myHp = f.hp / f.stats.maxHp;
    const enHp = e.hp / e.stats.maxHp;
    const plan = this.plan;
    const p = this.p;
    const cornered = this.nearWallBehind(f, 1.6) && dist < 3;

    let bestIdx = -1;
    let bestVal = 0.012 + (plan === 'turtle' ? 0.02 : 0) + (plan === 'bait' && enemyOpen <= 0 ? 0.015 : 0);
    let bestWhy = '';
    let waitingForTiming = false;

    for (let i = 0; i < f.abilities.length; i++) {
      if (!b.canUse(f, i)) continue;
      const ab = f.abilities[i];
      let val = 0;
      let why = '';

      // ----- Defensive answers -----
      if (ab.kind === 'guard' || ab.slot === 'evade' || ab.kind === 'blink' || ab.id === 'iron_skin' || ab.id === 'barrier') {
        const startup = ab.windup / f.stats.attackSpeed;
        if (threat) {
          if (ab.kind === 'guard') {
            if (!threat.blockable) continue;
            const g = ab.guard!;
            // Timing noise: less cunning fighters misjudge the moment.
            const noise = (b.rng.next() - 0.5) * (1 - p.cunning) * 0.12;
            const t = threat.tti + noise - startup;
            if (t < -0.01) continue;
            if (t > g.parryWindow * 0.8) {
              if (t < ab.active - 0.05 && threat.danger > 0.12 && p.caution > 0.55) {
                val = threat.danger * g.reduction * 0.6;
                why = 'Shields up.';
              } else {
                waitingForTiming = true;
                continue;
              }
            } else {
              val = threat.danger * 1.1 + 0.05 + (g.counterPower ? 0.08 : 0) + (threat.heavy ? 0.05 : 0);
              why = threat.heavy ? 'Reads the heavy — parries!' : 'Times the parry.';
            }
          } else if (ab.id === 'iron_skin') {
            if (threat.tti < startup) continue;
            val = threat.danger * 0.55 + (cornered ? 0.03 : 0);
            why = 'Hardens to tank it.';
          } else if (ab.id === 'barrier') {
            if (threat.tti < startup || f.shield > f.stats.maxHp * 0.05) continue;
            val = Math.min(threat.danger, ab.shieldGain ?? 0) * 0.9 + 0.01;
            why = 'Throws up a barrier.';
          } else {
            const iframes = ab.dash?.iframes ?? ab.iframes ?? 0.2;
            const lo = startup + 0.01;
            const hi = startup + iframes + (threat.projectile ? 0.05 : 0.18);
            if (threat.tti < lo) continue;
            if (threat.tti > hi) { waitingForTiming = true; continue; }
            val = threat.danger * (0.75 + p.caution * 0.4) + 0.02;
            why = ab.kind === 'blink' ? 'Blinks out of it.' : cornered ? 'Cornered — rolls through!' : 'Sidesteps the attack.';
            if (threat.heavy && !threat.blockable) why = 'Can\'t block that — evades.';
          }
          // Prefer the cheaper answer when the damage is small.
          if (threat.danger < 0.03) val *= 0.4;
        } else if (ab.id === 'iron_skin') {
          // Proactive armor when trading up close or when pressured hard.
          if (dist < 2.6 && (plan === 'pressure' || plan === 'allin') && f.sinceHurt < 1) {
            val = 0.03 + p.aggression * 0.02;
            why = 'Tanks through the pressure.';
          }
        } else if (ab.id === 'barrier') {
          // Proactive shield when trading and the old one is gone.
          if (f.shield <= 0 && dist < 3.5 && f.sinceHurt < 1.5) {
            val = 0.03 + p.caution * 0.02;
            why = 'Shields up before the trade.';
          }
        } else if ((ab.slot === 'evade' || ab.kind === 'blink') && cornered && f.profile.ranged) {
          val = 0.04;
          why = 'Escapes the corner.';
        } else if (ab.kind === 'blink' && f.profile.ranged && dist < 1.8 && e.alive) {
          val = 0.035 + p.caution * 0.03;
          why = 'Too close — blinks away.';
        }
        if (val > bestVal) { bestVal = val; bestIdx = i; bestWhy = why; }
        continue;
      }

      // ----- Offense / buffs -----
      if (ab.kind === 'buff') {
        if (ab.id === 'war_cry') {
          const inFight = dist < 4;
          val = (inFight ? 0.04 : 0.02) + (plan === 'allin' ? 0.05 : 0) + (1 - myHp) * 0.06;
          if (threat && threat.tti < ab.windup + 0.1) val *= 0.2;
          why = 'Roars into a frenzy!';
        }
        if (val > bestVal) { bestVal = val; bestIdx = i; bestWhy = why; }
        continue;
      }

      const windup = ab.windup / f.stats.attackSpeed;
      const expDmg = this.estDamage(f, ab, e);
      let pHit = 0;
      const lunge = ab.lunge ?? 0;
      const closing = (e.vx * -Math.sign(e.x - f.x)) * windup; // + when enemy approaches

      switch (ab.kind) {
        case 'melee': {
          const reach = reachOf(f, ab) + lunge;
          const predicted = dist - closing;
          pHit = predicted <= reach ? 0.88 : predicted <= reach + 0.3 ? 0.35 : 0;
          break;
        }
        case 'aoe': {
          const predicted = dist - closing;
          pHit = predicted <= reachOf(f, ab) + lunge * 0.8 ? 0.9 : 0;
          break;
        }
        case 'dash': {
          pHit = dist <= (ab.dash?.distance ?? 0) - 0.6 && dist > 0.6 ? 0.8 : 0;
          // Don't dash through into a wall corner.
          if (Math.abs(e.x + f.facing * 1.5) > ARENA_HALF_WIDTH) pHit *= 0.5;
          break;
        }
        case 'projectile': {
          const travel = Math.max(0, dist - 1) / ab.projectile!.speed;
          pHit = dist <= ab.range ? 0.9 : 0;
          const enemyCanDodge = e.cooldowns[e.abilities.length - 1] <= travel + windup;
          if (enemyCanDodge) pHit *= 1 - clamp((travel + windup - 0.25) * 0.5, 0, 0.45) * (0.5 + this.enemyDefends);
          if (ab.projectile!.ground && e.y > 0.5) pHit *= 0.3;
          break;
        }
        case 'meteor': {
          pHit = 0.55 + (isDisabled(e) ? 0.35 : 0) + (e.action && e.action.phase !== 'recovery' ? 0.15 : 0);
          break;
        }
      }
      if (pHit <= 0) continue;

      // Punish windows: enemy can't respond before we land.
      const reachTime = windup + (ab.projectile && ab.kind === 'projectile' ? Math.max(0, dist - 1) / ab.projectile.speed : 0);
      let punishing = false;
      if (enemyOpen > reachTime + 0.02) {
        pHit = Math.min(0.98, pHit + 0.4);
        punishing = true;
      }

      // Trading into an enemy windup.
      const ea = e.action;
      if (ea && ea.phase === 'windup' && !ea.feint && this.perceived(b)) {
        const eab = e.abilities[ea.ability];
        const theirRemaining = ea.windup - ea.t;
        if (eab.kind === 'guard') {
          if (!ab.unblockable) { pHit *= 0.35; }
          else { pHit = Math.min(1, pHit + 0.2); why = 'Guard break!'; }
        } else if (eab.power > 0) {
          if (windup < theirRemaining - 0.03 && (ab.stagger || ab.stun) && !eab.hyperArmor) {
            val += 0.06; // Stuff their attack.
            why = 'Interrupts the windup!';
          } else if (!ab.hyperArmor && windup > theirRemaining) {
            pHit *= 0.3;
          }
        }
      }
      if (ea && ea.phase !== 'recovery' && e.abilities[ea.ability].kind === 'guard' && this.perceived(b)) {
        if (!ab.unblockable) pHit *= 0.3;
      }
      if (e.invuln > reachTime) pHit = 0;

      // Learned accuracy per ability.
      const learned = clamp(this.hitRate[i] / 0.65, 0.35, 1.25);
      pHit *= lerp(1, learned, p.adaptivity);

      // Enemies that react to windups make slow, telegraphed moves risky.
      const enemyCanReact = windup > 0.24 && !punishing;
      if (enemyCanReact && !ab.unblockable) pHit *= 1 - this.enemyDefends * 0.45 * clamp((windup - 0.2) * 3, 0, 1);

      val += pHit * expDmg;

      // Situational bonuses.
      if (ab.knockback && ab.knockback >= 4 && Math.abs(e.x) > ARENA_HALF_WIDTH - 2.5 && Math.sign(e.x) === Math.sign(e.x - f.x)) {
        val += 0.03 * pHit;
        why = why || 'Drives them into the wall!';
      }
      if (f.has.has('storm_crown') && f.stormCounter === 2) val += 0.02 * pHit;
      if (f.has.has('frost_core') && stacksOf(e, 'chill') === 4) { val += 0.04 * pHit; why = why || 'Going for the freeze.'; }
      if (cornered && ab.knockback && ab.knockback >= 4) val += 0.03;
      if (ab.id === 'frost_nova' && dist < 2.2 && f.profile.ranged) val += 0.05;

      // Item awareness.
      if (e.has.has('thornmail') && ab.kind === 'melee' && ab.damageType !== 'magic') {
        val -= pHit * expDmg * e.stats.thorns * (e.stats.maxHp / f.stats.maxHp) * (myHp < 0.35 ? 1.5 : 0.8);
      }
      if (ab.kind === 'projectile' && e.has.has('mirror_aegis') && e.mirrorCd <= 0 && !ab.projectile!.ground) {
        if (ab.slot === 'basic') { val = 0.03; why = 'Pops the Mirror Ward with a cheap shot.'; }
        else val -= expDmg * 1.2;
      }

      // Ultimates are held for good moments.
      if (ab.slot === 'ultimate') {
        const killShot = expDmg * pHit > enHp && !(e.has.has('phoenix_feather') && !e.phoenixUsed);
        const desperate = myHp < 0.22;
        if (!(punishing || killShot || desperate || pHit > 0.8 || plan === 'allin')) val *= 0.25;
        else why = killShot ? 'Goes for the finisher!' : punishing ? 'Ultimate on the opening!' : why;
        if (e.has.has('phoenix_feather') && !e.phoenixUsed && enHp < 0.2) {
          val *= 0.4;
          why = 'Saving the ultimate for after the Phoenix.';
        }
      } else if (ab.cost > 0 && this.hasUlt) {
        // Keep a reserve for the ultimate when close to it.
        if (f.energy - ab.cost < 100 && f.energy > 80) val *= 0.7;
      }

      // Plan & personality.
      const melee = ab.kind === 'melee' || ab.kind === 'dash' || ab.kind === 'aoe';
      if (plan === 'pressure' && melee) val *= 1.15;
      if (plan === 'kite' && !melee) val *= 1.2;
      if (plan === 'allin') val *= 1.3;
      if (plan === 'turtle' && !punishing) val *= 0.7;
      if (plan === 'bait' && !punishing) val *= 0.75;
      if (plan === 'recover' && !punishing) val *= 0.6;
      val *= 0.8 + p.aggression * 0.4;

      // Risk: whiffing up close gives the enemy a free punish.
      const myRecovery = ab.recovery / f.stats.attackSpeed + ab.active;
      if (dist < 3 && !punishing) {
        const risk = (1 - pHit) * 0.06 * (myRecovery / 0.4) * (0.5 + p.caution);
        val -= risk;
      }
      if (this.parriedRecently > 1 && ab.heavy && !ab.unblockable && !punishing) val *= 0.6;

      if (punishing && !why) why = enemyOpen > 0.5 ? 'Punishes the opening!' : 'Whiff punish!';

      // Tiny noise so mirror matches diverge naturally.
      val *= 0.95 + b.rng.next() * 0.1;
      if (val > bestVal) { bestVal = val; bestIdx = i; bestWhy = why; }
    }

    if (bestIdx >= 0) {
      if (b.startAction(f, bestIdx)) {
        this.track(b, bestIdx);
        if (bestWhy) this.thought(b, bestWhy, bestWhy.includes('!') && b.rng.next() < 0.3);
        return;
      }
    }

    this.moveDecision(e, threat, enemyOpen, waitingForTiming);
  }

  private moveDecision(e: Fighter, threat: Threat | null, enemyOpen: number, waiting: boolean): void {
    const f = this.f;
    const me = f.profile;
    const dx = e.x - f.x;
    const dist = Math.abs(dx);
    const toward = Math.sign(dx) || f.facing;
    const enemyReach = this.enemyReach(e);

    let desired: number;
    switch (this.plan) {
      case 'pressure':
      case 'allin':
        desired = me.ranged ? 3.5 : me.preferredRange * 0.9;
        break;
      case 'kite':
        desired = me.preferredRange;
        break;
      case 'bait': {
        // Hover just outside their reach, swaying in and out.
        this.bobPhase += DT * 4;
        desired = Math.max(me.preferredRange, enemyReach + 0.45) + Math.sin(this.bobPhase) * 0.45;
        break;
      }
      case 'turtle':
        desired = me.ranged ? me.preferredRange + 1 : Math.max(enemyReach + 0.9, 3.2);
        break;
      case 'recover':
        desired = 7.5;
        break;
    }
    // Always step in to punish.
    if (enemyOpen > 0.3 && !me.ranged) desired = me.preferredRange * 0.8;
    // Back off from an incoming melee hit while waiting for timing.
    if (threat && !threat.projectile && waiting && this.p.caution > 0.5 && threat.tti < 0.3) desired = Math.max(desired, dist + 1);

    const err = dist - desired;
    let move = 0;
    if (err > 0.25) move = toward;
    else if (err < -0.25) move = -toward;

    // Don't back into the wall: hold ground instead.
    if (move === -toward && Math.abs(f.x - toward * 0.8) > ARENA_HALF_WIDTH - 0.4) move = 0;
    f.move = move;
  }

  private enemyReach(e: Fighter): number {
    let r = 0;
    for (let i = 0; i < e.abilities.length; i++) {
      const ab = e.abilities[i];
      if (ab.kind === 'melee' && e.cooldowns[i] <= 0.4) r = Math.max(r, reachOf(e, ab) + (ab.lunge ?? 0));
    }
    return r || 2;
  }

  private considerFeint(b: Battle, e: Fighter): void {
    const f = this.f;
    const a = f.action!;
    if (a.phase !== 'windup' || a.feint) return;
    const ab = f.abilities[a.ability];
    if (!ab.heavy || ab.unblockable || ab.slot === 'ultimate') return;
    const ea = e.action;
    if (!ea || !this.perceived(b)) return;
    const k = e.abilities[ea.ability];
    const defending = k.kind === 'guard' || k.slot === 'evade' || k.kind === 'blink';
    if (!defending) return;
    // Decide once per action instance.
    const key = this.actionKey(f) * 31 + this.actionKey(e);
    if (this.feintKey === key) return;
    this.feintKey = key;
    if (b.rng.next() < this.p.cunning * 0.85) {
      if (b.feint(f)) this.thought(b, 'Feint! Baited the defense.', true);
    }
  }
}
