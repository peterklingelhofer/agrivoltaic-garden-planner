/**
 * What each surface in the garden is made of.
 *
 * Authored against a fixed lighting reference: the numbers below are linear reflectances
 * read under the Preetham beam at `TONE_MAPPING_EXPOSURE`, values read once and held there
 * regardless of exposure elsewhere. Nothing here adds light, and nothing here is a brightness dial;
 * a surface that reads wrong is a reflectance to change.
 *
 * Where a surface has a number in the model, the model supplies it. The ground's reflectance is
 * `plot.groundAlbedo`, the same figure `SkyLight` bounces off its IBL ground plane and the same
 * figure the bifacial model reads, so the picture cannot disagree with the physics about how
 * bright the ground is. One honest caveat, written here in the open: `groundAlbedo` is a
 * broadband shortwave albedo and includes the near infrared, where a leaf reflects far more
 * than it does in the visible. Matching it in the visible band renders vegetation lighter than
 * a photograph would. The alternative is two albedos that drift apart, which is worse.
 */

import type { Bed, Irrigation, IrrigationMethod } from '../types/garden'
import type { ModuleSpec } from '../types/pv'
import { buildSurface, fbm, mix, neutralGain, type Rgb, type Surface } from './textures'
import { DEFAULT_GROUND_COVER, type GroundCover } from '../types/ground'

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)

const cache = new Map<string, Surface>()

const memo = (key: string, size: number, build: (size: number) => Surface): Surface => {
  const id = `${key}:${String(size)}`
  const hit = cache.get(id)
  if (hit) return hit
  const made = build(size)
  cache.set(id, made)
  return made
}

/**
 * What each cover looks like: the reflectance most of the tile holds, the one its patches hold, and
 * the share of the tile the first one keeps whatever the noise says. Grass is turf with worn
 * patches; gravel is stone in two greys; straw, chips and bare soil are their own browns and
 * yellows.
 *
 * Each palette is authored near its cover's own albedo (`GROUND_COVER_ALBEDO`), so the gain that
 * carries the tile to the model's figure sits near unity and no texel is driven past a
 * reflectance of one; `surfaceGain` still puts the area mean exactly on the model's number
 */
const GROUND_PALETTES: Readonly<
  Record<GroundCover, { readonly main: Rgb; readonly patch: Rgb; readonly share: number }>
> = {
  grass: { main: [0.12, 0.26, 0.06], patch: [0.2, 0.19, 0.08], share: 0.72 },
  'bare-soil': { main: [0.17, 0.13, 0.09], patch: [0.11, 0.085, 0.06], share: 0.6 },
  'wood-chip': { main: [0.23, 0.14, 0.08], patch: [0.12, 0.075, 0.045], share: 0.6 },
  'straw-mulch': { main: [0.44, 0.37, 0.17], patch: [0.3, 0.24, 0.1], share: 0.6 },
  'light-gravel': { main: [0.5, 0.49, 0.46], patch: [0.33, 0.32, 0.3], share: 0.5 },
}

export const groundSurface = (size: number, cover: GroundCover = DEFAULT_GROUND_COVER): Surface =>
  memo(`ground:${cover}`, size, (resolution) => {
    const palette = GROUND_PALETTES[cover]
    return buildSurface({
      size: resolution,
      relief: 0.012,
      field: (u, v) => {
        const patch = fbm(u, v, { cells: 3, octaves: 3, seed: 11 })
        const dry = fbm(u, v, { cells: 5, octaves: 3, seed: 23 })
        const blades = fbm(u, v, { cells: 24, octaves: 3, seed: 37, stretch: 3 })
        // two scales of variation: patches a metre across, and the finer drying inside them
        const worn = clamp01((patch - 0.12) * 3.6) * (1 - 0.6 * clamp01(dry * 1.3 - 0.55))
        const albedo = mix(palette.patch, palette.main, palette.share + (1 - palette.share) * worn)
        const shade = 0.88 + 0.24 * blades
        return {
          albedo: [albedo[0] * shade, albedo[1] * shade, albedo[2] * shade],
          height: blades * 0.65 + patch * 0.35,
          roughness: 0.8 + 0.16 * blades,
          metalness: 0,
        }
      },
    })
  })

/** A worked tilth: clods at a few centimetres over a fine crumb */
const LOAM: Rgb = [0.13, 0.096, 0.068]

export const soilSurface = (size: number): Surface =>
  memo('soil', size, (resolution) =>
    buildSurface({
      size: resolution,
      relief: 0.035,
      field: (u, v) => {
        const clods = fbm(u, v, { cells: 9, octaves: 4, seed: 53 })
        const crumb = fbm(u, v, { cells: 34, octaves: 3, seed: 71 })
        const shade = 0.66 + 0.62 * clods * (0.7 + 0.3 * crumb)
        return {
          albedo: [LOAM[0] * shade, LOAM[1] * shade, LOAM[2] * shade],
          height: clods * 0.72 + crumb * 0.28,
          roughness: 0.9 + 0.08 * crumb,
          metalness: 0,
        }
      },
    }),
  )

/** Sawn softwood: grain along the board, so the noise is stretched hard across it */
const TIMBER: Rgb = [0.17, 0.1, 0.05]

export const timberSurface = (size: number): Surface =>
  memo('timber', size, (resolution) =>
    buildSurface({
      size: resolution,
      relief: 0.02,
      field: (u, v) => {
        const grain = fbm(u, v, { cells: 8, octaves: 4, seed: 97, stretch: 14 })
        const board = Math.abs(((v * 3) % 1) - 0.5) < 0.03 ? 0.45 : 1
        const shade = (0.66 + 0.64 * grain) * board
        return {
          albedo: [TIMBER[0] * shade, TIMBER[1] * shade, TIMBER[2] * shade],
          height: grain * 0.8 + (board < 1 ? 0 : 0.2),
          roughness: 0.58 + 0.26 * grain,
          metalness: 0,
        }
      },
    }),
  )

/** Anodised aluminium: a brushed extrusion, which is a roughness pattern more than a colour one */
const ANODISED: Rgb = [0.62, 0.63, 0.65]

export const aluminiumSurface = (size: number): Surface =>
  memo('aluminium', size, (resolution) =>
    buildSurface({
      size: resolution,
      relief: 0.004,
      field: (u, v) => {
        const brush = fbm(u, v, { cells: 6, octaves: 4, seed: 131, stretch: 40 })
        const shade = 0.94 + 0.12 * brush
        return {
          albedo: [ANODISED[0] * shade, ANODISED[1] * shade, ANODISED[2] * shade],
          height: brush,
          roughness: 0.28 + 0.16 * brush,
          metalness: 0.95,
        }
      },
    }),
  )

/** Hot-dip galvanising: spangle, the zinc crystal facets, each reflecting at its own roughness */
const ZINC: Rgb = [0.5, 0.52, 0.54]

export const galvanisedSurface = (size: number): Surface =>
  memo('galvanised', size, (resolution) =>
    buildSurface({
      size: resolution,
      relief: 0.01,
      field: (u, v) => {
        const spangle = fbm(u, v, { cells: 6, octaves: 2, seed: 173 })
        const facet = Math.round(spangle * 5) / 5
        const weathering = fbm(u, v, { cells: 20, octaves: 3, seed: 191 })
        const shade = 0.88 + 0.2 * facet - 0.1 * weathering
        return {
          albedo: [ZINC[0] * shade, ZINC[1] * shade, ZINC[2] * shade],
          height: facet * 0.6 + weathering * 0.4,
          roughness: 0.34 + 0.34 * facet + 0.1 * weathering,
          metalness: 0.9,
        }
      },
    }),
  )

/** Anti-reflective silicon under glass: almost black, with a blue cast */
const CELL: Rgb = [0.009, 0.013, 0.032]
const BUSBAR: Rgb = [0.33, 0.35, 0.38]
const BACKSHEET: Rgb = [0.58, 0.59, 0.6]

/**
 * The module laminate seen through its glass.
 *
 * The roughness is uniformly low and there is no metal anywhere in it, because the surface the
 * light actually reflects off is one sheet of flat glass: the cells, the busbars and the white
 * backsheet between them are all behind it. Modelling the cell stack's own roughness on the front
 * surface, or putting a clearcoat over a base that is already a dielectric, gives the module two
 * glass fronts and roughly twice the sky reflection it should have.
 *
 * The cell gap and the busbars are narrow for the same reason, and it is the less obvious half of
 * the story. Mipmapped, the texture renders its true area average, and a 3.5 percent inter-cell gap
 * painted at a backsheet white would carry the whole laminate to an average reflectance of 0.14: a
 * mid-grey module. The gap is the width a real one is and the average is 0.05, which is what a
 * module measures.
 *
 * The tile is one cell, tiled by the plane's UVs, so the gap gets pixels to be drawn in
 */
export const laminateSurface = (size: number): Surface =>
  memo('laminate', size, (resolution) =>
    buildSurface({
      size: resolution,
      relief: 0.003,
      field: (u, v) => {
        const gap = u < 0.013 || u > 0.987 || v < 0.013 || v > 0.987
        const busbar = Math.abs(u - 0.33) < 0.008 || Math.abs(u - 0.67) < 0.008
        const grain = fbm(u, v, { cells: 8, octaves: 2, seed: 211 })
        const albedo = gap ? BACKSHEET : busbar ? BUSBAR : CELL
        const shade = gap ? 1 : 0.9 + 0.2 * grain
        return {
          albedo: [albedo[0] * shade, albedo[1] * shade, albedo[2] * shade],
          height: gap ? 0 : 1,
          roughness: gap ? 0.1 : 0.06,
          metalness: 0,
        }
      },
    }),
  )

/**
 * The back of that same module.
 *
 * It needed one at all because the laminate is a zero-thickness plane drawn front side only, so
 * from below or from behind a row the glass was culled and the ground showed through the frame:
 * the picture said light passes through a module, which is the one thing this tool exists to say
 * it does not. A double-sided front would have fixed the hole and drawn a second sheet of cover
 * glass on the wrong face; the back of a module is a different surface and gets one.
 *
 * The reflectance is the module's own `rearReflectance`, the number the bifacial chain reads, so
 * the picture and the physics cannot disagree about how much light the back of a module sends
 * back. It is a shortwave figure read in the visible, the same honest caveat `groundAlbedo`
 * carries above. At this catalogue's default it is 0.05: a glass-glass bifacial rear is the cell
 * stack again and is nearly as dark as the front, and a `white` backsheet carries its own higher
 * figure, defined at its own site.
 *
 * Neutral: the model supplies one number for this. Matte, because what is
 * actually on the back of a module is a backsheet and a junction box, no second glass
 * front. The underside of an array reads as the shade it casts
 */
export const moduleRearAlbedo = (module: ModuleSpec): number => clamp01(module.rearReflectance)

/** Backsheet, not glass: no cover sheet on this face, so nothing here reflects at a grazing angle */
export const MODULE_REAR_ROUGHNESS = 0.85

/* ------------------------------- model-driven tints ------------------------------- */

/**
 * Selection, as a multiplier on whatever the thing is already made of. It never throws the
 * material away with a flat colour. Warm, because every other warm thing in the scene is lit by the
 * sun and this one is not, which is what makes it read as an annotation
 */
export const SELECTION_TINT: Rgb = [1.9, 1.4, 0.6]

export const tintedBy = (gain: number, selected: boolean, strength = 1): Rgb => {
  if (!selected) return [gain, gain, gain]
  const tint = mix([1, 1, 1], SELECTION_TINT, strength)
  return [gain * tint[0], gain * tint[1], gain * tint[2]]
}

/**
 * Dry topsoil against the same soil watered: paler and warmer, by how short of water the bed ran
 * in the last season. The same kind of reading as `bedWetness` darkening, in the other
 * direction, and like it, a choice this renderer makes: the size of the shift is
 * ours, the direction is what dry soil does. Every channel stays a multiplier on a reflectance
 */
export const driedBy = (rgb: Rgb, thirst: number): Rgb => {
  const t = clamp01(thirst)
  return [rgb[0] * (1 + 0.55 * t), rgb[1] * (1 + 0.4 * t), rgb[2] * (1 + 0.12 * t)]
}

/**
 * The multiplier that puts a tile's area-average reflectance exactly on a target albedo.
 * Area-average because a box filter is what mipmapping does, so the figure holds at every
 * distance the camera can be at
 */
export const surfaceGain = (surface: Surface, targetAlbedo: number): number =>
  neutralGain(surface.meanAlbedo, targetAlbedo)

/**
 * The share of a bed's soil surface each method leaves wet. It is the surface, not the root
 * zone, that changes how soil looks: subsurface drip delivers the most water of any method here
 * and shows none of it, and that asymmetry is the whole reason this is keyed on method rather
 * than on the depth applied. The figures are a rendering choice, not a measurement
 */
const WETTED_SURFACE: Readonly<Record<IrrigationMethod, number>> = {
  none: 0,
  hand: 0.55,
  sprinkler: 1,
  drip: 0.3,
  'subsurface-drip': 0,
  flood: 1,
}

export const bedWetness = (irrigation: Irrigation): number =>
  irrigation.available && irrigation.appliedMmPerYear > 0 ? WETTED_SURFACE[irrigation.method] : 0

/** A soil at or above this much organic matter is as dark as the darkening model goes */
const HUMIC_SATURATION = 0.06
/** What that soil's reflectance is, as a share of the same soil's mineral reflectance */
const HUMIC_SHARE = 0.6
/** A wetted soil against the same soil dry: the water film kills the first-surface scatter */
const WET_SHARE = 0.55

/**
 * Bed soil reflectance, anchored to the one albedo the model carries and moved from there by two
 * things the model also carries: how much organic matter the soil profile has, and how much of
 * the surface the bed's irrigation leaves wet. Both darken, both are relative, and the plot
 * albedo stays the single number they are relative to
 */
export const bedSoilAlbedo = (bed: Bed, groundAlbedo: number): number => {
  const humic = clamp01(bed.soil.organicMatterFraction / HUMIC_SATURATION)
  const wet = bedWetness(bed.irrigation)
  return groundAlbedo * (1 - (1 - HUMIC_SHARE) * humic) * (1 - (1 - WET_SHARE) * wet)
}

/** A wet surface is smooth as well as dark, which is what makes it read as wet and not as shadow */
export const bedSoilRoughness = (bed: Bed): number => 1 - 0.45 * bedWetness(bed.irrigation)

export const soilTint = (surface: Surface, bed: Bed, groundAlbedo: number): number =>
  surfaceGain(surface, bedSoilAlbedo(bed, groundAlbedo))

/** Weathered softwood, dry. Not model-driven: no field on `Bed` says what its walls are made of */
export const TIMBER_ALBEDO = 0.11
