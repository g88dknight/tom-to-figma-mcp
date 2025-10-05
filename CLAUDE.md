# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tom Talk to Figma MCP is a hosted-friendly Model Context Protocol (MCP) server and Figma plugin that enables IDE/agent communication with Figma documents. The system supports both local stdio workflows and cloud deployments with HTTP transport and WebSocket relay.

## Architecture

Three-layer architecture:
1. **MCP Server** ([src/talk_to_figma_mcp/server.ts](src/talk_to_figma_mcp/server.ts)) - Exposes 40 MCP tools, handles stdio/HTTP transport
2. **WebSocket Relay** ([src/socket.ts](src/socket.ts)) - Bun-based relay bridging MCP server and Figma plugin
3. **Figma Plugin** ([src/cursor_mcp_plugin/](src/cursor_mcp_plugin/)) - Executes commands in Figma, communicates via WebSocket

```
IDE/Agent (MCP client)
    ↓ (stdio or HTTP)
MCP Server (server.ts)
    ↓ (WebSocket)
Bun Relay (socket.ts)
    ↓ (plugin bridge)
Figma Plugin (code.js)
```

## Common Commands

### Development
```bash
# Install dependencies
bun install

# Build (uses tsup)
bun run build

# Watch mode
bun run dev

# Setup MCP config (generates .cursor/mcp.json)
bun setup
```

### Running the Server

**Local (stdio):**
```bash
# Start relay
bun socket

# Start MCP server (stdio mode - default)
bunx tom-talk-to-figma-mcp
```

**Hosted (HTTP):**
```bash
# Start HTTP server
bun start
# or
bunx tom-talk-to-figma-mcp --mode=http

# Start hosted relay (binds 0.0.0.0)
./scripts/socket-hosted.sh
```

### Testing
No automated test suite. Manual testing via MCP client (IDE) by invoking tools against a running Figma plugin.

## Key Configuration

All configuration uses environment variables with CLI flag overrides:

- `FIGMA_SOCKET_URL` (default: `ws://127.0.0.1:3055`) - Relay WebSocket endpoint
- `FIGMA_SOCKET_CHANNEL` - Auto-join channel after relay connection
- `FIGMA_SOCKET_AUTH_TOKEN` - Optional Authorization header for relay
- `PORT` (default: `3000`) - HTTP server port
- `HTTP_HOST` / `HOST` (default: `0.0.0.0`) - HTTP bind address
- `FIGMA_SOCKET_PORT` (default: `3055`) - Relay port
- `ALLOWED_ORIGINS` - Comma-delimited CORS allowlist
- `ALLOWED_HOSTS` - Hostname allowlist for HTTP deployments

CLI flags take precedence: `--mode=http`, `--figma-socket-url=wss://...`, `--port=3000`, etc.

## MCP Tools (40 total)

The server registers 40 tools in [server.ts:220-3380](src/talk_to_figma_mcp/server.ts). Key categories:

**Document & Selection:**
- `get_document_info`, `get_selection`, `read_my_design`, `get_node_info`, `get_nodes_info`

**Node Creation:**
- `create_rectangle`, `create_frame`, `create_text`, `create_component_instance`

**Node Manipulation:**
- `set_fill_color`, `set_stroke_color`, `move_node`, `resize_node`, `clone_node`, `delete_node`, `delete_multiple_nodes`
- `set_corner_radius`, `set_text_content`, `set_multiple_text_contents`

**Layout (Auto Layout):**
- `set_layout_mode`, `set_padding`, `set_axis_align`, `set_layout_sizing`, `set_item_spacing`

**Components & Instances:**
- `get_local_components`, `get_instance_overrides`, `set_instance_overrides`

**Annotations & Metadata:**
- `get_annotations`, `set_annotation`, `set_multiple_annotations`

**Export:**
- `export_node_as_image` (PNG/JPG/SVG/PDF)

**Scanning:**
- `scan_text_nodes`, `scan_nodes_by_types`

**Interactions:**
- `get_reactions`, `set_default_connector`, `create_connections`

**Focus & Selection:**
- `set_focus`, `set_selections`

**Channel:**
- `join_channel` - Required for multi-client relay scenarios

## Code Structure

### MCP Server ([src/talk_to_figma_mcp/server.ts](src/talk_to_figma_mcp/server.ts))
- **Lines 1-100**: Imports, interfaces, logger setup
- **Lines 100-218**: CLI argument parsing, transport selection (stdio vs HTTP), configuration
- **Lines 220-3000+**: Tool definitions using `server.tool(name, description, schema, handler)`
- Each tool handler calls `sendCommandToFigma(command, params)` which:
  1. Generates unique request ID
  2. Sends JSON message over WebSocket to relay
  3. Awaits response via Promise stored in `pendingRequests` Map
  4. Returns formatted MCP response

### WebSocket Relay ([src/socket.ts](src/socket.ts))
- Bun WebSocket server on `FIGMA_SOCKET_PORT` (default 3055)
- Handles channel-based routing (multi-client support)
- CORS via `ALLOWED_ORIGINS`
- Optional bearer token auth via `FIGMA_SOCKET_AUTH_TOKEN`
- Broadcasts messages between MCP server and Figma plugin clients in same channel

### Figma Plugin ([src/cursor_mcp_plugin/code.js](src/cursor_mcp_plugin/code.js))
- `handleCommand()` function (large switch statement) maps command names to Figma Plugin API calls
- Sends progress updates for long-running operations (chunked processing)
- UI ([ui.html](src/cursor_mcp_plugin/ui.html)) manages WebSocket connection settings, displays status

## Important Patterns

### Adding New MCP Tools
1. Define tool in [server.ts](src/talk_to_figma_mcp/server.ts) using `server.tool(name, description, schema, handler)`
2. Add corresponding `case` in [code.js:handleCommand()](src/cursor_mcp_plugin/code.js)
3. Implement Figma Plugin API logic in the case handler
4. Return result via `figma.ui.postMessage({ type: "command-result", id, result })`

### Command Flow
```typescript
// MCP Server
server.tool("my_tool", "Description", { param: z.string() }, async ({ param }) => {
  const result = await sendCommandToFigma("my_tool", { param });
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});

// Figma Plugin
case "my_tool":
  const result = await doSomethingWithFigmaAPI(params.param);
  return { success: true, data: result };
```

### Error Handling
- MCP server wraps tool handlers in try/catch, returns error text
- Figma plugin sends `command-error` message type on failure
- WebSocket connection errors trigger reconnection logic

### Transport Selection
Server auto-selects transport based on `--mode` flag or environment detection:
- **stdio**: Default, uses `StdioServerTransport` for MCP client
- **http**: Uses `StreamableHTTPServerTransport`, binds HTTP server on `PORT`

## Build System

Uses [tsup](https://tsup.egoist.dev/) configured in [tsup.config.ts](tsup.config.ts):
- Entry: `src/talk_to_figma_mcp/server.ts`
- Output: `dist/` (CJS + ESM formats)
- Target: Node 18
- Generates TypeScript declarations

Binary entry point: `dist/server.js` (see [package.json:8](package.json))

## Deployment Notes

- Docker: Use `bun start` (respects `PORT` env var)
- Railway/Fly: Deploy MCP server (`bun start`) + relay (`./scripts/socket-hosted.sh`) separately
- Relay must be publicly accessible (WSS) for hosted plugin
- Set `FIGMA_SOCKET_URL` to public relay endpoint on MCP server
- Default hosted relay: `wss://tom-talk-to-figma-mcp.up.railway.app`

## Common Issues

- **403 Forbidden**: Add origin to `ALLOWED_ORIGINS`
- **Connection refused**: Relay defaults to `127.0.0.1`; use `--host 0.0.0.0` for containers
- **Plugin stuck connecting**: Ensure `wss://` (not `ws://`) for hosted environments
- **No channel joined**: Set `FIGMA_SOCKET_CHANNEL` or call `join_channel` tool
