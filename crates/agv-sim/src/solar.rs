//! NREL's Solar Position Algorithm, ported from `src/sim/solar.ts`.
//!
//! Reda & Andreas 2008, NREL/TP-560-34302. The periodic terms are in `spa_tables.rs`, the only
//! copy, maintained by hand against the published source.
//!
//! The port is deliberately literal. Where the TypeScript reads awkwardly the Rust reads
//! awkwardly in the same place, because the thing being protected is agreement with an
//! implementation that has been checked against the published worked example

use crate::math::{clamp, cos_deg, normalize_degrees, sin_deg, tan_deg, DEG_TO_RAD, RAD_TO_DEG};
use crate::spa_tables::{
    B0, B1, L0, L1, L2, L3, L4, L5, NUTATION_ABCD_ARRAY, NUTATION_YTERM_ARRAY, R0, R1, R2, R3, R4,
};
use crate::time::{delta_t_seconds, julian_time};

const SUN_DISC_HALF_WIDTH_DEG: f64 = 0.26667;
const ATMOSPHERIC_REFRACTION_DEG: f64 = 0.5667;
const EARTH_RADIUS_M: f64 = 6_378_140.0;

/// Where the observer is and what the air above them is doing
#[derive(Debug, Clone, Copy)]
pub struct Observer {
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    pub elevation_m: f64,
    pub pressure_mb: f64,
    pub temperature_c: f64,
}

/// Every figure `spaPosition` returns, in the same order and under the same names
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SolarPosition {
    pub geometric_elevation_deg: f64,
    pub apparent_elevation_deg: f64,
    pub zenith_deg: f64,
    pub azimuth_deg: f64,
    pub declination_deg: f64,
    pub hour_angle_deg: f64,
    pub earth_radius_vector_au: f64,
    pub relative_air_mass: f64,
    pub absolute_air_mass: f64,
}

fn sum_mult_cos_add_mult(terms: &[[f64; 3]], x: f64) -> f64 {
    terms.iter().map(|t| t[0] * (t[1] + t[2] * x).cos()).sum()
}

/// Horner over the periodic-term series, outermost first
fn polynomial(series: &[&[[f64; 3]]], jme: f64) -> f64 {
    let mut total = 0.0;
    for terms in series.iter().rev() {
        total = total * jme + sum_mult_cos_add_mult(terms, jme);
    }
    total
}

fn heliocentric_longitude_deg(jme: f64) -> f64 {
    normalize_degrees(polynomial(&[L0, L1, L2, L3, L4, L5], jme) / 1e8 * RAD_TO_DEG)
}

fn heliocentric_latitude_deg(jme: f64) -> f64 {
    polynomial(&[B0, B1], jme) / 1e8 * RAD_TO_DEG
}

fn heliocentric_radius_au(jme: f64) -> f64 {
    polynomial(&[R0, R1, R2, R3, R4], jme) / 1e8
}

fn nutation(jce: f64) -> (f64, f64) {
    let x = [
        297.85036 + 445267.11148 * jce - 0.0019142 * jce.powi(2) + jce.powi(3) / 189_474.0,
        357.52772 + 35999.05034 * jce - 0.0001603 * jce.powi(2) - jce.powi(3) / 300_000.0,
        134.96298 + 477198.867398 * jce + 0.0086972 * jce.powi(2) + jce.powi(3) / 56_250.0,
        93.27191 + 483202.017538 * jce - 0.0036825 * jce.powi(2) + jce.powi(3) / 327_270.0,
        125.04452 - 1934.136261 * jce + 0.0020708 * jce.powi(2) + jce.powi(3) / 450_000.0,
    ];
    let mut psi = 0.0;
    let mut epsilon = 0.0;
    for (y, abcd) in NUTATION_YTERM_ARRAY.iter().zip(NUTATION_ABCD_ARRAY.iter()) {
        let arg = (0..5).map(|i| y[i] * x[i]).sum::<f64>() * DEG_TO_RAD;
        psi += (abcd[0] + abcd[1] * jce) * arg.sin();
        epsilon += (abcd[2] + abcd[3] * jce) * arg.cos();
    }
    (psi / 36_000_000.0, epsilon / 36_000_000.0)
}

fn mean_ecliptic_obliquity_arcsec(jme: f64) -> f64 {
    let u = jme / 10.0;
    84381.448 - 4680.93 * u - 1.55 * u.powi(2) + 1999.25 * u.powi(3)
        - 51.38 * u.powi(4)
        - 249.67 * u.powi(5)
        - 39.05 * u.powi(6)
        + 7.12 * u.powi(7)
        + 27.87 * u.powi(8)
        + 5.79 * u.powi(9)
        + 2.45 * u.powi(10)
}

/// SPA / Bennett 1982
pub fn refraction_correction_deg(
    geometric_elevation_deg: f64,
    pressure_mb: f64,
    temperature_c: f64,
) -> f64 {
    if geometric_elevation_deg < -(SUN_DISC_HALF_WIDTH_DEG + ATMOSPHERIC_REFRACTION_DEG) {
        return 0.0;
    }
    (pressure_mb / 1010.0) * (283.0 / (273.0 + temperature_c)) * 1.02
        / (60.0 * tan_deg(geometric_elevation_deg + 10.3 / (geometric_elevation_deg + 5.11)))
}

/// Kasten & Young 1989, the path length at sea-level pressure.
///
/// This is the argument the Perez transposition wants. Pressure-correcting it is what DISC and
/// DIRINT want and the two aren't interchangeable: see `TranspositionInput::relative_air_mass`
pub fn relative_air_mass(zenith_deg: f64) -> f64 {
    if zenith_deg >= 90.0 {
        return 0.0;
    }
    1.0 / (cos_deg(zenith_deg) + 0.50572 * (96.07995 - zenith_deg).powf(-1.6364))
}

/// Kasten & Young 1989, relative and pressure-corrected
pub fn kasten_young_air_mass(zenith_deg: f64, pressure_mb: f64) -> (f64, f64) {
    let relative = relative_air_mass(zenith_deg);
    (relative, relative * (pressure_mb / 1013.25))
}

pub fn pressure_from_elevation(elevation_m: f64) -> f64 {
    1013.25 * (-elevation_m / 8434.5).exp()
}

pub fn spa_position(utc_millis: f64, observer: &Observer) -> SolarPosition {
    let jt = julian_time(utc_millis, delta_t_seconds(utc_millis));
    let jme = jt.julian_ephemeris_millennium;
    let jce = jt.julian_ephemeris_century;

    let radius_au = heliocentric_radius_au(jme);
    let theta = normalize_degrees(heliocentric_longitude_deg(jme) + 180.0);
    let beta_geo = -heliocentric_latitude_deg(jme);

    let (delta_psi, delta_epsilon) = nutation(jce);
    let epsilon = mean_ecliptic_obliquity_arcsec(jme) / 3600.0 + delta_epsilon;
    let lambda = theta + delta_psi - 20.4898 / (3600.0 * radius_au);

    let nu0 = normalize_degrees(
        280.46061837
            + 360.98564736629 * (jt.julian_day - 2_451_545.0)
            + 0.000387933 * jt.julian_century.powi(2)
            - jt.julian_century.powi(3) / 38_710_000.0,
    );
    let nu = nu0 + delta_psi * cos_deg(epsilon);

    let alpha = normalize_degrees(
        RAD_TO_DEG
            * (sin_deg(lambda) * cos_deg(epsilon) - tan_deg(beta_geo) * sin_deg(epsilon))
                .atan2(cos_deg(lambda)),
    );
    let declination = RAD_TO_DEG
        * clamp(
            sin_deg(beta_geo) * cos_deg(epsilon)
                + cos_deg(beta_geo) * sin_deg(epsilon) * sin_deg(lambda),
            -1.0,
            1.0,
        )
        .asin();

    let latitude = observer.latitude_deg;
    let longitude = observer.longitude_deg;
    let hour_angle_deg = normalize_degrees(nu + longitude - alpha);

    let xi = 8.794 / (3600.0 * radius_au);
    let u = (0.99664719 * tan_deg(latitude)).atan();
    let x_term = u.cos() + (observer.elevation_m / EARTH_RADIUS_M) * cos_deg(latitude);
    let y_term = 0.99664719 * u.sin() + (observer.elevation_m / EARTH_RADIUS_M) * sin_deg(latitude);

    let delta_alpha = RAD_TO_DEG
        * (-x_term * sin_deg(xi) * sin_deg(hour_angle_deg))
            .atan2(cos_deg(declination) - x_term * sin_deg(xi) * cos_deg(hour_angle_deg));
    let declination_prime = RAD_TO_DEG
        * ((sin_deg(declination) - y_term * sin_deg(xi)) * cos_deg(delta_alpha))
            .atan2(cos_deg(declination) - x_term * sin_deg(xi) * cos_deg(hour_angle_deg));
    let hour_angle_prime = hour_angle_deg - delta_alpha;

    let geometric_elevation_deg = RAD_TO_DEG
        * clamp(
            sin_deg(latitude) * sin_deg(declination_prime)
                + cos_deg(latitude) * cos_deg(declination_prime) * cos_deg(hour_angle_prime),
            -1.0,
            1.0,
        )
        .asin();
    let apparent_elevation_deg = geometric_elevation_deg
        + refraction_correction_deg(
            geometric_elevation_deg,
            observer.pressure_mb,
            observer.temperature_c,
        );

    // atan2 form is mandatory: the single-argument form mirrors afternoon shadows (Decision Record 2.4)
    let azimuth_deg = normalize_degrees(
        180.0
            + RAD_TO_DEG
                * sin_deg(hour_angle_prime).atan2(
                    cos_deg(hour_angle_prime) * sin_deg(latitude)
                        - tan_deg(declination_prime) * cos_deg(latitude),
                ),
    );

    let zenith_deg = 90.0 - apparent_elevation_deg;
    let (relative, absolute) = kasten_young_air_mass(zenith_deg, observer.pressure_mb);

    SolarPosition {
        geometric_elevation_deg,
        apparent_elevation_deg,
        zenith_deg,
        azimuth_deg,
        declination_deg: declination_prime,
        hour_angle_deg: hour_angle_prime,
        earth_radius_vector_au: radius_au,
        relative_air_mass: relative,
        absolute_air_mass: absolute,
    }
}

/// The direction of the sun as a unit vector in the site's local frame.
///
/// X east, Y north, Z up, matching `geom.rs`. Returned as a tuple so this module keeps no
/// dependency on the geometry types: solar position is upstream of geometry and stays that way
pub fn sun_unit_vector(elevation_deg: f64, azimuth_deg: f64) -> (f64, f64, f64) {
    let cos_el = cos_deg(elevation_deg);
    (
        cos_el * sin_deg(azimuth_deg),
        cos_el * cos_deg(azimuth_deg),
        sin_deg(elevation_deg),
    )
}

/// The sun's elevation measured in the plane perpendicular to a row, and which side it is on.
///
/// This is the angle row-to-row shading is decided by: a sun high in the sky but far along the row
/// axis casts a shadow that misses the next row entirely, and the profile angle is what expresses
/// that. `side` is `Math.sign`'s three-valued answer, because zero means the sun
/// is exactly along the row and neither side is shaded
pub fn profile_angle(
    solar_elevation_rad: f64,
    solar_azimuth_rad: f64,
    row_azimuth_rad: f64,
) -> (f64, f64) {
    let cos_delta = (solar_azimuth_rad - row_azimuth_rad).cos();
    if cos_delta.abs() < 1e-12 {
        return (std::f64::consts::FRAC_PI_2, 0.0);
    }
    let side = if cos_delta > 0.0 { 1.0 } else { -1.0 };
    (solar_elevation_rad.tan().atan2(cos_delta.abs()), side)
}
