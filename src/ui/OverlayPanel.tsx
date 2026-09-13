import { useMemo, type ReactElement } from 'react'
import { overlayField } from '../state/overlay'
import { useOverlayPlayback } from './useOverlayPlayback'
import type { OverlayChannel, OverlaySlice } from '../state/slices'
import type { LightingQuality } from '../types/render'
import { overlaySlice, useAppStore } from '../state/store'
import type { MonthIndex } from '../types/units'
import { Action, SelectField, SliderField, Toggle } from './controls'
import { MONTH_LABELS } from './format'
import { InfoTip } from './InfoTip'
import { MissingRaster } from './MissingRaster'
import { Panel } from './Panel'

const CHANNELS: readonly (readonly [OverlayChannel, string])[] = [
  ['dli', 'Daily light integral'],
  ['rsr', 'Relative shade ratio'],
  ['sky-view-factor', 'Sky view factor'],
]

/**
 * The option labels are already words rather than acronyms, and a beginner walk-through found
 * that the words aren't enough on their own: nothing on screen said what mol/m²/d counts, what
 * RSR is short for, or what "sky view" is a view of. Said here, beside the control that picks the
 * channel, because that is where the choice is made and there's only one of them on screen at a
 * time. The comparisons are ordinal on purpose: this tool's own disclosure holds that the ranking
 * of crops by light demand is sound while the per-crop numbers are provisional
 */
const CHANNEL_HELP: Readonly<Record<OverlayChannel, string>> = {
  dli: 'Daily light integral (DLI), counted in mol/m²/d: all the usable light that lands on a patch of ground over one day, added up. The bigger the number, the more a plant there has to work with. Salad leaves get by on far less of it than a tomato does.',
  rsr: 'Relative shade ratio (RSR): the share of the light under an open sky that the panels take away, over the growing season. At 30%, about seven tenths of that light still reaches the soil.',
  'sky-view-factor':
    "Sky view factor: how much of the whole sky a patch of ground can still see. 1 is nothing at all overhead; 0 is completely covered. It's pure geometry: what stands over the ground, before any weather comes into it.",
}

const LIGHTING: readonly (readonly [LightingQuality, string])[] = [
  ['auto', 'Match this device'],
  ['high', 'High'],
  ['low', 'Low'],
]

const SLICES: readonly (readonly [string, string])[] = [
  ['annual', 'Annual'],
  ...MONTH_LABELS.map((label, index) => [String(index + 1), label] as const),
]

const sliceLabel = (slice: OverlaySlice): string =>
  slice === 'annual' ? 'the annual mean' : (MONTH_LABELS[slice - 1] ?? String(slice))

export const OverlayPanel = (): ReactElement => {
  const overlay = useAppStore((s) => s.overlay)
  // what is DRAWN, which is the playback month while the year is running
  const slice = useAppStore(overlaySlice)
  const overlayPlayback = useAppStore((s) => s.overlayPlayback)
  const playback = useOverlayPlayback()
  const imageryEnabled = useAppStore((s) => s.imageryEnabled)
  const raster = useAppStore((s) => (s.raster.status === 'ready' ? s.raster.value : null))
  const setOverlay = useAppStore((s) => s.setOverlay)
  const setImagery = useAppStore((s) => s.setImagery)
  const lighting = useAppStore((s) => s.lighting)
  const setLighting = useAppStore((s) => s.setLighting)
  const effects = useAppStore((s) => s.effects)
  const setEffects = useAppStore((s) => s.setEffects)

  const field = useMemo(
    () => overlayField(raster, overlay.channel, slice, overlayPlayback),
    [raster, overlay.channel, slice, overlayPlayback],
  )
  const channelLabel = CHANNELS.find(([value]) => value === overlay.channel)?.[1] ?? overlay.channel

  return (
    <Panel id="overlay" title="Light overlay">
      <Toggle
        testId="control-overlay-visible"
        label="Color the ground by how much light it gets"
        checked={overlay.visible}
        onChange={(visible) => setOverlay({ visible })}
      />
      <SelectField
        testId="control-overlay-channel"
        label="What the colors show"
        value={overlay.channel}
        options={CHANNELS}
        onChange={(channel) => setOverlay({ channel })}
      />
      {/* a definition of the selected channel, moved behind the InfoTip rather than sitting on
          the face as a standing paragraph: see the note further down for why it stayed OUT of
          the overlay canvas legend rather than moving there instead */}
      <InfoTip label={channelLabel} testId="info-overlay-channel">
        {CHANNEL_HELP[overlay.channel]}
      </InfoTip>
      <SelectField
        testId="control-overlay-slice"
        label="Which month"
        value={String(overlay.slice)}
        options={SLICES}
        // grayed while the year plays, because "Annual" in the select beside "Showing Aug" read
        // as two answers to one question. The select's own month comes back when playback stops
        disabled={playback.playing}
        onChange={(value) =>
          setOverlay({
            slice: (value === 'annual' ? 'annual' : (Number(value) as MonthIndex)) as OverlaySlice,
          })
        }
      />
      {/*
        The month the SELECT shows is the grower's own and comes back when the playback stops.
        This says which one is on screen meanwhile, so the two can never be confused
      */}
      <div className="row">
        <Action testId="action-overlay-play" onClick={playback.toggle} disabled={!playback.allowed}>
          {playback.playing ? 'Stop the year' : 'Play the year'}
        </Action>
        <span data-testid="readout-overlay-playing" data-slice={String(slice)}>
          {/* `field.span` is null unless playback is accumulating, so this falls back to the
              single month */}
          {playback.playing ? `Showing ${field.span ?? sliceLabel(slice)}` : ''}
        </span>
      </div>
      <Toggle
        testId="control-overlay-accumulate"
        label="Add each month up as it plays"
        checked={playback.accumulating}
        onChange={playback.setAccumulating}
      />
      <SliderField
        testId="control-overlay-opacity"
        label="Opacity"
        min={0}
        max={1}
        step={0.05}
        value={overlay.opacity}
        display={`${Math.round(overlay.opacity * 100)}%`}
        onChange={(opacity) => setOverlay({ opacity })}
      />
      <Toggle
        testId="control-overlay-imagery"
        label="Show a satellite photo underneath"
        checked={imageryEnabled}
        onChange={setImagery}
      />
      <SelectField
        testId="control-overlay-lighting"
        label="How hard the 3D view works"
        value={lighting}
        options={LIGHTING}
        onChange={setLighting}
      />
      <Toggle
        testId="control-overlay-occlusion"
        label="Darken the ground where a panel blocks the sky"
        checked={effects.ambientOcclusion}
        onChange={(ambientOcclusion) => setEffects({ ambientOcclusion })}
      />
      {/*
        The ramp legend sits pinned over the canvas in `App.tsx`, reading the same `overlayField`
        this panel reads, so there's one legend and it can never say something the ground disagrees
        with. Here, in a scrolling sidebar, it would be off-screen for the exact color it explains.
        This panel keeps the note below: a definition of the selected channel, so it belongs
        beside the control that picks the channel
      */}
      {field.note ? <p className="legend-note">{field.note}</p> : null}
      {!raster ? <MissingRaster testId="status-overlay" /> : null}
    </Panel>
  )
}
