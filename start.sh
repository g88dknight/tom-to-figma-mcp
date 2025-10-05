#!/usr/bin/env bash
set -euo pipefail

# Universal start script for Railway services
# Determines which service to start based on RAILWAY_SERVICE_NAME

echo "=== Railway Start Script ==="
echo "RAILWAY_SERVICE_NAME: ${RAILWAY_SERVICE_NAME:-NOT_SET}"
echo "All environment variables:"
env | grep RAILWAY || true

SERVICE_NAME="${RAILWAY_SERVICE_NAME:-mcp-server}"

echo "Resolved SERVICE_NAME: $SERVICE_NAME"

if [ "$SERVICE_NAME" = "relay" ]; then
    echo "Starting WebSocket Relay..."
    exec bun run src/socket.ts --host 0.0.0.0 --port "${PORT:-3055}"
elif [ "$SERVICE_NAME" = "mcp-server" ]; then
    echo "Starting MCP Server..."
    exec bun run dist/server.js --mode=http
else
    echo "Unknown service: $SERVICE_NAME"
    exit 1
fi
