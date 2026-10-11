import type { ReactElement } from 'react'
import { COMPASS_ELEMENT_ID } from '../state/compass'

/**
 * The needle that says which way north is.
 *
 * The camera can be orbited to any bearing, and without this nothing on screen says which way north
 * runs: someone typing where a house stands has to guess which way east and north go.
 * `CompassBridge` turns this element every drawn frame. The markup here only has to exist and carry
 * the id it writes to.
 *
 * `aria-hidden`: a rotating arrow says nothing to a screen reader, and the canvas already carries
 * its own label. Two elements, so the rotation written to the needle every frame never touches
 * the box that places it, which is the garden's corner on a laptop and the top bar on a phone
 */
export const SceneCompass = (): ReactElement => (
  <div className="scene-compass" aria-hidden="true">
    <div className="scene-compass-needle" id={COMPASS_ELEMENT_ID} data-testid="readout-compass">
      <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <polygon points="20,7 25,24 20,20.5 15,24" fill="var(--accent)" />
        <text
          x="20"
          y="33"
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fontFamily="inherit"
          fill="var(--text)"
        >
          N
        </text>
      </svg>
    </div>
  </div>
)
