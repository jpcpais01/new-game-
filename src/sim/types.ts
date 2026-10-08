export type FighterId = 0 | 1;
export type DamageType = 'physical' | 'magic' | 'true';

/**
 * Body forms. A form is only a body: size, build and base attributes. What a
 * fighter can *do* comes entirely from the gear it carries.
 */
export type FormId = 'robust' | 'agile' | 'balanced' | 'slender' | 'mighty' | 'ethereal';

/** The six equipment slots every character has. */
export type GearSlot = 'main' | 'offhand' | 'defense' | 'head' | 'boots' | 'special';

export type MainWeaponId =
  | 'longsword' | 'katana' | 'warhammer' | 'spear' | 'twin_daggers' | 'arcane_staff' | 'longbow';
export type OffhandId =
  | 'throwing_knives' | 'hand_crossbow' | 'wind_chakram' | 'frost_orb' | 'iron_gauntlet' | 'war_horn';
export type DefenseId =
  | 'tower_shield' | 'parrying_blade' | 'plate_armor' | 'phase_cloak' | 'thornmail' | 'mirror_aegis';
export type HeadId =
  | 'berserker_mask' | 'iron_helm' | 'chrono_circlet' | 'executioner_hood' | 'storm_crown' | 'duelist_band';
export type BootsId =
  | 'leather_boots' | 'zephyr_boots' | 'iron_greaves' | 'shadow_treads' | 'colossus_boots' | 'leaping_boots';
export type SpecialId =
  | 'phoenix_feather' | 'echo_stone' | 'vampiric_fang' | 'ember_core' | 'frost_core'
  | 'meteor_sigil' | 'judgment_relic' | 'phantom_blade' | 'earth_heart';

export type GearId = MainWeaponId | OffhandId | DefenseId | HeadId | BootsId | SpecialId;

/** Gear id type allowed in each slot. */
export interface GearSlotIds {
  main: MainWeaponId;
  offhand: OffhandId;
  defense: DefenseId;
  head: HeadId;
  boots: BootsId;
  special: SpecialId;
}

/** What a character has equipped. `main` is required; every other slot may be empty. */
export type GearSet = { main: MainWeaponId } & { [S in Exclude<GearSlot, 'main'>]?: GearSlotIds[S] };

export type StatusId =
  | 'burn' | 'poison' | 'chill' | 'frozen' | 'stun'
  | 'rage' | 'haste' | 'mark' | 'ironskin' | 'vulnerable';

export type AnimKey =
  | 'slash' | 'thrust' | 'overhead' | 'bash' | 'spin' | 'cast' | 'castBig'
  | 'guard' | 'counter' | 'dash' | 'evade' | 'blink' | 'leap' | 'roar'
  | 'flurry' | 'slam' | 'throw' | 'shoot';

export type ProjectileStyle = 'arcane' | 'hex' | 'wave' | 'groundwave' | 'meteor' | 'arrow' | 'knife' | 'bolt';

export interface Stats {
  maxHp: number;
  power: number;
  armor: number;
  resist: number;
  /** Multiplier on action speed (higher = faster windups and recoveries). */
  attackSpeed: number;
  moveSpeed: number;
  critChance: number;
  critMult: number;
  lifesteal: number;
  /** Fraction of cooldown removed (0..0.6). */
  cdr: number;
  energyRegen: number;
  /** Fraction of crowd-control duration removed. */
  tenacity: number;
  /** Fraction of melee damage taken that is reflected. */
  thorns: number;
  healMult: number;
  /** Multiplier on all outgoing damage (berserker, rage...). */
  damageMult: number;
  /** Multiplier on incoming damage (mark, iron skin...). */
  damageTakenMult: number;
  /** Light hits with less stagger than this don't interrupt windups. */
  poise: number;
  /** Multiplier on melee and AoE reach (long limbs). */
  reach: number;
  /** Multiplier on knockback dealt and on stagger when checked against poise. */
  force: number;
  /** Multiplier on knockback received. */
  knockbackTaken: number;
}

export interface StatusApply {
  status: StatusId;
  duration: number;
  stacks?: number;
}

export type AbilitySlot = 'basic' | 'skill' | 'defense' | 'ultimate' | 'evade';
export type AbilityKind = 'melee' | 'projectile' | 'guard' | 'dash' | 'buff' | 'blink' | 'aoe' | 'meteor';

export interface AbilityDef {
  id: string;
  name: string;
  slot: AbilitySlot;
  kind: AbilityKind;
  /** Effective reach, center to center (melee/aoe) or max sensible distance (projectiles). */
  range: number;
  cost: number;
  cooldown: number;
  windup: number;
  active: number;
  recovery: number;
  /** Damage multiplier applied to the user's power. */
  power: number;
  damageType: DamageType;
  hits?: number;
  knockback?: number;
  /** Metres moved forward over windup+active. */
  lunge?: number;
  /** Hit-stun applied on hit (seconds). Interrupts windups. */
  stagger?: number;
  stun?: number;
  applies?: StatusApply[];
  /** Telegraphed big attack: causes hitstop, can be parried. */
  heavy?: boolean;
  unblockable?: boolean;
  /** Can't be interrupted by staggers during windup. */
  hyperArmor?: boolean;
  projectile?: { speed: number; radius: number; style: ProjectileStyle; ground?: boolean; pierce?: boolean };
  guard?: { reduction: number; parryWindow: number; counterPower?: number; reflectProjectiles?: boolean };
  /**
   * `through`: attacks pass through the enemy. On an evade it means "roll through
   * the enemy when they are within reach" instead of backstepping.
   */
  dash?: { distance: number; through?: boolean; iframes: number; strike?: boolean };
  buff?: StatusApply[];
  heal?: number;
  /** Shield granted on activation, as a fraction of max HP. */
  shieldGain?: number;
  /** Seconds of invulnerability starting with the active phase. */
  iframes?: number;
  /** Airborne during the windup (leaping attacks) or the dash itself (leaping evades). */
  airborne?: boolean;
  anim: AnimKey;
  /** Short description for the UI. */
  desc: string;
}

export type Phase = 'windup' | 'active' | 'recovery';

export interface ActionState {
  ability: number;
  phase: Phase;
  /** Elapsed seconds inside the current phase. */
  t: number;
  /** Total elapsed seconds since the action began. */
  total: number;
  windup: number;
  active: number;
  recovery: number;
  hitsDone: number;
  /** For dash strikes: whether the pass-through hit landed. */
  connected: boolean;
  /** Cancelled windup (feint). */
  feint: boolean;
  /** Target x captured at cast (meteor, blink). */
  targetX: number;
  startX: number;
  /** Counter-attack triggered by a parry. */
  isCounter: boolean;
  /** World direction of travel for dashes/lunges. */
  dir: number;
  /** Dash crosses through the opponent. */
  through: boolean;
}

export interface StatusInstance {
  id: StatusId;
  remaining: number;
  stacks: number;
  /** Power of the source, used by DoTs. */
  sourcePower: number;
  source: FighterId;
  /** DoT damage accumulated since the last damage event. */
  acc: number;
  tickT: number;
}

export interface Projectile {
  id: number;
  px: number;
  py: number;
  owner: FighterId;
  style: ProjectileStyle;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  ability: number;
  power: number;
  ground: boolean;
  reflected: boolean;
  /** Meteor: x where it lands. */
  targetX: number;
  alive: boolean;
}

export interface FighterTotals {
  damageDealt: number;
  damageTaken: number;
  hits: number;
  crits: number;
  parries: number;
  blocks: number;
  evades: number;
  feints: number;
  biggestHit: number;
  healed: number;
}

export type BattleEvent =
  | { type: 'actionStart'; f: FighterId; ability: number }
  | { type: 'actionActive'; f: FighterId; ability: number }
  | { type: 'feint'; f: FighterId }
  | { type: 'hit'; attacker: FighterId; target: FighterId; amount: number; crit: boolean; dtype: DamageType;
      blocked: boolean; heavy: boolean; ability: string; x: number; y: number; killing: boolean; dot?: boolean; echo?: boolean }
  | { type: 'parry'; defender: FighterId; attacker: FighterId; x: number; y: number }
  | { type: 'evade'; f: FighterId }
  | { type: 'heal'; f: FighterId; amount: number }
  | { type: 'shield'; f: FighterId; amount: number }
  | { type: 'shieldBreak'; f: FighterId }
  | { type: 'status'; f: FighterId; status: StatusId; stacks: number }
  | { type: 'wallSplat'; f: FighterId; x: number }
  | { type: 'revive'; f: FighterId }
  | { type: 'lightning'; f: FighterId; x: number }
  | { type: 'reflect'; f: FighterId; x: number; y: number }
  | { type: 'shockwave'; x: number; radius: number; f: FighterId; style: 'slam' | 'nova' | 'meteor' | 'judgment' }
  | { type: 'projectileEnd'; id: number; x: number; y: number; style: ProjectileStyle; hit: boolean }
  | { type: 'blink'; f: FighterId; from: number; to: number }
  | { type: 'thought'; f: FighterId; text: string }
  | { type: 'plan'; f: FighterId; plan: string }
  | { type: 'ko'; f: FighterId }
  | { type: 'end'; winner: FighterId | -1; reason: 'ko' | 'time' };
