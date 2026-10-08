import { describe, expect, it } from 'vitest';
import { GEAR } from '../../sim/gear';
import type { GearSet } from '../../sim/types';
import { handPlan } from './look';

const MAINS = Object.keys(GEAR.main) as GearSet['main'][];
const DEFENSES = [undefined, ...Object.keys(GEAR.defense)] as GearSet['defense'][];
const OFFHANDS = [undefined, ...Object.keys(GEAR.offhand)] as GearSet['offhand'][];

describe('handPlan', () => {
  it('gives every combination one owner for the left hand and only draws what is equipped', () => {
    for (const main of MAINS) for (const defense of DEFENSES) for (const offhand of OFFHANDS) {
      const gear = { main, defense, offhand } as GearSet;
      const p = handPlan(gear);
      const grip = GEAR.main[main]!.weapon?.grip;
      if (grip === 'bow') expect(p.left).toBe('bow');
      if (p.shield === 'arm') expect(p.twoHanded).toBe(false);
      const abilities = new Set([...(offhand ? GEAR.offhand[offhand]!.abilities ?? [] : []), ...(defense ? GEAR.defense[defense]!.abilities ?? [] : [])].map((a) => a.id));
      for (const [id, d] of Object.entries(p.draws)) {
        expect(abilities.has(id)).toBe(true);
        // A bow never leaves the left hand: its archer uses the right.
        if (p.left === 'bow') expect(d.hand).toBe('R');
        if (d.item === 'parry') expect(['bow', 'shield', 'grip']).not.toContain(p.left);
      }
    }
  });

  it('lets the secondary take the left hand over the parrying blade, which comes out for its counter', () => {
    const p = handPlan({ main: 'longsword', defense: 'parrying_blade', offhand: 'hand_crossbow' } as GearSet);
    expect(p.left).toBe('xbow');
    expect(p.draws.crossbow_bolt).toEqual({ item: 'xbow', hand: 'L' });
    expect(p.draws.counter).toEqual({ item: 'parry', hand: 'L' });
  });

  it('has an archer shoot the crossbow with the right hand', () => {
    const p = handPlan({ main: 'longbow', offhand: 'hand_crossbow' } as GearSet);
    expect(p.left).toBe('bow');
    expect(p.draws.crossbow_bolt).toEqual({ item: 'xbow', hand: 'R' });
  });

  it('straps a shield on the arm and wields a spear one-handed', () => {
    const p = handPlan({ main: 'spear', defense: 'tower_shield', offhand: 'throwing_knives' } as GearSet);
    expect(p).toMatchObject({ left: 'shield', shield: 'arm', twoHanded: false });
    expect(p.draws.knife_toss).toEqual({ item: 'knives', hand: 'L' });
  });
});
