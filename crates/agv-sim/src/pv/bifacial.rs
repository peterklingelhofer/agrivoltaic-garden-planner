//! Rear-side irradiance, ported from `src/sim/pv/bifacial.ts`.
//!
//! The rear plane sits at `180 - tilt`, so its view factor to the sky is `(1 - cos tilt) / 2` and
//! the remainder is its view of the ground. Ground irradiance is taken pitch-averaged at the
//! unshaded fraction `1 - GCR`, which is the infinite-row approximation Marion et al. 2017
//! formalises.
//!
//! CAVEAT, carried over verbatim in substance from the TypeScript because it is a provenance
//! claim and not a comment: the inter-reflection term's published 3-8% magnitude for white
//! backsheets is UNVERIFIABLE per `the verification document`. The two-surface radiosity formula is
//! valid theory, but no PV paper states that range, so the gain here is a modelled quantity and
//! not a sourced one. With the glass-glass default rear reflectance of 0.05 it moves the answer by
//! well under 1%.

use crate::math::{cos_deg, through_f32};
use crate::viewfactor::{interreflection_gain, rear_side_poa};

pub fn rear_poa_wm2(
    ghi_wm2: f64,
    tilt_deg: f64,
    ground_albedo: f64,
    ground_cover_ratio: f64,
    bifaciality_factor: f64,
    rear_reflectance: f64,
) -> f64 {
    if bifaciality_factor <= 0.0 || ghi_wm2 <= 0.0 {
        return 0.0;
    }
    let ground_sky_view_factor = (1.0 - ground_cover_ratio).max(0.0);
    let rear_sky_view_factor = (1.0 - cos_deg(tilt_deg)) / 2.0;
    // narrowed, because the TypeScript builds `Float32Array.of(groundIrradiance)` to hand this to
    // `rearSidePoa`, and the mean it takes is therefore a mean of single-precision values. Found
    // by the parity test rather than by reading: it moves the annual bifacial gain by 5e-10
    // relative, which is nothing on its own and is exactly the size of thing that turns out to be
    // a dropped narrowing somewhere. See `math::through_f32`
    let ground_irradiance = through_f32(
        ghi_wm2
            * ground_sky_view_factor
            * interreflection_gain(ground_sky_view_factor, ground_albedo, rear_reflectance),
    );
    rear_side_poa(
        &[ground_irradiance],
        ground_albedo,
        rear_sky_view_factor,
        bifaciality_factor,
    )
}
