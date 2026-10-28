/**
 * The sky's clouds: one small WebGL fragment shader on a transparent canvas
 * (the gradient, stars, moon and sun are cheaper DOM layers underneath).
 * Three layers at different depths: small and slow far away, large and
 * faster up close, each with its own scroll parallax. Billowy shapes come
 * from domain-warped fractal noise; each cloud is lit from the sun or moon
 * (a second sample toward the light shades its far side). Rendered at a
 * fraction of the screen's resolution: clouds are soft, so it doesn't show.
 */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y; // y down, like the page
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const frag = (octaves: number) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uLight;
uniform float uOpacity;
uniform vec2 uSource;
uniform float uGlow;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < ${octaves}; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

// One layer: returns its density (0-1) and, through 'lit', how much of it faces the light.
float cloud(vec2 uv, float aspect, float scale, float speed, float parallax, float cover, float y0, float y1, out float lit) {
  // Clouds are wider than they are tall: stretch the noise horizontally.
  vec2 p = vec2(uv.x * aspect * 0.6, (uv.y + uScroll * parallax) * 1.45) * scale + vec2(uTime * speed, 0.0);
  // A light domain warp: billowing edges (a strong one makes smoke).
  vec2 q = vec2(fbm(p + vec2(0.0, uTime * speed * 0.35)), fbm(p + vec2(5.2, 1.3)));
  vec2 w = p + 0.55 * q;
  float d = fbm(w);
  float band = smoothstep(y0 - 0.18, y0 + 0.04, uv.y) * (1.0 - smoothstep(y1 - 0.04, y1 + 0.2, uv.y));
  float density = smoothstep(cover, cover + 0.17, d) * band;
  vec2 toLight = normalize((uSource - uv) * vec2(aspect, 1.0) + vec2(0.0001)) * 0.07;
  float towardLight = fbm(w + toLight * scale);
  // Lit where the cloud thins toward the light; a flatter, shaded underside.
  lit = clamp(0.62 + (d - towardLight) * 4.0 - smoothstep(0.0, 0.25, d - cover) * 0.18, 0.0, 1.0);
  return density;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  float lit;
  // Far to near: each layer is composited over the ones behind it.
  float dFar = cloud(uv, aspect, 3.2, 0.006, 0.04, 0.53, 0.02, 0.5, lit);
  vec3 cFar = mix(uShade, uLit, lit);
  col = cFar * dFar * 0.62; alpha = dFar * 0.62;
  float dMid = cloud(uv + vec2(0.37, 0.0), aspect, 2.1, 0.011, 0.09, 0.52, 0.12, 0.72, lit);
  vec3 cMid = mix(uShade, uLit, lit);
  float aMid = dMid * 0.85;
  col = cMid * aMid + col * (1.0 - aMid); alpha = aMid + alpha * (1.0 - aMid);
  float dNear = cloud(uv + vec2(0.71, 0.3), aspect, 1.35, 0.019, 0.17, 0.53, 0.42, 1.05, lit);
  vec3 cNear = mix(uShade, uLit, lit);
  float aNear = dNear * 0.95;
  col = cNear * aNear + col * (1.0 - aNear); alpha = aNear + alpha * (1.0 - aNear);
  // Clouds near the sun (or moon) catch its light at their edges.
  float near = exp(-length((uv - uSource) * vec2(aspect, 1.0)) * 3.2) * uGlow;
  col += uLight * near * alpha * 0.6;
  alpha *= uOpacity;
  col *= uOpacity;
  gl_FragColor = vec4(col, alpha); // premultiplied
}`;

export type CloudUniforms = {
  time: number;
  scroll: number;
  lit: [number, number, number];
  shade: [number, number, number];
  light: [number, number, number];
  opacity: number;
  source: { x: number; y: number };
  glow: number;
};

const UNIFORMS = ["uRes", "uTime", "uScroll", "uLit", "uShade", "uLight", "uOpacity", "uSource", "uGlow"] as const;
type Uniform = (typeof UNIFORMS)[number];

export class SkyClouds {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly loc: Record<Uniform, WebGLUniformLocation | null>;

  private constructor(
    readonly canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    program: WebGLProgram,
  ) {
    this.gl = gl;
    this.program = program;
    this.loc = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(program, n)])) as Record<Uniform, WebGLUniformLocation | null>;
  }

  /** Null when WebGL isn't available (the sky then shows without clouds). */
  static create(canvas: HTMLCanvasElement, octaves: number) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    if (!gl) return null;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT);
    const fs = shader(gl.FRAGMENT_SHADER, frag(octaves));
    const program = gl.createProgram();
    if (!vs || !fs || !program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // One triangle that covers the screen.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return new SkyClouds(canvas, gl, program);
  }

  /** Match the canvas buffer to its CSS size × scale. */
  resize(scale: number) {
    const w = Math.max(16, Math.round(this.canvas.clientWidth * scale));
    const h = Math.max(16, Math.round(this.canvas.clientHeight * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  draw(u: CloudUniforms) {
    const { gl, loc } = this;
    gl.uniform2f(loc.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(loc.uTime, u.time % 10_000);
    gl.uniform1f(loc.uScroll, u.scroll);
    gl.uniform3f(loc.uLit, ...u.lit);
    gl.uniform3f(loc.uShade, ...u.shade);
    gl.uniform3f(loc.uLight, ...u.light);
    gl.uniform1f(loc.uOpacity, u.opacity);
    gl.uniform2f(loc.uSource, u.source.x, u.source.y);
    gl.uniform1f(loc.uGlow, u.glow);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy() {
    this.gl.deleteProgram(this.program);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
