//! The browser boundary: a plain C ABI over `wasm32-unknown-unknown`, and no bindings generator.
//!
//! wasm-bindgen and wasm-pack are the obvious choice and aren't used here on purpose. This
//! crate's surface is f64 in and f64 out, which the raw ABI expresses without help, and the
//! alternative costs a second toolchain to install, a generated JavaScript file to commit or
//! gitignore, and a version to keep in step with the Rust one. `src/sim/rust-core.ts` does the
//! whole of the JavaScript side.
//!
//! Revisit this the moment the boundary needs strings, structs or errors. It doesn't yet

use crate::decomposition::{
    decompose, enforce_component_consistency, DecompositionModel, DecompositionSample,
    IrradianceComponents,
};
use crate::geom::{Extent2D, GridSpec, UnitVec3, Vec2M, Vec3M};
use crate::geometry::{panel_snapshot, ModuleSpec, PvArray, RowGeometry, Tracker};
use crate::pv::chain::{run_annual_chain, ChainHour, PvChainOptions};
use crate::pv::inverter::InverterModel;
use crate::pv::losses::PVWATTS_DEFAULT_LOSSES;
use crate::pv::temperature::{CellTemperatureModel, FaimanCoefficients, SapmThermalCoefficients};
use crate::shading::beam_visibility_raster;
use crate::solar::{spa_position, Observer};
use crate::transposition::{perez_transposition_1990, TranspositionInput};

/// Nine f64s per sample, in the field order of `SolarPosition`. `src/sim/rust-core.ts` reads them
/// back in the same order and nothing else may reorder them
pub const FIELDS_PER_SAMPLE: usize = 9;

/// Linear-memory scratch for the caller to write into and read out of.
///
/// A `Vec` is leaked deliberately: JavaScript owns the buffer between calls and gives it back
/// through `agv_free_f64`. Passing `agv_free_f64` the same `count` rebuilds the `Vec` at its full
/// capacity, which is what makes the free exact
#[no_mangle]
pub extern "C" fn agv_alloc_f64(count: usize) -> *mut f64 {
    let mut buffer = Vec::<f64>::with_capacity(count);
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// # Safety
/// `pointer` must be one `agv_alloc_f64` returned, with the same `count`, freed once
#[no_mangle]
pub unsafe extern "C" fn agv_free_f64(pointer: *mut f64, count: usize) {
    if pointer.is_null() {
        return;
    }
    drop(Vec::from_raw_parts(pointer, 0, count));
}

/// How many f64s an output buffer needs for `count` samples
#[no_mangle]
pub extern "C" fn agv_spa_series_len(count: usize) -> usize {
    count * FIELDS_PER_SAMPLE
}

/// Solar position for a run of UTC instants, one observer.
///
/// Batched rather than one call per instant because a year at four substeps an hour is 35,040
/// crossings of the boundary, and the arithmetic behind each one is a few hundred nanoseconds.
///
/// # Safety
/// `times` must point at `count` readable f64s and `out` at `count * 9` writable ones
#[no_mangle]
pub unsafe extern "C" fn agv_spa_series(
    times: *const f64,
    count: usize,
    latitude_deg: f64,
    longitude_deg: f64,
    elevation_m: f64,
    pressure_mb: f64,
    temperature_c: f64,
    out: *mut f64,
) {
    if times.is_null() || out.is_null() {
        return;
    }
    let observer = Observer {
        latitude_deg,
        longitude_deg,
        elevation_m,
        pressure_mb,
        temperature_c,
    };
    let times = std::slice::from_raw_parts(times, count);
    let out = std::slice::from_raw_parts_mut(out, count * FIELDS_PER_SAMPLE);
    for (index, &utc_millis) in times.iter().enumerate() {
        let sample = spa_position(utc_millis, &observer);
        let at = index * FIELDS_PER_SAMPLE;
        out[at] = sample.geometric_elevation_deg;
        out[at + 1] = sample.apparent_elevation_deg;
        out[at + 2] = sample.zenith_deg;
        out[at + 3] = sample.azimuth_deg;
        out[at + 4] = sample.declination_deg;
        out[at + 5] = sample.hour_angle_deg;
        out[at + 6] = sample.earth_radius_vector_au;
        out[at + 7] = sample.relative_air_mass;
        out[at + 8] = sample.absolute_air_mass;
    }
}

/// Ten f64s in per sample, in the field order of `TranspositionInput`
pub const TRANSPOSITION_INPUTS: usize = 10;
/// Four f64s out per sample, in the field order of `PoaComponents`
pub const POA_FIELDS: usize = 4;

/// Plane-of-array irradiance for a run of samples, Perez 1990.
///
/// Every sample carries its own sky and geometry, unlike `agv_spa_series` where the observer is
/// fixed: transposition is called once per timestep per surface, and the surface moves when the
/// tracker does.
///
/// # Safety
/// `inputs` must point at `count * 10` readable f64s and `out` at `count * 4` writable ones
#[no_mangle]
pub unsafe extern "C" fn agv_perez_series(inputs: *const f64, count: usize, out: *mut f64) {
    if inputs.is_null() || out.is_null() {
        return;
    }
    let inputs = std::slice::from_raw_parts(inputs, count * TRANSPOSITION_INPUTS);
    let out = std::slice::from_raw_parts_mut(out, count * POA_FIELDS);
    for index in 0..count {
        let at = index * TRANSPOSITION_INPUTS;
        let poa = perez_transposition_1990(&TranspositionInput {
            dni_wm2: inputs[at],
            dhi_wm2: inputs[at + 1],
            ghi_wm2: inputs[at + 2],
            zenith_deg: inputs[at + 3],
            relative_air_mass: inputs[at + 4],
            extraterrestrial_normal_wm2: inputs[at + 5],
            surface_tilt_deg: inputs[at + 6],
            surface_azimuth_deg: inputs[at + 7],
            solar_azimuth_deg: inputs[at + 8],
            ground_albedo: inputs[at + 9],
        });
        let to = index * POA_FIELDS;
        out[to] = poa.beam_wm2;
        out[to + 1] = poa.sky_diffuse_wm2;
        out[to + 2] = poa.ground_reflected_wm2;
        out[to + 3] = poa.global_wm2;
    }
}

/// Eight f64s in per sample, in the field order of `DecompositionSample`
pub const DECOMPOSITION_INPUTS: usize = 8;
/// Three f64s out per sample, in the field order of `IrradianceComponents`
pub const DECOMPOSITION_OUTPUTS: usize = 3;

fn decomposition_samples(inputs: &[f64], count: usize) -> Vec<DecompositionSample> {
    (0..count)
        .map(|index| {
            let at = index * DECOMPOSITION_INPUTS;
            DecompositionSample {
                utc_millis: inputs[at],
                ghi_wm2: inputs[at + 1],
                dni_wm2: inputs[at + 2],
                dhi_wm2: inputs[at + 3],
                geometric_elevation_deg: inputs[at + 4],
                apparent_elevation_deg: inputs[at + 5],
                absolute_air_mass: inputs[at + 6],
                extraterrestrial_normal_wm2: inputs[at + 7],
            }
        })
        .collect()
}

fn write_components(out: &mut [f64], components: &[IrradianceComponents]) {
    for (index, sample) in components.iter().enumerate() {
        let at = index * DECOMPOSITION_OUTPUTS;
        out[at] = sample.ghi_wm2;
        out[at + 1] = sample.dni_wm2;
        out[at + 2] = sample.dhi_wm2;
    }
}

/// Beam and diffuse from global, for a whole series.
///
/// Whole-series for a reason stronger than the batching one above: DIRINT reads a neighbor on
/// each side, so a sample has no answer outside the series it belongs to.
///
/// `model` is the wire code in `DecompositionModel::from_code`. An unrecognized one fills `out`
/// with NaN rather than returning quietly, because the alternative is a garden lit by whatever
/// the caller's buffer happened to contain.
///
/// # Safety
/// `inputs` must point at `count * 8` readable f64s and `out` at `count * 3` writable ones
#[no_mangle]
pub unsafe extern "C" fn agv_decompose_series(
    model: u32,
    count: usize,
    utc_offset_hours: f64,
    inputs: *const f64,
    out: *mut f64,
) {
    if inputs.is_null() || out.is_null() {
        return;
    }
    let inputs = std::slice::from_raw_parts(inputs, count * DECOMPOSITION_INPUTS);
    let out = std::slice::from_raw_parts_mut(out, count * DECOMPOSITION_OUTPUTS);
    let Some(model) = DecompositionModel::from_code(model) else {
        out.fill(f64::NAN);
        return;
    };
    let samples = decomposition_samples(inputs, count);
    write_components(out, &decompose(&samples, model, utc_offset_hours));
}

/// The closure test alone, over the components the caller already has.
///
/// Exposed separately from `agv_decompose_series` so it can be held to the TypeScript on its own.
/// Run at the end of every decomposition path, it would otherwise be able to absorb a divergence
/// upstream of it and make the comparison say less than it appears to.
///
/// Reads `dni` and `dhi` from the same eight-field layout, so there's one input contract here
/// rather than two.
///
/// # Safety
/// `inputs` must point at `count * 8` readable f64s and `out` at `count * 3` writable ones
#[no_mangle]
pub unsafe extern "C" fn agv_enforce_consistency_series(
    count: usize,
    inputs: *const f64,
    out: *mut f64,
) {
    if inputs.is_null() || out.is_null() {
        return;
    }
    let inputs = std::slice::from_raw_parts(inputs, count * DECOMPOSITION_INPUTS);
    let out = std::slice::from_raw_parts_mut(out, count * DECOMPOSITION_OUTPUTS);
    let samples = decomposition_samples(inputs, count);
    let dni: Vec<f64> = samples.iter().map(|s| s.dni_wm2).collect();
    let dhi: Vec<f64> = samples.iter().map(|s| s.dhi_wm2).collect();
    write_components(out, &enforce_component_consistency(&samples, &dni, &dhi));
}

/// Twenty-one f64s describing one array: its row geometry, its tracker and its module
pub const ARRAY_FIELDS: usize = 21;
/// Twelve f64s per hour: the eight of `DecompositionSample`, then azimuth, air temperature, wind
/// and the ground's snow fraction
pub const CHAIN_HOUR_FIELDS: usize = 12;
/// Twenty-four f64s of chain options, the last ten of which are the loss stack's fractions in the
/// order `PVWATTS_DEFAULT_LOSSES` declares them. The labels stay in TypeScript. See `losses.rs`
pub const CHAIN_OPTION_FIELDS: usize = 24;
/// Seventeen f64s of `ArrayEnergy`
pub const ARRAY_ENERGY_FIELDS: usize = 17;

fn read_array(f: &[f64]) -> PvArray {
    let tracker = match f[9] as u32 {
        1 | 2 => Tracker::SingleAxis {
            horizontal_ns: f[9] as u32 == 1,
            axis_tilt_deg: f[10],
            axis_azimuth_deg: f[11],
            max_rotation_deg: f[12],
            backtracking: f[14] != 0.0,
        },
        3 => Tracker::DualAxis {
            max_rotation_deg: f[12],
            min_elevation_deg: f[13],
        },
        4 => Tracker::AgroOptimized {
            max_rotation_deg: f[12],
        },
        _ => Tracker::Fixed {
            tilt_deg: f[10],
            surface_azimuth_deg: f[11],
        },
    };
    PvArray {
        geometry: RowGeometry {
            collector_width_m: f[0],
            pitch_m: f[1],
            row_length_m: f[2],
            row_count: f[3] as usize,
            modules_per_row: f[4] as usize,
            clearance_height_m: f[5],
            row_azimuth_deg: f[6],
            origin_m: Vec2M {
                x_m: f[7],
                y_m: f[8],
            },
        },
        tracker,
        module: ModuleSpec {
            width_m: f[15],
            height_m: f[16],
            nameplate_wp: f[17],
            bifaciality_factor: f[18],
            transmittance_fraction: f[19],
            rear_reflectance: f[20],
        },
    }
}

/// One array's year of AC energy, the whole chain in one crossing.
///
/// Batched to this extent on purpose: it exercises the array geometry, the tracker, Perez
/// transposition, row self-shading, the bifacial rear term, snow albedo, cell temperature, the DC
/// model, the loss stack and the inverter, for every hour of the year, and crossing the boundary
/// once an hour would cost more than that arithmetic.
///
/// # Safety
/// `array` must point at 21 readable f64s, `hours` at `count * 12`, `options` at 24, and `out` at
/// 17 writable ones
#[no_mangle]
pub unsafe extern "C" fn agv_annual_chain(
    array: *const f64,
    hours: *const f64,
    count: usize,
    options: *const f64,
    out: *mut f64,
) {
    if array.is_null() || hours.is_null() || options.is_null() || out.is_null() {
        return;
    }
    let array = read_array(std::slice::from_raw_parts(array, ARRAY_FIELDS));
    let o = std::slice::from_raw_parts(options, CHAIN_OPTION_FIELDS);
    let raw_hours = std::slice::from_raw_parts(hours, count * CHAIN_HOUR_FIELDS);
    let out = std::slice::from_raw_parts_mut(out, ARRAY_ENERGY_FIELDS);

    let chain_hours: Vec<ChainHour> = (0..count)
        .map(|index| {
            let at = index * CHAIN_HOUR_FIELDS;
            ChainHour {
                sample: DecompositionSample {
                    utc_millis: raw_hours[at],
                    ghi_wm2: raw_hours[at + 1],
                    dni_wm2: raw_hours[at + 2],
                    dhi_wm2: raw_hours[at + 3],
                    geometric_elevation_deg: raw_hours[at + 4],
                    apparent_elevation_deg: raw_hours[at + 5],
                    absolute_air_mass: raw_hours[at + 6],
                    extraterrestrial_normal_wm2: raw_hours[at + 7],
                },
                azimuth_deg: raw_hours[at + 8],
                dry_bulb_c: raw_hours[at + 9],
                wind_speed_ms: raw_hours[at + 10],
            }
        })
        .collect();

    let options = PvChainOptions {
        cell_temperature_model: if o[0] as u32 == 1 {
            CellTemperatureModel::Sapm
        } else {
            CellTemperatureModel::Faiman
        },
        faiman: FaimanCoefficients { u0: o[1], u1: o[2] },
        sapm: SapmThermalCoefficients {
            a: o[3],
            b: o[4],
            delta_t_c: o[5],
        },
        gamma_pdc_per_c: o[6],
        dc_ac_ratio: o[7],
        inverter: InverterModel {
            nominal_efficiency: o[8],
            reference_efficiency: o[9],
        },
        bifacial: o[10] != 0.0,
        row_shading: o[11] != 0.0,
        ground_albedo: o[12],
        // positional, in the order PVWATTS_DEFAULT_LOSSES declares. Only the arithmetic crosses
        losses: PVWATTS_DEFAULT_LOSSES
            .iter()
            .enumerate()
            .map(|(index, (component, _))| (*component, o[14 + index]))
            .collect(),
        // a null snow series and an all-zero one are the same thing: `albedo_under_snow(a, 0) == a`
        snow_cover: (0..count)
            .map(|index| raw_hours[index * CHAIN_HOUR_FIELDS + 11] as f32)
            .collect(),
    };

    let energy = run_annual_chain(&array, &chain_hours, &options);
    out[0] = energy.module_count;
    out[1] = energy.aperture_area_m2;
    out[2] = energy.land_area_m2;
    out[3] = energy.ground_cover_ratio;
    out[4] = energy.nameplate_dc_kw;
    out[5] = energy.nameplate_ac_kw;
    out[6] = energy.dc_ac_ratio;
    out[7] = energy.annual_poa_kwh_per_m2;
    out[8] = energy.bifacial_gain_fraction;
    out[9] = energy.row_shading_loss_fraction;
    out[10] = energy.system_loss_fraction;
    out[11] = energy.annual_dc_kwh;
    out[12] = energy.annual_ac_kwh;
    out[13] = energy.clipping_loss_kwh;
    out[14] = energy.clipping_loss_fraction;
    out[15] = energy.specific_yield_kwh_per_kwp;
    out[16] = energy.performance_ratio;
}

/// Twelve f64s per panel: four corners of three coordinates each
pub const PANEL_CORNER_FIELDS: usize = 12;

/// Every panel of one array, posed for one instant.
///
/// # Safety
/// `array` must point at 21 readable f64s and `out` at `panels * 12` writable ones, where
/// `panels` is `row_count * modules_per_row`
#[no_mangle]
pub unsafe extern "C" fn agv_panel_snapshot(
    array: *const f64,
    solar_elevation_deg: f64,
    solar_azimuth_deg: f64,
    out: *mut f64,
) {
    if array.is_null() || out.is_null() {
        return;
    }
    let array = read_array(std::slice::from_raw_parts(array, ARRAY_FIELDS));
    let panels = panel_snapshot(&[array], solar_elevation_deg, solar_azimuth_deg);
    let out = std::slice::from_raw_parts_mut(out, panels.len() * PANEL_CORNER_FIELDS);
    for (index, panel) in panels.iter().enumerate() {
        let at = index * PANEL_CORNER_FIELDS;
        for (corner, vertex) in panel.corners.iter().enumerate() {
            out[at + corner * 3] = vertex.x_m;
            out[at + corner * 3 + 1] = vertex.y_m;
            out[at + corner * 3 + 2] = vertex.z_m;
        }
    }
}

/// The beam visibility raster: per cell, the fraction of the direct beam that reaches the ground.
///
/// Panels arrive as the same twelve-f64 records `agv_panel_snapshot` writes, so the two compose
/// without a second format.
///
/// # Safety
/// `panels` must point at `panel_count * 12` readable f64s and `out` at `cols * rows` writable
/// ones
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn agv_beam_visibility(
    min_x_m: f64,
    min_y_m: f64,
    cell_size_m: f64,
    cols: usize,
    rows: usize,
    panels: *const f64,
    panel_count: usize,
    sun_x: f64,
    sun_y: f64,
    sun_z: f64,
    module_transmittance: f64,
    sub_samples_per_cell: usize,
    out: *mut f64,
) {
    if out.is_null() {
        return;
    }
    let grid = GridSpec {
        extent: Extent2D {
            min_x_m,
            min_y_m,
            max_x_m: min_x_m + cols as f64 * cell_size_m,
            max_y_m: min_y_m + rows as f64 * cell_size_m,
        },
        cell_size_m,
        cols,
        rows,
    };
    let corners: Vec<Vec<Vec3M>> = if panels.is_null() || panel_count == 0 {
        Vec::new()
    } else {
        let flat = std::slice::from_raw_parts(panels, panel_count * PANEL_CORNER_FIELDS);
        (0..panel_count)
            .map(|index| {
                let at = index * PANEL_CORNER_FIELDS;
                (0..4)
                    .map(|corner| Vec3M {
                        x_m: flat[at + corner * 3],
                        y_m: flat[at + corner * 3 + 1],
                        z_m: flat[at + corner * 3 + 2],
                    })
                    .collect()
            })
            .collect()
    };
    let visibility = beam_visibility_raster(
        &grid,
        &corners,
        UnitVec3 {
            x: sun_x,
            y: sun_y,
            z: sun_z,
        },
        module_transmittance,
        sub_samples_per_cell,
    );
    let out = std::slice::from_raw_parts_mut(out, grid.cells());
    for (slot, value) in out.iter_mut().zip(visibility) {
        *slot = f64::from(value);
    }
}
