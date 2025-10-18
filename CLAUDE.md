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
- ✅ Figma Plugin: Fully working - receives commands, processes them, and sends responses
- ✅ Broadcast Handling: External clients (Tom AI) can execute commands and receive responses
- ✅ Enhanced create_frame: Now supports fills array and children (text nodes)
- ⚠️ **Next Step**: Test integration with Tom Chat SDK (fixes are complete on plugin side)

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
Figma Plugin (code.js + ui.html)
    ↓ (response ✅ FULLY WORKING - Oct 18, 2025)
Bun Relay (socket.ts)
    ↓ (WebSocket)
Tom AI (✅ Infrastructure complete - ready for testing)
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

**Expected Behavior (Current - FIXED as of Oct 18, 2025):**
- ✅ Connection established
- ✅ Command sent to relay
- ✅ Plugin receives command
- ✅ Plugin processes command (including fills and children)
- ✅ Plugin sends response back through relay
- ✅ Response received without timeout

## Recent Fixes (October 2025)

### ✅ Broadcast Message Handling - COMPLETED

**What was fixed:**
External clients (Tom AI) can now successfully execute commands in Figma and receive responses.

**Changes made in [src/cursor_mcp_plugin/ui.html](src/cursor_mcp_plugin/ui.html):**

1. **Added `generateId()` function** (line 625-628):
   ```javascript
   function generateId() {
     return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
   }
   ```

2. **Added broadcast message handling** (lines 870-900):
   ```javascript
   // Handle broadcast messages from relay (external clients like Tom AI)
   if (payload.type === "broadcast") {
     const data = payload.message;
     console.log("[DEBUG] Processing broadcast command:", data.type);

     if (data.type) {
       const commandId = generateId();

       try {
         parent.postMessage({
           pluginMessage: {
             type: "execute-command",
             id: commandId,
             command: data.type,  // Extract from data.type for broadcast
             params: data.params
           }
         }, "*");
       } catch (error) {
         sendErrorResponse(commandId, error.message);
       }
     }
     return;
   }
   ```

3. **Response handlers already working** (lines 905-941):
   - `sendSuccessResponse()` and `sendErrorResponse()` were already implemented
   - They correctly send responses back through relay to external clients

**Testing Results:**
```bash
# From Tom AI admin chat:
"Connect Tom to Figma and show I'm here!"

# Actual result (after fix):
✅ Tom connects to relay successfully
✅ Command sent and broadcast to plugin
✅ Plugin receives broadcast message
✅ Plugin processes command (frame created in Figma!)
✅ Plugin sends response back through relay
✅ Infrastructure working perfectly
⚠️ Tom AI client needs fix to display response (see TOM_CHAT_SDK_FIX_PLAN.md)
```

**Commit:** `da1670e` - "fix: add broadcast message handling for external clients (Tom AI)"

**Next Steps:**
- Infrastructure is COMPLETE ✅
- Tom AI client-side fix needed (see [TOM_CHAT_SDK_FIX_PLAN.md](TOM_CHAT_SDK_FIX_PLAN.md))
- Fix involves updating Tom AI's `figma-connect.ts` to properly handle responses

### ✅ Enhanced create_frame Handler - COMPLETED (Oct 18, 2025)

**What was fixed:**
The `create_frame` command now fully supports Tom AI's message format with fills array and children.

**Changes made in [src/cursor_mcp_plugin/code.js](src/cursor_mcp_plugin/code.js):**

1. **Added support for `fills` array parameter** (lines 718, 765-786):
   - Accepts fills as an array of paint objects (e.g., `[{type: "SOLID", color: {r, g, b}, opacity: 1}]`)
   - Maps fills to Figma's paint format
   - Falls back to `fillColor` for backward compatibility

2. **Added support for `children` array parameter** (lines 732, 834-850):
   - Accepts array of child node definitions
   - Creates text nodes with full styling support
   - Returns count of children created

3. **Added `createTextNode` helper function** (lines 873-929):
   - Loads fonts with fallback to Inter Regular
   - Maps font weights to Figma font styles (Bold, Semi Bold, Medium, Regular)
   - Supports text positioning and color
   - Handles font loading errors gracefully

**Example usage:**
```javascript
{
  type: "create_frame",
  params: {
    name: "Tom Connection Check",
    width: 600,
    height: 400,
    fills: [{
      type: "SOLID",
      color: { r: 0.54, g: 0.82, b: 0.71 },
      opacity: 1
    }],
    children: [
      {
        type: "TEXT",
        characters: "I'm here!",
        fontSize: 64,
        fontWeight: 700,
        x: 50,
        y: 50,
        color: { r: 0, g: 0, b: 0 }
      },
      {
        type: "TEXT",
        characters: "Current timestamp",
        fontSize: 32,
        x: 50,
        y: 200
      }
    ]
  }
}
```

**Testing Results:**
- ✅ Frames created with correct fills (mint green background)
- ✅ Text children created with proper formatting
- ✅ Font loading with fallback working correctly
- ✅ Response sent back to Tom AI through relay
- ✅ All issues from TOM_TO_FIGMA_PLUGIN_UPDATES.md resolved

**Summary of All Fixes:**
All 4 fixes from [TOM_TO_FIGMA_PLUGIN_UPDATES.md](TOM_TO_FIGMA_PLUGIN_UPDATES.md) are now complete:
1. ✅ UI connection status updates automatically on WebSocket events
2. ✅ Broadcast messages extracted and processed correctly
3. ✅ Full create_frame implementation with fills and children
4. ✅ Responses sent back through WebSocket to Tom AI

## Common Issues

- **403 Forbidden**: Add origin to `ALLOWED_ORIGINS` in relay config
- **401 Unauthorized**: Check that `FIGMA_SOCKET_AUTH_TOKEN` matches in all three places (relay, MCP server, Figma plugin)
  - Current token: `5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311`
- **Connection refused**: Relay defaults to `127.0.0.1`; use `--host 0.0.0.0` for containers
- **Plugin stuck connecting**: Ensure `wss://` (not `ws://`) for hosted environments
- **Channel mismatch**: Verify `FIGMA_SOCKET_CHANNEL` in MCP server matches "Channel Name" in Figma plugin
  - Current channel: `default`
- **"Please join a channel"**: Set `FIGMA_SOCKET_CHANNEL` environment variable or configure in plugin UI
- **~~10-second timeout~~**: ✅ FIXED (Oct 18, 2025) - Plugin now correctly sends responses back through relay
