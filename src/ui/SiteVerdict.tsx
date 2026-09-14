import { useEffect, useMemo, type ReactElement } from 'react'
import { climateSentence, siteVerdict, waterSentence } from '../recommend/site-verdict'
import { useAppStore } from '../state/store'

/**
 * How the place grows, said on the step that chose it and right under its frost sentence: how much
 * of the catalogue its climate admits, and whether its rain covers a garden's use. Both are
 * computed the moment the place resolves, and elsewhere they're read only on the plants step, crop
 * by crop. The catalogue is asked for here too, because a returning visitor can reach this step
 * before anything else has loaded it
 */
export const SiteVerdict = (): ReactElement | null => {
  const site = useAppStore((s) => (s.site.status === 'ready' ? s.site.value : null))
  const catalog = useAppStore((s) => (s.catalog.status === 'ready' ? s.catalog.value : null))
  const needsCatalog = useAppStore((s) => s.catalog.status === 'idle')
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const percentile = useAppStore((s) => s.frostPercentile)

  useEffect(() => {
    if (needsCatalog) void loadCatalog()
  }, [needsCatalog, loadCatalog])

  const verdict = useMemo(
    () => (site === null || catalog === null ? null : siteVerdict(site, catalog, percentile)),
    [site, catalog, percentile],
  )
  if (site === null || verdict === null) return null

  return (
    <p className="notice notice-ready" data-testid="readout-site-verdict">
      <span data-testid="readout-site-verdict-climate">{climateSentence(verdict)}</span>{' '}
      <span data-testid="readout-site-verdict-water">{waterSentence(site)}</span>
    </p>
  )
}
