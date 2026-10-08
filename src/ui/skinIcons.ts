import { SKIN_THEMES, skinnedArt, skinOf, type SkinDef, type SkinTheme } from '../gear/skins';
import { gearOf } from '../sim/gear';
import type { SkinChoice } from '../sim/loadout';
import type { GearId } from '../sim/types';
import { gearIcon, ICON_KIT, itemIconImg, type Draw, type IconDecor, type Paint } from './itemIcons';

// -----------------------------------------------------------------------------
// Skin icons, drawn in the same painted style as the item icons. Each theme
// dresses the frame (its own border colour, a backdrop and corner ornaments)
// and every skin with its own 3D silhouette gets a matching drawing.
// -----------------------------------------------------------------------------

const { OUT, LW, P, C, E, R, T, L, S, G, diag, halo, spark, gem, star, grip, mirrorX, boots, DRAW } = ICON_KIT;

// --- theme dressing -------------------------------------------------------------

function flames(color: string, op: number, dy = 0): string {
  return [
    `M4 63Q7 52 4 44Q12 49 12 40Q18 50 17 63Z`, `M19 63Q20 55 18 50Q24 54 25 47Q29 56 28 63Z`,
    `M36 63Q35 56 38 49Q41 55 46 52Q44 58 46 63Z`, `M47 63Q46 52 51 44Q53 51 60 47Q57 55 60 63Z`,
  ].map((d) => `<path d="${d}" fill="${color}" opacity="${op}" transform="translate(0 ${dy})"/>`).join('');
}

function leafPath(x: number, y: number, len: number, rot: number, fill: string, w = 1.4): string {
  return `<path d="M0 0Q${len * 0.35} ${-len * 0.32} ${len} 0Q${len * 0.35} ${len * 0.32} 0 0Z" transform="translate(${x} ${y}) rotate(${rot})" fill="${fill}" stroke="${OUT}" stroke-width="${w}" stroke-linejoin="round" paint-order="stroke"/>`;
}

function blossom(x: number, y: number, r: number): string {
  let s = '';
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    s += `<circle cx="${x + Math.cos(a) * r * 0.7}" cy="${y + Math.sin(a) * r * 0.7}" r="${r * 0.55}" fill="#ffb4d6" stroke="${OUT}" stroke-width="1" paint-order="stroke"/>`;
  }
  return s + `<circle cx="${x}" cy="${y}" r="${r * 0.38}" fill="#fff2a8"/>`;
}

const THEME_DECOR: Record<SkinTheme, () => IconDecor> = {
  hellforge: () => ({
    defs: `<radialGradient id="tbg" cx=".5" cy="1" r=".95"><stop offset="0" stop-color="#ff5a10" stop-opacity=".75"/><stop offset=".55" stop-color="#7a1606" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`,
    back: `<rect x="1.5" y="1.5" width="61" height="61" rx="12" fill="url(#tbg)"/>${flames('#ff6a1a', 0.32)}${flames('#ffc04a', 0.22, 6)}`
      + [[10, 14, 1.2], [53, 22, 1], [46, 9, 0.9], [8, 34, 0.8], [57, 38, 1.1]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffc861" opacity=".8"/>`).join(''),
    front: P('M3 16Q1 5 12 2Q8 7 9 14Z', '#2c2427', 1.6) + mirrorX(P('M3 16Q1 5 12 2Q8 7 9 14Z', '#2c2427', 1.6))
      + L('M5 13Q4 7 9 4', '#ff8a2a', 1, 0.9) + mirrorX(L('M5 13Q4 7 9 4', '#ff8a2a', 1, 0.9)) + spark(54, 52, 2.2, '#ffd070'),
    border: SKIN_THEMES.hellforge.color,
  }),
  rimeborn: () => ({
    defs: `<radialGradient id="tbg" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#bff4ff" stop-opacity=".35"/><stop offset="1" stop-color="#0a2a4a" stop-opacity=".2"/></radialGradient>`,
    back: `<rect x="1.5" y="1.5" width="61" height="61" rx="12" fill="url(#tbg)"/>`
      + G('translate(32 31)', ...[0, 60, 120].map((r) => `<path d="M-24 0H24M-15 -4L-11 0L-15 4M15 -4L11 0L15 4" transform="rotate(${r})" fill="none" stroke="#e8fbff" stroke-width="1.6" opacity=".16"/>`))
      + `<path d="M3 62L8 48L12 62ZM10 62L15 52L18 62ZM46 62L50 50L54 62ZM53 62L57 46L61 62Z" fill="#bff4ff" opacity=".45"/>`,
    front: [8, 15, 22, 42, 49, 56].map((x, i) => P(`M${x - 2.2} 3L${x} ${9 + (i % 2) * 4}L${x + 2.2} 3Z`, '#dff8ff', 1.2)).join('')
      + spark(52, 50, 2.6, '#ffffff') + spark(12, 44, 1.8, '#dff8ff'),
    border: 0x9fe9ff,
  }),
  dawnbringer: () => ({
    defs: `<radialGradient id="tbg" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="#fff2c0" stop-opacity=".45"/><stop offset="1" stop-color="#c88a20" stop-opacity=".1"/></radialGradient>`,
    back: `<rect x="1.5" y="1.5" width="61" height="61" rx="12" fill="url(#tbg)"/>`
      + Array.from({ length: 12 }, (_, k) => {
        const a = (k / 12) * Math.PI * 2, b = a + 0.13;
        return `<path d="M32 30L${32 + Math.cos(a) * 44} ${30 + Math.sin(a) * 44}L${32 + Math.cos(b) * 44} ${30 + Math.sin(b) * 44}Z" fill="#fff6d8" opacity=".13"/>`;
      }).join(''),
    front: [0, 1, 2].map((k) => P(`M${4 + k * 2.6} ${17 - k * 3}Q${2 + k * 3} ${7 - k * 2} ${12 + k * 2} ${4 - k}Q${9 + k * 2} ${10 - k * 2} ${7 + k * 2.6} ${16 - k * 3}Z`, '#fffbf0', 1.1)).join('')
      + mirrorX([0, 1, 2].map((k) => P(`M${4 + k * 2.6} ${17 - k * 3}Q${2 + k * 3} ${7 - k * 2} ${12 + k * 2} ${4 - k}Q${9 + k * 2} ${10 - k * 2} ${7 + k * 2.6} ${16 - k * 3}Z`, '#fffbf0', 1.1)).join(''))
      + spark(53, 52, 2.6, '#fff4c0'),
    border: 0xffd76a,
  }),
  voidborne: () => ({
    defs: `<radialGradient id="tbg" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#3a1670" stop-opacity=".55"/><stop offset="1" stop-color="#05030c" stop-opacity=".7"/></radialGradient>`,
    back: `<rect x="1.5" y="1.5" width="61" height="61" rx="12" fill="url(#tbg)"/>`
      + `<path d="M32 31m-20 0a20 20 0 1 1 20 20a14 14 0 1 1 -14 -14a8 8 0 1 1 8 8" fill="none" stroke="#b46bff" stroke-width="1.6" opacity=".45"/>`
      + `<path d="M32 31m16 -12a20 20 0 0 1 -6 30" fill="none" stroke="#ff4fd8" stroke-width="1.2" opacity=".5"/>`
      + [[9, 12], [55, 15], [12, 50], [50, 56], [44, 8], [6, 30], [58, 40], [24, 58]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${0.5 + (i % 3) * 0.35}" fill="#f4ecff" opacity=".85"/>`).join(''),
    front: P('M2 14L7 2L11 9Z', '#1d1631', 1.4) + P('M62 50L57 62L53 55Z', '#1d1631', 1.4)
      + L('M4 12L7 4', '#b46bff', 0.9, 0.9) + L('M60 52L57 60', '#b46bff', 0.9, 0.9) + spark(54, 10, 2.2, '#ff8ae6'),
    border: SKIN_THEMES.voidborne.color,
  }),
  wildwood: () => ({
    defs: `<radialGradient id="tbg" cx=".5" cy=".55" r=".75"><stop offset="0" stop-color="#9cff6a" stop-opacity=".25"/><stop offset="1" stop-color="#103a10" stop-opacity=".25"/></radialGradient>`,
    back: `<rect x="1.5" y="1.5" width="61" height="61" rx="12" fill="url(#tbg)"/>`
      + leafPath(4, 60, 14, -50, '#3f8a2e', 0) + leafPath(8, 62, 12, -20, '#5aa83a', 0) + leafPath(60, 60, 14, -130, '#3f8a2e', 0)
      + `<path d="M4 46Q14 50 12 62M60 44Q52 50 54 62" fill="none" stroke="#5f9c3c" stroke-width="1.4" opacity=".6"/>`,
    front: leafPath(3, 13, 11, -40, '#6dc044') + leafPath(5, 15, 9, 10, '#4c9a34') + blossom(55, 54, 4.2),
    border: SKIN_THEMES.wildwood.color,
  }),
  neon: () => ({
    defs: `<linearGradient id="tbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05060c" stop-opacity=".55"/><stop offset=".6" stop-color="#14062a" stop-opacity=".45"/><stop offset="1" stop-color="#ff3ad6" stop-opacity=".25"/></linearGradient>`,
    back: `<rect x="1.5" y="1.5" width="61" height="61" rx="12" fill="url(#tbg)"/>`
      + `<path d="M2 44H62" stroke="#ff3ad6" stroke-width="1" opacity=".6"/>`
      + [50, 55, 61].map((y) => `<path d="M2 ${y}H62" stroke="#2ef2ff" stroke-width=".7" opacity=".3"/>`).join('')
      + [-30, -18, -6, 6, 18, 30].map((x) => `<path d="M${32 + x * 0.4} 44L${32 + x * 1.5} 62" stroke="#2ef2ff" stroke-width=".7" opacity=".3"/>`).join('')
      + Array.from({ length: 10 }, (_, k) => `<path d="M2 ${6 + k * 4}H62" stroke="#fff" stroke-width=".4" opacity=".05"/>`).join(''),
    front: ['M4 12V4H12', 'M52 4H60V12', 'M4 52V60H12', 'M52 60H60V52'].map((d) => `<path d="${d}" fill="none" stroke="#2ef2ff" stroke-width="1.8" stroke-linecap="square"/>`).join('')
      + `<rect x="56" y="16" width="2.4" height="2.4" fill="#ff3ad6"/><rect x="6" y="46" width="2" height="2" fill="#ff3ad6"/>`,
    border: SKIN_THEMES.neon.color,
  }),
};

// --- skin drawings ----------------------------------------------------------------

/** Points of a wavy blade edge (flame / fang shapes), tip at y0, guard at y1. */
function wavyBlade(y0: number, y1: number, w: number, waves: number, amp: number): string {
  const L0: string[] = [], R0: string[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = y1 + (y0 - y1) * t;
    const taper = t < 0.8 ? 1 - t * 0.2 : (1 - t) / 0.2 * 0.84;
    const ww = (w + amp * Math.sin(t * Math.PI * waves)) * taper;
    L0.push(`${(32 - ww).toFixed(2)} ${y.toFixed(2)}`);
    R0.push(`${(32 + ww).toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${L0.join('L')}L${R0.reverse().join('L')}Z`;
}

const glowLine = (d: string, p: Paint, w = 2.4) => L(d, p.tint, w + 1.6, 0.35) + L(d, p.tint, w, 0.95) + L(d, '#fff6d8', w * 0.4, 0.9);

const SKIN_DRAW: Record<string, Draw> = {
  // Hellforge.
  hellforge_longsword: (p) => diag(
    P(wavyBlade(-6, 45, 5.2, 6, 1.1), p.m),
    S('M32 -4L28.6 8L28 44L32 44Z', 0.12),
    glowLine('M32 6V42', p, 2),
    L('M32 22L36 18M32 30L28 26M32 36L35.5 33', p.tintLight, 1, 0.9),
    T('M28 47Q18 48 15 36', p.dark, 3.6), T('M36 47Q46 48 49 36', p.dark, 3.6),
    L('M15.5 37.5Q15 35 15.8 33.5M48.5 37.5Q49 35 48.2 33.5', p.tintLight, 1.4),
    R(26.5, 44, 11, 7, 2.2, p.dark), C(32, 47.5, 2.6, p.glow, 1.4),
    grip(p, 29, 51, 6, 11, p.dark),
    P('M27.5 62L36.5 62L32 71Z', p.dark, 2.2), L('M28.5 63.5H35.5', p.tint, 1.6),
  ),
  hellforge_warhammer: (p) => diag(
    T('M32 22V68', p.dark, 5),
    L('M32 26Q35 30 32 34Q29 38 32 42Q35 46 32 50', p.tint, 1.3, 0.95),
    grip(p, 29.6, 52, 4.8, 12, p.leather),
    P('M28 4L32 -9L36 4Z', p.dark, 2.2),
    P('M11 8Q6 -2 13 -6Q11 1 15 6Z', p.dark, 2), mirrorX(P('M11 8Q6 -2 13 -6Q11 1 15 6Z', p.dark, 2)),
    R(15, 3, 34, 22, 4, p.m),
    R(17.5, 7, 3, 14, 1, p.glow, 1.4), R(43.5, 7, 3, 14, 1, p.glow, 1.4),
    L('M25 9H39M25 14H39M25 19H39', p.tintLight, 1.8, 0.95),
    P('M8 6L14 3L14 25L8 22Z', p.dark, 2.2), P('M56 6L50 3L50 25L56 22Z', p.dark, 2.2),
    C(11, 14, 2.4, p.glow, 1.2), C(53, 14, 2.4, p.glow, 1.2),
    S('M17 5L47 5L46 7L18 8Z', 0.3),
  ),
  hellforge_gauntlet: (p) => DRAW.gauntlets(p)
    + R(17, 23, 32, 2.4, 1, p.glow, 1) + L('M20 46H44M20 51H44', p.tint, 1.4, 0.9),
  hellforge_plate: (p) => [
    P('M9 22Q2 14 4 3Q9 12 15 15Z', p.dark, 2), mirrorX(P('M9 22Q2 14 4 3Q9 12 15 15Z', p.dark, 2)),
    DRAW.plate_armor(p),
    R(26, 28, 12, 13, 2, p.dark, 2),
    L('M28 31H36M28 34.5H36M28 38H36', p.tintLight, 1.6, 0.95),
    L('M16 24Q20 32 18 40M48 24Q44 32 46 40', p.tint, 1.2, 0.8),
  ].join(''),
  hellforge_helm: (p) => [
    P('M17 22Q2 22 3 4Q10 16 20 15Z', p.dark), mirrorX(P('M17 22Q2 22 3 4Q10 16 20 15Z', p.dark)),
    L('M5 9Q8 15 13 17', p.tint, 1.4, 0.9), mirrorX(L('M5 9Q8 15 13 17', p.tint, 1.4, 0.9)),
    P('M26 12Q24 2 30 -2Q30 6 33 9Q34 1 39 -1Q37 6 38 12Z', p.flame, 1.6),
    P('M16 34Q14 11 32 9Q50 11 48 34L48 51Q32 58 16 51Z', p.m),
    R(19, 27, 26, 4.6, 2, p.glow, 1.4), R(29.7, 29, 4.6, 14, 1.6, p.glow, 1.4),
    halo(32, 30, 9, p.tint, 0.35),
    ...[[20, 40], [20, 45], [44, 40], [44, 45]].map(([x, y]) => C(x, y, 1.4, p.t, 1)),
    S('M18 30Q17 14 30 11L28 13Q20 17 21 30Z', 0.35),
  ].join(''),
  hellforge_greaves: (p) => DRAW.plate_greaves(p) + L('M18 26H34M18 34H34', p.tint, 1.4, 0.9),
  hellforge_core: (p) => DRAW.core(p),

  // Rimeborn.
  rimeborn_katana: (p) => diag(
    P('M35 -6Q39.5 12 36.5 43L30 43Q32.5 14 35 -6Z', p.m),
    S('M35 -4Q33 14 31 42L33 42Q35.5 14 35 -4Z', 0.6),
    L('M36 2Q37.4 18 35.6 38', p.tintLight, 1.2, 0.9),
    P('M30 34L24 30L29.5 31Z', p.gem, 1.2), P('M31 24L25 19L30.5 21Z', p.gem, 1.2), P('M32 13L27 8L31.5 10Z', p.gem, 1.2),
    G('translate(33 45.5)', ...[0, 60, 120].map((r) => `<path d="M-9 0H9" transform="rotate(${r})" stroke="${OUT}" stroke-width="4.6" stroke-linecap="round"/><path d="M-9 0H9" transform="rotate(${r})" stroke="#eaf2fb" stroke-width="2.2" stroke-linecap="round"/>`), C(0, 0, 2.4, p.glow, 1.2)),
    R(29.5, 48, 7, 16, 2.5, p.cloth),
    L('M30 51L36.5 53M30 56L36.5 58M30 61L36.5 63', '#9fd0f0', 1.1, 0.95),
    R(29, 63.5, 8, 3, 1.5, p.steel, 2),
  ),
  rimeborn_spear: (p) => diag(
    T('M32 18V70', p.steel, 3.6),
    L('M32 30L34 34L30 38L34 42L30 46', '#dff8ff', 1.6, 0.9),
    P('M32 -10L39 6L32 19L25 6Z', p.m),
    L('M32 -8L32 17M25 6L39 6', '#fff', 0.9, 0.55), S('M32 -8L26 6L32 6Z', 0.45),
    P('M27 13L18 6L26 9Z', p.gem, 1.4), P('M37 13L46 6L38 9Z', p.gem, 1.4),
    R(28, 18, 8, 4, 1.6, p.steel, 2),
    ...[27, 30, 34, 37].map((x, i) => P(`M${x - 1.2} 22L${x} ${27 + (i % 2) * 3}L${x + 1.2} 22Z`, '#dff8ff', 1)),
    grip(p, 30, 52, 4, 10, p.cloth),
  ),
  rimeborn_orb: (p) => [
    halo(32, 28, 21, p.tint, 0.4),
    C(32, 28, 12, p.glow, 2.2),
    `<ellipse cx="32" cy="28" rx="24" ry="7" fill="none" stroke="${OUT}" stroke-width="3.6" transform="rotate(-14 32 28)"/><ellipse cx="32" cy="28" rx="24" ry="7" fill="none" stroke="#dff8ff" stroke-width="1.6" transform="rotate(-14 32 28)"/>`,
    ...[-34, -17, 0, 17, 34].map((a, i) => G(`rotate(${a} 32 52)`, P(`M29 48L32 ${28 + (i % 2) * 6}L35 48Z`, p.m, 2))),
    P('M24 50Q32 58 40 50L36 61L28 61Z', p.m, 2),
    spark(52, 12, 2.6), spark(13, 40, 2),
  ].join(''),
  rimeborn_aegis: (p) => [
    ...Array.from({ length: 6 }, (_, k) => {
      const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
      const x = 32 + Math.cos(a) * 24, y = 32 + Math.sin(a) * 24;
      const len = k % 2 ? 6 : 9;
      return P(`M${x + Math.cos(a + 1.57) * 3} ${y + Math.sin(a + 1.57) * 3}L${x + Math.cos(a) * len} ${y + Math.sin(a) * len}L${x - Math.cos(a + 1.57) * 3} ${y - Math.sin(a + 1.57) * 3}Z`, p.m, 1.8);
    }),
    P(star(32, 32, 6, 25, 25, -Math.PI / 2), p.gem),
    P(star(32, 32, 6, 19, 19, -Math.PI / 2), '#2a74b0', 1.6),
    G('translate(32 32)', ...[0, 60, 120].map((r) => `<path d="M-15 0H15M-10 -3L-7 0L-10 3M10 -3L7 0L10 3" transform="rotate(${r + 90})" fill="none" stroke="#eaf6ff" stroke-width="2" stroke-linecap="round"/>`)),
    C(32, 32, 3.4, p.glow, 1.4),
    S('M14 22L32 11L32 14L16.5 23.5Z', 0.35),
  ].join(''),
  rimeborn_circlet: (p) => [
    halo(32, 26, 18, p.tint, 0.25),
    ...[[12, 26, 8], [18, 20, 13], [25, 16, 17], [32, 13, 22], [39, 16, 17], [46, 20, 13], [52, 26, 8]].map(([x, y, h]) =>
      P(`M${x - 3} ${y + h * 0.7}L${x} ${y + 12 - h}L${x + 3} ${y + h * 0.7}Z`, p.m, 1.8) + L(`M${x} ${y + 13 - h}L${x - 1} ${y + h * 0.5}`, '#fff', 0.8, 0.6)),
    T('M8 36Q32 46 56 36', p.steel, 4),
    P('M32 33L36 38L32 44L28 38Z', p.glow, 1.6),
  ].join(''),
  rimeborn_boots: (p) => DRAW.leather_boots(p)
    + [16, 21, 26, 31, 36].map((x, i) => C(x, 7 + (i % 2), 3.4, '#f4f8ff', 1.4)).join('')
    + P('M44 50L48 56L52 50Z', '#dff8ff', 1) + P('M20 50L24 57L28 50Z', '#dff8ff', 1),
  rimeborn_core: (p) => [
    halo(32, 32, 24, p.tint, 0.4),
    ...Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2;
      const len = k % 2 ? 16 : 25;
      return G(`rotate(${(a * 180) / Math.PI} 32 32)`, P(`M29.5 32L32 ${32 - len}L34.5 32Z`, p.m, 1.8));
    }),
    P('M32 22L39 32L32 42L25 32Z', p.glow, 2),
    spark(50, 12, 2.4),
  ].join(''),

  // Dawnbringer.
  dawn_longsword: (p) => diag(
    P('M32 -6L38 4L38 45L26 45L26 4Z', p.steel),
    S('M32 -4L27.6 4.4L27.6 44L32 44Z', 0.35),
    T('M32 6V41', p.gold, 2),
    `<ellipse cx="32" cy="30" rx="11" ry="3.4" fill="none" stroke="${p.tint}" stroke-width="3" opacity=".45"/><ellipse cx="32" cy="30" rx="11" ry="3.4" fill="none" stroke="#fff8e0" stroke-width="1.2"/>`,
    ...[0, 1, 2].map((k) => P(`M27 ${46 - k}Q${17 - k * 3} ${44 - k * 5} ${12 - k * 2} ${34 - k * 6}Q${20 - k} ${40 - k * 4} 28 ${43 - k}Z`, p.bone, 1.8)),
    ...[0, 1, 2].map((k) => mirrorX(P(`M27 ${46 - k}Q${17 - k * 3} ${44 - k * 5} ${12 - k * 2} ${34 - k * 6}Q${20 - k} ${40 - k * 4} 28 ${43 - k}Z`, p.bone, 1.8))),
    R(26.5, 44, 11, 6, 2.2, p.gold), gem(32, 47, 2.6, p),
    grip(p, 29, 50, 6, 12, '#3a6fd0'),
    P(star(32, 66, 8, 2.6, 5.4), p.gold, 1.8),
  ),
  dawn_tower: (p) => [
    P('M12 7Q22 3 32 1Q42 3 52 7L52 50Q32 63 12 50Z', p.gold),
    P('M15 9.5Q24 6 32 4.5Q40 6 49 9.5L49 48.5Q32 59 15 48.5Z', p.bone, 2),
    P('M15 24H49V34H15Z', '#3a6fd0', 1.6),
    P(star(32, 29, 12, 6.5, 13), p.gold, 2),
    C(32, 29, 5, p.glow, 1.4),
    P('M12 9Q3 4 1 -2Q9 3 15 5Z', p.bone, 1.4), mirrorX(P('M12 9Q3 4 1 -2Q9 3 15 5Z', p.bone, 1.4)),
    S('M16 11Q22 8 27 7L27 52Q21 50 16 47Z', 0.25),
  ].join(''),
  dawn_plate: (p) => [
    ...[0, 1, 2].map((k) => P(`M14 ${30 - k * 4}Q${4 - k * 2} ${24 - k * 6} ${2 + k} ${8 - k * 3}Q${10 - k} ${16 - k * 4} 17 ${22 - k * 3}Z`, p.bone, 1.6)),
    ...[0, 1, 2].map((k) => mirrorX(P(`M14 ${30 - k * 4}Q${4 - k * 2} ${24 - k * 6} ${2 + k} ${8 - k * 3}Q${10 - k} ${16 - k * 4} 17 ${22 - k * 3}Z`, p.bone, 1.6))),
    P('M14 14Q22 7 32 12Q42 7 50 14L55 25L47 28L47 52Q32 59 17 52L17 28L9 25Z', p.bone),
    E(12, 20, 8, 7, p.bone, LW, -20), E(52, 20, 8, 7, p.bone, LW, 20),
    `<path d="M5.5 22Q12 14 19 17M58.5 22Q52 14 45 17" fill="none" stroke="#f2c860" stroke-width="2.4"/>`,
    E(32, 13, 7, 3.5, OUT, 0),
    P(star(32, 30, 12, 4, 8.5), p.gold, 1.8), C(32, 30, 3, p.glow, 1),
    R(17, 49, 30, 5, 2, p.gold, 2.2),
    S('M18 28L18 50Q22 53 26 54L26 16Q20 13 15 15L12 23Z', 0.2),
  ].join(''),
  dawn_crown: (p) => [
    halo(32, 12, 15, p.tint, 0.35),
    `<ellipse cx="32" cy="11" rx="17" ry="5" fill="none" stroke="${OUT}" stroke-width="4.4"/><ellipse cx="32" cy="11" rx="17" ry="5" fill="none" stroke="#fff6d0" stroke-width="2.4"/>`,
    ...[-3, -2, -1, 0, 1, 2, 3].map((k) => P(`M${32 + k * 5.6 - 1.8} 40L${32 + k * 6.6} ${22 + Math.abs(k) * 3.4}L${32 + k * 5.6 + 1.8} 40Z`, p.gold, 1.6)),
    T('M8 44Q32 34 56 44', p.gold, 5),
    gem(32, 39, 3.2, p),
  ].join(''),
  dawn_boots: (p) => DRAW.winged_boots(p),
  dawn_relic: (p) => [
    halo(32, 32, 26, p.tint, 0.5),
    P(star(32, 32, 16, 13, 25), p.m),
    P(star(32, 32, 8, 9, 16, 0), p.t, 2),
    C(32, 32, 7.5, p.glow, 2),
    `<circle cx="32" cy="32" r="28" fill="none" stroke="#fff6d0" stroke-width="1.2" opacity=".7"/>`,
    spark(52, 10, 3), spark(11, 52, 2.2),
  ].join(''),

  // Voidborne.
  void_katana: (p) => diag(
    P('M35 -6Q39.5 12 36.5 43L30 43Q32.5 14 35 -6Z', p.m),
    glowLine('M36.4 0Q38 16 36 41', p, 1.2),
    P('M28 30L23 27L27.5 27.5Z', p.dark, 1.2), P('M29.5 18L25 14L29 15Z', p.dark, 1.2),
    C(33, 46, 6.8, '#120c1e', 2.4),
    `<circle cx="33" cy="46" r="6.8" fill="none" stroke="#ff4fd8" stroke-width="1.6"/>`,
    R(29.5, 49, 7, 15, 2.5, p.cloth),
    L('M30 52L36.5 54M30 57L36.5 59M30 62L36.5 64', p.tintLight, 1.1, 0.9),
    P('M29 64L37 64L33 70Z', p.t, 2),
  ),
  void_daggers: (p) => [-38, 38].map((r, i) => G(`rotate(${r} 32 34) translate(${i ? 5 : -5} 0)`,
    P('M33 4Q40 14 37 22L36.5 24L27 24Q27 14 33 4Z', p.m, 2.2),
    P('M37 26L36.5 32L27.5 32L27 26Z', p.m, 2.2),
    P('M36.5 34L36 42L28 42L27.5 34Z', p.m, 2.2),
    L('M28 25H36.5M28 33H36.5', '#ff4fd8', 1.4),
    L('M34 8Q37 16 35 40', p.tintLight, 1, 0.8),
    T('M22 44Q32 41 42 44', p.t, 2.6),
    grip(p, 29.5, 45, 5, 10, p.dark),
    C(32, 58, 3.4, p.glow, 1.6),
  )).join(''),
  void_cloak: (p) => [
    P('M18 9Q32 5 46 9L53 52L48 58L44 51L39 58L33 51L28 58L22 51L17 58L11 52Z', p.cloth),
    ...[[24, 22], [38, 18], [30, 34], [44, 38], [20, 42], [36, 46], [27, 28]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${0.6 + (i % 3) * 0.4}" fill="#f4ecff"/>`),
    L('M11 52L17 58L22 51L28 58L33 51L39 58L44 51L48 58L53 52', p.tint, 1.8, 0.95),
    ...[14, 22, 32, 42, 50].map((x, i) => P(`M${x - 2.5} 12L${x} ${1 + (i % 2) * 3}L${x + 2.5} 12Z`, p.m, 1.6)),
    C(32, 13, 4, p.glow, 1.6),
  ].join(''),
  void_hood: (p) => [
    ...[14, 23, 32, 41, 50].map((x, i) => P(`M${x - 2.4} ${9 - Math.abs(i - 2) * -1.5}L${x} ${-2 + Math.abs(i - 2) * 2}L${x + 2.4} ${9 - Math.abs(i - 2) * -1.5}Z`, p.m, 1.6)),
    `<ellipse cx="32" cy="7" rx="21" ry="3" fill="none" stroke="${p.tint}" stroke-width="1" opacity=".8"/>`,
    G('translate(0 4)', DRAW.hood(p)),
  ].join(''),
  void_treads: (p) => DRAW.spiked_boots(p)
    + P('M6 30L9 22L12 29Z', p.m, 1.4) + P('M58 20L61 12L64 19Z', p.m, 1.4) + L('M18 12Q22 22 18 32', p.tint, 1.4, 0.9),
  void_blade: (p) => [
    halo(32, 30, 20, p.tint, 0.3),
    diag(
      P('M32 -6L38 4L38 42L26 42L26 4Z', p.m),
      glowLine('M32 4V38', { ...p, tint: '#ff4fd8' }, 1.6),
      L('M37 6V40M27 6V40', p.tint, 1.2, 0.9),
      T('M18 44Q32 40 46 44', p.dark, 3.4),
      grip(p, 29.5, 46, 5, 12, p.dark),
      P('M32 60L36 64L32 68L28 64Z', p.glow, 1.6),
    ),
    P('M8 50L12 44L14 51Z', p.m, 1.4), P('M52 12L56 6L58 13Z', p.m, 1.4),
  ].join(''),

  // Wildwood.
  wild_bow: (p) => G('rotate(-45 32 32)',
    L('M22 4L22 60', p.tintLight, 1.6),
    T('M22 4Q34 8 40 18Q44 26 42 32Q44 40 40 46Q34 56 22 60', p.wood, 4.4),
    T('M38 14Q44 20 42 28M42 36Q44 44 38 50', '#5f9c3c', 1.4),
    R(38.5, 27, 7, 10, 2, p.leather, 2),
    leafPath(40, 16, 9, -60, '#6dc044'), leafPath(42, 44, 9, 50, '#4c9a34'), leafPath(36, 10, 7, -100, '#4c9a34'),
    blossom(22, 4, 3.4), blossom(22, 60, 3.4),
    T('M10 32L56 32', p.wood, 2.2),
    P('M56 28L64 32L56 36Z', p.gem, 1.8),
  ),
  wild_staff: (p) => G('rotate(28 32 32)',
    halo(32, 9, 14, p.tint, 0.45),
    T('M32 68Q30 52 33 40Q35 28 32 18', p.wood, 5),
    T('M32 60Q36 52 30 44Q28 36 34 28', '#5f9c3c', 1.6),
    T('M32 20Q20 16 22 4Q24 -2 30 -3', p.wood, 3.2), T('M32 20Q44 16 42 4Q40 -2 34 -3', p.wood, 3.2),
    C(32, 8, 7, p.glow, 2.2),
    leafPath(33, -3, 10, -70, '#6dc044'), leafPath(30, -2, 9, -120, '#4c9a34'),
    blossom(22, 16, 3), blossom(42, 15, 2.6),
    spark(45, -2, 2.6),
  ),
  wild_thorn: (p) => [
    DRAW.thorn_armor({ ...p, tint: '#5f9c3c' }),
    blossom(25, 26, 4.2), blossom(40, 38, 3.6), blossom(21, 44, 3),
    leafPath(10, 18, 10, -150, '#6dc044'), leafPath(54, 18, 10, -30, '#6dc044'),
  ].join(''),
  wild_band: (p) => [
    ...Array.from({ length: 9 }, (_, k) => {
      const t = k / 8, a = Math.PI * (1.08 + t * 0.84);
      const x = 32 + Math.cos(a) * 24, y = 36 + Math.sin(a) * 15;
      return leafPath(x, y, 11, (a * 180) / Math.PI + (t < 0.5 ? -55 : 55) + 90, t % 0.25 < 0.12 ? '#6dc044' : '#4c9a34');
    }),
    T('M8 36Q32 14 56 36', p.t, 2.6),
    blossom(32, 21, 4.4),
    `<path d="M10 38Q6 48 12 58M14 40Q14 50 20 56" fill="none" stroke="${OUT}" stroke-width="4.4" stroke-linecap="round"/><path d="M10 38Q6 48 12 58M14 40Q14 50 20 56" fill="none" stroke="#4c8a3a" stroke-width="2.6" stroke-linecap="round"/>`,
  ].join(''),
  wild_boots: (p) => boots(p, p.wood, (front) => [
    ...[16, 21, 26, 31, 36].map((x, i) => C(x, 7 + (i % 2), 3.2, '#5f9c3c', front ? 1.4 : 1)),
    L('M18 24Q26 20 35 26M18 32Q26 28 35 34', '#40271a', 2, 0.8),
    ...(front ? [leafPath(16, 20, 13, -150, '#6dc044'), leafPath(16, 24, 11, -175, '#4c9a34'), `<circle cx="14" cy="44" r="3" fill="#7affc8" stroke="${OUT}" stroke-width="1.2" paint-order="stroke"/>`] : []),
  ]),
  wild_heart: (p) => [
    halo(32, 32, 22, p.tint, 0.45),
    ...[-1, 1].map((sx) => T(`M32 54Q${32 + sx * 22} 40 ${32 + sx * 18} 20Q${32 + sx * 10} 10 32 18`, p.wood, 3.4)),
    T('M32 54Q28 36 32 18', p.wood, 2.4),
    C(32, 34, 8, p.glow, 2),
    leafPath(32, 18, 12, -60, '#6dc044'), leafPath(32, 18, 10, -130, '#4c9a34'),
    blossom(44, 46, 3.6),
  ].join(''),

  // Neon Circuit.
  neon_katana: (p) => diag(
    P('M35 -6Q39.5 12 36.5 43L30 43Q32.5 14 35 -6Z', p.m),
    glowLine('M36.5 2Q38 18 36 41', { ...p, tint: '#2ef2ff' }, 1.2),
    L('M31.5 8Q33.4 22 30.8 40', '#ff3ad6', 1.2),
    L('M33.6 30V36H35M33 24H34.6V20', '#2ef2ff', 0.8, 0.85),
    R(25, 43.5, 16, 4.4, 1, p.dark, 2), `<rect x="26.2" y="44.4" width="13.6" height="2.6" fill="none" stroke="#ff3ad6" stroke-width=".9"/>`,
    R(29.5, 48, 7, 16, 1.5, p.dark),
    L('M29.8 52H36.2M29.8 58H36.2', '#2ef2ff', 1.4), L('M29.8 55H36.2', '#ff3ad6', 1.4),
    R(29, 63.5, 8, 3, 1, p.t, 2),
  ),
  neon_crossbow: (p) => G('rotate(32 32 32)',
    R(28.5, 14, 7, 46, 2, p.m),
    L('M32 18V54', '#2ef2ff', 1.2),
    P('M32 22L8 28L8 31L32 27Z', p.dark, 2), mirrorX(P('M32 22L8 28L8 31L32 27Z', p.dark, 2)),
    R(5, 26, 4, 6, 1, '#ff3ad6', 1.4), R(55, 26, 4, 6, 1, '#ff3ad6', 1.4),
    L('M8 29.5L32 34L56 29.5', '#2ef2ff', 1.2),
    glowLine('M32 4V30', { ...p, tint: '#ff3ad6' }, 1.4),
    C(32, 46, 5.4, p.dark, 2), `<circle cx="32" cy="46" r="3.2" fill="none" stroke="#2ef2ff" stroke-width="1.2"/>`,
    R(27.5, 54, 9, 8, 2, p.dark, 2),
  ),
  neon_chakram: (p) => [
    halo(32, 32, 26, '#ff3ad6', 0.2),
    `<path d="M32 8A24 24 0 1 1 31.9 8ZM32 18A14 14 0 1 0 32.1 18Z" fill="${p.m}" fill-rule="evenodd" ${ICON_KIT.stroke()}/>`,
    `<circle cx="32" cy="32" r="19" fill="none" stroke="#ff3ad6" stroke-width="1.8"/>`,
    ...[0, 1, 2, 3].map((k) => G(`rotate(${k * 90} 32 32)`, P('M32 6L44 4L38 10Z', p.dark, 1.6), L('M41 9.5A23 23 0 0 1 52 18', '#2ef2ff', 1.4))),
    C(32, 32, 6, p.dark, 2), C(32, 32, 3, '#2ef2ff', 0),
    L('M26 32H38M32 26V38', '#2ef2ff', 1, 0.6),
  ].join(''),
  neon_helm: (p) => [
    P('M14 36Q12 9 32 8Q52 9 50 36L50 46Q32 54 14 46Z', p.m),
    P('M24 10L40 10L36 2L28 2Z', p.dark, 1.6), L('M29 5H35', '#2ef2ff', 1.2),
    P('M12 26Q32 21 52 26L52 33Q32 29 12 33Z', '#2ef2ff', 1.8),
    L('M14 29.5Q32 25.5 50 29.5', '#e8feff', 1, 0.9),
    halo(32, 29, 14, '#2ef2ff', 0.25),
    C(11, 38, 5.4, p.dark, 2), `<circle cx="11" cy="38" r="3.2" fill="none" stroke="#ff3ad6" stroke-width="1.4"/>`,
    mirrorX(C(11, 38, 5.4, p.dark, 2) + `<circle cx="11" cy="38" r="3.2" fill="none" stroke="#ff3ad6" stroke-width="1.4"/>`),
    S('M17 24Q17 12 28 10L26 13Q20 16 20 24Z', 0.35),
  ].join(''),
  neon_boots: (p) => boots(p, p.m, (front) => [
    R(15, 26, 22, 3.4, 1, '#ff3ad6', 1.4),
    `<path d="M14 53.5H56" stroke="#2ef2ff" stroke-width="2.2"/>`,
    L('M24 8V22', '#2ef2ff', 1.2),
    ...(front ? [R(8, 38, 9, 8, 1.5, p.dark, 1.8), P('M9 46L12.5 58L16 46Z', '#2ef2ff', 1.2), P('M10.5 46L12.5 53L14.5 46Z', '#e8feff', 0)] : []),
  ]),
  neon_core: (p) => [
    halo(32, 32, 22, '#2ef2ff', 0.35),
    `<path d="M32 10L52 21L52 43L32 54L12 43L12 21Z" fill="none" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>`,
    `<path d="M32 10L52 21L52 43L32 54L12 43L12 21ZM32 32L52 21M32 32L12 21M32 32V54" fill="none" stroke="#40465e" stroke-width="2.4" stroke-linejoin="round"/>`,
    P('M32 22L40 32L32 42L24 32Z', p.glow, 1.6),
    `<ellipse cx="32" cy="32" rx="27" ry="8" fill="none" stroke="#ff3ad6" stroke-width="1.4" transform="rotate(-20 32 32)"/>`,
    C(52, 21, 1.8, '#ff3ad6', 0), C(12, 43, 1.8, '#ff3ad6', 0),
  ].join(''),
};

// --- public API ----------------------------------------------------------------------

/** <img> for a gear piece in a skin (or its default look when `skin` is null). */
export function skinIcon(gear: GearId, skin: SkinDef | null, o: { frame?: boolean; size?: number; className?: string } = {}): HTMLImageElement {
  if (!skin) return gearIcon(gear, o);
  const g = gearOf(gear);
  return itemIconImg(skinnedArt(gear, skin), {
    rarity: g.rarity, frame: o.frame, size: o.size, className: o.className, alt: `${g.name}: ${skin.name}`,
    draw: SKIN_DRAW[skin.id], decor: THEME_DECOR[skin.theme](), key: skin.id,
  });
}

/** Icon of a gear piece as a character wears it. */
export function wornIcon(gear: GearId, skins: SkinChoice | undefined, o: { frame?: boolean; size?: number } = {}): HTMLImageElement {
  return skinIcon(gear, skinOf(gear, skins), o);
}


