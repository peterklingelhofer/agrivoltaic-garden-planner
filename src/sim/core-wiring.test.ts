import { existsSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'bun:test'
import type { EpochMillis, Meters, Millibars, Celsius } from '../types/units'
import type { DegreesLatitude, DegreesLongitude } from '../types/units'
import type { SolarPositionSeries, TmySeries } from '../types/weather'
import { installPhysicsCore, physicsCore, physicsImplementation, requirePhysicsCore } from './core'
import { decompose } from './decomposition'
import { rustCore, type RustCore } from './rust-core'
import { ensurePhysicsCore, forgetRustCore, loadRustCore, rustCoreEnabled } from './rust-core-load'
import { solarPositionSeries, type SpaObserver } from './solar'

/**
 * That the seams are wired, which is a different claim from the one `rust-parity.test.ts` makes.
 *
 * The crate's own tests prove the Rust computes the right numbers. This one proves the application
 * actually reaches the Rust when it's installed, and refuses when it isn't. A perfect port routed
 * to nowhere would pass every one of those tests.
 *
 * The trap this is written around is that a comparison of two runs is vacuous if the core silently
 * failed to install: both sides would be the TypeScript and the assertion would hold for the wrong
 * reason. So each seam is also driven with a core that deliberately answers WRONG, and the wiring
 * is proved by the answer changing
 */
const WASM = 'crates/agv-sim/target/wasm32-unknown-unknown/release/agv_sim.wasm'
const HAVE_WASM = existsSync(WASM)
const WASM_REQUIRED = process.env.REQUIRE_RUST_CORE === '1'

const load = async (): Promise<RustCore> => {
  const module = await WebAssembly.compile(readFileSync(WASM))
  return rustCore(await WebAssembly.instantiate(module, {}))
}

const OBSERVER: SpaObserver = {
  location: { latitudeDeg: 42.3736 as DegreesLatitude, longitudeDeg: -72.5199 as DegreesLongitude },
  elevationM: 90 as Meters,
  pressureMb: 1002 as Millibars,
  temperatureC: 9 as Celsius,
}

const HOURS = 240
const UTC_MILLIS = Float64Array.from({ length: HOURS }, (_unused, index) =>
  Date.UTC(2024, 5, 1, index),
)

const weatherFor = (position: SolarPositionSeries): TmySeries => {
  const ghiWM2 = new Float32Array(HOURS)
  for (let index = 0; index < HOURS; index += 1) {
    const cosz = Math.max(
      0,
      Math.cos(((90 - (position.apparentElevationDeg[index] ?? 0)) * Math.PI) / 180),
    )
    ghiWM2[index] = cosz > 0 ? 1098 * cosz * Math.exp(-0.059 / cosz) * 0.72 : 0
  }
  return {
    source: 'user-upload',
    decomposition: 'passthrough',
    utcOffsetHours: -5,
    startUtcMillis: 0 as EpochMillis,
    utcMillis: UTC_MILLIS,
    ghiWM2,
    dniWM2: new Float32Array(HOURS),
    dhiWM2: new Float32Array(HOURS),
    dryBulbC: new Float32Array(HOURS),
    dewPointC: new Float32Array(HOURS),
    windSpeedMS: new Float32Array(HOURS),
    pressureMb: new Float32Array(HOURS).fill(1013),
    provenance: {
      datasetLabel: 'wiring fixture',
      yearsCovered: [2024],
      license: 'CC0',
      attribution: 'synthetic',
      retrievedUtcMillis: 0 as EpochMillis,
      isTypicalMeteorologicalYear: false,
    },
  }
}

/** A core that answers, and answers wrongly, so a live seam can't help but show it */
const WRONG_CORE = {
  spaSeriesFlat: (utcMillis: ArrayLike<number>) => new Float64Array(utcMillis.length * 9).fill(7),
  decomposeSeries: (series: { ghiWM2: ArrayLike<number> }) => ({
    ghiWM2: new Float32Array(series.ghiWM2.length).fill(11),
    dniWM2: new Float32Array(series.ghiWM2.length).fill(22),
    dhiWM2: new Float32Array(series.ghiWM2.length).fill(33),
  }),
} as unknown as RustCore

/**
 * The core `test/setup.ts` installed, put back after any test that swaps it.
 *
 * Null means no physics at all, so a test that left it null would take every test after it down
 * with it
 */
const INSTALLED = physicsCore()

afterEach(() => {
  installPhysicsCore(INSTALLED)
})

describe('the physics core seam', () => {
  it('refuses rather than degrading when nothing is installed', () => {
    installPhysicsCore(null)
    expect(physicsImplementation()).toBe('typescript')
    // the message names both recoverable causes, because neither is obvious from a stack trace
    expect(() => requirePhysicsCore()).toThrow(/bun run rust:wasm/)
    expect(() => requirePhysicsCore()).toThrow(/ensurePhysicsCore/)
    // and the refusal reaches the physics
    expect(() => solarPositionSeries(UTC_MILLIS, OBSERVER, 'nrel-spa')).toThrow(
      /physics core isn't loaded/,
    )
  })

  it("reads the flag as on unless it's exactly `off`", () => {
    // the default is on now: the TypeScript implementations are gone, so an absent variable has
    // to mean the physics runs, and only a deliberate `off` may stop it
    expect(rustCoreEnabled({})).toBe(true)
    expect(rustCoreEnabled({ VITE_RUST_CORE: 'on' })).toBe(true)
    expect(rustCoreEnabled({ VITE_RUST_CORE: 'off' })).toBe(false)
    // a typo must not silently disable the physics, which is why this isn't falsiness
    expect(rustCoreEnabled({ VITE_RUST_CORE: '0' })).toBe(true)
  })

  it('routes solarPositionSeries through the installed core', () => {
    const real = solarPositionSeries(UTC_MILLIS, OBSERVER, 'nrel-spa')
    installPhysicsCore(WRONG_CORE)
    expect(physicsImplementation()).toBe('rust')
    const wrong = solarPositionSeries(UTC_MILLIS, OBSERVER, 'nrel-spa')
    // the seam is live: swapping the core swaps the answer
    expect(wrong.geometricElevationDeg[0]).toBe(7)
    expect(wrong.geometricElevationDeg[0]).not.toBe(real.geometricElevationDeg[0])
  })

  /**
   * Michalsky is kept as an independent cross-check on the SPA and is deliberately not ported, so
   * asking for it has to keep running the TypeScript however the seam is set. If this ever fails,
   * the check and the thing it checks have become the same code and neither means anything
   */
  it('leaves the Michalsky cross-check on the TypeScript', () => {
    const before = solarPositionSeries(UTC_MILLIS, OBSERVER, 'michalsky')
    installPhysicsCore(WRONG_CORE)
    const after = solarPositionSeries(UTC_MILLIS, OBSERVER, 'michalsky')
    expect(after.geometricElevationDeg[0]).toBe(before.geometricElevationDeg[0])
    expect(after.geometricElevationDeg[0]).not.toBe(7)
  })

  it('routes decompose through an installed core', () => {
    const position = solarPositionSeries(UTC_MILLIS, OBSERVER, 'nrel-spa')
    const weather = weatherFor(position)
    installPhysicsCore(WRONG_CORE)
    const wrong = decompose(weather, position, 'dirint')
    expect(wrong.dniWM2[0]).toBe(22)
    expect(wrong.dhiWM2[0]).toBe(33)
    // and the model is still recorded on the series, which is a field the Rust never sees
    expect(wrong.decomposition).toBe('dirint')
  })

  it.skipIf(!WASM_REQUIRED)('is built, where CI said it would be', () => {
    expect(HAVE_WASM, `${WASM} is missing; run \`bun run rust:wasm\``).toBe(true)
  })

  /**
   * `decompose` hands the Rust's output arrays straight into `cloneSeries`, and wasm linear memory
   * is reused by the next allocation. Those arrays must be copies. If any of them turned out to be
   * a view of the source, a second call would silently rewrite the first call's answer
   */
  it.skipIf(!HAVE_WASM)("doesn't hand back a view of linear memory", async () => {
    const core = await load()
    installPhysicsCore(core)
    const position = solarPositionSeries(UTC_MILLIS, OBSERVER, 'nrel-spa')
    const weather = weatherFor(position)
    const first = decompose(weather, position, 'dirint')
    const snapshot = Array.from(first.dniWM2)
    decompose(weather, position, 'erbs')
    core.spaSeriesFlat(UTC_MILLIS, {
      latitudeDeg: 0,
      longitudeDeg: 0,
      elevationM: 0,
      pressureMb: 1013,
      temperatureC: 20,
    })
    expect(Array.from(first.dniWM2)).toEqual(snapshot)
  })
})

/**
 * The loader, which is the only part of this that talks to the network.
 *
 * Every case here is a way the wasm can fail to arrive, and every one of them has to end with the
 * loader resolving to null. A physics core that can't be fetched isn't an error condition here.
 * It's the ordinary state of every build that hasn't run `bun run rust:wasm`
 */
describe('loading the compiled core', () => {
  const withFetch = async (
    stub: typeof globalThis.fetch,
    run: () => Promise<void>,
  ): Promise<void> => {
    const original = globalThis.fetch
    globalThis.fetch = stub
    try {
      await run()
    } finally {
      globalThis.fetch = original
      forgetRustCore()
      installPhysicsCore(null)
    }
  }

  afterEach(forgetRustCore)

  it("doesn't reach the network at all when the flag says off", async () => {
    let called = 0
    await withFetch(
      (async () => {
        called += 1
        return new Response(null, { status: 404 })
      }) as unknown as typeof globalThis.fetch,
      async () => {
        expect(await loadRustCore({ VITE_RUST_CORE: 'off' })).toBeNull()
        // not merely null: a 404 here would write a console error on every page load, and several
        // e2e specs assert there are none
        expect(called).toBe(0)
      },
    )
  })

  it("resolves to null when the file isn't there", async () => {
    await withFetch(
      (async () => new Response(null, { status: 404 })) as unknown as typeof globalThis.fetch,
      async () => {
        expect(await loadRustCore({ VITE_RUST_CORE: 'on' })).toBeNull()
      },
    )
  })

  it("resolves to null when the bytes aren't a module", async () => {
    await withFetch(
      (async () =>
        new Response(new Uint8Array([1, 2, 3, 4]))) as unknown as typeof globalThis.fetch,
      async () => {
        expect(await loadRustCore({ VITE_RUST_CORE: 'on' })).toBeNull()
      },
    )
  })

  /**
   * `ensurePhysicsCore` installs only on success, which is what stops a failed fetch from replacing
   * a working core with nothing. That matters, because null means no physics at all
   */
  it('leaves an already-installed core alone when a later fetch fails', async () => {
    await withFetch(
      (async () => {
        throw new Error('offline')
      }) as unknown as typeof globalThis.fetch,
      async () => {
        const before = physicsCore()
        await ensurePhysicsCore({ VITE_RUST_CORE: 'on' })
        expect(physicsCore()).toBe(before)
      },
    )
  })

  it.skipIf(!HAVE_WASM)('installs a working core from real bytes, once', async () => {
    let fetched = 0
    await withFetch(
      (async () => {
        fetched += 1
        return new Response(readFileSync(WASM))
      }) as unknown as typeof globalThis.fetch,
      async () => {
        await ensurePhysicsCore({ VITE_RUST_CORE: 'on' })
        expect(physicsImplementation()).toBe('rust')
        const position = solarPositionSeries(UTC_MILLIS, OBSERVER, 'nrel-spa')
        expect(position.geometricElevationDeg[12]).toBeGreaterThan(0)
        // a worker runs many simulations and must instantiate for none of them but the first
        await ensurePhysicsCore({ VITE_RUST_CORE: 'on' })
        expect(fetched).toBe(1)
      },
    )
  })
})
