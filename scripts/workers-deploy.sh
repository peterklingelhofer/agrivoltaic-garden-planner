#!/bin/sh
#
# The production deploy, as Cloudflare Workers Builds runs it after `workers-build.sh`.
#
# A second file for the same reason as the first: the dashboard's Deploy command field does not
# live in the repository, so it can name the wrong package manager and go stale with nobody
# noticing. Naming no package manager here means the next change is a pull request.

set -eu

# `--env production` is not optional. The Cloudflare default is a bare `wrangler deploy`, which
# deploys the top-level config and quietly creates a second
# Worker with different vars and a different hostname
exec bunx wrangler deploy --env production
