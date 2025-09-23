#!/usr/bin/env bash
set -euo pipefail

PORT_VALUE="${PORT:-${FIGMA_SOCKET_PORT:-3055}}"
HOST_VALUE="${FIGMA_SOCKET_HOST:-0.0.0.0}"

export FIGMA_SOCKET_PORT="$PORT_VALUE"
export FIGMA_SOCKET_HOST="$HOST_VALUE"

bun run src/socket.ts --host "$FIGMA_SOCKET_HOST" --port "$FIGMA_SOCKET_PORT"
