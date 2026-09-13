//! The PVWatts v5 inverter, ported from `src/sim/pv/inverter.ts`.

/// Agrivoltaic layouts are routinely oversized against the inverter; this is where clipping starts.
pub const DEFAULT_DC_AC_RATIO: f64 = 1.2;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct InverterModel {
    pub nominal_efficiency: f64,
    pub reference_efficiency: f64,
}

/// PVWatts v5 defaults: 96% nominal against a 96.37% reference curve.
pub const PVWATTS_INVERTER: InverterModel = InverterModel {
    nominal_efficiency: 0.96,
    reference_efficiency: 0.9637,
};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct InverterOutput {
    pub ac_kw: f64,
    /// AC power the inverter could not pass because it was already at its rating.
    pub clipped_kw: f64,
}

/// `eta = (eta_nom / eta_ref) * (-0.0162 z - 0.0059 / z + 0.9858)`, then hard-limited at the AC
/// rating.
///
/// The limit is the whole point at agrivoltaic DC:AC ratios, so it is never optional.
pub fn pvwatts_ac(
    dc_kw: f64,
    inverter_dc_rating_kw: f64,
    inverter: Option<InverterModel>,
) -> InverterOutput {
    let inverter = inverter.unwrap_or(PVWATTS_INVERTER);
    let ac_rating_kw = inverter.nominal_efficiency * inverter_dc_rating_kw;
    if dc_kw <= 0.0 || inverter_dc_rating_kw <= 0.0 {
        return InverterOutput {
            ac_kw: 0.0,
            clipped_kw: 0.0,
        };
    }
    let zeta = dc_kw / inverter_dc_rating_kw;
    let efficiency = (inverter.nominal_efficiency / inverter.reference_efficiency)
        * (-0.0162 * zeta - 0.0059 / zeta + 0.9858);
    let unlimited_kw = (efficiency * dc_kw).max(0.0);
    let ac_kw = ac_rating_kw.min(unlimited_kw);
    InverterOutput {
        ac_kw,
        clipped_kw: unlimited_kw - ac_kw,
    }
}

pub fn inverter_ac_rating_kw(nameplate_dc_kw: f64, dc_ac_ratio: f64) -> f64 {
    if dc_ac_ratio > 0.0 {
        nameplate_dc_kw / dc_ac_ratio
    } else {
        0.0
    }
}

/// The AC nameplate. Every AC figure in the product comes through here, so a DC quantity cannot be
/// relabelled as AC.
pub fn nameplate_ac_kw(nameplate_dc_kw: f64, dc_ac_ratio: Option<f64>) -> f64 {
    inverter_ac_rating_kw(nameplate_dc_kw, dc_ac_ratio.unwrap_or(DEFAULT_DC_AC_RATIO))
}

pub fn inverter_dc_rating_kw(
    nameplate_dc_kw: f64,
    dc_ac_ratio: f64,
    inverter: Option<InverterModel>,
) -> f64 {
    inverter_ac_rating_kw(nameplate_dc_kw, dc_ac_ratio)
        / inverter.unwrap_or(PVWATTS_INVERTER).nominal_efficiency
}
