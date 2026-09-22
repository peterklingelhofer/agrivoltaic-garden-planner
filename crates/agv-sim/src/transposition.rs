//! Plane-of-array irradiance, ported from `src/sim/transposition.ts`.
//!
//! Perez, Ineichen, Seals, Michalsky & Stewart 1990, Solar Energy 44(5) 271-289, with the
//! isotropic and Hay & Davies 1980 models beside it because the TypeScript keeps all three and
//! the tests lean on the cheap ones to pin the expensive one at its degenerate tilts.
//!
//! Coefficients come from `perez_tables.rs`, generated from the TypeScript. See `solar.rs` for
//! why the port is deliberately literal

use crate::math::{cos_deg, edge_bin, sin_deg, DEG_TO_RAD};
use crate::perez_tables::{PEREZ_1990_ALLSITES, PEREZ_EPSILON_EDGES};

pub const PEREZ_KAPPA_RADIANS: f64 = 1.041;

#[derive(Debug, Clone, Copy)]
pub struct TranspositionInput {
    pub dni_wm2: f64,
    pub dhi_wm2: f64,
    pub ghi_wm2: f64,
    pub zenith_deg: f64,
    /// Kasten-Young at sea-level pressure, with NO pressure correction.
    ///
    /// Perez 1990 fits its coefficients against this one and pvlib's `perez` documents the same,
    /// which is why the field says which it wants: the neighboring `DecompositionSample` carries
    /// the pressure-corrected air mass DISC and DIRINT want, and handing that one over here
    /// overstates sky diffuse by about 1% at 1,800 m. `docs/VALIDATION.md` section 1 measures it
    pub relative_air_mass: f64,
    pub extraterrestrial_normal_wm2: f64,
    pub surface_tilt_deg: f64,
    pub surface_azimuth_deg: f64,
    pub solar_azimuth_deg: f64,
    pub ground_albedo: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PoaComponents {
    pub beam_wm2: f64,
    pub sky_diffuse_wm2: f64,
    pub ground_reflected_wm2: f64,
    pub global_wm2: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PerezSkyState {
    pub clearness_epsilon: f64,
    pub brightness_delta: f64,
    pub bin_index: usize,
    pub f1: f64,
    pub f2: f64,
}

/// Lower edges of the eight Perez sky-clearness bins. `eps < 1.065` is bin 0
pub fn perez_clearness_bin(epsilon: f64) -> usize {
    edge_bin(epsilon, PEREZ_EPSILON_EDGES)
}

fn cos_aoi(input: &TranspositionInput) -> f64 {
    cos_deg(input.zenith_deg) * cos_deg(input.surface_tilt_deg)
        + sin_deg(input.zenith_deg)
            * sin_deg(input.surface_tilt_deg)
            * cos_deg(input.solar_azimuth_deg - input.surface_azimuth_deg)
}

fn assemble(input: &TranspositionInput, sky_diffuse_wm2: f64) -> PoaComponents {
    let beam_wm2 = input.dni_wm2 * cos_aoi(input).max(0.0);
    let ground_reflected_wm2 =
        input.ghi_wm2 * input.ground_albedo * ((1.0 - cos_deg(input.surface_tilt_deg)) / 2.0);
    PoaComponents {
        beam_wm2,
        sky_diffuse_wm2,
        ground_reflected_wm2,
        global_wm2: beam_wm2 + sky_diffuse_wm2 + ground_reflected_wm2,
    }
}

pub fn perez_sky_state(input: &TranspositionInput) -> PerezSkyState {
    if input.dhi_wm2 == 0.0 {
        return PerezSkyState {
            clearness_epsilon: 1.0,
            brightness_delta: 0.0,
            bin_index: 0,
            f1: 0.0,
            f2: 0.0,
        };
    }
    let z = input.zenith_deg * DEG_TO_RAD;
    let kappa_z3 = PEREZ_KAPPA_RADIANS * z.powi(3);
    let clearness_epsilon =
        ((input.dhi_wm2 + input.dni_wm2) / input.dhi_wm2 + kappa_z3) / (1.0 + kappa_z3);
    let brightness_delta =
        (input.dhi_wm2 * input.relative_air_mass) / input.extraterrestrial_normal_wm2;
    let bin_index = perez_clearness_bin(clearness_epsilon);
    let row = PEREZ_1990_ALLSITES
        .get(bin_index)
        .copied()
        .unwrap_or([0.0; 6]);
    let f1 = (row[0] + row[1] * brightness_delta + row[2] * z).max(0.0);
    let f2 = row[3] + row[4] * brightness_delta + row[5] * z;
    PerezSkyState {
        clearness_epsilon,
        brightness_delta,
        bin_index,
        f1,
        f2,
    }
}

pub fn perez_transposition_1990(input: &TranspositionInput) -> PoaComponents {
    if input.dhi_wm2 == 0.0 {
        return assemble(input, 0.0);
    }
    let state = perez_sky_state(input);
    let a = cos_aoi(input).max(0.0);
    // the 85-degree floor is what stops the circumsolar term exploding at the horizon
    let b = cos_deg(85.0).max(cos_deg(input.zenith_deg));
    let sky_diffuse_wm2 = (input.dhi_wm2
        * (0.5 * (1.0 - state.f1) * (1.0 + cos_deg(input.surface_tilt_deg))
            + (state.f1 * a) / b
            + state.f2 * sin_deg(input.surface_tilt_deg)))
    .max(0.0);
    assemble(input, sky_diffuse_wm2)
}

pub fn isotropic_transposition(input: &TranspositionInput) -> PoaComponents {
    assemble(
        input,
        input.dhi_wm2 * ((1.0 + cos_deg(input.surface_tilt_deg)) / 2.0),
    )
}

/// Hay & Davies 1980
pub fn hay_davies_transposition(input: &TranspositionInput) -> PoaComponents {
    let ai = input.dni_wm2 / input.extraterrestrial_normal_wm2;
    let rb = cos_aoi(input).max(0.0) / cos_deg(85.0).max(cos_deg(input.zenith_deg));
    let sky_diffuse_wm2 =
        input.dhi_wm2 * (ai * rb + (1.0 - ai) * ((1.0 + cos_deg(input.surface_tilt_deg)) / 2.0));
    assemble(input, sky_diffuse_wm2)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat_sky(dhi: f64, tilt: f64) -> TranspositionInput {
        TranspositionInput {
            dni_wm2: 0.0,
            dhi_wm2: dhi,
            ghi_wm2: dhi,
            zenith_deg: 30.0,
            relative_air_mass: 1.0,
            extraterrestrial_normal_wm2: 1361.0,
            surface_tilt_deg: tilt,
            surface_azimuth_deg: 180.0,
            solar_azimuth_deg: 180.0,
            ground_albedo: 0.0,
        }
    }

    /// At tilt 0 the sky is the whole hemisphere, so every model must return the DHI unchanged. The
    /// test asserts that closed form directly
    #[test]
    fn a_horizontal_surface_sees_all_of_the_diffuse_sky() {
        let input = flat_sky(200.0, 0.0);
        assert!((isotropic_transposition(&input).sky_diffuse_wm2 - 200.0).abs() < 1e-9);
        assert!((perez_transposition_1990(&input).sky_diffuse_wm2 - 200.0).abs() < 1e-9);
    }

    /// Isotropic sky on a tilted plane is `dhi * (1 + cos t) / 2` by definition
    #[test]
    fn the_isotropic_model_is_its_own_closed_form() {
        let input = flat_sky(200.0, 30.0);
        let want = 200.0 * ((1.0 + cos_deg(30.0)) / 2.0);
        assert!((isotropic_transposition(&input).sky_diffuse_wm2 - want).abs() < 1e-9);
    }

    /// With no diffuse there is no sky term at all, and Perez short-circuits to avoid dividing
    /// by zero
    #[test]
    fn no_diffuse_means_no_sky_diffuse_and_no_division_by_zero() {
        let mut input = flat_sky(0.0, 30.0);
        input.dni_wm2 = 900.0;
        let poa = perez_transposition_1990(&input);
        assert_eq!(poa.sky_diffuse_wm2, 0.0);
        assert!(poa.beam_wm2 > 0.0);
        assert!(poa.global_wm2.is_finite());
    }

    #[test]
    fn clearness_bins_are_the_published_edges() {
        assert_eq!(perez_clearness_bin(1.0), 0);
        assert_eq!(perez_clearness_bin(1.065), 1);
        assert_eq!(perez_clearness_bin(6.2), 7);
        assert_eq!(perez_clearness_bin(1000.0), 7);
    }

    /// Ground reflection is the albedo times the fraction of ground in view, and a horizontal
    /// panel sees none of it
    #[test]
    fn ground_reflection_grows_with_tilt_and_is_zero_when_flat() {
        let mut flat = flat_sky(200.0, 0.0);
        flat.ground_albedo = 0.2;
        assert!(isotropic_transposition(&flat).ground_reflected_wm2.abs() < 1e-12);
        let mut vertical = flat_sky(200.0, 90.0);
        vertical.ground_albedo = 0.2;
        let want = 200.0 * 0.2 * 0.5;
        assert!((isotropic_transposition(&vertical).ground_reflected_wm2 - want).abs() < 1e-9);
    }
}
