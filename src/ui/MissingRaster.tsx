import type { ReactElement } from 'react'
import { useAppStore } from '../state/store'
import { lightRequirement, requirementKey } from './requirement'
import { RequirementNotice } from './RequirementNotice'

/**
 * What a surface says when the light has not been computed, and the press that computes it.
 *
 * A thin wrapper over `RequirementNotice`, which is that idea generalised: this file is kept
 * because two panels ask for exactly the light and it is worth naming, but the sentence, the button
 * and the busy state are the shared ones. `SimPanel` is deliberately not a caller: it is the panel
 * the bake belongs to and it already carries the run controls, so a second button there would be
 * the same press twice
 */
export const MISSING_RASTER =
  "How much light reaches the ground hasn't been computed yet, and everything on this panel is read off it"

export const MissingRaster = ({ testId }: { readonly testId: string }): ReactElement | null => {
  // subscribed to the key, built from a read: a builder returns a fresh object every call and
  // so can never be a selector, which is a re-render loop rather than a wrong answer
  useAppStore(requirementKey)
  const requirement = lightRequirement(useAppStore.getState())
  return (
    <RequirementNotice
      requirement={{ ...requirement, met: false, reason: MISSING_RASTER }}
      testId={testId}
    />
  )
}
