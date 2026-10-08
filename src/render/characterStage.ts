import { Vector3, type PerspectiveCamera, type Scene } from 'three';
import type { Character } from '../character/profile';
import { damp } from '../core/math';
import { createFighter, type Fighter } from '../sim/fighter';
import { FORMS } from '../sim/forms';
import { FighterView, type FxContext } from './fighter/fighterView';
import { bodyDetail, withBodyDetail } from './fighter/body';

export type StageFocus = 'body' | 'face';

/**
 * Character creation stage: the fighter on a turntable in the live arena,
 * with a camera that frames the whole body or moves in on the face. It uses
 * the same FighterView as a duel, so what you build is exactly what fights.
 * The view is rebuilt when the character changes (at most once per frame).
 */
export class CharacterStage {
  private view: FighterView | null = null;
  private fighter: Fighter | null = null;
  private pending: Character | null = null;
  private time = 0;
  private cheerT = 0;
  private shown = false;
  /** Turntable offset added to the fighter's own facing. */
  private spin = 0;
  private spinVel = 0;
  /** Extra turn towards the camera while the face is framed. */
  private faceTurn = 0;
  /** Smoothed height of the top of the head, so the face shot follows each form's head. */
  private headTop = NaN;
  private dragging = false;
  focus: StageFocus = 'body';
  /** Where the character sits horizontally on screen (-1 left .. 1 right). */
  screenX = -0.35;
  /** Fraction of the screen height the panel covers at the bottom (portrait). */
  bottomInset = 0;
  private readonly camPos = new Vector3(0, 1.6, 6);
  private readonly camLook = new Vector3(0, 1.1, 0);

  constructor(private readonly scene: Scene, private readonly fx: FxContext) {}

  set(c: Character): void {
    this.pending = c;
  }

  /** Short victory flourish (form picked, look randomised, character saved). */
  cheer(): void {
    this.cheerT = 1.8;
  }

  show(v: boolean): void {
    this.shown = v;
    if (this.view) this.view.group.visible = v;
  }

  drag(dx: number): void {
    this.dragging = true;
    this.spin += dx * 0.012;
    this.spinVel = dx * 0.012 * 60;
  }

  release(): void {
    this.dragging = false;
  }

  /** Start the camera from where it is, so it glides in from the previous shot. */
  snap(cam: PerspectiveCamera): void {
    this.camPos.copy(cam.position);
    this.camLook.set(cam.position.x, 1.1, 0);
  }

  private rebuild(c: Character): void {
    const f = createFighter(0, { ...c, gear: { ...c.gear } });
    const view = withBodyDetail(Math.min(2, bodyDetail() + 1), () => new FighterView(f, 0));
    this.view?.dispose();
    this.view = view;
    this.fighter = f;
    this.headTop = NaN;
    view.group.visible = this.shown;
    this.scene.add(view.group);
  }

  update(dt: number, cam: PerspectiveCamera): void {
    if (this.pending) {
      const c = this.pending;
      this.pending = null;
      this.rebuild(c);
    }
    const view = this.view, f = this.fighter;
    if (!view || !f || !this.shown) return;
    this.time += dt;
    this.cheerT = Math.max(0, this.cheerT - dt);
    // battleOver + winner plays the victory pose; otherwise idle in the ready stance.
    view.update(f, 1, dt, this.fx, this.cheerT > 0.3, this.cheerT > 0.3);

    // Turntable: inertia after a drag, then ease back to the 3/4 view.
    if (!this.dragging) {
      this.spin += this.spinVel * dt;
      this.spinVel = damp(this.spinVel, 0, 3, dt);
      if (Math.abs(this.spinVel) < 0.3) {
        const twoPi = Math.PI * 2;
        this.spin = damp(this.spin, Math.round(this.spin / twoPi) * twoPi, 0.9, dt);
      }
    }
    this.faceTurn = damp(this.faceTurn, this.focus === 'face' ? 0.5 : 0, 4, dt);
    view.group.rotation.y += this.spin - 0.12 - this.faceTurn;

    // Camera: frame the body, or move in on the face.
    const height = FORMS[f.form].body.height;
    const face = this.focus === 'face';
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
    const visibleH = ((face ? 1.35 : this.bottomInset > 0 ? 2.6 : 3.1) * height) / (1 - this.bottomInset);
    const dist = visibleH / (2 * tanHalf);
    const top = Number.isFinite(view.headWorld.y) ? view.headWorld.y - view.group.position.y : 2.02 * height;
    this.headTop = Number.isFinite(this.headTop) ? damp(this.headTop, top, 3, dt) : top;
    // The face shot aims just under the head so hats and helmets stay in frame.
    const lookY = face ? this.headTop - 0.22 * height : 1.08 * height;
    // Shift the shot sideways so the character sits at screenX, and down when
    // the panel covers the bottom of the screen.
    const lookX = -this.screenX * dist * tanHalf * cam.aspect;
    const lookYShift = -this.bottomInset * dist * tanHalf;
    const k = 1 - Math.exp(-4 * dt);
    _v.set(lookX + Math.sin(this.time * 0.2) * 0.012 * dist, lookY + (face ? 0.04 : 0.3), dist);
    this.camPos.lerp(_v, k);
    this.camLook.lerp(_v.set(lookX, lookY + lookYShift, 0), k);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }

  dispose(): void {
    this.view?.dispose();
    this.view = null;
  }
}

const _v = new Vector3();
