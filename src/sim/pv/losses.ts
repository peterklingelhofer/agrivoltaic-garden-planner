import type { LossComponent, SystemLoss } from '../../types/energy'
import type { Fraction } from '../../types/units'

const loss = (component: LossComponent, fraction: number, label: string): SystemLoss => ({
  component,
  fraction: fraction as Fraction,
  label,
})

/**
 * The PVWatts v5 default loss stack. Combined multiplicatively these give the
 * published 14.08% total, which is what the unit test pins
 */
export const PVWATTS_DEFAULT_LOSSES: readonly SystemLoss[] = [
  loss('soiling', 0.02, 'Soiling: dust, pollen and bird droppings on the glass'),
  loss('shading', 0.03, 'Shading: near obstructions and row-to-row losses'),
  loss('snow', 0, 'Snow: modules covered by settled snow'),
  loss('mismatch', 0.02, 'Mismatch: manufacturing spread between series-connected modules'),
  loss('wiring', 0.02, 'Wiring: resistive losses in DC and AC conductors'),
  loss('connections', 0.005, 'Connections: resistive losses at connectors and terminals'),
  loss(
    'light-induced-degradation',
    0.015,
    'Light-induced degradation: first-hours loss in crystalline silicon',
  ),
  loss('nameplate', 0.01, 'Nameplate rating: measured power below the label value'),
  loss('age', 0, 'Age: cumulative degradation over the years in service'),
  loss('availability', 0.03, 'Availability: time out of service for maintenance and outages'),
]

export const overrideLoss = (
  losses: readonly SystemLoss[],
  component: LossComponent,
  fraction: number,
  label?: string,
): readonly SystemLoss[] =>
  losses.map((entry) =>
    entry.component === component
      ? { ...entry, fraction: fraction as Fraction, label: label ?? entry.label }
      : entry,
  )

export const lossDerateFactor = (losses: readonly SystemLoss[]): number =>
  losses.reduce((factor, entry) => factor * (1 - entry.fraction), 1)

export const combinedLossFraction = (losses: readonly SystemLoss[]): Fraction =>
  (1 - lossDerateFactor(losses)) as Fraction
