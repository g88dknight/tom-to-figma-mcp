# Changelog

All notable changes to Tom-to-Figma-MCP are documented here.

## [Unreleased] - REST API Support

### Added

#### REST API Endpoints
- **New REST API** alongside existing MCP Streamable HTTP transport
- `GET /health` - Health check endpoint (no auth required)
- `POST /figma/document` - Get Figma document info
- `POST /figma/node` - Get node details
- `POST /figma/set-text` - Update text content
- `POST /figma/set-fill-color` - Set fill color
- `POST /figma/set-stroke-color` - Set stroke color
- `POST /figma/duplicate-frame` - Clone nodes
- `POST /figma/export` - Export nodes as images
- `POST /figma/batch` - Execute multiple operations

#### New Files
- `src/talk_to_figma_mcp/rest-router.ts` - Express REST API router
- `src/talk_to_figma_mcp/relay-client.ts` - WebSocket relay client for REST API
- `src/talk_to_figma_mcp/figma-operations.ts` - Operation executor functions
- `DEPLOYMENT.md` - Complete Railway deployment guide
- `TESTING.md` - REST API testing examples and curl commands
- `CHANGELOG.md` - This file

#### Dependencies
- `express@^4.18.2` - REST API server
- `cors@^2.8.5` - CORS middleware
- `@types/express@^4.17.21` - TypeScript types
- `@types/cors@^2.8.17` - TypeScript types

#### Features
- **Plugin heartbeat checking** - REST API checks if Figma plugin is active before write operations
- **Custom channel support** - Use `X-MCP-Channel` header for multi-tenant scenarios
- **Batch operations** - Execute multiple Figma operations in a single request
- **503 gating** - Returns proper error when plugin is disconnected

### Changed

#### Plugin Defaults
- Updated `DEFAULT_SOCKET_URL` from localhost to Railway production relay:
  - Old: `ws://localhost:3055`
  - New: `wss://relay-production-bcbf.up.railway.app`

#### Configuration
- Added `MCP_AUTH_TOKEN` environment variable for REST API authentication (separate from WebSocket auth)
- REST API runs on same port as MCP Streamable HTTP server
- Routes `/health` and `/figma/*` handled by Express app
- Route `/mcp` still handled by MCP Streamable HTTP transport

#### Server Startup
- HTTP mode now initializes both MCP transport and REST router
- Relay client initialized automatically in HTTP mode
- Additional logging for REST API endpoints

#### Documentation
- Updated README.md with REST API section
- Added deployment documentation in DEPLOYMENT.md
- Added testing guide in TESTING.md
- Updated CLAUDE.md references

### Technical Details

#### Architecture
```
Client (REST/MCP) → MCP Server (server.ts) → Relay Client → WebSocket Relay → Figma Plugin
                         ↓
                  REST Router (rest-router.ts)
                         ↓
                  Relay Client (relay-client.ts)
```

#### Request Flow
1. REST request arrives at `/figma/*`
2. Auth middleware validates `MCP_AUTH_TOKEN`
3. Relay client checks plugin heartbeat (ping/pong)
4. If plugin active: send command via WebSocket
5. Plugin executes command in Figma
6. Response relayed back through WebSocket
7. REST API returns JSON response

#### Backward Compatibility
- ✅ All existing MCP tools still work
- ✅ Stdio mode unchanged
- ✅ MCP Streamable HTTP transport unchanged
- ✅ WebSocket relay unchanged
- ✅ Figma plugin backward compatible (added `ping` handler)

### Migration Guide

#### For Existing Users
No changes required! The REST API is additive.

#### For New REST API Users

1. **Set environment variable**:
   ```bash
   MCP_AUTH_TOKEN=your-secret-token
   ```

2. **Make requests**:
   ```bash
   curl -X POST https://mcp-server-production-4ddc.up.railway.app/figma/set-text \
     -H "Authorization: Bearer your-secret-token" \
     -H "Content-Type: application/json" \
     -d '{"fileKey":"abc","nodeId":"1:2","text":"Hello"}'
   ```

#### For Railway Deployments

Add to MCP Server service:
```bash
MCP_AUTH_TOKEN=<generate-secure-token>
```

Keep existing variables unchanged.

### Security

- REST API requires Bearer token authentication via `MCP_AUTH_TOKEN`
- Separate from WebSocket auth (`FIGMA_SOCKET_AUTH_TOKEN`)
- CORS configurable via `ALLOWED_ORIGINS`
- Plugin heartbeat prevents commands when plugin inactive

### Performance

- REST API adds ~5ms overhead for heartbeat check
- WebSocket connection reused across requests
- Express middleware stack is minimal

### Known Limitations

- REST API requires Figma plugin to be running (same as MCP)
- Channel switching not optimized (joins channel on each request if different)
- No request queuing (requests processed sequentially)

---

## [0.3.3] - Previous Release

- Initial production release
- 40+ MCP tools
- WebSocket relay with channel support
- Railway deployment
- Figma plugin UI

---

**Note**: Version bumps and release dates will be added upon merge to main.
