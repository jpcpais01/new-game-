import { clamp, lerp } from '../../core/math';
import type { Battle } from '../battle';
import { ARENA_HALF_WIDTH, DT, ROUND_TIME } from '../constants';
import { getStatus, isDisabled, stacksOf, type Fighter } from '../fighter';
import {
  analyzeKit, analyzeMatchup, ccValue, dpsAt, estDamage, fastestAnswer, liveReach, readyDefenses, STATUS_FX,
  type AbilityInfo, type Kit, type Matchup,
} from './kit';
import { OpponentModel } from './opponent';
import { derivePersonality, type Personality } from './personality';

/**
 * Strategic layer. A plan is a high-level intent that biases the tactical
 * utility scores and sets the spacing the fighter tries to keep.
 */
export type Plan = 'pressure' | 'kite' | 'bait' | 'turtle' | 'allin' | 'recover';

export const PLAN_LABELS: Record<Plan, string> = {
  pressure: 'Pressuring',
  kite: 'Kiting',
  bait: 'Baiting',
  turtle: 'Defending',
  allin: 'All-in',
  recover: 'Regrouping',
};

/** What the battle needs from a fighter's controller. */
export interface FighterBrain {
  plan: Plan;
  think(b: Battle): void;
}

interface Threat {
  /** Seconds until the hit lands. */
  tti: number;
  /** Expected damage as a fraction of my max HP. */
  danger: number;
  blockable: boolean;
  projectile: boolean;
  heavy: boolean;
  /** Comes from the enemy's body (can be walked out of). */
  melee: boolean;
  /** Reach of the attack, for spacing dodges. */
  reach: number;
  /** Attacker's recovery after it lands or whiffs (punish window). */
  recovery: number;
}

interface PendingOutcome {
  idx: number;
  resolveAt: number;
  hits: number;
  eBlocks: number;
  eParries: number;
}

type Choice = { kind: 'ability'; idx: number } | { kind: 'move'; dir: number };

interface Option {
  choice: Choice;
  /** Instinctive (utility) value, used as a tie-breaker and to keep personality. */
  prior: number;
  why: string;
  score?: number;
}

interface Snapshot {
  myHp: number;
  enHp: number;
  myEnergy: number;
  enEnergy: number;
}

/** Seconds imagined ahead for each option. */
const HORIZON_TICKS = 54;
/** Minimum seconds between look-aheads (sooner when the enemy starts something new). */
const LOOK_INTERVAL = 0.1;
const MAX_ABILITY_OPTIONS = 4;
const PRIOR_WEIGHT = 0.25;
/** Value of each second the enemy can't act (fraction of HP). */
const LOCK_VALUE = 0.05;

/** HP plus shield plus a pending revive, minus damage-over-time still to come. */
function effectiveHp(f: Fighter): number {
  if (!f.alive) return -0.2;
  let hp = f.hp + f.shield * 0.8;
  for (const s of f.statuses) {
    if (s.id === 'burn' || s.id === 'poison') {
      const per = s.id === 'burn' ? 0.2 : 0.09;
      hp -= s.sourcePower * per * s.stacks * Math.max(0, s.remaining) * 0.7;
    }
  }
  let v = hp / f.stats.maxHp;
  if (f.has.has('phoenix_feather') && !f.phoenixUsed) v += 0.3;
  return v;
}

function snapshot(f: Fighter, e: Fighter): Snapshot {
  return { myHp: effectiveHp(f), enHp: effectiveHp(e), myEnergy: f.energy, enEnergy: e.energy };
}

/** Seconds before the fighter can act freely again. */
function lockedFor(f: Fighter): number {
  if (!f.alive) return 0;
  let t = Math.max(0, f.stagger);
  for (const s of f.statuses) if (s.id === 'stun' || s.id === 'frozen') t = Math.max(t, s.remaining);
  const a = f.action;
  if (a) {
    if (a.phase === 'recovery') t = Math.max(t, a.recovery - a.t);
    else if (a.phase === 'active') t = Math.max(t, a.active - a.t + a.recovery);
  }
  if (getStatus(f, 'vulnerable')) t += 0.15;
  return Math.min(t, 1.5);
}

/** Cost of defensive cooldowns currently recharging. */
function defenseSpent(f: Fighter, k: Kit): number {
  let v = 0;
  for (const d of k.defenses) v += Math.min(f.cooldowns[d.idx], 4) * 0.004;
  return v;
}

interface Ctx {
  e: Fighter;
  dist: number;
  myHp: number;
  enHp: number;
  threat: Threat | null;
  open: number;
  cornered: boolean;
  enemyReach: number;
  /** Damage per second I can follow a stun with (fraction of enemy HP). */
  burst: number;
}

/**
 * Utility AI with four layers, all driven by the fighter's gear rather than a
 * class:
 *  1. Kit & matchup — what every ability does, and at which distance each
 *     side wins (so a spear keeps a sword at the tip, a staff kites a hammer).
 *  2. Perception — sees enemy windups only after a human-like reaction delay,
 *     reads projectiles in flight, cooldowns, energy and active buffs.
 *  3. Strategy — picks a plan every ~1.5s from health, matchup, the clock and
 *     what it has learned about the opponent.
 *  4. Tactics — scores every usable ability (expected damage × hit chance −
 *     punish risk, combo setups, buff windows) against defensive answers
 *     (parry, evade, blink, armor, stepping out of reach) and spacing.
 *
 * An opponent model (how they react to windups and projectiles, whether they
 * whiff or punish) and a per-ability hit rate reshape the scores as the fight
 * goes on, so the same two builds play differently minute to minute.
 */
export class Brain implements FighterBrain {
  readonly f: Fighter;
  readonly p: Personality;
  readonly kit: Kit;
  plan: Plan = 'pressure';

  private ek!: Kit;
  private opp!: OpponentModel;
  private m!: Matchup;
  private ready = false;

  private planTimer = 0.4;
  private decideTimer = 0;
  private thoughtCd = 0;
  private bobPhase: number;

  // Perception
  private seenKey = -1;
  private seenAt = 0;

  // Learning
  hitRate: number[];
  private pending: PendingOutcome[] = [];
  private parriedRecently = 0;
  private feintKey = -1;
  /** Time until which the enemy is known to be committed to a defense I baited. */
  private baitedUntil = -1;

  // Look-ahead
  /** Imagined copy used inside another brain's look-ahead (never plans itself). */
  private imagined = false;
  /**
   * Imagined enemy: how readily it defends, from what I've seen of the real
   * one (leaning careful: better to be pleasantly surprised). 1 = normal.
   */
  private defendBias = 1;
  /** First move forced on an imagined brain, then it plays its normal policy. */
  private script: Choice | null = null;
  private scriptUntil = 0;
  private nextLookAt = 0;
  private lookedAtKey = -2;
  private lookedAtShots = -1;
  /** Movement chosen by the last look-ahead, kept until the next one. */
  private heldMove = 0;

  constructor(f: Fighter, variance: number) {
    this.f = f;
    this.kit = analyzeKit(f);
    const temper2 = (variance * 7.31 + 0.37) % 1;
    this.p = derivePersonality(f, this.kit, variance, temper2);
    this.hitRate = f.abilities.map(() => 0.65);
    this.bobPhase = variance * 10;
  }

  private init(b: Battle, e: Fighter): void {
    this.ek = analyzeKit(e);
    this.opp = new OpponentModel(e, this.p.adaptivity);
    this.m = analyzeMatchup(this.f, this.kit, e, this.ek, this.p.caution);
    this.ready = true;
    void b;
  }

  /**
   * A copy of `src` that drives fighter `f` inside a forked battle. It shares
   * the (read-only) kit analysis, keeps the same plan, temperament and what it
   * has learned, and skips learning and planning so look-ahead stays cheap.
   */
  private static imagine(src: Brain, f: Fighter, script: Choice | null, now: number): Brain {
    const c = Object.create(Brain.prototype) as Brain;
    Object.assign(c, src);
    const w = c as unknown as { f: Fighter };
    w.f = f;
    c.imagined = true;
    c.script = script;
    c.scriptUntil = now + (script?.kind === 'move' ? 0.12 : 0);
    c.pending = [];
    c.thoughtCd = 99;
    c.planTimer = 99;
    c.decideTimer = 0;
    return c;
  }

  /** How I imagine the enemy plays: my own policy, from their side of the fight. */
  private enemyModel(e: Fighter, b: Battle): Brain {
    if (!this.mirror) {
      const m = new Brain(e, 0.5);
      m.init(b, this.f);
      this.mirror = m;
    }
    const m = this.mirror;
    m.plan = (b.brains[e.id] as Partial<Brain>).plan ?? 'pressure';
    // Shape the imagined enemy after the real one's habits.
    m.defendBias = clamp(0.9 + this.opp.defends * 1.6, 0.8, 2);
    const mp = m.p as Personality;
    mp.aggression = clamp(0.3 + this.opp.aggro * 0.6 + this.opp.trade * 0.3, 0.1, 0.95);
    return this.mirror;
  }
  private mirror: Brain | null = null;

  private thought(b: Battle, text: string, force = false): void {
    if (this.thoughtCd > 0 && !force) return;
    this.thoughtCd = 1.6;
    b.emit({ type: 'thought', f: this.f.id, text });
  }

  think(b: Battle): void {
    const f = this.f;
    const e = b.other(f);
    if (!this.ready) this.init(b, e);
    if (this.thoughtCd > 0) this.thoughtCd -= DT;
    if (!f.alive || b.over) { f.move = 0; return; }

    this.perceive(b, e);
    if (!this.imagined) {
      this.opp.observe(b, f, e, this.ek, actionKey(f), actionKey(e));
      this.learn(b, e);
      this.planTimer -= DT;
      if (this.planTimer <= 0) this.choosePlan(b, e);
    } else if (this.script) {
      // Imagined: play the forced first move, then the normal policy.
      const s = this.script;
      if (s.kind === 'ability') {
        this.script = null;
        if (b.startAction(f, s.idx)) return;
      } else if (b.time < this.scriptUntil) {
        f.move = s.dir;
        if (!f.action) return;
      } else this.script = null;
    }

    if (f.action) {
      this.midAction(b, e);
      return;
    }
    if (isDisabled(f)) { f.move = 0; return; }

    const threat = this.readThreat(b, e);
    const open = this.enemyOpenFor(e);
    const urgent = (threat !== null && threat.tti < 0.6) || open > 0.2;
    this.decideTimer -= DT;
    if (this.decideTimer > 0 && !urgent) return;
    this.decideTimer = (0.07 + (1 - this.p.aggression) * 0.08) * (0.7 + b.rng.next() * 0.6);

    const dist = Math.abs(e.x - f.x);
    this.decide(b, {
      e, dist, threat, open,
      myHp: f.hp / f.stats.maxHp,
      enHp: e.hp / e.stats.maxHp,
      cornered: this.backToWall(f, 1.6) && dist < 3.2,
      enemyReach: liveReach(e, this.ek, 0.4),
      burst: Math.max(this.m.myClose, this.m.myFar) * 1.4,
    });
  }

  // ---------------------------------------------------------------------------
  // Perception
  // ---------------------------------------------------------------------------

  private perceive(b: Battle, e: Fighter): void {
    const key = actionKey(e);
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
        tti, danger: estDamage(b.fighters[p.owner], ab, f), blockable: !ab.unblockable,
        projectile: true, heavy: !!ab.heavy, melee: false, reach: 0, recovery: 0,
      });
    }

    const a = e.action;
    if (!a || a.feint || !this.perceived(b)) return best;
    const ab = e.abilities[a.ability];
    if (ab.power <= 0 && !ab.stun) return best;
    const info = this.ek.info[a.ability];
    const dist = Math.abs(e.x - f.x);
    const recovery = a.recovery;

    if (a.phase === 'windup') {
      const remaining = a.windup - a.t;
      let reach = false;
      let tti = remaining;
      switch (ab.kind) {
        case 'melee': reach = dist <= info.maxReach + 0.4; break;
        case 'aoe': reach = dist <= info.maxReach + 0.3; break;
        case 'dash': reach = dist <= (ab.dash?.distance ?? 0) + 0.2; tti += 0.06; break;
        case 'projectile': reach = true; tti += Math.max(0, dist - 1) / ab.projectile!.speed; break;
        case 'meteor': reach = true; tti += 12 / ab.projectile!.speed; break;
      }
      if (reach) {
        consider({
          tti, danger: estDamage(e, ab, f), blockable: !ab.unblockable,
          projectile: ab.kind === 'projectile' || ab.kind === 'meteor', heavy: !!ab.heavy,
          melee: ab.kind === 'melee' || ab.kind === 'aoe', reach: info.maxReach, recovery,
        });
      }
    } else if (a.phase === 'active' && (ab.hits ?? 1) > 1 && ab.kind === 'melee' && dist <= ab.range + 0.4) {
      // Mid-flurry: the remaining hits are still a threat (a guard parries the next one).
      const hits = ab.hits!;
      const left = hits - a.hitsDone;
      if (left > 0) {
        const nextAt = (a.hitsDone / hits) * a.active - a.t;
        consider({
          tti: Math.max(0.01, nextAt), danger: estDamage(e, ab, f) * (left / hits), blockable: !ab.unblockable,
          projectile: false, heavy: !!ab.heavy, melee: true, reach: ab.range, recovery,
        });
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
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const o = this.pending[i];
      if (b.time < o.resolveAt) continue;
      this.pending.splice(i, 1);
      const parried = e.totals.parries > o.eParries;
      const landed = f.totals.hits > o.hits && !parried;
      const blocked = e.totals.blocks > o.eBlocks;
      let score = landed ? (blocked ? 0.4 : 1) : 0;
      if (parried) { score = 0; this.parriedRecently += 1; }
      this.hitRate[o.idx] = lerp(this.hitRate[o.idx], score, rate);
    }
    this.parriedRecently = Math.max(0, this.parriedRecently - DT * 0.08);
  }

  private track(b: Battle, idx: number): void {
    const f = this.f;
    const e = b.other(f);
    const ab = f.abilities[idx];
    if (ab.power <= 0) return;
    let window = ab.windup / f.stats.attackSpeed + ab.active + 0.15;
    if (ab.projectile) window += Math.abs(e.x - f.x) / ab.projectile.speed + (ab.kind === 'meteor' ? 1 : 0);
    this.pending.push({ idx, resolveAt: b.time + window, hits: f.totals.hits, eBlocks: e.totals.blocks, eParries: e.totals.parries });
  }

  // ---------------------------------------------------------------------------
  // Strategy
  // ---------------------------------------------------------------------------

  private choosePlan(b: Battle, e: Fighter): void {
    const f = this.f;
    const p = this.p;
    const o = this.opp;
    // Stats change with buffs, chill and items: refresh who wins where.
    this.m = analyzeMatchup(f, this.kit, e, this.ek, p.caution);
    const m = this.m;
    const myHp = f.hp / f.stats.maxHp;
    const enHp = e.hp / e.stats.maxHp;
    const rnd = () => b.rng.next() * 0.12;
    const enemyBuffed = !!getStatus(e, 'rage') || !!getStatus(e, 'ironskin') || !!getStatus(e, 'haste');
    const enemyDots = stacksOf(e, 'burn') + stacksOf(e, 'poison');
    const myUlt = this.kit.info.some((a) => a.ultimate && f.energy >= a.ab.cost);
    const theirUlt = this.ek.info.some((a) => a.ultimate && e.energy >= a.ab.cost);
    const late = b.time > ROUND_TIME - 18;
    const losingOnTime = late && myHp <= enHp;
    const winningOnTime = late && myHp > enHp + 0.12;
    const theirDef = readyDefenses(e, this.ek, 0.3);
    const enemyZoner = this.ek.ranged && m.theirFar > m.theirClose * 0.5;
    const zoneBetter = m.zone > 0 ? clamp((m.zoneEdge - m.engageEdge) * 12, -0.4, 0.6) : -1;
    const closeEdge = clamp(m.engageEdge * 10, -0.3, 0.3);
    const enemyNearWall = Math.abs(e.x) > ARENA_HALF_WIDTH - 2.5;

    const scores: Record<Plan, number> = {
      pressure: 0.45 + p.aggression * 0.4 + closeEdge + (enemyZoner ? 0.35 : 0) + (enHp < myHp ? 0.1 : 0)
        - Math.max(0, zoneBetter) * 0.8 + (enemyNearWall ? 0.08 : 0) + rnd(),
      kite: m.zone > 0 ? 0.3 + zoneBetter + p.caution * 0.15 + (enemyDots > 0 ? 0.12 : 0) + (winningOnTime ? 0.2 : 0) + rnd() : -1,
      bait: this.ek.ranged && enemyZoner ? -1
        : p.cunning * 0.45 + (o.aggro > 0.55 ? 0.2 : 0) + o.defends * 0.3 + o.whiff * 0.4 + o.trade * 0.15 + rnd(),
      turtle: p.caution * 0.3 + (myHp < 0.35 ? 0.2 : 0) + (enemyBuffed ? 0.3 : 0) - p.aggression * 0.2
        + (theirUlt && !myUlt ? 0.12 + p.caution * 0.15 : 0) + (winningOnTime ? 0.35 : 0)
        + rnd(),
      allin: (myUlt ? 0.3 : 0) + (enHp < 0.3 ? 0.45 : 0) + (isDisabled(e) ? 0.3 : 0)
        + (!theirDef.any && Math.abs(e.x - f.x) < 5 ? 0.2 : 0)
        + (f.has.has('berserker_mask') && myHp < 0.4 ? 0.4 : 0)
        + (f.has.has('phoenix_feather') && !f.phoenixUsed && myHp < 0.35 ? 0.3 : 0)
        + (losingOnTime ? 0.6 : 0) + rnd(),
      recover: (enemyBuffed && !this.kit.ranged ? 0.25 : 0) + (myHp < 0.25 && enHp > 0.5 ? 0.3 : 0)
        + (f.has.has('phoenix_feather') && !f.phoenixUsed && myHp < 0.2 ? -0.3 : 0)
        + (f.stats.lifesteal > 0.1 ? -0.2 : 0) + (losingOnTime ? -0.5 : 0) + rnd(),
    };
    scores[this.plan] += 0.1; // inertia

    let best: Plan = 'pressure';
    for (const k in scores) if (scores[k as Plan] > scores[best]) best = k as Plan;
    this.planTimer = 1.1 + b.rng.next() * 1.0;

    if (best !== this.plan) {
      this.plan = best;
      b.emit({ type: 'plan', f: f.id, plan: best });
      const why: Record<Plan, string> = {
        pressure: enemyZoner ? 'Closing in on the caster.' : m.engageEdge > 0.002 ? 'Wins up close — takes the initiative.' : 'Takes the initiative.',
        kite: winningOnTime ? 'Ahead on the clock — keeps away.' : 'Keeps distance and zones.',
        bait: o.whiff > 0.35 ? 'They swing at air — baits the whiff.' : o.defends > 0.45 ? 'They react to windups — time to bait.' : 'Dances at the edge of range.',
        turtle: enemyBuffed ? 'Waits out the enemy buff.' : theirUlt ? 'Their ultimate is up — stays careful.' : winningOnTime ? 'Protects the lead.' : 'Plays safe for a moment.',
        allin: losingOnTime ? 'Clock is running out — goes all in!' : enHp < 0.3 ? 'Smells blood — all in!' : !theirDef.any ? 'Their defenses are down — all in!' : 'Commits to the kill.',
        recover: 'Backs off to regroup.',
      };
      this.thought(b, why[best]);
    }
  }

  // ---------------------------------------------------------------------------
  // Tactics
  // ---------------------------------------------------------------------------

  private backToWall(f: Fighter, margin: number): boolean {
    return Math.abs(f.x - f.facing * margin) > ARENA_HALF_WIDTH - 0.2 && Math.sign(f.x) === -f.facing;
  }

  private decide(b: Battle, c: Ctx): void {
    const f = this.f;
    const plan = this.plan;

    let bestIdx = -1;
    let bestVal = 0.012 + (plan === 'turtle' ? 0.02 : 0) + (plan === 'bait' && c.open <= 0 ? 0.015 : 0);
    let bestWhy = '';
    let waiting = false;
    const options: Option[] = [];

    for (const info of this.kit.info) {
      if (!b.canUse(f, info.idx)) continue;
      let r: { val: number; why: string; wait?: boolean } | null;
      if (info.defense) r = this.scoreDefense(b, info, c);
      else if (info.buff) r = this.scoreBuff(info, c);
      else if (info.offensive) r = this.scoreAttack(b, info, c);
      else r = null;
      if (!r) continue;
      if (r.wait) waiting = true;
      if (r.val > 0) options.push({ choice: { kind: 'ability', idx: info.idx }, prior: r.val, why: r.why });
      if (r.val > bestVal) { bestVal = r.val; bestIdx = info.idx; bestWhy = r.why; }
    }

    // Look ahead: imagine the next second for the most promising options and
    // keep the one that actually plays out best.
    if (!this.imagined && this.shouldLookAhead(b, c)) {
      const pick = this.lookAhead(b, c, options, bestIdx, waiting);
      if (pick) {
        if (pick.choice.kind === 'ability') {
          if (b.startAction(f, pick.choice.idx)) {
            this.heldMove = 0;
            this.track(b, pick.choice.idx);
            if (pick.why) this.thought(b, pick.why, pick.why.includes('!') && b.rng.next() < 0.3);
            return;
          }
        } else {
          this.heldMove = pick.choice.dir;
          f.move = pick.choice.dir;
          if (pick.why) this.thought(b, pick.why);
          return;
        }
      }
    } else if (!this.imagined && b.time < this.nextLookAt) {
      // Between look-aheads, keep to the chosen footwork; only a timed defense
      // against a seen threat or a punish on an opening can't wait.
      const info = bestIdx >= 0 ? this.kit.info[bestIdx] : null;
      const defend = !!info?.defense && c.threat !== null;
      const punish = !!info?.offensive && c.open > 0.12;
      if (!defend && !punish && this.spacingDodge(c) <= bestVal) { f.move = this.heldMove; return; }
    }

    // Stepping out of reach costs no cooldown and sets up a whiff punish.
    const step = this.spacingDodge(c);
    if (step > bestVal) {
      this.thought(b, c.threat!.recovery > 0.35 ? 'Steps out of reach to punish the whiff.' : 'Steps back out of reach.');
      f.move = -(Math.sign(c.e.x - f.x) || f.facing);
      return;
    }

    if (bestIdx >= 0 && b.startAction(f, bestIdx)) {
      this.track(b, bestIdx);
      if (bestWhy) this.thought(b, bestWhy, bestWhy.includes('!') && b.rng.next() < 0.3);
      return;
    }
    this.moveDecision(b, c, waiting);
  }

  // ---------------------------------------------------------------------------
  // Look-ahead
  // ---------------------------------------------------------------------------

  /** Look ahead when the fight is close enough for the next second to matter. */
  private shouldLookAhead(b: Battle, c: Ctx): boolean {
    const e = c.e;
    const near = c.dist < Math.max(this.kit.meleeReach, this.ek.meleeReach, 2) + 2.2;
    const shots = b.projectiles.length;
    const key = actionKey(e);
    if (!near && shots === 0 && !(e.action && this.perceived(b))) return false;
    const changed = (key !== this.lookedAtKey && this.perceived(b)) || shots !== this.lookedAtShots;
    if (!changed && b.time < this.nextLookAt) return false;
    this.lookedAtKey = this.perceived(b) ? key : this.lookedAtKey;
    this.lookedAtShots = shots;
    this.nextLookAt = b.time + LOOK_INTERVAL;
    return true;
  }

  private lookAhead(b: Battle, c: Ctx, options: Option[], heuristicIdx: number, waiting: boolean): Option | null {
    const f = this.f;
    const e = c.e;
    const toward = Math.sign(e.x - f.x) || f.facing;
    options.sort((x, y) => y.prior - x.prior);
    const cands: Option[] = options.slice(0, MAX_ABILITY_OPTIONS);
    for (const o of options) {
      if (cands.includes(o)) continue;
      const info = this.kit.info[(o.choice as { idx: number }).idx];
      // Defensive answers always get a look when something is coming, and a
      // ready ultimate always gets considered (its instinctive value is damped).
      if ((c.threat && info.defense) || info.ultimate) cands.push(o);
    }
    cands.push(
      { choice: { kind: 'move', dir: toward }, prior: 0, why: '' },
      { choice: { kind: 'move', dir: -toward }, prior: 0, why: '' },
      { choice: { kind: 'move', dir: 0 }, prior: waiting ? 0.01 : 0, why: '' },
    );

    // Common random numbers: every option is imagined against the same luck.
    const seed = (b.seed * 31 + b.tick * 7919 + f.id * 104729) >>> 0;
    const enemy = this.enemyModel(e, b);
    const start = snapshot(f, e);
    let best: Option | null = null;
    let bestScore = -Infinity;
    for (const o of cands) {
      // Big commitments are imagined twice: one lucky future shouldn't sell them.
      const risky = o.choice.kind === 'ability' && (this.kit.info[o.choice.idx].ultimate || this.kit.info[o.choice.idx].ab.windup >= 0.45);
      let total = 0;
      const samples = risky ? 2 : 1;
      for (let k = 0; k < samples; k++) {
        const sim = b.fork(k === 0 ? seed : (seed ^ 0x9e3779b9) >>> 0, (copy) => {
          const me = Brain.imagine(this, copy.fighters[f.id], o.choice, copy.time);
          const them = Brain.imagine(enemy, copy.fighters[e.id], null, copy.time);
          // The enemy's current action was already seen by the real me.
          me.seenKey = this.seenKey; me.seenAt = this.seenAt;
          return f.id === 0 ? [me, them] : [them, me];
        });
        for (let t = 0, n = this.horizonFor(o.choice, c.dist); t < n && !sim.over; t++) sim.step();
        total += this.evaluate(sim, start);
      }
      const score = total / samples + o.prior * PRIOR_WEIGHT;
      o.score = score;
      if (score > bestScore) { bestScore = score; best = o; }
    }
    if (!best) return null;
    // Explain choices the instinctive answer would not have made.
    if (best.choice.kind === 'move') {
      const ab = heuristicIdx >= 0 ? this.kit.info[heuristicIdx] : null;
      if (ab && ab.offensive && best.choice.dir === -toward) best.why = `Holds back — ${ab.ab.name} would lose that trade.`;
      else if (best.choice.dir === -toward && c.threat?.melee) best.why = 'Steps out of reach.';
    } else if (best.choice.idx !== heuristicIdx && !best.why) {
      const n = this.kit.info[best.choice.idx].ab.name;
      best.why = this.kit.info[best.choice.idx].defense ? `Sees it coming — ${n}.` : `Spots an opening for ${n}.`;
    }
    return best;
  }

  /** Ticks to imagine: long enough to see slow attacks (meteors, slow orbs) land. */
  private horizonFor(choice: Choice, dist: number): number {
    if (choice.kind !== 'ability') return HORIZON_TICKS;
    const ab = this.kit.info[choice.idx].ab;
    let t = (ab.windup + ab.active) / this.f.stats.attackSpeed + 0.35;
    if (ab.kind === 'meteor') t += 12 / ab.projectile!.speed;
    else if (ab.projectile) t += dist / ab.projectile.speed;
    return Math.max(HORIZON_TICKS, Math.min(150, Math.ceil(t / DT)));
  }

  /** How much better the imagined future is for me than the present. */
  private evaluate(sim: Battle, start: Snapshot): number {
    const f = sim.fighters[this.f.id];
    const e = sim.fighters[this.f.id === 0 ? 1 : 0];
    const p = this.p;
    const myLoss = start.myHp - effectiveHp(f);
    const enLoss = start.enHp - effectiveHp(e);
    let v = enLoss * (0.9 + p.aggression * 0.2) - myLoss * (0.8 + p.caution * 0.4);
    if (!e.alive && !(e.has.has('phoenix_feather') && !e.phoenixUsed)) v += 0.5;
    if (!f.alive) v -= 0.5;
    // Who is free to act next.
    v += (lockedFor(e) - lockedFor(f)) * LOCK_VALUE;
    // Resources: energy and defensive cooldowns spent.
    // Energy is worth more to whoever has an ultimate to spend it on.
    const myUlt = this.kit.info.some((a) => a.ultimate), theirUlt = this.ek.info.some((a) => a.ultimate);
    v += (f.energy - start.myEnergy) * (myUlt ? 0.0011 : 0.0003) - (e.energy - start.enEnergy) * (theirUlt ? 0.0011 : 0.0003);
    v -= defenseSpent(f, this.kit) - defenseSpent(e, this.ek);
    // Position: nobody wants their back to the wall.
    const dist = Math.abs(e.x - f.x);
    if (dist < 3.5) {
      if (Math.abs(f.x) > ARENA_HALF_WIDTH - 1.2 && Math.sign(f.x) !== Math.sign(e.x - f.x)) v -= 0.012;
      if (Math.abs(e.x) > ARENA_HALF_WIDTH - 1.2 && Math.sign(e.x) !== Math.sign(f.x - e.x)) v += 0.012;
    }
    // Spacing preference for the current plan.
    const want = this.plan === 'kite' && this.m.zone > 0 ? this.m.zone : this.plan === 'recover' ? 6 : this.m.engage;
    v -= Math.min(1, Math.abs(dist - want) / 4) * 0.01;
    return v;
  }

  private spacingDodge(c: Ctx): number {
    const t = c.threat;
    if (!t || !t.melee) return 0;
    const f = this.f;
    const need = t.reach + 0.3 - c.dist;
    if (need <= 0) return 0;
    const away = -(Math.sign(c.e.x - f.x) || f.facing);
    if (Math.abs(f.x + away * need) > ARENA_HALF_WIDTH - 0.3) return 0;
    const time = need / Math.max(0.5, f.stats.moveSpeed) + 0.1;
    if (time > t.tti) return 0;
    return t.danger * (0.8 + this.p.caution * 0.2) + (t.recovery > 0.35 ? 0.02 : 0) + 0.01;
  }

  private scoreDefense(b: Battle, info: AbilityInfo, c: Ctx): { val: number; why: string; wait?: boolean } | null {
    const f = this.f;
    const ab = info.ab;
    const p = this.p;
    const startup = ab.windup / f.stats.attackSpeed;
    const t = c.threat;
    let val = 0;
    let why = '';

    if (t) {
      switch (info.defense) {
        case 'parry': {
          if (!t.blockable) return null;
          const g = ab.guard!;
          // Timing noise: less cunning fighters misjudge the moment.
          const noise = this.defendBias > 1.2 ? 0 : (b.rng.next() - 0.5) * (1 - p.cunning) * 0.12;
          const lead = t.tti + noise - startup;
          if (lead < -0.01) return null;
          if (lead > g.parryWindow * 0.8) {
            if (lead < ab.active - 0.05 && t.danger > 0.1 && p.caution > 0.5) {
              val = t.danger * g.reduction * 0.6;
              why = `${ab.name} up.`;
            } else return { val: 0, why: '', wait: true };
          } else {
            val = t.danger * 1.1 + 0.05 + (g.counterPower ? 0.08 : 0) + (t.heavy ? 0.05 : 0)
              + (t.projectile && g.reflectProjectiles ? 0.06 : 0);
            why = t.projectile && g.reflectProjectiles ? `Bats the shot back with ${ab.name}!` : t.heavy ? `Reads the heavy — ${ab.name}!` : `Times the ${ab.name}.`;
          }
          break;
        }
        case 'armor': {
          if (t.tti < startup) return null;
          val = t.danger * 0.55 + (c.cornered ? 0.03 : 0) + (t.heavy ? 0.02 : 0);
          why = `${ab.name} to tank it.`;
          break;
        }
        default: {
          const iframes = ab.dash?.iframes ?? ab.iframes ?? 0.2;
          const lo = startup + 0.01;
          const hi = startup + iframes + (t.projectile ? 0.05 : 0.18);
          if (t.tti < lo) return null;
          if (t.tti > hi) return { val: 0, why: '', wait: true };
          val = t.danger * (0.75 + p.caution * 0.4) + 0.02 + (!t.blockable ? 0.03 : 0);
          why = info.defense === 'blink' ? `${ab.name} out of it.` : c.cornered ? `Cornered — ${ab.name} through!` : `${ab.name} past the attack.`;
          if (t.heavy && !t.blockable) why = `Can't block that — ${ab.name}!`;
        }
      }
      // Prefer the cheaper answer when the damage is small.
      if (t.danger < 0.03) val *= 0.4;
      val *= this.defendBias;
      return { val, why };
    }

    // No incoming hit: proactive uses.
    const pressured = c.dist < this.m.engage + 0.8 && f.sinceHurt < 1;
    if (info.defense === 'armor') {
      if (pressured && (this.plan === 'pressure' || this.plan === 'allin' || c.cornered)) {
        val = 0.03 + p.aggression * 0.02;
        why = `${ab.name} — tanks through the pressure.`;
      }
    } else if (info.defense === 'evade' || info.defense === 'blink') {
      const wantsOut = this.kit.ranged || c.myHp < 0.4 || this.plan === 'recover' || this.plan === 'kite';
      if (c.cornered && wantsOut && c.dist < c.enemyReach + 0.6) {
        val = 0.04;
        why = 'Escapes the corner.';
      } else if (info.defense === 'blink' && (this.plan === 'kite' || this.kit.ranged) && c.dist < 1.8) {
        val = 0.035 + p.caution * 0.03;
        why = 'Too close — blinks away.';
      }
    }
    return val > 0 ? { val, why } : null;
  }

  private scoreBuff(info: AbilityInfo, c: Ctx): { val: number; why: string } | null {
    const f = this.f;
    const ab = info.ab;
    const reach = Math.max(this.m.engage, c.enemyReach) + 2;
    const inFight = c.dist < reach || (this.plan === 'kite' && c.dist < this.m.zone + 1.5);
    const myDps = Math.max(dpsAt(f, this.kit, c.e, Math.min(c.dist, this.m.engage)), dpsAt(f, this.kit, c.e, c.dist));
    let val = 0;
    let why = '';
    if (ab.buff) for (const s of ab.buff) {
      const fx = STATUS_FX[s.status];
      if (!fx || getStatus(f, s.status)) continue;
      const gain = (fx.dmg ?? 0) + (fx.speed ?? 0) * 0.8;
      if (gain > 0) {
        val += myDps * s.duration * gain * (inFight ? 1 : 0.35);
        why = this.plan === 'allin' ? `${ab.name} for the kill!` : `${ab.name}!`;
      }
      if (fx.move && fx.move > 0) val += 0.008;
    }
    if (ab.heal) {
      const missing = 1 - c.myHp;
      val += Math.min(ab.heal, missing) * f.stats.healMult * 0.8;
      if (missing > 0.3) why = why || 'Catches a breath.';
    }
    if (val <= 0) return null;
    const lock = (ab.windup + ab.active) / f.stats.attackSpeed;
    if (c.threat && c.threat.tti < lock + 0.1) val *= 0.15;
    // Best cast while they're busy or far away.
    if (c.open > lock) val *= 1.2;
    if (this.plan === 'allin') val *= 1.2;
    return { val, why };
  }

  private scoreAttack(b: Battle, info: AbilityInfo, c: Ctx): { val: number; why: string } | null {
    const f = this.f;
    const e = c.e;
    const ab = info.ab;
    const p = this.p;
    const o = this.opp;
    const plan = this.plan;
    const dist = c.dist;
    let why = '';
    let val = 0;

    const windup = ab.windup / f.stats.attackSpeed;
    const dmg = estDamage(f, ab, e);
    const closing = (e.vx * -Math.sign(e.x - f.x)) * windup; // + when enemy approaches
    const predicted = dist - closing;
    let pHit = 0;
    switch (ab.kind) {
      case 'melee':
        pHit = predicted <= info.maxReach ? 0.88 : predicted <= info.maxReach + 0.3 ? 0.35 : 0;
        break;
      case 'aoe':
        pHit = predicted <= info.maxReach ? 0.9 : 0;
        break;
      case 'dash':
        pHit = dist <= info.maxReach && dist > info.minReach ? 0.8 : 0;
        // Don't dash through into a wall corner.
        if (Math.abs(e.x + f.facing * 1.5) > ARENA_HALF_WIDTH) pHit *= 0.5;
        break;
      case 'projectile': {
        const travel = Math.max(0, dist - 1) / ab.projectile!.speed;
        pHit = dist <= ab.range ? 0.9 : 0;
        const theirDef = readyDefenses(e, this.ek, travel + windup);
        if (theirDef.evade || theirDef.parry) {
          pHit *= 1 - clamp((travel + windup - 0.25) * 0.6, 0, 0.5) * (0.4 + o.projDefend);
        }
        if (ab.projectile!.ground && e.y > 0.5) pHit *= 0.3;
        break;
      }
      case 'meteor':
        pHit = 0.5 + (isDisabled(e) ? 0.35 : 0) + (e.action && e.action.phase !== 'recovery' ? 0.15 : 0);
        break;
      default:
        return null;
    }
    if (pHit <= 0) return null;

    // Punish windows: enemy can't respond before we land.
    const travel = ab.projectile && ab.kind === 'projectile' ? Math.max(0, dist - 1) / ab.projectile.speed : 0;
    const reachTime = windup + travel;
    let punishing = false;
    if (c.open > reachTime + 0.02) {
      pHit = Math.min(0.98, pHit + 0.4);
      punishing = true;
    }
    if (this.baitedUntil > b.time && !punishing) {
      // They burned a defense on my feint: their answer is spent.
      pHit = Math.min(0.95, pHit + 0.2);
      why = `Feint, then ${ab.name}!`;
    }

    // Trading into an enemy windup.
    const ea = e.action;
    if (ea && ea.phase === 'windup' && !ea.feint && this.perceived(b)) {
      const eab = e.abilities[ea.ability];
      const theirRemaining = ea.windup - ea.t;
      if (eab.kind === 'guard') {
        if (!ab.unblockable) pHit *= 0.35;
        else { pHit = Math.min(1, pHit + 0.2); why = `${ab.name} breaks the guard!`; }
      } else if (eab.power > 0) {
        if (windup < theirRemaining - 0.03 && (ab.stagger || ab.stun) && !eab.hyperArmor) {
          val += 0.06;
          why = `${ab.name} stuffs the windup!`;
        } else if (ab.hyperArmor && windup < theirRemaining + 0.25) {
          val += 0.02;
          why = why || `${ab.name} trades through it.`;
        } else if (!ab.hyperArmor && windup > theirRemaining) {
          pHit *= 0.3;
        }
      }
    }
    if (ea && ea.phase !== 'recovery' && e.abilities[ea.ability].kind === 'guard' && this.perceived(b)) {
      if (!ab.unblockable) pHit *= 0.3;
    }
    if (e.invuln > reachTime) return null;

    // Slow windups get stuffed if they can hit me first (unless I have hyper armor).
    if (!ab.hyperArmor && !punishing && windup > 0.3) {
      const theirs = fastestAnswer(e, this.ek, Math.max(0.5, dist - (ab.lunge ?? 0) * 0.25)) + p.reaction * 0.5;
      if (theirs < windup && !isDisabled(e)) pHit *= info.ultimate ? 0.3 : 0.55;
    }

    // Learned accuracy per ability.
    const learned = clamp(this.hitRate[info.idx] / 0.65, 0.35, 1.25);
    pHit *= lerp(1, learned, p.adaptivity);

    // Telegraphs only matter if they have an answer ready and tend to use it.
    if (!punishing && windup > 0.22) {
      const def = readyDefenses(e, this.ek, windup);
      const answer = ab.unblockable ? (def.evade ? o.evade : 0) : (def.parry ? o.guard : 0) + (def.evade ? o.evade : 0);
      const tele = clamp((windup - 0.2) * 3, 0, 1);
      pHit *= 1 - clamp(answer, 0, 0.9) * 0.6 * tele;
      if (!def.any && ab.heavy) { val += 0.01; why = why || `Their defenses are down — ${ab.name}!`; }
    }

    val += pHit * dmg;
    if (ab.stun || ab.applies?.some((s) => STATUS_FX[s.status]?.cc)) val += pHit * ccValue(ab, c.burst);

    // Finishing blow.
    const phoenix = e.has.has('phoenix_feather') && !e.phoenixUsed;
    if (dmg * pHit > c.enHp * 0.95 && !phoenix) { val += 0.08; why = `${ab.name} to finish!`; }

    // Situational bonuses.
    if (ab.knockback && ab.knockback >= 4 && Math.abs(e.x) > ARENA_HALF_WIDTH - 2.5 && Math.sign(e.x) === Math.sign(e.x - f.x)) {
      val += 0.03 * pHit;
      why = why || `${ab.name} drives them into the wall!`;
    }
    if (c.cornered && ab.knockback && ab.knockback >= 4) { val += 0.03; why = why || 'Shoves out of the corner!'; }
    if (f.has.has('storm_crown') && f.stormCounter === 2) val += 0.02 * pHit;
    if (f.has.has('frost_core') && stacksOf(e, 'chill') === 4) { val += 0.04 * pHit; why = why || 'Going for the freeze.'; }
    // Repel attacks are an answer to being rushed when you want range.
    if (ab.knockback && ab.knockback >= 5 && dist < 2.4 && (plan === 'kite' || this.kit.ranged)) val += 0.04;

    // Item awareness.
    if (e.stats.thorns > 0 && ab.kind === 'melee') {
      val -= pHit * dmg * e.stats.thorns * (e.stats.maxHp / f.stats.maxHp) * (c.myHp < 0.35 ? 1.5 : 0.8);
    }
    if (ab.kind === 'projectile' && !ab.projectile!.ground) {
      if (e.has.has('mirror_aegis') && e.mirrorCd <= travel) {
        if (ab.cooldown <= 1 && ab.cost === 0) { val = Math.max(val * 0.2, 0.03); why = 'Pops the Mirror Aegis with a cheap shot.'; }
        else val -= dmg * 1.2;
      }
      // Shots into a reflecting guard come straight back.
      const reflector = this.ek.defenses.find((d) => d.ab.guard?.reflectProjectiles);
      if (reflector && e.cooldowns[reflector.idx] <= travel && !punishing) val -= dmg * o.projDefend * o.guard * 1.5;
    }

    // Ultimates are held for good moments.
    if (info.ultimate) {
      const killShot = dmg * pHit > c.enHp && !phoenix;
      const desperate = c.myHp < 0.22;
      if (!(punishing || killShot || desperate || pHit > 0.8 || plan === 'allin')) val *= 0.25;
      else why = killShot ? `${ab.name} to finish!` : punishing ? `${ab.name} on the opening!` : why;
      if (phoenix && c.enHp < 0.2) { val *= 0.4; why = `Saving ${ab.name} for after the Phoenix.`; }
    } else if (ab.cost > 0) {
      // Keep a reserve for the ultimate when close to it.
      const ult = this.kit.info.find((a) => a.ultimate);
      if (ult && f.energy - ab.cost < ult.ab.cost && f.energy > ult.ab.cost * 0.8) val *= 0.7;
    }

    // Plan & personality.
    const close = !info.ranged;
    if (plan === 'pressure' && close) val *= 1.15;
    if (plan === 'kite' && !close) val *= 1.2;
    if (plan === 'allin') val *= 1.3;
    if (plan === 'turtle' && !punishing) val *= 0.7;
    if (plan === 'bait' && !punishing) val *= 0.75;
    if (plan === 'recover' && !punishing) val *= 0.6;
    val *= 0.8 + p.aggression * 0.4;

    // Risk: whiffing up close hands them a free punish, scaled by how fast they can answer
    // and how much they like punishing.
    const myRecovery = ab.recovery / f.stats.attackSpeed + ab.active;
    if (dist < 3.5 && !punishing) {
      const theirAnswer = fastestAnswer(e, this.ek, Math.max(1, dist - (ab.lunge ?? 0)));
      const exposed = theirAnswer < myRecovery ? 1 : 0.4;
      val -= (1 - pHit) * 0.06 * (myRecovery / 0.4) * (0.5 + p.caution) * exposed * (0.6 + o.punisher * 0.8);
    }
    if (this.parriedRecently > 1 && ab.heavy && !ab.unblockable && !punishing) val *= 0.6;
    if (punishing && !why) why = c.open > 0.5 ? `Punishes with ${ab.name}!` : `Whiff punish — ${ab.name}!`;

    // Tiny noise so mirror matches diverge naturally.
    val *= 0.95 + b.rng.next() * 0.1;
    return { val, why };
  }

  private moveDecision(b: Battle, c: Ctx, waiting: boolean): void {
    const f = this.f;
    const m = this.m;
    const dx = c.e.x - f.x;
    const dist = c.dist;
    const toward = Math.sign(dx) || f.facing;
    const zone = m.zone > 0 ? m.zone : m.engage;
    const brawler = m.myClose >= m.myFar * 0.6;

    let desired: number;
    switch (this.plan) {
      case 'pressure':
      case 'allin':
        desired = brawler ? m.engage : Math.min(zone, 4);
        break;
      case 'kite':
        desired = zone;
        break;
      case 'bait': {
        // Hover just outside their reach, swaying in and out.
        this.bobPhase += DT * 4;
        desired = Math.max(m.engage, c.enemyReach + 0.45) + Math.sin(this.bobPhase) * 0.45;
        break;
      }
      case 'turtle':
        desired = this.kit.ranged ? zone + 1 : Math.max(c.enemyReach + 0.9, 3.2);
        break;
      case 'recover':
        desired = 7.5;
        break;
    }
    // Step in to punish.
    if (c.open > 0.3 && brawler) desired = m.engage * 0.85;
    // Back off from an incoming melee hit while waiting for timing.
    if (c.threat && c.threat.melee && waiting && this.p.caution > 0.5 && c.threat.tti < 0.3) desired = Math.max(desired, dist + 1);

    const err = dist - desired;
    let move = 0;
    if (err > 0.25) move = toward;
    else if (err < -0.25) move = -toward;

    // Don't back into the wall: hold ground instead.
    if (move === -toward && Math.abs(f.x - toward * 0.8) > ARENA_HALF_WIDTH - 0.4) move = 0;
    f.move = move;
    void b;
  }

  // ---------------------------------------------------------------------------
  // Mid-action: feints and cancels
  // ---------------------------------------------------------------------------

  private midAction(b: Battle, e: Fighter): void {
    const f = this.f;
    const a = f.action!;
    if (a.phase !== 'windup' || a.feint || a.t > a.windup * 0.7) return;
    const info = this.kit.info[a.ability];
    const ab = info.ab;
    if (!info.offensive || info.ultimate || !this.perceived(b)) return;
    const ea = e.action;
    if (!ea) return;
    // Decide once per pair of actions.
    const key = actionKey(f) * 31 + actionKey(e);
    if (this.feintKey === key) return;
    this.feintKey = key;
    const k = this.ek.info[ea.ability];

    // 1. They took the bait: cancel and let their defense whiff.
    if (k.defense && !ab.unblockable && ab.windup >= 0.28) {
      const chance = this.p.cunning * (this.plan === 'bait' ? 0.95 : 0.75);
      if (b.rng.next() < chance && b.feint(f)) {
        this.baitedUntil = b.time + 0.6;
        this.thought(b, 'Feint! Baited the defense.', true);
      }
      return;
    }
    // 2. They are about to land first: cancel to free up for a defense.
    if (k.offensive && !ab.hyperArmor) {
      const t = this.readThreat(b, e);
      const mine = a.windup - a.t;
      if (t && t.melee && t.tti < mine - 0.02 && t.danger > 0.05) {
        const def = readyDefenses(f, this.kit, t.tti);
        const canStep = t.reach + 0.3 - Math.abs(e.x - f.x) < f.stats.moveSpeed * (t.tti - 0.15);
        if ((def.any || canStep) && b.rng.next() < 0.35 + this.p.cunning * 0.4 + this.p.caution * 0.2 && b.feint(f)) {
          this.thought(b, 'Cancels — they were faster.');
        }
      }
    }
  }
}

function actionKey(f: Fighter): number {
  const a = f.action;
  if (!a) return -1;
  // Unique-enough identity for an action instance.
  return a.ability * 100000 + Math.round((a.startX + 50) * 100) + Math.round(a.windup * 1000) * 7;
}
