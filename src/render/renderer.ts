import {
  ACESFilmicToneMapping, HalfFloatType, NoToneMapping, PCFShadowMap, SRGBColorSpace, Vector2, WebGLRenderer,
  type Camera, type Scene,
} from 'three';
import {
  BlendFunction, BloomEffect, Effect, ChromaticAberrationEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect,
  ToneMappingMode, VignetteEffect,
} from 'postprocessing';

/**
 * Last line of defence against NaN/Inf pixels. Some GPU drivers (Direct3D via
 * ANGLE on Windows) return NaN for edge cases like pow() of a tiny negative
 * number; the bloom mip chain then smears one bad pixel across most of the
 * screen, which shows up as whole frames going black. Where the composited
 * colour is not finite we fall back to the plain scene colour.
 */
class NanGuardEffect extends Effect {
  constructor() {
    super('NanGuard', /* glsl */ `
      bool badColor(vec3 c) {
        return any(isnan(c)) || any(isinf(c)) || !(abs(c.r) < 1e4 && abs(c.g) < 1e4 && abs(c.b) < 1e4);
      }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        if (badColor(inputColor.rgb)) {
          vec3 raw = texture2D(inputBuffer, uv).rgb;
          raw = badColor(raw) ? vec3(0.0) : raw / (1.0 + raw);
          outputColor = vec4(raw, 1.0);
        } else {
          outputColor = inputColor;
        }
      }`, { blendFunction: BlendFunction.SRC });
  }
}

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
    // No MSAA on any tier: multisampled half-float targets flicker black on
    // Chrome/Windows (ANGLE on Direct3D 11); SMAA in the merged pass is cheaper anyway.
    case 'high': return { quality: q, post: true, msaa: 0, shadows: true, shadowMapSize: 2048, maxPixelRatio: 2, crowd: 700 };
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
  private composerSized = false;
  private chroma: ChromaticAberrationEffect | null = null;
  private chromaAmt = 0;
  /** Resolution multiplier from dynamic scaling (0.5 .. 1). */
  private scale = 1;
  private frameEma = 1 / 60;
  private slowTime = 0;
  private fastTime = 0;
  private width = 1;
  private height = 1;
  private bufW = 0;
  private bufH = 0;
  private devicePixels: [number, number] | null = null;
  /** Called after the canvas size changed (camera aspect lives elsewhere). */
  onResize: (() => void) | null = null;
  /** Debug hook: dynamic resolution changed. */
  onScale: ((from: number, to: number) => void) | null = null;
  private clock = 0;
  private lastChange = 0;
  private lastRaise = -99;
  private raiseLockedUntil = 0;
  /** Toggles for the ?debug panel. */
  readonly debug = { post: true, bloom: true, dynRes: true, nanGuard: true, msaa: false };
  private passScene: Scene | null = null;
  private passCamera: Camera | null = null;

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
    this.observeSize();
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
    if (s.post && this.debug.post) {
      this.renderer.toneMapping = NoToneMapping;
      this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType, multisampling: this.msaaSamples });
    } else {
      this.renderer.toneMapping = ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
    }
    this.scale = 1;
    this.composerSized = false;
    this.resize();
  }

  /** Must be called once the scene and camera exist (and after quality changes). */
  setupPasses(scene: Scene, camera: Camera): void {
    this.passScene = scene;
    this.passCamera = camera;
    if (!this.composer) return;
    this.composer.removeAllPasses();
    this.composer.addPass(new RenderPass(scene, camera));
    const effects = [] as ConstructorParameters<typeof EffectPass>[1][];
    const bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.9,
      luminanceSmoothing: 0.25,
      intensity: 1.15,
      radius: 0.72,
    });
    if (this.debug.bloom) effects.push(bloom);
    if (this.settings.quality === 'high') {
      this.chroma = new ChromaticAberrationEffect({ offset: new Vector2(0, 0), radialModulation: true, modulationOffset: 0.2 });
      effects.push(this.chroma);
    }
    effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.55 }));
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    if (this.msaaSamples === 0) effects.push(new SMAAEffect());
    if (this.debug.nanGuard) effects.push(new NanGuardEffect());
    this.composer.addPass(new EffectPass(camera, ...effects));
  }

  private get msaaSamples(): number {
    return this.debug.msaa ? 4 : this.settings.msaa;
  }

  /** Re-applies settings after a debug toggle. */
  rebuild(): void {
    this.applySettings();
    if (this.passScene && this.passCamera) this.setupPasses(this.passScene, this.passCamera);
  }

  get composerTarget(): import('three').WebGLRenderTarget | null {
    return this.composer?.inputBuffer ?? null;
  }

  /** Brief chromatic split on heavy impacts. */
  impact(amount: number): void {
    this.chromaAmt = Math.min(1, this.chromaAmt + amount);
  }

  /**
   * Sizes the drawing buffer in whole device pixels. Chrome on Windows hands a
   * fullscreen canvas straight to the display (hardware overlay) only while
   * its buffer matches its on-screen pixel size exactly; with fractional
   * display scaling (125%, 150%) a CSS size × devicePixelRatio buffer is off
   * by a pixel, and the compositor can swap paths mid-frame, which shows as a
   * black screen with stray stretched slices. So we read the exact device
   * pixel size from a ResizeObserver where available.
   */
  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    let pw = Math.round(w * dpr);
    let ph = Math.round(h * dpr);
    // Trust the observer only when it agrees with CSS size × DPR to within a
    // couple of pixels (device emulation reports CSS pixels here).
    const dp = this.devicePixels;
    if (dp && Math.abs(dp[0] - pw) <= 2 && Math.abs(dp[1] - ph) <= 2) {
      pw = dp[0];
      ph = dp[1];
    }
    // Cap the density, then apply dynamic resolution.
    const cap = Math.min(1, (w * this.settings.maxPixelRatio) / Math.max(1, pw));
    const k = cap * this.scale;
    pw = Math.max(1, Math.round(pw * k));
    ph = Math.max(1, Math.round(ph * k));
    // Mobile browsers fire resize for toolbar changes; reallocating render
    // targets for an unchanged size would cost a frame for nothing.
    if (w === this.width && h === this.height && pw === this.bufW && ph === this.bufH && this.composerSized) return;
    this.composerSized = true;
    this.width = w;
    this.height = h;
    this.bufW = pw;
    this.bufH = ph;
    // Pixel ratio 1 with a device-pixel size: three won't round anything.
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(pw, ph, false);
    this.composer?.setSize(pw, ph, false);
  }

  private observeSize(): void {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[entries.length - 1];
      const box = e.devicePixelContentBoxSize?.[0];
      this.devicePixels = box ? [box.inlineSize, box.blockSize] : null;
      this.resize();
      this.onResize?.();
    });
    try {
      ro.observe(this.canvas, { box: 'device-pixel-content-box' });
    } catch {
      ro.observe(this.canvas); // Safari: no device-pixel box, fall back to rounding.
    }
  }

  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }

  /**
   * Feed real frame times; adjusts the render scale to hold the frame rate.
   * Changes are rare and damped: a resolution change is visible, so the scale
   * must never bounce back and forth (that reads as flicker).
   */
  trackFrame(dt: number): void {
    this.clock += dt;
    this.frameEma += (dt - this.frameEma) * 0.05;
    if (!this.debug.dynRes) {
      if (this.scale !== 1) this.setScale(1);
      return;
    }
    // Let things settle after a change (and after tab switches) before judging.
    if (this.clock - this.lastChange < 2) return;
    if (this.frameEma > 1 / 45) { this.slowTime += dt; this.fastTime = 0; }
    else if (this.frameEma < 1 / 58) { this.fastTime += dt; this.slowTime = 0; }
    else { this.slowTime = 0; this.fastTime = 0; }
    if (this.slowTime > 1.5 && this.scale > 0.5) {
      // Dropping soon after raising means the higher scale doesn't fit: stop trying.
      if (this.clock - this.lastRaise < 12) this.raiseLockedUntil = this.clock + 90;
      this.setScale(Math.max(0.5, this.scale - 0.15));
    } else if (this.fastTime > 6 && this.scale < 1 && this.clock > this.raiseLockedUntil) {
      this.lastRaise = this.clock;
      this.setScale(Math.min(1, this.scale + 0.1));
    }
  }

  /** Resets frame timing, e.g. after the tab was hidden. */
  resetTiming(): void {
    this.lastChange = this.clock;
    this.frameEma = 1 / 60;
    this.slowTime = this.fastTime = 0;
  }

  private setScale(v: number): void {
    this.onScale?.(this.scale, v);
    this.scale = v;
    this.slowTime = this.fastTime = 0;
    this.lastChange = this.clock;
    this.resize();
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
      const a = this.chromaAmt * 0.0022;
      this.chroma.offset.set(a, a * 0.6);
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(scene, camera);
  }
}
