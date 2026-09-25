#!/usr/bin/env bash

set -euo pipefail

GHCR_USERNAME="$1"

docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

./scripts/deploy.sh
