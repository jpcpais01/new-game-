export type FighterId = 0 | 1;
export type DamageType = 'physical' | 'magic' | 'true';
export type ClassId = 'vanguard' | 'ronin' | 'arcanist' | 'brute';

export type ItemId =
  | 'vampiric_fang' | 'thornmail' | 'phoenix_feather' | 'frost_core'
  | 'ember_brand' | 'storm_sigil' | 'berserker_mask' | 'aegis_charm'
  | 'hourglass' | 'venom_vial' | 'giants_belt' | 'swift_boots'
  | 'executioner' | 'mirror_ward' | 'echo_stone' | 'iron_will';

export type StatusId =
  | 'burn' | 'poison' | 'chill' | 'frozen' | 'stun'
  | 'rage' | 'haste' | 'mark' | 'ironskin' | 'vulnerable';

export type AnimKey =
  | 'slash' | 'thrust' | 'overhead' | 'bash' | 'spin' | 'cast' | 'castBig'
  | 'guard' | 'counter' | 'dash' | 'evade' | 'blink' | 'leap' | 'roar'
  | 'flurry' | 'slam';

export type ProjectileStyle = 'arcane' | 'hex' | 'wave' | 'groundwave' | 'meteor';

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
  dash?: { distance: number; through?: boolean; iframes: number; strike?: boolean };
  buff?: StatusApply[];
  heal?: number;
  /** Seconds of invulnerability starting with the active phase. */
  iframes?: number;
  /** Airborne during windup/active (leaps). */
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
