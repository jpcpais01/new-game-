import type { Battle } from '../sim/battle';
import type { FighterTotals } from '../sim/types';
import { h } from './dom';
import { icon } from './icons';

export interface ResultsCallbacks {
  onRematch(): void;
  onReplay(): void;
  onLoadout(): void;
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
    const row = ([k, label]: [keyof FighterTotals, string]) => {
      const va = Math.round(a.totals[k]), vc = Math.round(c.totals[k]);
      if (!va && !vc && !KEEP.has(k)) return null;
      const share = va + vc > 0 ? va / (va + vc) : 0.5;
      return h('div.res-row', null,
        h('b.v.side-0' + (va > vc ? '.best' : ''), null, String(va)),
        h('span.lbl', null, label),
        h('b.v.side-1' + (vc > va ? '.best' : ''), null, String(vc)),
        h('span.split', { style: { '--share': share.toFixed(3) } }, h('i.side-0'), h('i.side-1')),
      );
    };
    this.el.replaceChildren(
      h(`div.card.plate.side-${w === -1 ? 0 : w}` + (w === -1 ? '.draw' : you && w === 1 ? '.lost' : ''), null,
        h('header.res-head', null,
          h('div.res-kicker', null, kicker),
          h('div.reason', null, sub),
        ),
        h('div.res-stats', null,
          h('div.res-names', null, h('span.side-0', null, a.name), h('span.side-1', null, c.name)),
          ...ROWS.map(row),
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

  hide(): void {
    this.el.hidden = true;
  }
}
