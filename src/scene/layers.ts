/**
 * The render layers that are not the scene itself.
 *
 * The DLI overlay is a model readout printed on the ground, not a surface in the scene, and the
 * difference has to be visible to the renderer: it is drawn after the lit pass, it is exempt
 * from tone mapping, and it must not appear in the depth and normal buffers the occlusion pass
 * integrates, where a plane 3 cm above the ground is a 3 cm cliff at its edge
 */
export const OVERLAY_LAYER = 1
