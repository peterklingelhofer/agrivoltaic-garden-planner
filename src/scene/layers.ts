/**
 * The render layers that aren't the scene itself.
 *
 * The DLI overlay is a model readout printed on the ground, and the renderer has to treat it as
 * one: it's drawn after the lit pass, it's exempt from tone mapping, and it must not appear in the
 * depth and normal buffers the occlusion pass integrates, where a plane 3 cm above the ground is a
 * 3 cm cliff at its edge
 */
export const OVERLAY_LAYER = 1
