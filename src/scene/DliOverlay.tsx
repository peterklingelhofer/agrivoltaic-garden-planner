import { useEffect, useMemo, type ReactElement } from 'react'
import { ShapeGeometry } from 'three'
import { contourStep } from '../state/colormap'
import { overlayField } from '../state/overlay'
import { rainFieldOf } from '../state/rain'
import type { OverlayChannel, OverlayPlayback, OverlaySlice } from '../state/slices'
import { scenePlot, useAppStore } from '../state/store'
import { OVERLAY_LAYER } from './layers'
import {
  contourUniforms,
  fieldTexture,
  fieldUvsOnto,
  overlayUniforms,
  OVERLAY_FRAGMENT,
  OVERLAY_VERTEX,
} from './overlayMaterial'
import { bedShape } from './sceneMath'

export interface DliOverlayProps {
  readonly month: OverlaySlice
  readonly channel: OverlayChannel
  readonly opacity: number
  readonly playback: OverlayPlayback | null
}

export const DliOverlay = ({
  month,
  channel,
  opacity,
  playback,
}: DliOverlayProps): ReactElement | null => {
  // a previewed scenario is a different plot from the one this raster was baked on, and a
  // light field painted under somebody else's panels is the stale-number-shown-as-current
  // failure the whole provenance policy exists to stop. The preview shows geometry, not light
  const previewing = useAppStore((s) => s.previewPlot !== null)
  const raster = useAppStore((s) => (s.raster.status === 'ready' ? s.raster.value : null))
  const plot = useAppStore(scenePlot)
  const weather = useAppStore((s) => (s.weather.status === 'ready' ? s.weather.value : null))
  const boundary = plot?.boundary ?? null
  // only worth computing when the rain channel is the one on screen: every other channel would
  // otherwise recompute the field, unused, on every edit of the plot
  const rain = useMemo(
    () => (channel === 'rain' ? rainFieldOf(plot, weather) : null),
    [channel, plot, weather],
  )
  const field = useMemo(
    () => overlayField(raster, channel, month, playback, rain),
    [raster, channel, month, playback, rain],
  )

  // the uniform objects are created once and their values arrive as props: r3f writes
  // `uniforms.field.value` for us, so nothing here mutates a value React handed back
  const uniforms = useMemo(() => overlayUniforms(), [])
  const contour = contourUniforms(field.min, field.max)

  const texture = useMemo(
    () =>
      field.values && field.grid
        ? fieldTexture(field.values, field.grid, field.min, field.max)
        : null,
    [field],
  )
  useEffect(() => () => texture?.dispose(), [texture])

  // the plot's own outline, holes and all, rather than a plane the size of the field: the
  // field reaches past the plot wherever a panel stands near its edge, and a light map spilling
  // over the fence read as a plot that was bigger than it is. The texture is placed by where
  // each vertex stands in the field's own extent, so the two line up whatever shape the plot is
  const geometry = useMemo(
    () =>
      field.grid && boundary
        ? fieldUvsOnto(new ShapeGeometry(bedShape(boundary)), field.grid.extent)
        : null,
    [field, boundary],
  )
  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!texture || !geometry || previewing) return null

  return (
    <mesh
      name="dli-overlay"
      layers={OVERLAY_LAYER}
      geometry={geometry}
      position={[0, 0.03, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{
        testid: 'scene-dli-overlay',
        channel,
        slice: month,
        max: field.max,
        contourStep: contourStep(field.min, field.max),
      }}
    >
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={OVERLAY_VERTEX}
        fragmentShader={OVERLAY_FRAGMENT}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        uniforms-field-value={texture}
        uniforms-opacity-value={opacity}
        uniforms-contourScale-value={contour.contourScale}
        uniforms-contourOffset-value={contour.contourOffset}
      />
    </mesh>
  )
}
