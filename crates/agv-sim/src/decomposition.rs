//! Splitting a global horizontal measurement into its beam and diffuse parts, ported from
//! `src/sim/decomposition.ts`.
//!
//! Most weather archives publish GHI alone, and every downstream step needs DNI and DHI separately,
//! so this is the first thing that happens to a year of weather and the last place an error would
//! be visible. Four models are here, and the choice between them rests on what the data actually
//! carries: `Passthrough` when the archive already publishes all three, `Dirint` at hourly
//! resolution, `Engerer2` below it, and `Erbs` as the cheap closed form the tests pin the others
//! against.
//!
//! Two things about this port are worth reading before changing it.
//!
//! The narrowing is deliberate. See `math::through_f32`: the TypeScript stores these series in
//! `Float32Array`s and reads the narrowed values back into the next line of arithmetic, and one
//! of those narrowings sits directly in front of a step function, where a difference in the last
//! bit stops being small.
//!
//! The out-of-range reads are deliberate too. `at` returns zero past either end of the series
//! because the TypeScript's does, and the DIRINT neighbour window reaches past both ends on a
//! one-sample series. That is a real edge case with a real answer, not an oversight to tidy.

use crate::dirint_tables::DIRINT_COEFFS;
use crate::math::{clamp, cos_deg, edge_bin, through_f32};

/// One timestep, as everything downstream of the weather loader sees it.
///
/// `dni_wm2` and `dhi_wm2` are what the archive published, which for most archives is nothing;
/// they are read only by `Passthrough`, and by the closure test at the end, which every model
/// passes through.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DecompositionSample {
    pub utc_millis: f64,
    pub ghi_wm2: f64,
    pub dni_wm2: f64,
    pub dhi_wm2: f64,
    pub geometric_elevation_deg: f64,
    pub apparent_elevation_deg: f64,
    pub absolute_air_mass: f64,
    pub extraterrestrial_normal_wm2: f64,
}

/// GHI as well as the split, because the closure test zeroes all three below the horizon, and
/// the zeroed GHI belongs in the output.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct IrradianceComponents {
    pub ghi_wm2: f64,
    pub dni_wm2: f64,
    pub dhi_wm2: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecompositionModel {
    Passthrough,
    Dirint,
    Engerer2,
    Erbs,
}

impl DecompositionModel {
    /// The wire codes `src/sim/rust-core.ts` sends. Adding a model means appending, never
    /// renumbering: both sides carry this mapping and only one of them is compiled.
    pub fn from_code(code: u32) -> Option<Self> {
        match code {
            0 => Some(Self::Passthrough),
            1 => Some(Self::Dirint),
            2 => Some(Self::Engerer2),
            3 => Some(Self::Erbs),
            _ => None,
        }
    }
}

/// Which model the available data and the timestep permit, with no reference to which is best.
///
/// DIRINT reads a neighbour on each side to estimate how fast the sky is changing, which is a
/// statement about hours; below an hour that window is too short to mean what the model fitted it
/// to mean, and Engerer 2 takes over.
pub fn select_decomposition_model(
    has_dni_and_dhi: bool,
    timestep_minutes: f64,
) -> DecompositionModel {
    if has_dni_and_dhi {
        DecompositionModel::Passthrough
    } else if timestep_minutes >= 60.0 {
        DecompositionModel::Dirint
    } else {
        DecompositionModel::Engerer2
    }
}

/// Zero past either end, matching `at` in `src/sim/math.ts`.
fn at(values: &[f64], index: isize) -> f64 {
    if index < 0 {
        return 0.0;
    }
    values.get(index as usize).copied().unwrap_or(0.0)
}

/// GHI as a fraction of what a horizontal surface would receive with no atmosphere at all.
///
/// The 0.065 floor on `cos(z)` is what stops this dividing by nothing at sunrise; it corresponds
/// to about 86 degrees of zenith angle.
pub fn clearness_index(ghi: f64, extraterrestrial_normal: f64, zenith_deg: f64) -> f64 {
    clamp(
        ghi / (extraterrestrial_normal * cos_deg(zenith_deg).max(0.065)),
        0.0,
        1.0,
    )
}

/// Erbs, Klein & Duffie 1982, Solar Energy 28(4) 293-302.
pub fn erbs_diffuse_fraction(kt: f64) -> f64 {
    if kt <= 0.22 {
        1.0 - 0.09 * kt
    } else if kt <= 0.8 {
        0.9511 - 0.1604 * kt + 4.388 * kt.powi(2) - 16.638 * kt.powi(3) + 12.336 * kt.powi(4)
    } else {
        0.165
    }
}

/// Maxwell 1987 (SERI/TR-215-3087), transcribed from `pvlib.irradiance._disc_kn`.
///
/// Refused above 87 degrees of zenith: the fit has no support there, and the beam component at
/// that elevation is a rounding error on the day's total anyway.
pub fn disc_dni(
    ghi: f64,
    extraterrestrial_normal: f64,
    zenith_deg: f64,
    absolute_air_mass: f64,
) -> f64 {
    if zenith_deg > 87.0 || ghi < 0.0 {
        return 0.0;
    }
    let am = absolute_air_mass.min(12.0);
    let kt = clearness_index(ghi, extraterrestrial_normal, zenith_deg);
    let (a, b, c) = if kt <= 0.6 {
        (
            0.512 - 1.56 * kt + 2.286 * kt.powi(2) - 2.222 * kt.powi(3),
            0.37 + 0.962 * kt,
            -0.28 + 0.932 * kt - 2.048 * kt.powi(2),
        )
    } else {
        (
            -5.743 + 21.77 * kt - 27.49 * kt.powi(2) + 11.56 * kt.powi(3),
            41.4 - 118.5 * kt + 66.05 * kt.powi(2) + 31.9 * kt.powi(3),
            -47.01 + 184.2 * kt - 222.0 * kt.powi(2) + 73.81 * kt.powi(3),
        )
    };
    let delta_kn = a + b * (c * am).exp();
    let knc =
        0.866 - 0.122 * am + 0.0121 * am.powi(2) - 0.000_653 * am.powi(3) + 1.4e-5 * am.powi(4);
    let dni = (knc - delta_kn) * extraterrestrial_normal;
    if dni < 0.0 {
        0.0
    } else {
        dni
    }
}

/// The series DIRINT reads, mirroring `DirintInput` in the TypeScript.
///
/// `precipitable_water_cm` is `None` where `decompose` builds this, and `None` selects the table's
/// unassigned-water bin. Deriving it from dew point is a v2 upgrade
pub struct DirintInput<'a> {
    pub ghi: &'a [f64],
    pub zenith_deg: &'a [f64],
    pub extraterrestrial_normal: &'a [f64],
    pub absolute_air_mass: &'a [f64],
    pub precipitable_water_cm: Option<&'a [f64]>,
}

const KT_PRIME_EDGES: &[f64] = &[0.24, 0.4, 0.56, 0.7, 0.8];
const ZENITH_EDGES: &[f64] = &[25.0, 40.0, 55.0, 70.0, 80.0];
const W_EDGES: &[f64] = &[1.0, 2.0, 3.0];
const DELTA_KT_PRIME_EDGES: &[f64] = &[0.015, 0.035, 0.07, 0.15, 0.3];
const W_UNASSIGNED_BIN: usize = 4;

/// Perez, Ineichen, Seals & Zelenka 1992, Solar Energy 49(3) 187-200.
///
/// DISC first, then a correction looked up on four indices, one of which is how much the air-mass
/// independent clearness moves between this timestep and its neighbours. That neighbour term is
/// why this is a series function and not a per-sample one, and why it is the only thing in this
/// file that cannot be evaluated for a single instant in isolation.
///
/// Returned values are already narrowed to single precision
pub fn dirint_dni(input: &DirintInput) -> Vec<f64> {
    let n = input.ghi.len();
    let mut dni = vec![0.0; n];
    let mut kt_prime = vec![0.0; n];
    for i in 0..n {
        let ghi = at(input.ghi, i as isize);
        let zenith_deg = at(input.zenith_deg, i as isize);
        let i0 = at(input.extraterrestrial_normal, i as isize);
        let am = at(input.absolute_air_mass, i as isize);
        dni[i] = through_f32(disc_dni(ghi, i0, zenith_deg, am));
        let kt = clearness_index(ghi, i0, zenith_deg);
        let denom = 1.031 * (-1.4 / (0.9 + 9.4 / am)).exp() + 0.1;
        kt_prime[i] = through_f32(clamp(kt / denom, 0.0, 1.0));
    }
    for i in 0..n {
        let index = i as isize;
        let cur = at(&kt_prime, index);
        // one sample either side, mirrored at the ends; on a one-sample series both mirrors fall
        // outside and read zero
        let previous = if i == 0 { 1 } else { index - 1 };
        let next = if i + 1 == n { index - 1 } else { index + 1 };
        let delta_kt_prime =
            0.5 * ((cur - at(&kt_prime, next)).abs() + (cur - at(&kt_prime, previous)).abs());

        let kt_bin = edge_bin(cur, KT_PRIME_EDGES);
        let z_bin = edge_bin(at(input.zenith_deg, index), ZENITH_EDGES);
        let dkt_bin = edge_bin(delta_kt_prime, DELTA_KT_PRIME_EDGES);
        let w_bin = match input.precipitable_water_cm {
            None => W_UNASSIGNED_BIN,
            Some(water) => edge_bin(at(water, index), W_EDGES),
        };

        let coefficient = DIRINT_COEFFS
            .get(((kt_bin * 6 + z_bin) * 7 + dkt_bin) * 5 + w_bin)
            .copied()
            .unwrap_or(0.0);
        let ghi = at(input.ghi, index);
        let result = at(&dni, index) * coefficient;
        dni[i] = through_f32(if ghi < 1.0 || result < 0.0 {
            0.0
        } else {
            result
        });
    }
    dni
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Engerer2CoefficientSet {
    /// Engerer 2015, fitted to one-minute Australian data.
    Engerer2015Au1Min,
    /// Bright & Engerer 2019, refitted globally. What the app uses.
    BrightEngerer2019Global,
}

struct Engerer2Coefficients {
    c: f64,
    b0: f64,
    b1: f64,
    b2: f64,
    b3: f64,
    b4: f64,
    b5: f64,
}

/// Engerer 2015, Solar Energy 116 215-237 Eq. 33; global re-fit by Bright & Engerer 2019.
fn engerer2_coefficients(set: Engerer2CoefficientSet) -> Engerer2Coefficients {
    match set {
        Engerer2CoefficientSet::Engerer2015Au1Min => Engerer2Coefficients {
            c: 4.2336e-2,
            b0: -3.7912,
            b1: 7.5479,
            b2: -1.0036e-2,
            b3: 3.148e-3,
            b4: -5.3146,
            b5: 1.7073,
        },
        Engerer2CoefficientSet::BrightEngerer2019Global => Engerer2Coefficients {
            c: 1.0562e-1,
            b0: -4.1332,
            b1: 8.2578,
            b2: 1.0087e-2,
            b3: 8.8801e-4,
            b4: -4.9302,
            b5: 4.4378e-1,
        },
    }
}

/// The diffuse fraction, as a logistic in clearness, time of day, zenith and the gap to clear sky.
///
/// The last term, `kde`, is what makes this work below the hour: it is the share of the global
/// that exceeds what a clear sky would deliver, which is cloud enhancement, and it is the thing a
/// model fitted to hourly means cannot see.
pub fn engerer2_diffuse_fraction(
    ghi: f64,
    clear_sky_ghi: f64,
    extraterrestrial_normal: f64,
    zenith_deg: f64,
    apparent_solar_time_hours: f64,
    coefficients: Engerer2CoefficientSet,
) -> f64 {
    let k = engerer2_coefficients(coefficients);
    let kt = clearness_index(ghi, extraterrestrial_normal, zenith_deg);
    let ktc = clear_sky_ghi / (extraterrestrial_normal * cos_deg(zenith_deg).max(0.065));
    let dktc = ktc - kt;
    let kde = if ghi > 0.0 {
        (1.0 - clear_sky_ghi / ghi).max(0.0)
    } else {
        0.0
    };
    let kd = k.c
        + (1.0 - k.c)
            / (1.0
                + (k.b0
                    + k.b1 * kt
                    + k.b2 * apparent_solar_time_hours
                    + k.b3 * zenith_deg
                    + k.b4 * dktc)
                    .exp())
        + k.b5 * kde;
    clamp(kd, 0.0, 1.0)
}

/// Approximates apparent solar time as local clock time.
///
/// The equation of time and the longitude correction are a v2 upgrade: no longitude reaches this
/// layer. `%` keeps the sign of the dividend in Rust exactly as in JavaScript, so the double
/// reduction below is a literal port
fn apparent_solar_time_hours(utc_millis: f64, utc_offset_hours: f64) -> f64 {
    let hours = (utc_millis / 3_600_000.0) % 24.0 + utc_offset_hours;
    ((hours % 24.0) + 24.0) % 24.0
}

/// Haurwitz 1945 clear-sky GHI.
///
/// Ineichen-Perez with Linke turbidity is the v2 upgrade (Decision Record 5b).
fn haurwitz_clear_sky_ghi(cos_zenith: f64) -> f64 {
    if cos_zenith > 0.0 {
        1098.0 * cos_zenith * (-0.059 / cos_zenith).exp()
    } else {
        0.0
    }
}

/// A whole series through one model, then through the closure test.
///
/// Every path ends in `enforce_component_consistency`, including `Passthrough`: an archive that
/// publishes all three components is not thereby self-consistent, and the one that ships here has
/// been observed not to be.
pub fn decompose(
    samples: &[DecompositionSample],
    model: DecompositionModel,
    utc_offset_hours: f64,
) -> Vec<IrradianceComponents> {
    let n = samples.len();
    let mut dni: Vec<f64> = samples.iter().map(|s| s.dni_wm2).collect();
    let mut dhi: Vec<f64> = samples.iter().map(|s| s.dhi_wm2).collect();

    if model != DecompositionModel::Passthrough {
        // narrowed here, where the TypeScript this replaced built a Float32Array. The closure test
        // computes its own zenith inline, in `f64`
        let zenith_deg: Vec<f64> = samples
            .iter()
            .map(|s| through_f32(90.0 - s.apparent_elevation_deg))
            .collect();

        if model == DecompositionModel::Dirint {
            let ghi: Vec<f64> = samples.iter().map(|s| s.ghi_wm2).collect();
            let i0: Vec<f64> = samples
                .iter()
                .map(|s| s.extraterrestrial_normal_wm2)
                .collect();
            let am: Vec<f64> = samples.iter().map(|s| s.absolute_air_mass).collect();
            let beam = dirint_dni(&DirintInput {
                ghi: &ghi,
                zenith_deg: &zenith_deg,
                extraterrestrial_normal: &i0,
                absolute_air_mass: &am,
                precipitable_water_cm: None,
            });
            for i in 0..n {
                let cos_zenith = cos_deg(zenith_deg[i]);
                dni[i] = beam[i];
                dhi[i] = through_f32(ghi[i] - beam[i] * cos_zenith);
            }
        } else {
            for (i, sample) in samples.iter().enumerate() {
                let ghi = sample.ghi_wm2;
                let z = zenith_deg[i];
                let i0 = sample.extraterrestrial_normal_wm2;
                let cos_zenith = cos_deg(z);

                let diffuse = if model == DecompositionModel::Erbs {
                    erbs_diffuse_fraction(clearness_index(ghi, i0, z)) * ghi
                } else {
                    let solar_time = apparent_solar_time_hours(sample.utc_millis, utc_offset_hours);
                    engerer2_diffuse_fraction(
                        ghi,
                        haurwitz_clear_sky_ghi(cos_zenith),
                        i0,
                        z,
                        solar_time,
                        Engerer2CoefficientSet::BrightEngerer2019Global,
                    ) * ghi
                };

                dhi[i] = through_f32(diffuse);
                // the unnarrowed `diffuse`, matching the double local the replaced TypeScript kept
                // here
                dni[i] = through_f32(if cos_zenith > 0.0 {
                    (ghi - diffuse) / cos_zenith
                } else {
                    0.0
                });
            }
        }
    }

    enforce_component_consistency(samples, &dni, &dhi)
}

/// GHI must equal the beam projected onto the horizontal plus the diffuse, and often does not.
///
/// Below the horizon all three are zeroed, because a measurement of sunlight when the sun has set
/// is an instrument artefact whatever it says. Above it, a closure error of 5 W/m2 or more is
/// pushed into the diffuse, which is the component with the loosest instrument and the widest
/// legitimate range; only if that would drive the diffuse negative is the beam touched instead.
pub fn enforce_component_consistency(
    samples: &[DecompositionSample],
    dni_in: &[f64],
    dhi_in: &[f64],
) -> Vec<IrradianceComponents> {
    let mut out = Vec::with_capacity(samples.len());
    for (i, sample) in samples.iter().enumerate() {
        if sample.geometric_elevation_deg <= 0.0 {
            out.push(IrradianceComponents {
                ghi_wm2: 0.0,
                dni_wm2: 0.0,
                dhi_wm2: 0.0,
            });
            continue;
        }

        let i0 = sample.extraterrestrial_normal_wm2;
        let cos_zenith = cos_deg(90.0 - sample.apparent_elevation_deg);
        let ghi = sample.ghi_wm2;
        let mut dni = clamp(at(dni_in, i as isize), 0.0, i0);
        let mut dhi = at(dhi_in, i as isize).max(0.0);

        let closure = ghi - (dni * cos_zenith + dhi);
        if closure.abs() >= 5.0 {
            let adjusted = dhi + closure;
            if adjusted >= 0.0 {
                dhi = adjusted;
            } else {
                let remaining = ghi - dni * cos_zenith;
                dhi = 0.0;
                dni = clamp(dni + remaining / cos_zenith.max(1e-6), 0.0, i0);
            }
        }

        out.push(IrradianceComponents {
            ghi_wm2: ghi,
            dni_wm2: through_f32(dni),
            dhi_wm2: through_f32(dhi),
        });
    }
    out
}
