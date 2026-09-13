import type { ReactElement } from 'react'
import { MONTH_NAMES } from '../data/util'
import { bedLightSummary } from '../state/bed-light'
import { growingWindowOf } from '../state/growing-window'
import { useAppStore } from '../state/store'
import { formatDli } from './format'
import { Panel } from './Panel'

const monthName = (month: number): string => MONTH_NAMES[month - 1] ?? String(month)

/**
 * A bed's light in one word, from the share of open-sky light the panels take off it over the
 * growing season. The same thresholds the plants step uses for its bed cards, so the two steps
 * never call one bed by two names
 */
const zoneWord = (shadeRatio: number): 'sunny' | 'part shade' | 'shady' =>
  shadeRatio < 0.15 ? 'sunny' : shadeRatio < 0.4 ? 'part shade' : 'shady'

/**
 * Each bed's light, live, on the step that computes it.
 *
 * The three figures a bed is placed by (its growing-season light, its darkest spot, and how much
 * daylight the panels take) also appear on the layout cards and the guided plan card, as snapshots
 * written at the moment the layout search ran. This reads `bedLight`, which every bake and every
 * guided apply rewrites, and says which run it came from
 */
export const BedLightPanel = (): ReactElement => {
  const bedLight = useAppStore((s) => s.bedLight)
  const beds = useAppStore((s) => s.plot?.beds ?? null)
  const rasterReady = useAppStore((s) => s.raster.status === 'ready')
  // the site's own frost window once the place is resolved, so the months printed are its own
  const window = useAppStore(growingWindowOf)
  const season = `${monthName(window.startMonth)} to ${monthName(window.endMonth)}`

  return (
    <Panel
      id="bed-light"
      title="Light in each bed"
      subtitle={`What each bed gets over the growing season, ${season}, from the light run`}
    >
      {beds === null || beds.length === 0 ? (
        <p className="notice notice-idle" data-testid="status-bed-light">
          No bed yet. Draw one with Draw bed and its light will be listed here
        </p>
      ) : bedLight.length === 0 ? (
        <p className="notice notice-idle" data-testid="status-bed-light">
          Run the light check above and each bed's light will be listed here
        </p>
      ) : (
        <>
          <p className="panel-sub" data-testid="readout-bed-light-source">
            {rasterReady
              ? 'From the light check. Change the panels or the beds and it runs again, and these move with it'
              : "From the layout search's quick run. The full check runs by itself and replaces these"}
          </p>
          {/* what decides the word beside each bed */}
          <p className="panel-sub" data-testid="readout-bed-light-zones">
            Sunny keeps at least 85% of the open sky's light over the growing season, part shade 60
            to 85%, shady under 60%. The whole-year map on the garden runs lower than these
            growing-season figures.
          </p>
          <ul className="list" data-testid="list-bed-light">
            {beds.map((bed) => {
              const light = bedLight.find((entry) => entry.bedId === bed.id)
              if (light === undefined) {
                return (
                  <li key={bed.id} data-testid={`item-bed-light-${bed.id}`}>
                    <strong>{bed.label}</strong>
                    <p className="panel-sub">
                      Not in the last light run. Run it again to include it
                    </p>
                  </li>
                )
              }
              const summary = bedLightSummary(light, window)
              const lost = Math.round(summary.shadeRatio * 100)
              const zone = zoneWord(summary.shadeRatio)
              // one row a class can read aloud, and the three figures it rests on under it
              return (
                <li key={bed.id} data-testid={`item-bed-light-${bed.id}`} data-zone={zone}>
                  <strong>{bed.label}</strong> ·{' '}
                  <span data-testid={`readout-bed-light-open-${bed.id}`}>
                    {String(100 - lost)}% of open sky
                  </span>{' '}
                  · <span data-testid={`readout-bed-light-zone-${bed.id}`}>{zone}</span>
                  <p className="readout-note">
                    DLI{' '}
                    <span data-testid={`readout-bed-light-dli-${bed.id}`}>
                      {formatDli(summary.meanGrowingSeasonDli)}
                    </span>
                    , darkest spot{' '}
                    <span data-testid={`readout-bed-light-worst-${bed.id}`}>
                      {formatDli(summary.worstCellGrowingSeasonDli)}
                    </span>
                    , <span data-testid={`readout-bed-light-shade-${bed.id}`}>{String(lost)}%</span>{' '}
                    lost to shade
                  </p>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Panel>
  )
}
