//! One year of the single-node PV chain, ported from `src/sim/pv/chain.ts`.
//!
//! Perez POA -> row shading -> rear-side gain -> cell temperature -> PVWatts DC -> loss stack ->
//! inverter with clipping. Solar position is never re-derived here; it arrives already computed by
//! the SPA

use crate::decomposition::DecompositionSample;
use crate::geometry::{
    aperture_area_m2, ground_cover_ratio, module_count, nameplate_dc_kw, surface_orientation,
    PvArray,
};
use crate::math::DEG_TO_RAD;
use crate::pv::dc::{pvwatts_dc, PVWATTS_GAMMA_PDC_PER_C};
use crate::pv::inverter::{
    inverter_dc_rating_kw, nameplate_ac_kw, pvwatts_ac, InverterModel, DEFAULT_DC_AC_RATIO,
    PVWATTS_INVERTER,
};
use crate::pv::losses::{loss_derate_factor, LossComponent, PVWATTS_DEFAULT_LOSSES};
use crate::pv::temperature::{
    cell_temperature, CellTemperatureModel, FaimanCoefficients, SapmThermalCoefficients,
    FAIMAN_DEFAULT, SAPM_OPEN_RACK_GLASS_GLASS,
};
use crate::shading::row_self_shade_fraction;
use crate::snow::albedo_under_snow;
use crate::solar::{profile_angle, relative_air_mass};
use crate::transposition::{perez_transposition_1990, TranspositionInput};

const WH_TO_KWH: f64 = 1000.0;

#[derive(Debug, Clone)]
pub struct PvChainOptions {
    pub cell_temperature_model: CellTemperatureModel,
    pub faiman: FaimanCoefficients,
    pub sapm: SapmThermalCoefficients,
    pub gamma_pdc_per_c: f64,
    pub losses: Vec<(LossComponent, f64)>,
    pub dc_ac_ratio: f64,
    pub inverter: InverterModel,
    pub bifacial: bool,
    pub row_shading: bool,
    pub ground_albedo: f64,
    /// One fraction per hour, or empty for a site with no winter to model.
    pub snow_cover: Vec<f32>,
}

impl Default for PvChainOptions {
    /// The chain's defaults, with the `shading` loss zeroed.
    ///
    /// Zeroed and not merely small: row-to-row shading is modelled here from pitch, tilt and
    /// profile angle, so PVWatts' assumed 3% would be counting the same loss twice.
    fn default() -> Self {
        Self {
            cell_temperature_model: CellTemperatureModel::Faiman,
            faiman: FAIMAN_DEFAULT,
            sapm: SAPM_OPEN_RACK_GLASS_GLASS,
            gamma_pdc_per_c: PVWATTS_GAMMA_PDC_PER_C,
            losses: crate::pv::losses::override_loss(
                PVWATTS_DEFAULT_LOSSES,
                LossComponent::Shading,
                0.0,
            ),
            dc_ac_ratio: DEFAULT_DC_AC_RATIO,
            inverter: PVWATTS_INVERTER,
            bifacial: true,
            row_shading: true,
            ground_albedo: 0.2,
            snow_cover: Vec::new(),
        }
    }
}

/// Everything about one hour that the chain reads.
///
/// `DecompositionSample` carries the irradiance and the solar geometry already, and reusing it
/// keeps one field order across the two ABI calls.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ChainHour {
    pub sample: DecompositionSample,
    pub azimuth_deg: f64,
    pub dry_bulb_c: f64,
    pub wind_speed_ms: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ArrayEnergy {
    pub module_count: f64,
    pub aperture_area_m2: f64,
    pub land_area_m2: f64,
    pub ground_cover_ratio: f64,
    pub nameplate_dc_kw: f64,
    pub nameplate_ac_kw: f64,
    pub dc_ac_ratio: f64,
    pub annual_poa_kwh_per_m2: f64,
    pub bifacial_gain_fraction: f64,
    pub row_shading_loss_fraction: f64,
    pub system_loss_fraction: f64,
    pub annual_dc_kwh: f64,
    pub annual_ac_kwh: f64,
    pub clipping_loss_kwh: f64,
    pub clipping_loss_fraction: f64,
    pub specific_yield_kwh_per_kwp: f64,
    pub performance_ratio: f64,
}

fn fraction_of(part: f64, whole: f64) -> f64 {
    if whole > 0.0 {
        part / whole
    } else {
        0.0
    }
}

pub fn run_annual_chain(
    array: &PvArray,
    hours: &[ChainHour],
    options: &PvChainOptions,
) -> ArrayEnergy {
    let gcr = ground_cover_ratio(array.geometry.collector_width_m, array.geometry.pitch_m);
    let aperture_m2 = aperture_area_m2(array);
    let dc_nameplate = nameplate_dc_kw(array);
    let ac_nameplate = nameplate_ac_kw(dc_nameplate, Some(options.dc_ac_ratio));
    let inverter_dc_kw =
        inverter_dc_rating_kw(dc_nameplate, options.dc_ac_ratio, Some(options.inverter));
    let derate = loss_derate_factor(&options.losses);

    let mut front_wh = 0.0;
    let mut rear_wh = 0.0;
    let mut shaded_away_wh = 0.0;
    let mut dc_kwh = 0.0;
    let mut ac_kwh = 0.0;
    let mut clipped_kwh = 0.0;

    for (i, hour) in hours.iter().enumerate() {
        let ghi_wm2 = hour.sample.ghi_wm2;
        let apparent_elevation_deg = hour.sample.apparent_elevation_deg;
        if ghi_wm2 <= 0.0 || apparent_elevation_deg <= 0.0 {
            continue;
        }

        let geometric_elevation_deg = hour.sample.geometric_elevation_deg;
        let solar_azimuth_deg = hour.azimuth_deg;
        let orientation = surface_orientation(array, geometric_elevation_deg, solar_azimuth_deg);
        // snow is the brightest surface the ground ever has and the rear side sees little else,
        // so this is read fresh every hour
        let ground_albedo = match options.snow_cover.get(i) {
            None => options.ground_albedo,
            Some(cover) => albedo_under_snow(options.ground_albedo, f64::from(*cover)),
        };
        let poa = perez_transposition_1990(&TranspositionInput {
            dni_wm2: hour.sample.dni_wm2,
            dhi_wm2: hour.sample.dhi_wm2,
            ghi_wm2,
            zenith_deg: 90.0 - apparent_elevation_deg,
            // recomputed here, because the sample carries the pressure-corrected air mass DIRINT
            // wants and Perez is fitted against the sea-level one; same formula and same zenith,
            // so the two agree wherever pressure is 1013.25 mb
            relative_air_mass: relative_air_mass(90.0 - apparent_elevation_deg),
            extraterrestrial_normal_wm2: hour.sample.extraterrestrial_normal_wm2,
            surface_tilt_deg: orientation.tilt_deg,
            surface_azimuth_deg: orientation.surface_azimuth_deg,
            solar_azimuth_deg,
            ground_albedo,
        });

        let mut shaded_beam_wm2 = 0.0;
        if options.row_shading && poa.beam_wm2 > 0.0 {
            let (psi_rad, side) = profile_angle(
                geometric_elevation_deg * DEG_TO_RAD,
                solar_azimuth_deg * DEG_TO_RAD,
                orientation.surface_azimuth_deg * DEG_TO_RAD,
            );
            shaded_beam_wm2 = poa.beam_wm2
                * row_self_shade_fraction(
                    array.geometry.collector_width_m,
                    array.geometry.pitch_m,
                    orientation.tilt_deg,
                    psi_rad,
                    side,
                );
        }

        let front_wm2 = (poa.global_wm2 - shaded_beam_wm2).max(0.0);
        let rear_wm2 = if options.bifacial {
            crate::pv::bifacial::rear_poa_wm2(
                ghi_wm2,
                orientation.tilt_deg,
                ground_albedo,
                gcr,
                array.module.bifaciality_factor,
                array.module.rear_reflectance,
            )
        } else {
            0.0
        };
        let effective_wm2 = front_wm2 + rear_wm2;

        let cell_c = cell_temperature(
            options.cell_temperature_model,
            effective_wm2,
            hour.dry_bulb_c,
            hour.wind_speed_ms,
            options.faiman,
            options.sapm,
        );
        let dc_kw =
            pvwatts_dc(effective_wm2, cell_c, dc_nameplate, options.gamma_pdc_per_c) * derate;
        let inverter_output = pvwatts_ac(dc_kw, inverter_dc_kw, Some(options.inverter));

        front_wh += front_wm2;
        rear_wh += rear_wm2;
        shaded_away_wh += shaded_beam_wm2;
        dc_kwh += dc_kw;
        ac_kwh += inverter_output.ac_kw;
        clipped_kwh += inverter_output.clipped_kw;
    }

    let annual_poa_kwh_per_m2 = (front_wh + rear_wh) / WH_TO_KWH;
    ArrayEnergy {
        module_count: module_count(array) as f64,
        aperture_area_m2: aperture_m2,
        land_area_m2: if gcr > 0.0 { aperture_m2 / gcr } else { 0.0 },
        ground_cover_ratio: gcr,
        nameplate_dc_kw: dc_nameplate,
        nameplate_ac_kw: ac_nameplate,
        dc_ac_ratio: options.dc_ac_ratio,
        annual_poa_kwh_per_m2,
        bifacial_gain_fraction: fraction_of(rear_wh, front_wh),
        row_shading_loss_fraction: fraction_of(shaded_away_wh, front_wh + shaded_away_wh),
        system_loss_fraction: 1.0 - derate,
        annual_dc_kwh: dc_kwh,
        annual_ac_kwh: ac_kwh,
        clipping_loss_kwh: clipped_kwh,
        clipping_loss_fraction: fraction_of(clipped_kwh, ac_kwh + clipped_kwh),
        specific_yield_kwh_per_kwp: if dc_nameplate > 0.0 {
            ac_kwh / dc_nameplate
        } else {
            0.0
        },
        performance_ratio: fraction_of(ac_kwh, dc_nameplate * annual_poa_kwh_per_m2),
    }
}
