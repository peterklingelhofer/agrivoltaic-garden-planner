import ReactThreeTestRenderer from '@react-three/test-renderer'
import { describe, expect, it } from 'bun:test'
import type { Object3D, Points, PointsMaterial } from 'three'
import { Rain } from './Rain'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const EXTENT = { minXM: -5, minYM: -5, maxXM: 15, maxYM: 15 }

const named = (root: { instance: Object3D }, name: string): Object3D | null =>
  root.instance.getObjectByName(name) ?? null

describe('rain over the garden', () => {
  it('draws a point cloud sized to the hour, and none for a dry hour', async () => {
    const wet = await ReactThreeTestRenderer.create(<Rain mmPerHour={2} extent={EXTENT} />)
    const cloud = named(wet.scene, 'rain') as Points | null
    expect(cloud).not.toBeNull()
    const drops = Number(cloud?.userData.drops)
    expect(drops).toBeGreaterThan(100)
    expect(cloud?.geometry.getAttribute('position').count).toBe(drops)

    const downpour = await ReactThreeTestRenderer.create(<Rain mmPerHour={40} extent={EXTENT} />)
    expect(Number(named(downpour.scene, 'rain')?.userData.drops)).toBeGreaterThan(drops)

    const dry = await ReactThreeTestRenderer.create(<Rain mmPerHour={0} extent={EXTENT} />)
    expect(named(dry.scene, 'rain')).toBeNull()
    await wet.unmount()
    await downpour.unmount()
    await dry.unmount()
  })

  it('falls: a frame later every drop is lower, or wrapped back to the top', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Rain mmPerHour={2} extent={EXTENT} />)
    const cloud = named(renderer.scene, 'rain') as Points
    const before = Float32Array.from(cloud.geometry.getAttribute('position').array as Float32Array)
    await renderer.advanceFrames(1, 0.05)
    const after = cloud.geometry.getAttribute('position').array as Float32Array
    let moved = 0
    for (let index = 1; index < after.length; index += 3) {
      if ((after[index] ?? 0) !== (before[index] ?? 0)) moved += 1
    }
    expect(moved).toBe(after.length / 3)
    await renderer.unmount()
  })

  it('draws snow instead when the kind is snow: slower, bigger, whiter drops', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <Rain mmPerHour={2} extent={EXTENT} kind="snow" />,
    )
    const cloud = named(renderer.scene, 'rain') as Points
    const material = cloud.material as PointsMaterial
    expect(material.size).toBeCloseTo(0.22, 6)
    expect(material.opacity).toBeCloseTo(0.9, 6)
    expect(material.color.getHex()).toBe(0xffffff)

    const before = Float32Array.from(cloud.geometry.getAttribute('position').array as Float32Array)
    await renderer.advanceFrames(1, 0.05)
    const after = cloud.geometry.getAttribute('position').array as Float32Array
    // snow falls at 1.2 m/s: 0.05 s of fall is 0.06 m, far short of rain's 8 m/s * 0.05 s = 0.4 m
    const dropped = (before[1] ?? 0) - (after[1] ?? 0)
    expect(dropped).toBeCloseTo(0.06, 2)
    await renderer.unmount()
  })

  it('draws rain by default, unchanged, when no kind is given', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Rain mmPerHour={2} extent={EXTENT} />)
    const material = (named(renderer.scene, 'rain') as Points).material as PointsMaterial
    expect(material.size).toBeCloseTo(0.11, 6)
    expect(material.opacity).toBeCloseTo(0.75, 6)
    expect(material.color.getHex()).toBe(0xeef3f8)
    await renderer.unmount()
  })
})
