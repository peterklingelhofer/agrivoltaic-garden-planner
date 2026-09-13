import { useEffect, useMemo, type ReactElement } from 'react'
import { ShapeGeometry } from 'three'
import { contourStep } from '../state/colormap'
import { overlayField } from '../state/overlay'
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
  const boundary = useAppStore((s) => scenePlot(s)?.boundary ?? null)
  const field = useMemo(
    () => overlayField(raster, channel, month, playback),
    [raster, channel, month, playback],
  )

  // the uniform objects are created once and their values arrive as props: r3f writes
  // `uniforms.field.value` for us, so nothing here mutates a value React handed back
  const uniforms = useMemo(() => overlayUniforms(), [])
  const contour = contourUniforms(field.min, field.max)

  const texture = useMemo(
    () =>
      raster && field.values ? fieldTexture(field.values, raster.grid, field.min, field.max) : null,
    [raster, field],
  )
  useEffect(() => () => texture?.dispose(), [texture])

  // the plot's own outline, holes and all, rather than a plane the size of the raster: the
  // raster reaches past the plot wherever a panel stands near its edge, and a light map spilling
  // over the fence read as a plot that was bigger than it is. The texture is placed by where
  // each vertex stands in the raster's extent, so the two line up whatever shape the plot is
  const geometry = useMemo(
    () =>
      raster && boundary
        ? fieldUvsOnto(new ShapeGeometry(bedShape(boundary)), raster.grid.extent)
        : null,
    [raster, boundary],
  )
  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!raster || !texture || !geometry || previewing) return null

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
