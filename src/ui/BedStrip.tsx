import type { ReactElement } from 'react'
import { EMPTY_LIST } from '../state/slices'
import { scenePlot, useAppStore } from '../state/store'
import type { Crop } from '../types/crop'
import type { Bed } from '../types/garden'
import { cropName } from './format'

/** How many plants a card names before it counts the rest, because a card holds a line or two */
const NAMED_ON_CARD = 3

/**
 * What is in the bed, in the plants' own names.
 *
 * The card said "10.5 m², 3 planted", which two adults in the newcomer walk read as a number of
 * plants and never learned the name of one of. The count is in the panel beside every other
 * figure about the bed; what a card is for is telling them apart at a glance
 */
const plantedOnCard = (bed: Bed, catalog: readonly Crop[]): string => {
  const names = bed.plantings.map((planting) => cropName(catalog, planting.cropId))
  if (names.length === 0) return 'nothing planted yet'
  const shown = names.slice(0, NAMED_ON_CARD).join(', ')
  return names.length > NAMED_ON_CARD
    ? `${shown} and ${String(names.length - NAMED_ON_CARD)} more`
    : shown
}

/**
 * Every bed at once, as an overview the dropdown cannot be.
 *
 * The dropdown stays: it is the keyboard path and it does not run out of room when a plot has
 * twenty beds. Both write `selectedBedId`, so there is one selection and two ways to reach it,
 * which is not the same thing as two sources of truth
 */
export const BedStrip = (): ReactElement | null => {
  const beds = useAppStore((s) => scenePlot(s)?.beds ?? null)
  const catalog = useAppStore((s) => (s.catalog.status === 'ready' ? s.catalog.value : EMPTY_LIST))
  const selectedBedId = useAppStore((s) => s.selectedBedId)
  const hovered = useAppStore((s) => s.hovered)
  const selectBed = useAppStore((s) => s.selectBed)

  if (beds === null || beds.length === 0) return null

  const activeBedId = selectedBedId ?? beds[0]?.id ?? null

  return (
    <div className="bed-strip-wrap">
      <ul className="bed-strip" data-testid="list-bed-strip">
        {beds.map((bed) => (
          <li key={bed.id}>
            <button
              type="button"
              className="bed-card"
              data-testid={`item-bed-card-${bed.id}`}
              data-selected={bed.id === activeBedId}
              data-hovered={
                hovered !== null && hovered.kind !== 'array' && hovered.bedId === bed.id
              }
              onClick={() => {
                selectBed(bed.id)
              }}
            >
              <strong>{bed.label}</strong>
              <span>
                {bed.areaM2.toFixed(1)} m², {plantedOnCard(bed, catalog)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
