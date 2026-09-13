import { useMemo, type ReactElement } from 'react'
import {
  describeWaterLimitation,
  ET0_METHOD_LABEL,
  RAIN_SHADOW_CAVEAT,
  RUNOFF_CAPTURE_CLAIM,
  STAGE_SPLIT_CLAIM,
  TEXTURE_WATER_CLAIM,
  UNQUANTIFIED_MICROCLIMATE_CAVEAT,
} from '../data/water'
import { useAppStore } from '../state/store'
import { waterBalanceView } from '../state/water'
import type { UnsourcedCited } from '../types/cited'
import type { BedWaterBalance } from '../types/water'
import { SelectField } from './controls'
import { bandBasisLabel, formatBandPercent, formatBandRange } from './format'
import { Panel, Readout } from './Panel'

const share = (value: number): string => `${Math.round(value * 100)}%`

const millimeters = (value: number): string => `${value.toFixed(0)} mm`

const Unsourced = <T,>({
  id,
  label,
  claim,
}: {
  readonly id: string
  readonly label: string
  readonly claim: UnsourcedCited<T>
}): ReactElement => (
  <p className="disclaimer" data-testid={`readout-water-unsourced-${id}`}>
    <strong>{label}, no source:</strong> {claim.justification}
    {claim.caveat === null ? '' : `. ${claim.caveat}`}
  </p>
)

const Balance = ({ balance }: { readonly balance: BedWaterBalance }): ReactElement => {
  const shade = balance.shadeBenefit
  const saving = balance.evapotranspirationSaving
  return (
    <>
      <div className="readouts">
        <Readout
          id="water-method"
          label="How ET0 was computed"
          value={ET0_METHOD_LABEL[balance.method]}
        />
        <Readout
          id="water-et0"
          label="ET0 in a year"
          value={`${millimeters(balance.openSkyEt0Mm)} open sky, ${millimeters(balance.underPanelsEt0Mm)} under the array`}
        />
        <Readout
          id="water-irrigation-open"
          label="Watering needed with no panels"
          value={formatBandRange(balance.irrigationOpenSkyMm, 'mm/yr')}
        />
        <Readout
          id="water-irrigation-panels"
          label="Watering needed under the panels"
          value={formatBandRange(balance.irrigationUnderPanelsMm, 'mm/yr')}
        />
        <Readout
          id="water-saving"
          label="Water the shade saves"
          value={`${formatBandPercent(saving)}, ${bandBasisLabel(saving)}`}
        />
        <Readout
          id="water-deficit"
          label="Shortfall if you only rely on rain"
          value={`${share(balance.openSky.deficitFraction)} of crop demand open sky over ${String(balance.openSky.stressDays)} stress days, ${share(balance.underPanels.deficitFraction)} over ${String(balance.underPanels.stressDays)} days under panels`}
        />
        <Readout
          id="water-soil"
          label="Water the soil can hold"
          value={`${balance.capacity.texture}, ${millimeters(balance.capacity.totalAvailableWaterMm.lower)} to ${millimeters(balance.capacity.totalAvailableWaterMm.upper)} in a ${balance.capacity.rootDepthM.toFixed(2)} m root zone`}
        />
        <Readout
          id="water-rain-split"
          label="Where the rain goes"
          value={`${share(balance.rain.interceptedFraction)} intercepted by panels, ${share(balance.rain.reachingBedFraction)} reaching the bed, ${share(balance.rain.harvestedFraction)} recovered as runoff`}
        />
      </div>
      <p
        className={`notice notice-${shade.active ? 'ready' : 'idle'}`}
        data-testid="readout-water-shade-benefit"
        data-active={String(shade.active)}
        data-scale={shade.scale}
      >
        The yield gain from shade is {shade.active ? 'on' : 'off'}, at {share(shade.scale)} of its
        maximum. {shade.reason}
      </p>
      <ul className="list" data-testid="list-water-band-basis">
        {saving.contributions.map((contribution) => (
          <li key={contribution.note} data-testid="item-water-band-basis">
            +/-{share(contribution.halfWidthFraction)}: {contribution.note}
          </li>
        ))}
      </ul>
      <ul className="list" data-testid="list-water-notes">
        {balance.notes.map((note, index) => (
          <li key={note} data-testid={`item-water-note-${index}`}>
            {note}
          </li>
        ))}
      </ul>
    </>
  )
}

export const WaterPanel = (): ReactElement => {
  const site = useAppStore((s) => s.site)
  const weather = useAppStore((s) => s.weather)
  const plot = useAppStore((s) => s.plot)
  const bedLight = useAppStore((s) => s.bedLight)
  const catalog = useAppStore((s) => s.catalog)
  const selectedBedId = useAppStore((s) => s.selectedBedId)
  const selectBed = useAppStore((s) => s.selectBed)

  const view = useMemo(
    () => waterBalanceView({ site, weather, plot, bedLight, catalog }),
    [site, weather, plot, bedLight, catalog],
  )
  const balance =
    view.balances.find((entry) => entry.bedId === selectedBedId) ?? view.balances[0] ?? null
  const limitation = site.status === 'ready' ? site.value.waterLimitation : null

  return (
    <Panel
      id="water"
      title="Water balance"
      subtitle="Rain in and water out, day by day, for this plot: once under open sky and once under the panels. Watering needed is the gap between rain in and water out. (FAO-56 method)"
    >
      <p className="notice notice-warn" data-testid="readout-water-modeled">
        {UNQUANTIFIED_MICROCLIMATE_CAVEAT}
      </p>
      {limitation === null ? null : (
        <div className="readouts">
          <Readout
            id="water-limitation"
            label="Water limitation"
            value={describeWaterLimitation(limitation, bandBasisLabel(limitation.band))}
          />
          {limitation.fallbackReason === null ? null : (
            <Readout
              id="water-fallback"
              label="Why a simpler method was used"
              value={limitation.fallbackReason}
            />
          )}
        </div>
      )}
      {view.message === null ? null : (
        <p className="notice notice-idle" data-testid="status-water">
          {view.message}
        </p>
      )}
      {balance === null ? null : (
        <>
          <SelectField
            testId="control-water-bed"
            label="Bed"
            value={balance.bedId}
            options={(plot?.beds ?? []).map((bed) => [bed.id, bed.label] as const)}
            onChange={(value) => selectBed(value as typeof balance.bedId)}
          />
          <Balance balance={balance} />
        </>
      )}
      <Unsourced id="texture" label="Water this soil can hold" claim={TEXTURE_WATER_CLAIM} />
      <Unsourced id="runoff" label="Rain caught off the panels" claim={RUNOFF_CAPTURE_CLAIM} />
      <Unsourced id="stages" label="How long each growth stage lasts" claim={STAGE_SPLIT_CLAIM} />
      <p className="disclaimer" data-testid="readout-water-caveat-rain-shadow">
        {RAIN_SHADOW_CAVEAT}
      </p>
    </Panel>
  )
}
