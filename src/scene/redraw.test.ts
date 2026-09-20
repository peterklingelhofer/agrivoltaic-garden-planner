import { describe, expect, it } from 'bun:test'
import {
  BoxGeometry,
  DirectionalLight,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Sprite,
} from 'three'
import { shadowContentOf } from './redraw'

/** A caster and receiver both, the shape most of the scene is made of */
const caster = (): Mesh => {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

describe('shadowContentOf', () => {
  it('reads an unchanged scene the same way twice', () => {
    const scene = new Scene()
    scene.add(caster())
    scene.updateMatrixWorld()
    expect(shadowContentOf(scene)).toBe(shadowContentOf(scene))
  })

  it('changes when a mesh with castShadow is added', () => {
    const scene = new Scene()
    scene.updateMatrixWorld()
    const before = shadowContentOf(scene)
    scene.add(caster())
    scene.updateMatrixWorld()
    expect(shadowContentOf(scene)).not.toBe(before)
  })

  it('changes when a caster moves, directly or through its group', () => {
    const scene = new Scene()
    const mesh = caster()
    scene.add(mesh)
    scene.updateMatrixWorld()
    const beforeDirect = shadowContentOf(scene)
    mesh.position.x += 1
    scene.updateMatrixWorld()
    expect(shadowContentOf(scene)).not.toBe(beforeDirect)

    const grouped = new Scene()
    const group = new Group()
    group.add(caster())
    grouped.add(group)
    grouped.updateMatrixWorld()
    const beforeGroup = shadowContentOf(grouped)
    group.position.x += 1
    grouped.updateMatrixWorld()
    expect(shadowContentOf(grouped)).not.toBe(beforeGroup)
  })

  it('changes when a caster gets a new geometry', () => {
    const scene = new Scene()
    const mesh = caster()
    scene.add(mesh)
    scene.updateMatrixWorld()
    const before = shadowContentOf(scene)
    mesh.geometry = new BoxGeometry(2, 2, 2)
    expect(shadowContentOf(scene)).not.toBe(before)
  })

  it('changes when an instanced mesh is flagged for an update', () => {
    const scene = new Scene()
    const instances = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial(), 4)
    instances.castShadow = true
    scene.add(instances)
    scene.updateMatrixWorld()
    const before = shadowContentOf(scene)
    instances.instanceMatrix.needsUpdate = true
    expect(shadowContentOf(scene)).not.toBe(before)
  })

  it('changes when a directional light target moves', () => {
    const scene = new Scene()
    const light = new DirectionalLight()
    light.castShadow = true
    scene.add(light)
    scene.add(light.target)
    scene.updateMatrixWorld()
    const before = shadowContentOf(scene)
    light.target.position.x += 1
    scene.updateMatrixWorld()
    expect(shadowContentOf(scene)).not.toBe(before)
  })

  it('leaves a sprite or an unflagged mesh out of it', () => {
    const scene = new Scene()
    scene.add(caster())
    const sprite = new Sprite()
    scene.add(sprite)
    scene.updateMatrixWorld()
    const beforeSprite = shadowContentOf(scene)
    sprite.position.x += 1
    scene.updateMatrixWorld()
    expect(shadowContentOf(scene)).toBe(beforeSprite)

    const plain = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
    scene.add(plain)
    scene.updateMatrixWorld()
    const beforePlain = shadowContentOf(scene)
    plain.position.x += 1
    scene.updateMatrixWorld()
    expect(shadowContentOf(scene)).toBe(beforePlain)
  })

  it('changes when a caster is hidden', () => {
    const scene = new Scene()
    const mesh = caster()
    scene.add(mesh)
    scene.updateMatrixWorld()
    const before = shadowContentOf(scene)
    mesh.visible = false
    expect(shadowContentOf(scene)).not.toBe(before)
  })
})
