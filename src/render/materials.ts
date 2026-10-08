import {
  BackSide, Color, DoubleSide, FrontSide, DataTexture, MeshBasicMaterial, MeshLambertMaterial, NearestFilter, RedFormat,
  ShaderMaterial, UniformsLib, UniformsUtils, Vector2, type IUniform, type Material,
} from 'three';

// -----------------------------------------------------------------------------
// Shared style: every lit surface in the game goes through one stylised ramp so
// characters and scenery read as one painted world. Each arena sets the mood
// by changing these shared uniforms (cool shadows at golden hour, etc.).
// -----------------------------------------------------------------------------

export const STYLE = {
  /** Multipliers on the base colour for the shadow, mid and lit bands. */
  uShadowTint: { value: new Color(0.36, 0.36, 0.62) },
  uMidTint: { value: new Color(0.74, 0.72, 0.86) },
  uLitTint: { value: new Color(1.06, 1.0, 0.92) },
  /** Light-ratio thresholds for shadow→mid and mid→lit. */
  uRamp: { value: new Vector2(0.42, 0.64) },
  /** Strength of the soft sky light that keeps shadows from going flat. */
  uSkyFill: { value: new Color(0.1, 0.12, 0.2) },
  uTime: { value: 0 },
  /** Outline width in normalised device units, and height/width of the canvas. */
  uOutlineWidth: { value: 0.0036 },
  uAspect: { value: 9 / 16 },
} satisfies Record<string, IUniform>;

/** Kept for code that still wants a stepped toon ramp texture. */
let gradient: DataTexture | null = null;
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

interface StyleOptions {
  fighter?: FighterUniforms;
  /** Vertex attribute `wind` (0..1) sways the vertex: grass, leaves, cloth. */
  wind?: boolean;
  /** Extra vertex code (after begin_vertex) and its declarations. */
  vertexPars?: string;
  vertex?: string;
  /** Extra vertex code after beginnormal_vertex (may modify objectNormal). */
  normalVertex?: string;
  /** Custom colour code run after color_fragment (may modify diffuseColor). */
  fragmentPars?: string;
  fragmentColor?: string;
}

/**
 * Patches a Lambert material into the house style. Lighting is still computed
 * by three (so shadows and every light work), then the result is converted to
 * a light ratio and remapped onto three hue-shifted bands: cool shadows, a
 * soft mid tone and warm lights, plus a hard specular glint on glossy parts.
 * Everything is clamped so no driver can produce NaN pixels.
 */
function stylize(m: MeshLambertMaterial, key: string, o: StyleOptions): MeshLambertMaterial {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uShadowTint: STYLE.uShadowTint, uMidTint: STYLE.uMidTint, uLitTint: STYLE.uLitTint,
      uRamp: STYLE.uRamp, uSkyFill: STYLE.uSkyFill, uTime: STYLE.uTime,
    });
    if (o.fighter) Object.assign(sh.uniforms, o.fighter);
    let vpars = '\nattribute float gloss;\nvarying float vGloss;\nuniform float uTime;\n' + (o.vertexPars ?? '');
    let vbody = '\nvGloss = gloss;\n';
    if (o.wind) {
      vpars += 'attribute float wind;\n';
      vbody += `
        {
          vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
          float ph = uTime * 1.6 + wp.x * 0.35 + wp.z * 0.21;
          float sway = sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.25;
          transformed.x += sway * wind * 0.16;
          transformed.z += cos(ph * 0.8) * wind * 0.06;
        }`;
    }
    vbody += o.vertex ?? '';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + vpars)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + (o.normalVertex ?? ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + vbody);

    let fpars = `
uniform vec3 uShadowTint;
uniform vec3 uMidTint;
uniform vec3 uLitTint;
uniform vec2 uRamp;
uniform vec3 uSkyFill;
varying float vGloss;
` + (o.fragmentPars ?? '');
    if (o.fighter) fpars += 'uniform float uFlash;\nuniform vec3 uTint;\nuniform float uTintAmt;\nuniform vec3 uRim;\n';
    let fbody = `
{
  vec3 base = max(diffuseColor.rgb, vec3(0.0));
  float bl = max(dot(base, vec3(0.299, 0.587, 0.114)), 0.02);
  float ll = dot(max(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(0.0)), vec3(0.299, 0.587, 0.114));
  float ratio = clamp(ll / bl * PI * 0.25, 0.0, 4.0);
  float t1 = smoothstep(uRamp.x - 0.05, uRamp.x + 0.05, ratio);
  float t2 = smoothstep(uRamp.y - 0.04, uRamp.y + 0.04, ratio);
  vec3 vdir = vViewPosition * inversesqrt(max(dot(vViewPosition, vViewPosition), 1e-8));
  float ndv = clamp(dot(normal, vdir), 0.0, 1.0);
  vec3 col = mix(mix(base * uShadowTint, base * uMidTint, t1), base * uLitTint, t2);
  // Sky fill brightens upward-facing shadow areas a touch (reads as bounce light).
  col += base * uSkyFill * (0.5 + 0.5 * normal.y) * (1.0 - t2);
  #if NUM_DIR_LIGHTS > 0
    vec3 hv = directionalLights[0].direction + vdir;
    hv *= inversesqrt(max(dot(hv, hv), 1e-8));
    float spec = smoothstep(0.93, 0.955, clamp(dot(normal, hv), 0.0, 1.0)) * vGloss * (0.35 + 0.65 * t2);
    col += mix(base, vec3(1.0), 0.6) * spec * 0.9;
  #endif
  // Glossy surfaces also pick up a thin bright edge.
  col += base * smoothstep(0.72, 0.9, 1.0 - ndv) * vGloss * 0.5;
`;
    if (o.fighter) {
      fbody += `
  float fres = 1.0 - ndv;
  col += uRim * smoothstep(0.58, 0.86, fres) * 0.5;
  col = mix(col, uTint * (0.6 + fres), clamp(uTintAmt, 0.0, 1.0));
  col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));
`;
    }
    fbody += `
  outgoingLight = col + totalEmissiveRadiance;
}
#include <opaque_fragment>`;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + fpars)
      .replace('#include <opaque_fragment>', fbody);
    if (o.fragmentColor) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + o.fragmentColor);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/** Vertex-coloured, skinned body material for one fighter. */
export function fighterMaterial(u: FighterUniforms): MeshLambertMaterial {
  return stylize(new MeshLambertMaterial({ vertexColors: true }), 'cb-fighter', { fighter: u });
}

/**
 * Vertex-coloured scenery material. Arenas merge all their static props into a
 * few meshes using this, so a whole landscape costs a couple of draw calls.
 */
const envCache = new Map<string, MeshLambertMaterial>();
export function envMaterial(wind = false, fog = true): MeshLambertMaterial {
  const key = (wind ? 'cb-env-wind' : 'cb-env') + (fog ? '' : '-nofog');
  let m = envCache.get(key);
  if (!m) {
    // Windy scenery is thin (blades, banners, awnings): draw both faces.
    m = stylize(new MeshLambertMaterial({ vertexColors: true, fog, side: wind ? DoubleSide : FrontSide }), key, { wind });
    envCache.set(key, m);
  }
  return m;
}

/** Stylised material with a texture map (floors). */
export function texturedMaterial(map: import('three').Texture, key: string): MeshLambertMaterial {
  return stylize(new MeshLambertMaterial({ map }), 'cb-tex-' + key, {});
}

/** Stylised material with custom vertex/colour code (crowds, banners...). */
export function customStyled(key: string, o: StyleOptions & { color?: number; vertexColors?: boolean }): MeshLambertMaterial {
  return stylize(new MeshLambertMaterial({ color: o.color ?? 0xffffff, vertexColors: o.vertexColors ?? false }), key, o);
}

const sceneCache = new Map<string, MeshLambertMaterial>();
/** Plain cached stylised material for one-off props. */
export function sceneToon(color: number, emissive = 0, emissiveIntensity = 1): MeshLambertMaterial {
  const key = `${color}:${emissive}:${emissiveIntensity}`;
  let m = sceneCache.get(key);
  if (!m) {
    m = stylize(new MeshLambertMaterial({ color, emissive, emissiveIntensity }), 'cb-plain', {});
    sceneCache.set(key, m);
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

/** Unlit vertex-coloured HDR material (merged emissive bits). */
export function glowVertexMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
}

let outline: ShaderMaterial | null = null;

/**
 * Inverted-hull outline drawn in a darker, more saturated shade of each
 * vertex's own colour (coloured line art rather than flat black). Works on
 * plain, skinned and instanced meshes; the hull is pushed out in clip space so
 * the line keeps a constant pixel width at any zoom.
 */
export function outlineMaterial(): ShaderMaterial {
  if (outline) return outline;
  outline = new ShaderMaterial({
    side: BackSide,
    vertexColors: true,
    fog: true,
    uniforms: UniformsUtils.merge([UniformsLib.fog, {}]),
    vertexShader: /* glsl */ `
      uniform float uWidth;
      uniform float uAspect;
      varying vec3 vLine;
      #include <common>
      #include <color_pars_vertex>
      #include <skinning_pars_vertex>
      #include <fog_pars_vertex>
      void main() {
        #include <color_vertex>
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vec2 d = (projectionMatrix * vec4(transformedNormal, 0.0)).xy;
        float l = length(d);
        d = l > 1e-5 ? d / l : vec2(0.0);
        d.x *= uAspect;
        gl_Position.xy += d * uWidth * gl_Position.w;
        #include <fog_vertex>
        vec3 c = max(vColor.rgb, vec3(0.0)) * 0.22;
        float g = dot(c, vec3(0.299, 0.587, 0.114));
        vLine = max(mix(vec3(g), c, 1.5), vec3(0.0)) + vec3(0.008, 0.008, 0.02);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vLine;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(vLine, 1.0);
        #include <fog_fragment>
      }`,
  });
  outline.uniforms.uWidth = STYLE.uOutlineWidth;
  outline.uniforms.uAspect = STYLE.uAspect;
  return outline;
}

export function disposeMaterial(m: Material | Material[]): void {
  if (Array.isArray(m)) m.forEach((x) => x.dispose());
  else m.dispose();
}
