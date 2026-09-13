import { useEffect, useState } from 'react'
import { SRGBColorSpace, TextureLoader, type Texture } from 'three'
import { imageryUrl } from '../state/imagery'
import type { LatLon } from '../types/geo'

// Optional backdrop: the scene renders identically when the tile service is unreachable
export const useImageryTexture = (location: LatLon, enabled: boolean): Texture | null => {
  const [texture, setTexture] = useState<Texture | null>(null)
  const url = imageryUrl(location)

  useEffect(() => {
    if (!enabled) return
    let live = true
    new TextureLoader().load(
      url,
      (result) => {
        if (!live) {
          result.dispose()
          return
        }
        result.colorSpace = SRGBColorSpace
        setTexture(result)
      },
      undefined,
      () => {
        if (live) setTexture(null)
      },
    )
    return () => {
      live = false
    }
  }, [url, enabled])

  useEffect(() => () => texture?.dispose(), [texture])

  return enabled ? texture : null
}
