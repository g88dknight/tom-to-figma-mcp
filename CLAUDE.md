# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL RULES - ALWAYS FOLLOW

### Git Workflow Rules
1. **ONE COMMIT PER TASK**: Make only ONE commit and push after completing a series of related changes. Never make multiple commits for one task.
2. **COMMIT ALL FILES**: Always include ALL updated files in commits, including:
   - All modified source files
   - Configuration files
   - Any other changed files
3. **Check before committing**: Always run `git status` and `git add` ALL modified files before committing

### Documentation & Standards
1. **Always reference official documentation**:
   - MCP Protocol Specification
   - Figma Plugin API
   - WebSocket Protocol
   - Bun runtime
2. **Follow official guidelines** - Don't make assumptions, check docs first

## Project Overview

Tom Talk to Figma MCP is a hosted-friendly Model Context Protocol (MCP) server and Figma plugin that enables IDE/agent communication with Figma documents. The system supports both local stdio workflows and cloud deployments with HTTP transport and WebSocket relay.

**Current Status:**
- ✅ MCP Server: Working (40 tools, HTTP + stdio modes)
- ✅ WebSocket Relay: Working (Railway deployment, authentication)
- ✅ Figma Plugin: Receives commands successfully
- ⚠️ **In Progress**: Plugin response handling (see [Current Issues](#current-issues))

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

**External Client Flow (Tom AI):**
```
Tom AI (figma-connect tool)
    ↓ (WebSocket)
Bun Relay (socket.ts)
    ↓ (broadcast)
Figma Plugin (code.js)
    ↓ (response - pending)
Bun Relay (socket.ts)
    ↓ (WebSocket - pending)
Tom AI
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

### MCP Server Environment Variables
- `FIGMA_SOCKET_URL` (default: `ws://127.0.0.1:3055`) - Relay WebSocket endpoint
- `FIGMA_SOCKET_CHANNEL` (default: `default`) - **REQUIRED**: Channel name for relay communication. Must match Figma plugin channel
- `FIGMA_SOCKET_AUTH_TOKEN` - **REQUIRED for production**: Auth token sent via URL query parameter (`?token=...`)
- `PORT` (default: `3000`) - HTTP server port
- `HTTP_HOST` / `HOST` (default: `0.0.0.0`) - HTTP bind address

### WebSocket Relay Environment Variables
- `FIGMA_SOCKET_PORT` (default: `3055`) - Relay port
- `FIGMA_SOCKET_AUTH_TOKEN` - Auth token for validating connections (supports both header and URL query param)
- `ALLOWED_ORIGINS` - Comma-delimited CORS allowlist (default: `*`)
- `ALLOWED_HOSTS` - Hostname allowlist for HTTP deployments

### Figma Plugin Settings (saved in plugin UI)
- **WebSocket Server URL**: `wss://relay-production-bcbf.up.railway.app`
- **Auth Token**: `5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311`
- **Channel Name**: `default` (must match `FIGMA_SOCKET_CHANNEL` in MCP server config)

**Current Production Values:**
```bash
FIGMA_SOCKET_URL="wss://relay-production-bcbf.up.railway.app"
FIGMA_SOCKET_AUTH_TOKEN="5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311"
FIGMA_SOCKET_CHANNEL="default"
```

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

### Railway Deployment (Current Production Setup)

**Currently deployed** as two separate services in the same Railway project:

#### 1. WebSocket Relay Service
```bash
# Service: relay-production-bcbf
# URL: wss://relay-production-bcbf.up.railway.app
# Start command: bun socket

# Environment variables (actual production values):
FIGMA_SOCKET_PORT=8080
FIGMA_SOCKET_AUTH_TOKEN=5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311
ALLOWED_ORIGINS=*
```

**Status:** ✅ Working - Relay receives connections and broadcasts messages correctly

#### 2. MCP Server Service (HTTP mode)
```bash
# Service: mcp-server-production-4ddc
# URL: https://mcp-server-production-4ddc.up.railway.app
# Start command: bun start

# Environment variables (actual production values):
FIGMA_SOCKET_URL=wss://relay-production-bcbf.up.railway.app
FIGMA_SOCKET_CHANNEL=default
FIGMA_SOCKET_AUTH_TOKEN=5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311
PORT=3000
HTTP_HOST=0.0.0.0
ALLOWED_ORIGINS=*
```

**Status:** ✅ Working - Server exposes 40 MCP tools via HTTP

### Local Development
```bash
# Terminal 1: Start relay
bun socket

# Terminal 2: Start MCP server (stdio mode for local IDE)
bunx tom-talk-to-figma-mcp
```

### Docker Deployment
- Use `bun start` (respects `PORT` env var)
- Ensure `HTTP_HOST=0.0.0.0` for container networking
- Relay must be publicly accessible (WSS) for hosted plugin

## Connecting External AI Agents

### For Tom AI (Current Production Setup):

Tom AI connects via WebSocket relay (not directly to MCP server):

**Tom AI Configuration (in Vercel):**
```bash
FIGMA_SOCKET_URL="wss://relay-production-bcbf.up.railway.app"
FIGMA_SOCKET_AUTH_TOKEN="5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311"
FIGMA_SOCKET_CHANNEL="default"
```

**Tom AI Repository:** https://github.com/g88dknight/tom-chat-sdk

**Tom AI Tool:** [lib/ai/tools/figma-connect.ts](https://github.com/g88dknight/tom-chat-sdk/blob/main/lib/ai/tools/figma-connect.ts)

**Message Flow:**
1. Tom sends `{type: "join", channel: "default"}` to relay
2. Tom sends `{type: "message", channel: "default", message: {type: "create_frame", params: {...}}}` to relay
3. Relay broadcasts `{type: "broadcast", message: {...}, sender: "User", channel: "default"}` to plugin
4. Plugin should respond with `{type: "message", channel: "default", message: {id: "...", result: {...}}}` (pending)

**Status:**
- ✅ Tom connects to relay with auth
- ✅ Sends commands through relay to plugin
- ✅ Plugin receives broadcast messages
- ⚠️ Times out after 10s waiting for response (plugin fix pending)

### For OpenAI, Claude API, or other HTTP-based agents:

**MCP Server URL:**
```
https://mcp-server-production-4ddc.up.railway.app
```

**Authentication:**
- Type: `Access token / API key`
- Token: `5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311`

**Example Configuration:**
```json
{
  "url": "https://mcp-server-production-4ddc.up.railway.app",
  "auth": {
    "type": "bearer",
    "token": "5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311"
  }
}
```

**Status:** ✅ Working - HTTP-based agents can use all 40 MCP tools

### For Local IDE (Cursor, VSCode):

**`.cursor/mcp.json` or `cline_mcp_settings.json`:**
```json
{
  "mcpServers": {
    "tom-to-figma": {
      "command": "bunx",
      "args": ["tom-talk-to-figma-mcp"],
      "env": {
        "FIGMA_SOCKET_URL": "wss://relay-production-bcbf.up.railway.app",
        "FIGMA_SOCKET_CHANNEL": "default",
        "FIGMA_SOCKET_AUTH_TOKEN": "5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311"
      }
    }
  }
}
```

**Status:** ✅ Working - Local IDE can use all 40 MCP tools through relay

## Setup Instructions

### 1. Install Figma Plugin
1. Open Figma Desktop app
2. Go to Plugins → Development → Import plugin from manifest
3. Select `src/cursor_mcp_plugin/manifest.json`

### 2. Configure Figma Plugin
1. Run the "Tom to Figma" plugin in Figma
2. Enter settings:
   - **WebSocket Server URL**: `wss://relay-production-bcbf.up.railway.app`
   - **Auth Token**: `5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311`
   - **Channel Name**: `default` (must match MCP server config)
3. Click **Connect**
4. Verify green status: "Connected to server at wss://... in channel: default"

### 3. Test Connection

**For local MCP client (Cursor, VSCode):**
Ask your AI agent:
```
"Create a red rectangle 200x100 in Figma"
```

**For external client (Tom AI):**
Navigate to Tom AI admin chat (`/admin/chat`) and send:
```
"Connect Tom to Figma and show I'm here!"
```

**Expected Behavior (Current):**
- ✅ Connection established
- ✅ Command sent to relay
- ✅ Plugin receives command
- ⚠️ 10-second timeout (plugin doesn't respond yet)

**Expected Behavior (After Fix):**
- ✅ Connection established
- ✅ Command sent to relay
- ✅ Plugin receives command
- ✅ Plugin processes command
- ✅ Plugin sends response
- ✅ Response received without timeout

## Current Issues

### ⚠️ Plugin Response Handling (In Progress)

**Problem:**
External clients (like Tom AI) can connect to relay, send commands to Figma plugin, but the plugin doesn't send responses back, causing 10-second timeouts.

**Current Status:**
- ✅ Tom AI → WebSocket Relay: Working perfectly with auth
- ✅ Relay → Figma Plugin: Broadcasting commands correctly
- ✅ Plugin receives commands: Commands are processed successfully
- ❌ Plugin → Relay: Response mechanism not implemented
- ❌ Relay → Tom AI: No response to forward back

**Root Cause:**
Plugin code in [src/cursor_mcp_plugin/ui.html](src/cursor_mcp_plugin/ui.html) needs 3 changes to handle broadcast messages and send responses:

**Required Changes:**

1. **Handle broadcast message type** (line ~120):
   ```javascript
   // BEFORE (wrong):
   if (data.type === "command") { ... }

   // AFTER (correct):
   if (data.type === "command" || data.type === "broadcast") {
     const command = data.type === "broadcast" ? data.message : data;
     // ... process command
   }
   ```

2. **Extract command correctly** (line ~125):
   ```javascript
   // BEFORE (wrong):
   const commandType = data.command;

   // AFTER (correct):
   const commandType = command.type;  // Extract from command object
   ```

3. **Send response back** (after command execution):
   ```javascript
   // Add response handlers:
   function sendSuccessResponse(commandId, result) {
     if (ws && ws.readyState === WebSocket.OPEN) {
       ws.send(JSON.stringify({
         type: "message",
         channel: currentChannel,
         message: {
           id: commandId,
           result: result,
           success: true
         }
       }));
     }
   }

   function sendErrorResponse(commandId, error) {
     if (ws && ws.readyState === WebSocket.OPEN) {
       ws.send(JSON.stringify({
         type: "message",
         channel: currentChannel,
         message: {
           id: commandId,
           error: error.toString(),
           success: false
         }
       }));
     }
   }

   // In message handler after processing command:
   try {
     const result = await processCommand(command);
     sendSuccessResponse(command.id, result);
   } catch (error) {
     sendErrorResponse(command.id, error);
   }
   ```

**Testing After Fix:**
```bash
# From Tom AI admin chat:
"Connect Tom to Figma and show I'm here!"

# Expected result (after fix):
✅ Tom connects to relay
✅ Command sent and broadcast
✅ Plugin receives and processes command
✅ Plugin sends response back
✅ Tom receives response without timeout
```

**Related Documentation:**
- Tom AI fix plan: https://github.com/g88dknight/tom-chat-sdk/blob/main/TOM_TO_FIGMA_MCP_FIX_PLAN.md
- Tom AI CLAUDE.md: https://github.com/g88dknight/tom-chat-sdk/blob/main/CLAUDE.md (Tom-to-Figma MCP Integration section)

## Common Issues

- **403 Forbidden**: Add origin to `ALLOWED_ORIGINS` in relay config
- **401 Unauthorized**: Check that `FIGMA_SOCKET_AUTH_TOKEN` matches in all three places (relay, MCP server, Figma plugin)
  - Current token: `5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311`
- **Connection refused**: Relay defaults to `127.0.0.1`; use `--host 0.0.0.0` for containers
- **Plugin stuck connecting**: Ensure `wss://` (not `ws://`) for hosted environments
- **Channel mismatch**: Verify `FIGMA_SOCKET_CHANNEL` in MCP server matches "Channel Name" in Figma plugin
  - Current channel: `default`
- **"Please join a channel"**: Set `FIGMA_SOCKET_CHANNEL` environment variable or configure in plugin UI
- **10-second timeout**: Plugin receives commands but doesn't send responses - see [Current Issues](#current-issues) for fix details
