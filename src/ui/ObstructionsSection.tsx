import type { ReactElement } from 'react'
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
import { meters, type Fraction } from '../types/units'
import { Action, NumberField, Toggle } from './controls'
import { lengthStep, showLength, showLimit, toMeters, useLengthUnit } from './length-units'
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
  const ring = tree.footprint.exterior
  const [a, b, c] = ring
  const widthM = a && b ? Math.hypot(b.xM - a.xM, b.yM - a.yM) : 0
  const depthM = b && c ? Math.hypot(c.xM - b.xM, c.yM - b.yM) : 0
  const center = centroidOf(ring)
  const turn = turnDeg(ring)

  const writeRing = (nextRing: Ring2D): void =>
    upsertObstruction({ ...tree, footprint: polygonOf(nextRing) })

  return (
    <li className="obstruction-card" data-testid={`item-tree-${tree.id}`} data-selected={selected}>
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
      <p className="readout-note" data-testid={`readout-tree-source-${tree.id}`}>
        Defaults 3% in leaf and 46% bare, the midpoints of what{' '}
        <SourceLink id="konarska2014-urban-tree-transmissivity" short /> measured under five street
        trees. Which months it's in leaf comes from the site's typical year, by the Growing Season
        Index (<SourceLink id="jolly2005-growing-season-index" />
        ). The index reads each day's lowest temperature and day length. Its third input, how dry
        the air is, is set to moist, since a garden tree stands where the beds are watered. A month
        counts as in leaf when the index, averaged over 21 days, passes 0.5 at mid-month.
      </p>
      <Action testId={`action-tree-remove-${tree.id}`} onClick={() => removeObstruction(tree.id)}>
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
      <p className="panel-sub" data-testid="readout-houses-help">
        The light check shades the ground with a box for each house or tree, drawn where it stands.
        A tree's crown lets some light through, and more once its leaves are down. Move it in Move
        mode, or type where it stands.
      </p>
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
        <Action testId="action-house-add" disabled={plot === null} onClick={() => addHouse()}>
          Add a house
        </Action>
        <Action testId="action-tree-add" disabled={plot === null} onClick={() => addTree()}>
          Add a tree
        </Action>
      </div>
    </>
  )
}
