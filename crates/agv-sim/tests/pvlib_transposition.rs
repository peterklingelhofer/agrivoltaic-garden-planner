//! What `pvlib.irradiance.perez` returns for the same sky, ported as data.
//!
//! Same structure and same reason as `nrel_spa.rs` and `pvlib_decomposition.rs`: the numbers
//! below are pvlib 0.15.2's own, so what they assert is that the Rust is RIGHT.
//! Until this file existed, `transposition.rs` was the one link in the irradiance chain with no
//! external arbiter: solar position is diffed against NREL and the decomposition against pvlib,
//! and the transposition sitting between them was checked only against its own closed forms at
//! the two tilts where every model agrees.
//!
//! `bins_are_all_covered` fails if a later edit thins the cases out below one per coefficient row.
//!
//! pvlib documents its `airmass` argument as RELATIVE, with no pressure correction, so the field is
//! named for that convention and `pv/chain.rs` recomputes it from the zenith. `docs/VALIDATION.md`
//! section 1 measures what feeding it the pressure-corrected series the decomposition needs would
//! cost

use agv_sim::transposition::{
    perez_clearness_bin, perez_sky_state, perez_transposition_1990, TranspositionInput,
};

const I0: f64 = 1361.0;

/// Kasten & Young 1989 with no pressure term, which is what pvlib's `perez` wants
fn relative_air_mass(zenith_deg: f64) -> f64 {
    1.0 / (zenith_deg.to_radians().cos() + 0.50572 * (96.07995 - zenith_deg).powf(-1.6364))
}

/// zenith, DNI, DHI, tilt, surface azimuth, solar azimuth, relative air mass, pvlib's answer
type Case = (f64, f64, f64, f64, f64, f64, f64, f64);

/// All eight Perez sky-clearness bins, both signs of the horizon term, a surface turned away from
/// the sun, and a zenith past 85 where the circumsolar denominator clamps
const CASES: [Case; 14] = [
    // bin 7, clear sky near noon
    (
        20.0,
        900.0,
        90.0,
        30.0,
        180.0,
        180.0,
        1.063_699_987_068_631,
        96.451_129_882_553_54,
    ),
    // bin 7, clear sky mid-morning
    (
        40.0,
        850.0,
        110.0,
        30.0,
        180.0,
        150.0,
        1.304_223_540_913_535,
        128.154_590_764_166_9,
    ),
    // bin 5
    (
        60.0,
        700.0,
        140.0,
        35.0,
        180.0,
        120.0,
        1.994_292_852_529_249,
        167.033_753_258_198_8,
    ),
    // bin 3, low sun
    (
        75.0,
        400.0,
        160.0,
        40.0,
        180.0,
        100.0,
        3.812_911_869_220_776,
        156.336_371_787_766_8,
    ),
    // bin 2, mostly diffuse
    (
        30.0,
        200.0,
        350.0,
        25.0,
        180.0,
        170.0,
        1.153_992_233_363_676,
        361.209_770_866_755_2,
    ),
    // bin 1, overcast
    (
        45.0,
        60.0,
        300.0,
        20.0,
        180.0,
        140.0,
        1.412_595_252_026_274,
        304.361_282_481_070_8,
    ),
    // bin 0, no beam at all
    (
        55.0,
        0.0,
        220.0,
        30.0,
        180.0,
        130.0,
        1.739_936_785_899_708,
        207.007_082_187_165_2,
    ),
    // vertical east, an orientation the layout tool offers
    (
        35.0,
        950.0,
        60.0,
        90.0,
        90.0,
        110.0,
        1.219_874_228_998_671,
        48.928_820_738_582_84,
    ),
    // vertical west, the same sky with the surface turned away from the sun
    (
        35.0,
        950.0,
        60.0,
        90.0,
        270.0,
        110.0,
        1.219_874_228_998_671,
        28.885_511_723_193_52,
    ),
    // bin 4, sun in the west
    (
        65.0,
        500.0,
        180.0,
        15.0,
        180.0,
        250.0,
        2.356_019_282_209_251,
        191.389_055_931_377,
    ),
    // bin 3 at a steep tilt and a long path
    (
        80.0,
        250.0,
        120.0,
        45.0,
        180.0,
        85.0,
        5.586_035_879_851_2,
        88.892_421_477_188_85,
    ),
    // bin 7 nearly flat, near the isotropic limit
    (
        10.0,
        980.0,
        70.0,
        5.0,
        180.0,
        200.0,
        1.015_071_159_432_311,
        71.189_021_096_531_85,
    ),
    // bin 6, the band the first twelve cases missed
    (
        50.0,
        600.0,
        90.0,
        30.0,
        180.0,
        145.0,
        1.553_406_662_923_92,
        117.857_971_692_071_9,
    ),
    // zenith past 85, where the circumsolar denominator clamps
    (
        88.0,
        120.0,
        90.0,
        30.0,
        180.0,
        95.0,
        19.433_245_107_572,
        76.147_358_667_135_32,
    ),
];

fn input(
    (
        zenith_deg,
        dni_wm2,
        dhi_wm2,
        surface_tilt_deg,
        surface_azimuth_deg,
        solar_azimuth_deg,
        air_mass,
        _want,
    ): (f64, f64, f64, f64, f64, f64, f64, f64),
) -> TranspositionInput {
    TranspositionInput {
        dni_wm2,
        dhi_wm2,
        // pvlib's perez never reads GHI. It's here for the ground term, which this file ignores
        ghi_wm2: dhi_wm2 + dni_wm2 * zenith_deg.to_radians().cos().max(0.0),
        zenith_deg,
        relative_air_mass: air_mass,
        extraterrestrial_normal_wm2: I0,
        surface_tilt_deg,
        surface_azimuth_deg,
        solar_azimuth_deg,
        ground_albedo: 0.0,
    }
}

/// A tenth of a watt on sky diffuse figures that run to 360 W/m2, so about three parts in ten
/// thousand at the top of the range. The two implementations are the same closed form over the
/// same coefficient table, and the only thing between them is f64 rounding, so a looser bound
/// would let a transcribed coefficient through
#[test]
fn perez_matches_pvlib_within_a_tenth_of_a_watt() {
    for case in CASES {
        let (zenith_deg, .., surface_azimuth_deg, _, _, want) = case;
        let got = perez_transposition_1990(&input(case)).sky_diffuse_wm2;
        assert!(
            (got - want).abs() < 0.1,
            "zenith {zenith_deg} surface azimuth {surface_azimuth_deg}: got {got}, pvlib says {want}"
        );
    }
}

/// A row of the coefficient table only gets exercised if some case lands in its bin, and a table
/// this long is easy to thin out by accident. `perez_tables.rs` has eight rows and this asserts
/// that the cases above reach all eight
#[test]
fn bins_are_all_covered() {
    let mut seen = [false; 8];
    for case in CASES {
        seen[perez_sky_state(&input(case)).bin_index] = true;
    }
    for (bin, covered) in seen.iter().enumerate() {
        assert!(covered, "no case lands in Perez clearness bin {bin}");
    }
}

/// Each row's air mass has to be Kasten-Young at that row's zenith with no pressure term, because
/// that is the argument pvlib's `perez` documents and the number its answer was taken at. A row
/// edited by hand rather than regenerated fails here with a clearer reason than a watt of drift
#[test]
fn every_row_carries_the_unpressurized_air_mass_for_its_zenith() {
    for (zenith_deg, .., air_mass, _want) in CASES {
        let want = relative_air_mass(zenith_deg);
        assert!(
            (air_mass - want).abs() < 1e-9,
            "zenith {zenith_deg}: row says {air_mass}, Kasten-Young says {want}"
        );
    }
}

/// The bin is chosen on a step function, so a case sitting a hair off an edge would compare a
/// different table row against pvlib's and still pass by luck. This pins the edges themselves to
/// the published ones, and `perez_clearness_bin` puts a value exactly on an edge in the bin
/// above, which is what pvlib's `digitize` does
#[test]
fn clearness_edges_are_the_published_ones() {
    for (epsilon, want) in [
        (1.0, 0),
        (1.064_999, 0),
        (1.065, 1),
        (1.23, 2),
        (1.5, 3),
        (1.95, 4),
        (2.8, 5),
        (4.5, 6),
        (6.2, 7),
        (100.0, 7),
    ] {
        assert_eq!(perez_clearness_bin(epsilon), want, "epsilon {epsilon}");
    }
}

/// pvlib clips the sky-diffuse result at zero and so does this. The horizon-brightening term goes
/// negative under a bright overcast sky, and at a steep enough tilt it can take the whole sum
/// with it, which is the one case where the clip is load-bearing rather than defensive
#[test]
fn the_result_is_never_negative() {
    for tilt in [0.0, 15.0, 30.0, 45.0, 60.0, 90.0] {
        for case in CASES {
            let mut probe = input(case);
            probe.surface_tilt_deg = tilt;
            let sky = perez_transposition_1990(&probe).sky_diffuse_wm2;
            assert!(
                sky >= 0.0 && sky.is_finite(),
                "tilt {tilt} zenith {}: {sky}",
                case.0
            );
        }
    }
}
