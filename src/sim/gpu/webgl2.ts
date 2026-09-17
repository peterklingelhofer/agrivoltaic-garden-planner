import type { Extent2D } from '../../types/geo'
import type { Occluder } from '../../types/pv'
import type { CumulativeSky } from '../../types/weather'
import type {
  AccumulationProgress,
  AccumulationRequest,
  AccumulationResult,
  SkyMatrixBackend,
} from '../backend'
import { sinDeg } from '../math'
import { sunUnitVector } from '../solar'

// document the alternative shadow-map path; the implemented path below is the analytic
// ray/quad cast of the solar geometry document section 5.4 Path A, chosen because it matches the CPU oracle
// exactly and needs no bias to tune
export const SHADOW_MAP_SIZE = 1024
export const DEPTH_BIAS_CONSTANT = 2
export const DEPTH_BIAS_SLOPE = 2.5

export const isWebgl2Available = (): boolean => {
  try {
    if (typeof OffscreenCanvas === 'undefined') return false
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2')
    if (gl === null) return false
    return gl.getExtension('EXT_color_buffer_float') !== null
  } catch {
    return false
  }
}

const VERTEX_SRC = `#version 300 es
void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`

// direction texture layout, 5 texel rows per direction column:
//   row 0: (dx, dy, dz, isBeam)            row 1: (annualWeight, svfWeight, windowWeight, 0)
//   rows 2-4: 12 monthly weights, 4 per row, beam or diffuse per isBeam
// accumulation targets: attachment 0 = (beam, diffuse, svf, window), 1..6 = month pairs
// (0,1) (2,3) (4,5) (6,7) (8,9) (10,11), each channel-pair (beam, diffuse). The spare alpha of
// attachment 0 carries one time window, which is why MAX_GPU_WINDOWS is 1: it needs no extra
// draw buffer, no extra pass and no extra bandwidth
//
// the panel texture gains a 5th row, one texel per quad: (transmittance, leaflessTransmittance,
// 0, 0). Absent from a panel or a house face it reads 0 (opaque), the scalar every call already
// passed. A tree's two figures land there instead (Decision Record 26)
const FRAGMENT_SRC = `#version 300 es
precision highp float;

uniform sampler2D uPanels;
uniform int uPanelCount;
uniform sampler2D uDirs;
uniform int uDirCount;
uniform float uMinX;
uniform float uMinY;
uniform float uCellSize;
// 0 = every panel and house face is opaque, the path proven before trees existed; 1 = a quad may
// carry its own transmittance, chosen in-leaf or leafless by uLeafOnMask
uniform int uSeasonal;
// bit m set means calendar month m (0 = January) is in leaf
uniform int uLeafOnMask;

layout(location = 0) out vec4 outAnnual;
layout(location = 1) out vec4 outMonth01;
layout(location = 2) out vec4 outMonth23;
layout(location = 3) out vec4 outMonth45;
layout(location = 4) out vec4 outMonth67;
layout(location = 5) out vec4 outMonth89;
layout(location = 6) out vec4 outMonth1011;

vec3 panelCorner(int panelIndex, int corner) {
  return texelFetch(uPanels, ivec2(panelIndex, corner), 0).xyz;
}

vec2 panelTransmittance(int panelIndex) {
  return texelFetch(uPanels, ivec2(panelIndex, 4), 0).xy;
}

bool inTriangle(vec3 x, vec3 a, vec3 b, vec3 c, vec3 n) {
  float s0 = dot(n, cross(b - a, x - a));
  float s1 = dot(n, cross(c - b, x - b));
  float s2 = dot(n, cross(a - c, x - c));
  return (s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0) || (s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0);
}

float panelBlocks(vec3 p, vec3 d, int panelIndex) {
  vec3 q0 = panelCorner(panelIndex, 0);
  vec3 q1 = panelCorner(panelIndex, 1);
  vec3 q2 = panelCorner(panelIndex, 2);
  vec3 q3 = panelCorner(panelIndex, 3);
  vec3 n = cross(q1 - q0, q3 - q0);
  float denom = dot(n, d);
  if (abs(denom) < 1e-9) return 0.0;
  float t = dot(n, q0 - p) / denom;
  if (t <= 0.0) return 0.0;
  vec3 x = p + t * d;
  return (inTriangle(x, q0, q1, q2, n) || inTriangle(x, q0, q2, q3, n)) ? 1.0 : 0.0;
}

// the running min over every blocking quad's (in-leaf, leafless) figure, on in x and off in y;
// with uSeasonal off every figure is 0 or absent-as-0, so x collapses to the old binary visibility
vec2 visibility(vec3 p, vec3 d) {
  vec2 vis = vec2(1.0, 1.0);
  for (int i = 0; i < uPanelCount; i += 1) {
    if (panelBlocks(p, d, i) > 0.5) {
      vis = min(vis, panelTransmittance(i));
      if (vis.x <= 0.0 && vis.y <= 0.0) return vis;
    }
  }
  return vis;
}

vec4 monthPair(float beamVis, float diffuseVis, float weightA, float weightB) {
  return vec4(beamVis * weightA, diffuseVis * weightA, beamVis * weightB, diffuseVis * weightB);
}

bool leafOn(int month) {
  return ((uLeafOnMask >> month) & 1) == 1;
}

// one month's beam/diffuse pair, on or off figure chosen per the mask, weightA for month a and
// weightB for month a + 1: the same shape monthPair returns, so it folds into month01..month1011
vec4 seasonalMonthPair(vec2 vis, float isBeam, float weightA, bool onA, float weightB, bool onB) {
  float visA = onA ? vis.x : vis.y;
  float visB = onB ? vis.x : vis.y;
  return vec4(
    visA * isBeam * weightA,
    visA * (1.0 - isBeam) * weightA,
    visB * isBeam * weightB,
    visB * (1.0 - isBeam) * weightB
  );
}

void main() {
  int col = int(floor(gl_FragCoord.x));
  int row = int(floor(gl_FragCoord.y));
  vec3 p = vec3(uMinX + (float(col) + 0.5) * uCellSize, uMinY + (float(row) + 0.5) * uCellSize, 0.0);

  vec4 annual = vec4(0.0);
  vec4 month01 = vec4(0.0);
  vec4 month23 = vec4(0.0);
  vec4 month45 = vec4(0.0);
  vec4 month67 = vec4(0.0);
  vec4 month89 = vec4(0.0);
  vec4 month1011 = vec4(0.0);

  for (int j = 0; j < uDirCount; j += 1) {
    vec4 row0 = texelFetch(uDirs, ivec2(j, 0), 0);
    vec4 row1 = texelFetch(uDirs, ivec2(j, 1), 0);
    vec4 row2 = texelFetch(uDirs, ivec2(j, 2), 0);
    vec4 row3 = texelFetch(uDirs, ivec2(j, 3), 0);
    vec4 row4 = texelFetch(uDirs, ivec2(j, 4), 0);

    float isBeam = row0.w;
    vec2 vis = visibility(p, row0.xyz);

    if (uSeasonal == 1) {
      vec4 mp01 = seasonalMonthPair(vis, isBeam, row2.x, leafOn(0), row2.y, leafOn(1));
      vec4 mp23 = seasonalMonthPair(vis, isBeam, row2.z, leafOn(2), row2.w, leafOn(3));
      vec4 mp45 = seasonalMonthPair(vis, isBeam, row3.x, leafOn(4), row3.y, leafOn(5));
      vec4 mp67 = seasonalMonthPair(vis, isBeam, row3.z, leafOn(6), row3.w, leafOn(7));
      vec4 mp89 = seasonalMonthPair(vis, isBeam, row4.x, leafOn(8), row4.y, leafOn(9));
      vec4 mp1011 = seasonalMonthPair(vis, isBeam, row4.z, leafOn(10), row4.w, leafOn(11));

      month01 += mp01;
      month23 += mp23;
      month45 += mp45;
      month67 += mp67;
      month89 += mp89;
      month1011 += mp1011;

      // annual is the sum of the months just computed, each shaded by the crown it had that
      // month, so the annual weight in row 1 goes unread on this path (Decision Record 26)
      annual.xy += mp01.xy + mp01.zw + mp23.xy + mp23.zw + mp45.xy + mp45.zw
        + mp67.xy + mp67.zw + mp89.xy + mp89.zw + mp1011.xy + mp1011.zw;
      annual.z += vis.x * (1.0 - isBeam) * row1.y;
      annual.w += vis.x * row1.z;
    } else {
      float beamVis = vis.x * isBeam;
      float diffuseVis = vis.x * (1.0 - isBeam);

      annual.x += beamVis * row1.x;
      annual.y += diffuseVis * row1.x;
      annual.z += diffuseVis * row1.y;
      annual.w += vis.x * row1.z;

      month01 += monthPair(beamVis, diffuseVis, row2.x, row2.y);
      month23 += monthPair(beamVis, diffuseVis, row2.z, row2.w);
      month45 += monthPair(beamVis, diffuseVis, row3.x, row3.y);
      month67 += monthPair(beamVis, diffuseVis, row3.z, row3.w);
      month89 += monthPair(beamVis, diffuseVis, row4.x, row4.y);
      month1011 += monthPair(beamVis, diffuseVis, row4.z, row4.w);
    }
  }

  outAnnual = annual;
  outMonth01 = month01;
  outMonth23 = month23;
  outMonth45 = month45;
  outMonth67 = month67;
  outMonth89 = month89;
  outMonth1011 = month1011;
}`

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type)
  if (shader === null) throw new Error('createShader failed')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader compile failed: ${log ?? 'unknown'}`)
  }
  return shader
}

const linkProgram = (gl: WebGL2RenderingContext): WebGLProgram => {
  const program = gl.createProgram()
  if (program === null) throw new Error('createProgram failed')
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC)
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`program link failed: ${log ?? 'unknown'}`)
  }
  return program
}

const uniformLocation = (
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation => {
  const location = gl.getUniformLocation(program, name)
  if (location === null) throw new Error(`missing uniform ${name}`)
  return location
}

const createFloatTexture = (
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture => {
  const texture = gl.createTexture()
  if (texture === null) throw new Error('createTexture failed')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null)
  return texture
}

/**
 * Uploads onto the texture unit it names, and the unit is the whole point.
 *
 * `bindTexture` binds on whichever unit is ACTIVE, and this used to bind on whatever unit the
 * previous call had left active. The chunk loop below bound the panels on unit 0, then uploaded
 * the directions, which bound the direction texture on unit 0 as well before moving it to unit 1:
 * so the shader read its panel corners out of the DIRECTION texture on every draw. The bake was
 * shading the ground with sky directions read as panel geometry, which is why a bake changed
 * when the array was removed (no corners to read) and not when it was lowered, tilted or spread
 * (the corners it read were never the panels). The symptom was lowering
 * the panels from 3.4 m to 1.5 m and watching nothing change; the CPU reference disagreed with
 * this backend by up to 20 points of sky view on the default plot. `scripts/probe-bake-backends.mjs`
 * is the reproduction and the check
 */
const uploadTexture = (
  gl: WebGL2RenderingContext,
  unit: number,
  texture: WebGLTexture,
  width: number,
  height: number,
  data: Float32Array,
): void => {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data)
}

const ATTACHMENTS = [
  0x8ce0, // COLOR_ATTACHMENT0
  0x8ce1,
  0x8ce2,
  0x8ce3,
  0x8ce4,
  0x8ce5,
  0x8ce6,
]

interface Session {
  readonly gl: WebGL2RenderingContext
  readonly program: WebGLProgram
  readonly panelTexture: WebGLTexture
  readonly dirTexture: WebGLTexture
  readonly accumTextures: readonly WebGLTexture[]
  readonly framebuffer: WebGLFramebuffer
  readonly uPanels: WebGLUniformLocation
  readonly uPanelCount: WebGLUniformLocation
  readonly uDirs: WebGLUniformLocation
  readonly uDirCount: WebGLUniformLocation
  readonly uMinX: WebGLUniformLocation
  readonly uMinY: WebGLUniformLocation
  readonly uCellSize: WebGLUniformLocation
  readonly uSeasonal: WebGLUniformLocation
  readonly uLeafOnMask: WebGLUniformLocation
}

const setupSession = (canvas: OffscreenCanvas, cols: number, rows: number): Session => {
  const gl = canvas.getContext('webgl2')
  if (gl === null) throw new Error('no webgl2 context')
  if (gl.getExtension('EXT_color_buffer_float') === null) {
    throw new Error('EXT_color_buffer_float unavailable')
  }
  if (gl.getExtension('EXT_float_blend') === null) throw new Error('EXT_float_blend unavailable')
  if ((gl.getParameter(gl.MAX_DRAW_BUFFERS) as number) < ATTACHMENTS.length) {
    throw new Error('insufficient MAX_DRAW_BUFFERS')
  }

  const program = linkProgram(gl)
  const panelTexture = createFloatTexture(gl, 1, 5)
  const dirTexture = createFloatTexture(gl, 1, 5)
  const accumTextures = ATTACHMENTS.map(() => createFloatTexture(gl, cols, rows))

  const framebuffer = gl.createFramebuffer()
  if (framebuffer === null) throw new Error('createFramebuffer failed')
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  accumTextures.forEach((texture, i) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, ATTACHMENTS[i] ?? 0, gl.TEXTURE_2D, texture, 0)
  })
  gl.drawBuffers(ATTACHMENTS)
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('framebuffer incomplete')
  }

  gl.useProgram(program)
  return {
    gl,
    program,
    panelTexture,
    dirTexture,
    accumTextures,
    framebuffer,
    uPanels: uniformLocation(gl, program, 'uPanels'),
    uPanelCount: uniformLocation(gl, program, 'uPanelCount'),
    uDirs: uniformLocation(gl, program, 'uDirs'),
    uDirCount: uniformLocation(gl, program, 'uDirCount'),
    uMinX: uniformLocation(gl, program, 'uMinX'),
    uMinY: uniformLocation(gl, program, 'uMinY'),
    uCellSize: uniformLocation(gl, program, 'uCellSize'),
    uSeasonal: uniformLocation(gl, program, 'uSeasonal'),
    uLeafOnMask: uniformLocation(gl, program, 'uLeafOnMask'),
  }
}

const buildPanelTextureData = (
  panels: readonly Occluder[],
): { width: number; data: Float32Array } => {
  const width = Math.max(1, panels.length)
  const data = new Float32Array(width * 5 * 4)
  panels.forEach((panel, col) => {
    for (let corner = 0; corner < 4; corner += 1) {
      const v = panel.corners.vertices[corner]
      const idx = (corner * width + col) * 4
      data[idx] = v?.xM ?? 0
      data[idx + 1] = v?.yM ?? 0
      data[idx + 2] = v?.zM ?? 0
    }
    // row 4: the quad's own (transmittance, leaflessTransmittance), 0 where absent, which is opaque
    // and matches the scalar every panel and house face is shaded with
    const rowIdx = (4 * width + col) * 4
    data[rowIdx] = panel.transmittance ?? 0
    data[rowIdx + 1] = panel.leaflessTransmittance ?? 0
  })
  return { width, data }
}

const leafOnMask = (leafOnMonths: readonly boolean[] | null): number => {
  if (leafOnMonths === null) return 0
  let mask = 0
  for (let month = 0; month < leafOnMonths.length; month += 1) {
    if (leafOnMonths[month] === true) mask |= 1 << month
  }
  return mask
}

export const MAX_GPU_WINDOWS = 1

/**
 * How much of the ray casting one draw may carry, in cell-direction-panel tests.
 *
 * A draw is one command buffer's worth of work, and the GPU's watchdog judges command buffers:
 * a draw that runs long under contention is killed, and every other context on the GPU loses
 * its work with it (the functional suite at eight workers saw one "Caused GPU Hang Error" and
 * seven "victim of GPU error/recovery" in the same second, and the pages never came back).
 * `chunkMs` in `accumulate` measures submission, which returns before the GPU starts, so the
 * chunk doubled without bound: measured on a 16 x 11 m plot, a bake went out as draws of 40, 40,
 * 80, 160, 320, 640 and 1280 directions, the last one 875 million tests, and the example garden's
 * 121 thousand cells and 40 panels would put six billion in one draw. At this cap a draw is about
 * 20 ms on an M-series GPU (a 1.9 billion-test bake ran in 300 ms), whatever the grid and the
 * panel count
 */
export const MAX_RAY_TESTS_PER_DRAW = 1 << 27

interface GpuDirection {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly isBeam: number
  readonly annualWeight: number
  readonly svfWeight: number
  readonly windowWeight: number
  readonly monthly: readonly number[]
  // non-null only for a tracking array's beam directions, which is why the posed directions
  // form a prefix of the list: the draw loop relies on that to batch the static tail
  readonly panels: readonly Occluder[] | null
}

export const buildDirections = (request: AccumulationRequest): readonly GpuDirection[] => {
  const { sky, monthlySkies, windowSkies, beamPanels } = request
  const alignedTo = (skies: readonly CumulativeSky[]): readonly CumulativeSky[] =>
    skies.filter(
      (other) =>
        other.patches.length === sky.patches.length &&
        other.sunDirections.length === sky.sunDirections.length,
    )
  const aligned = alignedTo(monthlySkies)
  const window = alignedTo(windowSkies)[0]
  const dirs: GpuDirection[] = []
  sky.sunDirections.forEach((bin, j) => {
    if (bin.z <= 0) return
    dirs.push({
      x: bin.x,
      y: bin.y,
      z: bin.z,
      isBeam: 1,
      annualWeight: bin.beamWeightWhPerM2 * bin.z,
      svfWeight: 0,
      windowWeight: (window?.sunDirections[j]?.beamWeightWhPerM2 ?? 0) * bin.z,
      monthly: aligned.map((month) => (month.sunDirections[j]?.beamWeightWhPerM2 ?? 0) * bin.z),
      panels: beamPanels === null ? null : beamPanels(j),
    })
  })
  sky.patches.forEach((patch, i) => {
    if (patch.altitudeDeg <= 0) return
    const dir = sunUnitVector(patch.altitudeDeg, patch.azimuthDeg)
    dirs.push({
      x: dir.x,
      y: dir.y,
      z: dir.z,
      isBeam: 0,
      annualWeight: patch.cumulativeRadianceWhPerM2,
      svfWeight: (sinDeg(patch.altitudeDeg) * patch.solidAngleSr) / Math.PI,
      windowWeight: window?.patches[i]?.cumulativeRadianceWhPerM2 ?? 0,
      monthly: aligned.map((month) => month.patches[i]?.cumulativeRadianceWhPerM2 ?? 0),
      panels: null,
    })
  })
  return dirs
}

const buildDirTextureData = (
  dirs: readonly GpuDirection[],
): { width: number; data: Float32Array } => {
  const width = Math.max(1, dirs.length)
  const data = new Float32Array(width * 5 * 4)
  const set = (row: number, col: number, a: number, b: number, c: number, d: number): void => {
    const idx = (row * width + col) * 4
    data[idx] = a
    data[idx + 1] = b
    data[idx + 2] = c
    data[idx + 3] = d
  }
  dirs.forEach((dir, col) => {
    set(0, col, dir.x, dir.y, dir.z, dir.isBeam)
    set(1, col, dir.annualWeight, dir.svfWeight, dir.windowWeight, 0)
    const m = (i: number): number => dir.monthly[i] ?? 0
    set(2, col, m(0), m(1), m(2), m(3))
    set(3, col, m(4), m(5), m(6), m(7))
    set(4, col, m(8), m(9), m(10), m(11))
  })
  return { width, data }
}

const yieldFrame = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })

const adaptChunk = (chunk: number, emaMs: number, budgetMs: number): number => {
  if (emaMs > budgetMs * 1.25) return Math.max(1, Math.floor(chunk / 2))
  if (emaMs < budgetMs * 0.5) return chunk * 2
  return chunk
}

const readAttachment = (
  gl: WebGL2RenderingContext,
  framebuffer: WebGLFramebuffer,
  attachment: number,
  cols: number,
  rows: number,
): Float32Array => {
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer)
  gl.readBuffer(attachment)
  const buffer = new Float32Array(cols * rows * 4)
  gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.FLOAT, buffer)
  return buffer
}

const unavailableBackend = (reason: string): SkyMatrixBackend => ({
  kind: 'webgl2-shadowmap',
  available: false,
  accumulate: () => Promise.reject(new Error(`webgl2 backend unavailable: ${reason}`)),
  dispose: () => {},
})

export const createWebgl2Backend = (canvas: OffscreenCanvas): SkyMatrixBackend => {
  let session: Session
  try {
    session = setupSession(canvas, 1, 1)
  } catch (error) {
    return unavailableBackend(error instanceof Error ? error.message : String(error))
  }

  let disposed = false
  let activeCols = 1
  let activeRows = 1

  const ensureSized = (cols: number, rows: number): void => {
    if (cols === activeCols && rows === activeRows) return
    const { gl, accumTextures, framebuffer } = session
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    accumTextures.forEach((texture, i) => {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, cols, rows, 0, gl.RGBA, gl.FLOAT, null)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, ATTACHMENTS[i] ?? 0, gl.TEXTURE_2D, texture, 0)
    })
    gl.drawBuffers(ATTACHMENTS)
    activeCols = cols
    activeRows = rows
  }

  return {
    kind: 'webgl2-shadowmap',
    available: true,
    async accumulate(
      request: AccumulationRequest,
      onProgress: (progress: AccumulationProgress) => void,
    ): Promise<AccumulationResult> {
      const started = performance.now()
      const { gl } = session
      const { grid, panels } = request
      const { cols, rows } = grid
      const extent: Extent2D = grid.extent
      const cells = cols * rows

      ensureSized(cols, rows)
      gl.bindFramebuffer(gl.FRAMEBUFFER, session.framebuffer)
      gl.viewport(0, 0, cols, rows)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)

      if (request.windowSkies.length > MAX_GPU_WINDOWS) {
        throw new Error(`webgl2 backend accumulates at most ${MAX_GPU_WINDOWS} time window`)
      }
      let boundPanels: readonly Occluder[] | null = null
      const bindPanels = (posed: readonly Occluder[]): void => {
        if (posed === boundPanels) return
        boundPanels = posed
        const panelData = buildPanelTextureData(posed)
        uploadTexture(gl, 0, session.panelTexture, panelData.width, 5, panelData.data)
        gl.uniform1i(session.uPanels, 0)
        gl.uniform1i(session.uPanelCount, posed.length)
      }
      gl.uniform1f(session.uMinX, extent.minXM)
      gl.uniform1f(session.uMinY, extent.minYM)
      gl.uniform1f(session.uCellSize, grid.cellSizeM)
      gl.uniform1i(session.uSeasonal, request.leafOnMonths === null ? 0 : 1)
      gl.uniform1i(session.uLeafOnMask, leafOnMask(request.leafOnMonths))

      const directions = buildDirections(request)
      const passesTotal = request.sky.sunDirections.length + request.sky.patches.length
      const total = directions.length
      const maxChunk = Math.max(
        1,
        Math.floor(MAX_RAY_TESTS_PER_DRAW / (cells * Math.max(1, panels.length))),
      )
      let chunkSize = Math.max(
        1,
        Math.min(total || 1, Math.floor(request.passesPerFrame) || 40, maxChunk),
      )
      let emaMs = request.frameBudgetMs
      let offset = 0
      let passesDone = 0
      let frameMs = 0

      while (offset < total) {
        const posed = directions[offset]?.panels ?? null
        // a per-direction pose can't share a draw with any other pose, so it costs draw calls,
        // never extra ray casts; poses only ever occur in the beam prefix
        const n = posed === null ? Math.min(chunkSize, total - offset) : 1
        bindPanels(posed ?? panels)
        const chunkDirs = directions.slice(offset, offset + n)
        const dirData = buildDirTextureData(chunkDirs)
        uploadTexture(gl, 1, session.dirTexture, dirData.width, 5, dirData.data)
        gl.uniform1i(session.uDirs, 1)
        gl.uniform1i(session.uDirCount, n)

        const chunkStart = performance.now()
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.flush()
        const chunkMs = performance.now() - chunkStart

        offset += n
        passesDone += n
        emaMs = emaMs * 0.7 + chunkMs * 0.3
        chunkSize = Math.min(maxChunk, adaptChunk(chunkSize, emaMs, request.frameBudgetMs))
        // yield on the budget rather than per draw, so a per-pose chunk of one direction doesn't
        // cost a whole frame each
        frameMs += chunkMs
        if (frameMs >= request.frameBudgetMs || offset >= total) {
          frameMs = 0
          onProgress({ passesDone, passesTotal, elapsedMs: performance.now() - started })
          await yieldFrame()
        }
      }

      const beamWhPerM2 = new Float32Array(cells)
      const diffuseWhPerM2 = new Float32Array(cells)
      const skyViewFactor = new Float32Array(cells)
      const monthlyBeamWhPerM2 = Array.from({ length: 12 }, () => new Float32Array(cells))
      const monthlyDiffuseWhPerM2 = Array.from({ length: 12 }, () => new Float32Array(cells))

      const windowWhPerM2 = request.windowSkies.map(() => new Float32Array(cells))
      const annualBuf = readAttachment(gl, session.framebuffer, ATTACHMENTS[0] ?? 0, cols, rows)
      for (let idx = 0; idx < cells; idx += 1) {
        beamWhPerM2[idx] = annualBuf[idx * 4] ?? 0
        diffuseWhPerM2[idx] = annualBuf[idx * 4 + 1] ?? 0
        skyViewFactor[idx] = annualBuf[idx * 4 + 2] ?? 0
        const window = windowWhPerM2[0]
        if (window !== undefined) window[idx] = annualBuf[idx * 4 + 3] ?? 0
      }
      for (let k = 0; k < 6; k += 1) {
        const buf = readAttachment(gl, session.framebuffer, ATTACHMENTS[1 + k] ?? 0, cols, rows)
        const beamA = monthlyBeamWhPerM2[2 * k]
        const diffuseA = monthlyDiffuseWhPerM2[2 * k]
        const beamB = monthlyBeamWhPerM2[2 * k + 1]
        const diffuseB = monthlyDiffuseWhPerM2[2 * k + 1]
        for (let idx = 0; idx < cells; idx += 1) {
          if (beamA !== undefined) beamA[idx] = buf[idx * 4] ?? 0
          if (diffuseA !== undefined) diffuseA[idx] = buf[idx * 4 + 1] ?? 0
          if (beamB !== undefined) beamB[idx] = buf[idx * 4 + 2] ?? 0
          if (diffuseB !== undefined) diffuseB[idx] = buf[idx * 4 + 3] ?? 0
        }
      }

      onProgress({ passesDone: passesTotal, passesTotal, elapsedMs: performance.now() - started })
      return {
        beamWhPerM2,
        diffuseWhPerM2,
        monthlyBeamWhPerM2,
        monthlyDiffuseWhPerM2,
        windowWhPerM2,
        skyViewFactor,
        backend: 'webgl2-shadowmap',
        elapsedMs: performance.now() - started,
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      const { gl } = session
      gl.deleteProgram(session.program)
      gl.deleteTexture(session.panelTexture)
      gl.deleteTexture(session.dirTexture)
      for (const texture of session.accumTextures) gl.deleteTexture(texture)
      gl.deleteFramebuffer(session.framebuffer)
    },
  }
}
