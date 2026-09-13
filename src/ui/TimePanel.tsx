import { useMemo, type ReactElement } from 'react'
import { utcOffsetHoursFor } from '../data/geocode'
import { utcOffsetMinutesAt } from '../sim/timezone'
import { useAppStore } from '../state/store'
import { atDayOfYear, dayChrome, dayOfYearUtc, sunAt } from '../state/sun'
import { epochMillis } from '../types/units'
import { SliderField } from './controls'
import { formatDegrees } from './format'
import {
  localClock,
  localDateLabel as dateLabel,
  localMinutesOfDay,
  minutesOfDayUtc,
  zoneLabel,
} from './local-clock'
import { Panel, Readout } from './Panel'

const withMinutes = (millis: number, minutes: number): number =>
  millis - minutesOfDayUtc(millis) * 60000 + minutes * 60000

export const TimePanel = (): ReactElement => {
  const timeUtcMillis = useAppStore((s) => s.timeUtcMillis)
  const location = useAppStore((s) => s.location)
  const setTime = useAppStore((s) => s.setTime)
  const site = useAppStore((s) => (s.site.status === 'ready' ? s.site.value : null))

  const sun = useMemo(() => sunAt(location, timeUtcMillis), [location, timeUtcMillis])
  const chrome = useMemo(() => dayChrome(location, timeUtcMillis), [location, timeUtcMillis])
  // the site's clock at this instant, daylight saving included; the longitude's whole hours
  // until the place is resolved
  const offsetHours =
    site === null
      ? utcOffsetHoursFor(location)
      : utcOffsetMinutesAt(site.timezone, timeUtcMillis, site.utcOffsetHours * 60) / 60
  const zone = zoneLabel(offsetHours, site?.timezone ?? null)

  return (
    <Panel
      id="time"
      title="Sun and time"
      subtitle="The sky, the shadows and the colours on the ground all follow this one sun"
    >
      <SliderField
        testId="control-time-day"
        label="Day of the year"
        min={1}
        max={365}
        step={1}
        value={dayOfYearUtc(timeUtcMillis)}
        display={dateLabel(timeUtcMillis, offsetHours)}
        onChange={(day) => setTime(atDayOfYear(timeUtcMillis, day))}
      />
      <SliderField
        testId="control-time-minutes"
        label="Time of day"
        min={0}
        max={1439}
        step={5}
        value={localMinutesOfDay(timeUtcMillis, offsetHours)}
        display={`${localClock(timeUtcMillis, offsetHours)} (${zone})`}
        // the slider runs on the wall clock where the garden is, so its left edge is local
        // midnight; the store keeps UTC, so the minutes are shifted back before they are kept
        onChange={(minutes) =>
          setTime(epochMillis(withMinutes(timeUtcMillis, minutes - offsetHours * 60)))
        }
      />
      {/*
        Where the sun is, in numbers, behind one press. The two sliders above move the sun and the
        shadows on the ground say where it went; a reader who wants the angle in degrees, or which
        library computed it, asks for it. The warning below stays in the open, because a limit on
        what the app knows is never detail
      */}
      <details className="wizard-advanced" data-testid="details-time-sun">
        <summary data-testid="action-time-sun">Sun details</summary>
        <div className="readouts">
          <Readout
            id="sun-elevation"
            label="Height of the sun"
            value={formatDegrees(sun.elevationDeg)}
          />
          <Readout
            id="sun-azimuth"
            label="Direction of the sun"
            value={formatDegrees(sun.azimuthDeg)}
          />
          <Readout id="sun-source" label="Sun position computed by" value={sun.source} />
          <Readout
            id="sun-daylight"
            label={`Sunrise / sunset (${zone})`}
            value={
              chrome.sunriseMillis && chrome.sunsetMillis
                ? `${localClock(chrome.sunriseMillis, offsetHours)} / ${localClock(chrome.sunsetMillis, offsetHours)}`
                : 'no sunrise or sunset today'
            }
          />
        </div>
      </details>
      {sun.note ? (
        <p className="notice notice-warn" data-testid="status-sun-source">
          {sun.note}
        </p>
      ) : null}
    </Panel>
  )
}
