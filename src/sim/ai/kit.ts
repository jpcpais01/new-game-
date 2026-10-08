import { clamp } from '../../core/math';
import { BASE_ENERGY_REGEN, MAX_ENERGY } from '../constants';
import { reachOf as abilityReach, stacksOf, type Fighter } from '../fighter';
import type { AbilityDef, StatusId } from '../types';

/**
 * Kit analysis: everything the AI knows about a fighter is derived from the
 * abilities its gear grants, its stats and its passives. There are no
 * per-class or per-ability special cases, so any combination of weapons,
 * defensives and items is understood the same way.
 */

export type DefenseKind = 'parry' | 'evade' | 'blink' | 'armor' | 'shield';

export interface AbilityInfo {
  idx: number;
  ab: AbilityDef;
  /** Deals damage or crowd control to the enemy. */
  offensive: boolean;
  /** How this ability protects its user, if it does. */
  defense: DefenseKind | null;
  /** Self buff or heal (no direct damage). */
  buff: boolean;
  /** Spends the whole energy bar: held for big moments. */
  ultimate: boolean;
  minReach: number;
  maxReach: number;
  /** Lands from distance (projectile or called strike). */
  ranged: boolean;
  /** Covers ground quickly toward the enemy. */
  closer: boolean;
  /** Seconds the user is locked in the action at attack speed 1. */
  commit: number;
}

export interface Kit {
  info: AbilityInfo[];
  /** Can deal sustained damage from beyond melee range. */
  ranged: boolean;
  /** Longest close-range reach among repeatable attacks. */
  meleeReach: number;
  maxReach: number;
  defenses: AbilityInfo[];
  /** Hits that stun or freeze (setups for combos). */
  hasStun: boolean;
}

/** What each status does, mirrored from refreshStats so buffs and debuffs can be valued. */
interface StatusFx {
  dmg?: number;
  speed?: number;
  move?: number;
  /** Change in damage taken (negative = reduction). */
  taken?: number;
  /** DoT per second as a fraction of the source's power, per stack. */
  dot?: number;
  cc?: boolean;
}
export const STATUS_FX: Partial<Record<StatusId, StatusFx>> = {
  rage: { dmg: 0.25, speed: 0.15 },
  haste: { move: 0.3, speed: 0.2 },
  ironskin: { taken: -0.5 },
  mark: { taken: 0.15 },
  vulnerable: { taken: 0.25 },
  chill: { move: -0.08, speed: -0.06 },
  burn: { dot: 0.2 },
  poison: { dot: 0.09 },
  stun: { cc: true },
  frozen: { cc: true },
};

const OFFENSIVE_BUFFS: StatusId[] = ['rage', 'haste'];

/** Distance band [min, max] (centre to centre) from which `ab` can land when used by `f`. */
export function reachOf(f: Fighter, ab: AbilityDef): [number, number] {
  const r = abilityReach(f, ab);
  switch (ab.kind) {
    // Only ~30% of a lunge happens before the first hit lands (more for flurries).
    case 'melee': return [0, r + (ab.lunge ?? 0) * ((ab.hits ?? 1) > 1 ? 0.6 : 0.3)];
    case 'aoe': return [0, r + (ab.lunge ?? 0) * (ab.airborne ? 0.8 : 0.3)];
    case 'dash': return ab.dash?.strike ? [0.6, (ab.dash.distance ?? 0) - 0.6] : [0, 0];
    case 'projectile': return [0, r];
    case 'meteor': return [0, r];
    default: return [0, 0];
  }
}

export function defenseOf(ab: AbilityDef): DefenseKind | null {
  if (ab.kind === 'guard') return 'parry';
  if (ab.kind === 'blink') return 'blink';
  if (ab.slot === 'evade' || (ab.kind === 'dash' && !ab.dash?.strike && (ab.dash?.iframes ?? 0) > 0)) return 'evade';
  if (ab.kind === 'buff' && ab.buff?.some((s) => (STATUS_FX[s.status]?.taken ?? 0) < 0)) return 'armor';
  if (ab.shieldGain && ab.power <= 0) return 'shield';
  return null;
}

export function analyzeKit(f: Fighter): Kit {
  const info: AbilityInfo[] = f.abilities.map((ab, idx) => {
    const [minReach, maxReach] = reachOf(f, ab);
    const offensive = (ab.power > 0 || !!ab.stun) && maxReach > 0;
    const ranged = ab.kind === 'meteor' || (ab.kind === 'projectile' && ab.range >= 5);
    return {
      idx, ab, offensive,
      defense: defenseOf(ab),
      buff: ab.kind === 'buff' && !offensive,
      ultimate: ab.slot === 'ultimate' || ab.cost >= MAX_ENERGY,
      minReach, maxReach, ranged,
      closer: (ab.kind === 'dash' && !!ab.dash?.strike) || (ab.lunge ?? 0) >= 1.4,
      commit: ab.windup + ab.active + ab.recovery,
    };
  });
  let meleeReach = 0, maxReach = 0, ranged = false, hasStun = false;
  for (const a of info) {
    if (!a.offensive) continue;
    maxReach = Math.max(maxReach, a.maxReach);
    if (!a.ultimate && !a.ranged && a.ab.kind !== 'dash') meleeReach = Math.max(meleeReach, a.maxReach);
    // Ranged if a repeatable (cheap, short-cooldown) attack works from afar.
    if (a.ranged && !a.ultimate && a.ab.cooldown <= 1.5) ranged = true;
    if (a.ab.stun || a.ab.applies?.some((s) => STATUS_FX[s.status]?.cc)) hasStun = true;
  }
  return { info, ranged, meleeReach: meleeReach || 1.6, maxReach, defenses: info.filter((a) => a.defense), hasStun };
}

// -----------------------------------------------------------------------------
// Damage estimates (as a fraction of the target's max HP)
// -----------------------------------------------------------------------------

function mitigation(dst: Fighter, dtype: AbilityDef['damageType']): number {
  if (dtype === 'physical') return 100 / (100 + Math.max(0, dst.stats.armor));
  if (dtype === 'magic') return 100 / (100 + Math.max(0, dst.stats.resist));
  return 1;
}

/** Extra damage the attacker's passives add to one landed hit, in raw HP. */
function onHitBonus(src: Fighter, dst: Fighter, raw: number): number {
  let extra = 0;
  const p = src.stats.power;
  if (src.has.has('ember_core') && stacksOf(dst, 'burn') < 3) extra += p * 0.2 * 3 * mitigation(dst, 'magic');
  if (src.has.has('storm_crown')) extra += (p * 0.9 * mitigation(dst, 'magic')) / (src.stormCounter === 2 ? 1 : 3);
  if (src.has.has('echo_stone')) extra += raw * 0.35 * 0.6;
  return extra;
}

/** Damage of `ab` from `src` to `dst` if it lands, including DoTs and on-hit passives. */
export function estDamage(src: Fighter, ab: AbilityDef, dst: Fighter, withPassives = true): number {
  const s = src.stats;
  let raw = s.power * ab.power * (ab.hits ?? 1) * s.damageMult;
  let critMult = s.critMult;
  if (src.has.has('executioner_hood') && dst.hp / dst.stats.maxHp < 0.3) critMult *= 1.5;
  raw *= 1 + s.critChance * (critMult - 1);
  let dmg = raw * mitigation(dst, ab.damageType);
  if (ab.applies) {
    for (const a of ab.applies) {
      const fx = STATUS_FX[a.status];
      if (fx?.dot) {
        const dtype = a.status === 'burn' ? 'magic' : 'true';
        dmg += s.power * fx.dot * (a.stacks ?? 1) * a.duration * mitigation(dst, dtype);
      } else if (fx?.taken && fx.taken > 0) {
        dmg += raw * fx.taken * 1.5;
      }
    }
  }
  if (withPassives && ab.power > 0) dmg += onHitBonus(src, dst, dmg) * (ab.hits ? Math.min(ab.hits, 3) / 1.5 : 1);
  dmg *= dst.stats.damageTakenMult;
  return dmg / dst.stats.maxHp;
}

/** Value of the crowd control `ab` inflicts, as damage-equivalent HP fraction. */
export function ccValue(ab: AbilityDef, followUpPerSec: number): number {
  let v = 0;
  if (ab.stun) v += ab.stun * followUpPerSec;
  if (ab.applies) for (const a of ab.applies) {
    if (a.status === 'chill') v += 0.006 * (a.stacks ?? 1);
    else if (STATUS_FX[a.status]?.cc) v += a.duration * followUpPerSec;
  }
  return v;
}

// -----------------------------------------------------------------------------
// Matchup: who wins at which distance
// -----------------------------------------------------------------------------

/** Rough energy income per second in a fight. */
function energyRate(f: Fighter): number {
  return BASE_ENERGY_REGEN * f.stats.energyRegen + 4;
}

/** Seconds between uses of an ability when used as often as possible. */
export function periodOf(f: Fighter, ab: AbilityDef): number {
  const commit = (ab.windup + ab.recovery) / f.stats.attackSpeed + ab.active;
  const cd = ab.cooldown * (1 - f.stats.cdr);
  const byEnergy = ab.cost > 0 ? ab.cost / energyRate(f) : 0;
  return Math.max(commit + 0.12, cd, byEnergy);
}

/** Expected damage per second at distance `d`, as a fraction of `dst` max HP. */
export function dpsAt(src: Fighter, kit: Kit, dst: Fighter, d: number): number {
  let dps = 0, busy = 0;
  for (const a of kit.info) {
    if (!a.offensive || d < a.minReach || d > a.maxReach) continue;
    const period = periodOf(src, a.ab);
    const commit = (a.ab.windup + a.ab.recovery) / src.stats.attackSpeed + a.ab.active;
    // Projectiles lose some value to travel time (easier to answer).
    const travel = a.ab.projectile && a.ab.kind === 'projectile' ? Math.max(0, d - 1) / a.ab.projectile.speed : 0;
    const accuracy = a.ranged ? clamp(1 - travel * 0.5, 0.55, 1) : 0.85;
    dps += (estDamage(src, a.ab, dst) * accuracy) / period;
    busy += commit / period;
  }
  // Abilities share the same body: normalise when they can't all fit.
  if (busy > 1) dps /= busy;
  dps *= 1 + src.stats.lifesteal * 0.5;
  return dps;
}

export interface Matchup {
  /** Best distance to brawl at (inside my reach, ideally outside theirs). */
  engage: number;
  /** Best distance to zone from, or 0 when zoning isn't worth it. */
  zone: number;
  /** Net kill-rate advantage at those distances (positive = mine). */
  engageEdge: number;
  zoneEdge: number;
  /** Peak damage per second up close and at range. */
  myClose: number;
  myFar: number;
  theirClose: number;
  theirFar: number;
}

export function analyzeMatchup(f: Fighter, fk: Kit, e: Fighter, ek: Kit, caution: number): Matchup {
  let engage = Math.max(1.1, Math.min(fk.meleeReach * 0.9, 2.4)), engageScore = -Infinity, engageEdge = 0;
  let zone = 0, zoneScore = -Infinity, zoneEdge = 0;
  let myClose = 0, myFar = 0, theirClose = 0, theirFar = 0;
  const w = 0.55 + caution * 0.6;
  // Kiting only works if they can't simply walk me down.
  const kiteEff = clamp(f.stats.moveSpeed / Math.max(0.1, e.stats.moveSpeed), 0.55, 1.2)
    * (ek.info.some((a) => a.closer && a.offensive) ? 0.85 : 1);
  for (let d = 1.1; d <= 8.6; d += 0.25) {
    // Keep a margin so a small step back by them doesn't turn hits into whiffs.
    const mine = dpsAt(f, fk, e, d <= 3.2 ? d + 0.25 : d);
    const theirs = dpsAt(e, ek, f, d);
    if (d <= 3.2) {
      myClose = Math.max(myClose, mine);
      theirClose = Math.max(theirClose, theirs);
      // Small preference for longer spacing (safer) at equal value.
      const s = mine - theirs * 0.35 + d * 0.0005;
      if (mine > 0 && s > engageScore) { engageScore = s; engage = d; engageEdge = mine - theirs; }
    } else {
      myFar = Math.max(myFar, mine);
      theirFar = Math.max(theirFar, theirs);
      const s = (mine - theirs * w) * kiteEff;
      if (mine > 0 && s > zoneScore) { zoneScore = s; zone = d; zoneEdge = mine * kiteEff - theirs; }
    }
  }
  if (zoneScore === -Infinity || myFar < myClose * 0.3) { zone = 0; zoneEdge = -1; }
  if (engageScore === -Infinity) { engage = 3.4; engageEdge = -theirClose; }
  return { engage, zone, engageEdge, zoneEdge, myClose, myFar, theirClose, theirFar };
}

/** Reach of the enemy's attacks that are ready (or nearly ready) right now. */
export function liveReach(e: Fighter, ek: Kit, within: number): number {
  let r = 0;
  for (const a of ek.info) {
    if (!a.offensive || a.ranged || a.ultimate) continue;
    if (e.cooldowns[a.idx] <= within && e.energy >= a.ab.cost) r = Math.max(r, a.maxReach);
  }
  return r || ek.meleeReach;
}

/** Defensive answers the fighter can start within `within` seconds. */
export function readyDefenses(f: Fighter, k: Kit, within: number): { parry: boolean; evade: boolean; armor: boolean; any: boolean } {
  let parry = false, evade = false, armor = false;
  for (const a of k.defenses) {
    if (f.cooldowns[a.idx] > within || f.energy < a.ab.cost) continue;
    if (a.defense === 'parry') parry = true;
    else if (a.defense === 'armor' || a.defense === 'shield') armor = true;
    else evade = true;
  }
  return { parry, evade, armor, any: parry || evade || armor };
}

/** Fastest startup (seconds) among the fighter's ready attacks that reach `d`. */
export function fastestAnswer(f: Fighter, k: Kit, d: number): number {
  let best = Infinity;
  for (const a of k.info) {
    if (!a.offensive || f.cooldowns[a.idx] > 0.05 || f.energy < a.ab.cost) continue;
    if (d < a.minReach || d > a.maxReach) continue;
    best = Math.min(best, a.ab.windup / f.stats.attackSpeed);
  }
  return best;
}

export function isOffensiveBuff(status: StatusId): boolean {
  return OFFENSIVE_BUFFS.includes(status);
}
