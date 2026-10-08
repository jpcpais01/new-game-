// Online play screens: the "Play online" sheet, the room lobby, the connection
// banner and the score pips shared by the pick screen, the HUD and the results.
import { sfx } from '../audio/sfx';
import { CODE_LENGTH, normalizeCode, WINS_NEEDED, type Side } from '../net/protocol';
import type { SessionError } from '../net/session';
import { h } from './dom';
import { icon, type IconName } from './icons';

/** First-to-three pips for one side, filled from the outside in. */
export function pips(side: Side, wins: number): HTMLElement {
  const dots = Array.from({ length: WINS_NEEDED }, (_, i) => h('i' + (i < wins ? '.on' : '')));
  if (side === 1) dots.reverse();
  return h(`span.pips.side-${side}`, { 'aria-label': `${wins} of ${WINS_NEEDED} wins` }, ...dots);
}

/** "2 – 1" between both sides' pips. */
export function scoreLine(score: [number, number]): HTMLElement {
  return h('div.score-line', null,
    pips(0, score[0]),
    h('b.score', null, h('span.side-0', null, String(score[0])), h('i', null, '–'), h('span.side-1', null, String(score[1]))),
    pips(1, score[1]));
}

/** Keeps keys away from the game's shortcuts while a sheet is open (Enter starts a fight). */
function trapKeys(onEscape: () => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.key === 'Escape') onEscape();
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}

/** A sheet in the menu's style: title, close button, body. Returns a close function. */
function sheet(parent: HTMLElement, title: string, body: HTMLElement, cls: string): () => void {
  let release = () => {};
  const close = () => { release(); wrap.remove(); };
  const wrap: HTMLDivElement = h<HTMLDivElement>('div.modal-wrap', { onclick: (e: Event) => { if (e.target === wrap) { sfx.play('ui'); close(); } } },
    h(`div.modal.${cls}.plate`, { role: 'dialog', 'aria-label': title },
      h('header.modal-head', null,
        h('h3', null, title),
        h('button.btn.close', { title: 'Close', 'aria-label': 'Close', onclick: () => { sfx.play('ui'); close(); } }, icon('close'))),
      body));
  release = trapKeys(close);
  parent.appendChild(wrap);
  return close;
}

export interface OnlineSheetCallbacks {
  onHost(): void;
  onJoin(code: string): void;
}

/** "Play online": host a room or join one with a code. */
export function openOnlineSheet(parent: HTMLElement, cb: OnlineSheetCallbacks, prefill = ''): void {
  const input = h<HTMLInputElement>('input.code-input', {
    type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    maxlength: String(CODE_LENGTH + 2), placeholder: 'CODE', 'aria-label': 'Room code',
  });
  input.value = normalizeCode(prefill);
  const join = h<HTMLButtonElement>('button.btn.primary.join-btn', { onclick: () => submit() }, icon('swords', 'glyph'), 'Join');
  const sync = () => {
    const v = normalizeCode(input.value);
    if (v !== input.value) input.value = v;
    join.disabled = v.length !== CODE_LENGTH;
  };
  const submit = () => {
    sync();
    if (join.disabled) return;
    sfx.play('ui');
    close();
    cb.onJoin(input.value);
  };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  sync();
  const body = h('div.modal-body.online-body', null,
    h('p.online-blurb', null, 'Duel a friend. Best of five: the first to three victories takes the match. You both pick a new build before every round.'),
    h('section.online-opt', null,
      h('h4', null, 'Host a match'),
      h('p', null, 'Get a room code and a link to send to your friend.'),
      h('button.btn.primary.host-btn', { onclick: () => { sfx.play('ui'); close(); cb.onHost(); } }, icon('globe', 'glyph'), 'Create room')),
    h('section.online-opt', null,
      h('h4', null, 'Join a friend'),
      h('p', null, 'Type the code from their screen.'),
      h('div.join-row', null, input, join)),
  );
  const close = sheet(parent, 'Play online', body, 'online-modal');
  if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => input.focus(), 50);
}

/** Asks before quitting a match. */
export function confirmLeave(parent: HTMLElement, onLeave: () => void): void {
  const body = h('div.modal-body.confirm-body', null,
    h('p', null, 'The match ends for both of you.'),
    h('div.row', null,
      h('button.btn', { onclick: () => { sfx.play('ui'); close(); } }, 'Stay'),
      h('button.btn.primary', { onclick: () => { sfx.play('ui'); close(); onLeave(); } }, icon('exit', 'glyph'), 'Leave match')));
  const close = sheet(parent, 'Leave the match?', body, 'confirm-modal');
}

const ERRORS: Record<SessionError, string> = {
  offline: "Couldn't reach the match server. Check your internet connection and try again.",
  taken: "Couldn't reach the match server. Check your internet connection and try again.",
  browser: "This browser can't make direct connections. Try an up-to-date Chrome, Edge, Firefox or Safari.",
  'no-room': 'No open room with that code. Check it with your friend: a room closes when its host leaves.',
  full: 'That room already has a match going.',
  version: "You and your friend are on different versions of the game. Both of you reload the game, then try again.",
};

export type LobbyView =
  | { kind: 'opening' }
  | { kind: 'waiting'; code: string }
  | { kind: 'joining'; code: string }
  | { kind: 'error'; code: string; error: SessionError; canRetry: boolean };

export interface LobbyCallbacks {
  onCancel(): void;
  onRetry(): void;
}

/** The room screen: the code to share while waiting, or progress and errors while joining. */
export class Lobby {
  readonly el: HTMLDivElement;
  private key = '';

  constructor(private readonly cb: LobbyCallbacks) {
    this.el = h<HTMLDivElement>('div.lobby');
    this.el.hidden = true;
  }

  show(v: LobbyView): void {
    this.el.hidden = false;
    const key = JSON.stringify(v);
    if (key === this.key) return;
    this.key = key;
    const cancel = h('button.btn', { onclick: () => { sfx.play('ui'); this.cb.onCancel(); } }, icon('close', 'glyph'), v.kind === 'error' ? 'Back' : 'Cancel');
    const status = (text: string) => h('div.lobby-status', null, h('span.spinner'), text);
    let content: (HTMLElement | null)[];
    switch (v.kind) {
      case 'opening':
        content = [h('div.lobby-kicker', null, 'Host a match'), status('Opening a room'), h('div.row', null, cancel)];
        break;
      case 'waiting': {
        const link = inviteLink(v.code);
        const copied = (btn: HTMLElement, label: string) => {
          btn.classList.add('on');
          btn.lastChild!.textContent = 'Copied';
          setTimeout(() => { btn.classList.remove('on'); btn.lastChild!.textContent = label; }, 1600);
        };
        const copyBtn: HTMLElement = h('button.btn', { onclick: () => { sfx.play('ui'); void copy(link).then((ok) => ok && copied(copyBtn, 'Copy link')); } }, icon('link', 'glyph'), 'Copy link');
        const shareBtn = typeof navigator.share === 'function'
          ? h('button.btn', {
            onclick: () => {
              sfx.play('ui');
              navigator.share({ title: 'Clashborn duel', text: `Duel me in Clashborn! Room code ${v.code}`, url: link }).catch(() => {});
            },
          }, icon('share', 'glyph'), 'Share')
          : null;
        const codeBtn: HTMLElement = h('button.room-code', { title: 'Copy the code', 'aria-label': `Room code ${v.code.split('').join(' ')}`, onclick: () => { sfx.play('ui'); void copy(v.code); } },
          ...v.code.split('').map((c) => h('span', null, c)));
        content = [
          h('div.lobby-kicker', null, 'Room code'),
          codeBtn,
          h('p.lobby-hint', null, 'Send the code or the link to a friend. The match starts as soon as they join.'),
          h('div.row.lobby-share', null, copyBtn, shareBtn),
          status('Waiting for your rival'),
          h('div.row', null, cancel),
        ];
        break;
      }
      case 'joining':
        content = [
          h('div.lobby-kicker', null, 'Joining room'),
          h('div.room-code.static', null, ...v.code.split('').map((c) => h('span', null, c))),
          status('Connecting to your rival'),
          h('div.row', null, cancel),
        ];
        break;
      case 'error':
        content = [
          h('div.lobby-kicker.bad', null, icon('wifiOff', 'glyph'), "Can't connect"),
          h('p.lobby-hint', null, ERRORS[v.error]),
          h('div.row', null, cancel,
            v.canRetry ? h('button.btn.primary', { onclick: () => { sfx.play('ui'); this.cb.onRetry(); } }, icon('replay', 'glyph'), 'Try again') : null),
        ];
        break;
    }
    this.el.replaceChildren(h('div.lobby-card.plate', { role: 'dialog', 'aria-label': 'Online match' }, ...content));
  }

  hide(): void {
    this.el.hidden = true;
    this.key = '';
  }
}

export function inviteLink(code: string): string {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', code);
  // Keep a custom match server (local testing) in the link.
  const peer = new URLSearchParams(location.search).get('peer');
  if (peer) u.searchParams.set('peer', peer);
  return u.toString();
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older WebViews: a hidden textarea and execCommand.
    const t = h<HTMLTextAreaElement>('textarea', { style: { position: 'fixed', opacity: '0' } });
    t.value = text;
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* nothing else to try */ }
    t.remove();
    return ok;
  }
}

export interface BannerAction { label: string; icon?: IconName; primary?: boolean; onClick(): void }

/** A plaque across the top of the screen for connection trouble. */
export class NetBanner {
  readonly el: HTMLDivElement;
  private key = '';

  constructor() {
    this.el = h<HTMLDivElement>('div.net-banner');
    this.el.hidden = true;
  }

  show(text: string, sub: string, actions: BannerAction[], busy: boolean): void {
    this.el.hidden = false;
    const key = text + sub + actions.map((a) => a.label).join() + busy;
    if (key === this.key) return;
    this.key = key;
    this.el.replaceChildren(h('div.net-card.plate', null,
      h('div.net-text', null, busy ? h('span.spinner') : icon('wifiOff', 'glyph'), h('div', null, h('b', null, text), sub ? h('small', null, sub) : null)),
      ...actions.map((a) => h('button.btn' + (a.primary ? '.primary' : ''), { onclick: () => { sfx.play('ui'); a.onClick(); } }, a.icon ? icon(a.icon, 'glyph') : null, a.label)),
    ));
  }

  hide(): void {
    this.el.hidden = true;
    this.key = '';
  }
}
