import { useMemo, type ReactElement } from 'react'
import { EMPTY_LIST } from '../state/slices'
import { useAppStore } from '../state/store'
import type { ExceedancePercentile } from '../types/site'
import { orderCalendars, PERCENTILE_HELP, PERCENTILE_OPTIONS } from './calendar'
import { CalendarTimeline } from './CalendarTimeline'
import { SelectField } from './controls'
import { InfoTip } from './InfoTip'
import { AsyncNotice, Panel } from './Panel'

export const CalendarPanel = (): ReactElement => {
  const calendars = useAppStore((s) => s.calendars)
  const sets = useAppStore((s) => (s.sets.status === 'ready' ? s.sets.value : EMPTY_LIST))
  const catalog = useAppStore((s) => s.catalog)
  const plot = useAppStore((s) => s.plot)
  const frostPercentile = useAppStore((s) => s.frostPercentile)
  const setFrostPercentile = useAppStore((s) => s.setFrostPercentile)
  const ordered = useMemo(
    () =>
      calendars.status === 'ready'
        ? orderCalendars(calendars.value, sets, plot?.beds ?? EMPTY_LIST)
        : EMPTY_LIST,
    [calendars, sets, plot],
  )
  const crops = catalog.status === 'ready' ? catalog.value : EMPTY_LIST
  const beds = plot?.beds ?? EMPTY_LIST

  return (
    <Panel
      id="calendar"
      title="Planting calendar"
      subtitle="Sow and harvest windows, what is in each bed first and then the rest of its ranking. Every date names the rule that produced it"
    >
      <SelectField
        testId="control-calendar-frost-percentile"
        label="How cautious should the planting dates be?"
        value={String(frostPercentile)}
        options={PERCENTILE_OPTIONS}
        onChange={(value) => setFrostPercentile(Number(value) as ExceedancePercentile)}
      />
      {/* the options say the odds in springs ("1 spring in 10 frosts after the date"), so the
          plain question above is what a grower reads first, and what the odds rest on sits in
          the InfoTip beside it */}
      <InfoTip label="frost exceedance" testId="info-calendar-percentile">
        {PERCENTILE_HELP}
      </InfoTip>
      <AsyncNotice
        state={calendars}
        testId="status-calendar"
        idleLabel="No planting calendar yet"
      />
      {calendars.status === 'ready' ? (
        <CalendarTimeline calendars={ordered} catalog={crops} beds={beds} />
      ) : null}
    </Panel>
  )
}
