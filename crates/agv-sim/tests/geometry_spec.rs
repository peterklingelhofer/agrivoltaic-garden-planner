//! The geometry, shading and chain kernels against closed forms and published defaults.
//!
//! Solar position has NREL's worked example and decomposition has pvlib's output, so both can stand
//! alone. Geometry, shading, view factors and the PV chain have neither, and this file is the
//! evidence that they're right.
//!
//! So every assertion below is against something outside this repository, or against a limit the
//! geometry fixes analytically. Where neither exists, the test says what it's really claiming
//! rather than pretending to more

use agv_sim::geom::{Extent2D, GridSpec, UnitVec3, Vec2M, Vec3M};
use agv_sim::geometry::{
    grid_for_extent, ground_cover_ratio, module_count, panel_snapshot,
    projected_ground_cover_ratio, surface_orientation, tracker_rotation_deg, ModuleSpec, PvArray,
    RowGeometry, Tracker,
};
use agv_sim::pv::dc::{pvwatts_dc, PVWATTS_GAMMA_PDC_PER_C};
use agv_sim::pv::inverter::{pvwatts_ac, PVWATTS_INVERTER};
use agv_sim::pv::losses::{combined_loss_fraction, PVWATTS_DEFAULT_LOSSES};
use agv_sim::pv::temperature::{
    faiman_cell_temperature, sapm_cell_temperature, FAIMAN_DEFAULT, SAPM_OPEN_RACK_GLASS_GLASS,
};
use agv_sim::shading::{
    beam_visibility_raster, point_in_polygon, project_panel_to_ground, row_self_shade_fraction,
    shaded_ground_fraction_infinite_rows,
};
use agv_sim::viewfactor::{crossed_strings_view_factor, interreflection_gain};

fn array(tracker: Tracker) -> PvArray {
    PvArray {
        geometry: RowGeometry {
            collector_width_m: 2.0,
            pitch_m: 5.0,
            row_length_m: 10.0,
            row_count: 2,
            modules_per_row: 4,
            clearance_height_m: 2.5,
            row_azimuth_deg: 90.0,
            origin_m: Vec2M { x_m: 0.0, y_m: 0.0 },
        },
        tracker,
        module: ModuleSpec {
            width_m: 1.0,
            height_m: 2.0,
            nameplate_wp: 400.0,
            bifaciality_factor: 0.7,
            transmittance_fraction: 0.0,
            rear_reflectance: 0.05,
        },
    }
}

const FIXED_30: Tracker = Tracker::Fixed {
    tilt_deg: 30.0,
    surface_azimuth_deg: 180.0,
};

/// GCR is collector width over pitch by definition, and the projected form is that times cos(tilt).
/// A flat panel projects its whole width. A vertical one projects none
#[test]
fn ground_cover_ratio_is_its_own_definition() {
    assert!((ground_cover_ratio(2.0, 5.0) - 0.4).abs() < 1e-12);
    assert!((projected_ground_cover_ratio(2.0, 5.0, 0.0) - 0.4).abs() < 1e-12);
    assert!(projected_ground_cover_ratio(2.0, 5.0, 90.0).abs() < 1e-12);
}

/// A fixed array doesn't move, whatever the sun does. This is the property the whole tracker
/// abstraction rests on and it's worth pinning before the ones that do move
#[test]
fn a_fixed_array_never_rotates() {
    for elevation in [-10.0, 0.0, 5.0, 45.0, 89.0] {
        for azimuth in [0.0, 90.0, 180.0, 270.0] {
            assert_eq!(tracker_rotation_deg(&FIXED_30, elevation, azimuth), 30.0);
        }
    }
}

/// A horizontal north-south tracker points at the sun: due east at sunrise, flat at solar noon,
/// due west at sunset. That's the geometry itself, with nothing fitted
#[test]
fn a_horizontal_tracker_follows_the_sun_across_the_sky() {
    let tracker = Tracker::SingleAxis {
        horizontal_ns: true,
        axis_tilt_deg: 0.0,
        axis_azimuth_deg: 0.0,
        max_rotation_deg: 60.0,
        backtracking: false,
    };
    let morning = tracker_rotation_deg(&tracker, 20.0, 90.0);
    let noon = tracker_rotation_deg(&tracker, 60.0, 180.0);
    let evening = tracker_rotation_deg(&tracker, 20.0, 270.0);
    assert!(morning > 45.0, "morning rotation was {morning}");
    assert!(noon.abs() < 1e-9, "noon rotation was {noon}");
    assert!(evening < -45.0, "evening rotation was {evening}");
    // and it never exceeds its own stop
    assert!(tracker_rotation_deg(&tracker, 1.0, 90.0).abs() <= 60.0 + 1e-9);
}

/// Below the horizon every tracker parks flat, because there's nothing to track
#[test]
fn every_tracker_parks_below_the_horizon() {
    for tracker in [
        Tracker::SingleAxis {
            horizontal_ns: true,
            axis_tilt_deg: 0.0,
            axis_azimuth_deg: 0.0,
            max_rotation_deg: 60.0,
            backtracking: false,
        },
        Tracker::DualAxis {
            max_rotation_deg: 60.0,
            min_elevation_deg: 5.0,
        },
        Tracker::AgroOptimized {
            max_rotation_deg: 50.0,
        },
    ] {
        assert_eq!(tracker_rotation_deg(&tracker, -1.0, 180.0), 0.0);
    }
}

/// A dual-axis tracker faces the sun, so its tilt is the zenith angle until it hits its stop
#[test]
fn a_dual_axis_tracker_faces_the_sun_until_it_cannot() {
    let tracker = Tracker::DualAxis {
        max_rotation_deg: 60.0,
        min_elevation_deg: 5.0,
    };
    assert!((tracker_rotation_deg(&tracker, 50.0, 180.0) - 40.0).abs() < 1e-12);
    // 10 degrees of elevation wants 80 of tilt, and the stop is 60
    assert!((tracker_rotation_deg(&tracker, 10.0, 180.0) - 60.0).abs() < 1e-12);
}

/// The panel count is rows times modules per row times how many stack up the slope, and the
/// corners must sit between the clearance height and the clearance plus the rise
#[test]
fn the_snapshot_puts_every_panel_where_the_geometry_says() {
    let array = array(FIXED_30);
    let panels = panel_snapshot(&[array], 45.0, 180.0);
    assert_eq!(panels.len(), 2 * 4);
    // collector width 2.0 over module height 2.0 is one module up the slope
    assert_eq!(module_count(&array), 2 * 4);

    let rise = 2.0 * (30.0f64).to_radians().sin();
    for panel in &panels {
        assert!((panel.tilt_deg - 30.0).abs() < 1e-12);
        let lowest = panel.corners.iter().map(|c| c.z_m).fold(f64::MAX, f64::min);
        let highest = panel.corners.iter().map(|c| c.z_m).fold(f64::MIN, f64::max);
        assert!((lowest - 2.5).abs() < 1e-9, "lowest corner {lowest}");
        assert!(
            (highest - (2.5 + rise)).abs() < 1e-9,
            "highest corner {highest}"
        );
    }
    // and the normal is a unit vector, which nothing downstream checks
    let n = panels[0].normal;
    assert!((n.x * n.x + n.y * n.y + n.z * n.z - 1.0).abs() < 1e-12);
}

/// A tracker turns the rows, so the surface azimuth must move with it, and a fixed array's must
/// not. This is the pose both the snapshot and the PV chain read, so a disagreement here would
/// make the picture and the energy describe different arrays
#[test]
fn the_pose_is_one_answer_for_the_snapshot_and_the_chain() {
    let fixed = surface_orientation(&array(FIXED_30), 45.0, 200.0);
    assert!((fixed.surface_azimuth_deg - 180.0).abs() < 1e-12);
    assert!((fixed.tilt_deg - 30.0).abs() < 1e-12);

    let tracked = surface_orientation(
        &array(Tracker::SingleAxis {
            horizontal_ns: true,
            axis_tilt_deg: 0.0,
            axis_azimuth_deg: 0.0,
            max_rotation_deg: 60.0,
            backtracking: false,
        }),
        20.0,
        90.0,
    );
    // rotated east, so the surface faces 90 degrees round from the axis
    assert!((tracked.surface_azimuth_deg - 90.0).abs() < 1e-9);
    assert!(tracked.tilt_deg > 0.0);
}

/// Sun directly overhead, so a panel's shadow is the panel: same footprint, no displacement
#[test]
fn an_overhead_sun_casts_a_shadow_the_shape_of_the_panel() {
    let corners = [
        Vec3M {
            x_m: -1.0,
            y_m: -1.0,
            z_m: 3.0,
        },
        Vec3M {
            x_m: 1.0,
            y_m: -1.0,
            z_m: 3.0,
        },
        Vec3M {
            x_m: 1.0,
            y_m: 1.0,
            z_m: 3.0,
        },
        Vec3M {
            x_m: -1.0,
            y_m: 1.0,
            z_m: 3.0,
        },
    ];
    let shadow = project_panel_to_ground(
        &corners,
        UnitVec3 {
            x: 0.0,
            y: 0.0,
            z: 1.0,
        },
    );
    for (projected, corner) in shadow.exterior.iter().zip(corners.iter()) {
        assert!((projected.x_m - corner.x_m).abs() < 1e-12);
        assert!((projected.y_m - corner.y_m).abs() < 1e-12);
    }
    assert!(point_in_polygon(Vec2M { x_m: 0.0, y_m: 0.0 }, &shadow));
    assert!(!point_in_polygon(Vec2M { x_m: 5.0, y_m: 0.0 }, &shadow));
}

/// A sun on the horizon lights nothing, and the kernel says so rather than dividing by a
/// vanishing z and producing a shadow the length of the county
#[test]
fn a_sun_at_the_horizon_leaves_the_ground_dark() {
    let corners = vec![vec![
        Vec3M {
            x_m: -1.0,
            y_m: -1.0,
            z_m: 3.0,
        },
        Vec3M {
            x_m: 1.0,
            y_m: -1.0,
            z_m: 3.0,
        },
        Vec3M {
            x_m: 1.0,
            y_m: 1.0,
            z_m: 3.0,
        },
        Vec3M {
            x_m: -1.0,
            y_m: 1.0,
            z_m: 3.0,
        },
    ]];
    let grid = GridSpec {
        extent: Extent2D {
            min_x_m: -5.0,
            min_y_m: -5.0,
            max_x_m: 5.0,
            max_y_m: 5.0,
        },
        cell_size_m: 1.0,
        cols: 10,
        rows: 10,
    };
    let raster = beam_visibility_raster(
        &grid,
        &corners,
        UnitVec3 {
            x: 1.0,
            y: 0.0,
            z: 0.0,
        },
        0.0,
        2,
    );
    assert!(raster.iter().all(|v| *v == 0.0));
}

/// A semi-transparent module is a shade level: a fully covered cell passes
/// exactly the transmittance, and an uncovered one passes everything
#[test]
fn transmittance_sets_what_a_shadowed_cell_still_receives() {
    let corners = vec![vec![
        Vec3M {
            x_m: -4.0,
            y_m: -4.0,
            z_m: 3.0,
        },
        Vec3M {
            x_m: 4.0,
            y_m: -4.0,
            z_m: 3.0,
        },
        Vec3M {
            x_m: 4.0,
            y_m: 4.0,
            z_m: 3.0,
        },
        Vec3M {
            x_m: -4.0,
            y_m: 4.0,
            z_m: 3.0,
        },
    ]];
    let grid = GridSpec {
        extent: Extent2D {
            min_x_m: -10.0,
            min_y_m: -10.0,
            max_x_m: 10.0,
            max_y_m: 10.0,
        },
        cell_size_m: 1.0,
        cols: 20,
        rows: 20,
    };
    let raster = beam_visibility_raster(
        &grid,
        &corners,
        UnitVec3 {
            x: 0.0,
            y: 0.0,
            z: 1.0,
        },
        0.3,
        2,
    );
    // the center cell is wholly under the panel, a corner cell is wholly outside it
    let center = raster[10 * 20 + 10];
    let corner = raster[0];
    assert!((f64::from(center) - 0.3).abs() < 1e-6, "center {center}");
    assert!((f64::from(corner) - 1.0).abs() < 1e-6, "corner {corner}");
}

/// With the sun in the plane of the rows and low enough, an infinite row shades the whole pitch.
/// With the sun overhead it shades the projected width and no more
#[test]
fn infinite_row_shading_matches_its_closed_form() {
    // profile angle at or below zero: the sun is behind the array, everything is shaded
    assert_eq!(
        shaded_ground_fraction_infinite_rows(2.0, 5.0, 30.0, 0.0, 1.0),
        1.0
    );
    // straight overhead: tan(pi/2) is unbounded, so the term with it vanishes and the shaded
    // fraction is the projected GCR
    let overhead =
        shaded_ground_fraction_infinite_rows(2.0, 5.0, 30.0, std::f64::consts::FRAC_PI_2, 1.0);
    let projected = projected_ground_cover_ratio(2.0, 5.0, 30.0);
    assert!(
        (overhead - projected).abs() < 1e-9,
        "{overhead} against {projected}"
    );
}

/// A row shades its neighbor only once the shadow is longer than the pitch, which is what makes
/// this a loss to the array rather than to the ground
#[test]
fn a_row_shades_its_neighbor_only_once_the_shadow_reaches_it() {
    // a high sun casts a short shadow and nothing reaches the next row
    assert_eq!(
        row_self_shade_fraction(2.0, 5.0, 30.0, std::f64::consts::FRAC_PI_2, 1.0),
        0.0
    );
    // a low sun casts a long one, and the fraction is 1 - pitch / shadow
    let low = row_self_shade_fraction(2.0, 5.0, 30.0, 0.15, 1.0);
    assert!(low > 0.0 && low < 1.0, "{low}");
}

/// Crossed strings between the horizon and the zenith is a half, which is the hemisphere split in
/// two: the analytic value Hottel's method gives for that pair of limits
#[test]
fn crossed_strings_gives_a_half_over_the_hemisphere() {
    let vf = crossed_strings_view_factor(0.0, std::f64::consts::FRAC_PI_2);
    assert!((vf - 0.5).abs() < 1e-12);
}

/// With nothing above it the ground sees the whole sky and no light is bounced back, so the gain
/// is exactly one. With a module above it the gain exceeds one and stays finite
#[test]
fn interreflection_is_unity_under_open_sky() {
    assert_eq!(interreflection_gain(1.0, 0.2, 0.05), 1.0);
    let under = interreflection_gain(0.4, 0.2, 0.05);
    assert!(under > 1.0 && under < 1.02, "{under}");
    // and a physically impossible pair of reflectances is clamped rather than divided by zero
    assert!(interreflection_gain(0.0, 1.0, 1.0).is_finite());
}

/// The PVWatts v5 published total loss is 14.08%. This is the figure NREL states for its own
/// default stack, so it checks the fractions and the multiplicative combination together
#[test]
fn the_pvwatts_default_losses_total_the_published_figure() {
    let total = combined_loss_fraction(PVWATTS_DEFAULT_LOSSES);
    assert!((total - 0.1408).abs() < 0.0001, "got {total}");
}

/// At standard test conditions, 1000 W/m2 and 25 C, the DC model returns the nameplate exactly.
/// That's the definition of the nameplate, so it's a check on the whole expression
#[test]
fn the_dc_model_returns_the_nameplate_at_standard_test_conditions() {
    let dc = pvwatts_dc(1000.0, 25.0, 5.0, PVWATTS_GAMMA_PDC_PER_C);
    assert!((dc - 5.0).abs() < 1e-12, "got {dc}");
    // and a hot cell loses gamma per degree
    let hot = pvwatts_dc(1000.0, 45.0, 5.0, PVWATTS_GAMMA_PDC_PER_C);
    assert!((hot - 5.0 * (1.0 + PVWATTS_GAMMA_PDC_PER_C * 20.0)).abs() < 1e-12);
    assert_eq!(pvwatts_dc(0.0, 25.0, 5.0, PVWATTS_GAMMA_PDC_PER_C), 0.0);
}

/// The inverter can't pass more than its rating, and what it can't pass is reported rather than
/// discarded. Clipping is the whole reason agrivoltaic arrays are oversized
#[test]
fn the_inverter_clips_and_says_how_much() {
    let rating = 10.0;
    let out = pvwatts_ac(30.0, rating, Some(PVWATTS_INVERTER));
    assert!((out.ac_kw - PVWATTS_INVERTER.nominal_efficiency * rating).abs() < 1e-12);
    assert!(out.clipped_kw > 0.0);
    // below the rating nothing is clipped, and efficiency is under one
    let under = pvwatts_ac(5.0, rating, Some(PVWATTS_INVERTER));
    assert_eq!(under.clipped_kw, 0.0);
    assert!(under.ac_kw < 5.0 && under.ac_kw > 4.0, "{}", under.ac_kw);
    assert_eq!(pvwatts_ac(0.0, rating, None).ac_kw, 0.0);
}

/// Faiman with no irradiance is air temperature, and the two thermal models agree in that limit
/// even though they disagree everywhere else. That shared limit is what makes it a check on both
#[test]
fn both_thermal_models_reduce_to_air_temperature_in_the_dark() {
    assert!((faiman_cell_temperature(0.0, 14.0, 2.0, FAIMAN_DEFAULT) - 14.0).abs() < 1e-12);
    assert!(
        (sapm_cell_temperature(0.0, 14.0, 2.0, SAPM_OPEN_RACK_GLASS_GLASS) - 14.0).abs() < 1e-12
    );
    // and in full sun both run hotter than the air, by tens of degrees rather than by a rounding
    let faiman = faiman_cell_temperature(1000.0, 14.0, 1.0, FAIMAN_DEFAULT);
    assert!(faiman > 40.0 && faiman < 60.0, "{faiman}");
}

/// The grid covers its extent and never exceeds the cap, which is what stops a large plot asking
/// for a raster nothing can bake
#[test]
fn the_grid_covers_its_extent_and_respects_the_cap() {
    let extent = Extent2D {
        min_x_m: 0.0,
        min_y_m: 0.0,
        max_x_m: 10.0,
        max_y_m: 6.0,
    };
    let grid = grid_for_extent(&extent, 0.5);
    assert_eq!(grid.cols, 20);
    assert_eq!(grid.rows, 12);
    assert!(grid.extent.max_x_m >= extent.max_x_m - 1e-12);

    // 10 km at 0.5 m would be 20,000 cells across. The cap is 1,024
    let huge = Extent2D {
        min_x_m: 0.0,
        min_y_m: 0.0,
        max_x_m: 10_000.0,
        max_y_m: 10_000.0,
    };
    let capped = grid_for_extent(&huge, 0.5);
    assert!(capped.cols <= 1024 && capped.rows <= 1024);
    assert!(capped.cell_size_m > 0.5);
}
