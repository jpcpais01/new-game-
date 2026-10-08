import { AdditiveBlending, CustomBlending, HalfFloatType, type Mesh, type Object3D, type Scene } from 'three';
import type { GameRenderer } from './render/renderer';
import { h } from './ui/dom';

/**
 * Opt-in diagnostics (?debug): live render stats, an event log, a black-frame
 * detector that reads back a few screen pixels each frame, switches to turn
 * render features off one at a time, and a one-click report to paste back.
 */
export interface DebugContext {
  renderer: GameRenderer;
  scene: Scene;
  getState: () => string;
}

interface LogEntry { t: number; msg: string }

export interface DebugHooks { beforeRender: () => void; afterRender: (dt: number) => void }

export function installDebug(ctx: DebugContext): DebugHooks {
  const { renderer: gr, scene } = ctx;
  const gl = gr.renderer.getContext() as WebGL2RenderingContext;
  const canvas = gr.canvas;
  const t0 = performance.now();
  const log: LogEntry[] = [];
  const add = (msg: string) => {
    log.push({ t: performance.now() - t0, msg });
    if (log.length > 400) log.shift();
  };

  // --- Environment ---------------------------------------------------------
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? `${gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)} | ${gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)}` : String(gl.getParameter(gl.RENDERER));
  const env = [
    `url: ${location.href}`,
    `ua: ${navigator.userAgent}`,
    `gpu: ${gpu}`,
    `screen: ${screen.width}x${screen.height} avail ${screen.availWidth}x${screen.availHeight}`,
    `maxSamples: ${gl.getParameter(gl.MAX_SAMPLES)} · maxTex: ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`,
    `ext color_buffer_float: ${!!gl.getExtension('EXT_color_buffer_float')} · float_blend: ${!!gl.getExtension('EXT_float_blend')}`,
    `build: ${import.meta.env.MODE}`,
  ];

  const sizes = () => {
    const t = gr.composerTarget;
    return `css ${canvas.clientWidth}x${canvas.clientHeight} · buffer ${canvas.width}x${canvas.height} · drawingBuffer ${gl.drawingBufferWidth}x${gl.drawingBufferHeight} · dpr ${devicePixelRatio} · rendererPR ${gr.renderer.getPixelRatio()} · scale ${gr.renderScale.toFixed(2)} · target ${t ? `${t.width}x${t.height} s${t.samples}` : 'none'} · quality ${gr.settings.quality}`;
  };

  // --- Events --------------------------------------------------------------
  window.addEventListener('resize', () => add(`window resize → ${innerWidth}x${innerHeight} | ${sizes()}`));
  document.addEventListener('visibilitychange', () => add(`visibility ${document.visibilityState}`));
  window.addEventListener('blur', () => add('window blur'));
  window.addEventListener('focus', () => add('window focus'));
  canvas.addEventListener('webglcontextlost', () => add('!!! WEBGL CONTEXT LOST'));
  canvas.addEventListener('webglcontextrestored', () => add('webgl context restored'));
  new ResizeObserver(() => add(`canvas observer | ${sizes()}`)).observe(canvas);
  const watchDpr = () => {
    const mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => { add(`devicePixelRatio → ${devicePixelRatio}`); watchDpr(); }, { once: true });
  };
  watchDpr();
  const prevScale = gr.onScale;
  gr.onScale = (a, b) => { add(`dynamic resolution ${a.toFixed(2)} → ${b.toFixed(2)}`); prevScale?.(a, b); };
  add(`start | ${sizes()}`);

  // --- Panel ---------------------------------------------------------------
  const live = h('pre', { style: { margin: '0', whiteSpace: 'pre-wrap' } });
  const status = h('div', { style: { color: '#8f8' } });
  const toggles: Array<[string, () => boolean, (v: boolean) => void]> = [
    ['Post FX', () => gr.debug.post, (v) => { gr.debug.post = v; gr.rebuild(); }],
    ['Bloom', () => gr.debug.bloom, (v) => { gr.debug.bloom = v; gr.rebuild(); }],
    ['NaN guard', () => gr.debug.nanGuard, (v) => { gr.debug.nanGuard = v; gr.rebuild(); }],
    ['MSAA (old High)', () => gr.debug.msaa, (v) => { gr.debug.msaa = v; gr.rebuild(); }],
    ['Dynamic res', () => gr.debug.dynRes, (v) => { gr.debug.dynRes = v; }],
    ['Glow FX', () => glowFx, (v) => { glowFx = v; }],
  ];
  let glowFx = true;
  const btnStyle = { font: 'inherit', padding: '4px 8px', margin: '2px', borderRadius: '6px', border: '1px solid #555', cursor: 'pointer' };
  const toggleRow = h('div');
  const renderToggles = () => {
    toggleRow.replaceChildren(...toggles.map(([name, get, set]) => h('button', {
      style: { ...btnStyle, background: get() ? '#264' : '#622', color: '#fff' },
      onclick: () => { set(!get()); add(`toggle ${name} → ${get() ? 'on' : 'off'}`); renderToggles(); },
    }, `${name}: ${get() ? 'on' : 'off'}`)));
  };
  renderToggles();

  const copy = async () => {
    const text = report();
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Report copied. Paste it in the chat.';
    } catch {
      const ta = h<HTMLTextAreaElement>('textarea', { style: { position: 'fixed', inset: '10%', zIndex: '100001' } });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      status.textContent = 'Copy blocked: the report is in the box, select all and copy it.';
    }
  };
  const mark = () => { add(`### USER SAW FLICKER | ${sizes()}`); scanNaN('user mark'); status.textContent = 'Marked. Keep playing, then Copy report.'; };

  const panel = h('div', {
    style: {
      position: 'fixed', left: '8px', bottom: '8px', zIndex: '100000', maxWidth: 'min(560px, calc(100vw - 16px))',
      background: 'rgba(0,0,0,0.85)', color: '#ddd', font: '11px/1.35 ui-monospace, Consolas, monospace',
      padding: '8px', borderRadius: '8px', pointerEvents: 'auto',
    },
  },
  h('div', { style: { fontWeight: '700', color: '#fc6', marginBottom: '4px' } }, 'Clashborn debug · press F (or Flicker!) the moment you see it'),
  live, toggleRow,
  h('div', null,
    h('button', { style: { ...btnStyle, background: '#a60', color: '#fff' }, onclick: mark }, 'Flicker!'),
    h('button', { style: { ...btnStyle, background: '#246', color: '#fff' }, onclick: copy }, 'Copy report'),
  ),
  status);
  document.body.append(panel);
  window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'f') mark(); });

  // --- NaN scan of the HDR scene buffer -------------------------------------
  let scans = 0;
  function scanNaN(reason: string): void {
    const t = gr.composerTarget;
    if (!t || scans >= 6) return;
    scans++;
    try {
      const w = t.width, hh = t.height;
      const half = t.texture.type === HalfFloatType;
      const buf = half ? new Uint16Array(w * hh * 4) : new Uint8Array(w * hh * 4);
      gr.renderer.readRenderTargetPixels(t, 0, 0, w, hh, buf);
      let bad = 0, minX = w, minY = hh, maxX = -1, maxY = -1, maxV = 0;
      if (half) {
        for (let i = 0; i < buf.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            const v = buf[i + c];
            if ((v & 0x7c00) === 0x7c00) {
              bad++;
              const p = i >> 2, x = p % w, y = (p / w) | 0;
              if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
              break;
            }
            if ((v & 0x7fff) > maxV) maxV = v & 0x7fff;
          }
        }
      }
      add(`scan (${reason}): ${bad} NaN/Inf pixels${bad ? ` in box x${minX}-${maxX} y${minY}-${maxY}` : ''} · max half bits 0x${maxV.toString(16)}`);
    } catch (err) {
      add(`scan failed: ${(err as Error).message}`);
    }
  }

  // --- Per-frame -----------------------------------------------------------
  const px = new Uint8Array(4);
  const hidden = new Set<Object3D>();
  let frames = 0, worst = 0, statT = 0, lastState = '', blackRun = 0, blackFrames = 0, spikes = 0;
  let fpsAcc = 0, fpsN = 0, fps = 0, ema = 1 / 60;
  const additive = (m: unknown) => {
    const mat = m as { blending?: number };
    return mat.blending === AdditiveBlending || mat.blending === CustomBlending;
  };

  function report(): string {
    return [
      '=== Clashborn debug report ===',
      ...env,
      `now: ${sizes()}`,
      `state: ${ctx.getState()} · fps ${fps.toFixed(0)} · black frames ${blackFrames} · spikes ${spikes}`,
      `toggles: ${toggles.map(([n, g]) => `${n}=${g() ? 'on' : 'off'}`).join(', ')}`,
      '--- log (ms) ---',
      ...log.map((e) => `${e.t.toFixed(0).padStart(7)} ${e.msg}`),
    ].join('\n');
  }

  const beforeRender = () => {
    if (!glowFx) {
      scene.traverse((o) => {
        if ((o as Mesh).isMesh && o.visible && additive((o as Mesh).material)) { o.visible = false; hidden.add(o); }
      });
    } else if (hidden.size) {
      for (const o of hidden) o.visible = true;
      hidden.clear();
    }

  };

  const afterRender = (dt: number) => {
    frames++;
    const state = ctx.getState();
    if (state !== lastState) { add(`state ${lastState || '-'} → ${state}`); lastState = state; }
    // Log hitches relative to the usual frame time, not slow devices in general.
    if (dt > 0.05 && dt > ema * 3) { spikes++; add(`frame spike ${(dt * 1000).toFixed(0)}ms (usual ${(ema * 1000).toFixed(0)}ms)`); }
    ema += (dt - ema) * 0.05;
    worst = Math.max(worst, dt);
    fpsAcc += dt; fpsN++;

    // Black-frame detector: sample a 3x3 grid of the frame just drawn.
    if (gl.getParameter(gl.FRAMEBUFFER_BINDING) === null) {
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      let black = 0;
      for (let j = 1; j <= 3; j++) {
        for (let i = 1; i <= 3; i++) {
          gl.readPixels(Math.floor((W * i) / 4), Math.floor((H * j) / 4), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          if (px[0] + px[1] + px[2] < 6) black++;
        }
      }
      if (black >= 5) {
        blackRun++;
        if (blackRun === 1) {
          blackFrames++;
          add(`!!! BLACK FRAME (${black}/9 samples black) | ${sizes()}`);
          scanNaN('black frame');
        }
      } else if (blackRun) {
        add(`black ended after ${blackRun} frame(s)`);
        blackRun = 0;
      }
    }

    statT += dt;
    if (statT > 0.25) {
      fps = fpsN / Math.max(1e-6, fpsAcc);
      const info = gr.renderer.info.render;
      live.textContent = `${fps.toFixed(0)} fps · worst ${(worst * 1000).toFixed(0)}ms · ${info.calls} draws · state ${state}\n${sizes()}\nblack frames ${blackFrames} · spikes ${spikes} · log ${log.length}`;
      statT = 0; worst = 0; fpsAcc = 0; fpsN = 0;
    }
  };

  return { beforeRender, afterRender };
}
