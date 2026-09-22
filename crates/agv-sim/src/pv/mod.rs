//! The photovoltaic chain, ported from `src/sim/pv/`.
//!
//! PVWatts v5 throughout, which is the choice `docs/00-DECISIONS.md` made and the reason every
//! coefficient below is a published default.

pub mod bifacial;
pub mod chain;
pub mod dc;
pub mod inverter;
pub mod losses;
pub mod temperature;
