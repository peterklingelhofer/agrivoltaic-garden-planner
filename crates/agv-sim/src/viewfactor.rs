//! View factors: crossed strings, and the two terms the PV chain's rear side reads,
//! inter-reflection and rear-side POA

use crate::math::clamp;

/// Hottel's crossed strings, between two zenith angles
pub fn crossed_strings_view_factor(start_zenith_rad: f64, end_zenith_rad: f64) -> f64 {
    (end_zenith_rad.sin() - start_zenith_rad.sin()) / 2.0
}

/// Two-surface enclosure, `E / (1 - rho_g (1 - SVF) rho_m)`.
///
/// The geometric series is already summed, so no iteration is needed (Decision Record section 3)
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

/// The module rear sees the ground through `1 - SVF_rear`, the reciprocal of the ground kernel
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
