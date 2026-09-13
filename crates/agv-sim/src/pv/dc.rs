//! The PVWatts v5 DC model, ported from `src/sim/pv/dc.ts`.

/// PVWatts v5 temperature coefficient of power for crystalline silicon, per degree C.
pub const PVWATTS_GAMMA_PDC_PER_C: f64 = -0.0047;
pub const PVWATTS_REFERENCE_TEMP_C: f64 = 25.0;
const STC_IRRADIANCE_W_M2: f64 = 1000.0;

/// `Pdc = (G_poa / 1000) * Pdc0 * (1 + gamma * (Tcell - 25))`.
///
/// `nameplate_dc` is the array DC nameplate, so the result carries whatever unit it was given.
pub fn pvwatts_dc(poa_wm2: f64, cell_temp_c: f64, nameplate_dc: f64, gamma_pdc_per_c: f64) -> f64 {
    if poa_wm2 <= 0.0 {
        return 0.0;
    }
    ((poa_wm2 / STC_IRRADIANCE_W_M2)
        * nameplate_dc
        * (1.0 + gamma_pdc_per_c * (cell_temp_c - PVWATTS_REFERENCE_TEMP_C)))
        .max(0.0)
}
