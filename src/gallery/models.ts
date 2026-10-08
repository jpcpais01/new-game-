import { Color, DirectionalLight, Group, HemisphereLight, PerspectiveCamera, Scene, type Object3D } from 'three';
import { SKIN_BY_ID, SKIN_THEME_IDS, SKINS, type SkinDef, type SkinTheme } from '../gear/skins';
import { lookFor } from '../render/fighter/look';
import { HIPS_Y, J, JOINT_COUNT, stance } from '../render/fighter/poses';
import { buildRig, type Rig } from '../render/fighter/rig';
import { showRelics } from '../render/gear/models';
import { GameRenderer } from '../render/renderer';
import { STYLE } from '../render/materials';
import { GEAR, GEAR_SLOTS, gearOf, type GearDef } from '../sim/gear';
import type { SkinChoice } from '../sim/loadout';
import type { FormId, GearId, GearSet, GearSlot } from '../sim/types';

// 3D review: fighters wearing gear on slow turntables. One row per slot for the
// catalog, one row per theme for skins, or a single close-up of one skin.

const BASE: GearSet = { main: 'katana' };

function gearFor(slot: GearSlot, id: string): GearSet {
  if (slot === 'main') return { main: id } as GearSet;
  return { ...BASE, [slot]: id } as GearSet;
}

function pose(rig: Rig): void {
  const p = stance(rig.look.grip, rig.look.offhand, rig.metrics.form);
  for (let i = 0; i < JOINT_COUNT; i++) rig.joints[i].rotation.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  rig.joints[J.HIPS].position.y = rig.metrics.hipH + p[HIPS_Y];
}

interface Cell { gear: GearSet; skins?: SkinChoice }

/** Shared turntable stage: lights, grade and a camera that frames rows of fighters. */
function turntable(canvas: HTMLCanvasElement, rows: Cell[][], form: FormId, focus?: { y: number; height: number }): void {
  showRelics(true);
  const renderer = new GameRenderer(canvas, 'high');
  const scene = new Scene();
  scene.background = new Color(0x3c4560);
  // Same mood as the Highlands arena so colours read as they do in a fight.
  STYLE.uShadowTint.value.setRGB(0.42, 0.42, 0.68);
  STYLE.uMidTint.value.setRGB(0.8, 0.77, 0.86);
  STYLE.uLitTint.value.setRGB(1.06, 1.0, 0.9);
  STYLE.uSkyFill.value.setRGB(0.07, 0.09, 0.15);
  scene.add(new HemisphereLight(0xa8c8ff, 0x7a8a52, 1.0));
  const key = new DirectionalLight(0xffe4bf, 3.0);
  key.position.set(-9, 12, 7);
  scene.add(key);
  const rim = new DirectionalLight(0xffbf86, 1.6);
  rim.position.set(-8, 6, -10);
  scene.add(rim);
  renderer.setLook({
    grade: { sat: 1.12, contrast: 1.05, shadows: [-0.012, 0.0, 0.03], highlights: [0.035, 0.018, -0.012] },
    atmosphere: { fog: 0, sun: 0, sunDir: [0, 0, -1], density: 0, falloff: 0, baseY: 0, max: 0, glow: 0, ao: 0 },
    usePostFog: () => {},
  });

  const spacingX = 1.75, spacingY = 2.75;
  const turners: { obj: Object3D; rig: Rig; phase: number }[] = [];
  const spinners: Object3D[] = [];
  let maxCols = 0;
  rows.forEach((cells, row) => {
    maxCols = Math.max(maxCols, cells.length);
    cells.forEach((c, col) => {
      const rig = buildRig(lookFor({ form, gear: c.gear, skins: c.skins }));
      pose(rig);
      const holder = new Group();
      holder.position.set((col - (cells.length - 1) / 2) * spacingX, -row * spacingY, 0);
      holder.add(rig.root);
      scene.add(holder);
      turners.push({ obj: rig.root, rig, phase: col * 0.4 });
      for (const [name, o] of rig.tags) if (name.startsWith('spin:')) spinners.push(o);
    });
  });
  const nRows = rows.length;

  const camera = new PerspectiveCamera(22, 1, 0.1, 200);
  const fit = () => {
    camera.aspect = renderer.aspect;
    const t = Math.tan((camera.fov * Math.PI) / 360);
    if (focus) {
      const dist = Math.max(focus.height / (2 * t), focus.height / (2 * t * camera.aspect));
      camera.position.set(0, focus.y + focus.height * 0.08, dist);
      camera.lookAt(0, focus.y, 0);
    } else {
      const w = maxCols * spacingX + 0.4, h = nRows * spacingY + 0.2;
      const dist = Math.max(h / (2 * t), w / (2 * t * camera.aspect)) * 1.02;
      camera.position.set(0, -((nRows - 1) * spacingY) / 2 + 1.2, dist);
      camera.lookAt(0, -((nRows - 1) * spacingY) / 2 + 1.0, 0);
    }
    camera.updateProjectionMatrix();
    STYLE.uAspect.value = 1 / camera.aspect;
  };
  renderer.onResize = fit;
  renderer.setupPasses(scene, camera);
  fit();

  let last = -1;
  let t = 0;
  let spin = true;
  canvas.addEventListener('click', () => { spin = !spin; });
  const frame = (now: number) => {
    // rAF time can start behind performance.now(): never feed a negative step.
    const dt = last < 0 ? 0 : Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (spin) t += dt;
    STYLE.uTime.value = t;
    for (const tr of turners) {
      tr.obj.rotation.y = -1.0 + Math.sin(t * 0.5 + tr.phase) * (focus ? 1.4 : 0.8);
      tr.rig.orbiters.forEach((o, i) => {
        const a = t * 1.6 + i * 2.1;
        o.bone.position.set(Math.cos(a) * 0.75, 1.5 + Math.sin(a * 1.7) * 0.12, Math.sin(a) * 0.75);
        o.bone.rotation.y += dt * 3;
      });
    }
    for (const o of spinners) o.rotation.y += (o.userData.spin as number) * dt;
    renderer.render(scene, camera, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function mountModels(canvas: HTMLCanvasElement, only?: GearSlot, cols = 99, form: FormId = 'balanced'): void {
  const rows: Cell[][] = [];
  for (const slot of only ? [only] : GEAR_SLOTS) {
    const all = Object.values(GEAR[slot]) as GearDef[];
    for (let i = 0; i < all.length; i += cols) rows.push(all.slice(i, i + cols).map((g) => ({ gear: gearFor(slot, g.id) })));
  }
  turntable(canvas, rows, form);
}

/** A fighter wearing one skin, on a plain loadout so the piece stands out. */
function skinCell(s: SkinDef): Cell {
  return { gear: gearFor(gearOf(s.gear).slot, s.gear), skins: { [s.gear]: s.id } };
}

/** A fighter wearing every piece of a theme (first skin per slot). */
export function themeSet(theme: SkinTheme): Cell {
  const gear = {} as GearSet;
  const skins: SkinChoice = {};
  for (const s of SKINS) {
    if (s.theme !== theme) continue;
    const slot = gearOf(s.gear).slot;
    if ((gear as Record<string, GearId>)[slot]) continue;
    (gear as Record<string, GearId>)[slot] = s.gear;
    skins[s.gear] = s.id;
  }
  if (!gear.main) gear.main = 'katana';
  return { gear, skins };
}

const FOCUS: Record<GearSlot, { y: number; height: number }> = {
  main: { y: 1.3, height: 2.2 }, offhand: { y: 1.15, height: 1.8 }, defense: { y: 1.25, height: 1.7 },
  head: { y: 1.95, height: 0.95 }, boots: { y: 0.35, height: 0.9 }, special: { y: 1.45, height: 1.9 },
};

/** Skins review: ?view=skins (one row per theme, full set first), &theme=x, or ?view=skin&id=x for a close-up. */
export function mountSkins(canvas: HTMLCanvasElement, opts: { theme?: SkinTheme; id?: string; form?: FormId; set?: boolean }): void {
  const form = opts.form ?? 'balanced';
  const one = opts.id ? SKIN_BY_ID[opts.id] : undefined;
  if (one) { turntable(canvas, [[skinCell(one)]], form, FOCUS[gearOf(one.gear).slot]); return; }
  if (opts.set && opts.theme) { turntable(canvas, [[themeSet(opts.theme)]], form, { y: 1.15, height: 2.5 }); return; }
  const themes = opts.theme ? [opts.theme] : SKIN_THEME_IDS;
  turntable(canvas, themes.map((th) => [themeSet(th), ...SKINS.filter((s) => s.theme === th).map(skinCell)]), form);
}
