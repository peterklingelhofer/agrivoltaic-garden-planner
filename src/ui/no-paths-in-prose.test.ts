import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'

/**
 * No sentence a visitor can read may name a file, a path, or one of this repo's own documents.
 *
 * An answer to how much electricity the garden would make carries caveat paragraphs, and a caveat
 * can end "See src/data/albedo.ts and src/sim/snow.ts" or "(Decision Record 2.1)". Both are true,
 * both are useful, and neither means anything to a gardener holding a phone. The pointer belongs in
 * a comment beside the string, where the person who needs it is already reading.
 *
 * It's a whole-repo scan, because the next one will be written somewhere else. `Cited.caveat`
 * isn't the only way prose reaches a screen: a refusal reason, a disclaimer and a limiting
 * factor all do, and they live in `sim`, `recommend` and `data` as well as here
 */
const ROOT = join(import.meta.dir, '..')
const sources: Record<string, string> = {}
for (const path of new Glob('**/*.{ts,tsx}').scanSync(ROOT)) {
  const absolute = join(ROOT, path)
  const key = relative(import.meta.dir, absolute)
  sources[key.startsWith('.') ? key : `./${key}`] = readFileSync(absolute, 'utf8')
}

/**
 * Comments are where a pointer belongs, so they're removed before anything is read: a block
 * comment explaining WHY a path isn't in the string would otherwise fail the rule it explains
 */
const withoutComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')

/** Long enough to be prose, well past an identifier, a key or a path being built, and one line */
const PROSE = /(['"])((?:(?!\1)[^\\\n]|\\.){60,})\1/g

/**
 * Paths, and the names this repo calls its own documents by.
 *
 * A "doc 02" style pointer reads to a gardener as a missing footnote, so that shape stays on the
 * list beside the paths
 */
const FORBIDDEN = /\bsrc\/|\bdocs\/|\.tsx?\b|\.mjs\b|\.md\b|Decision Record|\bdocs? \d/i

/**
 * The one string that may name a file, because it's what `assertBanded` throws at the programmer
 * who handed it a point estimate, and naming the file that refuses is the whole value of it
 */
const ALLOWED = new Set([
  'src/ui/format.ts refuses a point estimate: Decision Record 7 requires a band',
])

describe('what a visitor reads', () => {
  it('never names a file, a path or a decision record', () => {
    const found: string[] = []
    for (const [path, source] of Object.entries(sources)) {
      if (path.includes('.test.')) continue
      for (const match of withoutComments(source).matchAll(PROSE)) {
        const text = match[2] ?? ''
        // a comment is where a pointer belongs, so only strings are read
        if (!FORBIDDEN.test(text) || ALLOWED.has(text)) continue
        found.push(`${path}: ${text.slice(0, 90)}`)
      }
    }
    expect(found).toEqual([])
  })
})
