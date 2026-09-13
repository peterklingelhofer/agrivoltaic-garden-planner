//! The same published worked example `src/sim/solar.test.ts` is held to.
//!
//! This is the point of porting the tests as data rather than rewriting them: the numbers below
//! are NREL's, not the TypeScript's, so this asserts that the Rust is right rather than that it
//! agrees with something else that might be wrong. Agreement with the TypeScript is a separate
//! and weaker claim, and `src/sim/rust-parity.test.ts` is where that one is made.
//!
//! NREL/TP-560-34302 rev. Jan 2008, Appendix A.5.

use agv_sim::solar::{pressure_from_elevation, spa_position, Observer};

/// 2003-10-17T19:30:30Z, the instant in Appendix A.5, as Unix milliseconds.
const UTC_MILLIS: f64 = 1_066_419_030_000.0;

fn boulder() -> Observer {
    Observer {
        latitude_deg: 39.742476,
        longitude_deg: -105.1786,
        elevation_m: 1830.14,
        pressure_mb: 820.0,
        temperature_c: 11.0,
    }
}

#[test]
fn reproduces_the_worked_example_to_better_than_a_thousandth_of_a_degree() {
    let sample = spa_position(UTC_MILLIS, &boulder());
    let close = |got: f64, want: f64, what: &str| {
        assert!(
            (got - want).abs() < 0.001,
            "{what}: got {got}, NREL says {want}, off by {}",
            (got - want).abs()
        );
    };
    close(sample.zenith_deg, 50.111622, "zenith");
    close(sample.azimuth_deg, 194.340241, "azimuth");
    close(
        sample.geometric_elevation_deg,
        39.872046,
        "geometric elevation",
    );
    close(
        sample.apparent_elevation_deg,
        39.888378,
        "apparent elevation",
    );
    close(sample.declination_deg, -9.316179, "topocentric declination");
    close(sample.hour_angle_deg, 11.10629, "topocentric hour angle");
    assert!(
        (sample.earth_radius_vector_au - 0.9965422974).abs() < 1e-7,
        "earth radius vector: got {}",
        sample.earth_radius_vector_au
    );
}

#[test]
fn the_sun_is_below_the_horizon_at_local_midnight() {
    // the same site, twelve hours later
    let sample = spa_position(UTC_MILLIS + 12.0 * 3_600_000.0, &boulder());
    assert!(
        sample.apparent_elevation_deg < 0.0,
        "elevation at local midnight was {}",
        sample.apparent_elevation_deg
    );
    // and the air mass says so rather than returning a number nobody should use
    assert_eq!(sample.relative_air_mass, 0.0);
    assert_eq!(sample.absolute_air_mass, 0.0);
}

#[test]
fn azimuth_stays_in_range_across_a_whole_year() {
    let observer = boulder();
    let mut previous_below = true;
    let mut sunrises = 0;
    for hour in 0..(365 * 24) {
        let sample = spa_position(UTC_MILLIS + f64::from(hour) * 3_600_000.0, &observer);
        assert!(
            (0.0..360.0).contains(&sample.azimuth_deg),
            "azimuth out of range at hour {hour}: {}",
            sample.azimuth_deg
        );
        assert!(
            sample.zenith_deg > -1.0 && sample.zenith_deg < 181.0,
            "zenith out of range at hour {hour}: {}",
            sample.zenith_deg
        );
        let below = sample.apparent_elevation_deg < 0.0;
        if previous_below && !below {
            sunrises += 1;
        }
        previous_below = below;
    }
    // a year has one sunrise a day, give or take where the hourly sampling lands on the boundary
    assert!(
        (360..=370).contains(&sunrises),
        "counted {sunrises} sunrises in a year"
    );
}

#[test]
fn pressure_falls_with_height_and_matches_sea_level() {
    assert!((pressure_from_elevation(0.0) - 1013.25).abs() < 1e-9);
    assert!(pressure_from_elevation(1830.14) < pressure_from_elevation(0.0));
}
