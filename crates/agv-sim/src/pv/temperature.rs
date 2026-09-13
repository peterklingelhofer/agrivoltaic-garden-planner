//! Cell temperature, ported from `src/sim/pv/temperature.ts`.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FaimanCoefficients {
    pub u0: f64,
    pub u1: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SapmThermalCoefficients {
    pub a: f64,
    pub b: f64,
    pub delta_t_c: f64,
}

/// IEC 61853-2 free-standing defaults, the values pvlib ships as `temperature.faiman`.
pub const FAIMAN_DEFAULT: FaimanCoefficients = FaimanCoefficients { u0: 25.0, u1: 6.84 };

/// Sandia/King coefficients, pvlib `sapm` `open_rack_glass_glass`.
pub const SAPM_OPEN_RACK_GLASS_GLASS: SapmThermalCoefficients = SapmThermalCoefficients {
    a: -3.47,
    b: -0.0594,
    delta_t_c: 3.0,
};

pub const SAPM_CLOSE_MOUNT_GLASS_GLASS: SapmThermalCoefficients = SapmThermalCoefficients {
    a: -2.98,
    b: -0.0471,
    delta_t_c: 1.0,
};

pub const SAPM_OPEN_RACK_GLASS_POLYMER: SapmThermalCoefficients = SapmThermalCoefficients {
    a: -3.56,
    b: -0.075,
    delta_t_c: 3.0,
};

const STC_IRRADIANCE_W_M2: f64 = 1000.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CellTemperatureModel {
    Faiman,
    Sapm,
}

/// `T_module = T_air + G_poa / (u0 + u1 * v_wind)`.
pub fn faiman_cell_temperature(
    poa_wm2: f64,
    air_temp_c: f64,
    wind_speed_ms: f64,
    coefficients: FaimanCoefficients,
) -> f64 {
    air_temp_c + poa_wm2 / (coefficients.u0 + coefficients.u1 * wind_speed_ms.max(0.0)).max(1e-6)
}

/// `T_module = G_poa * exp(a + b * v_wind) + T_air`.
pub fn sapm_module_temperature(
    poa_wm2: f64,
    air_temp_c: f64,
    wind_speed_ms: f64,
    coefficients: SapmThermalCoefficients,
) -> f64 {
    poa_wm2 * (coefficients.a + coefficients.b * wind_speed_ms.max(0.0)).exp() + air_temp_c
}

/// `T_cell = T_module + (G_poa / 1000) * dT`.
pub fn sapm_cell_temperature(
    poa_wm2: f64,
    air_temp_c: f64,
    wind_speed_ms: f64,
    coefficients: SapmThermalCoefficients,
) -> f64 {
    sapm_module_temperature(poa_wm2, air_temp_c, wind_speed_ms, coefficients)
        + (poa_wm2 / STC_IRRADIANCE_W_M2) * coefficients.delta_t_c
}

pub fn cell_temperature(
    model: CellTemperatureModel,
    poa_wm2: f64,
    air_temp_c: f64,
    wind_speed_ms: f64,
    faiman: FaimanCoefficients,
    sapm: SapmThermalCoefficients,
) -> f64 {
    match model {
        CellTemperatureModel::Sapm => {
            sapm_cell_temperature(poa_wm2, air_temp_c, wind_speed_ms, sapm)
        }
        CellTemperatureModel::Faiman => {
            faiman_cell_temperature(poa_wm2, air_temp_c, wind_speed_ms, faiman)
        }
    }
}
