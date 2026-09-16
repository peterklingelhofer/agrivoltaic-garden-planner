import { Grid, OrbitControls } from '@react-three/drei'
import { useMemo, type ReactElement } from 'react'
import { sceneExtent } from '../sim/geometry'
import { overlayOffOnSeasons } from '../state/overlay'
import { MAX_PLANT_YEAR } from '../state/slices'
import {
  overlaySlice,
  scenePrecipKind,
  sceneRainMmPerHour,
  scenePlot,
  useAppStore,
} from '../state/store'
import { meters } from '../types/units'
import { Rain } from './Rain'
import { useGuidedTour } from './useGuidedTour'
import { useRenderQuality } from './useRenderQuality'
import { SkyLight } from './SkyLight'
import { BedLabels } from './BedLabels'
import { BedMesh } from './BedMesh'
import { CompassBridge } from './Compass'
import { DliOverlay } from './DliOverlay'
import { Ground } from './Ground'
import { HouseMesh } from './HouseMesh'
import { PlantInstances } from './PlantInstances'
import { PlotBoundary } from './PlotBoundary'
import { PvArrayMesh } from './PvArrayMesh'
import { requestStructuralRedraw } from './redraw'
import { RenderPipeline } from './RenderPipeline'
import { gardenAge, occluderHeightM } from './sceneMath'
import { SceneBoundary } from './SceneBoundary'
import { SunRig } from './SunRig'
import { TreeMesh } from './TreeMesh'
import { useInvalidate } from './useInvalidate'

export const GardenScene = (): ReactElement => {
  const plot = useAppStore(scenePlot)
  const timeUtcMillis = useAppStore((s) => s.timeUtcMillis)
  const overlay = useAppStore((s) => s.overlay)
  /**
   * The light overlay is this app's answer and it's the loudest thing on screen. On the seasons
   * step it buries the plants the season is about: three panels over a heat map, and no harvest to
   * see. It stays exactly as the grower set it, and isn't drawn while the seasons step is open
   * unless the grower turns it back on there (see `overlayOffOnSeasons`). The guided questions are
   * a different surface and keep it
   */
  const onSeasons = useAppStore(overlayOffOnSeasons)
  // the rain that fell in the hour the clock is on, in the year the season ran. Zero off the step
  const rain = useAppStore(sceneRainMmPerHour)
  // snow when the hour is at or below freezing, so a January run isn't drawn as a downpour
  const precipKind = useAppStore(scenePrecipKind)
  const rainExtent = useMemo(
    () =>
      plot === null
        ? null
        : sceneExtent(
            plot.arrays,
            plot.beds.map((bed) => bed.footprint),
            meters(5),
          ),
    [plot],
  )
  /**
   * How far the ground grid reaches, from the plot rather than from the plane it is drawn on.
   *
   * A garden is a few tens of meters, and a grid that fades at a fixed 110 m puts a 32 by 24 m plot
   * in a hundred meters of one-meter squares, so the whole frame reads as a CAD sheet. Half the
   * longest side again past the boundary is enough to see where the ground carries on, and the
   * floor keeps a plot nobody has drawn yet from losing its ruler entirely
   */
  const gridReachM = useMemo(() => {
    const ring = plot?.boundary.exterior ?? []
    if (ring.length < 3) return 30
    const xs = ring.map((point) => point.xM)
    const ys = ring.map((point) => point.yM)
    const longestM = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    return Math.min(110, Math.max(24, longestM * 1.5))
  }, [plot])
  // the month being drawn, which the playback overrides without touching what was chosen
  const slice = useAppStore(overlaySlice)
  const overlayPlayback = useAppStore((s) => s.overlayPlayback)
  const plantYear = useAppStore((s) => s.plantYear)
  const seasonsRun = useAppStore((s) => s.simulation.season)
  const selectedBedId = useAppStore((s) => s.selectedBedId)
  const selectedObstructionId = useAppStore((s) => s.selectedObstructionId)
  const effects = useAppStore((s) => s.effects)
  // Move mode holds the camera still, so a drag moves the thing under the pointer and nothing else
  const mode = useAppStore((s) => s.mode)
  const quality = useRenderQuality()
  const tour = useGuidedTour()
  /**
   * Wind is the only thing in this scene that moves without being asked, so it's the only
   * reason to keep requesting frames when nobody is doing anything. It's asked for only where
   * there's foliage to move: the low tier turns wind off outright, and a garden with nothing
   * planted in it has nothing to sway, so neither pays for it
   */
  const windRunning = quality.wind && (plot?.beds.some((bed) => bed.plantings.length > 0) ?? false)
  useInvalidate(windRunning)

  return (
    <group name="garden-scene">
      <SceneBoundary label="render-pipeline">
        <RenderPipeline
          quality={quality}
          ambientOcclusion={effects.ambientOcclusion}
          occluderHeightM={occluderHeightM(plot)}
        />
      </SceneBoundary>
      <SceneBoundary label="sky-light">
        <SkyLight atUtcMillis={timeUtcMillis} quality={quality} />
      </SceneBoundary>
      <SunRig atUtcMillis={timeUtcMillis} castShadows quality={quality} />
      <Ground />
      {/*
        Two millimeters above the ground, which removes a hazard and is NOT the fix for anything
        currently reported.

        `Ground` is a plane at y=0 with no position of its own and this grid defaulted to y=0 too,
        so the two were exactly coplanar and every grid fragment was contesting a depth value with
        a ground fragment. That's worth not doing on its own merits.

        It was added believing it would fix a flicker reported on Firefox, and it didn't. Measured
        afterward, rather than assumed: Firefox hands out a 24-bit depth buffer on Apple silicon,
        where the smallest resolvable depth difference around this camera distance is about half a
        millimeter, so the two planes were already four quanta apart and coplanarity can't have
        been what was on screen. The Firefox flicker is still open.

        A lift rather than the `polygonOffset` `DliOverlay` uses one file over, because that
        material is ours and takes the prop directly while this one is drei's and would have to be
        reached by prop piercing that races the material it pierces
      */}
      {/*
        `infiniteGrid` is deliberately absent, and its absence is load-bearing: with it on, this
        grid flickered hard whenever the camera moved. Confirmed by removing it and by putting it
        back, on the browser that showed the fault.

        With it on, the grid's lines aren't geometry. The shader takes each fragment's WORLD
        position, computes how near it is to a cell boundary, and antialiases the line using
        screen-space derivatives of that world coordinate, which makes line width a function of
        where the camera is, recomputed per fragment per frame. Without it, the same shader runs
        over a bounded 120 m plane: fifteen times the longest side of a garden this tool designs,
        and `fadeDistance` takes the grid out well before that edge, so nothing is missing.

        The flicker looks like a render-loop problem, because it appears on camera movement, and
        this file's neighborhood is full of render-loop machinery that also keys on camera
        movement. None of that machinery is involved: with `infiniteGrid` on, an empty plot flickers
        too, and an empty plot has no beds, no panels and no plants, so nothing casts a shadow and
        nothing sways. Occlusion, the cascades and the wind ticker are all absent there, and ground,
        sky and this grid are what is left
      */}
      {/*
        The fade is tied to the garden rather than to the plane it is drawn on. At the fixed 110 m
        it had, a 32 by 24 m plot sat in the middle of a hundred meters of one-meter squares and
        the first thing anybody saw was a CAD sheet: the grid is a ruler for the beds, so it
        reaches a little past the longest side of the plot and stops. The bounded 120 m plane
        underneath it doesn't change, because that is the flicker fix above
      */}
      <Grid
        position={[0, 0.002, 0]}
        args={[120, 120]}
        cellSize={1}
        cellThickness={0.5}
        sectionSize={5}
        sectionThickness={1}
        fadeDistance={gridReachM}
        fadeStrength={1.5}
        followCamera={false}
      />
      <PlotBoundary />
      {plot?.arrays.map((array) => (
        <SceneBoundary key={array.id} label={`array-${array.id}`}>
          <PvArrayMesh arrayId={array.id} showTrackerRotation />
        </SceneBoundary>
      ))}
      {plot?.obstructions.map((obstruction) =>
        obstruction.kind === 'house' ? (
          <SceneBoundary key={obstruction.id} label={`house-${obstruction.id}`}>
            <HouseMesh
              obstructionId={obstruction.id}
              selected={obstruction.id === selectedObstructionId}
            />
          </SceneBoundary>
        ) : (
          <SceneBoundary key={obstruction.id} label={`tree-${obstruction.id}`}>
            <TreeMesh
              obstructionId={obstruction.id}
              selected={obstruction.id === selectedObstructionId}
            />
          </SceneBoundary>
        ),
      )}
      {plot?.beds.map((bed) => (
        <SceneBoundary key={bed.id} label={`bed-${bed.id}`}>
          <BedMesh bedId={bed.id} selected={bed.id === selectedBedId} />
          <PlantInstances
            bedId={bed.id}
            atYear={gardenAge(plantYear, seasonsRun, MAX_PLANT_YEAR)}
          />
        </SceneBoundary>
      ))}
      {onSeasons && rain > 0.05 && rainExtent !== null ? (
        <SceneBoundary label="rain">
          <Rain mmPerHour={rain} extent={rainExtent} kind={precipKind} />
        </SceneBoundary>
      ) : null}
      {overlay.visible && !onSeasons ? (
        <SceneBoundary label="dli-overlay">
          <DliOverlay
            month={slice}
            channel={overlay.channel}
            opacity={overlay.opacity}
            playback={overlayPlayback}
          />
        </SceneBoundary>
      ) : null}
      <BedLabels />
      <CompassBridge />
      {/*
        No `target` prop on purpose: the orbit point belongs to the guided tour, and it changes with
        the step. Passed declaratively, drei re-applies it through `applyProps` whenever the target
        array's identity changes, which would overwrite the target mid-flight and again on any
        unrelated re-render. One writer, and it's the frame callback in `useGuidedTour`, which
        writes the target and the position of one pose together and so can never leave them
        disagreeing
      */}
      {/*
        `onChange` marks the frame structural, and drei already calls `invalidate()` for us on the
        same event, so this adds the reason rather than the request. It's needed because the
        shadow cascades track the camera frustum and the occlusion estimate is screen-space, so
        both are stale the moment the camera moves, and a frame that didn't know it was the
        camera moving would reuse them and smear
      */}
      <OrbitControls
        makeDefault
        enableRotate={mode !== 'move'}
        enablePan={mode !== 'move'}
        maxPolarAngle={Math.PI / 2.05}
        onStart={tour.onControlsStart}
        onChange={requestStructuralRedraw}
      />
    </group>
  )
}
