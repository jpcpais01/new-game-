// The UI's own icon set: one hand-drawn line style (24px grid, 2.2px round strokes,
// currentColor) so buttons, statuses and forms read the same on every platform
// instead of whatever emoji font the device has.
import type { FormId, StatusId } from '../sim/types';

const S = (d: string) => `<path d="${d}"/>`;
const F = (d: string) => `<path d="${d}" fill="currentColor" stroke="none"/>`;
const dot = (x: number, y: number, r = 1.35) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;

const PATHS = {
  // controls
  settings: S('M4 7h9M18 7h2M4 17h3M12 17h8') + '<circle cx="15.5" cy="7" r="2.4"/><circle cx="9.5" cy="17" r="2.4"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/>' + dot(8.3, 8.3) + dot(15.7, 8.3) + dot(12, 12) + dot(8.3, 15.7) + dot(15.7, 15.7),
  edit: S('M5 19l.9-4.1L15.6 5.2a1.9 1.9 0 0 1 2.7 0l.5.5a1.9 1.9 0 0 1 0 2.7L9.1 18.1z') + S('M13.6 7.2l3.2 3.2'),
  swords: S('M4 4l11 11M12.8 17.2l4.4-4.4M15 15l4.6 4.6M20 4L9 15M6.8 12.8l4.4 4.4M9 15l-4.6 4.6'),
  close: S('M6.5 6.5l11 11M17.5 6.5l-11 11'),
  pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1.3" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.3" fill="currentColor" stroke="none"/>',
  play: '<path d="M8 5.6v12.8a.9.9 0 0 0 1.4.75l9.6-6.4a.9.9 0 0 0 0-1.5L9.4 4.85A.9.9 0 0 0 8 5.6z" fill="currentColor" stroke="none"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6"/>' + S('M15 15l5 5M8 10.5h5'),
  recenter: S('M19.5 12a7.5 7.5 0 1 1-2.2-5.3') + S('M19.5 4.5v3.8h-3.8') + '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  replay: S('M4.5 12a7.5 7.5 0 1 0 2.2-5.3') + S('M4.5 4.5v3.8h3.8'),
  bag: S('M6 10a6 6 0 0 1 12 0v8.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z') + S('M9.2 6.6V5a2.8 2.8 0 0 1 5.6 0v1.6M9 14.5h6'),
  soundOn: S('M4 9.5v5h3.5l5 4v-13l-5 4z') + S('M15.8 9.2a4 4 0 0 1 0 5.6M18.3 6.6a7.6 7.6 0 0 1 0 10.8'),
  soundOff: S('M4 9.5v5h3.5l5 4v-13l-5 4z') + S('M16 9.5l5 5M21 9.5l-5 5'),
  install: S('M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14'),
  check: S('M5 12.5l4.5 4.5L19 7.5'),
  globe: '<circle cx="12" cy="12" r="8.5"/>' + S('M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5z'),
  link: S('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2'),
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/>' + S('M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2'),
  share: '<circle cx="6.5" cy="12" r="2.4"/><circle cx="17.5" cy="6" r="2.4"/><circle cx="17.5" cy="18" r="2.4"/>' + S('M8.6 10.8l6.8-3.6M8.6 13.2l6.8 3.6'),
  exit: S('M14 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7M11 12h9.5M17 8.5l3.5 3.5-3.5 3.5'),
  wifiOff: S('M2.5 9a14 14 0 0 1 19 0M5.8 12.5a9.4 9.4 0 0 1 12.4 0M9.2 16a4.6 4.6 0 0 1 5.6 0M4 4l16 16') + dot(12, 19.3),
  trophy: S('M8 4.5h8v5a4 4 0 0 1-8 0zM8 6.5H5.5a2.5 2.5 0 0 0 2.6 4M16 6.5h2.5a2.5 2.5 0 0 1-2.6 4M12 13.5V17M8.5 20h7M9.5 17h5'),
  notes: '<rect x="5" y="3.5" width="14" height="17" rx="3"/>' + S('M8.6 8.5h6.8M8.6 12h6.8M8.6 15.5h4'),
  highlands: S('M2.5 19.5l6.8-11.5 4 6.6 2.4-3.6 5.8 8.5z') + S('M7.4 11.2l1.9 1.4 1.6-1.6'),
  colosseum: S('M3.5 20h17M4.5 8.5h15M12 3.5l-8 5h16zM7.5 8.5V20M12 8.5V20M16.5 8.5V20'),
  // creator tabs
  body: '<circle cx="12" cy="5.8" r="2.8"/>' + S('M12 8.6v6.4M7 11l5-1.6 5 1.6M9 21l3-6 3 6'),
  face: '<circle cx="12" cy="12" r="8.5"/>' + dot(9, 10.3, 1.2) + dot(15, 10.3, 1.2) + S('M8.8 14.2a4.2 4.2 0 0 0 6.4 0'),
  hair: '<circle cx="6.5" cy="17.5" r="2.7"/><circle cx="17.5" cy="17.5" r="2.7"/>' + S('M8.4 15.6L18 4M15.6 15.6L6 4'),
  palette: S('M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.8 2-1.8 0-1.3-1-1.6-1-2.6s.8-1.6 2-1.6h2.2a3.8 3.8 0 0 0 3.8-3.8C21 6.9 17 3.5 12 3.5z') + dot(7.8, 11.5) + dot(10, 7.6) + dot(14.5, 7.4) + dot(17.3, 10.6),
  sparkle: F('M12 2.8l1.9 5.6a2 2 0 0 0 1.3 1.3L20.8 11.6l-5.6 1.9a2 2 0 0 0-1.3 1.3L12 20.4l-1.9-5.6a2 2 0 0 0-1.3-1.3L3.2 11.6l5.6-1.9a2 2 0 0 0 1.3-1.3z') + F('M19 2.5l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z'),
  // body forms
  robust: F('M12 2.5l8 3.3v5.8c0 5-3.4 8.6-8 9.9-4.6-1.3-8-4.9-8-9.9V5.8z'),
  agile: F('M13.6 2L4.8 13.4h6.1L9.8 22l9.4-12.2h-6.3z'),
  balanced: S('M12 4v15.5M7.5 19.5h9M4.5 7.5h15') + F('M4.5 8.6L1.9 14a2.9 2.9 0 0 0 5.2 0z') + F('M19.5 8.6L16.9 14a2.9 2.9 0 0 0 5.2 0z') + dot(12, 4.2, 1.8),
  slender: F('M19.8 3.2C11.6 3.6 6.4 8.4 5.6 16.6l-1.8 2.8 1.6 1.2 1.9-2.7c7.6-.5 12-5.9 12.5-14.7zM8.6 15.6l5.3-6.3-.7-.6-5.6 6z'),
  mighty: F('M10.1 3.9l4-1.4 7.4 7.3-1.4 4-3.2-.2-6.6-6.6z') + S('M12.2 9.6L3.6 18.2a1.6 1.6 0 0 0 2.3 2.2l8.6-8.5'),
  ethereal: F('M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1z') + F('M17 3l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z'),
  // statuses
  burn: F('M12 21.5c-4 0-6.6-2.7-6.6-6.2 0-4.1 3.6-6.2 4.2-10.6 3 2 4.7 4.6 4.7 7.2 1-.5 1.8-1.7 2-3.1 1.5 1.5 2.5 3.7 2.5 6.4 0 3.6-2.7 6.3-6.8 6.3z'),
  poison: F('M12 2.8c3.2 4.6 6.3 8 6.3 11.4a6.3 6.3 0 0 1-12.6 0C5.7 10.8 8.8 7.4 12 2.8z'),
  chill: S('M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.6 4.4L12 6.6l2.4-2.2M9.6 19.6L12 17.4l2.4 2.2'),
  frozen: '<rect x="4" y="4" width="16" height="16" rx="3.5"/>' + S('M8 8.5l2.5-1M8 11.5l5-2'),
  stun: F('M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z'),
  rage: S('M9.5 3.5v3a2.5 2.5 0 0 1-2.5 2.5h-3M14.5 3.5v3a2.5 2.5 0 0 0 2.5 2.5h3M9.5 20.5v-3a2.5 2.5 0 0 0-2.5-2.5h-3M14.5 20.5v-3a2.5 2.5 0 0 1 2.5-2.5h3'),
  haste: S('M4.5 6l6 6-6 6M12 6l6 6-6 6'),
  mark: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/>' + S('M12 1.8v4M12 18.2v4M1.8 12h4M18.2 12h4'),
  ironskin: S('M12 3l7.5 3v5.4c0 4.7-3.2 8.1-7.5 9.4-4.3-1.3-7.5-4.7-7.5-9.4V6z') + S('M12 7.5v9M8 11.5h8'),
  vulnerable: S('M12 20s-8.2-4.9-8.2-11.1A4.5 4.5 0 0 1 12 6.3a4.5 4.5 0 0 1 8.2 2.6C20.2 15.1 12 20 12 20z') + S('M12.6 6.6l-1.9 3.8 2.8 1.9-1.5 3.6'),
} satisfies Record<string, string>;

export type IconName = keyof typeof PATHS;

const cache = new Map<string, SVGSVGElement>();

/** An icon as an inline SVG (inherits colour from the text around it). */
export function icon(name: IconName, cls = ''): SVGSVGElement {
  let base = cache.get(name);
  if (!base) {
    const t = document.createElement('template');
    t.innerHTML = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
    base = t.content.firstElementChild as SVGSVGElement;
    cache.set(name, base);
  }
  const el = base.cloneNode(true) as SVGSVGElement;
  if (cls) el.classList.add(...cls.split(' '));
  return el;
}

export const formIcon = (id: FormId, cls = ''): SVGSVGElement => icon(id, cls);
export const statusIcon = (id: StatusId, cls = ''): SVGSVGElement => icon(id, cls);
