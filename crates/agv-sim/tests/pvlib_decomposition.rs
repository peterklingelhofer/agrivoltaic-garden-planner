//! The published values the decomposition is held to, ported as data.
//!
//! Same structure and same reason as `nrel_spa.rs`. The numbers below come from pvlib and from
//! Erbs 1982, not from the TypeScript, so what this asserts is that the Rust is RIGHT. Whether
//! the two implementations AGREE is the separate, weaker claim, and `src/sim/rust-parity.test.ts`
//! is where that one is made.
//!
//! Inputs are put through `through_f32` wherever the TypeScript test builds them in a
//! `Float32Array`, which is most of them. That is not decoration: DIRINT selects a table row on a
//! step function, and feeding it a value the TypeScript never sees would be testing a different
//! call.

use agv_sim::decomposition::{
    dirint_dni, disc_dni, engerer2_diffuse_fraction, erbs_diffuse_fraction,
    select_decomposition_model, DecompositionModel, DirintInput, Engerer2CoefficientSet,
};
use agv_sim::math::through_f32;

/// Spencer, solar constant 1370, day of year 172
const I0: f64 = 1_325.396_619_444_284_2;

#[test]
fn erbs_matches_the_1982_piecewise_polynomial() {
    assert!((erbs_diffuse_fraction(0.1) - 0.991).abs() < 5e-4);
    assert!((erbs_diffuse_fraction(0.5) - 0.65915).abs() < 5e-5);
    assert_eq!(erbs_diffuse_fraction(0.9), 0.165);
}

/// The polynomial is fitted piecewise and the pieces are not constrained to meet, so this is a
/// property of the published fit rather than of the port. It is worth asserting anyway: a
/// transcription error in any one coefficient shows up here as a step.
#[test]
fn erbs_is_continuous_across_its_own_boundaries() {
    assert!((erbs_diffuse_fraction(0.22) - erbs_diffuse_fraction(0.220_000_1)).abs() < 0.01);
    assert!((erbs_diffuse_fraction(0.8) - erbs_diffuse_fraction(0.800_000_1)).abs() < 0.01);
}

#[test]
fn disc_matches_pvlib_within_half_a_watt() {
    for (zenith_deg, ghi, air_mass, want) in [
        (40.0, 500.0, 1.303_679_547_366_790_8, 179.869_196_718_638_05),
        (70.0, 200.0, 2.899_946_150_705_344, 205.925_935_528_215_46),
        (20.0, 900.0, 1.063_404_196_815_659_6, 626.353_994_042_184_2),
    ] {
        let got = disc_dni(ghi, I0, zenith_deg, air_mass);
        assert!(
            (got - want).abs() < 0.5,
            "zenith {zenith_deg}: got {got}, pvlib says {want}"
        );
    }
}

/// `use_delta_kt_prime=True`, no dew point, so the unassigned precipitable-water bin.
///
/// Six consecutive hours, because the middle four exercise the neighbour window and the two ends
/// exercise its mirroring. The pvlib air-mass reference values are quoted to eight decimal places
/// and this is a step function, which is why the tolerance is a whole watt rather than the half a
/// watt DISC gets.
#[test]
fn dirint_matches_pvlib_within_a_watt() {
    let ghi: Vec<f64> = [100.0, 300.0, 500.0, 700.0, 650.0, 400.0]
        .into_iter()
        .map(through_f32)
        .collect();
    let zenith_deg: Vec<f64> = [80.0, 65.0, 50.0, 35.0, 30.0, 45.0]
        .into_iter()
        .map(through_f32)
        .collect();
    let air_mass: Vec<f64> = [
        5.580_338_95,
        2.353_850_66,
        1.552_552_45,
        1.219_422_31,
        1.153_607_96,
        1.411_923_33,
    ]
    .into_iter()
    .map(through_f32)
    .collect();
    let i0 = vec![through_f32(I0); 6];
    let want = [
        221.463_192_911_1,
        357.176_661_968_4,
        406.036_993_986_4,
        511.935_763_988_9,
        284.772_272_080_3,
        107.228_495_411_6,
    ];

    let got = dirint_dni(&DirintInput {
        ghi: &ghi,
        zenith_deg: &zenith_deg,
        extraterrestrial_normal: &i0,
        absolute_air_mass: &air_mass,
        precipitable_water_cm: None,
    });
    assert_eq!(got.len(), want.len());
    for (index, (&got, &want)) in got.iter().zip(want.iter()).enumerate() {
        assert!(
            (got - want).abs() < 1.0,
            "hour {index}: got {got}, pvlib says {want}"
        );
    }
}

/// A one-sample series has no neighbours, so the window mirrors onto nothing and reads zero at both
/// ends. That answer has to stay, and the point is that it is finite and reproducible
#[test]
fn dirint_on_a_single_sample_reads_past_both_ends_without_panicking() {
    let got = dirint_dni(&DirintInput {
        ghi: &[500.0],
        zenith_deg: &[50.0],
        extraterrestrial_normal: &[I0],
        absolute_air_mass: &[1.55],
        precipitable_water_cm: None,
    });
    assert_eq!(got.len(), 1);
    assert!(got[0].is_finite(), "got {}", got[0]);
    assert!(got[0] >= 0.0);
}

#[test]
fn engerer2_stays_a_fraction_and_falls_as_the_sky_clears() {
    let mut previous = f64::INFINITY;
    for step in 0..20 {
        let ghi = 50.0 + f64::from(step) * 45.0;
        let kd = engerer2_diffuse_fraction(
            ghi,
            900.0,
            I0,
            30.0,
            12.0,
            Engerer2CoefficientSet::BrightEngerer2019Global,
        );
        assert!((0.0..=1.0).contains(&kd), "kd out of range: {kd}");
        assert!(
            kd <= previous + 1e-9,
            "diffuse fraction rose at ghi {ghi}: {kd} after {previous}"
        );
        previous = kd;
    }
}

/// Both published coefficient sets are carried, so both must be reachable and differ.
#[test]
fn the_two_engerer2_coefficient_sets_are_not_the_same_fit() {
    let arguments = (700.0, 900.0, I0, 30.0, 12.0);
    let australian = engerer2_diffuse_fraction(
        arguments.0,
        arguments.1,
        arguments.2,
        arguments.3,
        arguments.4,
        Engerer2CoefficientSet::Engerer2015Au1Min,
    );
    let global = engerer2_diffuse_fraction(
        arguments.0,
        arguments.1,
        arguments.2,
        arguments.3,
        arguments.4,
        Engerer2CoefficientSet::BrightEngerer2019Global,
    );
    assert!((australian - global).abs() > 1e-6);
}

#[test]
fn model_selection_follows_the_data_and_the_timestep() {
    assert_eq!(
        select_decomposition_model(true, 60.0),
        DecompositionModel::Passthrough
    );
    assert_eq!(
        select_decomposition_model(false, 60.0),
        DecompositionModel::Dirint
    );
    assert_eq!(
        select_decomposition_model(false, 15.0),
        DecompositionModel::Engerer2
    );
}

/// The wire codes are a contract with `src/sim/rust-core.ts`. Renumbering one silently rewires
/// which model the browser runs, so they are pinned as literals here.
#[test]
fn the_wire_codes_are_what_the_javascript_sends() {
    assert_eq!(
        DecompositionModel::from_code(0),
        Some(DecompositionModel::Passthrough)
    );
    assert_eq!(
        DecompositionModel::from_code(1),
        Some(DecompositionModel::Dirint)
    );
    assert_eq!(
        DecompositionModel::from_code(2),
        Some(DecompositionModel::Engerer2)
    );
    assert_eq!(
        DecompositionModel::from_code(3),
        Some(DecompositionModel::Erbs)
    );
    assert_eq!(DecompositionModel::from_code(4), None);
}
