import { CLASS_ABILITIES, EVADE } from './abilities';
import { CLASSES } from './classes';
import { ITEMS } from './items';
import type {
  AbilityDef, ActionState, ClassId, FighterId, FighterTotals, ItemId, Stats, StatusId, StatusInstance,
} from './types';
import { MAX_ENERGY } from './constants';

export interface FighterConfig {
  classId: ClassId;
  items: ItemId[];
  name?: string;
}

export interface Fighter {
  id: FighterId;
  classId: ClassId;
  name: string;
  items: ItemId[];
  has: Set<ItemId>;
  abilities: AbilityDef[];
  cooldowns: number[];

  x: number;
  y: number;
  /** Previous-step position, for render interpolation. */
  px: number;
  py: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  /** Desired walk direction (-1, 0, 1) in world space, set by the AI. */
  move: number;

  hp: number;
  shield: number;
  energy: number;
  base: Stats;
  stats: Stats;

  action: ActionState | null;
  statuses: StatusInstance[];
  /** Hit-stun remaining (cannot act). */
  stagger: number;
  invuln: number;
  alive: boolean;

  // Item state
  phoenixUsed: boolean;
  stormCounter: number;
  mirrorCd: number;
  aegisIdle: number;
  ironWillCd: number;
  /** Echo hits queued: [delay, damage] pairs. */
  echoQueue: { delay: number; amount: number; dtype: AbilityDef['damageType'] }[];

  /** Seconds since last taking damage. */
  sinceHurt: number;
  /** Seconds since last dealing damage. */
  sinceHit: number;

  totals: FighterTotals;
}

export function computeBaseStats(classId: ClassId, items: ItemId[]): Stats {
  const s: Stats = { ...CLASSES[classId].base };
  for (const id of items) {
    const it = ITEMS[id];
    if (it.add) for (const k in it.add) (s as any)[k] += (it.add as any)[k];
  }
  for (const id of items) {
    const it = ITEMS[id];
    if (it.mul) for (const k in it.mul) (s as any)[k] *= (it.mul as any)[k];
  }
  s.cdr = Math.min(s.cdr, 0.6);
  return s;
}

export function createFighter(id: FighterId, cfg: FighterConfig): Fighter {
  const base = computeBaseStats(cfg.classId, cfg.items);
  const abilities = [...CLASS_ABILITIES[cfg.classId], EVADE];
  const has = new Set(cfg.items);
  const f: Fighter = {
    id,
    classId: cfg.classId,
    name: cfg.name ?? CLASSES[cfg.classId].name,
    items: cfg.items.slice(),
    has,
    abilities,
    cooldowns: abilities.map(() => 0),
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
    facing: id === 0 ? 1 : -1,
    move: 0,
    hp: base.maxHp,
    shield: has.has('aegis_charm') ? base.maxHp * 0.22 : 0,
    energy: 20,
    base,
    stats: { ...base },
    action: null,
    statuses: [],
    stagger: 0,
    invuln: 0,
    alive: true,
    phoenixUsed: false,
    stormCounter: 0,
    mirrorCd: 0,
    aegisIdle: 0,
    ironWillCd: 0,
    echoQueue: [],
    sinceHurt: 99,
    sinceHit: 99,
    totals: {
      damageDealt: 0, damageTaken: 0, hits: 0, crits: 0, parries: 0, blocks: 0,
      evades: 0, feints: 0, biggestHit: 0, healed: 0,
    },
  };
  f.energy = Math.min(f.energy, MAX_ENERGY);
  return f;
}

export function getStatus(f: Fighter, id: StatusId): StatusInstance | undefined {
  for (let i = 0; i < f.statuses.length; i++) if (f.statuses[i].id === id) return f.statuses[i];
  return undefined;
}

export function stacksOf(f: Fighter, id: StatusId): number {
  const s = getStatus(f, id);
  return s ? s.stacks : 0;
}

export function isDisabled(f: Fighter): boolean {
  return f.stagger > 0 || !!getStatus(f, 'stun') || !!getStatus(f, 'frozen');
}

export function hpRatio(f: Fighter): number {
  return f.hp / f.stats.maxHp;
}

/** Recomputes dynamic stats from base stats, statuses and conditional items. */
export function refreshStats(f: Fighter): void {
  const s = f.stats;
  const b = f.base;
  s.maxHp = b.maxHp; s.power = b.power; s.armor = b.armor; s.resist = b.resist;
  s.attackSpeed = b.attackSpeed; s.moveSpeed = b.moveSpeed; s.critChance = b.critChance;
  s.critMult = b.critMult; s.lifesteal = b.lifesteal; s.cdr = b.cdr; s.energyRegen = b.energyRegen;
  s.tenacity = b.tenacity; s.thorns = b.thorns; s.healMult = b.healMult;
  s.damageMult = b.damageMult; s.damageTakenMult = b.damageTakenMult;

  for (let i = 0; i < f.statuses.length; i++) {
    const st = f.statuses[i];
    switch (st.id) {
      case 'chill': {
        const slow = 1 - 0.08 * st.stacks;
        s.moveSpeed *= slow; s.attackSpeed *= 1 - 0.06 * st.stacks;
        break;
      }
      case 'rage': s.damageMult *= 1.25; s.attackSpeed *= 1.15; break;
      case 'haste': s.moveSpeed *= 1.3; s.attackSpeed *= 1.2; break;
      case 'mark': s.damageTakenMult *= 1.15; break;
      case 'vulnerable': s.damageTakenMult *= 1.25; break;
      case 'ironskin': s.damageTakenMult *= 0.5; break;
      case 'poison': s.healMult *= 0.6; break;
    }
  }

  if (f.has.has('berserker_mask')) {
    const missing = 1 - f.hp / s.maxHp;
    s.damageMult *= 1 + Math.min(0.5, missing * 0.7);
    if (missing > 0.6) s.attackSpeed *= 1.1;
  }
}
