// Number formatting for anything shown on screen. Sim values are floats, so
// raw output can read 33.99999999; everything displayed goes through here.

/** Whole number (damage, heals, totals). */
export function fmtInt(v: number): string {
  return String(Math.round(v) || 0);
}

/** Current HP: whole number, but never shows 0 while the fighter is still up. */
export function fmtHp(hp: number, alive: boolean): string {
  if (!alive || hp <= 0) return '0';
  return String(Math.max(1, Math.round(hp)));
}

/** Multiplier like 1.1x or 0.85x: at most two decimals, no trailing zeros. */
export function fmtMult(v: number): string {
  return `${Number((Math.round(v * 100) / 100).toFixed(2))}x`;
}
