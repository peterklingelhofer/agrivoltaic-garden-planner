//! The agrivoltaic garden designer's physics core.
//!
//! One implementation of the numbers, callable from the browser through wasm and from a native
//! binary directly. The physics here is the part of the application worth sharing with anything
//! else built on it, and a second hand-written copy of the Solar Position Algorithm would be a
//! second thing to be wrong.
//!
//! What is here is the whole light and energy path: solar geometry, beam/diffuse decomposition,
//! transposition, the array geometry and its shadows, sky view factors, and the PVWatts chain.

pub mod decomposition;
pub mod dirint_tables;
pub mod geom;
pub mod geometry;
pub mod math;
pub mod perez_tables;
pub mod pv;
pub mod shading;
pub mod snow;
pub mod solar;
pub mod spa_tables;
pub mod time;
pub mod transposition;
pub mod units;
pub mod viewfactor;

/// The browser boundary. Compiled for every target, because it is plain `extern "C"` and
/// costs a native build nothing but a few unused symbols.
pub mod wasm;

pub use decomposition::{
    clearness_index, decompose, disc_dni, enforce_component_consistency, engerer2_diffuse_fraction,
    erbs_diffuse_fraction, select_decomposition_model, DecompositionModel, DecompositionSample,
    IrradianceComponents,
};
pub use solar::{
    kasten_young_air_mass, pressure_from_elevation, refraction_correction_deg, spa_position,
    Observer, SolarPosition,
};
pub use transposition::{
    hay_davies_transposition, isotropic_transposition, perez_sky_state, perez_transposition_1990,
    PerezSkyState, PoaComponents, TranspositionInput,
};
