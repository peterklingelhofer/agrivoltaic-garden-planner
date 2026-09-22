//! How much of the ground is under snow, ported from `src/sim/snow.ts`.
//!
//! Not a snow model, and the TypeScript says so at length. It reads monthly normals, so it knows
//! nothing about a particular winter, about melt and refreeze, about drifting, or about snow lying
//! on the modules as well as under them. It is a smooth seasonal weighting between two surfaces
//! the site plausibly has.
//!
//! It lives here so the renderer and the PV chain read one value about whether there is snow on
//! the ground: the rear side of a bifacial module sees the ground
//! and almost nothing else, and treating a snowfield as grass understates the modelled year by
//! around three percent at Amherst.

use crate::time::utc_day_of_year;

const DAYS_PER_YEAR: f64 = 365.0;

/// Old settled snow: a seasonal weighting off monthly normals describes how the snowpack lies
/// after it has had days to settle.
pub const SNOW_ALBEDO: f64 = 0.7;

/// Below this monthly mean the ground is covered; above it, bare. Between, in between.
const SNOW_FULL_C: f64 = -3.0;
const SNOW_NONE_C: f64 = 2.0;

/// A month too dry to hold a cover. Continental interiors run cold and dry, and putting deep snow
/// on ground that gets 8 mm in January would be a prettier lie.
const SNOW_DRY_MM: f64 = 12.0;
const SNOW_WET_MM: f64 = 35.0;

fn wrap_days(days: f64) -> f64 {
    days.rem_euclid(DAYS_PER_YEAR)
}

fn clamp01(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

/// Linear between two monthly normals, so the year crosses a season as a slope.
fn monthly_at(monthly: &[f64], day_of_year: f64) -> f64 {
    if monthly.len() != 12 {
        return f64::NAN;
    }
    let position = (wrap_days(day_of_year - 1.0) / DAYS_PER_YEAR) * 12.0 - 0.5;
    let low = position.floor();
    let fraction = position - low;
    let at = |index: f64| monthly[(index as i64).rem_euclid(12) as usize];
    at(low) * (1.0 - fraction) + at(low + 1.0) * fraction
}

/// How covered the ground is on this day.
///
/// Temperature sets whether a cover survives and precipitation sets whether there is one to
/// survive, because those are the two questions a monthly normal can actually answer. Returns 0
/// for a site with no normals, and never guesses.
pub fn ground_snow_cover(
    monthly_mean_temp_c: &[f64],
    monthly_precip_mm: &[f64],
    day_of_year: f64,
) -> f64 {
    let temperature = monthly_at(monthly_mean_temp_c, day_of_year);
    let precipitation = monthly_at(monthly_precip_mm, day_of_year);
    if !temperature.is_finite() || !precipitation.is_finite() {
        return 0.0;
    }
    let cold = clamp01((SNOW_NONE_C - temperature) / (SNOW_NONE_C - SNOW_FULL_C));
    let wet = clamp01((precipitation - SNOW_DRY_MM) / (SNOW_WET_MM - SNOW_DRY_MM));
    cold * wet
}

/// One snow fraction per hour, on the timestamps the weather itself carries.
///
/// Per hour, because the chain reads it per hour; the day is computed once and carried across
/// the hours that share it, which is the same reason the TypeScript memoises.
pub fn snow_cover_series(
    monthly_mean_temp_c: &[f64],
    monthly_precip_mm: &[f64],
    utc_millis: &[f64],
) -> Vec<f32> {
    let mut cover = Vec::with_capacity(utc_millis.len());
    let mut last_day = i64::MIN;
    let mut last_value = 0.0f32;
    for &millis in utc_millis {
        let day = utc_day_of_year(millis);
        if day != last_day {
            last_day = day;
            last_value =
                ground_snow_cover(monthly_mean_temp_c, monthly_precip_mm, day as f64) as f32;
        }
        cover.push(last_value);
    }
    cover
}

/// The albedo of ground that is `snow_cover` covered, between the chosen cover and snow.
///
/// Each language has its own copy: the PV chain calls this one and the renderer calls
/// TypeScript's `albedoUnderSnow`, so the ground the camera shows and the ground the model
/// bounces light off cannot disagree about how white it is today
pub fn albedo_under_snow(cover_albedo: f64, snow_cover: f64) -> f64 {
    cover_albedo + (SNOW_ALBEDO - cover_albedo) * clamp01(snow_cover)
}
