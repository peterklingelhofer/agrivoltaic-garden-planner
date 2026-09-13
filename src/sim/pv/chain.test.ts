import { describe, expect, it } from 'bun:test'
import { banded, interval } from '../../types/band'
import { arrayId, siteId } from '../../types/ids'
import type { PvArray } from '../../types/pv'
import type { Site } from '../../types/site'
import type {
  Celsius,
  Degrees,
  DegreesLatitude,
  DegreesLongitude,
  EpochMillis,
  Fraction,
  KilowattsAc,
  KilowattsDc,
  Meters,
  Millimeters,
  MillimetersPerYear,
  WattsPeak,
} from '../../types/units'
import type { TmySeries } from '../../types/weather'
import { observerFor, solarPositionSeries } from '../solar'
import { DEFAULT_PV_CHAIN_OPTIONS, runAnnualChain } from './chain'
import { DEFAULT_DC_AC_RATIO, nameplateAcKw, pvwattsAc } from './inverter'
import {
  energyRatio,
  REFERENCE_DEFINITION,
  REFERENCE_GROUND_COVER_RATIO,
  referenceArray,
  referenceTiltDeg,
} from './ler'
import { combinedLossFraction, PVWATTS_DEFAULT_LOSSES } from './losses'
import { pvEnergyReport } from './report'
import { PV_CHAIN_PROVENANCE } from './provenance'

const HOURS = 8760

const UTC_OFFSET_HOURS = -5

// synthetic clear-sky-ish TMY, its daylight window aligned to local solar time so the
// hours the SPA calls night aren't the hours this fixture calls noon
const weather = (): TmySeries => {
  const utcMillis = new Float64Array(HOURS)
  const ghiWM2 = new Float32Array(HOURS)
  const dniWM2 = new Float32Array(HOURS)
  const dhiWM2 = new Float32Array(HOURS)
  const start = Date.UTC(2021, 0, 1)
  for (let i = 0; i < HOURS; i += 1) {
    utcMillis[i] = start + i * 3_600_000
    const seasonal = 0.6 + 0.4 * Math.cos((2 * Math.PI * (Math.floor(i / 24) - 172)) / 365)
    const localHour = ((i % 24) + UTC_OFFSET_HOURS + 24) % 24
    const daylight = Math.max(0, Math.sin((Math.PI * (localHour - 6)) / 12))
    ghiWM2[i] = 950 * daylight * seasonal
    dniWM2[i] = 800 * daylight * seasonal
    dhiWM2[i] = 150 * daylight * seasonal
  }
  return {
    source: 'open-meteo',
    decomposition: 'passthrough',
    utcOffsetHours: UTC_OFFSET_HOURS,
    startUtcMillis: start as EpochMillis,
    utcMillis,
    ghiWM2,
    dniWM2,
    dhiWM2,
    dryBulbC: new Float32Array(HOURS).fill(12),
    dewPointC: new Float32Array(HOURS).fill(6),
    windSpeedMS: new Float32Array(HOURS).fill(2),
    pressureMb: new Float32Array(HOURS).fill(1013.25),
    provenance: {
      datasetLabel: 'synthetic-tmy',
      yearsCovered: [2021],
      license: 'CC0',
      attribution: 'test',
      retrievedUtcMillis: start as EpochMillis,
      isTypicalMeteorologicalYear: true,
    },
  }
}

const monthly = <T>(value: T): T[] => Array.from({ length: 12 }, () => value)

const site: Site = {
  id: siteId('site-1'),
  label: 'Amherst MA',
  location: { latitudeDeg: 42.37 as DegreesLatitude, longitudeDeg: -72.52 as DegreesLongitude },
  elevationM: 90 as Meters,
  timezone: 'America/New_York',
  utcOffsetHours: -5,
  koppenCode: 'Dfb',
  botanicalArea: null,
  hardiness: [],
  heatDaysAbove30C: 12,
  normals: {
    monthlyMeanTempC: monthly(12 as Celsius),
    monthlyMinTempC: monthly(4 as Celsius),
    monthlyMaxTempC: monthly(20 as Celsius),
    monthlyPrecipMm: monthly(90 as Millimeters),
    monthlyMeanDliMolM2Day: monthly(28),
    heatDaysAbove30C: 12,
    normalsPeriod: '1991-2020',
    source: 'open-meteo',
  },
  chill: {
    chillingHours: 1200 as never,
    utahChillUnits: 1000 as never,
    dynamicChillPortions: 60 as never,
    seasonStart: 305 as never,
    seasonEnd: 60 as never,
  },
  frost: [],
  seasonGdd: { base4C: 2600 as never, base10C: 1400 as never, percentile: 50 },
  soil: {
    phUnits: 6.4,
    textureClass: 'loam',
    drainage: 'well',
    effectiveDepthM: 0.7 as Meters,
    organicMatterFraction: 0.05 as Fraction,
    sourceId: 'user',
  },
  waterLimitation: {
    index: 0.2 as Fraction,
    band: banded(interval(0.15 as Fraction, 0.25 as Fraction), 0.8, 'confidence', 'soil-water', []),
    aridityIndex: 1.4,
    referenceEtMm: 700 as MillimetersPerYear,
    rainfallMm: 985 as MillimetersPerYear,
    method: 'fao56-penman-monteith',
    fallbackReason: null,
    limited: false,
  },
}

// the shipped default array: 3 rows of 12 modules, 3.524 m collector on a 9 m pitch
const array: PvArray = {
  id: arrayId('array-1'),
  label: 'Array 1',
  geometry: {
    collectorWidthM: 3.524 as Meters,
    pitchM: 9 as Meters,
    rowLengthM: 13.6 as Meters,
    rowCount: 3,
    modulesPerRow: 12,
    clearanceHeightM: 2.5 as Meters,
    rowAzimuthDeg: 90 as Degrees,
    originM: { xM: 0 as Meters, yM: 0 as Meters },
  },
  tracker: { mode: 'fixed', tiltDeg: 25 as Degrees, surfaceAzimuthDeg: 180 as Degrees },
  module: {
    widthM: 1.134 as Meters,
    heightM: 1.762 as Meters,
    nameplateWp: 430 as WattsPeak,
    bifacialityFactor: 0.7 as Fraction,
    transmittanceFraction: 0 as Fraction,
    rearReflectance: 0.05 as Fraction,
    backsheet: 'glass-glass',
  },
  derived: {
    groundCoverRatio: 0.3916 as Fraction,
    projectedGroundCoverRatio: 0.3549 as Fraction,
    maxHeightM: 3.99 as Meters,
    nameplateDcKw: 30.96 as KilowattsDc,
    nameplateAcKw: 25.8 as KilowattsAc,
  },
}

const tmy = weather()
const position = solarPositionSeries(tmy.utcMillis, observerFor(site), 'nrel-spa')

describe('PVWatts v5 loss stack', () => {
  it('combines multiplicatively to the published 14.08%', () => {
    expect(combinedLossFraction(PVWATTS_DEFAULT_LOSSES)).toBeCloseTo(0.1408, 4)
  })
})

describe('inverter', () => {
  it("clips at the AC rating and reports what it couldn't pass", () => {
    const rating = 10
    const { acKw, clippedKw } = pvwattsAc(rating * 2, rating)
    expect(acKw).toBeCloseTo(0.96 * rating, 6)
    expect(clippedKw).toBeGreaterThan(0)
  })

  it('derives an AC nameplate from the DC nameplate and the DC:AC ratio', () => {
    expect(nameplateAcKw(120 as KilowattsDc, DEFAULT_DC_AC_RATIO)).toBeCloseTo(100, 6)
  })
})

describe('annual chain', () => {
  const energy = runAnnualChain(array, tmy, position, DEFAULT_PV_CHAIN_OPTIONS)

  it('produces a plausible specific yield and a self-consistent energy balance', () => {
    expect(energy.annualAcKwh).toBeGreaterThan(0)
    expect(energy.annualAcKwh).toBeLessThan(energy.annualDcKwh)
    expect(energy.specificYieldKwhPerKwp).toBeGreaterThan(600)
    expect(energy.specificYieldKwhPerKwp).toBeLessThan(2200)
    expect(energy.performanceRatio).toBeGreaterThan(0.5)
    expect(energy.performanceRatio).toBeLessThan(1)
  })

  it('rates AC below DC by the DC:AC ratio', () => {
    expect(energy.nameplateAcKw).toBeCloseTo(energy.nameplateDcKw / energy.dcAcRatio, 6)
  })

  /**
   * Perez is fitted against the sea-level air mass and DIRINT against the pressure-corrected one.
   * The chain recomputes the air mass from the zenith, so the pressure-corrected series can't
   * reach the transposition at all, and halving it must leave annual AC unchanged. For a site at
   * 1,800 m, handing Perez the pressure-corrected series reads sky diffuse about 1% high.
   * `docs/VALIDATION.md` section 1 has the measurement
   */
  it('ignores the pressure-corrected air mass, which belongs to the decomposition', () => {
    const thinAir = {
      ...position,
      absoluteAirMass: Float32Array.from(position.absoluteAirMass, (m) => m / 2),
    }
    const thin = runAnnualChain(array, tmy, thinAir, DEFAULT_PV_CHAIN_OPTIONS)
    expect(thin.annualAcKwh).toBe(energy.annualAcKwh)
  })

  it('responds to tilt, pitch and tracking rather than sitting at a constant', () => {
    const flat = runAnnualChain(
      {
        ...array,
        tracker: { mode: 'fixed', tiltDeg: 0 as Degrees, surfaceAzimuthDeg: 180 as Degrees },
      },
      tmy,
      position,
      DEFAULT_PV_CHAIN_OPTIONS,
    )
    const tight = runAnnualChain(
      { ...array, geometry: { ...array.geometry, pitchM: 4.5 as Meters } },
      tmy,
      position,
      DEFAULT_PV_CHAIN_OPTIONS,
    )
    expect(flat.annualAcKwh).not.toBeCloseTo(energy.annualAcKwh, 0)
    expect(tight.rowShadingLossFraction).toBeGreaterThan(energy.rowShadingLossFraction)
  })

  it('clips only once the array is oversized against the inverter', () => {
    const oversized = runAnnualChain(array, tmy, position, {
      ...DEFAULT_PV_CHAIN_OPTIONS,
      dcAcRatio: 2 as typeof DEFAULT_PV_CHAIN_OPTIONS.dcAcRatio,
    })
    expect(energy.clippingLossFraction).toBe(0)
    expect(oversized.clippingLossFraction).toBeGreaterThan(0)
    expect(oversized.annualAcKwh).toBeLessThan(energy.annualAcKwh)
  })

  it('gains from the rear side only when bifacial is on', () => {
    const mono = runAnnualChain(array, tmy, position, {
      ...DEFAULT_PV_CHAIN_OPTIONS,
      bifacial: false,
    })
    expect(energy.bifacialGainFraction).toBeGreaterThan(0)
    expect(mono.bifacialGainFraction).toBe(0)
  })

  /**
   * The module's own bifaciality, which `ArrayPanel` puts a slider on so a researcher with a
   * bifacial plot has somewhere to state it. Zero is a one-sided panel and the rear-side term
   * disappears. A higher factor is a bigger gain, monotonically
   */
  it('scales the rear-side gain with the module bifaciality the array carries', () => {
    const withFactor = (bifacialityFactor: number): number =>
      runAnnualChain(
        { ...array, module: { ...array.module, bifacialityFactor: bifacialityFactor as Fraction } },
        tmy,
        position,
        DEFAULT_PV_CHAIN_OPTIONS,
      ).bifacialGainFraction
    expect(withFactor(0)).toBe(0)
    expect(withFactor(0.9)).toBeGreaterThan(withFactor(0.5))
    expect(withFactor(0.5)).toBeGreaterThan(withFactor(0.2))
  })
})

describe('land equivalent ratio, electricity term', () => {
  const energies = [runAnnualChain(array, tmy, position, DEFAULT_PV_CHAIN_OPTIONS)]
  const result = energyRatio(
    [array],
    energies,
    site.location.latitudeDeg,
    tmy,
    position,
    DEFAULT_PV_CHAIN_OPTIONS,
  )

  it('states its denominator rather than leaving the ratio undefined', () => {
    expect(result.reference.definition).toBe(REFERENCE_DEFINITION)
    expect(result.reference.definition).toContain('Dupraz')
    expect(result.reference.groundCoverRatio).toBe(REFERENCE_GROUND_COVER_RATIO)
    expect(result.reference.annualAcKwhPerM2Land).toBeGreaterThan(0)
  })

  it('builds the sole-use reference on the same land with the same modules', () => {
    const reference = referenceArray(array, site.location.latitudeDeg)
    expect(reference.module).toBe(array.module)
    expect(reference.geometry.collectorWidthM / reference.geometry.pitchM).toBeCloseTo(
      REFERENCE_GROUND_COVER_RATIO,
      6,
    )
    expect(reference.tracker.mode).toBe('fixed')
    expect(referenceTiltDeg(site.location.latitudeDeg)).toBeCloseTo(35, 6)
  })

  it('sits near 1 for a default array whose GCR is close to the reference, and falls as it thins', () => {
    expect(result.ratio.interval.lower).toBeGreaterThan(0.7)
    expect(result.ratio.interval.upper).toBeLessThan(1.3)
    const wide = { ...array, geometry: { ...array.geometry, pitchM: 18 as Meters } }
    const sparse = energyRatio(
      [wide],
      [runAnnualChain(wide, tmy, position, DEFAULT_PV_CHAIN_OPTIONS)],
      site.location.latitudeDeg,
      tmy,
      position,
      DEFAULT_PV_CHAIN_OPTIONS,
    )
    expect(sparse.ratio.interval.upper).toBeLessThan(result.ratio.interval.lower)
  })

  it('explains its own width with named contributions', () => {
    expect(result.ratio.contributions.length).toBeGreaterThanOrEqual(3)
    for (const contribution of result.ratio.contributions) {
      expect(contribution.note.length).toBeGreaterThan(20)
      expect(contribution.halfWidthFraction).toBeGreaterThanOrEqual(0)
    }
    expect(result.ratio.interval.upper).toBeGreaterThan(result.ratio.interval.lower)
  })
})

describe('energy report', () => {
  const report = pvEnergyReport(site, [array], tmy)

  it('rolls the plot up with an AC nameplate and a loss stack', () => {
    expect(report.nameplateAcKw).toBeCloseTo(report.nameplateDcKw / report.dcAcRatio, 6)
    expect(report.losses).toBe(DEFAULT_PV_CHAIN_OPTIONS.losses)
    expect(report.systemLossFraction).toBeGreaterThan(0)
    expect(report.annualAcKwhPerM2Land).toBeGreaterThan(0)
  })

  it('carries the provenance of every model stage', () => {
    expect(report.provenance).toBe(PV_CHAIN_PROVENANCE)
    for (const entry of report.provenance) expect(entry.citations.length).toBeGreaterThan(0)
  })
})

/**
 * The energy panel prints every line of `PV_CHAIN_PROVENANCE` to a grower, so a stale sentence in
 * it is a stale sentence on screen. So no entry may say its primary reference is "not yet in
 * docs/CITATIONS.csl.json", and every one has to name a real citekey
 */
describe('what the chain says about its own sources', () => {
  it('names a real citekey for every stage, with no surrogate standing in for a missing one', () => {
    for (const entry of PV_CHAIN_PROVENANCE) {
      expect(entry.citations.length, entry.value).toBeGreaterThan(0)
      expect(`${entry.value} ${entry.caveat ?? ''}`, entry.value).not.toMatch(
        /not yet in|no citekey|missing primary/i,
      )
    }
  })

  it('covers every stage the chain actually runs, the ground included', () => {
    // every stage of this chain is a model rather than a quoted figure, which is the whole
    // reason each one names what it computed and not just what it read
    const models = PV_CHAIN_PROVENANCE.map((entry) =>
      entry.provenance === 'computed' ? entry.model : null,
    )
    for (const stage of [
      'faiman-2008',
      'pvwatts-v5-dc',
      'pvwatts-v5-inverter',
      'pvwatts-v5-losses',
      'infinite-shed-rear-poa',
      'ground-cover-albedo-with-seasonal-snow',
    ]) {
      expect(models, stage).toContain(stage)
    }
  })
})
