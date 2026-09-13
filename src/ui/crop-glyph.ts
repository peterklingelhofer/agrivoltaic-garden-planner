import type { DliClass } from '../types/crop'

/**
 * A picture for every crop, drawn rather than photographed, and keyed on a class rather than on
 * the crop.
 *
 * The gap this closes is the one a beginner names first: choosing vegetables from a list of 182
 * words is the last place this app asks a gardener to read where it could let them look, and it is
 * felt hardest on a phone, where the list IS the screen.
 *
 * Photographs were the obvious answer and are the wrong one here, for a reason that is this
 * project's own rather than a matter of taste. A photograph captioned "cucumber" is a claim about
 * a specimen: which cultivar, grown where, at what stage. Nothing in the citation corpus backs
 * that claim, and everything else on these rows traces to something. A silhouette keyed on the
 * DLI class claims only "this is a fruiting vine", which is exactly what `dliClass` already
 * records and what `DLI_CLASS_LABEL` already says in words. There is also no licensing tail, no
 * attribution to carry, and 13 shapes weigh a couple of kB against several megabytes.
 *
 * Keyed on `dliClass` and not on family or on the harvested part, because it is the field every
 * crop already carries, the mapping is total by construction, and its 13 values happen to divide
 * the catalogue almost exactly the way a picture would: a leaf, a root, a pod, a bulb, an ear.
 *
 * Kept beside the component rather than in it, the way `scene-hint.ts` is: what a surface shows
 * can be read and tested without mounting anything
 */
export type GlyphShape =
  | {
      readonly kind: 'path'
      readonly d: string
      readonly filled?: boolean
      /** A fatter stroke, which is how the long fruits get their body without a capsule outline */
      readonly width?: number
    }
  | {
      readonly kind: 'circle'
      readonly cx: number
      readonly cy: number
      readonly r: number
      readonly filled?: boolean
    }

/**
 * Drawn in a 16 by 16 box, in `currentColor`, so a glyph takes the colour of the row it sits in
 * and needs no second version for the dark scheme.
 *
 * Designed for the SILHOUETTE and not for the detail, because 16px is the size these are read at
 * and the job is to be told apart at a glance rather than to be admired. A first pass drew four
 * of the thirteen as a circle with something small on top: strawberry, tomato, onion and cabbage
 * came out as the same blob, which is precisely the failure that makes a picture worth less than
 * the word it sits beside. So the outlines are deliberately spread across shapes: a round fruit,
 * a pointed one, a fan, a fat diagonal, a crescent, a spiral, a tall ear, a cluster of separated
 * circles
 */
export const CROP_GLYPH: Readonly<Record<DliClass, readonly GlyphShape[]>> = {
  // a sprig: one stem, two leaves, low and wide
  'understory-herbs': [
    { kind: 'path', d: 'M8 14.6V4' },
    { kind: 'path', d: 'M8 11C5.9 11 4.3 9.7 3.5 7.6c2.2-.3 4 1 4.5 3.4z', filled: true },
    { kind: 'path', d: 'M8 8.6c2.1 0 3.7-1.3 4.5-3.4-2.2-.3-4 1-4.5 3.4z', filled: true },
  ],
  // one big leaf on the diagonal, which is the only glyph here that is a leaf and nothing else
  'leafy-greens': [
    { kind: 'path', d: 'M2.8 13.2c0-5.2 4.2-9.4 9.4-9.4 0 5.2-4.2 9.4-9.4 9.4z', filled: true },
    { kind: 'path', d: 'M2.8 13.2L12.2 3.8' },
  ],
  // a fan of blades from one point, because a pasture is a sward and not a plant
  'forages-c3-pasture': [
    { kind: 'path', d: 'M8 14.6C6.6 11 5 9 2.8 7.4' },
    { kind: 'path', d: 'M8 14.6C7.4 11 6.9 8.8 6.2 6.2' },
    { kind: 'path', d: 'M8 14.6c.6-3.6 1.1-5.8 1.8-8.4' },
    { kind: 'path', d: 'M8 14.6c1.4-3.6 3-5.6 5.2-7.2' },
  ],
  // three berries, separated: the gaps between them are what say there are three
  'cane-bush-berries': [
    { kind: 'circle', cx: 5, cy: 10.6, r: 2.2, filled: true },
    { kind: 'circle', cx: 11, cy: 10.6, r: 2.2, filled: true },
    { kind: 'circle', cx: 8, cy: 5.4, r: 2.2, filled: true },
  ],
  // wide at the shoulders and pointed at the tip, which is the whole silhouette of the thing
  strawberry: [
    {
      kind: 'path',
      d: 'M8 14.8c-3.1-2.1-4.4-4.4-4.4-6.3 0-1.5 1.9-2.3 4.4-2.3s4.4.8 4.4 2.3c0 1.9-1.3 4.2-4.4 6.3z',
      filled: true,
    },
    { kind: 'path', d: 'M4.4 6.2L8 3.6l3.6 2.6' },
    { kind: 'path', d: 'M8 3.6V1.8' },
  ],
  /*
    A head with the folds of its leaves, and the folds run TOP TO BOTTOM for a reason: two
    concentric arcs opening the same way inside a circle draw a face, which is what the first
    attempt did, and a spiral at this size drew a hook. Outlined rather than solid, which is the
    other half of telling it from the tomato below
  */
  brassicas: [
    { kind: 'circle', cx: 8, cy: 9.2, r: 4.6 },
    { kind: 'path', d: 'M8 13.8c-2-2.6-2.6-5.8-1.7-8.9' },
    { kind: 'path', d: 'M8 13.8c2-2.6 2.6-5.8 1.7-8.9' },
  ],
  // the shape a child draws for a carrot: taper down, tops up
  'root-tuber': [
    { kind: 'path', d: 'M8 14.8L5.2 7.4h5.6L8 14.8z', filled: true },
    { kind: 'path', d: 'M8 7.4V4' },
    { kind: 'path', d: 'M8 5.4L5.2 3' },
    { kind: 'path', d: 'M8 5.4L10.8 3' },
  ],
  // the round one, and the only round one
  solanaceae: [
    { kind: 'circle', cx: 8, cy: 9.8, r: 4.4, filled: true },
    { kind: 'path', d: 'M8 5.2V2.8' },
    { kind: 'path', d: 'M5 5.2l2 1.1' },
    { kind: 'path', d: 'M11 5.2l-2 1.1' },
  ],
  // a fat diagonal, which nothing else here is: a courgette lying on the ground
  cucurbits: [
    { kind: 'path', d: 'M4.9 12.1l6.2-6.6', width: 5.2 },
    { kind: 'path', d: 'M11.6 4.9l1.4-1.5' },
  ],
  // round at the bottom, drawn in at the neck, shoots on top
  alliums: [
    {
      kind: 'path',
      d: 'M8 14.8c-2.9 0-4.5-2-4.5-4.2 0-2.1 1.8-3.4 3.2-4.3.8-.5 1.3-.9 1.3-1.5 0 .6.5 1 1.3 1.5 1.4.9 3.2 2.2 3.2 4.3 0 2.2-1.6 4.2-4.5 4.2z',
      filled: true,
    },
    { kind: 'path', d: 'M8 4.8c1.1-1.1 2.1-1.7 3.2-2' },
    { kind: 'path', d: 'M8 4.8C6.9 3.7 5.9 3.1 4.8 2.8' },
  ],
  // a crescent rather than a lens, because a lens is a leaf, with the seeds showing through it
  'grain-legumes': [
    { kind: 'path', d: 'M3.4 13c0-5.4 4.2-9.2 9.6-9.8.4 5.4-3.6 9.4-9.6 9.8z' },
    { kind: 'circle', cx: 5.6, cy: 11.2, r: 0.85, filled: true },
    { kind: 'circle', cx: 7.6, cy: 9.2, r: 0.85, filled: true },
    { kind: 'circle', cx: 9.7, cy: 7.1, r: 0.85, filled: true },
  ],
  // tall and thin: a stalk carrying grains in pairs, which is what tells a cereal from a grass
  'c3-cereals': [
    { kind: 'path', d: 'M8 14.8V7' },
    { kind: 'circle', cx: 6.4, cy: 6.6, r: 1.15, filled: true },
    { kind: 'circle', cx: 9.6, cy: 6.6, r: 1.15, filled: true },
    { kind: 'circle', cx: 6.4, cy: 4.3, r: 1.15, filled: true },
    { kind: 'circle', cx: 9.6, cy: 4.3, r: 1.15, filled: true },
    { kind: 'circle', cx: 8, cy: 2.2, r: 1.15, filled: true },
  ],
  // a cob standing in its husk, narrower than the courgette and upright where that one lies down
  'maize-c4': [
    {
      kind: 'path',
      d: 'M8.6 2.4c1.9 0 3.2 1.5 3.2 3.6v4.8c0 2.1-1.3 3.6-3.2 3.6s-3.2-1.5-3.2-3.6V6c0-2.1 1.3-3.6 3.2-3.6z',
    },
    { kind: 'path', d: 'M6 7.6h5.2' },
    { kind: 'path', d: 'M6 10.4h5.2' },
    { kind: 'path', d: 'M4.6 14.2C2.6 12 2.3 8.4 3.4 5.9c1.7 2.1 2 5.8 1.2 8.3z', filled: true },
  ],
} as const
