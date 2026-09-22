import type { ReactElement, ReactNode } from 'react'
import { cropName } from '../data/crops'
import { OBJECTIVE_PRESETS, plotSizeOf, presetMatching } from '../state/onboarding'
import { EMPTY_LIST, type AppState, type SidebarStep } from '../state/slices'
import type { CropId } from '../types/ids'
import { useAppStore } from '../state/store'
import { AgendaPanel } from './AgendaPanel'
import { AttributionPanel } from './AttributionPanel'
import { GroundPanel } from './BedPanel'
import { CalendarPanel } from './CalendarPanel'
import { CompliancePanel } from './CompliancePanel'
import { DliEvidencePanel } from './DliEvidence'
import { BedLightPanel } from './BedLightPanel'
import { ErrorBoundary } from './ErrorBoundary'
import { FolklorePanel } from './FolklorePanel'
import { LayoutPanel } from './LayoutPanel'
import { plural } from './format'
import { AMBITION_OPTIONS } from './onboarding'
import { OverlayPanel } from './OverlayPanel'
import { PlantsPanel } from './PlantsPanel'
import { SimPanel } from './SimPanel'
import { SimulationPanel } from './SimulationPanel'
import { SitePanel } from './SitePanel'
import { SourcesPanel } from './SourcesPanel'
import { PrintPanel } from './PrintPlan'
import { StoragePanel } from './StoragePanel'
import { Stepper, type StepDefinition } from './Stepper'
import { TekCreditsPanel } from './TekCreditsPanel'
import { TimePanel } from './TimePanel'
import { WantsPanel } from './WantsPanel'
import { WaterPanel } from './WaterPanel'
import {
  bedsRequirement,
  firstUnmet,
  lightRequirement,
  rankingRequirement,
  requirementKey,
  siteRequirement,
  type Requirement,
} from './requirement'

const guarded = (label: string, testId: string, panel: ReactNode): ReactElement => (
  <ErrorBoundary key={testId} label={label} testId={testId}>
    {panel}
  </ErrorBoundary>
)

/**
 * The dependency chain, as a prefix. A step waits on everything before it and nothing after,
 * so each step names how far along the chain it needs to be. It never restates the whole of
 * it, and `firstUnmet` picks the one thing to say out of however many are missing
 */
const blocking = (s: AppState, depth: number): Requirement | null =>
  firstUnmet(
    [siteRequirement(s), bedsRequirement(s), lightRequirement(s), rankingRequirement(s)].slice(
      0,
      depth,
    ),
  )

/**
 * The steps, in the only order they can be answered in, with how far along the chain each one needs
 * the garden to be. A depth of 0 never waits: the place, the ground, what is wanted from it, the
 * panels that sit on it, and the reference shelf at the end. The first six titles are questions,
 * because those steps are where the questions are asked
 */
const STEP_LABELS: readonly (readonly [SidebarStep, string, number])[] = [
  ['place', 'Where is the garden?', 0],
  ['ground', 'How big is the space, and what shades it?', 0],
  ['wants', 'What do you want from it?', 0],
  ['panels', 'Where should the panels go?', 0],
  ['light', 'How much sun reaches the beds?', 2],
  ['plants', 'What goes in each bed?', 3],
  ['calendar', 'When to plant and harvest', 4],
  // the garden run forward: needs the light, and says for itself what else it is waiting on
  ['seasons', 'The garden over several seasons', 3],
  /**
   * Waits on nothing. Saving and forgetting a design are global, and a reset puts the site back to
   * idle, so a step that waited on a resolved site would lock when "forget this design" is pressed
   * and unmount the storage panel the press had just landed on. The three panels beside it each
   * already say for themselves what they are missing, which is the better place to say it
   */
  ['check', 'Checks and saving', 0],
  ['sources', 'Where the numbers come from', 0],
]

/** The first three crops of a bed by name, and a mark for the rest: "cucumber, bush bean, basil..." */
const SUMMARY_CROPS = 3
/** Beds named one by one in the closed summary; more than this and the crops are listed once */
const SUMMARY_BEDS = 3

/**
 * What each step has settled, for the line under its title when it is closed.
 *
 * Null while nothing is settled, with no hedge worded for it: "not yet" under nine titles is nine lines
 * of nothing, and the summary earns its place only by recording a decision that was actually
 * made
 */
const summaryOf = (s: AppState, id: SidebarStep): string | null => {
  const beds = s.plot?.beds ?? []
  switch (id) {
    case 'place':
      return s.site.status === 'ready' ? s.locationLabel : null
    case 'ground': {
      if (s.plot === null) return null
      const size = plotSizeOf(s.plot)
      return `${size.widthM.toFixed(1)} x ${size.depthM.toFixed(1)} m, ${plural(beds.length, 'bed', 'beds')}`
    }
    case 'panels': {
      // rows, not arrays: one array holds several rows, and "1 row of panels" over a picture of
      // three rows reads as the app contradicting itself
      const rows = (s.plot?.arrays ?? []).reduce(
        (total, array) => total + array.geometry.rowCount,
        0,
      )
      return rows === 0 ? 'No panels' : plural(rows, 'row of panels', 'rows of panels')
    }
    case 'wants': {
      const ambition = AMBITION_OPTIONS.find((option) => option.value === s.answers.ambition)
      const preset = OBJECTIVE_PRESETS.find(
        (entry) => entry.id === presetMatching(s.answers.objective),
      )
      return [ambition?.label ?? s.answers.ambition, preset?.label ?? 'A mix of your own'].join(
        ', ',
      )
    }
    case 'light':
      return s.raster.status === 'loading'
        ? 'Being computed...'
        : s.bedLight.length > 0
          ? 'Computed'
          : null
    case 'plants': {
      const catalog = s.catalog.status === 'ready' ? s.catalog.value : EMPTY_LIST
      const planted = beds.filter((bed) => bed.plantings.length > 0)
      if (planted.length === 0) return null
      /*
        Bed by bed up to three beds, and one line of distinct crops beyond that: a ten-bed layout
        listed bed by bed would run to six lines under a closed title, which is a paragraph where
        the column promises a summary
      */
      if (planted.length > SUMMARY_BEDS) {
        const distinct = [
          ...new Set(
            planted.flatMap((bed) => bed.plantings.map((planting) => planting.cropId as string)),
          ),
        ]
        const names = distinct
          .slice(0, SUMMARY_CROPS * 2)
          .map((id) => cropName(catalog, id as CropId))
          .join(', ')
        return `${plural(planted.length, 'bed planted', 'beds planted')}: ${names}${distinct.length > SUMMARY_CROPS * 2 ? '...' : ''}`
      }
      return planted
        .map((bed) => {
          const names = bed.plantings
            .slice(0, SUMMARY_CROPS)
            .map((planting) => cropName(catalog, planting.cropId))
            .join(', ')
          return `${bed.label}: ${names}${bed.plantings.length > SUMMARY_CROPS ? '...' : ''}`
        })
        .join(' · ')
    }
    case 'seasons':
      return s.simulation.season === 0
        ? null
        : plural(s.simulation.season, 'season run', 'seasons run')
    default:
      return null
  }
}

/**
 * The way back from the garden to the plan on a phone, and where it lands.
 *
 * Pinned across the top of the garden, which is the one fixed thing on that surface. It names
 * the step it returns to because a contextual press ("See it in the garden", "Draw bed") is what
 * brought the visitor here, and the tab bar alone does not say that the plan is where they were.
 * Hidden above the breakpoint by the stylesheet, where the plan is beside the garden. Beside the
 * labels it reads, outside `App`, so there is one list of what the steps are called
 */
export const GardenPlanStrip = (): ReactElement => {
  const step = useAppStore((s) => s.sidebarStep)
  const setSurface = useAppStore((s) => s.setSurface)
  const index = STEP_LABELS.findIndex(([id]) => id === step)
  const title = STEP_LABELS[index]?.[1] ?? ''
  return (
    <button
      type="button"
      className="garden-plan"
      data-testid="action-garden-plan"
      onClick={() => setSurface('edit')}
    >
      Back to the plan · Step {String(index + 1)}, {title}
    </button>
  )
}

export const Sidebar = (): ReactElement => {
  const folklore = useAppStore((s) => s.folklore)
  const step = useAppStore((s) => s.sidebarStep)
  const setSidebarStep = useAppStore((s) => s.setSidebarStep)
  const applied = useAppStore((s) => s.onboarding.appliedArchetype)
  /**
   * Everything the locks and the summaries read, flattened to one string.
   *
   * Subscribing to the store itself would have been shorter and would have re-rendered every
   * panel in the sidebar on every frame of a bake's progress, because a progress tick is a store
   * write like any other. This re-renders when one of the handful of statuses that can change a
   * lock changes, and at no other time; `getState` below is then read, not subscribed to, which
   * is safe precisely because this key is what decides when to look again
   */
  useAppStore((s) =>
    [
      // everything the locks read, from the one place that states it
      requirementKey(s),
      // and the rest of what the closed-step summaries print
      s.locationLabel,
      s.plot === null
        ? ''
        : `${String(plotSizeOf(s.plot).widthM)}x${String(plotSizeOf(s.plot).depthM)}`,
      (s.plot?.arrays ?? []).reduce((total, array) => total + array.geometry.rowCount, 0),
      (s.plot?.beds ?? []).map((bed) => bed.plantings.map((p) => p.cropId).join(',')).join(';'),
      s.catalog.status,
      s.raster.status,
      // the seasons step's own summary; without it "5 seasons run" would outlive a reset
      s.simulation.season,
      // and the wants step's, which is an answer. It is never a status
      s.answers.ambition,
      presetMatching(s.answers.objective),
    ].join('|'),
  )
  const state = useAppStore.getState()

  /**
   * Built on every render this component does, which is exactly as often as the key above
   * changes and no more. Memoising it would mean naming `state` as a dependency it deliberately
   * does not subscribe to, and arguing with two linters about it, to save nine small objects
   */
  const defined = STEP_LABELS.map(([id, label, depth]) => ({
    id,
    label,
    summary: summaryOf(state, id),
    requirement: depth === 0 ? null : blocking(state, depth),
  }))
  /**
   * The step to look at next: the one after the open one, locked or not. The first UNLOCKED step
   * after it would read as "Next: Checks and saving" on the panels step for the ten seconds the
   * weather takes to arrive, and jump four questions when pressed. A locked step opens on the
   * sentence that says what it is waiting for, which is the better place to land. The badge on a
   * closed header never sits on a padlock (`Stepper` checks)
   */
  const openIndex = defined.findIndex((entry) => entry.id === step)
  const nextId = openIndex === -1 ? null : (defined[openIndex + 1]?.id ?? null)
  const steps: readonly StepDefinition<SidebarStep>[] = defined.map((entry) => ({
    ...entry,
    next: entry.id === nextId,
    // the layout search and the card's apply press are the panels step's own primaries, and
    // "Find this place" is the place step's: one filled press on a screen
  }))

  /**
   * When a layout is applied, the open step's header lands at the top of the column.
   *
   * The key is the applied layout and nothing else. Keyed on the generation too, "Plant every bed
   * again" pressed halfway down the plants step would throw the column to the top, because that
   * press ends in a generation. Always a key, whether or not a layout was ever applied: the stepper
   * also lands when the app opens a step by some route other than its header ("Fix Bed 1" on the
   * seasons step, a plant clicked in the scene)
   */
  const landOn = applied ?? 'none'

  const panelsFor = (id: SidebarStep): ReactNode => {
    switch (id) {
      case 'place':
        return [guarded('Site', 'panel-site-failed', <SitePanel />)]
      case 'ground':
        // one panel: the size, what already shades the space, whether it can be watered, and the
        // beds behind a fold
        return [guarded('The ground', 'panel-bed-failed', <GroundPanel />)]
      case 'wants':
        return [guarded('What you want', 'panel-wants-failed', <WantsPanel />)]
      case 'panels':
        return [guarded('Where the panels go', 'panel-layout-failed', <LayoutPanel />)]
      case 'light':
        return [
          guarded('Light simulation', 'panel-simulation-failed', <SimPanel />),
          guarded('Light in each bed', 'panel-bed-light-failed', <BedLightPanel />),
          guarded('Light overlay', 'panel-overlay-failed', <OverlayPanel />),
          guarded('Sun and time', 'panel-time-failed', <TimePanel />),
        ]
      case 'plants':
        return [guarded('What goes in each bed', 'panel-plants-failed', <PlantsPanel />)]
      case 'calendar':
        return [
          // first on the step: what to do now outranks the whole year's timetable
          guarded('What to do next', 'panel-agenda-failed', <AgendaPanel />),
          guarded('Planting calendar', 'panel-calendar-failed', <CalendarPanel />),
        ]
      case 'seasons':
        return [guarded('Simulation', 'panel-seasons-failed', <SimulationPanel />)]
      case 'check':
        return [
          guarded('Water balance', 'panel-water-failed', <WaterPanel />),
          guarded('Rules this design has to meet', 'panel-compliance-failed', <CompliancePanel />),
          guarded('Saved design', 'panel-storage-failed', <StoragePanel />),
          guarded('Print this plan', 'panel-print-failed', <PrintPanel />),
        ]
      default:
        return [
          guarded('DLI evidence', 'panel-dli-evidence-failed', <DliEvidencePanel />),
          guarded('Sources', 'panel-sources-failed', <SourcesPanel />),
          guarded('TEK credits', 'panel-tek-credits-failed', <TekCreditsPanel />),
          guarded('Folklore', 'panel-folklore-failed', <FolklorePanel rules={folklore} />),
          guarded('Attribution', 'panel-attribution-failed', <AttributionPanel />),
        ]
    }
  }

  return (
    <aside className="sidebar" data-testid="panel-sidebar">
      <Stepper
        label="Designing your garden, in order"
        steps={steps}
        selected={step}
        landOn={landOn}
        onSelect={setSidebarStep}
        renderPanel={panelsFor}
      />
    </aside>
  )
}
