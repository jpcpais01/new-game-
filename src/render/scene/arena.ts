import { Color, Fog, Group, type DirectionalLight, type Scene, Vector3 } from 'three';
import type { Particles } from '../fx/particles';
import { STYLE } from '../materials';
import type { ArenaLook, AtmosphereSettings, GradeSettings } from '../renderer';
import { disposeGroup } from './common';

export type ArenaId = 'highlands' | 'colosseum';
export const ARENA_IDS: ArenaId[] = ['highlands', 'colosseum'];
export const ARENA_NAMES: Record<ArenaId, string> = { highlands: 'Skyreach Highlands', colosseum: 'Grand Colosseum' };

export interface ArenaOptions {
  shadows: boolean;
  shadowMapSize: number;
  /** Crowd size budget (colosseum only). */
  crowd: number;
  /** Detail level 0 (low) .. 2 (high) for grass, trees and particles. */
  detail: number;
}

export interface ArenaFx { add: Particles; smoke: Particles }

export interface StyleMood {
  shadow: [number, number, number];
  mid: [number, number, number];
  lit: [number, number, number];
  skyFill: [number, number, number];
  ramp?: [number, number];
  /** Warm terminator band colour. */
  term?: [number, number, number];
  /** Ground height for contact occlusion. */
  groundY?: number;
}

/**
 * Base for an arena: owns its group, lights, fog and mood (shared shading
 * tints + colour grade). Concrete arenas build their scenery in the
 * constructor and animate ambience in `ambient()`.
 */
export abstract class Arena implements ArenaLook {
  readonly group = new Group();
  key!: DirectionalLight;
  readonly braziers: Vector3[] = [];
  protected brazierColor = 0xff7a22;
  protected excitement = 0;
  private emberAcc = 0;
  abstract readonly grade: GradeSettings;
  abstract readonly atmosphere: AtmosphereSettings;
  private fogRange: [number, number] = [70, 420];

  constructor(protected readonly scene: Scene, protected readonly opts: ArenaOptions) {
    scene.add(this.group);
  }

  protected setMood(m: StyleMood, fog: number, near: number, far: number): void {
    STYLE.uShadowTint.value.setRGB(...m.shadow);
    STYLE.uMidTint.value.setRGB(...m.mid);
    STYLE.uLitTint.value.setRGB(...m.lit);
    STYLE.uSkyFill.value.setRGB(...m.skyFill);
    STYLE.uRamp.value.set(...(m.ramp ?? [0.46, 0.7]));
    STYLE.uTermTint.value.setRGB(...(m.term ?? [0.16, 0.05, 0.0]));
    STYLE.uGroundY.value = m.groundY ?? 0;
    this.fogRange = [near, far];
    this.scene.fog = new Fog(fog, near, far);
    this.scene.background = new Color(fog);
  }

  /**
   * With post-processing the atmosphere pass does aerial perspective from the
   * depth buffer, so the scene's linear fog is pushed out of range (no shader
   * recompiles); without it, the classic fog stays.
   */
  usePostFog(on: boolean): void {
    const f = this.scene.fog as Fog | null;
    if (!f) return;
    f.near = on ? 1e5 : this.fogRange[0];
    f.far = on ? 2e5 : this.fogRange[1];
  }

  /** Crowd (if any) reacts to big moments. */
  excite(amount: number): void {
    this.excitement = Math.min(1, this.excitement + amount);
  }

  update(time: number, dt: number, fx: ArenaFx): void {
    STYLE.uTime.value = time;
    this.excitement = Math.max(0, this.excitement - dt * 0.35);
    this.emberAcc += dt;
    if (this.emberAcc > 1 / 30) {
      this.emberAcc = 0;
      for (const b of this.braziers) {
        fx.add.burst({ x: b.x, y: b.y + 0.1, z: b.z, count: 2, jitter: 0.22, dir: [0, 1, 0], spread: 0.25, speed: [0.8, 2.2], life: [0.4, 0.8], size: [0.22, 0.42], color: this.brazierColor, intensity: 2.2, gravity: -1.5, sizeEnd: 0.1 });
      }
      this.ambient(time, fx);
    }
    this.animate(time, dt);
  }

  /** Ambient particles, called at 30 Hz. */
  protected abstract ambient(time: number, fx: ArenaFx): void;
  /** Per-frame animation (crowd, banners...). */
  protected animate(_time: number, _dt: number): void {}

  setShadows(on: boolean, size: number): void {
    this.key.castShadow = on;
    this.key.shadow.mapSize.set(size, size);
    this.key.shadow.map?.dispose();
    this.key.shadow.map = null;
    this.group.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh && o.castShadow !== undefined && o.userData.casts) o.castShadow = on; });
  }

  dispose(): void {
    this.key.shadow.map?.dispose();
    disposeGroup(this.group);
    this.group.removeFromParent();
  }
}

export async function createArena(id: ArenaId, scene: Scene, opts: ArenaOptions): Promise<Arena> {
  if (id === 'colosseum') {
    const { Colosseum } = await import('./colosseum');
    return new Colosseum(scene, opts);
  }
  const { Highlands } = await import('./highlands');
  return new Highlands(scene, opts);
}
