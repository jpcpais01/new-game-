import {
  ACESFilmicToneMapping, HalfFloatType, NoToneMapping, PCFShadowMap, SRGBColorSpace, Vector2, WebGLRenderer,
  type Camera, type Scene,
} from 'three';
import {
  BloomEffect, ChromaticAberrationEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect,
  ToneMappingMode, VignetteEffect,
} from 'postprocessing';

export type Quality = 'high' | 'medium' | 'low';

export interface QualitySettings {
  quality: Quality;
  post: boolean;
  msaa: number;
  shadows: boolean;
  shadowMapSize: number;
  maxPixelRatio: number;
  crowd: number;
}

export function settingsFor(q: Quality): QualitySettings {
  switch (q) {
    case 'high': return { quality: q, post: true, msaa: 4, shadows: true, shadowMapSize: 2048, maxPixelRatio: 2, crowd: 700 };
    case 'medium': return { quality: q, post: true, msaa: 0, shadows: true, shadowMapSize: 1024, maxPixelRatio: 1.5, crowd: 400 };
    case 'low': return { quality: q, post: false, msaa: 0, shadows: false, shadowMapSize: 512, maxPixelRatio: 1, crowd: 160 };
  }
}

/** Picks a starting tier from cheap device hints; dynamic resolution handles the rest. */
export function detectQuality(): Quality {
  const mobile = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (mobile) return cores >= 8 && mem >= 6 ? 'medium' : 'low';
  return cores >= 4 ? 'high' : 'medium';
}

/**
 * WebGL2 renderer with a single merged post-processing pass (bloom, chromatic
 * aberration, vignette and tone mapping in one fullscreen draw) and dynamic
 * resolution scaling that trades pixels for frame rate under load.
 */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  settings: QualitySettings;
  private composer: EffectComposer | null = null;
  private chroma: ChromaticAberrationEffect | null = null;
  private chromaAmt = 0;
  /** Resolution multiplier from dynamic scaling (0.5 .. 1). */
  private scale = 1;
  private frameEma = 1 / 60;
  private slowTime = 0;
  private fastTime = 0;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.canvas = canvas;
    this.settings = settingsFor(quality);
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Count draw calls across all passes of a frame (reset manually in render()).
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.applySettings();
  }

  setQuality(q: Quality): void {
    this.settings = settingsFor(q);
    this.applySettings();
  }

  private applySettings(): void {
    const s = this.settings;
    this.renderer.shadowMap.enabled = s.shadows;
    this.composer?.dispose();
    this.composer = null;
    this.chroma = null;
    if (s.post) {
      this.renderer.toneMapping = NoToneMapping;
      this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType, multisampling: s.msaa });
    } else {
      this.renderer.toneMapping = ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
    }
    this.scale = 1;
    this.resize();
  }

  /** Must be called once the scene and camera exist (and after quality changes). */
  setupPasses(scene: Scene, camera: Camera): void {
    if (!this.composer) return;
    this.composer.removeAllPasses();
    this.composer.addPass(new RenderPass(scene, camera));
    const bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.82,
      luminanceSmoothing: 0.25,
      intensity: 1.15,
      radius: 0.72,
    });
    const effects = [bloom] as ConstructorParameters<typeof EffectPass>[1][];
    if (this.settings.quality === 'high') {
      this.chroma = new ChromaticAberrationEffect({ offset: new Vector2(0, 0), radialModulation: true, modulationOffset: 0.2 });
      effects.push(this.chroma);
    }
    effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.55 }));
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    if (this.settings.msaa === 0) effects.push(new SMAAEffect());
    this.composer.addPass(new EffectPass(camera, ...effects));
  }

  /** Brief chromatic split on heavy impacts. */
  impact(amount: number): void {
    this.chromaAmt = Math.min(1, this.chromaAmt + amount);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    const pr = Math.min(window.devicePixelRatio || 1, this.settings.maxPixelRatio) * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h, false);
  }

  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }

  /** Feed real frame times; adjusts the render scale to hold the frame rate. */
  trackFrame(dt: number): void {
    this.frameEma += (dt - this.frameEma) * 0.08;
    if (this.frameEma > 1 / 50) { this.slowTime += dt; this.fastTime = 0; }
    else if (this.frameEma < 1 / 57) { this.fastTime += dt; this.slowTime = 0; }
    else { this.slowTime = 0; this.fastTime = 0; }
    if (this.slowTime > 0.75 && this.scale > 0.5) {
      this.scale = Math.max(0.5, this.scale - 0.1);
      this.slowTime = 0;
      this.resize();
    } else if (this.fastTime > 4 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.05);
      this.fastTime = 0;
      this.resize();
    }
  }

  get fps(): number {
    return 1 / this.frameEma;
  }

  get renderScale(): number {
    return this.scale;
  }

  render(scene: Scene, camera: Camera, dt: number): void {
    this.renderer.info.reset();
    if (this.chroma) {
      this.chromaAmt = Math.max(0, this.chromaAmt - dt * 4);
      const a = this.chromaAmt * 0.004;
      this.chroma.offset.set(a, a * 0.6);
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(scene, camera);
  }
}
