import { type ReactElement, useState } from 'react'
import { isCurrencyCode } from '../data/economy'
import { useAppStore } from '../state/store'

/**
 * An empty field or a negative number is nothing typed. Anything else is kept as typed, and a zero
 * reads as nothing where it is used
 */
const numberOrNull = (text: string): number | null => {
  const value = Number(text)
  return text === '' || !Number.isFinite(value) || value < 0 ? null : value
}

/**
 * What the grower knows about money that the app has no source for: their tariff, its currency
 * and what the panels cost. Outside the United States there is no price on file at all, and the
 * benchmark cost is in US dollars, so both are typed here and stamped as the grower's own, the
 * way a typed soil pH is. The store only ever holds a currency of three capital letters; the
 * code is drafted here while it is shorter than that
 */
export const EconomyFields = (): ReactElement => {
  const inputs = useAppStore((s) => s.economyInputs)
  const setEconomyInputs = useAppStore((s) => s.setEconomyInputs)
  const [draft, setDraft] = useState<string | null>(null)
  const currency = draft ?? inputs.currency
  return (
    <div>
      <p className="readout-note" data-testid="readout-economy-help">
        Outside the United States the app has no electricity price on file, so type what your
        utility charges per kWh. A typed price replaces the state average and a typed cost replaces
        the benchmark, from the next season you run.
      </p>
      <div className="row">
        <label className="field">
          <span className="field-label">
            Electricity price <em>({inputs.currency} per kWh)</em>
          </span>
          <input
            type="number"
            data-testid="control-economy-price"
            min={0}
            step={0.01}
            value={inputs.perKwh ?? ''}
            onChange={(event) => setEconomyInputs({ perKwh: numberOrNull(event.target.value) })}
          />
        </label>
        <label className="field">
          <span className="field-label">
            Currency <em>(three-letter code)</em>
          </span>
          <input
            type="text"
            data-testid="control-economy-currency"
            maxLength={3}
            value={currency}
            onChange={(event) => {
              const code = event.target.value.toUpperCase()
              if (isCurrencyCode(code)) {
                setEconomyInputs({ currency: code })
                setDraft(null)
              } else {
                setDraft(code)
              }
            }}
            onBlur={() => setDraft(null)}
          />
        </label>
        <label className="field">
          <span className="field-label">
            What the panels cost <em>({inputs.currency}, installed)</em>
          </span>
          <input
            type="number"
            data-testid="control-economy-cost"
            min={0}
            step={100}
            value={inputs.installedCost ?? ''}
            onChange={(event) =>
              setEconomyInputs({ installedCost: numberOrNull(event.target.value) })
            }
          />
        </label>
      </div>
      {isCurrencyCode(currency) ? null : (
        <p className="readout-note" data-testid="status-economy-currency">
          A currency code is three letters, like USD, EUR or GBP.
        </p>
      )}
    </div>
  )
}
