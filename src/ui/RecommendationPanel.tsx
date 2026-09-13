import type { ReactElement } from 'react'
import { isNativeIn } from '../data/catalog/native-ranges'
import { EMPTY_LIST, type WildlifeChoices } from '../state/slices'
import { useAppStore } from '../state/store'
import type { ScorableCompanionRule } from '../types/companion'
import type { Crop } from '../types/crop'
import type { Bed } from '../types/garden'
import type { CropRecommendation } from '../types/recommend'
import { Action, Toggle } from './controls'
import { CropPicture } from './CropSprite'
import { DliEvidenceLink, DliEvidenceNote } from './DliEvidence'
import { dliThresholdKind, useDliEvidence, type DliEvidenceLookup } from './dli'
import { EvidenceBadge } from './EvidenceBadge'
import {
  bedName,
  cropName,
  cropTieNote,
  dependenceNote,
  explainLimitingFactor,
  forageNote,
  formatBandPercent,
  formatDli,
  limitingFactorOf,
  nativeNote,
  rankedHiddenNote,
  tiedLeadingCropCount,
  verdictLabel,
  weakestScoreTerm,
} from './format'
import type { Experience } from './onboarding'
import { AsyncNotice } from './Panel'
import { joinWords } from './polyculture'
import { YieldBand } from './YieldBand'

/**
 * How many crops a bed's ranking shows before it's asked to show the rest.
 *
 * Rendering every crop the run scored would put tens of thousands of pixels of ranking between the
 * top of this step and the panel underneath it that actually plants anything, and every step below
 * it in the sidebar would sit below that. The order is the product here and the order is dependable
 * at the top, so the top is what a bed shows. The rest is one press away and never further.
 *
 * The same number as the bed picker's `PICKER_LIMIT`, and deliberately so: these are two views of
 * one ranking and a grower who counts twelve in one and twelve in the other is reading the same
 * list twice
 */
export const RANKED_LIMIT = 12

const SupportingRule = ({ rule }: { readonly rule: ScorableCompanionRule }): ReactElement => (
  <li data-testid={`item-companion-rule-${rule.id}`}>
    <EvidenceBadge grade={rule.grade} testId={`badge-companion-${rule.id}`} /> {rule.subjectRef} +{' '}
    {rule.objectRef}: {rule.mechanism} ({rule.effectMetric} {formatBandPercent(rule.effect)},{' '}
    {rule.studyCount} studies)
  </li>
)

/**
 * Why this row sits where it does, once a wildlife question has been asked. Nothing at all when
 * neither was: a list nobody asked a question of must not grow a line per crop answering one.
 *
 * The two pollinator sentences are never joined. They come from two traits that disagree often
 * enough to matter (a runner bean feeds visitors and barely needs them, while a courgette under a
 * cloche needs them and there are none), and one sentence would have to average that into
 * something neither trait says
 */
const WildlifeNotes = ({
  item,
  crop,
  wildlife,
  botanicalArea,
}: {
  readonly item: CropRecommendation
  readonly crop: Crop | undefined
  readonly wildlife: WildlifeChoices
  readonly botanicalArea: string | null
}): ReactElement | null => {
  // an empty list is still a list to a screen reader, and the pollinator half has nothing to
  // say until the catalog has loaded the crop it reads the traits off
  const saysAnything = wildlife.favorNative || (wildlife.favorPollinators && crop !== undefined)
  if (!saysAnything) return null
  return (
    <ul className="list rec-wildlife" data-testid={`list-wildlife-${item.cropId}`}>
      {wildlife.favorNative ? (
        <li data-testid={`readout-native-${item.cropId}`}>
          {nativeNote(isNativeIn(item.cropId, botanicalArea))}
        </li>
      ) : null}
      {wildlife.favorPollinators && crop !== undefined ? (
        <>
          <li data-testid={`readout-forage-${item.cropId}`}>
            {forageNote(crop.wildlife.forage.value)}
          </li>
          <li data-testid={`readout-dependence-${item.cropId}`}>
            {dependenceNote(crop.wildlife.dependence.value)}
          </li>
        </>
      ) : null}
    </ul>
  )
}

const Row = ({
  item,
  catalog,
  evidenceFor,
  experience,
  wildlife,
  botanicalArea,
  bed,
  onPlace,
}: {
  readonly item: CropRecommendation
  readonly catalog: readonly Crop[]
  readonly evidenceFor: DliEvidenceLookup
  readonly experience: Experience
  readonly wildlife: WildlifeChoices
  readonly botanicalArea: string | null
  /** The bed this ranking is FOR, named on the press and read by the root-depth sentence */
  readonly bed: Bed | undefined
  onPlace(): void
}): ReactElement => {
  const limiting = limitingFactorOf(item.outcome)
  const crop = catalog.find((entry) => entry.id === item.cropId)
  const threshold = limiting === null ? null : dliThresholdKind(limiting.cause)
  const evidence = threshold === null ? null : evidenceFor(String(item.cropId), threshold)
  return (
    // `data-crop` as well as the testid, which is the convention every other list of crops here
    // follows: a row that is about a crop says which one in an attribute rather than in its name
    <li
      className="rec-row"
      data-testid={`item-recommendation-${item.cropId}`}
      data-crop={item.cropId}
    >
      <div className="rec-head">
        {/* decorative, and the name is right beside it: see `CropGlyph`. It's what lets an eye
            run down a ranking and stop at the roots without reading every row */}
        {crop === undefined ? null : <CropPicture cropId={crop.id} dliClass={crop.dliClass} />}
        <strong>{cropName(catalog, item.cropId)}</strong>
        <span
          className={`badge badge-verdict-${item.outcome.verdict}`}
          data-testid={`badge-verdict-${item.cropId}`}
        >
          {verdictLabel(item.outcome)}
        </span>
      </div>
      {/* only a row something holds back says why. The rows nothing rules out would all carry
          "Nothing rules it out. Weakest part of the match: ...", which on a tied head of twenty
          reads as one sentence twenty times, so it's said once above the list */}
      {limiting === null ? null : (
        <p className="rec-limiting" data-testid={`readout-limiting-${item.cropId}`}>
          Why: {explainLimitingFactor(limiting, experience, catalog, crop, bed)}
        </p>
      )}
      {/*
        The evidence, one press away, and this is the same trade the scenario cards make. Measured
        unfolded on the shipped example, a row is 501px at the median (the yield band's median is
        348 and the companion rules' 224), and the whole ranking comes to 23,671px of a 27,279px
        column. What is left standing above is what a decision is actually made on: which crop,
        whether it's recommended, why not, and the press that plants it. Everything folded is
        the apparatus behind that answer.

        Folded and kept: a yield figure with no band and no attribution is the one thing this
        product won't print, so the band goes on rendering and `expandAll` in the e2e suite
        opens every one of these. `<details>` keeps its content in the DOM, so the invariant that
        walks every band still walks them
      */}
      <details className="wizard-advanced" data-testid={`details-recommendation-${item.cropId}`}>
        <summary data-testid={`action-recommendation-detail-${item.cropId}`}>
          What this is based on
        </summary>
        {evidence === null ? null : (
          <DliEvidenceNote
            evidence={evidence}
            subjectId={String(item.cropId)}
            prefix="recommendation"
          />
        )}
        <p className="rec-light" data-testid={`readout-season-light-${item.cropId}`}>
          Season mean daily light integral (DLI) {formatDli(item.light.meanDliMolM2Day)}. Relative
          shade ratio (RSR) {Math.round(item.light.cumulativeRsr * 100)}%: the share of full-sun
          light the panels block over the season
        </p>
        <WildlifeNotes item={item} crop={crop} wildlife={wildlife} botanicalArea={botanicalArea} />
        {item.outcome.verdict !== 'excluded' ? (
          <YieldBand estimate={item.outcome.estimate} />
        ) : null}
        {item.supportingRules.length > 0 ? (
          <ul className="list" data-testid={`list-companion-${item.cropId}`}>
            {item.supportingRules.map((rule) => (
              <SupportingRule key={rule.id} rule={rule} />
            ))}
          </ul>
        ) : null}
      </details>
      {/*
        Something to DO with a recommendation. This list ranks every crop for every bed and says why
        for each one, and without a press a grower who found what they wanted here would have to go
        and find it again in the picker above. Excluded crops carry no press, because the row above
        has just said what rules them out.

        It goes through `carry` and `dropOnBed`, which is the same pair the drag from the picker
        uses, so a crop staged from here and a crop dropped on a bed in the 3D arrive as the same
        draft and are added by the same button. `dropOnBed` also selects the bed and moves to the
        step where the staged choice is visible, which is exactly what this press wants
      */}
      {item.outcome.verdict === 'excluded' ? null : (
        <Action testId={`action-recommendation-place-${item.cropId}`} onClick={onPlace}>
          Put this in {bed?.label ?? 'this bed'}
        </Action>
      )}
    </li>
  )
}

const AUTO_RUN_STATE: Readonly<Record<string, string>> = {
  queued: 'Edit detected, ranking shortly',
  running: 'Ranking crops...',
  ready: 'Ranking is current with the design',
  error: 'Ranking failed, the last message is below',
  // the phase, and only the phase. WHICH prerequisite is missing is the plants step's own
  // requirement notice, above this fold, so the specific thing is never said twice
  blocked: 'Nothing has been ranked yet',
  off: 'Automatic ranking is off',
}

/**
 * What the tied head of a ranking has in common, said once above it.
 *
 * Every crop in the leading run is recommended with nothing against it, so the only thing left
 * to say about any of them is which part of the match scored lowest, and that is one sentence
 * for the run rather than one per row
 */
const tiedHeadNote = (ranked: readonly CropRecommendation[], tiedCount: number): string => {
  const weakest = [
    ...new Set(ranked.slice(0, tiedCount).map((item) => weakestScoreTerm(item.outcome))),
  ]
  return `Nothing rules the top ${String(tiedCount)} out. Weakest part of the match: ${joinWords(weakest)}`
}

/**
 * Every crop ranked for every bed, and why, inside the plants step's "Every crop ranked, and why"
 * fold. The wildlife switches are beside the chips they change, and the catalog and the evidence
 * load by themselves
 */
export const RankingSection = (): ReactElement => {
  const sets = useAppStore((s) => s.sets)
  const catalog = useAppStore((s) => s.catalog)
  const plot = useAppStore((s) => s.plot)
  const companionRules = useAppStore((s) => s.companionRules)
  const autoRun = useAppStore((s) => s.autoRun)
  const autoRunQueued = useAppStore((s) => s.autoRunQueued)
  const ranking = useAppStore((s) => s.ranking)
  const recommend = useAppStore((s) => s.recommend)
  const cancelRecommend = useAppStore((s) => s.cancelRecommend)
  const setAutoRun = useAppStore((s) => s.setAutoRun)
  const experience = useAppStore((s) => s.answers.experience)
  const wildlife = useAppStore((s) => s.wildlife)
  // off the resolved site and nowhere else: the region a garden sits in is a fact about the
  // place, so before there's a site there is no region and the native answer is "not known"
  const botanicalArea = useAppStore((s) =>
    s.site.status === 'ready' ? s.site.value.botanicalArea : null,
  )
  const evidenceFor = useDliEvidence()
  // in the store, and the same flag the planting picker's own box reads: these are two views of one
  // ranking, so they agree about how much of it is on screen, and the answer outlives a closed step
  const showAll = useAppStore((s) => s.showAllCrops)
  const setShowAll = useAppStore((s) => s.setShowAllCrops)
  const carry = useAppStore((s) => s.carry)
  const dropOnBed = useAppStore((s) => s.dropOnBed)

  // the longest ranking in the plot, so the switch offers one number for the whole list and
  // offers itself at all only when some bed actually has more than it is showing
  const longestRanking =
    sets.status === 'ready'
      ? sets.value.reduce((longest, set) => Math.max(longest, set.ranked.length), 0)
      : 0

  const crops = catalog.status === 'ready' ? catalog.value : EMPTY_LIST
  const beds: readonly Bed[] = plot?.beds ?? EMPTY_LIST
  const experimental = companionRules.status === 'ready' ? companionRules.value.experimental : []
  const phase = !autoRun
    ? 'off'
    : sets.status === 'loading' || ranking
      ? 'running'
      : autoRunQueued
        ? 'queued'
        : sets.status === 'error'
          ? 'error'
          : sets.status === 'ready'
            ? 'ready'
            : 'blocked'

  return (
    <>
      <p className="panel-sub">
        The order these crops are in is dependable. The light numbers beside them are rough
        estimates, so treat them as a guide
      </p>
      <Toggle
        testId="control-recommendation-autorun"
        label="Re-rank automatically whenever the design changes"
        checked={autoRun}
        onChange={setAutoRun}
      />
      {/* `status-autorun` reports the phase, because that is what it's for and what reads it */}
      <p
        className={`notice notice-${phase === 'error' ? 'error' : phase === 'ready' ? 'ready' : 'idle'}`}
        data-testid="status-autorun"
        data-state={phase}
      >
        {AUTO_RUN_STATE[phase]}
      </p>
      <DliEvidenceLink />
      {phase === 'running' || phase === 'queued' ? (
        <progress data-testid="readout-recommendation-progress" />
      ) : null}
      <div className="row">
        <Action testId="action-recommendation-rerun" onClick={() => void recommend()}>
          Rank them again now
        </Action>
        <Action
          testId="action-recommendation-cancel"
          disabled={sets.status !== 'loading' && !ranking && !autoRunQueued}
          onClick={cancelRecommend}
        >
          Cancel
        </Action>
      </div>
      <AsyncNotice state={catalog} testId="status-catalog" idleLabel="Crop list not loaded" />
      <AsyncNotice state={sets} testId="status-recommendation" idleLabel="No ranking yet" />
      {/*
        One switch above every bed rather than one inside each: the question is "how much of the
        ranking do you want to read", which is asked of the list as a whole, and a plot of
        four beds carrying four of these would ask it four times and let them disagree
      */}
      {sets.status === 'ready' && longestRanking > RANKED_LIMIT ? (
        <Toggle
          testId="control-recommendation-all"
          label={`Show all ${String(longestRanking)} crops`}
          checked={showAll}
          onChange={setShowAll}
        />
      ) : null}
      {sets.status === 'ready'
        ? sets.value.map((set) => {
            const tiedCount = tiedLeadingCropCount(set.ranked)
            const shown = showAll ? set.ranked : set.ranked.slice(0, RANKED_LIMIT)
            const hidden = set.ranked.length - shown.length
            const bed = beds.find((entry) => entry.id === set.bedId)
            return (
              <div key={set.bedId} data-testid={`item-recommendation-set-${set.bedId}`}>
                <h4>{bedName(beds, set.bedId)}</h4>
                {/* every crop in the leading run reads "Recommended" with nothing against it, so
                    a beginner has no way to tell "these are genuinely equal, pick what you like
                    to eat" from "this one is better" without this: see `tiedLeadingCropCount` */}
                {tiedCount === 0 ? null : (
                  <>
                    <p
                      className="notice notice-warn"
                      data-testid={`readout-recommendation-tied-${set.bedId}`}
                      data-tied={tiedCount}
                    >
                      {cropTieNote(tiedCount)}
                    </p>
                    <p
                      className="rec-limiting"
                      data-testid={`readout-recommendation-head-${set.bedId}`}
                    >
                      {tiedHeadNote(set.ranked, tiedCount)}
                    </p>
                  </>
                )}
                <ul className="list">
                  {shown.map((item) => (
                    <Row
                      key={`${item.bedId}-${item.cropId}`}
                      item={item}
                      catalog={crops}
                      evidenceFor={evidenceFor}
                      experience={experience}
                      wildlife={wildlife}
                      botanicalArea={botanicalArea}
                      bed={bed}
                      onPlace={() => {
                        carry(item.cropId)
                        dropOnBed(set.bedId)
                      }}
                    />
                  ))}
                </ul>
                {/* the count is said out loud rather than implied by a switch above, because a
                    list that silently stops is a list that has been read to the end */}
                {hidden === 0 ? null : (
                  <p
                    className="panel-sub"
                    data-testid={`readout-recommendation-hidden-${set.bedId}`}
                    data-hidden={hidden}
                  >
                    {rankedHiddenNote(hidden)}
                  </p>
                )}
              </div>
            )
          })
        : null}
      {experimental.length > 0 ? (
        <details className="experimental" data-testid="panel-experimental-rules">
          <summary>
            Experimental (grade C), shown for information with no effect on the ranking
          </summary>
          <ul className="list">
            {experimental.map((rule) => (
              <li key={rule.id} data-testid={`item-experimental-rule-${rule.id}`}>
                {rule.subjectRef} + {rule.objectRef}: {rule.mechanism}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}
