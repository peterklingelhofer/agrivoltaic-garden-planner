//! How much sky each patch of ground can see, ported from `src/sim/viewfactor.ts`.
//!
//! The same quantity the scene's ambient occlusion reads. The picture and the measurement are two
//! readings of one field, and that only holds while there is one implementation of it.

use crate::geom::{GridSpec, UnitVec3, Vec3M};
use crate::math::{clamp, sin_deg};
use crate::shading::beam_visibility_raster;
use crate::solar::sun_unit_vector;

/// One sky patch, as `skydome.rs` will produce them.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SkyPatch {
    pub altitude_deg: f64,
    pub azimuth_deg: f64,
    pub solid_angle_sr: f64,
}

/// The fraction of the hemisphere each cell can see, in [0, 1].
///
/// `sin(altitude)` is the cosine of the zenith angle, which is the projection factor onto a
/// horizontal surface; dividing the total by PI normalises against the unobstructed hemisphere.
pub fn sky_view_factor_raster(
    grid: &GridSpec,
    panels: &[Vec<Vec3M>],
    patches: &[SkyPatch],
) -> Vec<f32> {
    let cells = grid.cells();
    let mut result = vec![0.0f64; cells];
    for patch in patches {
        let visibility = patch_visibility_raster(grid, panels, *patch);
        let weight = sin_deg(patch.altitude_deg) * patch.solid_angle_sr;
        for i in 0..cells {
            result[i] += f64::from(visibility[i]) * weight;
        }
    }
    result
        .into_iter()
        .map(|v| (v / std::f64::consts::PI) as f32)
        .collect()
}

/// A patch is blocked exactly as the beam is, so this is the beam kernel pointed at a patch
/// centre with an opaque module and one sample.
pub fn patch_visibility_raster(
    grid: &GridSpec,
    panels: &[Vec<Vec3M>],
    patch: SkyPatch,
) -> Vec<f32> {
    let direction = sun_unit_vector(patch.altitude_deg, patch.azimuth_deg);
    beam_visibility_raster(
        grid,
        panels,
        UnitVec3 {
            x: direction.0,
            y: direction.1,
            z: direction.2,
        },
        0.0,
        &[],
        1,
    )
}

/// Weight a set of precomputed patch visibilities by each patch's own radiance.
pub fn integrate_patch_radiance(
    visibility: &[Vec<f32>],
    patches: &[SkyPatch],
    patch_radiance: &[f64],
) -> Vec<f32> {
    let cells = visibility.first().map_or(0, Vec::len);
    let mut result = vec![0.0f64; cells];
    for (i, patch) in patches.iter().enumerate() {
        let Some(v) = visibility.get(i) else { continue };
        let weight = sin_deg(patch.altitude_deg)
            * patch.solid_angle_sr
            * patch_radiance.get(i).copied().unwrap_or(0.0);
        for c in 0..cells {
            result[c] += f64::from(v[c]) * weight;
        }
    }
    result.into_iter().map(|v| v as f32).collect()
}

/// Hottel's crossed strings, between two zenith angles.
pub fn crossed_strings_view_factor(start_zenith_rad: f64, end_zenith_rad: f64) -> f64 {
    (end_zenith_rad.sin() - start_zenith_rad.sin()) / 2.0
}

const VF_GROUND_SKY_2D_MAX_ROWS: i64 = 10;

/// The 2-D infinite-row ground-to-sky view factor, sampled across one pitch.
///
/// An oracle rather than a model: it is what the raster kernel is checked against where the
/// geometry is regular enough for a closed form to exist.
pub fn vf_ground_sky_2d_oracle(
    collector_width_m: f64,
    pitch_m: f64,
    tilt_deg: f64,
    clearance_height_m: f64,
    samples: usize,
) -> Vec<f32> {
    let height = clearance_height_m + 0.5 * collector_width_m * sin_deg(tilt_deg);
    let gcr = collector_width_m / pitch_m;
    let half_width = (gcr * pitch_m) / 2.0;
    let dy = half_width * sin_deg(tilt_deg);
    let dx = half_width * crate::math::cos_deg(tilt_deg);
    let span = (2 * VF_GROUND_SKY_2D_MAX_ROWS + 1) as usize;
    let mut result = vec![0.0f32; samples];
    for (i, slot) in result.iter_mut().enumerate() {
        let x = i as f64 / samples as f64;
        let mut lower = vec![0.0f64; span];
        let mut upper = vec![0.0f64; span];
        for k in -VF_GROUND_SKY_2D_MAX_ROWS..=VF_GROUND_SKY_2D_MAX_ROWS {
            let distance = (k as f64 - x) * pitch_m;
            let phi_a = (height + dy).atan2(distance + dx);
            let phi_b = (height - dy).atan2(distance - dx);
            let idx = (k + VF_GROUND_SKY_2D_MAX_ROWS) as usize;
            lower[idx] = phi_a.min(phi_b);
            upper[idx] = phi_a.max(phi_b);
        }
        let mut vf = 0.0;
        for idx in 1..span {
            vf += (upper[idx].cos() - lower[idx - 1].cos()).max(0.0);
        }
        *slot = (vf / 2.0) as f32;
    }
    result
}

/// Two-surface enclosure, `E / (1 - rho_g (1 - SVF) rho_m)`.
///
/// The geometric series is already summed, so no iteration is needed: the solar geometry document section 7.3 and
/// Decision Record section 3.
pub fn interreflection_gain(
    sky_view_factor: f64,
    ground_albedo: f64,
    module_underside_reflectance: f64,
) -> f64 {
    let loss =
        ground_albedo * (1.0 - clamp(sky_view_factor, 0.0, 1.0)) * module_underside_reflectance;
    if loss >= 1.0 {
        1.0
    } else {
        1.0 / (1.0 - loss)
    }
}

/// The module rear sees the ground through `1 - SVF_rear`, the reciprocal of the ground kernel.
pub fn rear_side_poa(
    ground_irradiance: &[f64],
    ground_albedo: f64,
    rear_sky_view_factor: f64,
    bifaciality_factor: f64,
) -> f64 {
    let mean = if ground_irradiance.is_empty() {
        0.0
    } else {
        ground_irradiance.iter().sum::<f64>() / ground_irradiance.len() as f64
    };
    bifaciality_factor * ground_albedo * mean * (1.0 - clamp(rear_sky_view_factor, 0.0, 1.0))
}
