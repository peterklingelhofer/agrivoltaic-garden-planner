//! Turning irradiance into the quantity a plant responds to, ported from `src/sim/units.ts`.
//!
//! Daily light integral is the number this whole application exists to compute, so these few
//! lines sit under every claim it makes about whether a crop can live in a bed. They are short
//! enough to check by eye against the agrivoltaics document section 1.3, which is why the tests below assert the
//! published constants rather than agreement with anything.

use crate::math::clamp;

pub const PAR_FRACTION_DEFAULT: f64 = 0.45;
pub const PAR_FRACTION_RANGE: (f64, f64) = (0.42, 0.5);
pub const PHOTON_CONVERSION_UMOL_PER_J: f64 = 4.57;
pub const BROADBAND_UMOL_PER_J: f64 = 2.06;
pub const SOLAR_CONSTANT_W_M2: f64 = 1361.1;

/// Diffuse skylight is blue-shifted, so it carries more photons per joule. The solar geometry document section 2.6.
pub const BEAM_UMOL_PER_J: f64 = 2.0;
pub const DIFFUSE_UMOL_PER_J: f64 = 2.15;

pub const KWH_TO_MJ: f64 = 3.6;
pub const SECONDS_PER_HOUR: f64 = 3600.0;

pub fn ppfd_from_shortwave(irradiance_wm2: f64, par_fraction: f64) -> f64 {
    irradiance_wm2 * par_fraction * PHOTON_CONVERSION_UMOL_PER_J
}

/// Two bands rather than one broadband fraction, which is the whole reason the two constants above
/// differ: under an array the diffuse share rises, and a single conversion would miss that.
pub fn ppfd_two_band(beam_horizontal_wm2: f64, diffuse_horizontal_wm2: f64) -> f64 {
    beam_horizontal_wm2 * BEAM_UMOL_PER_J + diffuse_horizontal_wm2 * DIFFUSE_UMOL_PER_J
}

pub fn dli_from_ppfd_sum(samples: &[f32], step_seconds: f64) -> f64 {
    let total: f64 = samples.iter().map(|v| f64::from(*v)).sum();
    (total * step_seconds) / 1e6
}

/// `DLI = GHI(MJ) x 1e6 J/MJ x f_PAR x 4.57 umol/J / 1e6 umol/mol`, the agrivoltaics document section 1.3.
pub fn dli_from_daily_ghi_mj(ghi_mj: f64, par_fraction: f64) -> f64 {
    ghi_mj * par_fraction * PHOTON_CONVERSION_UMOL_PER_J
}

pub fn dli_from_daily_ghi_kwh(ghi_kwh: f64, par_fraction: f64) -> f64 {
    dli_from_daily_ghi_mj(ghi_kwh * KWH_TO_MJ, par_fraction)
}

/// The canonical definition of relative shade ratio. "Shade fraction" is the same quantity;
/// `docs/ARCHITECTURE.md` section 2 says so, and there is one of it for that reason.
pub fn relative_shade_ratio(under_array: f64, open_sky: f64) -> f64 {
    if open_sky <= 0.0 {
        0.0
    } else {
        clamp(1.0 - under_array / open_sky, 0.0, 1.0)
    }
}

pub fn mol_per_m2_from_wh_per_m2(wh_per_m2: f64, par_fraction: f64) -> f64 {
    (wh_per_m2 * SECONDS_PER_HOUR * par_fraction * PHOTON_CONVERSION_UMOL_PER_J) / 1e6
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The worked example in the agrivoltaics document section 1.3: 20 MJ/m2/day at the default PAR fraction.
    #[test]
    fn the_daily_light_integral_matches_the_worked_example() {
        let dli = dli_from_daily_ghi_mj(20.0, PAR_FRACTION_DEFAULT);
        assert!((dli - 41.13).abs() < 0.005, "got {dli}");
    }

    /// The two routes to a DLI must agree, since a kilowatt-hour is 3.6 MJ by definition.
    #[test]
    fn the_two_daily_routes_are_one_conversion() {
        let from_mj = dli_from_daily_ghi_mj(18.0, PAR_FRACTION_DEFAULT);
        let from_kwh = dli_from_daily_ghi_kwh(18.0 / KWH_TO_MJ, PAR_FRACTION_DEFAULT);
        assert!((from_mj - from_kwh).abs() < 1e-12);
    }

    /// Full sun and full shade are the ends of the ratio, and open sky of zero is refused rather
    /// than dividing.
    #[test]
    fn the_shade_ratio_is_bounded_and_refuses_a_dark_sky() {
        assert_eq!(relative_shade_ratio(10.0, 10.0), 0.0);
        assert_eq!(relative_shade_ratio(0.0, 10.0), 1.0);
        assert_eq!(relative_shade_ratio(5.0, 0.0), 0.0);
        // more light under the array than over it is a measurement error, not a negative shade
        assert_eq!(relative_shade_ratio(12.0, 10.0), 0.0);
    }

    /// The diffuse band carries more photons per joule than the beam band, which is the fact the
    /// two-band conversion exists to represent.
    #[test]
    fn diffuse_light_carries_more_photons_than_beam() {
        // a const block, because clippy is right that comparing two constants is decided at
        // compile time; that is exactly the property worth asserting, so it moves rather than goes
        const { assert!(DIFFUSE_UMOL_PER_J > BEAM_UMOL_PER_J) };
        let all_beam = ppfd_two_band(500.0, 0.0);
        let all_diffuse = ppfd_two_band(0.0, 500.0);
        assert!(all_diffuse > all_beam);
    }
}
