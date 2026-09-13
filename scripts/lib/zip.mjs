import { inflateRawSync } from 'node:zlib'

/**
 * Minimal ZIP reader: central directory, stored or deflated entries, no ZIP64.
 *
 * Lifted out of `fetch-static-layers.mjs` unchanged when a second script needed it. Written by
 * hand rather than taken from a package because these scripts run against upstream archives on
 * a developer's machine and the repo keeps its build dependencies to what it can read
 */
export const unzip = (buffer, wanted) => {
  let end = buffer.length - 22
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1
  if (end < 0) throw new Error('no ZIP end-of-central-directory record')
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  const out = new Map()
  for (let i = 0; i < count; i += 1) {
    const method = buffer.readUInt16LE(offset + 10)
    const compressed = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const local = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    offset += 46 + nameLength + extraLength + commentLength
    if (!wanted.includes(name)) continue
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    const raw = buffer.subarray(start, start + compressed)
    out.set(name, method === 0 ? raw : inflateRawSync(raw))
  }
  for (const name of wanted) if (!out.has(name)) throw new Error(`ZIP entry missing: ${name}`)
  return out
}
