/**
 * Widens three of bun's matchers back to what vitest's were.
 *
 * `expect(x).toBe(y)` is typed by bun as `toBe(expected: T)`, where T is the type of `x`. Almost
 * every id and unit in this repository is a branded type, so `expect(gddDay(...)).toBe(0)` and
 * `expect(ids).toContain('tomato')` stop compiling: the literal is not branded. Vitest typed all
 * three as `unknown` and the suite was written against that.
 *
 * The alternative was 127 casts of the form `.toBe(0 as GddDays)`, which is noise in every
 * assertion and tells a reader nothing. These matchers compare at runtime and always did; the
 * brand is a compile-time device for the production code, and it should not decide how a literal
 * is written in a test.
 *
 * Declaration merging ADDS an overload. It never replaces one, so the branded form still
 * type-checks where a test already uses it.
 */
/* anchors the augmentation to the real module. It never declares a new one over the top */
import type {} from 'bun:test'

declare module 'bun:test' {
  interface Matchers<T = unknown> {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toContain(expected: unknown): void
  }
  interface AsymmetricMatchers {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toContain(expected: unknown): void
  }
}
