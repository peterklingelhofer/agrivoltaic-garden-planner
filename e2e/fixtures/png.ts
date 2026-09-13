import { inflateSync } from 'node:zlib'

export interface Bitmap {
  readonly width: number
  readonly height: number
  readonly channels: number
  readonly data: Buffer
}

export type Rgb = readonly [number, number, number]

/**
 * A PNG reader, because the only way to see what a WebGL canvas actually put on screen is to
 * screenshot it and read the bytes. Handles what Playwright emits and nothing else: 8-bit
 * truecolour, no interlacing
 */
export const decodePng = (png: Buffer): Bitmap => {
  let offset = 8
  let width = 0
  let height = 0
  let colourType = 0
  const parts: Buffer[] = []
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const body = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      colourType = body[9] ?? 0
    } else if (type === 'IDAT') parts.push(body)
    offset += 12 + length
  }
  const channels = colourType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(parts))
  const stride = width * channels
  const data = Buffer.alloc(height * stride)
  let pos = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos] ?? 0
    pos += 1
    for (let x = 0; x < stride; x += 1) {
      const cur = raw[pos + x] ?? 0
      const left = x >= channels ? (data[y * stride + x - channels] ?? 0) : 0
      const up = y > 0 ? (data[(y - 1) * stride + x] ?? 0) : 0
      const upLeft = x >= channels && y > 0 ? (data[(y - 1) * stride + x - channels] ?? 0) : 0
      let value = cur
      if (filter === 1) value = cur + left
      else if (filter === 2) value = cur + up
      else if (filter === 3) value = cur + ((left + up) >> 1)
      else if (filter === 4) {
        const p = left + up - upLeft
        const dl = Math.abs(p - left)
        const du = Math.abs(p - up)
        const dul = Math.abs(p - upLeft)
        value = cur + (dl <= du && dl <= dul ? left : du <= dul ? up : upLeft)
      }
      data[y * stride + x] = value & 0xff
    }
    pos += stride
  }
  return { width, height, channels, data }
}

export const pixelAt = (image: Bitmap, x: number, y: number): Rgb => {
  const i = (y * image.width + x) * image.channels
  return [image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0]
}

export const distance = (a: Rgb, b: Rgb): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** How many pixels sit within `tolerance` of `target`, sampling every `step`th pixel */
export const countNear = (image: Bitmap, target: Rgb, tolerance: number, step = 2): number => {
  let hits = 0
  for (let y = 0; y < image.height; y += step)
    for (let x = 0; x < image.width; x += step)
      if (distance(pixelAt(image, x, y), target) <= tolerance) hits += 1
  return hits
}
