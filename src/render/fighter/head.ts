import type { Object3D } from 'three';
import { capsule, cone, lathe, rbox, sphere, torus } from './geo';
import type { RigBuildApi, RigDecorator } from './look';
import type { RigPartSpec } from './rig';

/**
 * Heads: the skull is always built, then a face preset (eyes, brows, mouth,
 * nose, ears, jaw shape) and a hair preset. Both are registries of decorators
 * keyed by the ids stored in the character's Appearance, so the character
 * creator can add presets here. Unknown ids fall back to the defaults.
 * Head space: centre of the skull at `sockets.skull`, face towards +X.
 */

export interface FaceParams {
  /** Eye size multiplier and spacing. */
  eye: number;
  spread: number;
  /** Brow tilt in radians (positive = angry inner corners down). */
  brow: number;
  browThick: number;
  /** Jaw width/height multipliers. */
  jawW: number;
  jawH: number;
  nose: number;
  mouth: 'line' | 'smile' | 'frown' | 'none';
  scar: boolean;
  /** Cheek blush/war paint colour, or 0 for none. */
  paint: number;
}

const DEFAULT_FACE: FaceParams = {
  eye: 1, spread: 1, brow: 0.38, browThick: 1, jawW: 1, jawH: 1, nose: 1, mouth: 'line', scar: false, paint: 0,
};

/** Face presets. Add entries here (or register at runtime) for the character creator. */
export const FACES: Record<string, Partial<FaceParams>> = {
  default: {},
  determined: { brow: 0.5, browThick: 1.15, jawW: 1.08, mouth: 'line' },
  gentle: { eye: 1.12, brow: 0.12, jawW: 0.92, jawH: 0.9, mouth: 'smile' },
  fierce: { eye: 0.9, brow: 0.62, browThick: 1.3, jawW: 1.15, jawH: 1.1, mouth: 'frown', scar: true },
  sharp: { eye: 0.95, spread: 0.92, brow: 0.3, jawW: 0.88, jawH: 1.08, nose: 1.2 },
  painted: { brow: 0.42, paint: 0xd23a2a, mouth: 'line' },
};

/** Hair presets: decorators placed relative to `sockets.skull`. */
export const HAIRS: Record<string, RigDecorator> = {};

const lineless = (color: number): RigPartSpec => ({ color, outline: false });

export function buildFace(api: RigBuildApi): void {
  const a = api.appearance;
  const f: FaceParams = { ...DEFAULT_FACE, ...(FACES[api.look.face ?? 'default'] ?? {}) };
  const r = api.metrics.headR;
  const skull = api.sockets.skull;
  const skin: RigPartSpec = { color: a.skin };

  // Cranium, cheeks and jaw, nose, ears.
  api.part(skull, sphere(r, 22, 16), skin, { scale: [1, 1.06, 0.93] });
  api.part(skull, sphere(r * 0.7, 16, 12), skin, { pos: [r * 0.3, -r * 0.45, 0], scale: [1, 0.78 * f.jawH, 1.12 * f.jawW] });
  api.part(skull, sphere(r * 0.3, 10, 8), skin, { pos: [r * 0.62, -r * 0.78 * f.jawH, 0], scale: [0.9, 0.7, 1.2 * f.jawW] }); // chin
  api.part(skull, sphere(r * 0.18 * f.nose, 10, 8), skin, { pos: [r * 0.98, -r * 0.12, 0], scale: [0.9, 1.1, 0.8] });
  if (!api.isHidden('ears')) {
    for (const z of [-1, 1]) api.part(skull, sphere(r * 0.24, 10, 8), skin, { pos: [-r * 0.06, -r * 0.05, z * r * 0.9], scale: [0.7, 1, 0.45] });
  }

  // Eyes: white, iris, pupil highlight.
  const ex = r * 0.84, ey = r * 0.12, ez = r * 0.36 * f.spread;
  for (const z of [-1, 1]) {
    const e = f.eye;
    api.part(skull, sphere(0.044 * e * r / 0.17, 12, 10), lineless(0xfbf8f2), { pos: [ex, ey, z * ez], scale: [0.45, 1.15, 0.95] });
    api.part(skull, sphere(0.026 * e * r / 0.17, 10, 8), lineless(a.eyes), { pos: [ex + 0.016, ey - 0.004, z * ez * 0.95], scale: [0.5, 1.2, 0.9] });
    api.part(skull, sphere(0.012 * e * r / 0.17, 6, 4), lineless(0x0a0810), { pos: [ex + 0.024, ey - 0.004, z * ez * 0.95], scale: [0.5, 1.2, 0.9] });
    api.part(skull, sphere(0.007 * r / 0.17, 6, 4), { color: 0xffffff, glow: 1.1 }, { pos: [ex + 0.03, ey + 0.015, z * ez * 0.9] });
    // Brows.
    api.part(skull, rbox(0.022, 0.024 * f.browThick, 0.085, 0.01), lineless(a.hair), { pos: [ex - 0.006, ey + 0.066, z * ez], rot: [-z * f.brow, 0, 0] });
    if (f.paint) api.part(skull, rbox(0.01, 0.026, 0.07, 0.008), lineless(f.paint), { pos: [r * 0.9, -r * 0.3, z * r * 0.48], rot: [z * 0.2, 0.25 * z, 0] });
  }
  if (f.mouth !== 'none') {
    const curve = f.mouth === 'smile' ? 0.35 : f.mouth === 'frown' ? -0.3 : 0;
    for (const z of [-1, 1]) {
      api.part(skull, rbox(0.012, 0.012, 0.042, 0.005), lineless(0x6a2f2a), { pos: [r * 0.92, -r * 0.44 + (curve > 0 ? 0.004 : -0.002), z * 0.019], rot: [z * curve, 0, 0] });
    }
  }
  if (f.scar) api.part(skull, rbox(0.01, 0.11, 0.018, 0.005), lineless(0xb5645a), { pos: [ex + 0.012, ey - 0.01, -ez], rot: [0.35, 0, 0] });
}

export function buildHair(api: RigBuildApi): void {
  const id = api.look.hair ?? 'short';
  (HAIRS[id] ?? HAIRS.short)(api);
}

// -----------------------------------------------------------------------------
// Hair presets
// -----------------------------------------------------------------------------

/** Cap of hair over the cranium, leaving the face open. */
function cap(api: RigBuildApi, at: Object3D, color: number, puff = 1.04, back = 0.03): void {
  const r = api.metrics.headR;
  api.part(at, sphere(r * puff, 20, 14, ), color, { pos: [-back, r * 0.07, 0], scale: [1, 1, 1] });
}

HAIRS.short = (api) => {
  const r = api.metrics.headR, c = api.appearance.hair, at = api.sockets.skull;
  cap(api, at, c, 1.05, 0.025);
  for (let k = 0; k < 5; k++) {
    api.part(at, cone(r * 0.32, r * 0.75, 6), c, { pos: [r * 0.55 + k * 0.006, r * 0.72 - k * 0.03, (k - 2) * r * 0.32], rot: [(k - 2) * 0.35, 0, -1.75] });
  }
};

HAIRS.bald = () => { /* nothing */ };

HAIRS.buzz = (api) => {
  const r = api.metrics.headR;
  api.part(api.sockets.skull, sphere(r * 1.01, 20, 14), api.appearance.hair, { pos: [-r * 0.04, r * 0.1, 0], scale: [1, 0.98, 0.99] });
};

HAIRS.ponytail = (api) => {
  const r = api.metrics.headR, c = api.appearance.hair, at = api.sockets.skull;
  cap(api, at, c, 1.05, 0.03);
  for (let k = 0; k < 4; k++) {
    api.part(at, cone(r * 0.32, r * 0.8, 6), c, { pos: [r * 0.58, r * 0.66 - k * 0.04, (k - 1.5) * r * 0.42], rot: [(k - 1.5) * 0.4, 0, -1.9] });
  }
  const tail = api.cloth(at, -r * 0.88, r * 0.42, 0, 0.8);
  api.part(tail, sphere(r * 0.3, 10, 8), api.appearance.accent, {});
  api.part(tail, capsule(r * 0.32, r * 1.6), c, { pos: [-r * 0.45, -r * 0.9, 0], rot: [0, 0, 0.45], scale: [0.85, 1, 1] });
};

HAIRS.topknot = (api) => {
  const r = api.metrics.headR, c = api.appearance.hair, at = api.sockets.skull;
  cap(api, at, c, 1.04, 0.035);
  api.part(at, sphere(r * 0.38, 12, 10), c, { pos: [-r * 0.25, r * 1.05, 0] });
  api.part(at, torus(r * 0.22, r * 0.06, Math.PI * 2, 6, 14), api.appearance.accent, { pos: [-r * 0.22, r * 0.86, 0], rot: [Math.PI / 2, 0, 0] });
  const tail = api.cloth(at, -r * 0.4, r * 1.1, 0, 1.2);
  api.part(tail, cone(r * 0.32, r * 1.6, 8), c, { pos: [-r * 0.55, -r * 0.4, 0], rot: [0, 0, 2.3] });
};

HAIRS.long = (api) => {
  const r = api.metrics.headR, c = api.appearance.hair, at = api.sockets.skull;
  cap(api, at, c, 1.06, 0.04);
  for (let k = 0; k < 3; k++) {
    api.part(at, cone(r * 0.36, r * 0.9, 6), c, { pos: [r * 0.56, r * 0.6 - k * 0.04, (k - 1) * r * 0.55], rot: [(k - 1) * 0.5, 0, -1.95] });
  }
  const back = api.cloth(at, -r * 0.6, -r * 0.1, 0, 0.6);
  api.part(back, lathe('hairLong', [[0, 0.08], [0.8, 0.02], [1, -0.4], [0.95, -1.2], [0.5, -1.45], [0, -1.5]], 14), c, { pos: [-r * 0.15, 0, 0], scale: [r * 0.75, r, r * 1.1] });
};

HAIRS.mohawk = (api) => {
  const r = api.metrics.headR, c = api.appearance.hair, at = api.sockets.skull;
  api.part(at, sphere(r * 1.005, 20, 14), api.appearance.skin, { pos: [-r * 0.03, r * 0.09, 0] });
  for (let k = 0; k < 6; k++) {
    const a = -0.2 + (k / 5) * 2.3;
    api.part(at, cone(r * 0.24, r * 0.8, 6), c, { pos: [Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95 + r * 0.1, 0], rot: [0, 0, a - Math.PI / 2], scale: [1, 1, 0.55] });
  }
};

HAIRS.curly = (api) => {
  const r = api.metrics.headR, c = api.appearance.hair, at = api.sockets.skull;
  cap(api, at, c, 1.03, 0.03);
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 1.4 - 0.2;
    for (const z of [-0.55, 0, 0.55]) {
      api.part(at, sphere(r * 0.3, 8, 6), c, { pos: [Math.cos(a) * r * 0.92 - r * 0.1, Math.sin(a) * r * 0.92 + r * 0.12, z * r * Math.max(0.3, Math.sin(a + 0.3))] });
    }
  }
};
