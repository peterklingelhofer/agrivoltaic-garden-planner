import { useEffect, useMemo, type ReactElement } from 'react'
import { CanvasTexture, SRGBColorSpace, type Sprite } from 'three'
import { OVERLAY_LAYER } from './layers'

/**
 * The bed's name over the bed, at one size on screen whatever the zoom.
 *
 * Nobody could point at the picture and say "that's Bed 3": the plan column numbered the beds
 * and the garden did not, so a class, a couple or a parent and child talking across the two
 * had nothing to point at, in every round through the build. A sprite with the text
 * drawn on a canvas, rather than a DOM label projected over the scene or an SDF font, because
 * it needs no font file, no portal and no layout pass: it is one texture per bed, made once
 * per name, and it draws through the panels so a bed under a row keeps its name.
 *
 * On the overlay layer, because a label is a readout and not geometry: on the scene layer the
 * occlusion pass integrated each quad into its depth buffer and shaded the bed under it
 * (`specular-occlusion.spec.ts` read a dry bed 1.3 percent brighter with the occlusion on).
 *
 * Null wherever there is no document to draw on, which is the scene's own test renderer
 */

/** Text height as a share of the view: about 22px on a laptop canvas, 16px on a phone */
export const SCREEN_SCALE = 0.026

/** Device pixels per canvas unit, so the glyphs stay crisp on a high-density screen */
const DENSITY = 2

/** Above the soil and the sides, below the tallest plant: over, and not inside, the bed */
const HEIGHT_ABOVE_BED_M = 0.9

const labelTexture = (text: string): CanvasTexture | null => {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context === null) return null
  const font = `600 ${String(40 * DENSITY)}px system-ui, -apple-system, 'Segoe UI', sans-serif`
  context.font = font
  const width = Math.ceil(context.measureText(text).width) + 32 * DENSITY
  const height = 56 * DENSITY
  canvas.width = width
  canvas.height = height
  // sizing the canvas resets its state, so the font is set twice on purpose
  context.font = font
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  // dark text in a white halo, the way a map labels ground: legible on soil, on the light
  // overlay's yellows and on the blue of deep shade alike
  context.lineWidth = 8 * DENSITY
  context.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  context.strokeText(text, width / 2, height / 2)
  context.fillStyle = '#1f2d24'
  context.fillText(text, width / 2, height / 2)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export const BedLabel = ({
  text,
  position,
  onSprite,
}: {
  readonly text: string
  readonly position: readonly [number, number, number]
  /** The sprite itself, for `BedLabels` to hide and move without a render */
  readonly onSprite?: (sprite: Sprite | null) => void
}): ReactElement | null => {
  const texture = useMemo(() => labelTexture(text), [text])
  useEffect(() => () => texture?.dispose(), [texture])
  if (texture === null) return null
  const aspect = texture.image.width / texture.image.height
  return (
    <sprite
      ref={onSprite}
      name={`bed-label-${text}`}
      position={[position[0], position[1] + HEIGHT_ABOVE_BED_M, position[2]]}
      scale={[SCREEN_SCALE * aspect, SCREEN_SCALE, 1]}
      renderOrder={10}
      layers={OVERLAY_LAYER}
      // a label is not a thing to select: a click on it reaches the bed or the ground under it
      raycast={() => null}
    >
      <spriteMaterial
        map={texture}
        sizeAttenuation={false}
        depthTest={false}
        depthWrite={false}
        transparent
        toneMapped={false}
      />
    </sprite>
  )
}
