import { useMemo, type ReactElement } from 'react'
import { EMPTY_LIST } from '../state/slices'
import { useAppStore } from '../state/store'
import { dayOfYearUtc } from '../state/sun'
import { Action } from './controls'
import { Panel } from './Panel'
import { buildPrintSheet } from './print-plan'

/**
 * The press, on the checks step, and the sheet it prints.
 *
 * The sheet is mounted with the app and shown by the print stylesheet alone: `.print-plan` is
 * `display: none` on screen and the only thing left on the page under `@media print`. That
 * keeps the press to one line, `window.print()`, which is also the way every browser saves a
 * PDF, and it keeps the sheet out of the accessibility tree until it is the whole page
 */
export const PrintPanel = (): ReactElement => (
  <Panel
    id="print"
    title="Print this plan"
    subtitle="One sheet with the place and its frost dates, the plot, every row of panels, every bed with what goes in it and when, and the year's jobs month by month. Your browser's print dialog can save it as a PDF."
    actions={
      <Action
        testId="action-print-plan"
        tone="primary"
        onClick={() => {
          if (typeof window !== 'undefined' && typeof window.print === 'function') window.print()
        }}
      >
        Print or save as PDF
      </Action>
    }
  >
    <p className="panel-sub" data-testid="readout-print-plan-help">
      Nothing leaves this browser: the sheet is drawn from the design on screen.
    </p>
  </Panel>
)

export const PrintPlan = (): ReactElement => {
  const locationLabel = useAppStore((s) => s.locationLabel)
  const site = useAppStore((s) => (s.site.status === 'ready' ? s.site.value : null))
  const frostPercentile = useAppStore((s) => s.frostPercentile)
  const plot = useAppStore((s) => s.plot)
  const catalog = useAppStore((s) => (s.catalog.status === 'ready' ? s.catalog.value : EMPTY_LIST))
  const calendars = useAppStore((s) =>
    s.calendars.status === 'ready' ? s.calendars.value : EMPTY_LIST,
  )
  const reports = useAppStore((s) => s.simulation.reports)
  const todayUtcMillis = useAppStore((s) => s.todayUtcMillis)
  const sheet = useMemo(
    () =>
      buildPrintSheet({
        locationLabel,
        site,
        frostPercentile,
        plot,
        catalog,
        calendars,
        reports,
        today: dayOfYearUtc(todayUtcMillis),
      }),
    [locationLabel, site, frostPercentile, plot, catalog, calendars, reports, todayUtcMillis],
  )
  return (
    <section className="print-plan" data-testid="panel-print-plan" aria-hidden="true">
      <h1>{sheet.title}</h1>
      {sheet.season === null ? null : <p>{sheet.season}</p>}
      <h2>The plot</h2>
      <p>{sheet.plot}</p>
      {sheet.panels.length === 0 ? null : (
        <>
          <h2>The panels</h2>
          <ul>
            {sheet.panels.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      <h2>The beds</h2>
      {sheet.beds.map((bed) => (
        <section key={bed.label} className="print-bed">
          <h3>{bed.label}</h3>
          <p>{bed.size}</p>
          {bed.plantings.length === 0 ? (
            <p>Nothing planted yet</p>
          ) : (
            <table>
              <tbody>
                {bed.plantings.map((planting) => (
                  <tr key={`${planting.crop}-${planting.line}`}>
                    <th scope="row">{planting.crop}</th>
                    <td>{planting.line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
      {sheet.jobs.length === 0 ? null : (
        <>
          <h2>The year's jobs</h2>
          {sheet.jobs.map((group) => (
            <section key={group.heading} className="print-jobs">
              <h3>{group.heading}</h3>
              <ul>
                {group.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {sheet.standing === null ? null : (
        <>
          <h2>The seasons run so far</h2>
          <p>{sheet.standing}</p>
        </>
      )}
    </section>
  )
}
