//! Degree-taking trigonometry and the two constants that go with it.
//!
//! A direct port of `src/sim/math.ts`. It exists separately for the reason the TypeScript one
//! does: the SPA is written in degrees throughout, and converting at each call site is where the
//! transcription errors live.

pub const RAD_TO_DEG: f64 = 180.0 / std::f64::consts::PI;
pub const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;

pub fn sin_deg(degrees: f64) -> f64 {
    (degrees * DEG_TO_RAD).sin()
}

pub fn cos_deg(degrees: f64) -> f64 {
    (degrees * DEG_TO_RAD).cos()
}

pub fn tan_deg(degrees: f64) -> f64 {
    (degrees * DEG_TO_RAD).tan()
}

/// Into `[0, 360)`.
///
/// `rem_euclid` and not `%`, which in Rust as in JavaScript keeps the sign of the dividend and
/// would return a negative angle for a negative input.
pub fn normalise_degrees(degrees: f64) -> f64 {
    degrees.rem_euclid(360.0)
}

pub fn clamp(value: f64, low: f64, high: f64) -> f64 {
    if value < low {
        low
    } else if value > high {
        high
    } else {
        value
    }
}

/// One round-trip through `f32`.
///
/// Not a rounding of convenience. `src/sim` stores every irradiance series in a `Float32Array`, and
/// the TypeScript this crate replaced narrowed to single precision at each store and carried the
/// narrowed value into the next line of arithmetic. Two of those stores are load-bearing: the
/// DIRINT beam estimate is narrowed before it is multiplied by its bin coefficient, and the diffuse
/// fraction is narrowed before the component-closure test reads it back. A port that keeps
/// everything in `f64` is a more accurate implementation of a different function
pub fn through_f32(value: f64) -> f64 {
    f64::from(value as f32)
}

/// The bin whose lower edge `value` has reached, counting from zero.
///
/// `value >= edges[bin]` advances, so a value on an edge belongs to the upper bin, and a value
/// past the last edge lands one past the end of `edges`. Both the Perez sky-clearness bins and
/// the four DIRINT indices are selected this way, which is why it lives here, one place both can
/// reach.
pub fn edge_bin(value: f64, edges: &[f64]) -> usize {
    let mut bin = 0;
    while bin < edges.len() && value >= edges[bin] {
        bin += 1;
    }
    bin
}
