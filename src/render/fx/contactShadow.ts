import { Mesh, PlaneGeometry, ShaderMaterial } from 'three';

let geo: PlaneGeometry | null = null;
let mat: ShaderMaterial | null = null;

/**
 * Soft contact shadow under a fighter: a dark radial blob on the ground that
 * shrinks and fades as the fighter leaves it. Grounds the characters on every
 * tier (the low tier has no shadow maps at all) for one tiny draw.
 */
export class ContactShadow {
  readonly mesh: Mesh;

  constructor() {
    geo ??= new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    mat ??= new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      uniforms: {},
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.15, 1.0, d)) * 0.55;
          a *= a > 0.0 ? 1.0 : 0.0;
          gl_FragColor = vec4(0.06, 0.04, 0.08, a);
        }`,
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
  }

  /** x: fighter position, height: feet above ground, alive: hide on KO fade. */
  update(x: number, height: number, alive: boolean): void {
    const k = Math.max(0, 1 - height / 4);
    const s = (alive ? 1.7 : 2.2) * (0.55 + 0.45 * k);
    this.mesh.position.set(x, 0.015, 0);
    this.mesh.scale.set(s, 1, s * 0.75);
    this.mesh.visible = k > 0.02;
  }
}
