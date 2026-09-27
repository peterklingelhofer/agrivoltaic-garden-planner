//! Where the panels put their shadows, ported from `src/sim/shading.ts`.
//!
//! This is a port of the CPU reference for the visibility question the GPU kernel answers.
//! `src/sim/gpu/webgl2.test.ts` checks the shader cell by cell against the CPU backend, which runs
//! `src/sim/shading.ts`, and `src/sim/rust-geometry-parity.test.ts` holds this module to that same
//! file

use crate::geom::{GridSpec, Polygon2D, UnitVec3, Vec2M, Vec3M};
use crate::math::{cos_deg, sin_deg};

/// Cast one panel's corners onto z = 0 along the sun direction.
///
/// Returns an empty polygon when the sun is at or below the horizon, which the caller reads as
/// "nothing is shaded because nothing is lit". The 1e-6 floor stops the division below
/// producing a shadow thousands of meters long
pub fn project_panel_to_ground(corners: &[Vec3M], sun: UnitVec3) -> Polygon2D {
    if sun.z <= 1e-6 {
        return Polygon2D::default();
    }
    Polygon2D {
        exterior: corners
            .iter()
            .map(|corner| {
                let t = corner.z_m / sun.z;
                Vec2M {
                    x_m: corner.x_m - sun.x * t,
                    y_m: corner.y_m - sun.y * t,
                }
            })
            .collect(),
        holes: Vec::new(),
    }
}

/// Crossing-number test, which is winding-agnostic and is what the TypeScript uses
fn ring_contains(ring: &[Vec2M], point: Vec2M) -> bool {
    let mut inside = false;
    let n = ring.len();
    if n == 0 {
        return false;
    }
    let mut j = n - 1;
    for i in 0..n {
        let pi = ring[i];
        let pj = ring[j];
        let crosses = ((pi.y_m > point.y_m) != (pj.y_m > point.y_m))
            && (point.x_m
                < ((pj.x_m - pi.x_m) * (point.y_m - pi.y_m)) / (pj.y_m - pi.y_m) + pi.x_m);
        if crosses {
            inside = !inside;
        }
        j = i;
    }
    inside
}

pub fn point_in_polygon(point: Vec2M, polygon: &Polygon2D) -> bool {
    ring_contains(&polygon.exterior, point)
        && !polygon.holes.iter().any(|hole| ring_contains(hole, point))
}

struct GroundShadow {
    polygon: Polygon2D,
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
    transmittance: f64,
}

fn ring_bounds(polygon: Polygon2D, transmittance: f64) -> GroundShadow {
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for p in &polygon.exterior {
        min_x = min_x.min(p.x_m);
        max_x = max_x.max(p.x_m);
        min_y = min_y.min(p.y_m);
        max_y = max_y.max(p.y_m);
    }
    GroundShadow {
        polygon,
        min_x,
        max_x,
        min_y,
        max_y,
        transmittance,
    }
}

/// Per cell, the fraction of the beam that reaches the ground.
///
/// Sub-sampled inside each cell, because a cell either side of a shadow edge is part
/// shaded and a single center sample would quantize the edge to the cell size. A blocked sample
/// still passes a transmittance, which is what makes a semi-transparent quad a shade level:
/// `transmittances[i]` for panel `i` where the slice reaches that far, else
/// `module_transmittance`. The slice is usually empty, so every panel uses `module_transmittance`.
/// A sample under more than one quad keeps the smallest of their transmittances, so a ray through
/// two faces of one crown counts once
pub fn beam_visibility_raster(
    grid: &GridSpec,
    panels: &[Vec<Vec3M>],
    sun: UnitVec3,
    module_transmittance: f64,
    transmittances: &[f64],
    sub_samples_per_cell: usize,
) -> Vec<f32> {
    let mut result = vec![0.0f32; grid.cells()];
    if sun.z <= 1e-6 {
        return result;
    }

    let shadows: Vec<GroundShadow> = panels
        .iter()
        .enumerate()
        .filter_map(|(index, corners)| {
            let polygon = project_panel_to_ground(corners, sun);
            if polygon.exterior.is_empty() {
                return None;
            }
            let transmittance = transmittances
                .get(index)
                .copied()
                .unwrap_or(module_transmittance);
            Some(ring_bounds(polygon, transmittance))
        })
        .collect();

    let sub_samples = sub_samples_per_cell.max(1);
    let total_samples = sub_samples * sub_samples;
    let step = grid.cell_size_m / sub_samples as f64;

    for row in 0..grid.rows {
        let cell_min_y = grid.extent.min_y_m + row as f64 * grid.cell_size_m;
        for col in 0..grid.cols {
            let cell_min_x = grid.extent.min_x_m + col as f64 * grid.cell_size_m;
            let mut total = 0.0f64;
            for si in 0..sub_samples {
                let sample_x = cell_min_x + (si as f64 + 0.5) * step;
                for sj in 0..sub_samples {
                    let sample_y = cell_min_y + (sj as f64 + 0.5) * step;
                    let point = Vec2M {
                        x_m: sample_x,
                        y_m: sample_y,
                    };
                    // the open figure is 1. A sample under one or more shadows keeps the
                    // smallest of their transmittances, the bounding box first because it
                    // rejects almost every quad almost always
                    let mut sample_transmittance = 1.0f64;
                    for shadow in &shadows {
                        if sample_x >= shadow.min_x
                            && sample_x <= shadow.max_x
                            && sample_y >= shadow.min_y
                            && sample_y <= shadow.max_y
                            && point_in_polygon(point, &shadow.polygon)
                        {
                            if shadow.transmittance < sample_transmittance {
                                sample_transmittance = shadow.transmittance;
                            }
                            if sample_transmittance <= 0.0 {
                                break;
                            }
                        }
                    }
                    total += sample_transmittance;
                }
            }
            result[row * grid.cols + col] = (total / total_samples as f64) as f32;
        }
    }
    result
}

/// The closed form for infinite rows, which is what pins the raster above at its limits
pub fn shaded_ground_fraction_infinite_rows(
    collector_width_m: f64,
    pitch_m: f64,
    tilt_deg: f64,
    profile_angle_rad: f64,
    side: f64,
) -> f64 {
    if profile_angle_rad <= 0.0 {
        return 1.0;
    }
    let shaded = (collector_width_m / pitch_m)
        * (cos_deg(tilt_deg) + (side * sin_deg(tilt_deg)) / profile_angle_rad.tan()).abs();
    shaded.min(1.0)
}

/// How much of a row its neighbor shades: a loss the array takes
pub fn row_self_shade_fraction(
    collector_width_m: f64,
    pitch_m: f64,
    tilt_deg: f64,
    profile_angle_rad: f64,
    side: f64,
) -> f64 {
    if profile_angle_rad <= 0.0 {
        return 0.0;
    }
    let d = collector_width_m
        * (cos_deg(tilt_deg) + (side * sin_deg(tilt_deg)) / profile_angle_rad.tan()).abs();
    if d <= pitch_m {
        0.0
    } else {
        1.0 - pitch_m / d
    }
}
