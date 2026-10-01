import type { ReactElement } from 'react'
import type { DliClass } from '../types/crop'
import { DLI_CLASS_LABEL } from './cold-open'
import { CROP_GLYPH } from './crop-glyph'

/**
 * The picture beside a crop's name.
 *
 * Decorative by construction: the crop's name is always right beside it, so the glyph is
 * `aria-hidden` and adds nothing to what a screen reader says. It's what lets
 * an eye skip down a list of 209 crops and land on the roots or the beans without reading every
 * row, which is the thing a list of words can't do and the reason this exists.
 *
 * What it draws is the crop's class, and the class is named in `DLI_CLASS_LABEL` in the same
 * plain words the cold open uses. That's carried here as `data-class`, with no title attribute
 * at all, because a tooltip on a decorative mark is a promise to a pointer that a phone doesn't
 * have. The class it stands for is one place a test can read, and the row already says the name
 */
export const CropGlyph = ({ dliClass }: { readonly dliClass: DliClass }): ReactElement => (
  <svg
    className="crop-glyph"
    /*
      No `data-testid`, which is the one place this file departs from the house style. A testid is
      an identity, and a glyph doesn't have one: a dozen crops on screen share a class, so a
      testid would be a dozen elements answering to the same name and every `getByTestId` would be
      ambiguous. What a test wants to know is which class was drawn beside which crop, and that is
      `data-class` inside the row, which already carries the crop's own testid
    */
    data-class={dliClass}
    data-label={DLI_CLASS_LABEL[dliClass]}
    viewBox="0 0 16 16"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
  >
    {CROP_GLYPH[dliClass].map((shape, index) =>
      shape.kind === 'circle' ? (
        <circle
          // the shapes of one glyph are a fixed list in source order, so the index IS the identity
          key={`${dliClass}-${String(index)}`}
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill={shape.filled === true ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={1.2}
        />
      ) : (
        <path
          key={`${dliClass}-${String(index)}`}
          d={shape.d}
          fill={shape.filled === true ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={shape.width ?? 1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ),
    )}
  </svg>
)
