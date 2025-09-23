# Tom Talk to Figma MCP

Tom Talk to Figma MCP is a hosted-friendly Model Context Protocol (MCP) server and Figma plugin that lets your IDE or agent talk to Figma documents. The stack now supports both local stdio workflows and cloud deployments with an HTTP transport and a configurable WebSocket relay.

## Architecture

```
IDE / Agent (Tom MCP client)
        │  (MCP stdio or HTTP)
        ▼
Tom Talk to Figma MCP server
        │  (JSON over WebSocket)
        ▼
Bun relay (`src/socket.ts`)
        │  (plugin bridge)
        ▼
Tom Talk to Figma MCP Figma plugin
```

## Quickstart

### Requirements
- [Bun](https://bun.sh) 1.2+
- Figma desktop app for running the development plugin

### Local (stdio) workflow
1. Install dependencies and generate the MCP config:
   ```bash
   bun install
   bun setup
   ```
2. Start the local relay:
   ```bash
   bun socket
   ```
3. Launch the MCP server over stdio (Tom auto-selects stdio by default):
   ```bash
   bunx tom-talk-to-figma-mcp
   ```
4. In the Figma plugin UI, switch the socket URL to `ws://127.0.0.1:3055` and connect.

### Hosted (HTTP) workflow
1. Build and run the HTTP transport (binds to `PORT`, defaults to `3000`):
   ```bash
   bun start            # runs build then `dist/server.js --mode=http`
   # or
   bunx tom-talk-to-figma-mcp --mode=http
   ```
2. Deploy the relay with open networking (Railway/Fly/Render):
   ```bash
   ./scripts/socket-hosted.sh   # reads PORT/FIGMA_SOCKET_PORT and binds 0.0.0.0
   ```
3. Point the MCP server at the hosted relay:
   ```bash
   FIGMA_SOCKET_URL="wss://your-relay.example.com" \
   bunx tom-talk-to-figma-mcp --mode=http
   ```
4. Use the default plugin URL `wss://tom-talk-to-figma-mcp.up.railway.app` or override it to your relay.

More detailed hosting notes (including Railway TCP proxy guidance) live in [`docs/hosting.md`](docs/hosting.md).

## Configuration

| Variable | Default | CLI flag | Purpose |
| --- | --- | --- | --- |
| `FIGMA_SOCKET_URL` | `ws://127.0.0.1:3055` | `--figma-socket-url` | Relay WebSocket endpoint the MCP server uses to reach Figma |
| `FIGMA_SOCKET_CHANNEL` | _(unset)_ | `--figma-socket-channel` | Auto-join a channel after connecting to the relay |
| `FIGMA_SOCKET_AUTH_TOKEN` | _(unset)_ | `--figma-socket-auth-token` | Optional `Authorization` header for relay connections |
| `ALLOWED_ORIGINS` | _(unset)_ | `--allowed-origins` | Comma-delimited list enforced by the relay and HTTP server |
| `ALLOWED_HOSTS` | _(unset)_ | `--allowed-hosts` | Hostname allowlist for HTTP deployments |
| `PORT` | `3000` | `--port` | HTTP transport listen port |
| `HTTP_HOST` / `HOST` | `0.0.0.0` | `--http-host` / `--host` | HTTP transport bind host |
| `FIGMA_SOCKET_PORT` | `3055` | `--port` (relay) | Bun relay listen port |
| `FIGMA_SOCKET_HOST` | `127.0.0.1` | `--host` (relay) | Bun relay bind host |

All CLI flags take precedence over environment variables.

## WebSocket relay profiles
- **Local:** `bun socket`
- **Hosted:** `./scripts/socket-hosted.sh` (binds `0.0.0.0` and respects `PORT`/`FIGMA_SOCKET_PORT`)
- Flags available: `--host`, `--port`, `--allowed-origins`, `--figma-socket-auth-token`

## Figma plugin
1. In Figma go to **Plugins → Development → New Plugin → Link existing plugin**.
2. Choose `src/cursor_mcp_plugin/manifest.json`.
3. Open **Tom Talk to Figma MCP Plugin** from your development plugins.
   - Community install: [Figma plugin listing](https://www.figma.com/community/plugin/1485687494525374295/cursor-talk-to-figma-mcp-plugin) (rename in progress).
4. The Connection tab defaults to the hosted relay (`wss://tom-talk-to-figma-mcp.up.railway.app`). Override the URL if you are running locally.
5. Once connected, the plugin persists the socket URL for future sessions.

## Deployment options

### Docker
```bash
docker build -t tom-talk-to-figma-mcp .
docker run -e FIGMA_SOCKET_URL=wss://relay.example.com -e PORT=3000 -p 3000:3000 tom-talk-to-figma-mcp
```

### Railway / Fly.io
- Deploy the MCP server with `bun start` (it respects `PORT`).
- Deploy the relay with `./scripts/socket-hosted.sh`; expose the TCP port and front it with Railway's TCP proxy or Fly's `tcp` service.
- Set `FIGMA_SOCKET_URL` on the MCP server to the public **wss://** endpoint.

### CLI
- `bunx tom-talk-to-figma-mcp` (stdio)
- `bunx tom-talk-to-figma-mcp --mode=http --figma-socket-url=wss://relay.example.com`

## Troubleshooting
- **403 Forbidden** – ensure `ALLOWED_ORIGINS` includes the browser origin hitting the relay/HTTP server.
- **Connection refused** – the relay defaults to `127.0.0.1:3055`; use `scripts/socket-hosted.sh` or pass `--host 0.0.0.0` for containers.
- **No channel joined** – set `FIGMA_SOCKET_CHANNEL` or call the `join_channel` MCP tool explicitly.
- **Plugin stuck on "Connecting"** – confirm the URL uses `wss://` in hosted environments; some proxies block insecure `ws://` traffic.

## Credits & rename
Originally launched as “Cursor Talk to Figma MCP”, the project now targets the Tom MCP ecosystem with hosted deployment support. Huge thanks to all original contributors for the automation features showcased in the demo videos.

## License

[MIT](LICENSE)
