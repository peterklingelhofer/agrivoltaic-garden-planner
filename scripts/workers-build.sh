#!/bin/sh
#
# The production build, as Cloudflare Workers Builds runs it.
#
# This file exists so the dashboard's Build command field never has to change again. That field is
# the only part of the deploy that does not live in the repository, and it had rotted twice by the
# time this was written: it still named pnpm months after the toolchain moved to bun, which
# `only-bun.mjs` refuses at preinstall. The symptom both times was a push to `main` that quietly
# deployed nothing.
#
# Set the field to `sh scripts/workers-build.sh` once. Everything below is then a pull request.

set -eu

# The build image carries no Rust at all. The deploy notes used to say it shipped Rust and merely
# lacked the wasm target; the 2026-09-08 build disproved that with `rustup: not found`, having
# failed two seconds into the build step. The TypeScript physics was deleted, so `bun run build`
# runs `rust:wasm` first and there is nothing to fall back to.
#
# `--profile minimal` is rustc, cargo and rust-std and nothing else: no docs, no clippy, no
# rustfmt. Those are CI's job, not the deploy's
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs |
    sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable \
      --target wasm32-unknown-unknown
fi

# `--no-modify-path` above leaves the shell's PATH alone deliberately, so name the directory here
# rather than depending on a profile script this shell never sources
PATH="$HOME/.cargo/bin:$PATH"
export PATH

# idempotent, so it costs nothing when the installer above already added it, and it is what makes
# this work on an image that does have rustup but not the target
rustup target add wasm32-unknown-unknown

# the whole production build: weights, typecheck, lint, the unit suite with REQUIRE_AGENT_MODEL=1,
# then the build itself. `bun run deploy` runs the same script, so a local deploy and an automatic
# one cannot diverge
exec bun run build:deploy
