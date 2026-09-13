/**
 * The slice of vitest's `vi` that this repository actually used, on top of bun's test API.
 *
 * 38 test files call `vi.fn`, `vi.stubGlobal` and the rest, and this lets them run under `bun test`
 * unchanged. Six map straight onto bun's `jest` object, and the five below it don't exist in bun
 * and are implemented here.
 *
 * `vi.mock` is deliberately absent. It can't live in a shim: bun resolves the specifier passed to
 * `mock.module` relative to the file that CALLS it, so a shim would resolve every path against
 * this file. The seventeen sites that used it call `mock.module` directly.
 *
 * Nothing speculative belongs here. If a test needs a part of vitest's API that is not below, add
 * it when the test needs it
 */
import { jest } from 'bun:test'

interface Stub {
  readonly key: string
  /* undefined means the key wasn't on the global at all, so unwinding deletes it */
  readonly descriptor: PropertyDescriptor | undefined
}

const stubs: Stub[] = []

/*
  Bun fakes timers inside the runtime rather than by swapping `globalThis.setTimeout`, so capturing
  a reference to `setTimeout` before `useFakeTimers` does NOT give you a real one: it still goes
  through the frozen clock and never fires. That cost an afternoon. Anything that has to make
  progress while fake timers are installed must therefore ride the microtask queue, which isn't
  faked

  Ten turns is arbitrary and it's enough: it drains ten levels of `await` chaining, and the
  suites this replaces resolve in one or two
*/
const drainMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

export const vi = {
  fn: jest.fn,
  spyOn: jest.spyOn,
  restoreAllMocks: jest.restoreAllMocks,
  useFakeTimers: jest.useFakeTimers,
  useRealTimers: jest.useRealTimers,
  advanceTimersByTime: jest.advanceTimersByTime,

  /**
   * Bun has no async variant. Advancing the clock fires the callbacks synchronously. What the
   * async form adds is letting the promises those callbacks started settle before the assertion
   * runs. See `drainMicrotasks` above for why this can't wait on a timer
   */
  advanceTimersByTimeAsync: async (ms: number): Promise<void> => {
    jest.advanceTimersByTime(ms)
    await drainMicrotasks()
  },

  /**
   * Replace a global and remember the previous value. Bun has `spyOn` for object properties, but
   * several of these globals don't exist at all until a test installs one (`fetch` stubs,
   * `WebGL2RenderingContext`), and `spyOn` needs a property that is already there
   */
  stubGlobal: (key: string, value: unknown): void => {
    const target = globalThis as Record<string, unknown>
    stubs.push({ key, descriptor: Object.getOwnPropertyDescriptor(target, key) })
    /*
      Assignment isn't enough. Several of the globals worth stubbing are accessors with no
      setter: jsdom defines `localStorage` as a getter, and `target.localStorage = x` throws
      "Attempted to assign to readonly property" rather than stubbing anything
    */
    Object.defineProperty(target, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    })
  },

  unstubAllGlobals: (): void => {
    const target = globalThis as Record<string, unknown>
    /* backward, so a key stubbed twice unwinds to what it held before the first stub */
    for (let i = stubs.length - 1; i >= 0; i -= 1) {
      const stub = stubs[i]
      if (stub === undefined) continue
      if (stub.descriptor === undefined) delete target[stub.key]
      else Object.defineProperty(target, stub.key, stub.descriptor)
    }
    stubs.length = 0
  },

  /**
   * Poll until the callback stops throwing. Vitest's version defaults to a 1 s timeout at 50 ms
   * intervals and this keeps those numbers, because the suites calling it were written against them
   *
   * This polls on a timer, so it can't make progress under fake timers. Neither of the two files
   * that call it installs any, and a caller that did would hang here rather than fail quietly
   */
  waitFor: async <T>(
    check: () => T | Promise<T>,
    options: { timeout?: number; interval?: number } = {},
  ): Promise<T> => {
    const timeout = options.timeout ?? 1000
    const interval = options.interval ?? 50
    const deadline = Date.now() + timeout
    let lastError: unknown
    for (;;) {
      try {
        return await check()
      } catch (error) {
        lastError = error
        if (Date.now() >= deadline) throw lastError
        await new Promise((resolve) => setTimeout(resolve, interval))
      }
    }
  },

  /**
   * A no-op wrapper in bun. Vitest hoisted `vi.mock` calls above the imports, so anything they
   * referenced had to be hoisted too. Bun's `mock.module` runs where it's written, so the value
   * is simply computed where it's written
   */
  hoisted: <T>(factory: () => T): T => factory(),
}
