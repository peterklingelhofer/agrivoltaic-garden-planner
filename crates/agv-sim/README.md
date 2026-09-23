# agv-sim

The physics core of the agrivoltaic garden planner, in Rust: one implementation of the numbers,
callable from the browser through wasm and from a native binary directly. A second hand-written
copy of the Solar Position Algorithm would be a second thing to be wrong.

## What is here

Solar geometry: NREL's SPA (Reda & Andreas 2008, NREL/TP-560-34302), refraction after Bennett
1982, Kasten & Young 1989 air mass, and the Espenak & Meeus delta-T polynomials.

Plane-of-array irradiance: Perez, Ineichen, Seals, Michalsky & Stewart 1990, with the isotropic
and Hay & Davies 1980 models beside it because the tests use the cheap ones to pin the expensive
one at its degenerate tilts.

Beam/diffuse decomposition: Erbs, Klein & Duffie 1982; Maxwell's DISC 1987; Perez et al.'s DIRINT
1992 over a 1,260-entry coefficient table; Engerer 2 with both the 2015 Australian and the Bright
& Engerer 2019 global fits; and the component-closure test every path ends in.

Array geometry and shade: row layout and the four tracker modes, panel snapshots, shadow
projection onto the ground, the infinite-row closed forms for shaded ground fraction and ground
sky view factor, crossed-strings view factors, interreflection, rear-side POA, and snow cover.

The PV chain end to end: cell temperature (Faiman and SAPM), PVWatts DC, the loss stack, and the
inverter with clipping. `agv_annual_chain` takes a whole year across the wasm boundary in one call
because the alternative is 8,760 crossings for arithmetic that costs less than the crossing.

**This crate is the only implementation.** `bun run test` and `bun run build` both run
`bun run rust:wasm` first, and there is nothing to fall back to. A build with the core switched off
refuses every number.

**One thing about the decomposition port is not obvious.** The TypeScript it replaced stored each
intermediate irradiance series in a `Float32Array` and carried the narrowed value into the next line
of arithmetic, and `math::through_f32` narrows at those same stores. It matters most in DIRINT,
which selects a table row on a step function: a difference in the last bit of `f64` is a different
coefficient there, and tens of watts. A port that kept everything in `f64` would be a more accurate
implementation of a different function.

## What holds it up

Four claims, and they are different claims. Read what each one cannot see before trusting any of
them.

- `tests/nrel_spa.rs`, `tests/pvlib_transposition.rs` and `tests/pvlib_decomposition.rs` check the
  Rust against **published worked examples**: NREL Appendix A.5 to better than 0.001 degrees,
  pvlib's Perez sky diffuse to within a tenth of a watt in all eight clearness bins, and pvlib's own
  DISC and DIRINT output to within a watt. These say the port is *right*.
- `tests/geometry_spec.rs` checks geometry, shading, view factors and the PV chain against
  **closed forms and PVWatts' published defaults**: the 14.08% loss total, nameplate at STC,
  crossed strings integrating to 0.5 over the hemisphere. These are the only oracle those modules
  have that is not another copy of the same code.
- `src/sim/rust-geometry-parity.test.ts` holds `panelSnapshot` in `geometry.ts` and
  `beamVisibilityRaster` in `shading.ts` to their Rust counterparts. It says they have not
  *diverged*, and cannot say either is right. `viewfactor.ts`, and `albedoUnderSnow` in
  `src/types/ground.ts`, have Rust counterparts too, and no test holds either pair to each other.
- `src/sim/core-wiring.test.ts` says the application actually *reaches* the Rust. A perfect port
  routed to nowhere would pass everything above, so each seam is driven with a core that answers
  deliberately wrong.

**A parity test holds two implementations to EACH OTHER, so a convention both copies share is
invisible to it at any tolerance.** A `panel_snapshot` that steps a fixed array's rows
perpendicular to the way its modules face passes parity in both copies and overstates light under
an array by about 23%. So the raster is also checked against the closed form, on an array shaped
the way real ones are, which is the comparison no parity test makes.

## One table is generated, two are the only copies

**`src/perez_tables.rs` is generated** by `scripts/generate-rust-tables.mjs` from
`src/sim/perez-tables.ts`, and must not be hand-edited. It is still generated because
`src/sim/skydome.ts` still reads that table and skydome is not ported. Node 24 imports the
TypeScript directly, so there is no parser and no build step. `bun run generate` rewrites it and CI
diffs the whole crate source directory.

**`src/spa_tables.rs` and `src/dirint_tables.rs` are the only copies** and are maintained by hand
against their published sources. Their headers say so. The DIRINT table is emitted five values to a
line, which is its own innermost dimension, so a diff shows a changed coefficient as a changed
precipitable-water group, where one nine-thousand-character line would show nothing. Every table
carries `#[rustfmt::skip]` so its shape survives `cargo fmt --check`.

## No dependencies

Deliberate. The boundary this crate exposes is f64 in and f64 out, which the raw wasm ABI expresses
without wasm-bindgen. See `src/wasm.rs` and its counterpart `src/sim/rust-core.ts`. That means one
less toolchain to install, no generated JavaScript to commit, and no version to keep in step.
Revisit it the moment the boundary needs strings, structs or errors.

## Commands

```bash
bun run rust:test   # cargo test
bun run rust:fmt    # cargo fmt --check, then clippy with warnings denied
bun run rust:wasm   # release build for wasm32-unknown-unknown, 101 kB (37 kB brotli), to public/
```

`bun run test` builds the wasm first and then runs the suite. It cannot skip: there is no second
implementation to fall back to, so a missing core is a failure.

## Running it in the app

**On by default.** `bun run build` runs `bun run rust:wasm` first, and the app fetches `/agv-sim.wasm`
before its first render. `VITE_RUST_CORE` only turns the core OFF, when set to the exact string
`off`. That build renders the shell and refuses every number. It is useful for one thing: proving
the refusal is loud.

```bash
bun run rust:wasm && bun run build
rustup target add wasm32-unknown-unknown   # ONCE, and the deploy needs it too
```

**A build made without a Rust toolchain fails at the build step**, which is the correct failure:
the alternative is an app that opens and refuses every number.
The Workers Builds command needs `rustup target add wasm32-unknown-unknown` in front of it, and
`scripts/workers-build.sh` is where that lives.
