import { Color, DirectionalLight, Group, HemisphereLight, PerspectiveCamera, Scene, type Object3D } from 'three';
import { bodyForm } from '../render/fighter/forms';
import { lookFor } from '../render/fighter/look';
import { HIPS_Y, J, JOINT_COUNT, stance } from '../render/fighter/poses';
import { buildRig, type Rig } from '../render/fighter/rig';
import { GameRenderer } from '../render/renderer';
import { STYLE } from '../render/materials';
import { GEAR, GEAR_SLOTS, type GearDef } from '../sim/gear';
import type { FormId, GearSet, GearSlot } from '../sim/types';

// 3D review: one row per slot, one fighter per gear piece, slowly turning.

const BASE: GearSet = { main: 'katana' };

function gearFor(slot: GearSlot, id: string): GearSet {
  if (slot === 'main') return { main: id } as GearSet;
  return { ...BASE, [slot]: id } as GearSet;
}

function pose(rig: Rig): void {
  const p = stance(rig.look.grip, rig.look.offhand, bodyForm(rig.look.form));
  for (let i = 0; i < JOINT_COUNT; i++) rig.joints[i].rotation.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  rig.joints[J.HIPS].position.y = rig.metrics.hipH + p[HIPS_Y];
}

export function mountModels(canvas: HTMLCanvasElement, only?: GearSlot, cols = 99, form: FormId = 'balanced'): void {
  const renderer = new GameRenderer(canvas, 'high');
  const scene = new Scene();
  scene.background = new Color(0x4a5470);
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

  const slots = only ? [only] : GEAR_SLOTS;
  const spacingX = 1.75, spacingY = 2.75;
  const turners: { obj: Object3D; rig: Rig; phase: number }[] = [];
  let maxCols = 0;
  let row = 0;
  slots.forEach((slot) => {
    const all = Object.values(GEAR[slot]) as GearDef[];
    for (let i = 0; i < all.length; i += cols) {
      placeRow(slot, all.slice(i, i + cols), row++);
    }
  });
  function placeRow(slot: GearSlot, items: GearDef[], row: number): void {
    maxCols = Math.max(maxCols, items.length);
    items.forEach((g, col) => {
      const gear = gearFor(slot, g.id);
      const rig = buildRig(lookFor({ form, gear }));
      pose(rig);
      const holder = new Group();
      holder.position.set((col - (items.length - 1) / 2) * spacingX, -row * spacingY, 0);
      holder.add(rig.root);
      scene.add(holder);
      turners.push({ obj: rig.root, rig, phase: col * 0.4 });
    });
  }
  const rows = row;

  const camera = new PerspectiveCamera(22, 1, 0.1, 200);
  const fit = () => {
    const w = maxCols * spacingX + 0.4, h = rows * spacingY + 0.2;
    camera.aspect = renderer.aspect;
    const dist = Math.max(h / (2 * Math.tan((camera.fov * Math.PI) / 360)), w / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect)) * 1.02;
    camera.position.set(0, -((rows - 1) * spacingY) / 2 + 1.2, dist);
    camera.lookAt(0, -((rows - 1) * spacingY) / 2 + 1.0, 0);
    camera.updateProjectionMatrix();
    STYLE.uAspect.value = 1 / camera.aspect;
  };
  renderer.onResize = fit;
  renderer.setupPasses(scene, camera);
  fit();

  let last = performance.now();
  let t = 0;
  let spin = true;
  canvas.addEventListener('click', () => { spin = !spin; });
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (spin) t += dt;
    STYLE.uTime.value = t;
    for (const tr of turners) {
      tr.obj.rotation.y = -1.0 + Math.sin(t * 0.5 + tr.phase) * 0.8;
      tr.rig.orbiters.forEach((o, i) => {
        const a = t * 1.6 + i * 2.1;
        o.bone.position.set(Math.cos(a) * 0.75, 1.5 + Math.sin(a * 1.7) * 0.12, Math.sin(a) * 0.75);
        o.bone.rotation.y += dt * 3;
      });
    }
    renderer.render(scene, camera, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
