import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE, EYE_STYLES, FACIAL_HAIR, HAIR_STYLES, JAW_STYLES, MOUTH_STYLES, NOSE_STYLES, type Appearance,
} from '../../../character/appearance';
import { FORM_IDS } from '../../../sim/forms';
import { bodyForm } from '../forms';
import { sculptBody } from './body';
import { sculptHead } from './head';
import type { SculptMesh } from './mesher';

/** Every vertex finite, every index in range, normals unit length (NaN-safe shading). */
function sane(m: SculptMesh): void {
  expect(m.count).toBeGreaterThan(20);
  let bad = 0;
  for (let i = 0; i < m.count * 3; i++) if (!Number.isFinite(m.pos[i])) bad++;
  for (let i = 0; i < m.count; i++) {
    const l = Math.hypot(m.nor[i * 3], m.nor[i * 3 + 1], m.nor[i * 3 + 2]);
    if (!(Math.abs(l - 1) < 1e-3)) bad++;
  }
  for (const v of m.idx) if (v >= m.count) bad++;
  expect(bad).toBe(0);
}
const tris = (m: SculptMesh | null) => (m ? m.idx.length / 3 : 0);

describe('sculpted fighters', () => {
  it('builds every form within the triangle budget of the game tiers', () => {
    for (const id of FORM_IDS) {
      const s = bodyForm(id).shape;
      const ankleH = 0.085 * s.footS;
      const b = sculptBody(`test:${id}`, s, ankleH + s.thigh + s.shin + 0.06, ankleH, 0);
      for (const m of [b.torso, b.armR, b.legR, b.sash.mesh]) sane(m);
      expect(tris(b.torso) + 2 * tris(b.armR) + 2 * tris(b.legR)).toBeLessThan(40000);
    }
  }, 60000);

  it('builds every hairstyle and face option without broken geometry', () => {
    const looks: Appearance[] = [
      ...HAIR_STYLES.map((hairStyle) => ({ ...DEFAULT_APPEARANCE, hairStyle })),
      ...EYE_STYLES.map((eyes) => ({ ...DEFAULT_APPEARANCE, eyes })),
      ...JAW_STYLES.map((jaw, i) => ({ ...DEFAULT_APPEARANCE, jaw, nose: NOSE_STYLES[i % NOSE_STYLES.length], mouth: MOUTH_STYLES[i % MOUTH_STYLES.length] })),
      ...FACIAL_HAIR.map((facialHair) => ({ ...DEFAULT_APPEARANCE, facialHair })),
    ];
    for (const a of looks) {
      const h = sculptHead(a, {}, 0);
      sane(h.face);
      if (h.hair) sane(h.hair);
      if (h.facial) sane(h.facial);
      for (const t of h.tails) sane(t.mesh);
      expect(tris(h.face) + tris(h.hair) + tris(h.facial) + h.tails.reduce((n, t) => n + tris(t.mesh), 0)).toBeLessThan(32000);
    }
  }, 120000);
});
