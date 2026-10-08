import { EVADE } from './abilities';
import type { AbilityDef, GearId, GearSlot, GearSlotIds, Stats } from './types';

/**
 * Gear catalog. Six slots, and everything a fighter can do comes from here:
 *  - main weapon: basic attack + weapon skill, and the fighting distance
 *  - offhand (secondary weapon): one more skill
 *  - defense: the defensive answer (guard, parry, blink, armor...) + mitigation
 *  - head: passive stats and effects
 *  - boots: movement and the evade itself
 *  - special: either an ultimate or a game-changing passive
 *
 * Passive effects are implemented in the sim by checking `fighter.has.has(id)`.
 */

export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** How the main weapon is held; drives stance and animation in the renderer. */
export type Grip = 'oneHand' | 'twoHand' | 'polearm' | 'dual' | 'staff' | 'bow';

/** Coarse descriptors the AI and UI can reason about without knowing every id. */
export type GearTag =
  | 'melee' | 'ranged' | 'physical' | 'magic' | 'heavy' | 'fast' | 'mobility'
  | 'guard' | 'parry' | 'reflect' | 'sustain' | 'burst' | 'control' | 'dot' | 'tank' | 'crit' | 'revive';

export interface WeaponInfo {
  grip: Grip;
  /** Fights from range (kites) instead of trading up close. */
  ranged: boolean;
  /** Ideal fighting distance, centre to centre. */
  preferredRange: number;
}

export interface GearDef<S extends GearSlot = GearSlot> {
  id: GearSlotIds[S];
  slot: S;
  name: string;
  rarity: ItemRarity;
  /** Hex colour for UI, icon tint and renderer glow. */
  color: number;
  /** Placeholder glyph until the icon set lands. */
  icon: string;
  desc: string;
  /** Short name of the passive effect, if any (described in `desc`). */
  passive?: string;
  /** Flat additions. */
  add?: Partial<Stats>;
  /** Multipliers (applied after all additions). */
  mul?: Partial<Stats>;
  /** Abilities this piece grants, in order. */
  abilities?: AbilityDef[];
  /** Boots only: replaces the default evade. */
  evade?: AbilityDef;
  /** Main weapon only. */
  weapon?: WeaponInfo;
  tags: GearTag[];
}

type Catalog = { [S in GearSlot]: { [K in GearSlotIds[S]]: GearDef<S> } };

// -----------------------------------------------------------------------------
// Main weapons
// -----------------------------------------------------------------------------

const MAIN: Catalog['main'] = {
  longsword: {
    id: 'longsword', slot: 'main', name: 'Longsword', rarity: 'common', color: 0xd8e2f0, icon: '🗡️',
    desc: 'Dependable steel. Quick cuts and a telegraphed heavy cleave that launches.',
    weapon: { grip: 'oneHand', ranged: false, preferredRange: 1.75 },
    tags: ['melee', 'physical'],
    abilities: [
      {
        id: 'slash', name: 'Slash', slot: 'basic', kind: 'melee',
        range: 1.95, cost: 0, cooldown: 0.15,
        windup: 0.22, active: 0.1, recovery: 0.3,
        power: 1.32, damageType: 'physical', stagger: 0.22, knockback: 1.2, lunge: 0.3,
        anim: 'slash', desc: 'Reliable sword cut.',
      },
      {
        id: 'rising_cleave', name: 'Rising Cleave', slot: 'skill', kind: 'melee',
        range: 2.25, cost: 15, cooldown: 6,
        windup: 0.58, active: 0.14, recovery: 0.48,
        power: 2.8, damageType: 'physical', heavy: true, knockback: 8, lunge: 0.9, stagger: 0.5,
        anim: 'overhead', desc: 'Telegraphed heavy cleave with big knockback.',
      },
    ],
  },
  katana: {
    id: 'katana', slot: 'main', name: 'Katana', rarity: 'rare', color: 0xf5f0e6, icon: '⚔️',
    desc: '+8% crit. Lightning-fast cuts and a dash that slices straight through.',
    add: { critChance: 0.08 },
    weapon: { grip: 'oneHand', ranged: false, preferredRange: 1.7 },
    tags: ['melee', 'physical', 'fast', 'crit', 'mobility'],
    abilities: [
      {
        id: 'swift_cut', name: 'Swift Cut', slot: 'basic', kind: 'melee',
        range: 1.85, cost: 0, cooldown: 0.1,
        windup: 0.15, active: 0.08, recovery: 0.22,
        power: 0.7, damageType: 'physical', stagger: 0.18, knockback: 0.8, lunge: 0.35,
        anim: 'slash', desc: 'Lightning-fast katana cut.',
      },
      {
        id: 'iaido', name: 'Iaido Dash', slot: 'skill', kind: 'dash',
        range: 4.4, cost: 15, cooldown: 6,
        windup: 0.3, active: 0.18, recovery: 0.32,
        power: 1.7, damageType: 'physical', heavy: true,
        dash: { distance: 5.2, through: true, iframes: 0.18, strike: true },
        stagger: 0.4,
        anim: 'dash', desc: 'Dash straight through the enemy with a drawn cut.',
      },
    ],
  },
  warhammer: {
    id: 'warhammer', slot: 'main', name: 'Warhammer', rarity: 'rare', color: 0xff8a2a, icon: '🔨',
    desc: '+0.06 poise. Slow, crushing swings that can\'t be interrupted, and an unblockable ground shockwave.',
    add: { poise: 0.06 },
    weapon: { grip: 'twoHand', ranged: false, preferredRange: 1.9 },
    tags: ['melee', 'physical', 'heavy', 'control'],
    abilities: [
      {
        id: 'hammer', name: 'Hammer Swing', slot: 'basic', kind: 'melee',
        range: 2.05, cost: 0, cooldown: 0.2,
        windup: 0.4, active: 0.12, recovery: 0.42,
        power: 1.7, damageType: 'physical', stagger: 0.38, knockback: 3.5, lunge: 0.35, hyperArmor: true,
        anim: 'slash', desc: 'Heavy swing with hyper armor.',
      },
      {
        id: 'ground_slam', name: 'Ground Slam', slot: 'skill', kind: 'projectile',
        range: 9, cost: 15, cooldown: 7,
        windup: 0.5, active: 0.1, recovery: 0.4,
        power: 1.6, damageType: 'physical', heavy: true, stun: 0.6, unblockable: true,
        projectile: { speed: 11, radius: 0.6, style: 'groundwave', ground: true },
        anim: 'slam', desc: 'Sends an unblockable shockwave along the ground.',
      },
    ],
  },
  spear: {
    id: 'spear', slot: 'main', name: 'War Spear', rarity: 'rare', color: 0xc9d27a, icon: '🔱',
    desc: 'The longest melee reach. Keeps enemies at the tip, then skewers them across the arena.',
    weapon: { grip: 'polearm', ranged: false, preferredRange: 2.2 },
    tags: ['melee', 'physical', 'control'],
    abilities: [
      {
        id: 'thrust', name: 'Thrust', slot: 'basic', kind: 'melee',
        range: 2.55, cost: 0, cooldown: 0.15,
        windup: 0.24, active: 0.1, recovery: 0.3,
        power: 1.22, damageType: 'physical', stagger: 0.2, knockback: 1.6, lunge: 0.35,
        anim: 'thrust', desc: 'Long-reaching jab.',
      },
      {
        id: 'skewer', name: 'Skewering Lunge', slot: 'skill', kind: 'melee',
        range: 2.6, cost: 15, cooldown: 6.5,
        windup: 0.42, active: 0.14, recovery: 0.45,
        power: 2.5, damageType: 'physical', heavy: true, knockback: 6.5, lunge: 1.8, stagger: 0.45,
        anim: 'thrust', desc: 'Covers ground in one lunge and drives the enemy back.',
      },
    ],
  },
  twin_daggers: {
    id: 'twin_daggers', slot: 'main', name: 'Twin Daggers', rarity: 'epic', color: 0x8cff3a, icon: '🔪',
    desc: '+5% crit, +5% attack speed. Every cut poisons; the flurry stacks venom fast.',
    add: { critChance: 0.05 }, mul: { attackSpeed: 1.05 },
    weapon: { grip: 'dual', ranged: false, preferredRange: 1.5 },
    tags: ['melee', 'physical', 'fast', 'dot'],
    abilities: [
      {
        id: 'twin_slash', name: 'Twin Slash', slot: 'basic', kind: 'melee',
        range: 1.7, cost: 0, cooldown: 0.12,
        windup: 0.14, active: 0.12, recovery: 0.24,
        power: 0.33, damageType: 'physical', hits: 2, stagger: 0.14, knockback: 0.6, lunge: 0.3,
        applies: [{ status: 'poison', duration: 3 }],
        anim: 'slash', desc: 'Two quick cuts that poison.',
      },
      {
        id: 'venom_flurry', name: 'Venom Flurry', slot: 'skill', kind: 'melee',
        range: 1.9, cost: 15, cooldown: 7,
        windup: 0.22, active: 0.4, recovery: 0.36,
        power: 0.4, damageType: 'physical', hits: 4, stagger: 0.2, knockback: 0.5, lunge: 0.8,
        applies: [{ status: 'poison', duration: 4 }],
        anim: 'flurry', desc: 'Four-hit flurry that piles on poison.',
      },
    ],
  },
  arcane_staff: {
    id: 'arcane_staff', slot: 'main', name: 'Arcane Staff', rarity: 'epic', color: 0x9b5cff, icon: '🪄',
    desc: 'Magic from range: steady bolts and a slow cursed orb that marks and burns.',
    weapon: { grip: 'staff', ranged: true, preferredRange: 6.5 },
    tags: ['ranged', 'magic', 'dot'],
    abilities: [
      {
        id: 'arcane_bolt', name: 'Arcane Bolt', slot: 'basic', kind: 'projectile',
        range: 11, cost: 0, cooldown: 0.35,
        windup: 0.28, active: 0.05, recovery: 0.28,
        power: 0.8, damageType: 'magic', stagger: 0.15,
        projectile: { speed: 17, radius: 0.32, style: 'arcane' },
        anim: 'cast', desc: 'Quick arcane missile.',
      },
      {
        id: 'hex_orb', name: 'Hex Orb', slot: 'skill', kind: 'projectile',
        range: 11, cost: 20, cooldown: 8,
        windup: 0.4, active: 0.05, recovery: 0.32,
        power: 1.4, damageType: 'magic', stagger: 0.3,
        applies: [{ status: 'mark', duration: 4 }, { status: 'burn', duration: 3, stacks: 2 }],
        projectile: { speed: 8, radius: 0.55, style: 'hex' },
        anim: 'cast', desc: 'Slow cursed orb: marks (+15% damage taken) and burns.',
      },
    ],
  },
  longbow: {
    id: 'longbow', slot: 'main', name: 'Longbow', rarity: 'rare', color: 0xb98a4a, icon: '🏹',
    desc: 'Physical damage from range. Fast arrows and a heavy power shot that marks and knocks back.',
    weapon: { grip: 'bow', ranged: true, preferredRange: 7 },
    tags: ['ranged', 'physical'],
    abilities: [
      {
        id: 'arrow', name: 'Arrow', slot: 'basic', kind: 'projectile',
        range: 12, cost: 0, cooldown: 0.3,
        windup: 0.32, active: 0.05, recovery: 0.3,
        power: 0.88, damageType: 'physical', stagger: 0.15,
        projectile: { speed: 22, radius: 0.25, style: 'arrow' },
        anim: 'shoot', desc: 'Fast arrow.',
      },
      {
        id: 'power_shot', name: 'Power Shot', slot: 'skill', kind: 'projectile',
        range: 12, cost: 15, cooldown: 6.5,
        windup: 0.55, active: 0.05, recovery: 0.36,
        power: 1.9, damageType: 'physical', heavy: true, knockback: 5, stagger: 0.4,
        applies: [{ status: 'mark', duration: 4 }],
        projectile: { speed: 26, radius: 0.32, style: 'arrow' },
        anim: 'shoot', desc: 'Fully drawn shot: heavy hit, knockback and a mark.',
      },
    ],
  },
};

// -----------------------------------------------------------------------------
// Secondary weapons
// -----------------------------------------------------------------------------

const OFFHAND: Catalog['offhand'] = {
  throwing_knives: {
    id: 'throwing_knives', slot: 'offhand', name: 'Throwing Knives', rarity: 'common', color: 0xcfd6e0, icon: '🗡',
    desc: 'A cheap, fast knife toss to poke, interrupt or finish.',
    tags: ['ranged', 'physical', 'fast'],
    abilities: [{
      id: 'knife_toss', name: 'Knife Toss', slot: 'skill', kind: 'projectile',
      range: 9, cost: 5, cooldown: 3,
      windup: 0.16, active: 0.05, recovery: 0.22,
      power: 0.55, damageType: 'physical', stagger: 0.12,
      projectile: { speed: 20, radius: 0.25, style: 'knife' },
      anim: 'throw', desc: 'Quick thrown knife.',
    }],
  },
  hand_crossbow: {
    id: 'hand_crossbow', slot: 'offhand', name: 'Hand Crossbow', rarity: 'rare', color: 0x8a6a4a, icon: '🎯',
    desc: 'A hard-hitting bolt that marks the target (+15% damage taken).',
    tags: ['ranged', 'physical'],
    abilities: [{
      id: 'crossbow_bolt', name: 'Crossbow Bolt', slot: 'skill', kind: 'projectile',
      range: 11, cost: 10, cooldown: 5,
      windup: 0.3, active: 0.05, recovery: 0.28,
      power: 1.15, damageType: 'physical', stagger: 0.25,
      applies: [{ status: 'mark', duration: 3 }],
      projectile: { speed: 24, radius: 0.28, style: 'bolt' },
      anim: 'shoot', desc: 'Bolt that marks.',
    }],
  },
  wind_chakram: {
    id: 'wind_chakram', slot: 'offhand', name: 'Wind Chakram', rarity: 'rare', color: 0xfff0f0, icon: '🌀',
    desc: 'Throws a wide blade of wind.',
    tags: ['ranged', 'physical'],
    abilities: [{
      id: 'crescent', name: 'Crescent Wave', slot: 'skill', kind: 'projectile',
      range: 10, cost: 10, cooldown: 5,
      windup: 0.24, active: 0.06, recovery: 0.3,
      power: 1.0, damageType: 'physical', stagger: 0.2,
      projectile: { speed: 15, radius: 0.5, style: 'wave' },
      anim: 'spin', desc: 'Throws a blade of wind.',
    }],
  },
  frost_orb: {
    id: 'frost_orb', slot: 'offhand', name: 'Frost Orb', rarity: 'epic', color: 0x7fe0ff, icon: '🔵',
    desc: 'Burst of frost around you: chills and repels anyone too close.',
    tags: ['magic', 'control'],
    abilities: [{
      id: 'frost_nova', name: 'Frost Nova', slot: 'skill', kind: 'aoe',
      range: 2.5, cost: 15, cooldown: 7,
      windup: 0.3, active: 0.1, recovery: 0.36,
      power: 0.95, damageType: 'magic', knockback: 7,
      applies: [{ status: 'chill', duration: 3, stacks: 2 }],
      anim: 'castBig', desc: 'Burst of frost around you. Chills and repels.',
    }],
  },
  iron_gauntlet: {
    id: 'iron_gauntlet', slot: 'offhand', name: 'Iron Gauntlet', rarity: 'rare', color: 0xa0a8b8, icon: '🥊',
    desc: 'A fast bash that stuns: the answer to anyone winding up.',
    tags: ['melee', 'physical', 'control'],
    abilities: [{
      id: 'gauntlet_bash', name: 'Gauntlet Bash', slot: 'skill', kind: 'melee',
      range: 1.7, cost: 10, cooldown: 7,
      windup: 0.2, active: 0.1, recovery: 0.38,
      power: 0.65, damageType: 'physical', stun: 0.9, knockback: 4.5, lunge: 0.5,
      anim: 'bash', desc: 'Fast bash that stuns.',
    }],
  },
  war_horn: {
    id: 'war_horn', slot: 'offhand', name: 'War Horn', rarity: 'epic', color: 0xd12020, icon: '📯',
    desc: 'Sound the horn: enrage (+25% damage, +15% speed) and heal a little.',
    tags: ['sustain', 'burst'],
    abilities: [{
      id: 'war_cry', name: 'War Cry', slot: 'skill', kind: 'buff',
      range: 0, cost: 20, cooldown: 14,
      windup: 0.36, active: 0.1, recovery: 0.3,
      power: 0, damageType: 'physical', heal: 0.06,
      buff: [{ status: 'rage', duration: 6 }],
      anim: 'roar', desc: 'Enrage (+25% damage, +15% speed) and heal.',
    }],
  },
};

// -----------------------------------------------------------------------------
// Defensive gear
// -----------------------------------------------------------------------------

const DEFENSE: Catalog['defense'] = {
  tower_shield: {
    id: 'tower_shield', slot: 'defense', name: 'Tower Shield', rarity: 'rare', color: 0x3d7bff, icon: '🛡️',
    desc: '+15 armor. Raise the shield to block 80%; perfect timing parries and reflects projectiles.',
    add: { armor: 15, poise: 0.04 },
    tags: ['guard', 'parry', 'reflect', 'tank'],
    abilities: [{
      id: 'bulwark', name: 'Bulwark', slot: 'defense', kind: 'guard',
      range: 0, cost: 0, cooldown: 4,
      windup: 0.05, active: 1.1, recovery: 0.2,
      power: 0, damageType: 'physical',
      guard: { reduction: 0.8, parryWindow: 0.22, reflectProjectiles: true },
      anim: 'guard', desc: 'Raise the shield. Perfect timing parries and reflects projectiles.',
    }],
  },
  parrying_blade: {
    id: 'parrying_blade', slot: 'defense', name: 'Parrying Blade', rarity: 'epic', color: 0xe0404a, icon: '🤺',
    desc: '+4% crit. A wide parry window; a parry triggers an instant riposte.',
    add: { critChance: 0.04 },
    tags: ['parry', 'burst'],
    abilities: [{
      id: 'counter', name: 'Counter Stance', slot: 'defense', kind: 'guard',
      range: 0, cost: 0, cooldown: 4.5,
      windup: 0.04, active: 0.75, recovery: 0.28,
      power: 0, damageType: 'physical',
      guard: { reduction: 0.35, parryWindow: 0.5, counterPower: 2.2 },
      anim: 'counter', desc: 'Wide parry window; a parry triggers an instant riposte.',
    }],
  },
  plate_armor: {
    id: 'plate_armor', slot: 'defense', name: 'Plate Armor', rarity: 'rare', color: 0x8c96a8, icon: '🦺',
    desc: '+28 armor, −5% move speed. Harden: 50% damage reduction and unstoppable for 2.4s.',
    add: { armor: 28 }, mul: { moveSpeed: 0.95 },
    tags: ['tank'],
    abilities: [{
      id: 'iron_skin', name: 'Iron Skin', slot: 'defense', kind: 'buff',
      range: 0, cost: 0, cooldown: 9,
      windup: 0.06, active: 0.06, recovery: 0.08,
      power: 0, damageType: 'physical',
      buff: [{ status: 'ironskin', duration: 2.4 }],
      anim: 'roar', desc: 'Harden: 50% damage reduction and unstoppable for 2.4s.',
    }],
  },
  phase_cloak: {
    id: 'phase_cloak', slot: 'defense', name: 'Phase Cloak', rarity: 'epic', color: 0x6ff3ff, icon: '🧥',
    desc: '+22 resist. Teleport away; when cornered, blink behind the enemy.',
    add: { resist: 22 },
    tags: ['mobility'],
    abilities: [{
      id: 'blink', name: 'Blink', slot: 'defense', kind: 'blink',
      range: 0, cost: 0, cooldown: 4.5,
      windup: 0.04, active: 0.08, recovery: 0.16,
      power: 0, damageType: 'magic', iframes: 0.25,
      dash: { distance: 4.6, iframes: 0.25 },
      anim: 'blink', desc: 'Teleport away. When cornered, blinks behind the enemy.',
    }],
  },
  thornmail: {
    id: 'thornmail', slot: 'defense', name: 'Thornmail', rarity: 'epic', color: 0x58c46b, icon: '🌵',
    desc: '+18 armor. Reflect 25% of melee damage taken. Brace to block 60%.',
    passive: 'Thorns',
    add: { armor: 18, thorns: 0.25 },
    tags: ['guard', 'tank'],
    abilities: [{
      id: 'brace', name: 'Brace', slot: 'defense', kind: 'guard',
      range: 0, cost: 0, cooldown: 4.5,
      windup: 0.05, active: 0.9, recovery: 0.2,
      power: 0, damageType: 'physical',
      guard: { reduction: 0.6, parryWindow: 0.16 },
      anim: 'guard', desc: 'Brace behind the spikes to block 60%.',
    }],
  },
  mirror_aegis: {
    id: 'mirror_aegis', slot: 'defense', name: 'Mirror Aegis', rarity: 'legendary', color: 0xaff6ff, icon: '🪞',
    desc: '+10 resist. Every 6s, reflects the next projectile back. Barrier: gain a 12% HP shield.',
    passive: 'Mirror',
    add: { resist: 10 },
    tags: ['reflect', 'sustain'],
    abilities: [{
      id: 'barrier', name: 'Barrier', slot: 'defense', kind: 'buff',
      range: 0, cost: 0, cooldown: 12,
      windup: 0.12, active: 0.06, recovery: 0.14,
      power: 0, damageType: 'magic', shieldGain: 0.12,
      anim: 'guard', desc: 'Gain a shield worth 12% of max HP.',
    }],
  },
};

// -----------------------------------------------------------------------------
// Head
// -----------------------------------------------------------------------------

const HEAD: Catalog['head'] = {
  berserker_mask: {
    id: 'berserker_mask', slot: 'head', name: 'Berserker Mask', rarity: 'epic', color: 0xd12020, icon: '👹',
    desc: 'Up to +50% damage as HP drops. Faster attacks below 40% HP.',
    passive: 'Berserk',
    tags: ['burst'],
  },
  iron_helm: {
    id: 'iron_helm', slot: 'head', name: 'Iron Helm', rarity: 'rare', color: 0xa0a8b8, icon: '⛑️',
    desc: '+15 resist, +6 armor, 35% tenacity. Every 10s, shrug off a stun.',
    passive: 'Iron Will',
    add: { resist: 15, armor: 6, tenacity: 0.35 },
    tags: ['tank'],
  },
  chrono_circlet: {
    id: 'chrono_circlet', slot: 'head', name: 'Chrono Circlet', rarity: 'epic', color: 0xc8a2ff, icon: '⌛',
    desc: '30% cooldown reduction, +50% energy regen, +6% attack speed.',
    add: { cdr: 0.3, energyRegen: 0.5 }, mul: { attackSpeed: 1.06 },
    tags: ['fast'],
  },
  executioner_hood: {
    id: 'executioner_hood', slot: 'head', name: "Executioner's Hood", rarity: 'epic', color: 0x3a3a46, icon: '🎭',
    desc: '+15% crit, +30% crit damage. Crits on targets under 30% HP deal +50%.',
    passive: 'Execute',
    add: { critChance: 0.15, critMult: 0.3 },
    tags: ['crit', 'burst'],
  },
  storm_crown: {
    id: 'storm_crown', slot: 'head', name: 'Storm Crown', rarity: 'epic', color: 0x9fd8ff, icon: '👑',
    desc: 'Every 4th hit calls lightning: bonus magic damage and a brief stun.',
    passive: 'Storm',
    tags: ['magic', 'control'],
  },
  duelist_band: {
    id: 'duelist_band', slot: 'head', name: "Duelist's Band", rarity: 'rare', color: 0xf3c24f, icon: '🎗️',
    desc: '+8 armor, +8% attack speed. Parry windows 40% wider; parries restore 10 extra energy.',
    passive: 'Duelist',
    add: { armor: 8 }, mul: { attackSpeed: 1.08 },
    tags: ['parry'],
  },
};

// -----------------------------------------------------------------------------
// Boots (each pair defines the evade)
// -----------------------------------------------------------------------------

const BOOTS: Catalog['boots'] = {
  leather_boots: {
    id: 'leather_boots', slot: 'boots', name: 'Leather Boots', rarity: 'common', color: 0x8a5a2b, icon: '🥾',
    desc: '+6% move speed. Light backstep evade with a shorter cooldown.',
    mul: { moveSpeed: 1.06 },
    tags: [],
    evade: { ...EVADE, cooldown: 3.1 },
  },
  zephyr_boots: {
    id: 'zephyr_boots', slot: 'boots', name: 'Zephyr Boots', rarity: 'rare', color: 0x5effc8, icon: '👢',
    desc: '+25% move speed, +10% attack speed. Longer evade with a much shorter cooldown.',
    mul: { moveSpeed: 1.25, attackSpeed: 1.1 },
    tags: ['fast', 'mobility'],
    evade: { ...EVADE, id: 'zephyr_step', name: 'Zephyr Step', cooldown: 2.3, dash: { distance: 3.1, iframes: 0.3 }, desc: 'Fast backstep with a short cooldown.' },
  },
  iron_greaves: {
    id: 'iron_greaves', slot: 'boots', name: 'Iron Greaves', rarity: 'rare', color: 0x6a7080, icon: '🦿',
    desc: '+12 armor, +8 resist, +0.08 poise, 40% less knockback, −5% move. Short, slow evade.',
    add: { armor: 12, resist: 8, poise: 0.08 }, mul: { knockbackTaken: 0.6, moveSpeed: 0.95 },
    tags: ['tank'],
    evade: { ...EVADE, id: 'sidestep', name: 'Sidestep', cooldown: 4.2, dash: { distance: 2.0, iframes: 0.26 }, desc: 'Short, heavy sidestep.' },
  },
  shadow_treads: {
    id: 'shadow_treads', slot: 'boots', name: 'Shadow Treads', rarity: 'epic', color: 0x4a3a7a, icon: '🌑',
    desc: '+5% crit, +8% move speed. Evade rolls through the enemy when close, with longer invulnerability.',
    add: { critChance: 0.05 }, mul: { moveSpeed: 1.08 },
    tags: ['mobility'],
    evade: { ...EVADE, id: 'shadow_roll', name: 'Shadow Roll', cooldown: 4, dash: { distance: 3.4, iframes: 0.38, through: true }, desc: 'Rolls through the enemy to get behind them.' },
  },
  colossus_boots: {
    id: 'colossus_boots', slot: 'boots', name: 'Colossus Boots', rarity: 'rare', color: 0xb98a4a, icon: '🪨',
    desc: '+18% max HP, −8% move speed. Standard evade.',
    mul: { maxHp: 1.18, moveSpeed: 0.92 },
    tags: ['tank'],
    evade: EVADE,
  },
  leaping_boots: {
    id: 'leaping_boots', slot: 'boots', name: 'Leaping Boots', rarity: 'epic', color: 0xffd36b, icon: '🦘',
    desc: '+5% move speed. Evade is a long backward leap that clears ground waves.',
    mul: { moveSpeed: 1.05 },
    tags: ['mobility'],
    evade: { ...EVADE, id: 'back_leap', name: 'Back Leap', cooldown: 4.2, active: 0.34, airborne: true, dash: { distance: 3.8, iframes: 0.34 }, desc: 'Long backward leap.' },
  },
};

// -----------------------------------------------------------------------------
// Specials: an ultimate or a game-changing passive
// -----------------------------------------------------------------------------

const SPECIAL: Catalog['special'] = {
  meteor_sigil: {
    id: 'meteor_sigil', slot: 'special', name: 'Meteor Sigil', rarity: 'legendary', color: 0xff6a1a, icon: '☄️',
    desc: 'Ultimate: calls a meteor on the predicted enemy position. Burns and stuns.',
    tags: ['magic', 'burst', 'ranged'],
    abilities: [{
      id: 'meteor', name: 'Meteor', slot: 'ultimate', kind: 'meteor',
      range: 14, cost: 100, cooldown: 10,
      windup: 0.8, active: 0.1, recovery: 0.45,
      power: 5.4, damageType: 'magic', heavy: true, knockback: 6, stun: 0.5,
      applies: [{ status: 'burn', duration: 4, stacks: 3 }],
      projectile: { speed: 14, radius: 2.1, style: 'meteor' },
      anim: 'castBig', desc: 'Calls a meteor on the predicted enemy position.',
    }],
  },
  judgment_relic: {
    id: 'judgment_relic', slot: 'special', name: 'Relic of Judgment', rarity: 'legendary', color: 0xffe08a, icon: '✨',
    desc: 'Ultimate: a leaping holy slam. Unblockable, stuns.',
    tags: ['melee', 'burst', 'control'],
    abilities: [{
      id: 'judgment', name: 'Judgment', slot: 'ultimate', kind: 'aoe',
      range: 2.7, cost: 100, cooldown: 10,
      windup: 0.55, active: 0.18, recovery: 0.7,
      power: 5.4, damageType: 'physical', heavy: true, unblockable: true, knockback: 10, lunge: 2.2,
      airborne: true, stun: 0.6,
      anim: 'leap', desc: 'Leaping holy slam. Unblockable.',
    }],
  },
  phantom_blade: {
    id: 'phantom_blade', slot: 'special', name: 'Phantom Blade', rarity: 'legendary', color: 0xb0c8ff, icon: '👻',
    desc: 'Ultimate: an eight-hit flurry with hyper armor.',
    tags: ['melee', 'burst'],
    abilities: [{
      id: 'thousand_cuts', name: 'Thousand Cuts', slot: 'ultimate', kind: 'melee',
      range: 2.6, cost: 100, cooldown: 10,
      windup: 0.3, active: 0.95, recovery: 0.5,
      power: 0.7, damageType: 'physical', hits: 8, lunge: 1.4, stagger: 0.25, knockback: 0.5,
      heavy: true, hyperArmor: true,
      anim: 'flurry', desc: 'Eight-hit flurry with hyper armor.',
    }],
  },
  earth_heart: {
    id: 'earth_heart', slot: 'special', name: 'Heart of the Mountain', rarity: 'legendary', color: 0xc07a3a, icon: '⛰️',
    desc: 'Ultimate: a leaping slam that shatters the ground. Unblockable, long stun.',
    tags: ['melee', 'burst', 'control', 'heavy'],
    abilities: [{
      id: 'earthshatter', name: 'Earthshatter', slot: 'ultimate', kind: 'aoe',
      range: 3.3, cost: 100, cooldown: 10,
      windup: 0.6, active: 0.18, recovery: 0.75,
      power: 5.0, damageType: 'physical', heavy: true, unblockable: true, stun: 1.2, knockback: 6,
      lunge: 2.0, airborne: true, hyperArmor: true,
      anim: 'leap', desc: 'Leaping slam that shatters the ground. Unblockable, long stun.',
    }],
  },
  phoenix_feather: {
    id: 'phoenix_feather', slot: 'special', name: 'Phoenix Feather', rarity: 'legendary', color: 0xff9a2e, icon: '🪶',
    desc: 'Once per battle, revive at 25% HP in a burst of flame.',
    passive: 'Rebirth',
    tags: ['revive'],
  },
  echo_stone: {
    id: 'echo_stone', slot: 'special', name: 'Echo Stone', rarity: 'legendary', color: 0x6b8cff, icon: '🔮',
    desc: 'Hits have a 35% chance to echo for 60% damage a moment later.',
    passive: 'Echo',
    tags: ['burst'],
  },
  vampiric_fang: {
    id: 'vampiric_fang', slot: 'special', name: 'Vampiric Fang', rarity: 'epic', color: 0xff2e55, icon: '🦷',
    desc: 'Heal for 24% of damage dealt.',
    passive: 'Lifesteal',
    add: { lifesteal: 0.24 },
    tags: ['sustain'],
  },
  ember_core: {
    id: 'ember_core', slot: 'special', name: 'Ember Core', rarity: 'epic', color: 0xff6a1a, icon: '🔥',
    desc: 'Hits ignite (stacking burn).',
    passive: 'Ignite',
    tags: ['dot', 'magic'],
  },
  frost_core: {
    id: 'frost_core', slot: 'special', name: 'Frost Core', rarity: 'epic', color: 0x7fe0ff, icon: '❄️',
    desc: 'Hits have a 50% chance to chill (−8% speed per stack). 5 stacks freeze solid.',
    passive: 'Chill',
    tags: ['control', 'magic'],
  },
};

export const GEAR: Catalog = {
  main: MAIN, offhand: OFFHAND, defense: DEFENSE, head: HEAD, boots: BOOTS, special: SPECIAL,
};

export const GEAR_SLOTS: GearSlot[] = ['main', 'offhand', 'defense', 'head', 'boots', 'special'];

export const SLOT_NAMES: Record<GearSlot, string> = {
  main: 'Main weapon', offhand: 'Secondary', defense: 'Defensive', head: 'Head', boots: 'Boots', special: 'Special',
};

/** Every gear piece, keyed by id. */
export const GEAR_BY_ID = Object.fromEntries(
  GEAR_SLOTS.flatMap((s) => Object.values(GEAR[s]) as GearDef[]).map((g) => [g.id, g]),
) as Record<GearId, GearDef>;

export function gearOf(id: GearId): GearDef {
  return GEAR_BY_ID[id];
}

export function gearIdsFor<S extends GearSlot>(slot: S): GearSlotIds[S][] {
  return Object.keys(GEAR[slot]) as GearSlotIds[S][];
}
