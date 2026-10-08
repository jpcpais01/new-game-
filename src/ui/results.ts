import type { Battle } from '../sim/battle';
import type { FighterTotals } from '../sim/types';
import { h } from './dom';
import { icon } from './icons';
import { scoreLine } from './online';

export interface ResultsCallbacks {
  onRematch(): void;
  onReplay(): void;
  onLoadout(): void;
  /** Online: ready for the next round. */
  onNextRound(): void;
  /** Online: ask the rival for another match. */
  onAskRematch(): void;
  onLeaveMatch(): void;
}

/** How an online round stands, from the host's official result. */
export interface OnlineOutcome {
  you: 0 | 1;
  round: number;
  winner: 0 | 1 | -1;
  reason: 'ko' | 'time';
  /** Score after this round. */
  score: [number, number];
  /** Someone reached three wins: `matchWinner` takes it. */
  matchWinner: 0 | 1 | -1;
  /** The two devices simulated this round differently. */
  desync: boolean;
  /** You already pressed Next round / Rematch. */
  waiting: boolean;
  rivalRematch: boolean;
  /** Connection trouble: hold the buttons that need the rival. */
  offline: boolean;
}

const ROWS: [keyof FighterTotals, string][] = [
  ['damageDealt', 'Damage dealt'], ['hits', 'Hits landed'], ['biggestHit', 'Biggest hit'], ['crits', 'Critical hits'],
  ['parries', 'Parries'], ['blocks', 'Blocks'], ['evades', 'Evades'], ['feints', 'Feints'], ['healed', 'Healed'],
];
/** Always shown, even at 0 – 0; the rest only when someone did it. */
const KEEP = new Set<keyof FighterTotals>(['damageDealt', 'hits', 'biggestHit']);

export class Results {
  readonly el: HTMLDivElement;

  constructor(private readonly cb: ResultsCallbacks) {
    this.el = h<HTMLDivElement>('div.results');
    this.el.hidden = true;
  }

  /** `you`: blue is the player's own fighter (headline reads Victory / Defeat). */
  show(b: Battle, reason: 'ko' | 'time', you = true): void {
    const w = b.winner;
    const [a, c] = b.fighters;
    const kicker = w === -1 ? 'Draw' : you ? (w === 0 ? 'Victory' : 'Defeat') : `${w === 0 ? 'Blue' : 'Red'} wins`;
    const how = reason === 'ko' ? `by K.O. at ${b.time.toFixed(1)}s` : 'on remaining health';
    const sub = w === -1 ? 'Time ran out with both fighters level' : `${b.fighters[w].name} wins ${how}`;
    this.el.replaceChildren(
      h(`div.card.plate.side-${w === -1 ? 0 : w}` + (w === -1 ? '.draw' : you && w === 1 ? '.lost' : ''), null,
        h('header.res-head', null,
          h('div.res-kicker', null, kicker),
          h('div.reason', null, sub),
        ),
        h('div.res-stats', null,
          h('div.res-names', null, h('span.side-0', null, a.name), h('span.side-1', null, c.name)),
          ...ROWS.map((r) => this.row(a, c, r)),
        ),
        h('div.row.res-actions', null,
          h('button.btn', { onclick: () => this.cb.onReplay(), title: 'Same seed: the fight replays identically' }, icon('replay', 'glyph'), 'Replay'),
          h('button.btn.primary', { onclick: () => this.cb.onRematch() }, icon('swords', 'glyph'), 'Rematch'),
          h('button.btn', { onclick: () => this.cb.onLoadout() }, icon('bag', 'glyph'), 'Change gear'),
        ),
      ),
    );
    this.el.hidden = false;
  }

  private actions: HTMLElement | null = null;
  private note: HTMLElement | null = null;
  private onlineKey = '';

  /** An online round's result: the score so far and the way to the next round (or a rematch). */
  showOnline(b: Battle, o: OnlineOutcome): void {
    const w = o.winner;
    const rival = o.you === 0 ? 1 : 0;
    const over = o.matchWinner !== -1;
    const kicker = over ? (o.matchWinner === o.you ? 'Victory' : 'Defeat') : w === -1 ? 'Draw' : w === o.you ? 'Round won' : 'Round lost';
    const [mine, theirs] = [o.score[o.you], o.score[rival]];
    const sub = over
      ? (o.matchWinner === o.you ? `You win the match ${mine}–${theirs}` : `${b.fighters[rival].name} wins the match ${theirs}–${mine}`)
      : w === -1 ? `Round ${o.round}: time ran out with both fighters level`
        : `Round ${o.round}: ${b.fighters[w].name} wins ${o.reason === 'ko' ? `by K.O. at ${b.time.toFixed(1)}s` : 'on remaining health'}`;
    const lost = over ? o.matchWinner !== o.you : w !== -1 && w !== o.you;
    const [a, c] = b.fighters;
    this.note = h('p.res-note');
    this.actions = h('div.row.res-actions');
    this.el.replaceChildren(
      h(`div.card.plate.online.side-${over ? o.matchWinner : w === -1 ? o.you : w}` + (w === -1 && !over ? '.draw' : lost ? '.lost' : ''), null,
        h('header.res-head', null,
          h('div.res-kicker' + (over ? '' : '.round'), null, kicker),
          h('div.reason', null, sub),
          scoreLine(o.score),
          this.note,
        ),
        h('div.res-stats', null,
          h('div.res-names', null, h('span.side-0', null, a.name), h('span.side-1', null, c.name)),
          ...ROWS.map((r) => this.row(a, c, r)),
        ),
        this.actions,
      ),
    );
    this.onlineKey = '';
    this.updateOnline(o);
    this.el.hidden = false;
  }

  /** Refreshes the buttons and notes as the rival moves on (no re-animation). */
  updateOnline(o: OnlineOutcome): void {
    if (!this.actions || !this.note) return;
    const key = JSON.stringify([o.waiting, o.rivalRematch, o.offline, o.desync, o.matchWinner]);
    if (key === this.onlineKey) return;
    this.onlineKey = key;
    const over = o.matchWinner !== -1;
    const leave = h('button.btn', { onclick: () => this.cb.onLeaveMatch() }, icon('exit', 'glyph'), 'Leave');
    const go = over
      ? h<HTMLButtonElement>('button.btn.primary', { onclick: () => this.cb.onAskRematch(), disabled: o.waiting || o.offline }, icon('swords', 'glyph'),
        o.waiting ? 'Rematch asked' : o.rivalRematch ? 'Accept rematch' : 'Rematch')
      : h<HTMLButtonElement>('button.btn.primary', { onclick: () => this.cb.onNextRound(), disabled: o.waiting }, icon('swords', 'glyph'),
        o.waiting ? 'Waiting for rival' : 'Next round');
    this.actions.replaceChildren(leave, go);
    const notes: string[] = [];
    if (over && o.rivalRematch && !o.waiting) notes.push('Your rival wants a rematch.');
    if (o.desync) notes.push("Your devices saw this round differently. The host's result counts.");
    this.note.textContent = notes.join(' ');
    this.note.hidden = !notes.length;
  }

  private row(a: Battle['fighters'][0], c: Battle['fighters'][1], [k, label]: [keyof FighterTotals, string]): HTMLElement | null {
    const va = Math.round(a.totals[k]), vc = Math.round(c.totals[k]);
    if (!va && !vc && !KEEP.has(k)) return null;
    const share = va + vc > 0 ? va / (va + vc) : 0.5;
    return h('div.res-row', null,
      h('b.v.side-0' + (va > vc ? '.best' : ''), null, String(va)),
      h('span.lbl', null, label),
      h('b.v.side-1' + (vc > va ? '.best' : ''), null, String(vc)),
      h('span.split', { style: { '--share': share.toFixed(3) } }, h('i.side-0'), h('i.side-1')),
    );
  }

  hide(): void {
    this.el.hidden = true;
    this.actions = this.note = null;
  }
}
