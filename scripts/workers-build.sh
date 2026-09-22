#!/bin/sh
#
# The production build, as Cloudflare Workers Builds runs it.
#
# This file exists so the dashboard's Build command field never has to change again. That field is
# the only part of the deploy that does not live in the repository: if it names the wrong package
# manager, `only-bun.mjs` refuses it at preinstall and a push to `main` quietly deploys nothing.
#
# Set the field to `sh scripts/workers-build.sh` once. Everything below is then a pull request.

set -eu

# The build image carries no Rust at all: it fails with `rustup: not found`. The Rust core is the
# only physics, so `bun run build` runs `rust:wasm` first and there is nothing to fall back to.
#
# `--profile minimal` is rustc, cargo and rust-std and nothing else: no docs, no clippy, no
# rustfmt. Those are CI's job, not the deploy's
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs |
    sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable \
      --target wasm32-unknown-unknown
fi

# `--no-modify-path` above leaves the shell's PATH alone deliberately, so name the directory here
# directly, without depending on a profile script this shell never sources
PATH="$HOME/.cargo/bin:$PATH"
export PATH

# idempotent, so it costs nothing when the installer above already added it, and it is what makes
# this work on an image that does have rustup but not the target
rustup target add wasm32-unknown-unknown

# the whole production build: weights, typecheck, lint, the unit suite with REQUIRE_AGENT_MODEL=1,
# then the build itself. `bun run deploy` runs the same script, so a local deploy and an automatic
# one cannot diverge
exec bun run build:deploy
