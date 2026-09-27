//! The albedo of ground under snow, which the PV chain blends in hour by hour
//!
//! How much of the ground is covered is worked out in `src/sim/snow.ts`, which the renderer reads
//! too, and arrives here as each hour's snow fraction in `agv_annual_chain`

/// Old settled snow: a seasonal weighting off monthly normals describes how the snowpack lies
/// after it has had days to settle
pub const SNOW_ALBEDO: f64 = 0.7;

fn clamp01(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

/// The albedo of ground that is `snow_cover` covered, between the chosen cover and snow.
///
/// Each language has its own copy: the PV chain calls this one and the renderer calls
/// TypeScript's `albedoUnderSnow`, so the ground the camera shows and the ground the model
/// bounces light off can't disagree about how white it is today
pub fn albedo_under_snow(cover_albedo: f64, snow_cover: f64) -> f64 {
    cover_albedo + (SNOW_ALBEDO - cover_albedo) * clamp01(snow_cover)
}
