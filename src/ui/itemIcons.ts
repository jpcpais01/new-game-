import { RARITY_COLOR, resolveArt, type ArtKey, type ItemArt, type Metal, type Rarity, type ResolvedArt } from '../gear/art';

// -----------------------------------------------------------------------------
// Procedural item icons. Every art key is a small hand-authored SVG drawing in
// the game's painted cel style: chunky shapes, coloured gradients, a dark line
// drawn behind each shape (paint-order stroke) and white glints. Colours come
// from the item (tint, metal, cloth), so one drawing serves many items. Icons
// are cached as data URLs, so a whole inventory costs a few KB and no
// downloads, and they stay crisp at any size or DPR.
// -----------------------------------------------------------------------------

const OUT = '#1a1428';
const LW = 2.8;

// --- colour helpers ----------------------------------------------------------

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
function mix(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgb(a), [br, bg, bb] = rgb(b);
  return (clamp255(ar + (br - ar) * t) << 16) | (clamp255(ag + (bg - ag) * t) << 8) | clamp255(ab + (bb - ab) * t);
}
const light = (c: number, t: number) => mix(c, 0xffffff, t);
const dark = (c: number, t: number) => mix(c, 0x120c22, t);

// --- materials ---------------------------------------------------------------

const METAL_STOPS: Record<Metal, [number, number, number]> = {
  steel: [0xf7faff, 0xb4bfd0, 0x67718a],
  gold: [0xfff3b0, 0xf0bd48, 0x9a6420],
  bronze: [0xf6c58e, 0xc07a3c, 0x6e3c1c],
  dark: [0x9a9cb4, 0x50546c, 0x24263a],
  bone: [0xfffcf2, 0xe9dcbc, 0xa8977a],
  wood: [0xd29a60, 0x8c5a30, 0x4f3018],
  crystal: [0xffffff, 0xbfefff, 0x5aa8d8],
  obsidian: [0x6a5a8a, 0x2c2440, 0x120c1e],
};
const TRIM_OF: Record<Metal, Metal> = {
  steel: 'gold', gold: 'bronze', bronze: 'gold', dark: 'gold', bone: 'dark', wood: 'gold', crystal: 'steel', obsidian: 'gold',
};

function lin(id: string, a: number, b: number, c: number): string {
  const stops = `<stop offset="0" stop-color="${css(a)}"/><stop offset=".5" stop-color="${css(b)}"/><stop offset="1" stop-color="${css(c)}"/>`;
  // Bounding-box version for fills, plus a user-space twin ("U" prefix) for
  // strokes: a straight vertical stroke has a zero-width box, which would
  // make a bounding-box gradient invalid and paint nothing.
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`
    + `<linearGradient id="U${id}" gradientUnits="userSpaceOnUse" x1="16" y1="8" x2="48" y2="56">${stops}</linearGradient>`;
}
function rad(id: string, a: number, b: number, c: number, cx = 0.38, cy = 0.32): string {
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r=".75"><stop offset="0" stop-color="${css(a)}"/><stop offset=".45" stop-color="${css(b)}"/><stop offset="1" stop-color="${css(c)}"/></radialGradient>`;
}

/** Paint references available to drawings. */
interface Paint {
  /** Main material of the item. */
  m: string;
  /** Trim material (guards, bands, settings). */
  t: string;
  steel: string; gold: string; wood: string; leather: string; bone: string; dark: string;
  cloth: string; clothDark: string;
  gem: string; glow: string; flame: string;
  /** Raw tint colours for details. */
  tint: string; tintLight: string; tintDark: string;
  clothHex: string;
}

function defs(r: ResolvedArt): { defs: string; p: Paint } {
  const d: string[] = [];
  for (const k of Object.keys(METAL_STOPS) as Metal[]) {
    const [a, b, c] = METAL_STOPS[k];
    d.push(lin('M' + k, a, b, c));
  }
  d.push(lin('Lth', 0xc8844a, 0x7e4824, 0x48260f));
  d.push(lin('Cl', light(r.cloth, 0.35), r.cloth, dark(r.cloth, 0.45)));
  d.push(lin('Cd', r.cloth, dark(r.cloth, 0.35), dark(r.cloth, 0.65)));
  d.push(rad('Gm', light(r.tint, 0.85), r.tint, dark(r.tint, 0.5)));
  d.push(rad('Gw', 0xffffff, light(r.tint, 0.35), r.tint, 0.5, 0.5));
  d.push(`<linearGradient id="Fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff6d0"/><stop offset=".35" stop-color="${css(light(r.tint, 0.3))}"/><stop offset="1" stop-color="${css(r.tint)}"/></linearGradient>`);
  const u = (id: string) => `url(#${id})`;
  return {
    defs: d.join(''),
    p: {
      m: u('M' + r.metal), t: u('M' + TRIM_OF[r.metal]),
      steel: u('Msteel'), gold: u('Mgold'), wood: u('Mwood'), leather: u('Lth'), bone: u('Mbone'), dark: u('Mdark'),
      cloth: u('Cl'), clothDark: u('Cd'), gem: u('Gm'), glow: u('Gw'), flame: u('Fl'),
      tint: css(r.tint), tintLight: css(light(r.tint, 0.55)), tintDark: css(dark(r.tint, 0.4)), clothHex: css(r.cloth),
    },
  };
}

// --- drawing primitives --------------------------------------------------------

const stroke = (w = LW) => `stroke="${OUT}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"`;
/** Outlined filled path. */
const P = (d: string, fill: string, w = LW, extra = '') => `<path d="${d}" fill="${fill}" ${stroke(w)} ${extra}/>`;
const C = (cx: number, cy: number, r: number, fill: string, w = LW) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${stroke(w)}/>`;
const E = (cx: number, cy: number, rx: number, ry: number, fill: string, w = LW, rot = 0) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${stroke(w)}${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''}/>`;
const R = (x: number, y: number, w: number, h: number, r: number, fill: string, sw = LW) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${stroke(sw)}/>`;
/** Thick outlined line (shafts, chains, bow limbs). */
const T = (d: string, color: string, w: number) =>
  `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${w + LW}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color.replace('url(#', 'url(#U')}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Unoutlined detail line. */
const L = (d: string, color: string, w = 1.4, op = 1) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
/** White glint stroke. */
const H = (d: string, op = 0.7, w = 1.6) => L(d, '#fff', w, op);
/** Translucent white shine fill (bevel highlight). */
const S = (d: string, op = 0.3) => `<path d="${d}" fill="#fff" opacity="${op}"/>`;
/** Shadow fill. */
const D = (d: string, op = 0.22) => `<path d="${d}" fill="${OUT}" opacity="${op}"/>`;
const G = (tr: string, ...c: string[]) => `<g transform="${tr}">${c.join('')}</g>`;
const diag = (...c: string[]) => G('rotate(45 32 32)', ...c);
/** Soft additive-looking halo behind glowing parts. */
const halo = (cx: number, cy: number, r: number, color: string, op = 0.45) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${op * 0.5}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.6}" fill="${color}" opacity="${op}"/>`;
/** Four-point sparkle. */
const spark = (x: number, y: number, s: number, color = '#fff', op = 0.95) =>
  `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${color}" opacity="${op}"/>`;
/** Faceted gem with a glint. */
const gem = (cx: number, cy: number, r: number, p: Paint, w = 2.2) =>
  C(cx, cy, r, p.gem, w) + S(`M${cx - r * 0.55} ${cy - r * 0.1}A${r * 0.6} ${r * 0.6} 0 0 1 ${cx + r * 0.1} ${cy - r * 0.6}L${cx - r * 0.1} ${cy - r * 0.15}Z`, 0.75);
/** Regular polygon / star path. */
function star(cx: number, cy: number, n: number, r0: number, r1: number, rot = -Math.PI / 2): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r0 : r1;
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r).toFixed(2) + ' ' + (cy + Math.sin(a) * r).toFixed(2);
  }
  return d + 'Z';
}
const mirrorX = (...c: string[]) => G('translate(64 0) scale(-1 1)', ...c);

// --- shared sub-drawings -------------------------------------------------------

/** One chain link (outlined ring). */
function link(x: number, y: number, rx: number, ry: number, rot: number, color: string, w = 2): string {
  const e = (c: string, sw: number) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="none" stroke="${c}" stroke-width="${sw}"/>`;
  return e(OUT, w + LW) + e(color, w);
}

function grip(p: Paint, x: number, y: number, w: number, h: number, wrap = p.leather): string {
  let s = R(x, y, w, h, Math.min(2.2, w / 2), wrap);
  for (let k = y + 2.5; k < y + h - 1; k += 3.2) s += L(`M${x + 0.6} ${k}L${x + w - 0.6} ${k + 1.6}`, OUT, 0.9, 0.45);
  return s;
}

/** Upright dagger (tip up), optionally with a venom-glow edge. */
function dagger(p: Paint, glowEdge = false): string {
  return [
    P('M32 4Q38.5 13 37.5 24L37.5 42L26.5 42L26.5 24Q25.5 13 32 4Z', p.m),
    S('M32 6Q27.6 14 27.8 24L27.8 41L32 41Z', 0.32),
    glowEdge ? L('M36.6 14Q37.4 24 36.6 40', p.tintLight, 1.6, 0.95) : L('M32 16V38', OUT, 1.2, 0.3),
    P('M18 40Q20 46 25 45L39 45Q44 46 46 40L40 42L24 42Z', p.t),
    grip(p, 29, 45, 6, 11),
    C(32, 59, 3.6, p.t), gem(32, 59, 1.8, p, 1.2),
  ].join('');
}

function bootShape(): string {
  return 'M17 6L35 6L35 36Q48 37 55 44Q58 47 57 52L57 56L13 56L13 46Q17 40 17 30Z';
}

function torso(): string {
  return 'M14 14Q22 7 32 12Q42 7 50 14L55 25L47 28L47 52Q32 59 17 52L17 28L9 25Z';
}

// --- drawings ------------------------------------------------------------------

type Draw = (p: Paint) => string;

const DRAW: Record<ArtKey, Draw> = {
  // Weapons are drawn upright around x=32 and turned 45° (tip to the top right).
  sword: (p) => diag(
    P('M32 -2L37.5 8L37.5 45L26.5 45L26.5 8Z', p.m),
    S('M32 0L27.8 8.3L27.8 44L32 44Z', 0.32),
    L('M32 10V41', OUT, 1.4, 0.35),
    P('M15 44Q16 50 22 49L42 49Q48 50 49 44Z', p.t),
    gem(32, 47, 3.1, p),
    grip(p, 29, 50, 6, 12),
    C(32, 65, 4.2, p.t), H('M30 63.5Q31 62.5 32.5 62.6', 0.8, 1.2),
  ),
  greatsword: (p) => diag(
    P('M32 -8L40 2L40 41L24 41L24 2Z', p.m),
    S('M32 -6L25.5 2.4L25.5 40L32 40Z', 0.3),
    P('M28.5 4L32 0L35.5 4L35.5 36L28.5 36Z', p.tintDark, 1.4, 'opacity=".9"'),
    L('M32 5V34', p.tintLight, 1.6, 0.9),
    P('M11 40L18 44L46 44L53 40L50 48L14 48Z', p.t),
    gem(32, 45, 3.2, p),
    grip(p, 29, 48, 6, 15),
    P('M32 62L37 66L32 71L27 66Z', p.t),
  ),
  katana: (p) => diag(
    P('M35 -6Q39.5 12 36.5 43L30 43Q32.5 14 35 -6Z', p.m),
    S('M35 -4Q33 14 31 42L33 42Q35.5 14 35 -4Z', 0.55),
    L('M35.5 0Q37 16 35 40', '#fff', 0.8, 0.5),
    R(29.5, 41, 7.5, 4, 1, p.gold, 2),
    E(33, 46.5, 9, 2.8, p.dark),
    R(29.5, 48, 7, 16, 2.5, p.cloth),
    L('M29.8 50L36.7 53.5M36.7 50L29.8 53.5M29.8 55L36.7 58.5M36.7 55L29.8 58.5M29.8 60L36.7 63.5M36.7 60L29.8 63.5', '#f4ecdc', 1.1, 0.95),
    R(29, 63.5, 8, 3, 1.5, p.gold, 2),
  ),
  rapier: (p) => diag(
    P('M32 -8L34.2 0L34.2 44L29.8 44L29.8 0Z', p.m, 2.4),
    H('M31 2V42', 0.7, 1),
    T('M24 45Q20 56 30 58.5', p.tint, 2.4),
    T('M22 44Q32 41 42 44', p.t, 3),
    E(32, 44.5, 6, 3.2, p.t),
    grip(p, 29.5, 47, 5, 13, p.dark),
    C(32, 63, 3.8, p.t),
  ),
  dagger: (p) => diag(dagger(p)),
  twin_daggers: (p) => [
    G('rotate(-38 32 34) translate(-5 0)', dagger(p, true)),
    G('rotate(38 32 34) translate(5 0)', dagger(p, true)),
  ].join(''),
  parrying_dagger: (p) => diag(
    P('M32 -2L36.5 8L36 42L28 42L27.5 8Z', p.m),
    S('M32 0L28.3 8.2L28.8 41L32 41Z', 0.32),
    L('M32 9V38', OUT, 1.2, 0.3),
    P('M20 40Q19 52 32 55Q45 52 44 40Z', p.t),
    S('M22 42Q22 49 28 52L27 46Z', 0.35),
    P('M8 40Q12 36 18 40L46 40Q52 36 56 40Q52 44 46 43L18 43Q12 44 8 40Z', p.t, 2.4),
    gem(32, 46, 3, p),
    grip(p, 29.5, 54, 5, 10, p.dark),
    C(32, 66, 3.4, p.t),
  ),
  axe: (p) => diag(G('translate(32 32) scale(.9) translate(-32 -30)',
    T('M32 2V64', p.wood, 5),
    L('M32 6V62', '#fff', 0.8, 0.2),
    P('M31 10L22 9Q15 5 11 1Q4 18 11 35Q15 31 22 28L31 27Z', p.m),
    S('M11 3.5Q6.5 18 11.5 32.5L14.5 30Q10.5 18 13.5 6Z', 0.5),
    P('M33 13L43 17L33 23Z', p.m, 2.4),
    R(29, 9, 6, 19, 2, p.t, 2.2),
    grip(p, 29.7, 48, 4.6, 14),
  )),
  greataxe: (p) => diag(G('translate(32 32) scale(.84) translate(-32 -29)',
    T('M32 -4V68', p.wood, 5),
    P('M30 6Q20 5 13 -3Q1 17 13 37Q20 28 30 27Z', p.m),
    S('M13 0Q4 17 13.5 34L16 31Q9 17 15.5 2.5Z', 0.5),
    mirrorX(P('M30 6Q20 5 13 -3Q1 17 13 37Q20 28 30 27Z', p.m), D('M13 0Q4 17 13.5 34L16 31Q9 17 15.5 2.5Z', 0.18)),
    R(26.5, 5, 11, 23, 2.5, p.t),
    gem(32, 16.5, 3.6, p),
    P('M32 -10L35 -3L29 -3Z', p.t, 2),
    grip(p, 29.7, 50, 4.6, 15),
  )),
  mace: (p) => diag(
    ...Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2;
      const x = 32 + Math.cos(a) * 10, y = 16 + Math.sin(a) * 10;
      const x2 = 32 + Math.cos(a) * 17, y2 = 16 + Math.sin(a) * 17;
      const nx = -Math.sin(a) * 4, ny = Math.cos(a) * 4;
      return P(`M${x + nx} ${y + ny}L${x2} ${y2}L${x - nx} ${y - ny}Z`, p.m, 2.2);
    }),
    C(32, 16, 11, p.m),
    S('M24 13A9 9 0 0 1 32 6.5L31 9A7 7 0 0 0 26 14Z', 0.55),
    C(32, 16, 4, p.gem, 2),
    R(29.2, 27, 5.6, 26, 2, p.t),
    grip(p, 29, 50, 6, 13),
    C(32, 65, 3.6, p.t),
  ),
  warhammer: (p) => diag(
    T('M32 14V66', p.wood, 5),
    P('M28 6L32 -6L36 6Z', p.m, 2.2),
    R(14, 4, 36, 20, 3.5, p.m),
    S('M15.5 5.5L48.5 5.5L48.5 9L15.5 11Z', 0.35),
    R(12, 5, 6, 18, 2, p.t, 2.2), R(46, 5, 6, 18, 2, p.t, 2.2),
    R(25, 9, 14, 10, 2, p.glow, 2), L('M28 14H36M32 11V17', p.tintDark, 1.4, 0.8),
    grip(p, 29.6, 48, 4.8, 16),
  ),
  flail: (p) => [
    T('M44 60L50 44', p.wood, 5.5),
    grip(p, 43, 52, 5, 9),
    C(50.5, 42, 3.5, p.t, 2.2),
    ...[[46, 37], [42, 32], [37, 28], [32, 25]].map(([x, y], k) => link(x, y, 3.4, 2.2, k % 2 ? 50 : -40, '#c8cfdc')),
    ...Array.from({ length: 10 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2;
      const x = 20 + Math.cos(a) * 9, y = 20 + Math.sin(a) * 9;
      const x2 = 20 + Math.cos(a) * 15.5, y2 = 20 + Math.sin(a) * 15.5;
      const nx = -Math.sin(a) * 3.2, ny = Math.cos(a) * 3.2;
      return P(`M${x + nx} ${y + ny}L${x2} ${y2}L${x - nx} ${y - ny}Z`, p.m, 2.2);
    }),
    C(20, 20, 11, p.dark),
    S('M12.5 17A8 8 0 0 1 20 11L19.5 13.5A6 6 0 0 0 14.5 18Z', 0.45),
    C(20, 20, 3.5, p.glow, 1.6),
  ].join(''),
  spear: (p) => diag(
    T('M32 14V70', p.wood, 3.6),
    P('M32 -9Q39.5 2 36 15L28 15Q24.5 2 32 -9Z', p.m),
    S('M32 -7Q26.5 2 29 14L32 14Z', 0.35),
    L('M32 -3V12', OUT, 1.1, 0.35),
    R(28.5, 14, 7, 5, 1.6, p.t, 2.2),
    P('M29 19Q23 24 25 34Q27 27 31 22Z', p.cloth, 2), P('M35 19Q41 24 39 34Q37 27 33 22Z', p.cloth, 2),
    grip(p, 30, 50, 4, 10),
  ),
  halberd: (p) => diag(
    T('M32 4V70', p.wood, 4),
    P('M32 -9L35.5 6L28.5 6Z', p.m, 2.2),
    P('M34 6Q46 0 51 6Q53 17 47 27Q41 20 34 21Z', p.m),
    S('M49 6Q50.5 16 46.5 24L45 22Q48 15 47 7Z', 0.45),
    P('M30 9L19 13L23 9.5L30 6.5Z', p.m, 2.2),
    R(28.6, 5, 6.8, 18, 2, p.t, 2.2),
    gem(32, 14, 2.4, p, 1.6),
    grip(p, 30, 52, 4, 10),
  ),
  scythe: (p) => [
    T('M46 61Q38 34 27 7', p.wood, 4.5),
    T('M34 36L42 31', p.wood, 3),
    P('M28 8Q9 3 3 28Q12 15 30 15Z', p.m),
    L('M27 9.5Q11 6.5 5 24', p.tint, 1.8, 0.95),
    S('M26 9.8Q12 7 6 22L8 20Q13 10 26 11.5Z', 0.25),
    R(25, 6, 7, 10, 2, p.t, 2.2),
    halo(4.5, 26, 4, p.tint, 0.5),
  ].join(''),
  staff: (p) => G('rotate(28 32 32)',
    halo(32, 7, 15, p.tint, 0.4),
    T('M32 66L32 18', p.wood, 5),
    E(32, 40, 3.6, 2, p.wood, 1.8), E(32, 52, 3.4, 2, p.wood, 1.8),
    T('M32 20Q21 15 23 1', p.wood, 4), T('M32 20Q43 15 41 1', p.wood, 4),
    R(28.5, 18, 7, 5, 2, p.t, 2.2),
    C(32, 7.5, 7.5, p.glow, 2.4),
    S('M27.5 5A5 5 0 0 1 31 2L31 4A3 3 0 0 0 29 6Z', 0.9),
    spark(43, 0, 3.2), spark(20, 14, 2.4),
  ),
  wand: (p) => G('rotate(35 32 32)',
    halo(32, 13, 13, p.tint, 0.45),
    P('M30 62L31 24L33 24L34 62Z', p.wood, 2.4),
    R(29.5, 44, 5, 8, 1.6, p.t, 2),
    P('M31 24L33 24L34 20L30 20Z', p.t, 2),
    P(star(32, 13, 5, 3.8, 8.5), p.glow, 2.2),
    spark(43, 6, 2.6), spark(23, 4, 2), spark(42, 22, 1.8),
  ),
  scepter: (p) => G('rotate(30 32 32)',
    halo(32, 14, 13, p.tint, 0.35),
    R(29.5, 24, 5, 38, 2.2, p.m),
    R(28, 34, 8, 3.5, 1.5, p.t, 2), R(28, 48, 8, 3.5, 1.5, p.t, 2),
    C(32, 63, 3.6, p.m),
    T('M32 24Q20 22 21 12Q22 3 32 2Q42 3 43 12Q44 22 32 24', p.gold, 3),
    gem(32, 13, 6.2, p),
    P('M32 -5L34 1L32 3L30 1Z', p.gold, 2),
  ),
  bow: (p) => G('rotate(-45 32 32)',
    L('M22 4L22 60', '#f3ead6', 1.3),
    T('M22 4Q44 10 42 32Q44 54 22 60', p.wood, 4.6),
    L('M24 5.5Q41 11 39.5 28', '#fff', 0.9, 0.35),
    R(38.5, 27, 7, 10, 2, p.leather, 2),
    T('M10 32L56 32', p.wood, 2.2),
    P('M56 28L64 32L56 36Z', p.m, 2),
    P('M9 32L4 27L13 27L16 32Z', p.cloth, 1.8), P('M9 32L4 37L13 37L16 32Z', p.cloth, 1.8),
    C(22, 4, 2, p.t, 1.6), C(22, 60, 2, p.t, 1.6),
  ),
  crossbow: (p) => G('rotate(32 32 32)',
    R(28.5, 14, 7, 46, 2.5, p.wood),
    L('M30 18V56', '#fff', 0.8, 0.3),
    T('M8 27Q32 9 56 27', p.m, 4),
    L('M9 27L32 33L55 27', '#f3ead6', 1.1),
    R(26, 20, 12, 7, 2, p.t, 2.2),
    P('M32 2L35 9L33.2 9L33.2 31L30.8 31L30.8 9L29 9Z', p.steel, 1.8),
    P('M34 42L38 48L34 48Z', p.dark, 1.6),
    R(27.5, 54, 9, 8, 2.5, p.leather, 2),
  ),
  gauntlets: (p) => [
    R(19, 41, 26, 17, 4, p.leather),
    R(17, 39, 30, 6, 2.5, p.t, 2.2),
    P('M16 22Q16 14 22 14L44 14Q49 14 49 22L48 38Q48 42 44 42L21 42Q17 42 16 38Z', p.m),
    ...[0, 1, 2, 3].map((k) => R(17.5 + k * 7.6, 8 + Math.abs(k - 1.5) * 1.2, 7, 12, 3, p.m, 2.2)),
    ...[0, 1, 2, 3].map((k) => P(`M${20 + k * 7.6} ${11 + Math.abs(k - 1.5) * 1.2}L${21 + k * 7.6} ${3 + Math.abs(k - 1.5) * 1.2}L${22.8 + k * 7.6} ${11 + Math.abs(k - 1.5) * 1.2}Z`, p.tintLight, 1.6)),
    E(14.5, 30, 5, 8, p.m, LW, -15),
    S('M19 18Q19 16 22 16L30 16L28 19L21 21Z', 0.5),
    gem(32, 30, 4, p),
  ].join(''),
  claws: (p) => [
    ...[-1, 0, 1].map((k) => P(`M${28 + k * 8} 38Q${22 + k * 9} 18 ${34 + k * 8} 0Q${33 + k * 8} 20 ${34.5 + k * 8} 38Z`, p.m, 2.4)
      + H(`M${29.5 + k * 8} 34Q${25.5 + k * 9} 18 ${32.5 + k * 8} 4`, 0.6, 1)),
    R(17, 36, 30, 22, 5, p.leather),
    R(15, 38, 34, 5, 2, p.t, 2.2), R(15, 50, 34, 5, 2, p.t, 2.2),
    gem(32, 46.5, 3.3, p),
  ].join(''),
  chakram: (p) => [
    ...Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2;
      const x = 32 + Math.cos(a) * 20, y = 32 + Math.sin(a) * 20;
      const tx = 32 + Math.cos(a + 0.42) * 29, ty = 32 + Math.sin(a + 0.42) * 29;
      const x2 = 32 + Math.cos(a + 0.6) * 20, y2 = 32 + Math.sin(a + 0.6) * 20;
      return P(`M${x} ${y}L${tx} ${ty}L${x2} ${y2}Z`, p.m, 2.2);
    }),
    `<path d="M32 10A22 22 0 1 1 31.9 10ZM32 20A12 12 0 1 0 32.1 20Z" fill="${p.m}" fill-rule="evenodd" ${stroke()}/>`,
    `<path d="M32 13.5A18.5 18.5 0 0 1 50.5 32" fill="none" stroke="#fff" stroke-width="1.6" opacity=".55"/>`,
    `<circle cx="32" cy="32" r="16" fill="none" stroke="${p.tint}" stroke-width="1.6" opacity=".9"/>`,
    R(11, 27, 6, 10, 2, p.leather, 2),
  ].join(''),
  throwing_knives: (p) => [-34, 0, 34].map((r) => G(`rotate(${r} 32 56)`,
    P('M32 4L36 16L34 34L30 34L28 16Z', p.m, 2.3),
    S('M32 6L29 16L30.5 33L32 33Z', 0.35),
    R(30.2, 34, 3.6, 13, 1.4, p.cloth, 2),
    C(32, 50.5, 3.6, 'none', 2.2),
  )).join(''),
  tome: (p) => [
    P('M15 9L49 7Q52 7 52 10L52 52Q52 55 49 55L15 57Z', '#efe4c6'),
    L('M17 52.5L50 51M17 49L50 47.5', '#b9a882', 1, 0.9),
    P('M12 10Q12 6 16 6L46 6Q50 6 50 10L50 50Q50 54 46 54L16 54Q12 54 12 50Z', p.cloth),
    P('M12 10Q12 6 16 6L19 6L19 54L16 54Q12 54 12 50Z', p.clothDark, 2.2),
    P('M50 6L50 15L41 6Z', p.t, 2), P('M50 54L50 45L41 54Z', p.t, 2),
    C(35, 29, 10, p.t), C(35, 29, 6.5, p.glow, 2), L('M35 24.5V33.5M30.5 29H39.5', p.tintDark, 1.6, 0.8),
    R(47, 24, 8, 10, 2, p.t, 2.2),
    spark(46, 14, 2.4),
  ].join(''),
  orb: (p) => [
    halo(32, 26, 20, p.tint, 0.35),
    E(32, 54, 14, 5, p.m),
    P('M24 52Q20 40 22 32L26 34Q25 44 29 51Z', p.m, 2.2), mirrorX(P('M24 52Q20 40 22 32L26 34Q25 44 29 51Z', p.m, 2.2)),
    C(32, 27, 15, p.gem),
    `<path d="M22 27Q27 19 36 22Q30 28 38 34" fill="none" stroke="${p.tintLight}" stroke-width="2" opacity=".85"/>`,
    S('M22 22A11 11 0 0 1 30 15L30 18A8 8 0 0 0 24.5 23Z', 0.85),
    spark(44, 14, 2.6),
  ].join(''),
  torch: (p) => G('rotate(25 32 32)',
    halo(32, 14, 16, p.tint, 0.4),
    P('M29.5 62L30 30L34 30L34.5 62Z', p.wood, 2.4),
    R(27, 26, 10, 9, 2.5, p.leather, 2.2), L('M27.5 29L36.5 31M27.5 32L36.5 34', OUT, 0.9, 0.5),
    P('M32 0Q45 12 39 24Q43 15 35 11Q37 21 32 26Q25 21 27 11Q22 18 25 24Q19 12 32 0Z', p.flame, 2.2),
    P('M32 12Q37 18 33.5 24L30.5 24Q28 18 32 12Z', '#fff7d6', 0),
  ),

  // Defensive.
  buckler: (p) => [
    C(32, 32, 22, p.m),
    `<circle cx="32" cy="32" r="18.5" fill="none" stroke="${OUT}" stroke-width="1.2" opacity=".35"/>`,
    ...Array.from({ length: 8 }, (_, k) => C(32 + Math.cos(k * Math.PI / 4) * 19, 32 + Math.sin(k * Math.PI / 4) * 19, 1.6, p.t, 1.2)),
    C(32, 32, 9, p.t), gem(32, 32, 4.4, p),
    `<path d="M15 26A18 18 0 0 1 26 14" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>`,
  ].join(''),
  round_shield: (p) => [
    C(32, 32, 25, p.wood),
    L('M22 9V55M32 7V57M42 9V55', OUT, 1.1, 0.4),
    `<path d="M32 13A19 19 0 0 1 51 32L32 32Z M32 51A19 19 0 0 1 13 32L32 32Z" fill="${p.cloth}" opacity=".85"/>`,
    `<circle cx="32" cy="32" r="25" fill="none" stroke="${OUT}" stroke-width="${LW + 4}"/><circle cx="32" cy="32" r="25" fill="none" stroke="${p.m}" stroke-width="4"/>`,
    C(32, 32, 8, p.m), S('M27 29A5.5 5.5 0 0 1 32 26L32 28A3.5 3.5 0 0 0 28.6 30Z', 0.8),
    `<path d="M12 22A22 22 0 0 1 22 11" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>`,
  ].join(''),
  kite_shield: (p) => [
    P('M13 8Q32 3 51 8Q53 36 32 61Q11 36 13 8Z', p.m),
    P('M18 12.5Q32 9 46 12.5Q47 34 32 54Q17 34 18 12.5Z', p.cloth, 2),
    P('M29 16H35V26H44V32H35V48H29V32H20V26H29Z', p.t, 2),
    gem(32, 29, 3.4, p),
    S('M15 9.5Q22 7 28 6.5L19 13Q18.5 26 22 38Q14.5 26 15 9.5Z', 0.4),
  ].join(''),
  tower_shield: (p) => [
    P('M12 7Q32 1 52 7L52 50Q32 63 12 50Z', p.m),
    P('M27 5L37 5L37 58Q32 60 27 58Z', p.cloth, 2),
    R(10, 20, 44, 5, 2, p.t, 2.2), R(10, 40, 44, 5, 2, p.t, 2.2),
    ...[[16, 12], [48, 12], [16, 32], [48, 32], [16, 50], [48, 50]].map(([x, y]) => C(x, y, 1.8, p.t, 1.2)),
    C(32, 32, 6, p.t), gem(32, 32, 3, p, 1.6),
    S('M14 9Q20 6.5 25 6L25 54Q19 53 14 49Z', 0.18),
  ].join(''),
  spiked_shield: (p) => [
    ...Array.from({ length: 10 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2;
      const nx = -Math.sin(a) * 4, ny = Math.cos(a) * 4;
      const x = 32 + Math.cos(a) * 21, y = 32 + Math.sin(a) * 21;
      return P(`M${x + nx} ${y + ny}L${32 + Math.cos(a) * 31} ${32 + Math.sin(a) * 31}L${x - nx} ${y - ny}Z`, p.steel, 2);
    }),
    C(32, 32, 23, p.m),
    `<circle cx="32" cy="32" r="16" fill="none" stroke="${p.tint}" stroke-width="2" opacity=".85"/>`,
    P(star(32, 32, 4, 5, 13, -Math.PI / 4), p.steel, 2.2),
    C(32, 32, 4, p.glow, 1.6),
    `<path d="M14 26A19 19 0 0 1 25 14" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".45"/>`,
  ].join(''),
  mirror_shield: (p) => [
    P(star(32, 32, 12, 24, 27.5), p.gold),
    C(32, 32, 21, p.gem),
    `<path d="M19 40L40 17M24 45L45 22" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/>`,
    `<circle cx="32" cy="32" r="21" fill="none" stroke="${OUT}" stroke-width="1.4" opacity=".4"/>`,
    spark(44, 18, 4), spark(20, 44, 2.6),
  ].join(''),
  plate_armor: (p) => [
    P(torso(), p.m),
    E(32, 13, 7, 3.5, OUT, 0),
    L('M32 16V50', OUT, 1.2, 0.35),
    L('M20 38Q32 42 44 38M20 45Q32 49 44 45', OUT, 1.2, 0.35),
    E(12, 20, 8, 7, p.m, LW, -20), E(52, 20, 8, 7, p.m, LW, 20),
    `<path d="M5.5 22Q12 14 19 17" fill="none" stroke="${p.tint}" stroke-width="2" opacity=".9"/>`,
    `<path d="M58.5 22Q52 14 45 17" fill="none" stroke="${p.tint}" stroke-width="2" opacity=".9"/>`,
    P(star(32, 26, 4, 2.6, 7), p.t, 2),
    S('M18 28L18 50Q22 53 26 54L26 16Q20 13 15 15L12 23Z', 0.25),
    R(17, 49, 30, 5, 2, p.t, 2.2),
  ].join(''),
  chainmail: (p) => [
    `<defs><pattern id="chn" width="5" height="4.2" patternUnits="userSpaceOnUse"><path d="M0 2.1A2.5 2.1 0 0 1 5 2.1" fill="none" stroke="${OUT}" stroke-width=".8" opacity=".45"/><path d="M-2.5 4.2A2.5 2.1 0 0 1 2.5 4.2M2.5 4.2A2.5 2.1 0 0 1 7.5 4.2" fill="none" stroke="${OUT}" stroke-width=".8" opacity=".45"/></pattern></defs>`,
    P(torso(), p.m),
    `<path d="${torso()}" fill="url(#chn)"/>`,
    E(32, 13, 7, 3.5, OUT, 0),
    R(17, 46, 30, 6, 2, p.leather, 2.2), R(28.5, 45, 7, 8, 1.5, p.t, 2),
    S('M18 28L18 46L24 46L24 14Q19 13 15 15L12 23Z', 0.22),
    E(12, 20, 7, 6, p.leather, LW, -20), E(52, 20, 7, 6, p.leather, LW, 20),
  ].join(''),
  leather_vest: (p) => [
    P(torso(), p.leather),
    P('M14 14Q22 7 32 14Q42 7 50 14L46 18Q38 13 32 19Q26 13 18 18Z', p.cloth, 2.2),
    L('M32 19V52', OUT, 1.4, 0.5),
    L('M29 24L35 27M35 24L29 27M29 31L35 34M35 31L29 34M29 38L35 41M35 38L29 41', '#f1e2c4', 1.1),
    L('M20 30Q19 40 20 50M44 30Q45 40 44 50', '#f1e2c4', 0.8, 0.6),
    R(17, 46, 30, 5, 2, p.dark, 2), R(29, 45, 6, 7, 1.5, p.t, 2),
    S('M18 28L18 46L24 46L24 20L18 20Z', 0.15),
  ].join(''),
  robe: (p) => [
    P('M22 7L42 7L48 18L58 30L50 35L46 28L49 59L15 59L18 28L14 35L6 30L16 18Z', p.cloth),
    P('M26 7L32 18L38 7Z', p.clothDark, 2),
    L('M32 18V59', p.tint, 2.2, 0.95),
    `<path d="M15.4 57H48.6" stroke="${p.tint}" stroke-width="2.4"/>`,
    R(18, 31, 28, 5, 2, p.t, 2.2), gem(32, 33.5, 3.2, p),
    P(star(32, 46, 4, 1.8, 5), p.glow, 1.4),
    S('M22 9L18 20L20 57L26 57L26 18Z', 0.18),
  ].join(''),
  cloak: (p) => [
    P('M18 9Q32 5 46 9L53 56Q43 50 32 58Q21 50 11 56Z', p.cloth),
    P('M22 12Q32 10 42 12L46 50Q39 46 32 52Q25 46 18 50Z', p.clothDark, 0),
    L('M12 54Q21 48 32 56Q43 48 52 54', p.tint, 2.2, 0.95),
    T('M20 10Q32 15 44 10', p.t, 2.4),
    C(32, 12.5, 5, p.t), gem(32, 12.5, 3, p, 1.6),
    S('M18.5 11L13 52L17 50L21 14Z', 0.3),
  ].join(''),
  bracers: (p) => [
    G('rotate(-14 22 32)', R(14, 12, 16, 40, 6, p.m), R(12.5, 15, 19, 5, 2, p.t, 2.2), R(12.5, 44, 19, 5, 2, p.t, 2.2), S('M16 20L16 43L19 43L19 20Z', 0.4)),
    G('rotate(14 42 32)', R(34, 12, 16, 40, 6, p.m), R(32.5, 15, 19, 5, 2, p.t, 2.2), R(32.5, 44, 19, 5, 2, p.t, 2.2), gem(42, 32, 3.4, p)),
  ].join(''),
  thorn_armor: (p) => [
    ...[[10, 16, -2.3], [54, 16, -0.8], [8, 30, 3.0], [56, 30, 0.1], [16, 46, 2.6], [48, 46, 0.5], [22, 8, -2.0], [42, 8, -1.1]].map(([x, y, a]) =>
      P(`M${x - Math.sin(a) * 3} ${y + Math.cos(a) * 3}L${x + Math.cos(a) * 8} ${y + Math.sin(a) * 8}L${x + Math.sin(a) * 3} ${y - Math.cos(a) * 3}Z`, p.tint, 2)),
    P(torso(), p.m),
    L('M22 16Q24 30 20 50M32 16Q30 32 33 54M42 16Q40 30 44 50', OUT, 1.2, 0.4),
    `<path d="M24 26L28 24L26 30ZM38 34L42 32L40 38ZM26 42L30 40L28 46Z" fill="${p.tint}" stroke="${OUT}" stroke-width="1"/>`,
    E(32, 13, 7, 3.5, OUT, 0),
    S('M18 28L18 50L23 52L24 15Q19 13 15 15L12 23Z', 0.18),
  ].join(''),

  // Hats.
  knight_helm: (p) => [
    P('M32 9Q30 -2 41 0Q52 2 54 12Q46 7 39 11Z', p.cloth, 2.2),
    P('M16 34Q14 10 32 8Q50 10 48 34L48 50Q32 57 16 50Z', p.m),
    L('M32 9V27', OUT, 1.2, 0.4),
    R(18, 27, 28, 5, 2.5, OUT, 0),
    L('M24 38V44M28 39V45M36 39V45M40 38V44', OUT, 1.6, 0.6),
    `<path d="M16.5 35Q32 39 47.5 35" fill="none" stroke="${p.tint}" stroke-width="2"/>`,
    S('M18 30Q17 13 30 10L28 12Q20 16 21 30Z', 0.45),
  ].join(''),
  horned_helm: (p) => [
    P('M17 28Q4 24 3 7Q11 18 21 20Z', p.bone), mirrorX(P('M17 28Q4 24 3 7Q11 18 21 20Z', p.bone)),
    L('M8 17.5L11 15M11.5 21.5L14 19', OUT, 1, 0.5), mirrorX(L('M8 17.5L11 15M11.5 21.5L14 19', OUT, 1, 0.5)),
    P('M14 40Q14 12 32 12Q50 12 50 40Z', p.m),
    S('M17 36Q17 16 30 14.5L29 17Q21 20 20 36Z', 0.4),
    R(11, 35, 42, 8, 3, p.t),
    ...[17, 26, 38, 47].map((x) => C(x, 39, 1.5, p.m, 1)),
    R(29.5, 40, 5, 16, 2, p.m, 2.2),
    gem(32, 25, 3.4, p),
  ].join(''),
  hood: (p) => [
    P('M10 57Q7 22 32 6Q57 22 54 57Q44 50 32 53Q20 50 10 57Z', p.cloth),
    P('M19 51Q17 27 32 18Q47 27 45 51Q32 46 19 51Z', '#120c1e', 2.2),
    E(26.5, 36, 3, 1.7, p.glow, 0), E(37.5, 36, 3, 1.7, p.glow, 0),
    halo(26.5, 36, 3.5, p.tint, 0.4), halo(37.5, 36, 3.5, p.tint, 0.4),
    L('M32 7Q30 14 32 18', OUT, 1.2, 0.35),
    S('M12 54Q10 26 30 9L27 14Q15 28 16 52Z', 0.22),
    P('M24 52Q32 58 40 52L36 60L28 60Z', p.t, 2),
  ].join(''),
  wizard_hat: (p) => [
    E(32, 50, 28, 7.5, p.cloth),
    P('M15 48Q24 32 29 14Q33 2 47 3Q39 8 38 20L49 48Q32 53 15 48Z', p.cloth),
    P('M16.5 45Q32 50 47.6 45L49 49Q32 54 15 49Z', p.t, 2),
    R(28, 43.5, 8, 7, 1.5, p.t, 2), R(30.5, 45.5, 3, 3, 0.5, OUT, 0),
    S('M18 46Q25 31 29 16L31 16Q27 32 23 47Z', 0.25),
    halo(47, 4, 6, p.tint, 0.45),
    P(star(47, 4, 5, 2.4, 5.6), p.glow, 1.8),
    spark(22, 24, 2.2), spark(40, 30, 1.6),
  ].join(''),
  crown: (p) => [
    P('M11 49L10 21L21 31L32 12L43 31L54 21L53 49Z', p.m),
    S('M12.5 25L13 46L18 46L18 30Z', 0.35),
    R(10, 41, 44, 10, 2.5, p.t),
    C(10, 20, 3, p.m, 2.2), C(32, 11, 3.4, p.m, 2.2), C(54, 20, 3, p.m, 2.2),
    gem(32, 30, 4.6, p), gem(20, 46, 2.6, p, 1.6), gem(44, 46, 2.6, p, 1.6),
    `<path d="M26 46h0M38 46h0" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  ].join(''),
  circlet: (p) => [
    T('M8 33Q32 23 56 33', p.t, 3),
    T('M8 33Q32 51 56 33', p.m, 4),
    P('M32 28Q44 32 39 40Q34 44 32 50Q30 44 25 40Q20 32 32 28Z', p.m),
    P('M21 37Q14 30 15 23Q20 31 26 34Z', p.m, 2), mirrorX(P('M21 37Q14 30 15 23Q20 31 26 34Z', p.m, 2)),
    P('M32 31L37 38L32 46L27 38Z', p.gem, 2), S('M32 32L28.5 38L32 38Z', 0.6),
    halo(32, 38, 9, p.tint, 0.3),
  ].join(''),
  kasa: (p) => [
    P('M3 41Q32 4 61 41Q32 50 3 41Z', p.wood),
    L('M32 11L12 42M32 11L22 45M32 11L32 46M32 11L42 45M32 11L52 42', OUT, 0.9, 0.35),
    P('M15 32Q32 26 49 32L52 36Q32 30 12 36Z', p.cloth, 2),
    S('M7 39Q20 22 30 12L26 20Q15 31 12 40Z', 0.3),
    P('M24 45Q22 54 18 60L21 61Q26 54 27 46Z', p.cloth, 1.8), P('M40 45Q42 54 46 60L43 61Q38 54 37 46Z', p.cloth, 1.8),
  ].join(''),
  bandana: (p) => [
    P('M44 30Q56 34 60 50Q52 46 46 38Z', p.cloth, 2.2),
    P('M46 30Q58 26 62 16Q52 22 44 26Z', p.cloth, 2.2),
    P('M8 36Q8 14 32 13Q52 14 52 32Q44 24 32 25Q16 25 8 36Z', p.cloth),
    P('M8 36Q16 25 32 25Q44 24 52 32L52 38Q42 31 32 32Q18 32 8 42Z', p.clothDark),
    ...[[18, 19], [30, 17], [42, 20], [24, 22], [37, 21]].map(([x, y]) => C(x, y, 1.5, '#f4ecdc', 0)),
    C(48, 31, 4.5, p.clothDark, 2.2),
    S('M10 34Q11 18 26 15L22 19Q14 24 13 32Z', 0.3),
  ].join(''),
  demon_mask: (p) => [
    P('M17 18Q8 12 9 0Q14 10 22 12Z', p.bone), mirrorX(P('M17 18Q8 12 9 0Q14 10 22 12Z', p.bone)),
    P('M14 17Q32 7 50 17Q55 36 45 53Q32 60 19 53Q9 36 14 17Z', p.cloth),
    P('M17 26L28 30L27 34L17 31Z', OUT, 0), mirrorX(P('M17 26L28 30L27 34L17 31Z', OUT, 0)),
    E(23, 31, 3, 1.6, '#ffe27a', 0, 15), E(41, 31, 3, 1.6, '#ffe27a', 0, -15),
    P('M30 34L32 40L34 34Z', p.clothDark, 1.6),
    P('M20 44Q32 52 44 44L42 50Q32 55 22 50Z', OUT, 1.6),
    P('M23 45L25 50L27 46ZM37 46L39 50L41 45Z', '#fffaf0', 0),
    P('M28 47L30 50L31 47.5ZM33 47.5L34 50L36 47Z', '#fffaf0', 0),
    S('M16 20Q28 11 40 13L30 16Q20 20 18 30Z', 0.25),
  ].join(''),
  feathered_cap: (p) => [
    halo(52, 10, 9, p.tint, 0.35),
    P('M38 24Q50 4 63 1Q58 14 45 28Z', p.glow, 2),
    L('M41 25Q51 12 60 4', OUT, 1, 0.5),
    P('M6 42Q18 18 38 17Q56 18 59 34Q40 30 6 42Z', p.cloth),
    P('M6 42Q36 30 59 34L58 39Q34 36 9 47Z', p.t, 2.2),
    S('M9 39Q18 22 32 19L27 23Q16 29 13 38Z', 0.3),
  ].join(''),
  skull_helm: (p) => [
    P('M17 22Q4 18 6 2Q12 14 22 15Z', p.dark), mirrorX(P('M17 22Q4 18 6 2Q12 14 22 15Z', p.dark)),
    P('M13 32Q12 9 32 8Q52 9 51 32Q51 42 45 46L45 54L19 54L19 46Q13 42 13 32Z', p.m),
    P('M18 28Q20 22 27 25Q29 32 24 36Q18 35 18 28Z', OUT, 0), mirrorX(P('M18 28Q20 22 27 25Q29 32 24 36Q18 35 18 28Z', OUT, 0)),
    C(23.5, 30.5, 2.2, p.glow, 0), C(40.5, 30.5, 2.2, p.glow, 0),
    halo(23.5, 30.5, 4, p.tint, 0.45), halo(40.5, 30.5, 4, p.tint, 0.45),
    P('M30 38L32 42L34 38Z', OUT, 0),
    L('M23 46V54M28 46V54M32 46V54M36 46V54M41 46V54', OUT, 1.2, 0.55),
    S('M16 28Q16 12 28 10L25 14Q19 18 19 28Z', 0.4),
  ].join(''),

  // Boots: a pair, the back one offset and shaded.
  plate_greaves: (p) => boots(p, p.m, (front) => [
    E(26, 14, 7, 6, p.t, front ? LW : 2),
    L('M17 26H35M17 34H35M35 42Q46 42 52 48', OUT, 1.2, 0.4),
    `<path d="M14 54H56" stroke="${p.tint}" stroke-width="2"/>`,
    S('M19 8L19 30L23 30L23 8Z', 0.35),
  ]),
  leather_boots: (p) => boots(p, p.leather, () => [
    P('M15 5L37 5L37 16L15 16Z', p.cloth, 2.2),
    L('M26 20L33 22M26 25L33 27M26 30L33 32', '#f1e2c4', 1.2),
    `<path d="M13 53H57" stroke="${OUT}" stroke-width="4"/>`,
    S('M19 17L19 32L22 32L22 17Z', 0.25),
  ]),
  winged_boots: (p) => boots(p, p.m, (front) => front ? [
    halo(12, 22, 8, p.tint, 0.3),
    P('M18 24Q4 22 1 10Q8 16 18 17Z', p.glow, 2), P('M18 30Q2 32 0 20Q8 26 18 25Z', p.glow, 2), P('M18 35Q6 40 3 32Q10 34 18 31Z', p.glow, 2),
    R(15, 26, 22, 4, 1.5, p.t, 2),
    S('M19 8L19 26L22 26L22 8Z', 0.3),
  ] : [R(15, 26, 22, 4, 1.5, p.t, 2)]),
  sandals: (p) => [
    G('translate(6 -6)', `<g opacity=".6">${sandal(p)}</g>`),
    sandal(p),
  ].join(''),
  spiked_boots: (p) => boots(p, p.dark, (front) => [
    ...(front ? [P('M17 14L9 11L17 19Z', p.steel, 1.8), P('M17 24L9 22L17 29Z', p.steel, 1.8), P('M55 46L63 43L57 52Z', p.steel, 1.8)] : []),
    R(15, 30, 22, 5, 2, p.t, 2),
    L('M35 42Q46 42 52 48', OUT, 1.2, 0.4),
    S('M19 8L19 28L22 28L22 8Z', 0.25),
  ]),
  cloud_boots: (p) => boots(p, p.cloth, (front) => [
    R(15, 6, 22, 6, 2.5, p.t, 2),
    ...(front ? [[14, 56, 6], [24, 58, 7], [36, 58, 7], [48, 57, 6], [57, 54, 4.5]].map(([x, y, r]) => C(x, y, r, '#f6fbff', 2)) : []),
    `<path d="M20 22Q28 18 30 26Q24 30 22 26" fill="none" stroke="${p.tintLight}" stroke-width="1.6"/>`,
    S('M19 13L19 30L22 30L22 13Z', 0.3),
  ]),

  // Specials.
  amulet: (p) => [
    `<path d="M13 3Q32 38 51 3" fill="none" stroke="${OUT}" stroke-width="4.6" stroke-linecap="round"/><path d="M13 3Q32 38 51 3" fill="none" stroke="#f0bd48" stroke-width="2" stroke-dasharray="2.4 1.6"/>`,
    halo(32, 44, 16, p.tint, 0.3),
    P('M32 26Q47 34 32 61Q17 34 32 26Z', p.m),
    P('M32 32Q41 38 32 54Q23 38 32 32Z', p.gem, 2),
    S('M30 36Q27 40 29 46L31 36Z', 0.75),
    C(32, 24.5, 3, p.m, 2),
  ].join(''),
  ring: (p) => [
    `<path d="M32 24A18 15 0 1 1 31.9 24ZM32 30A12 9.5 0 1 0 32.1 30Z" transform="translate(0 6)" fill="${p.m}" fill-rule="evenodd" ${stroke()}/>`,
    `<path d="M16 40A16 13 0 0 1 24 29" fill="none" stroke="#fff" stroke-width="1.8" opacity=".55" transform="translate(0 6)"/>`,
    P('M24 26L28 18L36 18L40 26L32 32Z', p.m, 2.2),
    halo(32, 15, 12, p.tint, 0.3),
    P('M23 14L27 7L37 7L41 14L32 24Z', p.gem, 2.2),
    L('M27 7L30 14L34 14L37 7M23 14H41M30 14L32 24L34 14', OUT, 0.9, 0.45),
    S('M27.5 8L25 13.5L29.5 13.5Z', 0.8),
    spark(46, 6, 3),
  ].join(''),
  feather: (p) => [
    halo(36, 28, 20, p.tint, 0.25),
    P('M47 4Q63 22 41 45Q31 55 16 59Q26 46 28 36Q30 13 47 4Z', p.glow),
    P('M47 4Q50 22 41 45Q31 55 16 59Q30 44 34 30Q38 14 47 4Z', p.tint, 0, 'opacity=".55"'),
    L('M46 7Q38 30 15 60', OUT, 1.6, 0.75),
    L('M43 14L50 14M40 21L52 24M37 28L51 33M33 36L46 40M29 42L40 47', OUT, 0.8, 0.35),
    L('M41 13L33 15M38 20L30 24M34 28L28 32', '#fff', 1, 0.6),
    spark(14, 40, 2.6), spark(54, 46, 2.2), spark(22, 22, 1.6),
  ].join(''),
  hourglass: (p) => [
    R(14, 6, 36, 6, 2.5, p.m), R(14, 52, 36, 6, 2.5, p.m),
    P('M20 12Q20 26 30 32Q20 38 20 52L44 52Q44 38 34 32Q44 26 44 12Z', '#dff4ff', 2.2, 'fill-opacity=".55"'),
    P('M24 18Q30 22 40 18Q38 26 32 30Q26 26 24 18Z', p.tint, 0),
    L('M32 30V48', p.tint, 1.4),
    P('M22 52Q24 44 32 42Q40 44 42 52Z', p.tint, 0),
    S('M22 14Q22 24 28 29L26 29Q20 24 21 14Z', 0.7),
    R(15, 12, 3.5, 40, 1.5, p.m, 2), R(45.5, 12, 3.5, 40, 1.5, p.m, 2),
    halo(32, 32, 10, p.tint, 0.25),
  ].join(''),
  relic_orb: (p) => [
    halo(32, 32, 24, p.tint, 0.35),
    `<ellipse cx="32" cy="32" rx="27" ry="9" transform="rotate(-25 32 32)" fill="none" stroke="${OUT}" stroke-width="4.4"/><ellipse cx="32" cy="32" rx="27" ry="9" transform="rotate(-25 32 32)" fill="none" stroke="${p.tintLight}" stroke-width="1.8"/>`,
    C(32, 32, 15, p.gem),
    `<path d="M22 33Q28 25 36 28Q32 34 41 38" fill="none" stroke="${p.tintLight}" stroke-width="1.8" opacity=".8"/>`,
    S('M22 27A11 11 0 0 1 30 20L30 23A8 8 0 0 0 24.5 28Z', 0.85),
    `<path d="M8 44Q30 46 57 24" fill="none" stroke="${OUT}" stroke-width="4.4" stroke-linecap="round"/><path d="M8 44Q30 46 57 24" fill="none" stroke="${p.tintLight}" stroke-width="1.8" stroke-linecap="round"/>`,
    spark(50, 12, 3), spark(14, 50, 2),
  ].join(''),
  totem: (p) => [
    P('M14 12Q24 10 26 18L22 22Q18 16 14 12Z', p.cloth, 2), mirrorX(P('M14 12Q24 10 26 18L22 22Q18 16 14 12Z', p.cloth, 2)),
    R(21, 8, 22, 52, 5, p.m),
    E(26.5, 20, 3.2, 2.2, p.glow, 1.4), E(37.5, 20, 3.2, 2.2, p.glow, 1.4),
    P('M28 28H36L34 31H30Z', OUT, 0),
    R(21, 34, 22, 4, 1.5, p.cloth, 2),
    E(27, 45, 2.6, 2, OUT, 0), E(37, 45, 2.6, 2, OUT, 0),
    L('M26 52Q32 56 38 52', OUT, 1.6),
    P('M14 6L19 2L22 8ZM50 6L45 2L42 8Z', p.cloth, 1.8),
    S('M23 12L23 56L26 56L26 12Z', 0.25),
  ].join(''),
  vial: (p) => [
    halo(32, 40, 18, p.tint, 0.3),
    P('M27 8L37 8L37 22Q51 28 49 43Q47 58 32 58Q17 58 15 43Q13 28 27 22Z', '#e8f6ff', 2.8, 'fill-opacity=".55"'),
    P('M16.5 40Q24 36 32 40Q40 44 47.5 40Q47 56 32 56.5Q17 56 16.5 40Z', p.gem, 0),
    C(27, 47, 2, '#fff', 0), C(36, 44, 1.4, '#fff', 0), C(31, 51, 1.1, '#fff', 0),
    R(25, 4, 14, 7, 2, p.wood, 2.2),
    S('M20 32Q22 26 27 24L27 28Q23 30 22 35Z', 0.7),
  ].join(''),
  rune_stone: (p) => [
    halo(32, 33, 20, p.tint, 0.3),
    P('M18 12Q32 4 46 12Q54 30 46 52Q32 60 18 52Q10 30 18 12Z', p.m),
    `<path d="M32 16L32 48M24 22L40 42M40 22L24 42M26 18Q32 24 38 18" fill="none" stroke="${p.tint}" stroke-width="2.6" stroke-linecap="round"/>`,
    `<path d="M32 16L32 48M24 22L40 42M40 22L24 42" fill="none" stroke="#fff" stroke-width=".9" opacity=".8"/>`,
    S('M20 14Q26 10 30 9.5L22 18Q16 30 18 44Q13 28 20 14Z', 0.2),
  ].join(''),
  skull: (p) => [
    P('M12 30Q11 8 32 7Q53 8 52 30Q52 41 45 45L45 54L19 54L19 45Q12 41 12 30Z', p.m),
    P('M17 27Q19 20 27 23Q29 31 24 35Q17 34 17 27Z', OUT, 0), mirrorX(P('M17 27Q19 20 27 23Q29 31 24 35Q17 34 17 27Z', OUT, 0)),
    C(23, 29, 2.3, p.glow, 0), C(41, 29, 2.3, p.glow, 0),
    halo(23, 29, 4, p.tint, 0.45), halo(41, 29, 4, p.tint, 0.45),
    P('M30 37L32 42L34 37Z', OUT, 0),
    L('M23 46V54M28 46V54M32 46V54M36 46V54M41 46V54', OUT, 1.2, 0.55),
    L('M38 9L35 16L39 19', OUT, 1, 0.5),
    S('M15 27Q15 11 28 9L25 13Q18 17 18 27Z', 0.45),
  ].join(''),
  horn: (p) => [
    P('M8 14Q14 8 18 12Q30 34 52 40L56 50Q28 52 10 26Q6 20 8 14Z', p.m),
    E(56, 45, 4, 7, '#3a2a20', LW, 18),
    R(17, 18, 6, 9, 1.5, p.t, 2).replace('/>', ' transform="rotate(-38 20 22)"/>'),
    R(32, 34, 7, 11, 1.5, p.t, 2).replace('/>', ' transform="rotate(-62 35 39)"/>'),
    P('M7 15L3 12L8 10Z', p.t, 1.8),
    S('M10 17Q12 12 16 14Q28 33 48 40L46 42Q26 36 12 21Z', 0.4),
    `<path d="M26 52Q30 57 36 55" stroke="${p.tint}" stroke-width="2.2" fill="none"/>`,
  ].join(''),
  lantern: (p) => [
    T('M24 10Q32 0 40 10', p.m, 2.4),
    halo(32, 34, 20, p.tint, 0.4),
    R(20, 10, 24, 6, 2, p.m),
    R(21, 16, 22, 30, 3, '#fff6dc', 2.6).replace('fill="#fff6dc"', `fill="${p.glow}"`),
    L('M28 16V46M36 16V46', OUT, 2, 0.7),
    R(18, 45, 28, 7, 2.5, p.m),
    S('M23 18L23 44L26 44L26 18Z', 0.6),
    P('M32 24Q36 30 33.5 36L30.5 36Q28 30 32 24Z', '#fff', 0),
  ].join(''),
  mirror: (p) => [
    R(29, 42, 6, 18, 2.4, p.m), C(32, 61, 3, p.m, 2),
    E(32, 24, 17, 21, p.m),
    E(32, 24, 12.5, 16.5, p.gem, 2),
    `<path d="M24 30L36 12M27 35L40 17" stroke="#fff" stroke-width="2.4" opacity=".65" stroke-linecap="round"/>`,
    gem(32, 45, 2.4, p, 1.4),
    spark(46, 10, 3),
  ].join(''),
  fang: (p) => [
    P('M22 6Q46 2 44 15Q41 40 30 60Q26 40 19 18Q17 8 22 6Z', p.bone),
    S('M23 9Q20 12 22 20Q26 38 29 50Q27 34 26 20Q25 12 27 8Z', 0.6),
    L('M24 16Q31 15 40 17', OUT, 1, 0.35),
    P('M34 34Q37 40 35 46Q33 42 33 37Z', p.tint, 1.4),
    C(35, 50, 2, p.tint, 1.2),
  ].join(''),
  heart: (p) => [
    halo(32, 32, 22, p.tint, 0.3),
    P('M32 56L11 33Q4 22 12 13Q22 6 32 17Q42 6 52 13Q60 22 53 33Z', p.t),
    P('M32 50L15 32Q10 24 16 17Q23 12 32 21Q41 12 48 17Q54 24 49 32Z', p.gem, 2),
    S('M17 20Q21 16 26 18L19 27Z', 0.7),
    L('M32 21L32 50M22 26L32 34L42 26', OUT, 0.8, 0.3),
  ].join(''),
  belt: (p) => [
    P('M2 26Q32 18 62 26L62 40Q32 32 2 40Z', p.leather),
    L('M4 29Q32 21.5 60 29M4 37Q32 29.5 60 37', '#f1e2c4', 0.8, 0.6),
    R(20, 16, 24, 28, 4, p.m),
    R(25, 21, 14, 18, 2, OUT, 0),
    P('M29 23L35 23L35 37L29 37Z', p.leather, 0),
    gem(32, 30, 4, p),
    S('M22 18L22 42L25 42L25 18Z', 0.35),
  ].join(''),
  sigil: (p) => [
    halo(32, 32, 24, p.tint, 0.35),
    P(star(32, 32, 6, 22, 22, 0), p.m),
    P(star(32, 32, 6, 17, 17, 0), p.dark, 2),
    `<path d="${star(32, 32, 6, 7, 14)}" fill="${p.glow}" stroke="${p.tint}" stroke-width="1.2"/>`,
    C(32, 32, 3.4, '#fff', 0),
    S('M14 22L32 11L32 15L17.5 23.5Z', 0.4),
  ].join(''),
  core: (p) => [
    halo(32, 32, 24, p.tint, 0.45),
    T('M32 6Q24 32 32 58', p.m, 1.6), T('M32 6Q40 32 32 58', p.m, 1.6),
    P('M32 12L45 32L32 52L19 32Z', p.glow, 2.4),
    `<path d="M32 12L36 32L32 52M19 32H45" fill="none" stroke="${p.tint}" stroke-width="1.2" opacity=".8"/>`,
    S('M32 14L21.5 31.5L32 31.5Z', 0.55),
    T('M32 6Q11 32 32 58', p.m, 2.6), T('M32 6Q53 32 32 58', p.m, 2.6),
    E(32, 6, 6.5, 3, p.m, 2.4), E(32, 58, 6.5, 3, p.m, 2.4),
    spark(49, 14, 2.8, p.tintLight), spark(14, 46, 2.2, p.tintLight), spark(51, 50, 1.6),
  ].join(''),
  holy_relic: (p) => [
    halo(32, 30, 26, p.tint, 0.35),
    `<path d="${star(32, 30, 16, 13, 27)}" fill="${p.tintLight}" opacity=".55"/>`,
    P('M22 34Q8 30 3 18Q12 22 22 26Q12 18 10 10Q18 16 24 24Z', '#fffaf0', 2.2),
    mirrorX(P('M22 34Q8 30 3 18Q12 22 22 26Q12 18 10 10Q18 16 24 24Z', '#fffaf0', 2.2)),
    P('M28.5 6H35.5V18H46V25H35.5V56H28.5V25H18V18H28.5Z', p.m),
    S('M30 7.5H32.5V54H30Z', 0.45),
    gem(32, 21.5, 4, p),
  ].join(''),
  spectral_sword: (p) => [
    halo(32, 32, 26, p.tint, 0.4),
    `<g opacity=".9">${diag(
      P('M32 -2L37.5 8L37.5 45L26.5 45L26.5 8Z', p.glow, 2.4),
      L('M32 6V42', '#fff', 1.8, 0.85),
      P('M15 44Q16 50 22 49L42 49Q48 50 49 44Z', p.gem, 2.2),
      R(29, 50, 6, 12, 2, p.gem, 2),
      C(32, 65, 4.2, p.gem, 2),
    )}</g>`,
    `<path d="M10 54Q16 48 14 40M54 12Q50 18 52 24M44 54Q40 50 44 44" fill="none" stroke="${p.tintLight}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
    spark(50, 44, 2.6), spark(14, 18, 2.2),
  ].join(''),
  chain: (p) => [
    ...[0, 1, 2, 3, 4].map((k) => {
      const x = 10 + k * 10.5, y = 54 - k * 10.5;
      const vertical = k % 2 === 1;
      return `<ellipse cx="${x}" cy="${y}" rx="${vertical ? 4.2 : 8}" ry="${vertical ? 8 : 4.2}" transform="rotate(-45 ${x} ${y})" fill="none" stroke="${OUT}" stroke-width="${4.2 + LW}"/>`
        + `<ellipse cx="${x}" cy="${y}" rx="${vertical ? 4.2 : 8}" ry="${vertical ? 8 : 4.2}" transform="rotate(-45 ${x} ${y})" fill="none" stroke="${p.m}" stroke-width="4.2"/>`;
    }),
    C(54, 11, 6, p.t), gem(54, 11, 3, p, 1.4),
  ].join(''),
};

function boots(_p: Paint, fill: string, extra: (front: boolean) => string[]): string {
  return [
    G('translate(7 -5)', `<g opacity=".72">${P(bootShape(), fill)}${extra(false).join('')}</g>`, D(bootShape(), 0.3)),
    P(bootShape(), fill),
    ...extra(true),
    P('M13 52L57 52L57 56L13 56Z', OUT, 0, 'opacity=".55"'),
  ].join('');
}

function sandal(p: Paint): string {
  return [
    P('M10 50Q10 45 16 45L52 45Q60 46 58 51Q56 55 50 55L15 55Q10 55 10 50Z', p.leather),
    L('M13 50.5H56', OUT, 1, 0.35),
    T('M18 45Q22 36 30 37Q40 38 46 45', p.leather, 2.8),
    T('M19 36L31 28M31 36L19 28M19 27L31 19M31 27L19 19M19 18L31 10', p.leather, 2.4),
    T('M17 11Q25 7 33 11', p.t, 2.4),
    P('M33 26Q44 20 46 12Q38 16 32 22Z', p.cloth, 1.8),
    C(25, 36.5, 2.6, p.t, 1.6),
  ].join('');
}

// --- framing ---------------------------------------------------------------------

export interface IconOptions {
  rarity?: Rarity;
  /** Draw the rarity frame and glow backdrop (default true). */
  frame?: boolean;
}

function frame(r: ResolvedArt, rarity: Rarity): { back: string; front: string; defs: string } {
  const rc = RARITY_COLOR[rarity];
  const bgA = mix(dark(r.tint, 0.55), dark(rc, 0.6), 0.5);
  const d = `<radialGradient id="Bg" cx=".5" cy=".42" r=".72"><stop offset="0" stop-color="${css(bgA)}"/><stop offset="1" stop-color="#0f0b1c"/></radialGradient>`
    + `<linearGradient id="Rb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${css(light(rc, 0.45))}"/><stop offset=".5" stop-color="${css(rc)}"/><stop offset="1" stop-color="${css(dark(rc, 0.35))}"/></linearGradient>`;
  const back = `<rect x="1.5" y="1.5" width="61" height="61" rx="12" fill="url(#Bg)"/>`
    + `<circle cx="32" cy="31" r="22" fill="${css(r.tint)}" opacity=".16"/>`
    + `<circle cx="32" cy="31" r="13" fill="${css(light(r.tint, 0.3))}" opacity=".12"/>`
    + `<ellipse cx="32" cy="55" rx="18" ry="3.6" fill="#000" opacity=".28"/>`;
  const front = `<path d="M6 14Q8 6 16 5L48 5Q40 9 30 10Q14 12 6 22Z" fill="#fff" opacity=".07"/>`
    + `<rect x="1.5" y="1.5" width="61" height="61" rx="12" fill="none" stroke="url(#Rb)" stroke-width="2.6"/>`
    + `<rect x="4" y="4" width="56" height="56" rx="9.5" fill="none" stroke="#fff" stroke-width=".7" opacity=".14"/>`
    + (rarity === 'legendary' || rarity === 'epic' ? spark(55, 9, 3.2, css(light(rc, 0.6))) : '');
  return { back, front, defs: d };
}

const cache = new Map<string, string>();

/** SVG markup for an item icon. */
export function itemIconSvg(art: ItemArt, o: IconOptions = {}): string {
  const r = resolveArt(art);
  const { defs: d, p } = defs(r);
  const withFrame = o.frame !== false;
  const fr = withFrame ? frame(r, o.rarity ?? 'rare') : null;
  const draw = DRAW[r.art] ?? DRAW.relic_orb;
  // The drawing is inset inside the frame so outlines never touch the border.
  const body = withFrame ? G('translate(4.5 3.8) scale(.86)', draw(p)) : G('translate(2 2) scale(.9375)', draw(p));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${d}${fr?.defs ?? ''}</defs>${fr?.back ?? ''}${body}${fr?.front ?? ''}</svg>`;
}

/** Cached `data:` URL for an item icon (use as <img src> or CSS background). */
export function itemIconUrl(art: ItemArt, o: IconOptions = {}): string {
  const key = `${art.art}|${art.tint}|${art.metal}|${art.cloth}|${art.element}|${o.rarity}|${o.frame}`;
  let url = cache.get(key);
  if (!url) {
    url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(itemIconSvg(art, o));
    cache.set(key, url);
  }
  return url;
}

/** <img> element for an item icon. */
export function itemIconImg(art: ItemArt, o: IconOptions & { size?: number; className?: string; alt?: string } = {}): HTMLImageElement {
  const img = document.createElement('img');
  img.src = itemIconUrl(art, o);
  img.alt = o.alt ?? '';
  img.draggable = false;
  img.decoding = 'async';
  img.className = o.className ?? 'item-icon';
  if (o.size) { img.width = o.size; img.height = o.size; }
  return img;
}
