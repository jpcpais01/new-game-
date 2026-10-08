import {
  BackSide, Color, DataTexture, MeshBasicMaterial, MeshToonMaterial, NearestFilter, RedFormat,
  ShaderMaterial, type IUniform, type Material,
} from 'three';

let gradient: DataTexture | null = null;

/** 4-band light ramp shared by every toon material. */
export function toonGradient(): DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 140, 205, 255]);
  gradient = new DataTexture(data, data.length, 1, RedFormat);
  gradient.minFilter = NearestFilter;
  gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

/** Uniforms shared by all materials of one fighter (hit flash, status tint). */
export interface FighterUniforms {
  uFlash: IUniform<number>;
  uTint: IUniform<Color>;
  uTintAmt: IUniform<number>;
  uRim: IUniform<Color>;
}

export function createFighterUniforms(rim: number): FighterUniforms {
  return {
    uFlash: { value: 0 },
    uTint: { value: new Color(0x88ddff) },
    uTintAmt: { value: 0 },
    uRim: { value: new Color(rim) },
  };
}

export interface ToonOptions {
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

/**
 * Toon material with a fresnel rim light plus per-fighter flash/tint, patched
 * into three's MeshToonMaterial so it still uses the standard light loop.
 */
export function fighterToon(color: number, u: FighterUniforms, opts: ToonOptions = {}): MeshToonMaterial {
  const m = new MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = u.uFlash;
    shader.uniforms.uTint = u.uTint;
    shader.uniforms.uTintAmt = u.uTintAmt;
    shader.uniforms.uRim = u.uRim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uFlash;
uniform vec3 uTint;
uniform float uTintAmt;
uniform vec3 uRim;`)
      .replace('#include <opaque_fragment>', `
{
  float fres = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
  outgoingLight += uRim * fres * 0.55;
  outgoingLight = mix(outgoingLight, uTint * (0.6 + fres), uTintAmt);
  outgoingLight = mix(outgoingLight, vec3(1.0), uFlash);
}
#include <opaque_fragment>`);
  };
  // Distinct program cache key so the patch isn't shared with unpatched materials.
  m.customProgramCacheKey = () => 'fighterToon';
  return m;
}

const envCache = new Map<string, MeshToonMaterial>();

/** Plain cached toon material for static scenery. */
export function sceneToon(color: number, emissive = 0, emissiveIntensity = 1): MeshToonMaterial {
  const key = `${color}:${emissive}:${emissiveIntensity}`;
  let m = envCache.get(key);
  if (!m) {
    m = new MeshToonMaterial({ color, gradientMap: toonGradient(), emissive, emissiveIntensity });
    envCache.set(key, m);
  }
  return m;
}

const glowCache = new Map<number, MeshBasicMaterial>();

/** Unlit HDR colour; values above 1 feed the bloom pass. */
export function glow(color: number, intensity = 2.2): MeshBasicMaterial {
  const key = color * 31 + Math.round(intensity * 100);
  let m = glowCache.get(key);
  if (!m) {
    m = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity), toneMapped: false });
    glowCache.set(key, m);
  }
  return m;
}

let outline: ShaderMaterial | null = null;

/**
 * Inverted-hull outline: back faces pushed out along the normal in clip space
 * so the line keeps a roughly constant pixel width at any zoom.
 */
export function outlineMaterial(): ShaderMaterial {
  if (outline) return outline;
  outline = new ShaderMaterial({
    side: BackSide,
    uniforms: {
      uColor: { value: new Color(0x0b0d18) },
      uWidth: { value: 0.0042 },
    },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vec2 dir = normalize((projectionMatrix * vec4(n, 0.0)).xy + 1e-5);
        clip.xy += dir * uWidth * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  });
  return outline;
}

export function disposeMaterial(m: Material | Material[]): void {
  if (Array.isArray(m)) m.forEach((x) => x.dispose());
  else m.dispose();
}
