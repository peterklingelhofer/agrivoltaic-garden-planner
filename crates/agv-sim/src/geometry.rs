//! Where the panels are and which way they point, ported from `src/sim/geometry.ts`.
//!
//! This is the module that turns an array's description into the corners `shading.rs` casts
//! shadows from, and it's the first port where Rust's type system does something the TypeScript
//! could only approximate. `TrackerConfig` there is a discriminated union of four interfaces with
//! partly-overlapping fields, and reading `tracker.axisTiltDeg` requires the compiler to have
//! narrowed the union first. Here it is an `enum` with the fields inside the variants, so a
//! rotation rule can't read an axis tilt off a fixed-tilt array at all. That's the argument in
//! `the port document` section 5 made concrete rather than asserted

use crate::geom::{Extent2D, GridSpec, Vec2M, Vec3M};
use crate::math::{clamp, cos_deg, normalize_degrees, sin_deg, RAD_TO_DEG};
use crate::pv::inverter::nameplate_ac_kw;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Tracker {
    Fixed {
        tilt_deg: f64,
        surface_azimuth_deg: f64,
    },
    /// Both `single-axis-horizontal-ns` and `single-axis-tilted`. They differ only in the
    /// reference tilt, which is the axis tilt for the tilted one and zero for the horizontal one,
    /// so `horizontal_ns` carries that one distinction rather than a second variant that would
    /// duplicate every field
    SingleAxis {
        horizontal_ns: bool,
        axis_tilt_deg: f64,
        axis_azimuth_deg: f64,
        max_rotation_deg: f64,
        backtracking: bool,
    },
    DualAxis {
        max_rotation_deg: f64,
        min_elevation_deg: f64,
    },
    AgroOptimized {
        max_rotation_deg: f64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RowGeometry {
    pub collector_width_m: f64,
    pub pitch_m: f64,
    pub row_length_m: f64,
    pub row_count: usize,
    pub modules_per_row: usize,
    pub clearance_height_m: f64,
    pub row_azimuth_deg: f64,
    pub origin_m: Vec2M,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ModuleSpec {
    pub width_m: f64,
    pub height_m: f64,
    pub nameplate_wp: f64,
    pub bifaciality_factor: f64,
    pub transmittance_fraction: f64,
    pub rear_reflectance: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PvArray {
    pub geometry: RowGeometry,
    pub tracker: Tracker,
    pub module: ModuleSpec,
}

/// One panel's four corners and its normal.
///
/// No identity: see the note at the top of `geom.rs`. `row_index` and `column_index` are what the
/// TypeScript builds its `PanelId` string out of, so the shell can still name a panel
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PanelPolygon {
    pub row_index: usize,
    pub column_index: usize,
    pub corners: [Vec3M; 4],
    pub normal: crate::geom::UnitVec3,
    pub tilt_deg: f64,
    pub surface_azimuth_deg: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DerivedArrayMetrics {
    pub ground_cover_ratio: f64,
    pub projected_ground_cover_ratio: f64,
    pub max_height_m: f64,
    pub nameplate_dc_kw: f64,
    pub nameplate_ac_kw: f64,
}

pub fn ground_cover_ratio(collector_width_m: f64, pitch_m: f64) -> f64 {
    collector_width_m / pitch_m
}

pub fn projected_ground_cover_ratio(collector_width_m: f64, pitch_m: f64, tilt_deg: f64) -> f64 {
    (collector_width_m * cos_deg(tilt_deg)) / pitch_m
}

fn reference_tilt_deg(tracker: &Tracker) -> f64 {
    match tracker {
        Tracker::Fixed { tilt_deg, .. } => *tilt_deg,
        Tracker::SingleAxis {
            horizontal_ns: false,
            axis_tilt_deg,
            ..
        } => *axis_tilt_deg,
        _ => 0.0,
    }
}

/// How many modules stack up the slope, implied by collector width over module height
pub fn module_stack_count(array: &PvArray) -> usize {
    let raw = array.geometry.collector_width_m / array.module.height_m;
    // JavaScript's Math.round is half-up, including for negatives. Rust's f64::round is half-away
    // from zero. Identical for the positive lengths this can hold, and the max(1) covers the rest
    (raw.round() as i64).max(1) as usize
}

pub fn module_count(array: &PvArray) -> usize {
    array.geometry.row_count * array.geometry.modules_per_row * module_stack_count(array)
}

pub fn aperture_area_m2(array: &PvArray) -> f64 {
    module_count(array) as f64 * array.module.width_m * array.module.height_m
}

pub fn nameplate_dc_kw(array: &PvArray) -> f64 {
    (module_count(array) as f64 * array.module.nameplate_wp) / 1000.0
}

pub fn derived_array_metrics(array: &PvArray) -> DerivedArrayMetrics {
    let tilt_deg = reference_tilt_deg(&array.tracker);
    let dc = nameplate_dc_kw(array);
    DerivedArrayMetrics {
        ground_cover_ratio: ground_cover_ratio(
            array.geometry.collector_width_m,
            array.geometry.pitch_m,
        ),
        projected_ground_cover_ratio: projected_ground_cover_ratio(
            array.geometry.collector_width_m,
            array.geometry.pitch_m,
            tilt_deg,
        ),
        max_height_m: array.geometry.clearance_height_m
            + array.geometry.collector_width_m * sin_deg(tilt_deg),
        nameplate_dc_kw: dc,
        nameplate_ac_kw: nameplate_ac_kw(dc, None),
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SurfaceOrientation {
    pub tilt_deg: f64,
    pub surface_azimuth_deg: f64,
    pub rotation_deg: f64,
}

/// The single source of the tracker pose, read by both the panel snapshot and the PV chain
pub fn surface_orientation(
    array: &PvArray,
    solar_elevation_deg: f64,
    solar_azimuth_deg: f64,
) -> SurfaceOrientation {
    let rotation_deg = tracker_rotation_deg(&array.tracker, solar_elevation_deg, solar_azimuth_deg);
    let surface_azimuth_deg = match &array.tracker {
        Tracker::Fixed {
            surface_azimuth_deg,
            ..
        } => *surface_azimuth_deg,
        Tracker::SingleAxis {
            axis_azimuth_deg, ..
        } => normalize_degrees(axis_azimuth_deg + if rotation_deg >= 0.0 { 90.0 } else { -90.0 }),
        // every remaining mode turns about an axis running ALONG the rows, so the face it presents
        // is perpendicular to that axis. Returning `row_azimuth_deg` itself would aim the panel
        // straight down its own torque tube
        _ => normalize_degrees(
            array.geometry.row_azimuth_deg + if rotation_deg >= 0.0 { 90.0 } else { -90.0 },
        ),
    };
    SurfaceOrientation {
        rotation_deg,
        tilt_deg: rotation_deg.abs(),
        surface_azimuth_deg,
    }
}

pub fn tracker_rotation_deg(
    tracker: &Tracker,
    solar_elevation_deg: f64,
    solar_azimuth_deg: f64,
) -> f64 {
    match tracker {
        Tracker::Fixed { tilt_deg, .. } => *tilt_deg,
        Tracker::SingleAxis {
            axis_tilt_deg,
            axis_azimuth_deg,
            max_rotation_deg,
            ..
        } => {
            if solar_elevation_deg <= 0.0 {
                return 0.0;
            }
            let zenith_deg = 90.0 - solar_elevation_deg;
            let delta_az_deg = solar_azimuth_deg - axis_azimuth_deg;
            let xp = sin_deg(zenith_deg) * sin_deg(delta_az_deg);
            let zp = sin_deg(zenith_deg) * cos_deg(delta_az_deg) * sin_deg(*axis_tilt_deg)
                + cos_deg(zenith_deg) * cos_deg(*axis_tilt_deg);
            clamp(
                xp.atan2(zp) * RAD_TO_DEG,
                -max_rotation_deg,
                *max_rotation_deg,
            )
        }
        Tracker::DualAxis {
            max_rotation_deg,
            min_elevation_deg,
        } => {
            if solar_elevation_deg < *min_elevation_deg {
                return 0.0;
            }
            (90.0 - solar_elevation_deg).min(*max_rotation_deg)
        }
        Tracker::AgroOptimized { max_rotation_deg } => {
            // the ground-DLI target is applied by the layout optimizer, which owns pitch
            if solar_elevation_deg <= 0.0 {
                return 0.0;
            }
            let zenith_deg = 90.0 - solar_elevation_deg;
            let rotation = (sin_deg(zenith_deg) * sin_deg(solar_azimuth_deg))
                .atan2(cos_deg(zenith_deg))
                * RAD_TO_DEG;
            clamp(rotation, -max_rotation_deg, *max_rotation_deg)
        }
    }
}

/// Backtracking: rotate back until the row no longer shades the one behind it.
///
/// The solar geometry document section 3.2 writes `cos(psi)`. That's a slip in the doc; `sin(psi)` is the
/// algebraically correct form and is what both implementations use
pub fn backtrack_rotation_deg(
    true_rotation_deg: f64,
    pitch_m: f64,
    collector_width_m: f64,
    profile_angle_rad: f64,
) -> f64 {
    let correction_rad = clamp(
        (pitch_m / collector_width_m) * profile_angle_rad.sin(),
        -1.0,
        1.0,
    )
    .acos();
    // Math.sign, which is 0 at 0 rather than 1; f64::signum is 1.0 at +0.0 and would rotate a
    // level tracker by the whole correction
    let sign = if true_rotation_deg > 0.0 {
        1.0
    } else if true_rotation_deg < 0.0 {
        -1.0
    } else {
        0.0
    };
    true_rotation_deg - sign * correction_rad * RAD_TO_DEG
}

pub fn minimum_pitch_m(collector_width_m: f64, tilt_deg: f64, min_profile_angle_rad: f64) -> f64 {
    collector_width_m * (cos_deg(tilt_deg) + sin_deg(tilt_deg) / min_profile_angle_rad.tan())
}

/// Every panel of every array, posed for one instant
pub fn panel_snapshot(
    arrays: &[PvArray],
    solar_elevation_deg: f64,
    solar_azimuth_deg: f64,
) -> Vec<PanelPolygon> {
    let mut panels = Vec::new();
    for array in arrays {
        let g = &array.geometry;
        let pose = surface_orientation(array, solar_elevation_deg, solar_azimuth_deg);
        let (tilt_deg, surface_azimuth_deg) = (pose.tilt_deg, pose.surface_azimuth_deg);

        // `row_azimuth_deg` is the direction the rows RUN. `a` is therefore the along-row
        // direction, which modules are laid end to end along, and `u` is the across-row
        // direction, which the rows step along one pitch at a time.
        //
        // These two were exchanged until 2026-09-01, in this file and in `src/sim/geometry.ts`
        // together, which is why the parity test between them never noticed: it holds the two
        // implementations to EACH OTHER and both carried it. The pose it produced left every
        // panel edge on to the direction its own row stepped, so a tilted array had zero width
        // across its pitch and its rows stood shoulder to shoulder rather than behind one
        // another. Rows like that shade almost nothing, and the bake reported about 23% more
        // light under an array than reaches it
        let ax = sin_deg(g.row_azimuth_deg);
        let ay = cos_deg(g.row_azimuth_deg);
        let ux = cos_deg(g.row_azimuth_deg);
        let uy = -sin_deg(g.row_azimuth_deg);
        // and the direction the modules face
        let fx = sin_deg(surface_azimuth_deg);
        let fy = cos_deg(surface_azimuth_deg);

        let half_span_w = (g.collector_width_m * cos_deg(tilt_deg)) / 2.0;
        let rise_h = g.collector_width_m * sin_deg(tilt_deg);
        let module_length_m = g.row_length_m / g.modules_per_row as f64;
        let half_len = module_length_m / 2.0;
        let lower_z = g.clearance_height_m;
        let upper_z = g.clearance_height_m + rise_h;
        let normal = crate::geom::UnitVec3 {
            x: fx * sin_deg(tilt_deg),
            y: fy * sin_deg(tilt_deg),
            z: cos_deg(tilt_deg),
        };

        for k in 0..g.row_count {
            let row_offset = (k as f64 - (g.row_count as f64 - 1.0) / 2.0) * g.pitch_m;
            let row_center_x = g.origin_m.x_m + ux * row_offset;
            let row_center_y = g.origin_m.y_m + uy * row_offset;
            for j in 0..g.modules_per_row {
                let col_offset =
                    (j as f64 - (g.modules_per_row as f64 - 1.0) / 2.0) * module_length_m;
                let base_x = row_center_x + ax * col_offset;
                let base_y = row_center_y + ay * col_offset;
                let lower_x = base_x + fx * half_span_w;
                let lower_y = base_y + fy * half_span_w;
                let upper_x = base_x - fx * half_span_w;
                let upper_y = base_y - fy * half_span_w;
                panels.push(PanelPolygon {
                    row_index: k,
                    column_index: j,
                    corners: [
                        Vec3M {
                            x_m: lower_x - ax * half_len,
                            y_m: lower_y - ay * half_len,
                            z_m: lower_z,
                        },
                        Vec3M {
                            x_m: lower_x + ax * half_len,
                            y_m: lower_y + ay * half_len,
                            z_m: lower_z,
                        },
                        Vec3M {
                            x_m: upper_x + ax * half_len,
                            y_m: upper_y + ay * half_len,
                            z_m: upper_z,
                        },
                        Vec3M {
                            x_m: upper_x - ax * half_len,
                            y_m: upper_y - ay * half_len,
                            z_m: upper_z,
                        },
                    ],
                    normal,
                    tilt_deg,
                    surface_azimuth_deg,
                });
            }
        }
    }
    panels
}

/// The bounding box of everything in the scene, plus a margin.
///
/// Posed at the sun overhead, because the extent must not move when the sun does: a tracker turns
/// through the day and an extent derived from a real sun position would resize the raster every
/// timestep
pub fn scene_extent(arrays: &[PvArray], beds: &[Vec<Vec2M>], margin_m: f64) -> Extent2D {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    let mut extend = |x: f64, y: f64| {
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
    };
    for panel in panel_snapshot(arrays, 90.0, 0.0) {
        for vertex in panel.corners {
            extend(vertex.x_m, vertex.y_m);
        }
    }
    for bed in beds {
        for point in bed {
            extend(point.x_m, point.y_m);
        }
    }
    if !min_x.is_finite() {
        return Extent2D {
            min_x_m: -margin_m,
            min_y_m: -margin_m,
            max_x_m: margin_m,
            max_y_m: margin_m,
        };
    }
    Extent2D {
        min_x_m: min_x - margin_m,
        min_y_m: min_y - margin_m,
        max_x_m: max_x + margin_m,
        max_y_m: max_y + margin_m,
    }
}

const GRID_CELL_CAP: usize = 1024;

/// A raster over an extent at a target cell size, capped so a large plot can't ask for a grid
/// nothing can bake
pub fn grid_for_extent(extent: &Extent2D, target_cell_size_m: f64) -> GridSpec {
    let width = extent.max_x_m - extent.min_x_m;
    let height = extent.max_y_m - extent.min_y_m;
    let raw_cols = (width / target_cell_size_m).ceil().max(1.0);
    let raw_rows = (height / target_cell_size_m).ceil().max(1.0);
    let cell_size_m = if raw_cols > GRID_CELL_CAP as f64 || raw_rows > GRID_CELL_CAP as f64 {
        width.max(height) / GRID_CELL_CAP as f64
    } else {
        target_cell_size_m
    };
    let cols = ((width / cell_size_m).ceil().max(1.0) as usize).min(GRID_CELL_CAP);
    let rows = ((height / cell_size_m).ceil().max(1.0) as usize).min(GRID_CELL_CAP);
    GridSpec {
        extent: Extent2D {
            min_x_m: extent.min_x_m,
            min_y_m: extent.min_y_m,
            max_x_m: extent.min_x_m + cols as f64 * cell_size_m,
            max_y_m: extent.min_y_m + rows as f64 * cell_size_m,
        },
        cell_size_m,
        cols,
        rows,
    }
}
