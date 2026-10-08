import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp } from '../core/math';
import { STYLE } from './materials';

export type Zoom = 'close' | 'normal' | 'distant';
const MAX_HFOV = 51;
const MAX_VFOV = 34;
export const ZOOM_FACTOR: Record<Zoom, number> = { close: 0.7, normal: 1, distant: 1.42 };

/** Share of the screen covered by UI on each edge (0..1 of the width for l/r, of the height for t/b). */
export interface Insets { l: number; r: number; t: number; b: number }
export const NO_INSETS: Insets = { l: 0, r: 0, t: 0, b: 0 };
const SIDES = ['l', 'r', 't', 'b'] as const;

/**
 * Side-on fight camera. Frames both fighters, eases between targets, and
 * layers trauma-based shake and zoom "punches" on top for impact.
 */
export class FightCamera {
  readonly camera: PerspectiveCamera;
  private focusX = 0;
  private focusY = 1.3;
  private dist = 15;
  private trauma = 0;
  private punch = 0;
  private time = 0;
  private readonly look = new Vector3();
  /** 0 = battle framing, 1 = menu/showcase framing. */
  showcase = 1;
  /** Player zoom preference (battle framing only). */
  zoom: Zoom = 'normal';
  private zoomK = 1;
  /** Screen edges covered by UI: the duel is framed in the free rectangle between them. */
  private ins: Insets = { ...NO_INSETS };
  private insTarget: Insets = { ...NO_INSETS };

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(30, aspect, 0.1, 400);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.applyInsets(true);
    // One lens for every screen shape: never wider than 16:9 at 30° (51° across)
    // nor taller than 34°. Wide phones and portrait screens pull the camera back
    // to fit the duel instead of widening the lens, which stretched everything
    // near the edges of the screen.
    const rad = Math.PI / 180;
    const fitWidth = (2 * Math.atan(Math.tan((MAX_HFOV / 2) * rad) / Math.max(0.01, aspect))) / rad;
    this.camera.fov = Math.min(MAX_VFOV, fitWidth);
    this.camera.updateProjectionMatrix();
    STYLE.uAspect.value = 1 / Math.max(0.01, aspect);
  }

  /**
   * Frames the duel in the part of the screen the UI leaves free: the picture
   * slides to the centre of that rectangle (a view offset, so the lens and
   * perspective don't change) and the camera pulls back until both fighters fit in it.
   */
  setInsets(i: Insets, snap = false): void {
    for (const k of SIDES) this.insTarget[k] = clamp(i[k], 0, 0.45);
    if (snap) { Object.assign(this.ins, this.insTarget); this.applyInsets(true); }
  }

  /** Free share of the screen width and height. */
  private get free(): [number, number] {
    const i = this.ins;
    return [Math.max(0.3, 1 - i.l - i.r), Math.max(0.3, 1 - i.t - i.b)];
  }

  private applyInsets(force = false, dt = 0): void {
    let moved = force;
    for (const k of SIDES) {
      const target = this.insTarget[k], cur = this.ins[k];
      if (cur === target) continue;
      this.ins[k] = Math.abs(target - cur) < 1e-3 || !dt ? target : damp(cur, target, 5, dt);
      moved = true;
    }
    if (!moved) return;
    const i = this.ins, a = this.camera.aspect;
    const [fw, fh] = this.free;
    // Offset that moves the screen centre to the free rectangle's centre.
    const ox = (0.5 - (i.l + fw / 2)) * a, oy = 0.5 - (i.t + fh / 2);
    if (Math.abs(ox) < 1e-4 && Math.abs(oy) < 1e-4) this.camera.clearViewOffset();
    // setViewOffset also sets aspect = fullWidth / fullHeight, so pass the real
    // aspect (a 1×1 frame here once squashed the whole picture to a square).
    else this.camera.setViewOffset(a, 1, ox, oy, a, 1);
    this.camera.updateProjectionMatrix();
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  kick(amount: number): void {
    this.punch = Math.min(1, this.punch + amount);
  }

  update(dt: number, ax: number, bx: number, ay: number, by: number): void {
    this.time += dt;
    const cam = this.camera;
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
    const sep = Math.abs(ax - bx);
    // Close zoom crops tighter around the duel; distant shows the whole arena.
    this.zoomK = damp(this.zoomK, ZOOM_FACTOR[this.zoom], 4, dt);
    this.applyInsets(false, dt);
    const [fw, fh] = this.free;
    const zk = this.zoomK + (1 - this.zoomK) * this.showcase;
    // Both fighters always stay in frame: close zoom only trims the margins
    // and the height headroom, distant pulls the whole shot back.
    const tight = zk < 1 ? (zk - 0.7) / 0.3 : 1; // 0 at Close, 1 at Normal
    // The menu's roomy margin isn't needed when the panels already fence the sides off.
    const showMargin = this.ins.l + this.ins.r > 0.05 ? 0.3 : 1.2;
    const margin = (2.6 + this.showcase * showMargin) * (0.55 + 0.45 * tight);
    const needW = (sep / 2 + margin) / (tanHalf * cam.aspect * fw);
    const needH = (2.7 + Math.max(ay, by) * 0.5) / (tanHalf * fh);
    const target = clamp(Math.max(needW, needH * Math.min(1, zk)) * Math.max(1, zk), 6.5, 140) * (1 - this.punch * 0.09);
    const midX = (ax + bx) / 2;

    this.dist = damp(this.dist, target, 2.6, dt);
    this.focusX = damp(this.focusX, midX, 3.2, dt);
    this.focusY = damp(this.focusY, 1.25 + Math.max(ay, by) * 0.35, 3, dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.punch = Math.max(0, this.punch - dt * 2.5);

    const sway = Math.sin(this.time * 0.23) * (0.35 + this.showcase * 1.3);
    const t2 = this.trauma * this.trauma;
    const t = this.time * 31;
    const sx = (Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1) * 0.4) * t2 * 0.35;
    const sy = (Math.sin(t * 1.3 + 2) * 0.6 + Math.sin(t * 2.9) * 0.4) * t2 * 0.3;

    const height = 1.7 + this.dist * 0.11 + this.showcase * 0.3;
    // Lines stay crisp: slightly thinner far away, slightly bolder up close.
    STYLE.uOutlineWidth.value = 0.0034 * clamp(15 / this.dist, 0.65, 1.35);
    cam.position.set(this.focusX + sway + sx, height + sy, this.dist);
    this.look.set(this.focusX + sx * 0.5, this.focusY + sy * 0.5, 0);
    cam.lookAt(this.look);
    cam.rotation.z += (Math.sin(t * 0.7) * t2) * 0.015;
  }
}
