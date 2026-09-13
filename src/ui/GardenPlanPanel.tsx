import type { ReactElement } from 'react'
import { OBJECTIVE_KEYS, OBJECTIVE_PRESETS, presetMatching } from '../state/onboarding'
import { bedLightSummary } from '../state/bed-light'
import { growingWindowOf } from '../state/growing-window'
import type { GeneratedBed } from '../state/slices'
import { useAppStore } from '../state/store'
import type { Crop } from '../types/crop'
import type { BedId, CropId } from '../types/ids'
import type { BedLight } from '../types/light'
import { ARCHETYPE_LABEL } from '../recommend/design'
import type { BedLightSummary, CandidateArchetype, DesignObjective } from '../types/onboarding'
import { Action, type ChoiceOption } from './controls'
import { cropName, formatDli } from './format'
import { Readout } from './Panel'
import {
  AMBITION_OPTIONS,
  EXPOSURE_OPTIONS,
  OBJECTIVE_LABELS,
  QUALITY_HELP,
  QUALITY_LABEL,
  showsFigures,
} from './onboarding'

const ZONE_LABEL: Readonly<Record<GeneratedBed['zone'], string>> = {
  'bright-gap': 'Sunny bed',
  'shaded-band': 'Shaded bed',
  'even-light': 'Even light',
}

/** `GeneratedBed` keys its id as `bedId`, not `id`, so it gets its own lookup rather than
    forcing `bedName` in `format.ts` to know about a second bed shape */
const generatedBedLabel = (beds: readonly GeneratedBed[], id: BedId): string =>
  beds.find((entry) => entry.bedId === id)?.label ?? (id as string)

/**
 * The badge's words for `generated.archetype`, whose value is an internal slug
 * (`vertical-east-west`, `no-array-control`) that a visitor wouldn't recognize.
 *
 * Read from the same table the scenario cards are labeled from. Deriving it instead from
 * whichever scenario in `onboarding.designs` still matches would have read the right words most
 * of the time and the wrong ones exactly when it matters: `designs` isn't persisted, so it
 * comes back empty on every reload, and a returning visitor is the one person looking at this
 * panel to find out what they had built. Null is a plot planted as it stood, with no layout
 */
const archetypeLabel = (archetype: CandidateArchetype | null): string =>
  archetype === null ? 'Planted bed by bed' : ARCHETYPE_LABEL[archetype]

const NAMED = 3

/**
 * The before-and-after a generated garden never had. Every bed said what it got; none said what
 * standing there rather than in the brightest bed of the same plot cost it, which is the whole
 * reason one bed gets ramps and another two meters away gets pole beans
 */
/**
 * The other half, and a different question. A bed's note compares it with the brightest bed of
 * the same plot, which is the one a grower can walk over and look at. This compares the whole
 * plot with the open sky it would have had with nothing built on it, which no bed can see from
 * where it stands and only the wizard's control bake knows
 */
const plotCostNote = (catalog: readonly Crop[], lost: readonly CropId[]): string => {
  const named = lost.slice(0, NAMED).map((id) => cropName(catalog, id))
  const rest = lost.length - named.length
  return `Panels on this plot cost it ${String(lost.length)} plant${lost.length === 1 ? '' : 's'} it could have grown under open sky: ${named.join(', ')}${rest > 0 ? ` and ${String(rest)} more` : ''}`
}

const shadeCostNote = (
  catalog: readonly Crop[],
  lost: readonly CropId[],
  zone: GeneratedBed['zone'],
): string => {
  if (lost.length === 0) {
    return zone === 'even-light'
      ? 'Nothing stands over this plot, so this bed gets the same light as every other one'
      : 'This is the brightest bed here, so no plant drops out of it'
  }
  const named = lost.slice(0, NAMED).map((id) => cropName(catalog, id))
  const rest = lost.length - named.length
  return `Compared with the brightest bed, this one costs ${String(lost.length)} plant${lost.length === 1 ? '' : 's'} it could otherwise carry: ${named.join(', ')}${rest > 0 ? ` and ${String(rest)} more` : ''}`
}

/**
 * The word an answer was offered under, from the list it was offered from, so the summary below
 * and the question a grower would go back to are reading the same table
 */
const labelOf = <T extends string>(options: readonly ChoiceOption<T>[], value: T): string =>
  options.find((option) => option.value === value)?.label ?? value

const objectiveName = (objective: DesignObjective): string =>
  OBJECTIVE_PRESETS.find((preset) => preset.id === presetMatching(objective))?.label ??
  'A mix you set yourself'

/** Only for a mix that matches none of the presets, where a name alone would say nothing */
const objectiveMix = (objective: DesignObjective): string =>
  OBJECTIVE_KEYS.map(
    (key) => `${OBJECTIVE_LABELS[key] ?? key} ${String(Math.round(objective[key] * 100))}%`,
  ).join(', ')

/**
 * Three answers, read out.
 *
 * `objective`, `ambition` and `exposure` are what the design search was RUN with: they rank
 * candidate layouts and they reach the garden only through the layout that won. Putting editable
 * copies of them here would make two homes for one idea, and the moment a grower moved one of
 * them the beds on screen would be the answer to a question that no longer appears anywhere,
 * which is worse than not offering the control at all. So this names them in the words they were
 * chosen in and hands back the one place that can change them: the wants step, which
 * holds every answer
 */
const OptimizedFor = (): ReactElement => {
  const answers = useAppStore((s) => s.answers)
  const setSidebarStep = useAppStore((s) => s.setSidebarStep)
  const named = presetMatching(answers.objective) !== null

  return (
    <>
      <h4 className="scenario-title">What this layout was optimized for</h4>
      <div className="readouts">
        <Readout
          id="plan-objective"
          label="What you asked for most"
          value={objectiveName(answers.objective)}
        />
        <Readout
          id="plan-ambition"
          label="What you want to grow"
          value={labelOf(AMBITION_OPTIONS, answers.ambition)}
        />
        <Readout
          id="plan-exposure"
          label="What already stands around it"
          value={labelOf(EXPOSURE_OPTIONS, answers.exposure)}
        />
      </div>
      {named ? null : (
        <p data-testid="readout-plan-objective-mix">
          The mix you set yourself: {objectiveMix(answers.objective)}
        </p>
      )}
      <p data-testid="readout-plan-answers-help">
        These three answers ranked the layouts, and they can't be edited here. Changing one runs the
        search again on the new answer. The wants step still holds every answer you gave.
      </p>
      <Action testId="action-plan-revisit" onClick={() => setSidebarStep('wants')}>
        Change what this was optimized for
      </Action>
    </>
  )
}

/**
 * What the last run put where, folded under the plants step as "What the layout search decided".
 *
 * A generated garden that can't be read is a garden the grower has to trust blind, so this isn't
 * a summary of a number: it names every bed, the light it was placed in, why it was placed
 * there, what went into it and everything that was refused. The press that puts the plot back
 * sits under the bed cards above this fold, beside the press that plants them again. Nothing at
 * all until something has been generated
 */
export const GardenPlanPanel = (): ReactElement | null => {
  const generated = useAppStore((s) => s.generated)
  const catalog = useAppStore((s) => s.catalog)
  const experience = useAppStore((s) => s.answers.experience)
  /**
   * What is in each bed NOW, off the plot, because the generation's own list is a snapshot of
   * the moment it planted. "Try another mix" replaces what is in a bed, and the snapshot
   * went on showing the old crops here, which reads as a mix that never took
   */
  const plotBeds = useAppStore((s) => s.plot?.beds ?? null)
  /*
    And the light each bed gets NOW, for the same reason. The three figures under a bed were the
    layout search's snapshot, and a researcher who put five rows over a bed and re-ran the full
    check read the same "Daylight lost to shade 1%" and concluded bed light didn't respond to
    the array. `bedLight` is what every run rewrites. The snapshot stands in only for a bed the
    last run didn't cover
  */
  const bedLight = useAppStore((s) => s.bedLight)
  const window = useAppStore(growingWindowOf)
  const rasterReady = useAppStore((s) => s.raster.status === 'ready')

  if (generated === null) return null
  const crops = catalog.status === 'ready' ? catalog.value : []
  const figures = showsFigures(experience)
  const cropsIn = (bedId: BedId, fallback: readonly CropId[]): readonly CropId[] =>
    plotBeds?.find((bed) => bed.id === bedId)?.plantings.map((planting) => planting.cropId) ??
    fallback
  const plantingCount = generated.beds.reduce(
    (total, bed) => total + cropsIn(bed.bedId, bed.cropIds).length,
    0,
  )
  const lightNow = (bed: GeneratedBed): BedLight | undefined =>
    bedLight.find((entry) => entry.bedId === bed.bedId)
  const summaryNow = (bed: GeneratedBed): BedLightSummary => {
    const light = lightNow(bed)
    return light === undefined ? bed.summary : bedLightSummary(light, window)
  }
  const lightSource = (bed: GeneratedBed): string =>
    lightNow(bed) === undefined
      ? "Light as the layout search measured it, the last light run didn't cover this bed"
      : rasterReady
        ? 'Light from the light check; it moves when the panels or the beds do'
        : "Light from the layout search's quick run; the full check on the light step refines it"

  return (
    <details className="wizard-advanced" data-testid="details-plants-plan">
      <summary>
        {generated.archetype === null
          ? 'What the last planting put where'
          : 'What the layout search put where'}
      </summary>
      <div className="suggestion-head">
        <span
          className="badge"
          data-testid="badge-plan-archetype"
          data-archetype={generated.archetype ?? 'none'}
        >
          {archetypeLabel(generated.archetype)}
        </span>
        <span className="panel-sub">
          {String(generated.beds.length)} {generated.beds.length === 1 ? 'bed' : 'beds'} and{' '}
          {String(plantingCount)} {plantingCount === 1 ? 'planting' : 'plantings'}, placed by their
          light and planted from the same ranking this step uses
        </span>
      </div>
      <p
        className={`notice ${generated.evaluatedAt === 'final' ? 'notice-ready' : 'notice-warn'}`}
        data-testid="status-plan-quality"
        data-quality={generated.evaluatedAt}
      >
        {QUALITY_LABEL[generated.evaluatedAt]}: {QUALITY_HELP[generated.evaluatedAt]}
      </p>

      <div className="readouts">
        <Readout id="plan-beds" label="Beds placed" value={String(generated.beds.length)} />
        <Readout id="plan-plantings" label="Plantings" value={String(plantingCount)} />
      </div>

      <p data-testid="readout-plan-explanation">{generated.explanation}</p>

      {/* what the panels cost the whole plot, which no bed can see from where it stands */}
      {generated.plotLostToShade.length === 0 ? null : (
        <p data-testid="readout-plan-plot-cost" data-lost={generated.plotLostToShade.length}>
          {plotCostNote(crops, generated.plotLostToShade)}
        </p>
      )}

      <OptimizedFor />

      <ul className="list" data-testid="list-plan-beds">
        {generated.beds.map((bed) => (
          <li
            key={bed.bedId}
            className="scenario"
            data-testid={`item-plan-bed-${bed.bedId}`}
            data-zone={bed.zone}
            data-crops={String(cropsIn(bed.bedId, bed.cropIds).length)}
          >
            <div className="scenario-head">
              <h4 className="scenario-title">{bed.label}</h4>
              <span className="badge" data-testid={`badge-plan-zone-${bed.bedId}`}>
                {ZONE_LABEL[bed.zone]}
              </span>
            </div>
            <p className="scenario-light">{bed.reason}</p>
            <p
              className="scenario-light"
              data-testid={`readout-plan-shade-cost-${bed.bedId}`}
              data-lost={bed.lostToShade.length}
            >
              {shadeCostNote(crops, bed.lostToShade, bed.zone)}
            </p>
            {figures ? (
              <>
                <div className="readouts">
                  <Readout
                    id={`plan-dli-${bed.bedId}`}
                    label="Growing-season light"
                    value={formatDli(summaryNow(bed).meanGrowingSeasonDli)}
                  />
                  <Readout
                    id={`plan-worst-${bed.bedId}`}
                    label="Darkest spot in the bed"
                    value={formatDli(summaryNow(bed).worstCellGrowingSeasonDli)}
                  />
                  <Readout
                    id={`plan-shade-${bed.bedId}`}
                    label="Daylight lost to shade"
                    value={`${String(Math.round(summaryNow(bed).shadeRatio * 100))}%`}
                  />
                </div>
                <p className="panel-sub" data-testid={`readout-plan-light-source-${bed.bedId}`}>
                  {lightSource(bed)}
                </p>
              </>
            ) : null}
            {cropsIn(bed.bedId, bed.cropIds).length === 0 ? (
              <p className="notice notice-warn" data-testid={`status-plan-empty-${bed.bedId}`}>
                Nothing is planted in this bed. The reasons are listed below
              </p>
            ) : (
              <ul className="scenario-flags" data-testid={`list-plan-crops-${bed.bedId}`}>
                {cropsIn(bed.bedId, bed.cropIds).map((cropId) => (
                  <li
                    key={cropId}
                    data-testid={`item-plan-crop-${bed.bedId}-${cropId}`}
                    data-crop={cropId}
                  >
                    {cropName(crops, cropId)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {generated.layoutRefusals.length === 0 && generated.plantRefusals.length === 0 ? null : (
        <>
          <h4 className="scenario-title">What was refused</h4>
          <ul className="scenario-flags" data-testid="list-plan-refusals">
            {generated.layoutRefusals.map((refusal, index) => (
              <li key={refusal} data-testid={`item-plan-layout-refusal-${String(index)}`}>
                {refusal}
              </li>
            ))}
            {generated.plantRefusals.map((refusal) => (
              <li
                key={`${refusal.bedId as string}:${refusal.cropId as string}`}
                data-testid={`item-plan-refusal-${refusal.cropId}`}
                data-crop={refusal.cropId}
              >
                <strong>{cropName(crops, refusal.cropId)}</strong> in{' '}
                {generatedBedLabel(generated.beds, refusal.bedId)}: {refusal.reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  )
}
