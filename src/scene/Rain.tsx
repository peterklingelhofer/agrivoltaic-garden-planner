import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactElement } from 'react'
import { BufferAttribute, BufferGeometry, type Points } from 'three'
import { rainDrops, type RainExtent } from './sceneMath'

/** Rain falls at about 7 to 9 m/s; the exact figure is a look, not a measurement */
const FALL_M_PER_S = 8
/** Snow falls far slower than rain; the exact figure is a look, not a measurement */
const SNOW_FALL_M_PER_S = 1.2
/** How high above the ground the drops start, so they are seen falling past the panels */
const CEILING_M = 12
/** Drops on screen in a downpour; a drizzle draws a fraction of them */
const MAX_DROPS = 1600
/** Around this rate the whole cloud of drops is drawn; the record's heavier hours look the same */
const DOWNPOUR_MM_PER_HOUR = 4

/** How each kind falls and looks, read off the hour's own air temperature by the caller */
const LOOK: Readonly<
  Record<
    'rain' | 'snow',
    {
      readonly fallMPerS: number
      readonly size: number
      readonly opacity: number
      readonly color: number
    }
  >
> = {
  rain: { fallMPerS: FALL_M_PER_S, size: 0.11, opacity: 0.75, color: 0xeef3f8 },
  snow: { fallMPerS: SNOW_FALL_M_PER_S, size: 0.22, opacity: 0.9, color: 0xffffff },
}

export interface RainProps {
  readonly mmPerHour: number
  readonly extent: RainExtent
  /** Snow at or below freezing, read off the hour's own air temperature; rain otherwise */
  readonly kind?: 'rain' | 'snow'
}

/**
 * The rain, or snow, that fell in the hour the clock is on, over the garden (Decision Record 14.5).
 *
 * A point cloud over the plot, falling and wrapping. How many drops is the hour's own rate, so a
 * drizzle and a downpour read differently, and nothing here reaches the light, the water balance
 * or the yield: those read the same hour of the same record directly. Instanced positions are
 * written once and the y column is advanced per frame, which is the cheap way to fall
 */
export const Rain = ({ mmPerHour, extent, kind = 'rain' }: RainProps): ReactElement | null => {
  const ref = useRef<Points | null>(null)
  const look = LOOK[kind]
  const count = Math.min(MAX_DROPS, Math.round((MAX_DROPS * mmPerHour) / DOWNPOUR_MM_PER_HOUR))
  const geometry = useMemo(() => {
    const made = new BufferGeometry()
    made.setAttribute('position', new BufferAttribute(rainDrops(count, extent, CEILING_M), 3))
    return made
  }, [count, extent])

  useFrame((_, delta) => {
    const points = ref.current
    if (!points) return
    const attribute = points.geometry.getAttribute('position') as BufferAttribute
    const array = attribute.array as Float32Array
    const fall = look.fallMPerS * Math.min(delta, 0.1)
    for (let index = 1; index < array.length; index += 3) {
      const y = (array[index] ?? 0) - fall
      array[index] = y < 0 ? y + CEILING_M : y
    }
    attribute.needsUpdate = true
  })

  if (count === 0) return null

  return (
    <points ref={ref} name="rain" geometry={geometry} userData={{ mmPerHour, drops: count, kind }}>
      <pointsMaterial
        color={look.color}
        size={look.size}
        sizeAttenuation
        transparent
        opacity={look.opacity}
        depthWrite={false}
      />
    </points>
  )
}
