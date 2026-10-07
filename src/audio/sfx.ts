/**
 * Tiny procedural sound engine on the Web Audio API — no audio files to
 * download. Every sound is a few oscillators / noise bursts shaped by
 * envelopes, so it costs almost nothing and works offline.
 */
export type Sfx =
  | 'swing' | 'swingHeavy' | 'hit' | 'hitHeavy' | 'crit' | 'block' | 'parry' | 'cast' | 'castBig'
  | 'explosion' | 'lightning' | 'whoosh' | 'freeze' | 'ko' | 'revive' | 'shield' | 'roar' | 'ui' | 'start' | 'win';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlay = new Map<Sfx, number>();
  muted = false;
  volume = 0.6;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, pan = 0): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, 0.005, peak, dur);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(t: number, dur: number, peak: number, filter: BiquadFilterType, f0: number, f1: number, q = 1, pan = 0): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bq = c.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.004, peak, dur);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    s.connect(bq).connect(g).connect(p).connect(this.master!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  /** `pan` in -1..1 (screen position). */
  play(name: Sfx, pan = 0, intensity = 1): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Throttle identical sounds that stack in the same instant.
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.03) return;
    this.lastPlay.set(name, now);
    const t = now + 0.005;
    const k = intensity;
    pan = Math.max(-0.8, Math.min(0.8, pan));
    switch (name) {
      case 'swing': this.burst(t, 0.12, 0.25 * k, 'bandpass', 900, 3200, 1.2, pan); break;
      case 'swingHeavy': this.burst(t, 0.25, 0.35 * k, 'bandpass', 400, 1800, 1.0, pan); break;
      case 'whoosh': this.burst(t, 0.2, 0.22 * k, 'bandpass', 1800, 500, 0.8, pan); break;
      case 'hit':
        this.burst(t, 0.09, 0.5 * k, 'lowpass', 2400, 400, 0.7, pan);
        this.tone('sine', 180, 60, t, 0.12, 0.45 * k, pan);
        break;
      case 'hitHeavy':
        this.burst(t, 0.22, 0.7 * k, 'lowpass', 1800, 120, 0.8, pan);
        this.tone('sine', 120, 38, t, 0.3, 0.8 * k, pan);
        this.tone('square', 90, 40, t, 0.08, 0.12 * k, pan);
        break;
      case 'crit':
        this.burst(t, 0.12, 0.5 * k, 'highpass', 3000, 6000, 0.7, pan);
        this.tone('triangle', 1400, 700, t, 0.15, 0.2 * k, pan);
        break;
      case 'block':
        this.burst(t, 0.08, 0.35 * k, 'bandpass', 1400, 900, 3, pan);
        this.tone('square', 320, 260, t, 0.06, 0.1 * k, pan);
        break;
      case 'parry':
        this.tone('sine', 1760, 1700, t, 0.5, 0.3 * k, pan);
        this.tone('sine', 2640, 2600, t, 0.35, 0.18 * k, pan);
        this.burst(t, 0.06, 0.4 * k, 'highpass', 4000, 3000, 1, pan);
        break;
      case 'cast':
        this.tone('sine', 400, 1200, t, 0.18, 0.18 * k, pan);
        this.tone('triangle', 800, 2000, t + 0.02, 0.14, 0.08 * k, pan);
        break;
      case 'castBig':
        this.tone('sawtooth', 110, 440, t, 0.6, 0.12 * k, pan);
        this.tone('sine', 220, 880, t, 0.6, 0.18 * k, pan);
        break;
      case 'explosion':
        this.burst(t, 0.8, 0.9 * k, 'lowpass', 1500, 60, 0.6, pan);
        this.tone('sine', 90, 30, t, 0.7, 0.9 * k, pan);
        break;
      case 'lightning':
        for (let i = 0; i < 4; i++) this.burst(t + i * 0.03, 0.06, 0.5 * k, 'highpass', 2500, 1500, 0.5, pan);
        this.tone('sawtooth', 60, 40, t, 0.4, 0.2 * k, pan);
        break;
      case 'freeze':
        this.tone('sine', 2200, 3400, t, 0.3, 0.12 * k, pan);
        this.burst(t, 0.3, 0.25 * k, 'highpass', 5000, 8000, 1, pan);
        break;
      case 'ko':
        this.tone('sine', 70, 25, t, 1.2, 1 * k, pan);
        this.burst(t, 0.9, 0.8 * k, 'lowpass', 900, 50, 0.5, pan);
        break;
      case 'revive':
        this.tone('sine', 300, 1200, t, 0.8, 0.25 * k, pan);
        this.burst(t, 0.8, 0.4 * k, 'bandpass', 600, 2400, 0.7, pan);
        break;
      case 'shield':
        this.tone('sine', 600, 900, t, 0.25, 0.12 * k, pan);
        break;
      case 'roar':
        this.tone('sawtooth', 140, 80, t, 0.5, 0.2 * k, pan);
        this.burst(t, 0.5, 0.35 * k, 'bandpass', 500, 300, 1.5, pan);
        break;
      case 'ui': this.tone('triangle', 660, 880, t, 0.06, 0.12); break;
      case 'start':
        this.tone('sawtooth', 220, 110, t, 0.6, 0.15);
        this.burst(t, 0.6, 0.4, 'lowpass', 800, 100, 0.6);
        this.tone('sine', 110, 55, t, 0.8, 0.5);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.09, 0.35, 0.16));
        break;
    }
  }
}

export const sfx = new AudioEngine();
