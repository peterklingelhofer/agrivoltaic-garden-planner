import { useEffect, useRef, type ReactElement, type RefObject } from 'react'
import { onCardScrollRequest, requestCardScroll, takeCardScroll } from '../state/card-scroll'
import {
  centroidOf,
  polygonOf,
  resizedRectangle,
  rotateRingAbout,
  translateRing,
} from '../state/geom'
import { useAppStore } from '../state/store'
import type { House, Tree } from '../types/garden'
import type { Ring2D } from '../types/geo'
import type { ObstructionId } from '../types/ids'
import { meters, type Fraction } from '../types/units'
import { Action, NumberField, Toggle } from './controls'
import { InfoTip } from './InfoTip'
import { settleLanding } from './landing'
import { lengthStep, showLength, showLimit, toMeters, useLengthUnit } from './length-units'
import { bringIntoView } from './scroll-into-view'
import { SourceLink } from './SourcesPanel'

const round2 = (value: number): number => Math.round(value * 100) / 100
const roundPercent = (value: number): number => Math.round(value * 100)
const clampFraction = (value: number): Fraction =>
  (Math.min(100, Math.max(0, value)) / 100) as Fraction

/** The angle of a ring's first edge, in whole degrees: 0 is east, 90 is north */
const turnDeg = (ring: Ring2D): number => {
  const a = ring[0]
  const b = ring[1]
  if (a === undefined || b === undefined) return 0
  return Math.round((Math.atan2(b.yM - a.yM, b.xM - a.xM) * 180) / Math.PI)
}

/**
 * Scrolls a card into view when something asked for it: a click on its house or tree in the scene,
 * or the press that added it (`card-scroll.ts`). Being the selection asks for nothing, so pressing
 * the step's header with a card still selected leaves the column at the top of the step.
 *
 * The ask is taken in a frame. A click that opens this step also starts the stepper holding the
 * step's header at the top of the column, and the scroll waits a frame so that it can end that hold
 * first, the way a jump to a source does (`landing.ts`). The frame is also why StrictMode's first
 * run of this effect, which it cancels, can't use the ask up. It only scrolls: focus stays where
 * it is
 */
const useScrollWhenAsked = (
  id: ObstructionId,
  selected: boolean,
): RefObject<HTMLLIElement | null> => {
  const card = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    if (!selected) return undefined
    let queued = false
    let frame = 0
    const soon = (): void => {
      if (queued) return
      queued = true
      frame = requestAnimationFrame(() => {
        queued = false
        if (!takeCardScroll(id)) return
        settleLanding()
        bringIntoView(card.current)
      })
    }
    // look for an ask parked before this card was selected, then listen for later ones
    soon()
    const stopListening = onCardScrollRequest(soon)
    return () => {
      stopListening()
      if (queued) cancelAnimationFrame(frame)
    }
  }, [id, selected])
  return card
}

/** An add selects what it draws and returns it, and the card of what it drew is asked to scroll */
const addAndShow = (add: () => ObstructionId | null): void => {
  const added = add()
  if (added !== null) requestCardScroll(added)
}

/**
 * One house, sized and placed by typing, beside drawing in Move mode. Every field reads the
 * footprint live and writes it back through `upsertObstruction`, so a drag in Move mode and a
 * number typed here can never disagree about where the house stands
 */
const HouseCard = ({
  house,
  selected,
}: {
  readonly house: House
  readonly selected: boolean
}): ReactElement => {
  const upsertObstruction = useAppStore((s) => s.upsertObstruction)
  const removeObstruction = useAppStore((s) => s.removeObstruction)
  const unit = useLengthUnit()
  const card = useScrollWhenAsked(house.id, selected)
  const ring = house.footprint.exterior
  const [a, b, c] = ring
  const widthM = a && b ? Math.hypot(b.xM - a.xM, b.yM - a.yM) : 0
  const depthM = b && c ? Math.hypot(c.xM - b.xM, c.yM - b.yM) : 0
  const center = centroidOf(ring)
  const turn = turnDeg(ring)

  const writeRing = (nextRing: Ring2D): void =>
    upsertObstruction({ ...house, footprint: polygonOf(nextRing) })

  return (
    <li
      ref={card}
      className="obstruction-card"
      data-testid={`item-house-${house.id}`}
      data-selected={selected}
    >
      <strong>{house.label}</strong>
      <div className="row">
        <NumberField
          testId={`control-house-width-${house.id}`}
          label="Width"
          unit={unit}
          min={showLimit(1, unit)}
          step={lengthStep(unit, 0.5)}
          value={showLength(widthM, unit, round2)}
          onChange={(value) =>
            writeRing(resizedRectangle(ring, Math.max(1, toMeters(value, unit)), depthM))
          }
        />
        <NumberField
          testId={`control-house-depth-${house.id}`}
          label="Depth"
          unit={unit}
          min={showLimit(1, unit)}
          step={lengthStep(unit, 0.5)}
          value={showLength(depthM, unit, round2)}
          onChange={(value) =>
            writeRing(resizedRectangle(ring, widthM, Math.max(1, toMeters(value, unit))))
          }
        />
      </div>
      <div className="row">
        <NumberField
          testId={`control-house-height-${house.id}`}
          label="Height to eaves"
          unit={unit}
          min={showLimit(1, unit)}
          step={lengthStep(unit, 0.5)}
          value={showLength(house.heightM, unit, round2)}
          onChange={(value) =>
            upsertObstruction({ ...house, heightM: meters(Math.max(1, toMeters(value, unit))) })
          }
        />
        <NumberField
          testId={`control-house-turn-${house.id}`}
          label="Turn"
          unit="°"
          min={-180}
          max={180}
          step={5}
          value={turn}
          onChange={(value) => writeRing(rotateRingAbout(ring, centroidOf(ring), value - turn))}
        />
      </div>
      <div className="row">
        <NumberField
          testId={`control-house-east-${house.id}`}
          label="Center east"
          unit={unit}
          step={lengthStep(unit, 0.5)}
          value={showLength(center.xM, unit, round2)}
          onChange={(value) => writeRing(translateRing(ring, toMeters(value, unit) - center.xM, 0))}
        />
        <NumberField
          testId={`control-house-north-${house.id}`}
          label="Center north"
          unit={unit}
          step={lengthStep(unit, 0.5)}
          value={showLength(center.yM, unit, round2)}
          onChange={(value) => writeRing(translateRing(ring, 0, toMeters(value, unit) - center.yM))}
        />
      </div>
      <Action
        testId={`action-house-remove-${house.id}`}
        keyShortcuts="Delete Backspace"
        onClick={() => removeObstruction(house.id)}
      >
        Remove
      </Action>
    </li>
  )
}

/**
 * One tree, sized and placed the way a house is, plus its crown: a base and a top, replacing
 * one height, whether it keeps its leaves, and how much light passes it in leaf and bare
 * (Decision Record 26)
 */
const TreeCard = ({
  tree,
  selected,
}: {
  readonly tree: Tree
  readonly selected: boolean
}): ReactElement => {
  const upsertObstruction = useAppStore((s) => s.upsertObstruction)
  const removeObstruction = useAppStore((s) => s.removeObstruction)
  const unit = useLengthUnit()
  const card = useScrollWhenAsked(tree.id, selected)
  const ring = tree.footprint.exterior
  const [a, b, c] = ring
  const widthM = a && b ? Math.hypot(b.xM - a.xM, b.yM - a.yM) : 0
  const depthM = b && c ? Math.hypot(c.xM - b.xM, c.yM - b.yM) : 0
  const center = centroidOf(ring)
  const turn = turnDeg(ring)

  const writeRing = (nextRing: Ring2D): void =>
    upsertObstruction({ ...tree, footprint: polygonOf(nextRing) })

  return (
    <li
      ref={card}
      className="obstruction-card"
      data-testid={`item-tree-${tree.id}`}
      data-selected={selected}
    >
      <strong>{tree.label}</strong>
      <div className="row">
        <NumberField
          testId={`control-tree-width-${tree.id}`}
          label="Crown width"
          unit={unit}
          min={showLimit(1, unit)}
          step={lengthStep(unit, 0.5)}
          value={showLength(widthM, unit, round2)}
          onChange={(value) =>
            writeRing(resizedRectangle(ring, Math.max(1, toMeters(value, unit)), depthM))
          }
        />
        <NumberField
          testId={`control-tree-depth-${tree.id}`}
          label="Crown depth"
          unit={unit}
          min={showLimit(1, unit)}
          step={lengthStep(unit, 0.5)}
          value={showLength(depthM, unit, round2)}
          onChange={(value) =>
            writeRing(resizedRectangle(ring, widthM, Math.max(1, toMeters(value, unit))))
          }
        />
      </div>
      <div className="row">
        <NumberField
          testId={`control-tree-base-${tree.id}`}
          label="Crown base"
          unit={unit}
          min={0}
          step={lengthStep(unit, 0.5)}
          value={showLength(tree.crownBaseM, unit, round2)}
          onChange={(value) =>
            upsertObstruction({ ...tree, crownBaseM: meters(Math.max(0, toMeters(value, unit))) })
          }
        />
        <NumberField
          testId={`control-tree-top-${tree.id}`}
          label="Top"
          unit={unit}
          min={showLimit(tree.crownBaseM + 0.5, unit)}
          step={lengthStep(unit, 0.5)}
          value={showLength(tree.heightM, unit, round2)}
          onChange={(value) =>
            upsertObstruction({
              ...tree,
              heightM: meters(Math.max(tree.crownBaseM + 0.5, toMeters(value, unit))),
            })
          }
        />
      </div>
      <div className="row">
        <NumberField
          testId={`control-tree-turn-${tree.id}`}
          label="Turn"
          unit="°"
          min={-180}
          max={180}
          step={5}
          value={turn}
          onChange={(value) => writeRing(rotateRingAbout(ring, centroidOf(ring), value - turn))}
        />
      </div>
      <div className="row">
        <NumberField
          testId={`control-tree-east-${tree.id}`}
          label="Center east"
          unit={unit}
          step={lengthStep(unit, 0.5)}
          value={showLength(center.xM, unit, round2)}
          onChange={(value) => writeRing(translateRing(ring, toMeters(value, unit) - center.xM, 0))}
        />
        <NumberField
          testId={`control-tree-north-${tree.id}`}
          label="Center north"
          unit={unit}
          step={lengthStep(unit, 0.5)}
          value={showLength(center.yM, unit, round2)}
          onChange={(value) => writeRing(translateRing(ring, 0, toMeters(value, unit) - center.yM))}
        />
      </div>
      <Toggle
        testId={`control-tree-evergreen-${tree.id}`}
        label="Keeps its leaves all year"
        checked={tree.evergreen}
        onChange={(checked) => upsertObstruction({ ...tree, evergreen: checked })}
      />
      <div className="row">
        <NumberField
          testId={`control-tree-leaf-${tree.id}`}
          label="Light through the crown in leaf"
          unit="%"
          min={0}
          max={100}
          step={1}
          value={roundPercent(tree.transmittance)}
          onChange={(value) => upsertObstruction({ ...tree, transmittance: clampFraction(value) })}
        />
        {tree.evergreen ? null : (
          <NumberField
            testId={`control-tree-bare-${tree.id}`}
            label="Light through the bare crown"
            unit="%"
            min={0}
            max={100}
            step={1}
            value={roundPercent(tree.leaflessTransmittance)}
            onChange={(value) =>
              upsertObstruction({ ...tree, leaflessTransmittance: clampFraction(value) })
            }
          />
        )}
      </div>
      {/* the provenance in one line. How the leaf months are read is Decision Record 26's */}
      <p className="readout-note" data-testid={`readout-tree-source-${tree.id}`}>
        Defaults 3% in leaf and 46% bare, from{' '}
        <SourceLink id="konarska2014-urban-tree-transmissivity" short /> (five street trees). The
        months in leaf follow the site's typical year (
        <SourceLink id="jolly2005-growing-season-index" />
        ).
      </p>
      <Action
        testId={`action-tree-remove-${tree.id}`}
        keyShortcuts="Delete Backspace"
        onClick={() => removeObstruction(tree.id)}
      >
        Remove
      </Action>
    </li>
  )
}

/**
 * A house or a tree, drawn on the ground and sized and placed from the sidebar (Decision Record
 * 26). What either shades is the drawn box itself, which is why the surroundings answer above
 * this is grayed out the moment one exists: the two would otherwise say two different things
 * about the same light
 */
export const ObstructionsSection = (): ReactElement => {
  const plot = useAppStore((s) => s.plot)
  const selectedObstructionId = useAppStore((s) => s.selectedObstructionId)
  const addHouse = useAppStore((s) => s.addHouse)
  const addTree = useAppStore((s) => s.addTree)
  const obstructions = plot?.obstructions ?? []
  const houses = obstructions.filter((o): o is House => o.kind === 'house')
  const trees = obstructions.filter((o): o is Tree => o.kind === 'tree')

  return (
    <>
      <ul className="list" data-testid="list-houses">
        {houses.map((house) => (
          <HouseCard key={house.id} house={house} selected={house.id === selectedObstructionId} />
        ))}
      </ul>
      <ul className="list" data-testid="list-trees">
        {trees.map((tree) => (
          <TreeCard key={tree.id} tree={tree} selected={tree.id === selectedObstructionId} />
        ))}
      </ul>
      <div className="row">
        <Action
          testId="action-house-add"
          disabled={plot === null}
          onClick={() => addAndShow(addHouse)}
        >
          Add a house
        </Action>
        <Action
          testId="action-tree-add"
          disabled={plot === null}
          onClick={() => addAndShow(addTree)}
        >
          Add a tree
        </Action>
      </div>
      {/* what one does and how it's moved, behind the i: the paragraph that said it stood above
          the buttons on every visit */}
      <InfoTip label="a house or a tree here" testId="info-obstructions">
        Each one shades the light check as a box where it stands. Move it with the Move tool on the
        garden, or type where it stands in Center east and Center north. A tree's crown lets some
        light through, and more once its leaves are down.
      </InfoTip>
    </>
  )
}
