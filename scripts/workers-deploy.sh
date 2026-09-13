#!/bin/sh
#
# The production deploy, as Cloudflare Workers Builds runs it after `workers-build.sh`.
#
# A second file for the same reason as the first: the dashboard's Deploy command field does not
# live in the repository, and on 2026-09-08 it still read `pnpm exec wrangler deploy`, months
# after the toolchain moved. Naming no package manager here means the next change is a pull
# request rather than a dashboard visit nobody records.

set -eu

# `--env production` is not optional. The Cloudflare default is a bare `wrangler deploy`, which
# deploys the top-level config instead of the production environment and quietly creates a second
# Worker with different vars and a different hostname
exec bunx wrangler deploy --env production
