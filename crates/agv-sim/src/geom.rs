//! The shapes the light geometry is expressed in, ported from `src/types/geo.ts`.
//!
//! Plain data, no behaviour beyond what a point or a grid owns about itself. These are the types
//! `geometry.rs`, `shading.rs` and `viewfactor.rs` all speak, which is why they live apart from
//! any of the three.
//!
//! One thing is deliberately absent: identity. `PanelPolygon` in the TypeScript carries a
//! `PanelId` built as `${array.id}-r${k}-c${j}`, and the Rust returns the row and column indices
//! instead. Identity is a shell concern, the string is pure formatting over two numbers this side
//! already produces, and keeping it out means the wasm boundary stays f64 in and f64 out.

/// Metres, in the site's local plane. X is east, Y is north, Z is up.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec2M {
    pub x_m: f64,
    pub y_m: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec3M {
    pub x_m: f64,
    pub y_m: f64,
    pub z_m: f64,
}

/// A direction, assumed normalised by whoever built it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct UnitVec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// An exterior ring and any holes, both in the same winding-agnostic form the TypeScript uses:
/// `point_in_polygon` is a crossing count, which does not care which way a ring is wound.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Polygon2D {
    pub exterior: Vec<Vec2M>,
    pub holes: Vec<Vec<Vec2M>>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Extent2D {
    pub min_x_m: f64,
    pub min_y_m: f64,
    pub max_x_m: f64,
    pub max_y_m: f64,
}

/// A raster over the scene. `cols * rows` cells, row-major, origin at the extent's minimum corner.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GridSpec {
    pub extent: Extent2D,
    pub cell_size_m: f64,
    pub cols: usize,
    pub rows: usize,
}

impl GridSpec {
    pub fn cells(&self) -> usize {
        self.cols * self.rows
    }
}
