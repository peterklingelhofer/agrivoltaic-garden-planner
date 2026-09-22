import { useFrame } from '@react-three/fiber'
import { useRef, type ReactElement } from 'react'
import { type PerspectiveCamera, type Sprite, Vector3 } from 'three'
import { centroidOf } from '../state/geom'
import { EMPTY_LIST } from '../state/slices'
import { scenePlot, useAppStore } from '../state/store'
import type { Bed } from '../types/garden'
import { BedLabel } from './BedLabel'

/**
 * Every bed's name, with the ones that would print over each other kept quiet.
 *
 * A label is the same size on screen at every distance, so from far enough away eleven beds a
 * few metres apart put eleven labels in a row a few pixels apart: a gardener zoomed out on a
 * full plot and read "Bed 11ed 10ed 9ed 8" across the picture. Each frame the labels are
 * projected, the nearest is kept, and any label whose box would overlap one already kept is
 * hidden until the camera comes close enough for it to have room. Nearest first, because the
 * near bed is the one the pointer is about to reach.
 *
 * Done on the sprites themselves, without going through React state, because it changes with every
 * camera move and a render per frame is what the demand frameloop exists to avoid. The world
 * position is re-read each frame too, with the bed group's own offset added, so a label rides
 * along with a bed that is being dragged in Move mode
 */
const projected = new Vector3()

export const BedLabels = (): ReactElement => {
  const beds = useAppStore((s) => scenePlot(s)?.beds ?? (EMPTY_LIST as readonly Bed[]))
  const sprites = useRef(new Map<string, Sprite>())

  useFrame(({ camera, scene, size }) => {
    const perspective = camera as PerspectiveCamera
    // pixels per unit of sprite scale, from the projection: a sprite that ignores distance is
    // `scale * P[1][1]` tall in clip space, and clip space is two units over the picture's height
    const scaleToPx = ((perspective.projectionMatrix.elements[5] ?? 1) * size.height) / 2
    const boxes: { x: number; y: number; w: number; h: number; depth: number; sprite: Sprite }[] =
      []
    for (const bed of beds) {
      const sprite = sprites.current.get(bed.id as string)
      if (sprite === undefined) continue
      const centre = centroidOf(bed.footprint.exterior)
      const group = scene.getObjectByName(`bed-${bed.id as string}`)
      sprite.position.set(
        centre.xM + (group?.position.x ?? 0),
        sprite.position.y,
        -centre.yM + (group?.position.z ?? 0),
      )
      projected.copy(sprite.position).project(camera)
      // behind the camera, or off the picture: nothing to collide with, nothing to show
      if (projected.z > 1 || Math.abs(projected.x) > 1.2 || Math.abs(projected.y) > 1.2) {
        sprite.visible = false
        continue
      }
      boxes.push({
        x: ((projected.x + 1) / 2) * size.width,
        y: ((1 - projected.y) / 2) * size.height,
        w: sprite.scale.x * scaleToPx,
        h: sprite.scale.y * scaleToPx,
        depth: projected.z,
        sprite,
      })
    }
    boxes.sort((a, b) => a.depth - b.depth)
    const kept: typeof boxes = []
    for (const box of boxes) {
      const clash = kept.some(
        (other) =>
          Math.abs(other.x - box.x) < (other.w + box.w) / 2 &&
          Math.abs(other.y - box.y) < (other.h + box.h) / 2,
      )
      box.sprite.visible = !clash
      if (!clash) kept.push(box)
    }
  })

  return (
    <group name="bed-labels">
      {beds.map((bed) => {
        const centre = centroidOf(bed.footprint.exterior)
        return (
          <BedLabel
            key={bed.id}
            text={bed.label}
            position={[centre.xM, bed.raisedHeightM, -centre.yM]}
            onSprite={(sprite) => {
              if (sprite === null) sprites.current.delete(bed.id as string)
              else sprites.current.set(bed.id as string, sprite)
            }}
          />
        )
      })}
    </group>
  )
}
