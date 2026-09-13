//! The PVWatts v5 loss stack, ported from `src/sim/pv/losses.ts`.
//!
//! Labels stay on the TypeScript side. They are user-facing prose, they would be the only strings
//! crossing this crate's boundary, and `src/wasm.rs` explains why that boundary is f64 only. What
//! is shared is the arithmetic and the published fractions, which is what can disagree.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LossComponent {
    Soiling,
    Shading,
    Snow,
    Mismatch,
    Wiring,
    Connections,
    LightInducedDegradation,
    Nameplate,
    Age,
    Availability,
}

/// The PVWatts v5 defaults. Combined multiplicatively these give the published 14.08% total,
/// which is what the unit test pins.
pub const PVWATTS_DEFAULT_LOSSES: &[(LossComponent, f64)] = &[
    (LossComponent::Soiling, 0.02),
    (LossComponent::Shading, 0.03),
    (LossComponent::Snow, 0.0),
    (LossComponent::Mismatch, 0.02),
    (LossComponent::Wiring, 0.02),
    (LossComponent::Connections, 0.005),
    (LossComponent::LightInducedDegradation, 0.015),
    (LossComponent::Nameplate, 0.01),
    (LossComponent::Age, 0.0),
    (LossComponent::Availability, 0.03),
];

/// What survives the stack, as a multiplier.
pub fn loss_derate_factor(losses: &[(LossComponent, f64)]) -> f64 {
    losses.iter().fold(1.0, |factor, (_, f)| factor * (1.0 - f))
}

pub fn combined_loss_fraction(losses: &[(LossComponent, f64)]) -> f64 {
    1.0 - loss_derate_factor(losses)
}

/// Replace one component's fraction, leaving the order and the rest untouched.
pub fn override_loss(
    losses: &[(LossComponent, f64)],
    component: LossComponent,
    fraction: f64,
) -> Vec<(LossComponent, f64)> {
    losses
        .iter()
        .map(|(c, f)| {
            if *c == component {
                (*c, fraction)
            } else {
                (*c, *f)
            }
        })
        .collect()
}
