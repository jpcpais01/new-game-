import {
  ACESFilmicToneMapping, Color, Matrix4, Uniform, Vector3, Vector4, HalfFloatType, NoToneMapping, PCFShadowMap, SRGBColorSpace,
  WebGLRenderer, type Camera, type Scene,
} from 'three';
import {
  BlendFunction, BloomEffect, Effect, EffectAttribute, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect,
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

/**
 * Stylised colour grade in one cheap pass: saturation, contrast, split toning
 * (cool shadows, warm highlights) and a full-screen flash for big moments.
 * Every input is clamped, so it can never emit NaN.
 */
export class GradeEffect extends Effect {
  constructor() {
    super('Grade', /* glsl */ `
      uniform float uSat;
      uniform float uContrast;
      uniform vec3 uShadows;
      uniform vec3 uHighlights;
      uniform vec3 uFlash;
      uniform float uGrain;
      uniform vec4 uLines;    // centre uv, strength, seed
      float gHash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = clamp(inputColor.rgb, 0.0, 1.0);
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, uSat);
        // Filmic S-curve around mid grey (keeps the extremes soft).
        vec3 s = c * c * (3.0 - 2.0 * c);
        c = clamp(mix(c, s, clamp(uContrast - 1.0, 0.0, 1.0) * 3.0), 0.0, 1.0);
        c += uShadows * (1.0 - smoothstep(0.0, 0.5, l)) + uHighlights * smoothstep(0.5, 1.0, l);
        // Fine film grain, strongest in the mid tones; it stops the flat toon
        // gradients from banding and gives the image a painted texture.
        float gr = gHash(floor(uv * resolution) + fract(time * 7.13) * 97.0) - 0.5;
        c += gr * uGrain * (0.35 + l * (1.0 - l) * 2.6);
        // Anime speed lines radiating from the action on the biggest hits.
        if (uLines.z > 0.001) {
          vec2 d = uv - uLines.xy;
          d.x *= aspect;
          float r = length(d);
          float a = atan(d.y, d.x) * 38.0;
          float n = gHash(vec2(floor(a), uLines.w));
          float w = abs(fract(a) - 0.5) * 2.0;
          float line = step(0.78, n) * smoothstep(1.0, 0.3 + n * 0.4, w) * smoothstep(0.22 + n * 0.12, 0.75, r);
          c = mix(c, vec3(1.0, 0.98, 0.94), clamp(line * uLines.z, 0.0, 0.75));
        }
        c = clamp(c + uFlash, 0.0, 1.0);
        outputColor = vec4(c, inputColor.a);
      }`, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['uSat', new Uniform(1.12)],
        ['uContrast', new Uniform(1.06)],
        ['uShadows', new Uniform(new Vector3(-0.01, 0.0, 0.03))],
        ['uHighlights', new Uniform(new Vector3(0.03, 0.015, -0.01))],
        ['uFlash', new Uniform(new Vector3())],
        ['uGrain', new Uniform(0.008)],
        ['uLines', new Uniform(new Vector4(0.5, 0.55, 0, 0))],
      ]),
    });
  }
}

/** Per-arena grade, also used when post-processing is off (no-op then). */
export interface GradeSettings {
  sat: number; contrast: number; shadows: [number, number, number]; highlights: [number, number, number];
  /** Bloom strength and threshold override (defaults 1.0 / 0.9). */
  bloom?: number; bloomThreshold?: number;
  /** Vignette darkness (default 0.45). */
  vignette?: number;
}

/**
 * Aerial perspective for one arena, applied in the post pass from the depth
 * buffer: exponential height fog that thickens near the ground and with
 * distance, tinted towards the sun colour when looking into the light, plus a
 * soft sun glow with a horizontal streak when the sun is on screen.
 */
export interface AtmosphereSettings {
  /** Fog colour away from the sun (match the sky's horizon). */
  fog: number;
  /** In-scattered colour looking towards the sun. */
  sun: number;
  sunDir: [number, number, number];
  /** Fog density at baseY and how fast it thins with height. */
  density: number;
  falloff: number;
  baseY: number;
  /** Maximum fog opacity (keeps distant shapes readable). */
  max: number;
  /** Sun glow strength on screen (0 = off). */
  glow: number;
  /** Strength of depth-crease ambient occlusion (high tier only). */
  ao: number;
}

/** What an arena hands the renderer: its grade and atmosphere. */
export interface ArenaLook {
  grade: GradeSettings;
  atmosphere: AtmosphereSettings;
  /** Post-processing does the fog: switch the scene's own fog off (or back on). */
  usePostFog(on: boolean): void;
}

const _m4 = new Matrix4();
const _v4 = new Vector4();

/**
 * Depth-based atmosphere (see AtmosphereSettings) and, on the high tier, a
 * cheap crease occlusion: pixels that sit just behind a nearer surface are
 * darkened a touch, which grounds feet, props and crowd rows like baked AO.
 * Works on the HDR scene colour before bloom and tone mapping.
 */
export class AtmosphereEffect extends Effect {
  constructor(private readonly cam: Camera, ao: boolean) {
    super('Atmosphere', /* glsl */ `
      uniform mat4 uProjInv;
      uniform mat4 uCamWorld;
      uniform vec3 uFogCol;
      uniform vec3 uSunCol;
      uniform vec3 uSunDir;
      uniform vec4 uFog;      // density, falloff, baseY, max
      uniform vec4 uSun;      // screen uv x, y, on-screen visibility, glow strength
      uniform float uAO;

      float linDepth(float d) {
        float z = getViewZ(d);
        return -z;
      }

      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        vec3 col = max(inputColor.rgb, vec3(0.0));
        bool sky = depth >= 0.99999;
        vec4 vp = uProjInv * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec3 view = vp.xyz / max(vp.w, 1e-6);
        float dist = sky ? 420.0 : length(view);
        vec3 camPos = uCamWorld[3].xyz;
        vec3 dir = normalize(mat3(uCamWorld) * (view / max(length(view), 1e-6)));

        #ifdef USE_AO
        if (!sky && uAO > 0.0) {
          float z0 = linDepth(depth);
          float r = clamp(1.6 / max(z0, 1.0), 0.0015, 0.02);
          vec2 st = vec2(r / aspect, r);
          float occ = 0.0;
          vec2 k[8];
          k[0] = vec2(1.0, 0.0); k[1] = vec2(-1.0, 0.0); k[2] = vec2(0.0, 1.0); k[3] = vec2(0.0, -1.0);
          k[4] = vec2(0.7, 0.7); k[5] = vec2(-0.7, 0.7); k[6] = vec2(0.7, -0.7); k[7] = vec2(-0.7, -0.7);
          for (int i = 0; i < 8; i++) {
            float s = i < 4 ? 1.0 : 2.1;
            float zs = linDepth(readDepth(uv + k[i] * st * s));
            float dz = z0 - zs;
            occ += smoothstep(0.04, 0.45, dz) * (1.0 - smoothstep(1.2, 3.0, dz));
          }
          col *= 1.0 - clamp(occ / 8.0, 0.0, 1.0) * uAO;
        }
        #endif

        // Height fog integrated along the view ray (closed form).
        float fd = uFog.x, ff = uFog.y;
        float h0 = camPos.y - uFog.z;
        float dy = dir.y * dist;
        float amount = fd * exp(-ff * h0) * dist;
        if (abs(ff * dy) > 1e-3) amount *= (1.0 - exp(-ff * dy)) / (ff * dy);
        float fog = clamp(1.0 - exp(-max(amount, 0.0)), 0.0, uFog.w);
        if (sky) fog *= smoothstep(0.32, -0.02, dir.y);
        float sunAmt = clamp(dot(dir, uSunDir), 0.0, 1.0);
        vec3 fc = mix(uFogCol, uSunCol, pow(sunAmt, 5.0) * 0.85);
        col = mix(col, fc, fog);

        // Sun glow and a faint horizontal streak.
        if (uSun.z > 0.0 && readDepth(clamp(uSun.xy, 0.001, 0.999)) >= 0.99999) {
          vec2 d = uv - uSun.xy;
          d.x *= aspect;
          float r2 = dot(d, d);
          float g = exp(-r2 * 7.0) * 0.55 + exp(-r2 * 60.0) * 0.8;
          float streak = exp(-abs(d.y) * 90.0) * exp(-abs(d.x) * 2.2) * 0.35;
          col += uSunCol * (g + streak) * uSun.z * uSun.w;
        }
        outputColor = vec4(col, inputColor.a);
      }`, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.SRC,
      defines: ao ? new Map([['USE_AO', '1']]) : undefined,
      uniforms: new Map<string, Uniform>([
        ['uProjInv', new Uniform(new Matrix4())],
        ['uCamWorld', new Uniform(new Matrix4())],
        ['uFogCol', new Uniform(new Color())],
        ['uSunCol', new Uniform(new Color())],
        ['uSunDir', new Uniform(new Vector3(0, 1, 0))],
        ['uFog', new Uniform(new Vector4(0.01, 0.05, 0, 0.8))],
        ['uSun', new Uniform(new Vector4())],
        ['uAO', new Uniform(0)],
      ]),
    });
  }

  set(a: AtmosphereSettings): void {
    const u = this.uniforms;
    (u.get('uFogCol')!.value as Color).setHex(a.fog);
    (u.get('uSunCol')!.value as Color).setHex(a.sun);
    (u.get('uSunDir')!.value as Vector3).set(...a.sunDir).normalize();
    (u.get('uFog')!.value as Vector4).set(a.density, a.falloff, a.baseY, a.max);
    (u.get('uSun')!.value as Vector4).w = a.glow;
    u.get('uAO')!.value = a.ao;
  }

  update(): void {
    const c = this.cam;
    const u = this.uniforms;
    (u.get('uProjInv')!.value as Matrix4).copy(c.projectionMatrixInverse);
    (u.get('uCamWorld')!.value as Matrix4).copy(c.matrixWorld);
    // Project the sun to screen space; fade the glow out near the edges.
    const sd = u.get('uSunDir')!.value as Vector3;
    const sun = u.get('uSun')!.value as Vector4;
    _m4.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    _v4.set(c.position.x + sd.x * 1000, c.position.y + sd.y * 1000, c.position.z + sd.z * 1000, 1).applyMatrix4(_m4);
    if (_v4.w <= 0) { sun.z = 0; return; }
    const x = _v4.x / _v4.w * 0.5 + 0.5, y = _v4.y / _v4.w * 0.5 + 0.5;
    sun.x = x; sun.y = y;
    const edge = Math.min(x + 0.3, 1.3 - x, y + 0.3, 1.3 - y);
    sun.z = Math.max(0, Math.min(1, edge / 0.3));
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
  /** Scenery detail 0..2 (grass, trees, ambient particles). */
  detail: number;
}

export function settingsFor(q: Quality): QualitySettings {
  switch (q) {
    // No MSAA on any tier: multisampled half-float targets flicker black on
    // Chrome/Windows (ANGLE on Direct3D 11); SMAA in the merged pass is cheaper anyway.
    case 'high': return { quality: q, post: true, msaa: 0, shadows: true, shadowMapSize: 2048, maxPixelRatio: 2, crowd: 1300, detail: 2 };
    case 'medium': return { quality: q, post: true, msaa: 0, shadows: true, shadowMapSize: 1024, maxPixelRatio: 1.5, crowd: 900, detail: 1 };
    case 'low': return { quality: q, post: false, msaa: 0, shadows: false, shadowMapSize: 512, maxPixelRatio: 1, crowd: 350, detail: 0 };
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
  private grade: GradeEffect | null = null;
  private atmosphere: AtmosphereEffect | null = null;
  private bloom: BloomEffect | null = null;
  private vignette: VignetteEffect | null = null;
  private look: ArenaLook | null = null;
  private flashColor = new Color();
  private flashAmt = 0;
  private linesAmt = 0;
  private linesSeed = 0;
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
    this.grade = null;
    this.atmosphere = null;
    this.bloom = null;
    this.vignette = null;
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
    if (!this.composer) { this.look?.usePostFog(false); return; }
    this.composer.removeAllPasses();
    this.composer.addPass(new RenderPass(scene, camera));
    const effects = [] as ConstructorParameters<typeof EffectPass>[1][];
    this.atmosphere = new AtmosphereEffect(camera, this.settings.quality === 'high');
    effects.push(this.atmosphere);
    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.9,
      luminanceSmoothing: 0.25,
      intensity: 1.15,
      radius: 0.72,
    });
    if (this.debug.bloom) effects.push(this.bloom);
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.45 });
    effects.push(this.vignette);
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    this.grade = new GradeEffect();
    effects.push(this.grade);
    if (this.look) this.setLook(this.look);
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

  /** Brief screen flash on heavy impacts (white by default). */
  impact(amount: number, color = 0xfff4e0): void {
    if (amount * 0.12 >= this.flashAmt) this.flashColor.setHex(color);
    this.flashAmt = Math.min(0.22, this.flashAmt + amount * 0.12);
    if (amount >= 0.9) {
      this.linesAmt = Math.min(1, Math.max(this.linesAmt, amount * 0.7));
      this.linesSeed = (this.linesSeed + 1) % 97;
    }
  }

  /** Applies an arena's grade and atmosphere (and hands fog to the post pass when it runs). */
  setLook(look: ArenaLook): void {
    this.look = look;
    look.usePostFog(this.atmosphere !== null);
    const g = look.grade;
    if (this.grade) {
      const u = this.grade.uniforms;
      u.get('uSat')!.value = g.sat;
      u.get('uContrast')!.value = g.contrast;
      (u.get('uShadows')!.value as Vector3).set(...g.shadows);
      (u.get('uHighlights')!.value as Vector3).set(...g.highlights);
    }
    if (this.bloom) {
      this.bloom.intensity = 1.15 * (g.bloom ?? 1);
      this.bloom.luminanceMaterial.threshold = g.bloomThreshold ?? 0.9;
    }
    if (this.vignette) this.vignette.darkness = g.vignette ?? 0.45;
    this.atmosphere?.set(look.atmosphere);
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
    this.flashAmt = Math.max(0, this.flashAmt - dt * 1.6);
    if (this.grade) {
      const f = this.grade.uniforms.get('uFlash')!.value as Vector3;
      f.set(this.flashColor.r, this.flashColor.g, this.flashColor.b).multiplyScalar(this.flashAmt);
      this.linesAmt = Math.max(0, this.linesAmt - dt * 3.2);
      const l = this.grade.uniforms.get('uLines')!.value as Vector4;
      l.z = this.linesAmt;
      l.w = this.linesSeed;
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(scene, camera);
  }
}
