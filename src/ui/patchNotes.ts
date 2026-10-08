// The version label in the corner and the patch notes popup its button opens.
import { sfx } from '../audio/sfx';
import { PATCH_NOTES } from '../patchnotes';
import { h, save, store } from './dom';
import { icon } from './icons';

const SEEN_KEY = 'cb.notesSeen';

/** Version text plus a notes button; a dot marks a version the player hasn't read about. */
export function versionBadge(label: string): HTMLElement {
  const latest = PATCH_NOTES[0].version;
  const btn = h<HTMLButtonElement>('button.btn.notes-btn', {
    title: 'Patch notes', 'aria-label': 'Patch notes',
    onclick: () => {
      sfx.play('ui');
      save(SEEN_KEY, latest);
      btn.classList.remove('unseen');
      openPatchNotes(el.parentElement ?? document.body);
    },
  }, icon('notes'));
  if (store<string>(SEEN_KEY, '') !== latest) btn.classList.add('unseen');
  const el = h('div.version', null, h('span.version-txt', null, label), btn);
  return el;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A sheet over the current screen, in the same style as the menu's sheets. */
export function openPatchNotes(parent: HTMLElement): void {
  if (parent.querySelector('.notes-modal')) return;
  const onKey = (e: KeyboardEvent) => {
    // Keep keys away from the game's shortcuts (Enter starts a fight) while reading.
    e.stopImmediatePropagation();
    if (e.key === 'Escape') close();
  };
  const close = () => {
    sfx.play('ui');
    window.removeEventListener('keydown', onKey, true);
    wrap.remove();
  };
  const body = h('div.modal-body.notes-body', null,
    ...PATCH_NOTES.map((n, i) => h('section.note' + (i === 0 ? '.latest' : ''), null,
      h('header.note-head', null,
        h('span.note-ver', null, 'v' + n.version),
        h('b.note-title', null, n.title),
        h('time.note-date', { datetime: n.date }, formatDate(n.date)),
      ),
      h('ul', null, ...n.notes.map((t) => h('li', null, t))),
    )),
  );
  const wrap: HTMLDivElement = h<HTMLDivElement>('div.modal-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div.modal.notes-modal.plate', { role: 'dialog', 'aria-label': 'Patch notes' },
      h('header.modal-head', null,
        h('h3', null, 'Patch notes'),
        h('button.btn.close', { title: 'Close', 'aria-label': 'Close', onclick: close }, icon('close'))),
      body,
    ),
  );
  window.addEventListener('keydown', onKey, true);
  parent.appendChild(wrap);
}
