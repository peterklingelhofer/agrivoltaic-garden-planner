import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { useAppStore } from '../state/store'
import { deviceProfile, resolveQuality, type RenderQuality } from './quality'

/**
 * The tier, read where it is needed rather than passed down. Every surface in the scene has
 * something to degrade, and threading one prop through five components would make the tier a
 * thing a caller can forget rather than a thing the renderer knows
 */
export const useRenderQuality = (): RenderQuality => {
  const setting = useAppStore((s) => s.lighting)
  const maxTextureSize = useThree((s) => s.gl.capabilities.maxTextureSize)
  return useMemo(
    () => resolveQuality(setting, deviceProfile(maxTextureSize)),
    [setting, maxTextureSize],
  )
}
