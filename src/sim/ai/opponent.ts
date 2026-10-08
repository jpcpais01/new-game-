import { lerp } from '../../core/math';
import { DT } from '../constants';
import type { Battle } from '../battle';
import type { Fighter } from '../fighter';
import type { Kit } from './kit';

type Reaction = 'guard' | 'evade' | 'trade' | 'none';

/**
 * What a fighter has learned about its opponent during this battle. Every
 * estimate is an exponential moving average, so it adapts if the opponent
 * changes its habits mid-fight.
 */
export class OpponentModel {
  /** How the enemy answers my telegraphed attacks. Sums to ~1. */
  guard = 0.2;
  evade = 0.15;
  trade = 0.2;
  none = 0.45;
  /** How the enemy answers projectiles in flight. */
  projDefend = 0.3;
  /** How often the enemy walks toward me. */
  aggro = 0.5;
  /** How often the enemy swings at air (attacks from out of range). */
  whiff = 0.15;
  /** How often the enemy attacks right after I finish an action (punishes recoveries). */
  punisher = 0.3;
  /** Typical distance the enemy keeps when free to move. */
  spacing = 4;
  /** Uses of each enemy ability. */
  uses: number[];

  private rate: number;
  private lastKey = -1;
  private watch: { key: number; reaction: Reaction } | null = null;
  private projWatch: { id: number; reacted: boolean } | null = null;
  private recoveryWatch = -1;
  private sampleT = 0;

  constructor(e: Fighter, adaptivity: number) {
    this.uses = e.abilities.map(() => 0);
    this.rate = 0.12 + adaptivity * 0.25;
  }

  get defends(): number {
    return this.guard + this.evade;
  }

  observe(b: Battle, me: Fighter, e: Fighter, ek: Kit, myKey: number, enemyKey: number): void {
    const rate = this.rate;
    const ea = e.action;
    const newEnemyAction = ea && enemyKey !== this.lastKey;
    const dist = Math.abs(e.x - me.x);

    if (newEnemyAction) {
      const info = ek.info[ea.ability];
      this.uses[ea.ability]++;
      if (info.offensive && !info.ranged && !ea.isCounter) {
        const out = dist > info.maxReach + 0.5;
        this.whiff = lerp(this.whiff, out ? 1 : 0, rate * 0.4);
      }
      if (this.recoveryWatch >= 0 && b.time - this.recoveryWatch < 0.45 && info.offensive) {
        this.punisher = lerp(this.punisher, 1, rate * 0.4);
        this.recoveryWatch = -1;
      }
      if (this.projWatch && info.defense) this.projWatch.reacted = true;
    }
    if (this.recoveryWatch >= 0 && b.time - this.recoveryWatch >= 0.45) {
      this.punisher = lerp(this.punisher, 0, rate * 0.25);
      this.recoveryWatch = -1;
    }

    // My telegraphed attack: how did they respond?
    const ma = me.action;
    const myOffense = ma && ma.phase === 'windup' && !ma.feint && me.abilities[ma.ability].power > 0;
    if (myOffense) {
      if (!this.watch || this.watch.key !== myKey) this.watch = { key: myKey, reaction: 'none' };
      if (newEnemyAction && this.watch.reaction === 'none') {
        const info = ek.info[ea.ability];
        if (info.defense === 'parry' || info.defense === 'armor') this.watch.reaction = 'guard';
        else if (info.defense) this.watch.reaction = 'evade';
        else if (info.offensive) this.watch.reaction = 'trade';
      }
    } else if (this.watch) {
      const r = this.watch.reaction;
      const k = rate * 0.6;
      this.guard = lerp(this.guard, r === 'guard' ? 1 : 0, k);
      this.evade = lerp(this.evade, r === 'evade' ? 1 : 0, k);
      this.trade = lerp(this.trade, r === 'trade' ? 1 : 0, k);
      this.none = lerp(this.none, r === 'none' ? 1 : 0, k);
      this.watch = null;
    }
    if (ma && ma.phase === 'recovery' && !ma.feint && this.recoveryWatch < 0 && me.abilities[ma.ability].power > 0) {
      this.recoveryWatch = b.time;
    }

    // My projectiles: do they answer them?
    let mine = -1;
    for (const p of b.projectiles) if (p.owner === me.id && p.style !== 'meteor') { mine = p.id; break; }
    if (this.projWatch && this.projWatch.id !== mine) {
      this.projDefend = lerp(this.projDefend, this.projWatch.reacted ? 1 : 0, rate * 0.5);
      this.projWatch = null;
    }
    if (mine >= 0 && !this.projWatch) this.projWatch = { id: mine, reacted: false };

    this.sampleT += DT;
    if (this.sampleT >= 0.5) {
      this.sampleT = 0;
      const toward = e.move !== 0 && Math.sign(e.move) === Math.sign(me.x - e.x) ? 1 : 0;
      this.aggro = lerp(this.aggro, toward, rate * 0.3);
      if (!ea) this.spacing = lerp(this.spacing, dist, rate * 0.2);
    }
    this.lastKey = enemyKey;
  }
}
