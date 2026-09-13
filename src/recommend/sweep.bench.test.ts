import { beforeAll, describe, expect, it } from 'bun:test'
import { loadCompanionRules, loadRotationConstraints } from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import type { DesignScenario, OnboardingAnswers } from '../types/onboarding'
import type { Site } from '../types/site'
import { degreesLatitude, degreesLongitude, meters } from '../types/units'
import {
  candidatesFor,
  type DesignDependencies,
  type EnergyPlan,
  groundLightPlan,
  suggestDesigns,
  type TiltedArchetype,
} from './design'
import { siteFixture, tmyFixture } from './testkit'

/*
  Re-measures the three VOID figures in Decision Record 10c, left behind by the row-axis fix
  (the row-axis fix of 2026-09-01; see *What holds it up* in `crates/agv-sim/README.md`). Every configuration below
  costs a full annual bake, so this is skipped by default; run it explicitly with

    SWEEP=1 bun test src/recommend/sweep.bench.test.ts

  and read the figures off stdout. The assertions only pin the shape each block is checking,
  which side of a row-count step carries more rows, not the exact numbers: a bake's output moves
  with the crop catalogue and the physics core, and freezing it here would make this file lie the
  next time either changes
*/
const RUN = process.env.SWEEP === '1'

const answersFor = (patch: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  location: { latitudeDeg: degreesLatitude(42.37), longitudeDeg: degreesLongitude(-72.52) },
  locationLabel: 'Sweep plot',
  plotWidthM: meters(16),
  plotDepthM: meters(12),
  objective: { food: 0.4, energy: 0.3, water: 0.2, simplicity: 0.1 },
  ambition: 'mixed-vegetables',
  exposure: 'open',
  mounting: 'ground-rows',
  maxHeightM: null,
  irrigationAvailable: true,
  experience: 'novice',
  maxBeds: null,
  ...patch,
})

const siteAt = (latitudeDeg: number): Site =>
  siteFixture({
    location: {
      latitudeDeg: degreesLatitude(latitudeDeg),
      longitudeDeg: degreesLongitude(-72.52),
    },
  })

const tiltPlanFor = (
  archetype: TiltedArchetype,
  tiltDeg: number,
): Partial<Record<TiltedArchetype, EnergyPlan>> => ({ [archetype]: { tiltDeg, tracking: false } })

describe.skipIf(!RUN)(
  'Decision Record 10c, VOID figures re-measured after the row-axis fix',
  () => {
    let deps: Partial<DesignDependencies>

    beforeAll(async () => {
      const [catalog, companionRules, rotationConstraints] = await Promise.all([
        loadCropCatalog(),
        loadCompanionRules(),
        loadRotationConstraints(),
      ])
      deps = {
        catalog,
        companionRules,
        rotationConstraints,
        weather: tmyFixture(),
        backend: 'cpu-reference',
        // preview subdivision and substep count, at a coarser 0.5 m cell rather than the 0.25 m
        // preview default: the trade `design.test.ts` already makes for its own tilt-band bakes,
        // and twelve of them run in this file
        targetCellSizeM: meters(0.5),
      }
    }, 300_000)

    /** Row count is pure geometry and costs no bake, so the step search below runs it directly */
    const rowCountAt = (site: Site, archetype: TiltedArchetype, tiltDeg: number): number => {
      const answers = answersFor({ location: site.location })
      const found = candidatesFor(answers, site, tiltPlanFor(archetype, tiltDeg)).find(
        (entry) => entry.archetype === archetype,
      )
      if (found === undefined) throw new Error(`no ${archetype} candidate`)
      return found.geometry.rowCount
    }

    const scenarioAt = async (
      site: Site,
      archetype: TiltedArchetype,
      tiltDeg: number,
    ): Promise<DesignScenario> => {
      const set = await suggestDesigns(answersFor({ location: site.location }), {
        ...deps,
        site,
        tiltPlans: tiltPlanFor(archetype, tiltDeg),
      })
      const found = set.scenarios.find((entry) => entry.candidate.archetype === archetype)
      if (found === undefined) throw new Error(`no ${archetype} scenario`)
      return found
    }

    const report = (label: string, tiltDeg: number, scenario: DesignScenario): void => {
      const rows = scenario.candidate.geometry.rowCount
      const rsr = (scenario.light.meanShadeRatio as number).toFixed(4)
      const crops = scenario.production.cropsAvailable.length
      const kwh = (scenario.production.annualAcKwh as number).toFixed(0)
      process.stdout.write(
        `${label}: ${tiltDeg.toFixed(1)} deg, ${String(rows)} row(s), RSR ${rsr}, ${String(crops)} crops, ${kwh} kWh AC\n`,
      )
    }

    it('block 1: crop count and annual AC over the tilt band at 20 N, balanced, one row held fixed', async () => {
      const site = siteAt(20)
      const flat = await scenarioAt(site, 'balanced', 10)
      const steep = await scenarioAt(site, 'balanced', 35)
      report('20 N balanced 10 deg', 10, flat)
      report('20 N balanced 35 deg', 35, steep)
      // the row count `design.test.ts` also pins beside the RSR figures at this latitude, so an
      // extra row is never mistaken for a tilt effect
      expect(steep.candidate.geometry.rowCount).toBe(flat.candidate.geometry.rowCount)
    }, 180_000)

    /**
     * Where the tilt opposition turns over, if it turns over. Block 1 measured the two ends of the
     * band at 20 N and found crops and annual AC both falling as tilt rises; Decision Record 10c
     * said the two move in opposite directions at 42.4 N and this block looks in between.
     *
     * The band runs past 42.4 to 60 N rather than stopping where the record's claim did, because
     * an answer of "it does not turn over by 42.4" is only worth reading beside where it does.
     *
     * Row count is pure geometry here, so it does not move with latitude and the comparison stays
     * clean at every step: pitch is `collectorWidth * cos(tilt) / projected` and the projected
     * coverage comes from the ambition and the archetype, neither of which reads the site.
     */
    it('block 4: which way tilt moves crops and annual AC, 20 to 60 N, balanced, one row held fixed', async () => {
      const FLAT_DEG = 10
      const STEEP_DEG = 35
      const latitudes = [20, 24, 28, 32, 36, 40, 42.37, 44, 48, 52, 56, 60]
      const readingAt = async (
        latitudeDeg: number,
      ): Promise<{ latitudeDeg: number; cropDelta: number; kwhDelta: number }> => {
        const site = siteAt(latitudeDeg)
        const flat = await scenarioAt(site, 'balanced', FLAT_DEG)
        const steep = await scenarioAt(site, 'balanced', STEEP_DEG)
        expect(
          steep.candidate.geometry.rowCount,
          `row count moved with tilt at ${String(latitudeDeg)} N`,
        ).toBe(flat.candidate.geometry.rowCount)
        const flatKwh = flat.production.annualAcKwh as number
        const steepKwh = steep.production.annualAcKwh as number
        const cropDelta =
          steep.production.cropsAvailable.length - flat.production.cropsAvailable.length
        process.stdout.write(
          `${String(latitudeDeg)} N balanced ${String(FLAT_DEG)}->${String(STEEP_DEG)} deg: ` +
            `${String(cropDelta)} crops, ${(steepKwh - flatKwh).toFixed(0)} kWh AC ` +
            `(${flatKwh.toFixed(0)} -> ${steepKwh.toFixed(0)})\n`,
        )
        return { latitudeDeg, cropDelta, kwhDelta: steepKwh - flatKwh }
      }

      const readings: { latitudeDeg: number; cropDelta: number; kwhDelta: number }[] = []
      for (const latitudeDeg of latitudes) {
        readings.push(await readingAt(latitudeDeg))
      }

      // the half of the claim that survived at both ends: flat is the food end everywhere
      for (const entry of readings) {
        expect(
          entry.cropDelta,
          `steepening added crops at ${String(entry.latitudeDeg)} N`,
        ).toBeLessThan(0)
      }

      const turnover = readings.findIndex((entry) => entry.kwhDelta > 0)
      if (turnover < 1) {
        process.stdout.write('annual AC never changes sign inside the band\n')
        return
      }
      // bisect the bracket the coarse pass left, to a quarter of a degree
      let below = readings[turnover - 1]?.latitudeDeg ?? 0
      let above = readings[turnover]?.latitudeDeg ?? 0
      while (above - below > 0.25) {
        const middle = (below + above) / 2
        if ((await readingAt(middle)).kwhDelta > 0) above = middle
        else below = middle
      }
      process.stdout.write(
        `steepening starts paying for itself between ${below.toFixed(2)} and ${above.toFixed(2)} N\n`,
      )
    }, 600_000)

    it('block 2: RSR, crop count and annual AC on each side of a row-count step, food-first at 42.37 N', async () => {
      const site = siteAt(42.37)
      let stepTiltDeg = -1
      for (let tiltDeg = 10; tiltDeg < 35; tiltDeg += 1) {
        if (rowCountAt(site, 'food-first', tiltDeg + 1) > rowCountAt(site, 'food-first', tiltDeg)) {
          stepTiltDeg = tiltDeg + 1
          break
        }
      }
      expect(stepTiltDeg, 'no row-count step in the 10-35 deg band on this plot').toBeGreaterThan(0)
      const before = await scenarioAt(site, 'food-first', stepTiltDeg - 1)
      const after = await scenarioAt(site, 'food-first', stepTiltDeg)
      report('42.37 N food-first before the step', stepTiltDeg - 1, before)
      report('42.37 N food-first after the step', stepTiltDeg, after)
      expect(after.candidate.geometry.rowCount).toBeGreaterThan(before.candidate.geometry.rowCount)
    }, 180_000)

    it.each([20, 30, 42.37, 55])(
      'block 3: the 0.60 phi rule against the derived tilt at %s N, food-first',
      async (latitudeDeg) => {
        const site = siteAt(latitudeDeg)
        const answers = answersFor({ location: site.location })
        const ruleTiltDeg = Math.min(35, Math.max(10, 0.6 * latitudeDeg))
        const derivedTiltDeg = groundLightPlan(answers, site).tiltDeg
        const rule = await scenarioAt(site, 'food-first', ruleTiltDeg)
        const derived = await scenarioAt(site, 'food-first', derivedTiltDeg)
        report(`${String(latitudeDeg)} N food-first rule of thumb`, ruleTiltDeg, rule)
        report(`${String(latitudeDeg)} N food-first derived`, derivedTiltDeg, derived)
      },
      180_000,
    )
  },
)
