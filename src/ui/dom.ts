type Child = Node | string | null | undefined | false;

/** Minimal element helper: h('div.cls', { onclick }, ...children). */
export function h<T extends HTMLElement = HTMLElement>(
  tag: string,
  props: Partial<Record<string, unknown>> | null = null,
  ...children: Child[]
): T {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name) as T;
  if (classes.length) el.className = classes.join(' ');
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') (el as unknown as Record<string, unknown>)[k] = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v as Record<string, string>)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); else (el.style as unknown as Record<string, string>)[sk] = sv;
        }
      }
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'html') el.innerHTML = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function store<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
}
