import { waterBalances } from '../recommend/water'
import type { BedWaterBalance } from '../types/water'
import { attempt, unavailableMessage } from './safe'
import type { AppState } from './slices'

export type WaterInputs = Pick<AppState, 'site' | 'weather' | 'plot' | 'bedLight' | 'catalog'>

export interface WaterBalanceView {
  readonly balances: readonly BedWaterBalance[]
  readonly message: string | null
}

/**
 * The two things a balance waits on, said apart.
 *
 * One sentence naming both, whichever was missing, would show a reader with four beds drawn "No
 * site or bed yet" under a sidebar that said "4 beds", with no way to tell which half of it was
 * about them
 */
export const WATER_NO_SITE =
  'No place looked up yet. Look up the place and its weather to see a water balance'
export const WATER_NO_BED = 'No bed yet. Draw a bed to see a water balance'

/** The panel owns no state: the balance is recomputed from the store on demand */
export const waterBalanceView = (state: WaterInputs): WaterBalanceView => {
  const { site, weather, plot, catalog } = state
  if (site.status !== 'ready' || weather.status !== 'ready') {
    return { balances: [], message: WATER_NO_SITE }
  }
  if (plot === null || plot.beds.length === 0) {
    return { balances: [], message: WATER_NO_BED }
  }
  const result = attempt(() =>
    waterBalances({
      site: site.value,
      weather: weather.value,
      plot,
      bedLight: state.bedLight,
      catalog: catalog.status === 'ready' ? catalog.value : [],
    }),
  )
  return result.ok
    ? { balances: result.value, message: null }
    : { balances: [], message: unavailableMessage('water balance', result.message) }
}
