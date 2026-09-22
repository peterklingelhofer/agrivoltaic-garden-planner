import { useMemo, type ReactElement } from 'react'
import type { Crop, DliClass } from '../types/crop'
import type { CropId } from '../types/ids'
import { CropGlyph } from './CropGlyph'
import { SPRITE_FORMS } from './crop-sprite-forms'
import { spriteFor, SPRITE_PALETTES } from './crop-sprite'

/** The leaf and stem green, once, because it's the same on almost everything that has one */
const LEAF = '#4f8f3e'

/**
 * A pixel grid, as one path per color.
 *
 * Runs are merged along each row before anything is emitted, so a twelve-wide band of body color
 * is one `h12`. That matters more than it looks: a ranked list renders
 * sixty of these at once, and the naive version puts about eight thousand rects in the document
 * for a picture nobody can see the pixels of anyway. Merged, a sprite is four paths.
 *
 * Sub-pixel seams are the reason each run is drawn as a closed rectangle path: neighboring
 * fills of the same color meet exactly on the integer grid, and a renderer that antialiases a
 * stroke would draw a pale line down the middle of a solid shape
 */
const pathsFor = (
  grid: readonly string[],
  colors: Readonly<Record<string, string>>,
): readonly (readonly [string, string])[] => {
  const runs = new Map<string, string[]>()
  grid.forEach((row, y) => {
    let slot = '.'
    let start = 0
    const flush = (end: number): void => {
      if (slot === '.' || colors[slot] === undefined) return
      const width = end - start
      const existing = runs.get(slot) ?? []
      existing.push(`M${String(start)} ${String(y)}h${String(width)}v1h-${String(width)}z`)
      runs.set(slot, existing)
    }
    for (let x = 0; x < row.length; x += 1) {
      const here = row[x] ?? '.'
      if (here !== slot) {
        flush(x)
        slot = here
        start = x
      }
    }
    flush(row.length)
  })
  return [...runs].map(([slot, parts]) => [colors[slot] ?? LEAF, parts.join('')] as const)
}

export interface CropPictureProps {
  readonly cropId: CropId
  /** The fallback when nobody has drawn this crop yet: the silhouette for the class it is in */
  readonly dliClass: DliClass
}

/**
 * The picture beside a crop's name: its own sprite where one has been drawn, and the silhouette
 * for its class where one hasn't.
 *
 * Decorative in both cases. The crop's name is always the next thing in the row, so this is
 * `aria-hidden` and adds nothing a screen reader has to hear. What it buys is an eye running down a
 * hundred and eighty-two rows and stopping on the orange root or the red fruit without reading any
 * of them. That's the one thing a list of words can't do.
 *
 * The fallback isn't a nicety either. `CROP_SPRITE` is held total against the catalog by a
 * test, so in a shipped build this never renders. The day somebody adds a crop with no drawing,
 * the row gets a plainer picture, with no hole left behind, and the test says so out loud
 */
export const CropPicture = ({ cropId, dliClass }: CropPictureProps): ReactElement => {
  const drawn = spriteFor(cropId)
  const paths = useMemo(() => {
    if (drawn === undefined) return null
    const [form, palette] = drawn
    const colors = { ...SPRITE_PALETTES[palette], g: LEAF }
    return pathsFor(SPRITE_FORMS[form], colors)
  }, [drawn])
  if (drawn === undefined || paths === null) return <CropGlyph dliClass={dliClass} />
  return (
    <svg
      className="crop-sprite"
      /* no `data-testid`, for the reason `CropGlyph` gives: several rows share a class and a
         testid is an identity. `data-crop` sits inside a row that already carries the crop's own
         testid */
      data-crop={cropId}
      data-form={drawn[0]}
      viewBox="0 0 12 12"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
      /* crisp edges, because these ARE pixels: a smoothed 12x12 grid scaled to 20 is a smudge */
      shapeRendering="crispEdges"
    >
      {paths.map(([color, d]) => (
        <path key={color} d={d} fill={color} />
      ))}
    </svg>
  )
}

/**
 * The same picture, for the four lists that hold a crop id and a catalog, and look the crop up
 * from them.
 *
 * The lookup is linear and is done per row, which is what every one of those lists already does
 * to print the crop's name. Nothing renders at all for an id the catalog doesn't know, because
 * a picture for a crop this build can't name is a picture of nothing
 */
export const CropPictureFor = ({
  catalog,
  cropId,
}: {
  readonly catalog: readonly Crop[]
  readonly cropId: CropId
}): ReactElement | null => {
  const crop = catalog.find((entry) => entry.id === cropId)
  return crop === undefined ? null : <CropPicture cropId={cropId} dliClass={crop.dliClass} />
}
