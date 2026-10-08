import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp } from '../core/math';

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

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(30, aspect, 0.1, 400);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    // Wider lens in portrait so the duel still fits.
    this.camera.fov = aspect < 1 ? 46 : aspect < 1.4 ? 36 : 30;
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
    const margin = 2.6 + this.showcase * 1.2;
    const needW = (sep / 2 + margin) / (tanHalf * cam.aspect);
    const needH = (2.7 + Math.max(ay, by) * 0.5) / tanHalf;
    const target = clamp(Math.max(needW, needH), 9, 44) * (1 - this.punch * 0.09);
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
    cam.position.set(this.focusX + sway + sx, height + sy, this.dist);
    this.look.set(this.focusX + sx * 0.5, this.focusY + sy * 0.5, 0);
    cam.lookAt(this.look);
    cam.rotation.z += (Math.sin(t * 0.7) * t2) * 0.015;
  }
}
