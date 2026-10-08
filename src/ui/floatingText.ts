import { Vector3, type PerspectiveCamera } from 'three';

interface Item {
  el: HTMLDivElement;
  pos: Vector3;
  vy: number;
  vx: number;
  t: number;
  life: number;
  active: boolean;
  scale: number;
}

const _v = new Vector3();

/**
 * Pooled DOM damage numbers / callouts. Only `transform` and `opacity` change
 * per frame, so updates stay on the compositor without layout.
 */
export class FloatingText {
  private readonly pool: Item[] = [];
  private next = 0;

  constructor(root: HTMLElement, size = 40) {
    for (let i = 0; i < size; i++) {
      const el = document.createElement('div');
      el.className = 'ftext';
      el.style.opacity = '0';
      root.appendChild(el);
      this.pool.push({ el, pos: new Vector3(), vy: 0, vx: 0, t: 0, life: 1, active: false, scale: 1 });
    }
  }

  spawn(text: string, x: number, y: number, cls: string, scale = 1, life = 0.9): void {
    const it = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    it.active = true;
    it.t = 0;
    it.life = life;
    it.scale = scale;
    it.pos.set(x + (Math.random() - 0.5) * 0.5, y, 0.5);
    it.vy = 1.6 + Math.random() * 0.6;
    it.vx = (Math.random() - 0.5) * 0.8;
    it.el.className = `ftext ${cls}`;
    it.el.textContent = text;
  }

  update(dt: number, camera: PerspectiveCamera, width: number, height: number): void {
    for (const it of this.pool) {
      if (!it.active) continue;
      it.t += dt;
      if (it.t >= it.life) {
        it.active = false;
        it.el.style.opacity = '0';
        continue;
      }
      it.vy -= dt * 2.2;
      it.pos.y += it.vy * dt;
      it.pos.x += it.vx * dt;
      _v.copy(it.pos).project(camera);
      const sx = (_v.x * 0.5 + 0.5) * width;
      const sy = (-_v.y * 0.5 + 0.5) * height;
      const k = it.t / it.life;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.7 : 1.3 - Math.min(0.3, (k - 0.12) * 1.5);
      it.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(pop * it.scale).toFixed(3)})`;
      it.el.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1);
    }
  }

  clear(): void {
    for (const it of this.pool) { it.active = false; it.el.style.opacity = '0'; }
  }
}
