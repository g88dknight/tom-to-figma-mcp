# Hosting Tom Talk to Figma MCP

This guide expands on the hosted workflow introduced in the README. It covers the HTTP transport, the Bun relay, and deployment tips for Railway or any platform that provides a TCP listener.

## 1. MCP HTTP transport

Build once and run the compiled output:

```bash
bun install
bun run build
PORT=${PORT:-3000} FIGMA_SOCKET_URL="wss://relay.example.com" \
  bun run dist/server.js --mode=http
```

### Key environment variables
- `PORT` – HTTP listener (default `3000`).
- `HOST` / `HTTP_HOST` – bind address (default `0.0.0.0`).
- `FIGMA_SOCKET_URL` – relay endpoint the MCP server uses.
- `FIGMA_SOCKET_CHANNEL` – optional default channel to auto join.
- `ALLOWED_ORIGINS` / `ALLOWED_HOSTS` – comma delimited allowlists to guard the `/mcp` endpoint.
- `FIGMA_SOCKET_AUTH_TOKEN` – adds an `Authorization: Bearer <token>` header when contacting the relay.

The server exposes:
- `GET /healthz` – health probe.
- `POST/GET /mcp` – Streamable HTTP transport.

## 2. Bun relay (WebSocket)

Deploy the relay anywhere that exposes a websocket-friendly TCP port. The hosted helper script binds `0.0.0.0` and respects `PORT`/`FIGMA_SOCKET_PORT`:

```bash
chmod +x scripts/socket-hosted.sh
PORT=3055 ALLOWED_ORIGINS="https://your-app.example" ./scripts/socket-hosted.sh
```

Supported env/flags:
- `FIGMA_SOCKET_PORT` / `--port`
- `FIGMA_SOCKET_HOST` / `--host`
- `ALLOWED_ORIGINS` / `--allowed-origins`
- `FIGMA_SOCKET_AUTH_TOKEN` / `--figma-socket-auth-token`

Remember to front the relay with TLS and expose it via **wss://** to the Figma plugin and MCP server.

## 3. Railway example

1. **Railway service A – MCP server**
   - Build & run command: `bun start`
   - Variables: set `FIGMA_SOCKET_URL` to the relay’s public URL (e.g. `wss://<relay>.up.railway.app`).
   - Railway automatically assigns `PORT`.

2. **Railway service B – relay**
   - Build & run command: `PORT=$PORT ./scripts/socket-hosted.sh`
   - Enable the TCP proxy in Railway → Networking and note the public hostname.

3. **Figma plugin / MCP server configuration**
   - MCP server uses the relay URL via `FIGMA_SOCKET_URL`.
   - Plugin defaults to `wss://tom-talk-to-figma-mcp.up.railway.app` – update the URL in the UI to your relay if different.

## 4. Docker snippets

MCP server container:
```Dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
RUN bun run build
EXPOSE 3000
CMD ["bun", "run", "dist/server.js", "--mode=http"]
```

Relay container (optional `Dockerfile.relay`):
```Dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY src/socket.ts ./
EXPOSE 3055
CMD ["bun", "run", "src/socket.ts", "--host", "0.0.0.0"]
```

## 5. Security notes
- Always terminate TLS in front of the relay and HTTP transport; the plugin is distributed with a secure `wss://` default.
- Set `ALLOWED_ORIGINS` to the domains serving the plugin UI (e.g. `https://www.figma.com`).
- Use `FIGMA_SOCKET_AUTH_TOKEN` when exposing the relay publicly; both the MCP server and relay support bearer tokens.

With these pieces wired together you can point Tom (or any MCP-aware IDE/agent) at a managed endpoint and still fall back to local stdio when iterating.
