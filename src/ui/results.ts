import type { Battle } from '../sim/battle';
import { CLASSES } from '../sim/classes';
import type { FighterTotals } from '../sim/types';
import { h } from './dom';

export interface ResultsCallbacks {
  onRematch(): void;
  onReplay(): void;
  onLoadout(): void;
}

const ROWS: [keyof FighterTotals, string][] = [
  ['damageDealt', 'Damage dealt'], ['hits', 'Hits landed'], ['biggestHit', 'Biggest hit'], ['crits', 'Critical hits'],
  ['parries', 'Parries'], ['blocks', 'Blocks'], ['evades', 'Evades'], ['feints', 'Feints'], ['healed', 'Healed'],
];

export class Results {
  readonly el: HTMLDivElement;

  constructor(private readonly cb: ResultsCallbacks) {
    this.el = h<HTMLDivElement>('div.results');
    this.el.hidden = true;
  }

  show(b: Battle, reason: 'ko' | 'time'): void {
    const w = b.winner;
    const title = w === -1 ? 'DRAW' : `${w === 0 ? 'BLUE' : 'RED'} ${CLASSES[b.fighters[w].classId].name.toUpperCase()} WINS`;
    const [a, c] = b.fighters;
    const row = ([k, label]: [keyof FighterTotals, string]) => {
      const va = Math.round(a.totals[k]), vc = Math.round(c.totals[k]);
      return h('tr', null, h('td', null, label),
        h('td' + (va > vc ? '.best' : ''), null, String(va)),
        h('td' + (vc > va ? '.best' : ''), null, String(vc)));
    };
    this.el.replaceChildren(
      h(`div.card.glass.side-${w === -1 ? 0 : w}`, null,
        h('h2', null, title),
        h('div.reason', null, reason === 'ko' ? `K.O. at ${b.time.toFixed(1)}s` : 'Time — decided on remaining health'),
        h('table', null,
          h('thead', null, h('tr', null, h('th'), h('th.side-0', null, CLASSES[a.classId].name), h('th.side-1', null, CLASSES[c.classId].name))),
          h('tbody', null, ...ROWS.map(row)),
        ),
        h('div.row', null,
          h('button.btn', { onclick: () => this.cb.onReplay(), title: 'Same seed — the fight replays identically' }, '↺ Replay'),
          h('button.btn.on', { onclick: () => this.cb.onRematch() }, '⚔ Rematch'),
          h('button.btn', { onclick: () => this.cb.onLoadout() }, '🎒 Change gear'),
        ),
      ),
    );
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
