//! What `pvlib.tracking.singleaxis` returns for a backtracking tracker, ported as data.
//!
//! Same structure and reason as `pvlib_transposition.rs`: the rotations below are pvlib 0.16.1's
//! own `tracker_theta`, so what they assert is that the backtracking is right and that it's
//! applied. Ten suns cross a summer day for four arrays: a level axis pointing south at a ground
//! cover ratio of 0.5 with a 60 degree stop, the same axis at 0.25 with no stop to hide the
//! backtracking peak, a level axis pointing north at 0.4, and an axis tilted 20 degrees toward the
//! south, where the last sun sits behind the axis and its ideal rotation passes 90 degrees

use agv_sim::geom::Vec2M;
use agv_sim::geometry::{tracker_rotation_deg, ModuleSpec, PvArray, RowGeometry, Tracker};

/// (axis tilt, axis azimuth, stop, ground cover ratio, pvlib's rotation at each of `SUNS`)
type Case = (f64, f64, f64, f64, [f64; 10]);

/// (apparent zenith, apparent azimuth), sunrise to sunset
const SUNS: [(f64, f64); 10] = [
    (88.0, 62.0),
    (80.0, 75.0),
    (70.0, 88.0),
    (55.0, 100.0),
    (35.0, 125.0),
    (20.0, 180.0),
    (45.0, 245.0),
    (72.0, 275.0),
    (86.0, 296.0),
    (84.0, 330.0),
];

const CASES: [Case; 4] = [
    (
        0.0,
        180.0,
        60.0,
        0.5,
        [
            -2.268428912,
            -10.703290937,
            -23.177877285,
            -54.586816547,
            -29.837566478,
            0.0,
            42.186261181,
            20.264118424,
            4.475796987,
            12.423179667,
        ],
    ),
    (
        0.0,
        180.0,
        90.0,
        0.25,
        [
            -6.830432442,
            -35.570527903,
            -69.988776342,
            -54.586816547,
            -29.837566478,
            0.0,
            42.186261181,
            71.935701973,
            13.626524728,
            43.499947639,
        ],
    ),
    (
        0.0,
        0.0,
        55.0,
        0.4,
        [
            3.405095523,
            16.330992865,
            38.804958386,
            54.586816547,
            29.837566478,
            0.0,
            -42.186261181,
            -32.759797448,
            -6.732702229,
            -19.078227109,
        ],
    ),
    (
        20.0,
        180.0,
        60.0,
        0.4,
        [
            -29.210287896,
            -6.91649598,
            -33.355631134,
            -53.928996393,
            -28.037137931,
            0.0,
            39.892077369,
            26.330317085,
            18.841337483,
            60.0,
        ],
    ),
];

/// A 2 m collector at the pitch that gives the case's ground cover ratio
fn tracker_array(axis_tilt_deg: f64, axis_azimuth_deg: f64, stop_deg: f64, gcr: f64) -> PvArray {
    PvArray {
        geometry: RowGeometry {
            collector_width_m: 2.0,
            pitch_m: 2.0 / gcr,
            row_length_m: 10.0,
            row_count: 3,
            modules_per_row: 4,
            clearance_height_m: 2.5,
            row_azimuth_deg: axis_azimuth_deg,
            origin_m: Vec2M { x_m: 0.0, y_m: 0.0 },
        },
        tracker: Tracker::SingleAxis {
            horizontal_ns: axis_tilt_deg == 0.0,
            axis_tilt_deg,
            axis_azimuth_deg,
            max_rotation_deg: stop_deg,
            backtracking: true,
        },
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

#[test]
fn backtracking_turns_the_rows_where_pvlib_does() {
    for (axis_tilt_deg, axis_azimuth_deg, stop_deg, gcr, thetas) in CASES {
        let array = tracker_array(axis_tilt_deg, axis_azimuth_deg, stop_deg, gcr);
        for ((zenith, azimuth), expected) in SUNS.iter().zip(thetas) {
            let rotation = tracker_rotation_deg(&array, 90.0 - zenith, *azimuth);
            assert!(
                (rotation - expected).abs() < 1e-6,
                "axis {axis_tilt_deg}/{axis_azimuth_deg}, GCR {gcr}, sun {zenith}/{azimuth}: \
                 {rotation} against pvlib's {expected}"
            );
        }
    }
}

/// With no stop in the way, a backtracking row turns furthest where its shadow first reaches the
/// next row, at acos(GCR), and never past it. Swept from the horizon to overhead due east, a minute
/// of arc apart, so the sweep can land up to one step short of that peak
#[test]
fn backtracking_peaks_at_acos_of_the_ground_cover_ratio() {
    let array = tracker_array(0.0, 180.0, 90.0, 0.25);
    let peak = (1..=5400)
        .map(|step| tracker_rotation_deg(&array, step as f64 / 60.0, 90.0).abs())
        .fold(0.0, f64::max);
    let expected = 0.25f64.acos().to_degrees();
    assert!(peak <= expected + 1e-9, "peak {peak} past {expected}");
    assert!(
        expected - peak < 1.0 / 60.0,
        "peak {peak} short of {expected}"
    );
}
