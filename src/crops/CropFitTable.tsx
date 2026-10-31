import { useMemo, useState, type ReactElement } from 'react'
import { CROP_LIGHT_HEADERS } from '../data/crop-light-table'
import {
  type FitRow,
  shownRows,
  type Sort,
  type SortKey,
  sortedRows,
  type VerdictFilter,
} from './fit-rows'

/** The docs table's hover for one of its headers, so a column the two tables share reads the same */
const catalogTip = (header: string): string =>
  CROP_LIGHT_HEADERS.find(([text]) => text === header)?.[1] ?? ''

const lowerFirst = (text: string): string => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

type Column =
  | {
      readonly sortable: true
      readonly key: SortKey
      readonly label: string
      readonly title: string
    }
  | {
      readonly sortable: false
      readonly key: 'why' | 'season' | 'plant'
      readonly label: string
      readonly title: string
    }

const COLUMNS: readonly Column[] = [
  {
    sortable: true,
    key: 'crop',
    label: 'Crop',
    title: 'The common name, with the botanical name under it',
  },
  {
    sortable: true,
    key: 'verdict',
    label: 'Verdict',
    title: "Recommended, limited or not suited, from the crop's light, climate and soil here",
  },
  {
    sortable: false,
    key: 'why',
    label: 'Why',
    title: "The factor that limits the crop's performance here",
  },
  {
    sortable: true,
    key: 'light',
    label: 'Light (mol/m²/d)',
    title: `The mean daily light over the crop's season here, under your shade. Floor: ${lowerFirst(catalogTip('Light floor (mol/m²/d)'))}. Band: ${lowerFirst(catalogTip('Target light band (mol/m²/d)'))}.`,
  },
  {
    sortable: true,
    key: 'shade',
    label: 'Shade',
    title: `Your shade against the crop's shade ceiling, ${lowerFirst(catalogTip('Shade ceiling (%)'))}`,
  },
  {
    sortable: false,
    key: 'season',
    label: 'Season',
    title: 'Whether the crop finishes inside the season here, at the frost risk you chose',
  },
  {
    sortable: false,
    key: 'plant',
    label: 'Plant',
    title: 'The first planting window: how it goes in, and the earliest and latest day',
  },
  { sortable: true, key: 'maturity', label: 'Maturity', title: catalogTip('Maturity') },
]

export interface CropFitTableProps {
  /** Every crop's row, in the plan's order, as `fitRows` builds them */
  readonly rows: readonly FitRow[]
  readonly placeLabel: string
  /** Shows the crops whose names hold this, in any case */
  readonly query: string
  readonly verdict: VerdictFilter
}

/**
 * Every crop in the catalog read against one place, a row each, in the plan's order until a
 * column is chosen. A sortable header is a button, so the keyboard reaches every sort, and the
 * header cell says which way the table runs
 */
export const CropFitTable = ({
  rows,
  placeLabel,
  query,
  verdict,
}: CropFitTableProps): ReactElement => {
  const [sort, setSort] = useState<Sort | null>(null)
  const shown = useMemo(
    () => sortedRows(shownRows(rows, query, verdict), sort),
    [rows, query, verdict, sort],
  )
  // a second press on the same column reverses it
  const toggle = (key: SortKey): void =>
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
        : { key, direction: 'ascending' },
    )

  return (
    <>
      <div className="crops-table-box">
        <table className="crops-table" data-testid="list-crops-results">
          <caption className="visually-hidden">Crops for {placeLabel}</caption>
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const direction =
                  sort !== null && sort.key === column.key ? sort.direction : undefined
                return (
                  <th key={column.key} scope="col" title={column.title} aria-sort={direction}>
                    {column.sortable ? (
                      <button
                        type="button"
                        className="crops-sort"
                        data-testid={`action-crops-sort-${column.key}`}
                        onClick={() => toggle(column.key)}
                      >
                        {column.label}
                        {direction === undefined ? null : (
                          <span className="crops-sort-mark" aria-hidden="true">
                            {direction === 'ascending' ? '▲' : '▼'}
                          </span>
                        )}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={row.cropId}
                data-testid={`row-crops-${row.cropId}`}
                data-crop={row.cropId}
                data-verdict={row.verdict}
              >
                <th scope="row" className="crops-crop">
                  {row.name}
                  <span className="crops-botanical" lang="la">
                    {row.botanicalName}
                  </span>
                </th>
                <td className="crops-verdict" data-verdict={row.verdict}>
                  {row.verdictText}
                </td>
                <td>{row.why}</td>
                <td className="crops-figure">{row.lightText}</td>
                <td className="crops-figure">{row.shadeText}</td>
                <td title={row.seasonDetail}>{row.seasonText}</td>
                <td>{row.plantText}</td>
                <td>{row.maturityText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 ? (
        <p className="notice notice-idle" data-testid="status-crops-empty">
          No crop matches the filter above
        </p>
      ) : null}
    </>
  )
}
