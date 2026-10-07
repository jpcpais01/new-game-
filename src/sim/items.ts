import type { ItemId, Stats } from './types';

export type ItemRarity = 'rare' | 'epic' | 'legendary';

export interface ItemDef {
  id: ItemId;
  name: string;
  rarity: ItemRarity;
  /** Hex colour for UI and renderer glow. */
  color: number;
  /** Short glyph for compact UI. */
  icon: string;
  desc: string;
  /** Flat additions. */
  add?: Partial<Stats>;
  /** Multipliers (applied after additions). */
  mul?: Partial<Stats>;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  vampiric_fang: {
    id: 'vampiric_fang', name: 'Vampiric Fang', rarity: 'epic', color: 0xff2e55, icon: '🦷',
    desc: 'Heal for 26% of damage dealt.', add: { lifesteal: 0.26 },
  },
  thornmail: {
    id: 'thornmail', name: 'Thornmail', rarity: 'epic', color: 0x58c46b, icon: '🌵',
    desc: '+25 armor. Reflect 25% of melee damage taken.', add: { armor: 25, thorns: 0.25 },
  },
  phoenix_feather: {
    id: 'phoenix_feather', name: 'Phoenix Feather', rarity: 'legendary', color: 0xff9a2e, icon: '🪶',
    desc: 'Once per battle, revive at 30% HP in a burst of flame.',
  },
  frost_core: {
    id: 'frost_core', name: 'Frost Core', rarity: 'rare', color: 0x7fe0ff, icon: '❄️',
    desc: 'Hits chill (−8% speed per stack). 5 stacks freeze solid.',
  },
  ember_brand: {
    id: 'ember_brand', name: 'Ember Brand', rarity: 'rare', color: 0xff6a1a, icon: '🔥',
    desc: '+5% damage. Hits ignite (stacking burn).', mul: { damageMult: 1.05 },
  },
  storm_sigil: {
    id: 'storm_sigil', name: 'Storm Sigil', rarity: 'epic', color: 0x9fd8ff, icon: '⚡',
    desc: 'Every 3rd hit calls lightning: bonus magic damage and a brief stun.',
  },
  berserker_mask: {
    id: 'berserker_mask', name: 'Berserker Mask', rarity: 'epic', color: 0xd12020, icon: '👹',
    desc: 'Up to +50% damage as HP drops. Faster attacks below 40% HP.',
  },
  aegis_charm: {
    id: 'aegis_charm', name: 'Aegis Charm', rarity: 'rare', color: 0xffe27a, icon: '🛡️',
    desc: 'Start with a 32% HP shield. Regain a 15% shield after 4s untouched.',
  },
  hourglass: {
    id: 'hourglass', name: 'Chrono Hourglass', rarity: 'epic', color: 0xc8a2ff, icon: '⌛',
    desc: '30% cooldown reduction, +60% energy regen, +10% attack speed.', add: { cdr: 0.3, energyRegen: 0.6 }, mul: { attackSpeed: 1.1 },
  },
  venom_vial: {
    id: 'venom_vial', name: 'Venom Vial', rarity: 'rare', color: 0x8cff3a, icon: '🧪',
    desc: 'Hits poison (stacks to 5). Poisoned enemies heal 40% less.',
  },
  giants_belt: {
    id: 'giants_belt', name: "Giant's Belt", rarity: 'rare', color: 0xb98a4a, icon: '🪢',
    desc: '+30% max HP, +10 armor, −8% move speed.',
    add: { armor: 10 }, mul: { maxHp: 1.3, moveSpeed: 0.92 },
  },
  swift_boots: {
    id: 'swift_boots', name: 'Zephyr Boots', rarity: 'rare', color: 0x5effc8, icon: '👢',
    desc: '+30% move speed, +18% attack speed, faster evades.',
    mul: { moveSpeed: 1.3, attackSpeed: 1.18 },
  },
  executioner: {
    id: 'executioner', name: "Executioner's Edge", rarity: 'epic', color: 0xe8e8e8, icon: '🗡️',
    desc: '+18% crit, +30% crit damage. Crits on targets under 30% HP deal +50%.',
    add: { critChance: 0.18, critMult: 0.3 },
  },
  mirror_ward: {
    id: 'mirror_ward', name: 'Mirror Ward', rarity: 'legendary', color: 0xaff6ff, icon: '🪞',
    desc: 'Every 4s, reflect the next projectile back at its caster.',
  },
  echo_stone: {
    id: 'echo_stone', name: 'Echo Stone', rarity: 'legendary', color: 0x6b8cff, icon: '🔮',
    desc: 'Hits have a 35% chance to echo for 60% damage a moment later.',
  },
  iron_will: {
    id: 'iron_will', name: 'Iron Will', rarity: 'rare', color: 0xa0a8b8, icon: '⛓️',
    desc: '+20 resist, 35% tenacity. Every 10s, shrug off a stun.',
    add: { resist: 20, tenacity: 0.35 },
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const MAX_ITEMS = 3;
