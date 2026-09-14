import { useEffect } from 'react'
import { lightIsStale } from '../state/light-freshness'
import type { AppState } from '../state/slices'
import { useAppStore } from '../state/store'
import { allMet, rankingChain } from './requirement'

export const AUTO_RUN_DELAY_MS = 600

/**
 * Prerequisites for a useful ranking: a resolved site, something to plant in, and a light field
 * for it. Stated once, in `requirement.ts`, and read from there by everything that cares: this
 * hook, to decide whether to run at all, and the panel, to say which one is missing and offer
 * the press that settles it.
 *
 * The light field is `bedLight`, which is what `recommend` actually reads. A ready raster is
 * only one of the two ways to get one. A guided apply carries the wizard's own
 * preview field across without ever baking the editor's raster, so testing the raster told a
 * grower looking at a fully planted garden that it was waiting on a light simulation, while the
 * ranking, the calendar and the shopping list beside it were all there.
 *
 * And not while the light is being computed or is stale. Without this hold, a guided apply would
 * cost three rankings: one against the search's preview light, one when the full bake starts and
 * one when it lands, with the middle one wasted and the list reordering under the reader on the
 * plants step. Holding here means one edit is bake, then rank, and a ready auto-run status means
 * ranked against the light on screen. `lightRequirement` itself stays on `bedLight`, so the plants
 * step never locks during a re-bake
 */
export const autoRunReady = (s: AppState): boolean =>
  allMet(rankingChain(s)) && s.raster.status !== 'loading' && !lightIsStale(s)

/** Every input the ranking reads, flattened so an edit debounces one run instead of thrashing */
export const autoRunKey = (s: AppState): string =>
  [
    s.site.status === 'ready' ? s.site.value.id : 'no-site',
    // the arrangement the light was computed for, so a bake landing is one change and the
    // status transitions on the way to it are none. `carried` is a guided apply's preview light,
    // which stamps no geometry
    s.lightGeometry ?? 'carried',
    s.bedLight.length,
    s.frostPercentile,
    s.catalog.status,
    s.companionRules.status,
    // a require or prefer entry feeds the ranking's own preferred list, so it's an edit
    s.preferences.entries.map((entry) => `${entry.cropId as string}:${entry.kind}`).join(','),
    // and so are the wildlife switches, which reach the same preference term. Left out, ticking
    // one wrote the store, changed nothing this key can see, and the panel went on showing the
    // ranking it had: the toggle would have looked broken rather than slow
    s.wildlife.favorNative,
    s.wildlife.favorPollinators,
    // the surroundings answer dims every bed's light before the ranking reads it, and the store
    // re-reads the beds off the raster when the answer moves, so the ranking has to follow
    s.answers.exposure,
    /*
      The rooting depth is in here for the same reason the wildlife switches are: `stages/space.ts`
      excludes a crop whose roots want more than `soil.effectiveDepthM + raisedHeightM`, and the
      plants step offers a press that raises the bed to fit. Left out, that press writes the store,
      changes nothing this key can see, and the crop keeps its EXCLUDED badge while the remedy
      sentence goes on to offer a raise of minus ten centimeters
    */
    (s.plot?.beds ?? [])
      .map(
        (bed) =>
          `${bed.id}:${bed.areaM2.toFixed(2)}:${bed.soil.phUnits}:${bed.plantings.length}:${(bed.soil.effectiveDepthM + bed.raisedHeightM).toFixed(2)}`,
      )
      .join(','),
  ].join('|')

export const useAutoRecommend = (): void => {
  const enabled = useAppStore((s) => s.autoRun)
  const eligible = useAppStore(autoRunReady)
  const key = useAppStore(autoRunKey)
  const needsCatalog = useAppStore((s) => s.catalog.status === 'idle')
  const needsEvidence = useAppStore((s) => s.companionRules.status === 'idle')
  const needsSite = useAppStore((s) => s.site.status === 'idle')
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const loadEvidence = useAppStore((s) => s.loadEvidence)
  const ensureSite = useAppStore((s) => s.ensureSite)
  const recommend = useAppStore((s) => s.recommend)
  const setAutoRunQueued = useAppStore((s) => s.setAutoRunQueued)

  /**
   * The standing data every surface reads, fetched once rather than waited for.
   *
   * The site is fetched here with the catalog and the evidence because it's the same kind of
   * thing: `ensureSite` looks up the place the toolbar is already naming, which is what stops a
   * visitor arriving at seven panels that say "resolve a site" about a town the app has been
   * showing them since the first frame
   */
  useEffect(() => {
    if (!enabled) return
    if (needsCatalog) void loadCatalog()
    if (needsEvidence) void loadEvidence()
    if (needsSite) void ensureSite()
  }, [enabled, needsCatalog, needsEvidence, needsSite, loadCatalog, loadEvidence, ensureSite])

  useEffect(() => {
    if (!enabled || !eligible || key.length === 0) {
      setAutoRunQueued(false)
      return
    }
    setAutoRunQueued(true)
    const timer = setTimeout(() => {
      setAutoRunQueued(false)
      void recommend()
    }, AUTO_RUN_DELAY_MS)
    /*
      A later edit drops the pending timer and nothing else. Canceling the in-flight run too would
      cancel runs this hook never started: `generateGarden` awaits `recommend()` and plants from
      what it returns, and a guided apply moves this key several times while that run is in flight,
      so the cleanup would void the ranking the planting is waiting on. A run started by this timer
      is superseded the moment a later `recommend` bumps the token, which is the same abandonment
      without the collateral
    */
    return () => clearTimeout(timer)
  }, [enabled, eligible, key, recommend, setAutoRunQueued])
}
