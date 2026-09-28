import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import { CROWN_TRANSMITTANCE_IN_LEAF, CROWN_TRANSMITTANCE_LEAFLESS } from '../data/canopy'
import type { DesignProgress, SimulationRunner } from '../recommend/design'
import { siteFixture, tmyFixture } from '../recommend/testkit'
import type { GardenPlot } from '../types/garden'
import { epochMillis, meters } from '../types/units'
import { DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL, makeHouse, makePlot } from './defaults'
import { DESIGN_UNAVAILABLE, normalizeSet, type DesignInputs } from './design-bridge'
import { extentOf, polygonAreaM2, polygonOf, rectangleOf, rectangleRing, vec2 } from './geom'
import {
  answersOf,
  arrayFromCandidate,
  DEFAULT_WIZARD_ANSWERS,
  normalizeObjective,
  objectiveTotal,
  OBJECTIVE_KEYS,
  OBJECTIVE_PRESETS,
  plotFromAnswers,
  plotSizeOf,
  presetMatching,
  SEARCH_ANSWER_FIELDS,
  withObjectiveWeight,
  type WizardAnswers,
} from './onboarding'
import { defaultDesign, encodeDesign, STORAGE_KEY } from './persist'
import { ready } from './slices'
import { getAppState, resetAppStore, useAppStore } from './store'
import {
  ACID_SOIL,
  designCandidateFixture as candidateFor,
  designScenarioFixture as scenarioFor,
  scenarioSetFixture as setFor,
} from './testkit'

/**
 * The engine is `src/recommend/design.ts`, tested in its own files, so it's stubbed here: what
 * this file tests is the wiring from the questions to that call and from its answer back into the
 * editor, which is all that is on this side of the boundary
 */
const engine = vi.hoisted(() => vi.fn())

/* captured before the mock is installed, so the spread carries the real module */
const actualRecommend = await import('../recommend')
mock.module('../recommend', () => ({ ...actualRecommend, suggestDesigns: engine }))

/**
 * The worker client is stubbed for the same reason the engine is: what is on this side of the
 * boundary is whether the search is handed the client's `run` at all, and whether abandoning it
 * reaches the worker. Under jsdom the real client has no `Worker` to talk to anyway
 */
const worker = vi.hoisted(() => ({
  run: vi.fn(),
  cancelAll: vi.fn(),
  terminate: vi.fn(),
  create: vi.fn(),
}))

/* captured before the mock is installed, so the spread carries the real module */
const actualWorkerClient = await import('../sim/worker/client')
mock.module('../sim/worker/client', () => ({
  ...actualWorkerClient,
  createSimClient: worker.create,
}))

const answers = (patch: Partial<WizardAnswers> = {}): WizardAnswers => ({
  ...DEFAULT_WIZARD_ANSWERS,
  ...patch,
})

const full = (patch: Partial<WizardAnswers> = {}, plot: GardenPlot | null = null) =>
  answersOf(answers(patch), DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL, plot)

/** The starting plot at another size, which is the one source of how big the space is */
const plotOf = (widthM: number, depthM: number): GardenPlot => ({
  ...makePlot(),
  boundary: polygonOf(rectangleRing(vec2(0, 0), widthM, depthM)),
})

beforeEach(() => {
  localStorage.clear()
  worker.run.mockReset()
  worker.cancelAll.mockReset()
  worker.terminate.mockReset()
  worker.create.mockReset()
  worker.create.mockReturnValue({
    run: worker.run,
    cancelAll: worker.cancelAll,
    terminate: worker.terminate,
  })
  resetAppStore()
  // applying a scenario plants the beds it places, and the ranking behind that needs a site.
  // Seeding one keeps this file on the wiring it is about, without an upstream
  useAppStore.setState({ site: ready(siteFixture()) })
  engine.mockReset()
  engine.mockResolvedValue(setFor())
})

describe('the answers reach the engine contract', () => {
  it('carries every answer plus the location the site slice holds', () => {
    const built = full({ ambition: 'fruiting-and-berries', irrigationAvailable: false })
    expect(built.location).toBe(DEFAULT_LOCATION)
    expect(built.locationLabel).toBe(DEFAULT_LOCATION_LABEL)
    expect(built.ambition).toBe('fruiting-and-berries')
    expect(built.irrigationAvailable).toBe(false)
  })

  /**
   * The plot boundary is the one source of the plot's size. Separate width and depth answers in the
   * questions would give the same yard a second size beside the ground step's
   */
  it('reads the size off the plot boundary, and falls back to 8 by 6 with no plot', () => {
    expect(plotSizeOf(null)).toEqual({ widthM: 8, depthM: 6 })
    expect(plotSizeOf(plotOf(12, 9))).toEqual({ widthM: 12, depthM: 9 })
    const built = full({}, plotOf(12, 9))
    expect(built.plotWidthM).toBe(12)
    expect(built.plotDepthM).toBe(9)
    // a hand-drawn shape is measured by its extent, which is the frame the search lays out in
    const drawn: GardenPlot = {
      ...makePlot(),
      boundary: polygonOf([vec2(0, 0), vec2(7, 0), vec2(7, 3), vec2(2, 5), vec2(0, 5)]),
    }
    expect(plotSizeOf(drawn)).toEqual({ widthM: 7, depthM: 5 })
  })

  /** A drawn house answers what is already around the space, so the search reads that instead */
  it('hands the search the exposure in force: open with a house drawn, the answer otherwise', () => {
    const plot = plotOf(10, 8)
    expect(full({ exposure: 'overshadowed' }, plot).exposure).toBe('overshadowed')
    const withHouse = { ...plot, obstructions: [makeHouse(1, plot.boundary, 'south')] }
    expect(full({ exposure: 'overshadowed' }, withHouse).exposure).toBe('open')
  })

  it('normalizes the objective on the way out, whatever the sliders left behind', () => {
    const built = full({ objective: { food: 2, energy: 1, water: 1, simplicity: 0 } })
    expect(objectiveTotal(built.objective)).toBeCloseTo(1, 12)
    expect(built.objective.food).toBeCloseTo(0.5, 12)
  })

  it('gives the answer from every step a place to land', () => {
    resetAppStore()
    const store = getAppState()
    store.answerOnboarding({ experience: 'experienced' })
    store.answerOnboarding({
      objective: OBJECTIVE_PRESETS[0]?.weights ?? DEFAULT_WIZARD_ANSWERS.objective,
    })
    store.answerOnboarding({ ambition: 'leafy-and-herbs' })
    store.answerOnboarding({ exposure: 'partly-sheltered', mounting: 'ground-rows' })
    store.answerOnboarding({ maxHeightM: meters(2.4), irrigationAvailable: false })
    const state = getAppState().answers
    expect(state).toMatchObject({
      experience: 'experienced',
      ambition: 'leafy-and-herbs',
      exposure: 'partly-sheltered',
      mounting: 'ground-rows',
      irrigationAvailable: false,
    })
    expect(state.maxHeightM).toBe(2.4)
    expect(presetMatching(state.objective)).toBe('mostly-food')
  })
})

describe('the objective is four weights nobody has to normalize by hand', () => {
  it('ships presets that already sum to 1', () => {
    for (const preset of OBJECTIVE_PRESETS) {
      expect(objectiveTotal(preset.weights), preset.id).toBeCloseTo(1, 12)
      expect(presetMatching(preset.weights)).toBe(preset.id)
    }
  })

  it('moves one weight and leaves the other three where they were', () => {
    for (const key of OBJECTIVE_KEYS) {
      for (const value of [0, 0.3, 0.85, 1]) {
        const moved = withObjectiveWeight(DEFAULT_WIZARD_ANSWERS.objective, key, value)
        expect(moved[key]).toBeCloseTo(value, 12)
        for (const other of OBJECTIVE_KEYS.filter((entry) => entry !== key)) {
          expect(moved[other], `${other} while ${key} moved`).toBe(
            DEFAULT_WIZARD_ANSWERS.objective[other],
          )
        }
      }
    }
    // pushing one dial to the top empties no other: the shares the search reads still add up to 1,
    // with nothing at zero that wasn't at zero before
    const water = normalizeObjective(
      withObjectiveWeight(DEFAULT_WIZARD_ANSWERS.objective, 'water', 1),
    )
    expect(objectiveTotal(water)).toBeCloseTo(1, 12)
    expect(water.energy).toBeGreaterThan(0)
  })

  it('splits evenly rather than dividing by zero when nothing is wanted', () => {
    expect(normalizeObjective({ food: 0, energy: 0, water: 0, simplicity: 0 }).food).toBe(0.25)
  })

  it('reports no preset once the mix is one the grower made', () => {
    expect(
      presetMatching(withObjectiveWeight(DEFAULT_WIZARD_ANSWERS.objective, 'water', 0.5)),
    ).toBeNull()
  })
})

describe('the space the answers describe', () => {
  it('is the rectangle the plot measures, with beds inside it', () => {
    const plot = plotFromAnswers(answers(), plotOf(10, 8))
    expect(polygonAreaM2(plot.boundary)).toBeCloseTo(80, 6)
    expect(plot.beds.length).toBeGreaterThan(0)
    for (const bed of plot.beds) {
      for (const point of bed.footprint.exterior) {
        expect(Math.abs(point.xM)).toBeLessThanOrEqual(5)
        expect(Math.abs(point.yM)).toBeLessThanOrEqual(4)
      }
    }
  })

  it('still produces one bed in a space too small for a row of them', () => {
    const plot = plotFromAnswers(answers(), plotOf(2, 1.5))
    expect(plot.beds.length).toBe(1)
  })

  /** A layout placed after the lookup carries the place's own pH, the same as a drawn bed */
  it('gives every placed bed the soil it is passed', () => {
    const soil = { ...ACID_SOIL, phUnits: 7.2, sourceId: 'soilgrids' } as const
    const plot = plotFromAnswers(answers(), plotOf(10, 8), null, soil)
    expect(plot.beds.length).toBeGreaterThan(0)
    expect(
      plot.beds.every((bed) => bed.soil.phUnits === 7.2 && bed.soil.sourceId === 'soilgrids'),
    ).toBe(true)
  })
})

describe('applying a scenario goes through the actions the editor already has', () => {
  it('writes the plot, the geometry and the tracker, and lands on the plants step', async () => {
    useAppStore.setState({ plot: plotOf(10, 8) })
    const candidate = candidateFor('balanced')
    await getAppState().applyDesign(scenarioFor('balanced'))

    const state = getAppState()
    const plot = state.plot
    expect(plot).not.toBeNull()
    expect(polygonAreaM2(plot!.boundary)).toBeCloseTo(80, 6)
    expect(plot!.arrays.length).toBe(1)
    const array = plot!.arrays[0]
    expect(array?.geometry.pitchM).toBe(candidate.geometry.pitchM)
    expect(array?.tracker).toEqual(candidate.tracker)
    // upsertArray is the only path that derives these, so a non-zero one proves it was used
    expect(array?.derived.groundCoverRatio).toBeGreaterThan(0)
    expect(array?.derived.nameplateDcKw).toBeGreaterThan(0)
    expect(state.onboarding.appliedArchetype).toBe('balanced')
    expect(state.sidebarStep).toBe('plants')
    expect(state.mode).toBe('select')
  })

  it('leaves the plot with no panels at all when the control is the one chosen', async () => {
    await getAppState().applyDesign(scenarioFor('balanced'))
    expect(getAppState().plot?.arrays.length).toBe(1)
    await getAppState().applyDesign(scenarioFor('no-array-control'))
    expect(getAppState().plot?.arrays.length).toBe(0)
  })

  it('replaces the array rather than adding a second one', async () => {
    await getAppState().applyDesign(scenarioFor('food-first'))
    await getAppState().applyDesign(scenarioFor('energy-first'))
    const plot = getAppState().plot
    expect(plot?.arrays.length).toBe(1)
    expect(plot?.arrays[0]?.geometry.pitchM).toBe(candidateFor('energy-first').geometry.pitchM)
  })

  it('keeps the existing array identity when there already is one', () => {
    const existing = getAppState().plot?.arrays[0] ?? null
    expect(existing).not.toBeNull()
    const next = arrayFromCandidate(candidateFor('balanced'), existing)
    expect(next.id).toBe(existing?.id)
  })
})

describe('a house drawn on the ground', () => {
  it('adds a 10 by 8 m house outside the boundary on the equator-facing side, and selects it', () => {
    const bed = getAppState().plot?.beds[0]
    expect(bed).toBeDefined()
    getAppState().selectBed(bed!.id)

    const id = getAppState().addHouse()
    expect(id).not.toBeNull()

    const plot = getAppState().plot!
    expect(plot.obstructions.length).toBe(1)
    const house = plot.obstructions[0]!
    expect(house.id).toBe(id)
    expect(house.heightM).toBe(6)

    const size = rectangleOf(house.footprint.exterior)
    expect(size?.widthM).toBeCloseTo(10, 6)
    expect(size?.depthM).toBeCloseTo(8, 6)

    // the default location is north of the equator, so the house stands on its south side
    const boundary = extentOf([plot.boundary.exterior])
    expect(size?.center.yM).toBeLessThan(boundary.minYM)

    expect(getAppState().selectedObstructionId).toBe(id)
    expect(getAppState().selectedBedId).toBeNull()
  })

  it('is null with no plot to draw one on', () => {
    useAppStore.setState({ plot: null })
    expect(getAppState().addHouse()).toBeNull()
  })

  it('removes a house and clears its selection', () => {
    const id = getAppState().addHouse()
    getAppState().removeObstruction(id!)
    expect(getAppState().plot?.obstructions.length).toBe(0)
    expect(getAppState().selectedObstructionId).toBeNull()
  })

  it('gives up the house selection the moment a bed is selected', () => {
    const id = getAppState().addHouse()
    expect(getAppState().selectedObstructionId).toBe(id)
    const bed = getAppState().plot!.beds[0]!
    getAppState().selectBed(bed.id)
    expect(getAppState().selectedObstructionId).toBeNull()
    expect(getAppState().selectedBedId).toBe(bed.id)
  })
})

describe('a tree drawn on the ground', () => {
  it('adds a 5 by 5 m tree from 2 up to 7 m, east of the boundary on the equator-facing side, and selects it', () => {
    const bed = getAppState().plot?.beds[0]
    expect(bed).toBeDefined()
    getAppState().selectBed(bed!.id)

    const id = getAppState().addTree()
    expect(id).not.toBeNull()

    const plot = getAppState().plot!
    expect(plot.obstructions.length).toBe(1)
    const tree = plot.obstructions[0]!
    expect(tree.id).toBe(id)
    expect(tree.kind).toBe('tree')
    if (tree.kind !== 'tree') throw new Error('not a tree')
    expect(tree.crownBaseM).toBe(2)
    expect(tree.heightM).toBe(7)

    const size = rectangleOf(tree.footprint.exterior)
    expect(size?.widthM).toBeCloseTo(5, 6)
    expect(size?.depthM).toBeCloseTo(5, 6)

    // 8 m east of the boundary's center. The default location is north of the equator, so the
    // tree stands on its south side, like the default house
    const boundary = extentOf([plot.boundary.exterior])
    const boundaryCenterXM = (boundary.minXM + boundary.maxXM) / 2
    expect(size?.center.xM).toBeCloseTo(boundaryCenterXM + 8, 6)
    expect(size?.center.yM).toBeLessThan(boundary.minYM)

    expect(getAppState().selectedObstructionId).toBe(id)
    expect(getAppState().selectedBedId).toBeNull()
  })

  it('is deciduous by default, with the two cited crown-transmittance figures', () => {
    getAppState().addTree()
    const tree = getAppState().plot?.obstructions[0]
    if (tree === undefined || tree.kind !== 'tree') throw new Error('no tree drawn')
    expect(tree.evergreen).toBe(false)
    expect(tree.transmittance).toBeCloseTo(CROWN_TRANSMITTANCE_IN_LEAF.value, 6)
    expect(tree.leaflessTransmittance).toBeCloseTo(CROWN_TRANSMITTANCE_LEAFLESS.value, 6)
  })

  it('is null with no plot to draw one on', () => {
    useAppStore.setState({ plot: null })
    expect(getAppState().addTree()).toBeNull()
  })

  it('removes a tree and clears its selection', () => {
    const id = getAppState().addTree()
    getAppState().removeObstruction(id!)
    expect(getAppState().plot?.obstructions.length).toBe(0)
    expect(getAppState().selectedObstructionId).toBeNull()
  })
})

describe('the answers outlive the step that asked them', () => {
  it('keeps every answer and the agent cursor when the sidebar moves on', () => {
    const store = getAppState()
    store.setOnboardingStep('growing')
    store.answerOnboarding({ ambition: 'fruiting-and-berries' })
    store.setSidebarStep('panels')
    store.setSidebarStep('wants')
    expect(getAppState().onboarding.step).toBe('growing')
    expect(getAppState().answers.ambition).toBe('fruiting-and-berries')
  })

  it('drops a finished run once an answer moves, rather than showing a stale one', async () => {
    await getAppState().suggestDesigns()
    expect(getAppState().onboarding.designs.status).toBe('ready')
    getAppState().answerOnboarding({ ambition: 'leafy-and-herbs' })
    expect(getAppState().onboarding.designs.status).toBe('idle')
  })

  /** The boundary is the plot size the search laid out in, so moving it is moving an answer */
  it('drops a finished run when the plot boundary moves', async () => {
    await getAppState().suggestDesigns()
    expect(getAppState().onboarding.designs.status).toBe('ready')
    getAppState().setBoundary(polygonOf(rectangleRing(vec2(0, 0), 11, 7)))
    expect(getAppState().onboarding.designs.status).toBe('idle')

    await getAppState().suggestDesigns()
    getAppState().moveBoundaryVertex(0, vec2(-6, -4))
    expect(getAppState().onboarding.designs.status).toBe('idle')

    await getAppState().suggestDesigns()
    getAppState().setMode('draw-plot')
    for (const point of [vec2(0, 0), vec2(9, 0), vec2(9, 6), vec2(0, 6)]) {
      getAppState().pushDraftVertex(point)
    }
    getAppState().commitDraft()
    expect(getAppState().onboarding.designs.status).toBe('idle')
  })

  it('hands the search the size of the plot as it stands', async () => {
    useAppStore.setState({ plot: plotOf(11, 7) })
    await getAppState().suggestDesigns()
    const [passed] = engine.mock.calls[0] as [Record<string, unknown>]
    expect(passed.plotWidthM).toBe(11)
    expect(passed.plotDepthM).toBe(7)
  })

  it('opens a returning grower on their garden and a first visit on the questions', async () => {
    localStorage.setItem(STORAGE_KEY, encodeDesign(defaultDesign(), epochMillis(1)))
    /*
      `store.ts` reads storage once, at module scope, so this has to evaluate it twice. Bun has no
      module registry to reset, and doesn't need one: a distinct query string is a distinct
      specifier, so each import below evaluates the module afresh the way a cold page load does.

      The cast is because TypeScript resolves `./store?restored` to nothing. Bun does
    */
    const load = async (tag: string): Promise<typeof import('./store')> =>
      (await import(`./store?${tag}`)) as typeof import('./store')

    const restored = await load('returning')
    expect(restored.useAppStore.getState().surface).toBe('garden')
    localStorage.clear()
    const fresh = await load('cold')
    expect(fresh.useAppStore.getState().surface).toBe('edit')
    expect(fresh.useAppStore.getState().sidebarStep).toBe('place')
  })
})

describe('the engine is called once, with what the store already knows', () => {
  it('lands on the panels step carrying what came back', async () => {
    getAppState().setSidebarStep('ground')
    await getAppState().suggestDesigns()
    const state = getAppState().onboarding
    expect(getAppState().sidebarStep).toBe('panels')
    expect(state.designs.status).toBe('ready')
    if (state.designs.status !== 'ready') return
    const archetypes = state.designs.value.scenarios.map((scenario) => scenario.candidate.archetype)
    expect(archetypes).toContain('no-array-control')
    expect(archetypes).toContain(state.designs.value.recommendedArchetype)
  })

  it('hands over the answers, and the site the app already resolved', async () => {
    const site = { id: 'site-1' } as unknown as never
    const weather = { hours: 8760 } as unknown as never
    useAppStore.setState({ site: ready(site), weather: ready(weather) })
    getAppState().answerOnboarding({ ambition: 'leafy-and-herbs' })
    await getAppState().suggestDesigns()
    const [passed, inputs] = engine.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(passed.ambition).toBe('leafy-and-herbs')
    expect(passed.locationLabel).toBe(DEFAULT_LOCATION_LABEL)
    expect(objectiveTotal(passed.objective as never)).toBeCloseTo(1, 12)
    // the wizard never resolves a second site: the one the editor has is handed over
    expect(inputs.site).toBe(site)
    expect(inputs.weather).toBe(weather)
  })

  it('says so plainly when the engine throws, and keeps every answer', async () => {
    engine.mockRejectedValue(new Error('the bake gave up'))
    getAppState().answerOnboarding({ ambition: 'fruiting-and-berries' })
    await getAppState().suggestDesigns()
    const state = getAppState().onboarding
    expect(state.designs.status).toBe('error')
    if (state.designs.status === 'error') expect(state.designs.message).toContain('gave up')
    expect(getAppState().answers.ambition).toBe('fruiting-and-berries')
  })

  it("refuses a shape it can't render rather than showing half a scenario", async () => {
    engine.mockResolvedValue({ scenarios: [{}], recommendedArchetype: 'balanced' })
    await getAppState().suggestDesigns()
    const designs = getAppState().onboarding.designs
    expect(designs.status).toBe('error')
    if (designs.status === 'error') expect(designs.message).toMatch(/unexpected shape/)
  })
})

describe("the search runs where it can't freeze the wizard", () => {
  const inputsOf = (): Record<string, unknown> =>
    (engine.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>])[1]

  it('hands over the worker client run, so the bakes leave this thread', async () => {
    await getAppState().suggestDesigns()
    const run = inputsOf().run as SimulationRunner | undefined
    expect(typeof run).toBe('function')
    void run?.(null as never, null as never, null as never, null as never, () => {})
    expect(worker.run).toHaveBeenCalledTimes(1)
  })

  // the store already models a client that couldn't be made, and the engine already defaults
  // to its own import: the fallback is those two meeting, with no third mechanism
  it("passes no runner at all when the client couldn't be created", async () => {
    worker.create.mockImplementation(() => {
      throw new Error('no worker in this build')
    })
    resetAppStore()
    // a resolved site, because the search settles the editor's own before it runs and this test
    // is about the runner fallback: without one it would reach for the real upstream and time out
    useAppStore.setState({
      site: ready({ id: 'site-1' } as unknown as never),
      weather: ready({ hours: 8760 } as unknown as never),
    })
    await getAppState().suggestDesigns()
    expect(inputsOf().run).toBeUndefined()
    expect(getAppState().onboarding.designs.status).toBe('ready')
  })

  it('carries how far the search has got, and clears it when the answer lands', async () => {
    const reported: DesignProgress = {
      candidatesDone: 2,
      candidatesTotal: 5,
      archetype: 'balanced',
      bake: { passesDone: 7, passesTotal: 145, elapsedMs: 900 },
    }
    let duringRun: DesignProgress | null = null
    engine.mockImplementation((_answers: unknown, inputs: DesignInputs) => {
      inputs.onProgress?.(reported)
      duringRun = getAppState().onboarding.progress
      return Promise.resolve(setFor())
    })
    await getAppState().suggestDesigns()
    expect(duringRun).toEqual(reported)
    expect(getAppState().onboarding.progress).toBeNull()
  })

  it('stops the worker when the search is abandoned, rather than letting it finish unread', async () => {
    const pending = getAppState().suggestDesigns()
    getAppState().cancelDesignSuggestions()
    await pending
    expect(worker.cancelAll).toHaveBeenCalledTimes(1)
    const state = getAppState().onboarding
    expect(state.designs.status).toBe('idle')
    expect(state.progress).toBeNull()
  })

  /**
   * The search gets a client of its own. `SimClient.run` calls `cancelAll` before it starts,
   * because one client is single-flight, so with a shared client, a grower starting a bake from the
   * sidebar would reject their own in-flight search with "simulation superseded"
   */
  it("doesn't bake the search through the same client the editor bakes through", async () => {
    // left in flight: the assertion is about which client is reached, which happens before the
    // bake resolves, and a resolved stub would have the store read a raster off `undefined`
    worker.run.mockReturnValue(new Promise(() => undefined))
    await getAppState().suggestDesigns()
    // one for the editor's lazy client, one for the search's: the search never reuses the editor's
    expect(worker.create).toHaveBeenCalledTimes(1)

    // the editor's client is lazy too, so a bake has to actually reach it
    useAppStore.setState({ weather: ready(tmyFixture()), plot: makePlot() })
    void getAppState().runFinal()
    expect(worker.create).toHaveBeenCalledTimes(2)
  })
})

describe('an engine answer is taken only in a shape the view can render', () => {
  it("refuses anything it doesn't recognize", () => {
    expect(normalizeSet(null)).toBeNull()
    expect(normalizeSet({ scenarios: [] })).toBeNull()
    expect(normalizeSet({ ...setFor(), scenarios: [] })).toBeNull()
    expect(
      normalizeSet({ ...setFor(), scenarios: [{ candidate: candidateFor('balanced') }] }),
    ).toBeNull()
  })

  it('carries a preview set through as a preview, never as a final one', () => {
    const normalized = normalizeSet(setFor())
    expect(normalized?.scenarios.length).toBe(4)
  })

  // the message must not name the export: once the export exists and only a stale bundle is at
  // fault, naming it makes the message a lie
  it("says the engine didn't load and names the likeliest cause, without blaming the export", () => {
    expect(DESIGN_UNAVAILABLE).toContain("didn't load")
    expect(DESIGN_UNAVAILABLE).toContain('rebuild')
    expect(DESIGN_UNAVAILABLE).not.toContain("doesn't export")
    expect(DESIGN_UNAVAILABLE).toContain('Everything you have answered is kept')
  })
})

/**
 * The results step offers "Show me the figures", and `experience` is an answer that the search doesn't
 * read: it appears nowhere in `src/recommend` and decides only whether figures are printed
 * beside the plain sentences. If `answerOnboarding` dropped a finished search whenever ANY answer
 * moved, that press would throw the results away.
 *
 * So a visitor who had waited through five annual bakes, reached the layouts, and asked to see
 * the numbers behind them got "Show me some layouts" back on a screen that had just been
 * showing the answers. `EXPERIENCE_OPTIONS` calls that control "a thing you can try,
 * never a thing you have to predict". This is what makes that true
 */
describe('a finished layout search survives an answer the search never reads', () => {
  const searched = (): void => {
    resetAppStore()
    useAppStore.setState({
      onboarding: {
        ...getAppState().onboarding,
        designs: ready(normalizeSet(setFor()) as never),
      },
    })
  }

  it('keeps the layouts when only the level of detail changes', () => {
    searched()
    expect(getAppState().onboarding.designs.status).toBe('ready')
    getAppState().answerOnboarding({ experience: 'experienced' })
    expect(getAppState().onboarding.designs.status).toBe('ready')
    getAppState().answerOnboarding({ experience: 'novice' })
    expect(getAppState().onboarding.designs.status).toBe('ready')
  })

  it('still drops them when an answer the search does read moves', () => {
    for (const patch of [
      { objective: { food: 1, energy: 0, water: 0, simplicity: 0 } },
      { ambition: 'leafy-and-herbs' as const },
      { exposure: 'partly-sheltered' as const },
      { mounting: 'ground-rows' as const },
      { maxHeightM: meters(2.4) },
      { irrigationAvailable: false },
    ]) {
      searched()
      getAppState().answerOnboarding(patch)
      expect(getAppState().onboarding.designs.status, JSON.stringify(patch)).toBe('idle')
    }
  })

  /** Every field of the answers is classified, so a new one can't be forgotten in silence */
  it("classifies every answer as one the search reads or one it doesn't", () => {
    const every = Object.keys(DEFAULT_WIZARD_ANSWERS) as (keyof WizardAnswers)[]
    const displayOnly = every.filter((field) => !SEARCH_ANSWER_FIELDS.includes(field))
    expect(displayOnly).toEqual(['experience'])
  })
})
