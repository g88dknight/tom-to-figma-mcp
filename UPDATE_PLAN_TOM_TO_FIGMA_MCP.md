# Tom-to-Figma-MCP Update Plan

## Repository: `tom-to-figma-mcp`

This plan covers changes needed in the MCP server repository to enable REST API access and proper Railway deployment.

---

## Current State

The `tom-to-figma-mcp` repository currently has:
- ✅ MCP server with Streamable HTTP transport
- ✅ WebSocket relay for plugin communication
- ✅ Figma plugin for canvas write operations
- ✅ Figma MCP integration (remote)

**What's Missing**:
- ❌ REST JSON endpoints for HTTP/JSON clients
- ❌ Updated plugin defaults for Railway URLs
- ❌ Proper environment variable configuration
- ❌ Auth token validation
- ❌ CORS configuration for Vercel

---

## Phase 1: Update Plugin Defaults

### File: `src/cursor_mcp_plugin/code.js`

**Changes**:
```javascript
// OLD
const DEFAULT_SOCKET_URL = "ws://localhost:3055";

// NEW
const DEFAULT_SOCKET_URL = "wss://relay-production-bcbf.up.railway.app";
const DEFAULT_CHANNEL = "default";
```

### File: `manifest.json`

**Add to `allowedDomains`**:
```json
{
  "allowedDomains": [
    "https://relay-production-bcbf.up.railway.app",
    "https://mcp-server-production-4ddc.up.railway.app"
  ]
}
```

**Why**: Plugin needs to connect to Railway-hosted relay by default, not localhost.

---

## Phase 2: Add REST Shim to MCP Server

### File: `src/talk_to_figma_mcp/server.ts`

**Add HTTP JSON Router** alongside existing Streamable HTTP transport:

```typescript
import express from 'express';
import cors from 'cors';

// New REST API Router
const app = express();

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

// Auth middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const expectedToken = process.env.MCP_AUTH_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Apply auth to all /figma/* routes
app.use('/figma/*', authMiddleware);

// Read operations (via Figma MCP or REST)
app.post('/figma/document', async (req, res) => {
  const { fileKey } = req.body;
  // Use Figma MCP tools or Figma REST API
  // Return: { name, lastModified, version, thumbnailUrl }
});

app.post('/figma/node', async (req, res) => {
  const { fileKey, nodeId } = req.body;
  // Return: { name, type, ...nodeDetails }
});

// Write operations (via plugin relay)
app.post('/figma/set-text', async (req, res) => {
  const { fileKey, nodeId, text } = req.body;
  const channel = req.headers['x-mcp-channel'] || 'default';

  // 1. Check plugin heartbeat
  const heartbeat = await checkRelayHeartbeat(channel);
  if (!heartbeat.active) {
    return res.status(503).json({
      error: 'Figma plugin not active',
      message: 'Start the Tom plugin in Figma to enable write operations'
    });
  }

  // 2. Send to plugin via relay
  const result = await sendToPlugin(channel, {
    type: 'set-text',
    fileKey,
    nodeId,
    text
  });

  res.json(result);
});

app.post('/figma/set-color', async (req, res) => {
  const { fileKey, nodeId, property, color } = req.body;
  const channel = req.headers['x-mcp-channel'] || 'default';

  // Similar gating + relay logic
});

app.post('/figma/duplicate-frame', async (req, res) => {
  const { fileKey, nodeId, newName } = req.body;
  const channel = req.headers['x-mcp-channel'] || 'default';

  // Similar gating + relay logic
});

app.post('/figma/export', async (req, res) => {
  const { fileKey, nodeId, format = 'png', scale = 1 } = req.body;

  // Use Figma REST API for exports (no plugin needed)
  // Return: { url, sizeBytes }
});

app.post('/figma/batch', async (req, res) => {
  const { fileKey, operations } = req.body;
  const channel = req.headers['x-mcp-channel'] || 'default';

  // Execute operations sequentially
  const results = [];
  for (const op of operations) {
    const result = await executeOperation(channel, fileKey, op);
    results.push(result);
  }

  res.json({ results });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`MCP REST API listening on port ${port}`);
});
```

### Helper Functions Needed:

```typescript
// Check if plugin is connected to relay
async function checkRelayHeartbeat(channel: string): Promise<{ active: boolean }> {
  // Query relay for last heartbeat from plugin on this channel
  // Return { active: true } if heartbeat within last 30s
}

// Send command to plugin via relay
async function sendToPlugin(channel: string, command: any): Promise<any> {
  // Forward to relay WebSocket
  // Wait for response with timeout
}

// Execute single operation
async function executeOperation(channel: string, fileKey: string, op: any): Promise<any> {
  // Route to appropriate handler based on op.type
}
```

---

## Phase 3: Environment Variables (Railway)

### MCP Server Service (`server.ts`)

**Required Variables**:
```bash
# Server config
PORT=3000
HTTP_HOST=0.0.0.0
NODE_ENV=production

# Auth
MCP_AUTH_TOKEN=<REDACTED>

# CORS
ALLOWED_ORIGINS=https://tom-chat-production.vercel.app,https://tom-chat-staging.vercel.app
ALLOWED_HOSTS=mcp-server-production-4ddc.up.railway.app

# Relay connection
FIGMA_SOCKET_URL=wss://relay-production-bcbf.up.railway.app
FIGMA_SOCKET_CHANNEL=default
FIGMA_SOCKET_AUTH_TOKEN=<SAME AS MCP_AUTH_TOKEN>

# Figma REST (optional, for direct API access)
FIGMA_PAT=<OPTIONAL - can use per-brand PATs from client>
```

### Relay Service (`socket.ts`)

**Required Variables**:
```bash
# WebSocket server
FIGMA_SOCKET_PORT=3055
FIGMA_SOCKET_HOST=0.0.0.0

# Auth
FIGMA_SOCKET_AUTH_TOKEN=<SAME AS MCP_AUTH_TOKEN>

# Monitoring
HEARTBEAT_INTERVAL=10000
HEARTBEAT_TIMEOUT=30000
```

---

## Phase 4: Start Commands (Railway)

### MCP Server Service

**Build**:
```bash
bun install && bun run build
```

**Start**:
```bash
bun run dist/server.js --mode=http
```

### Relay Service

**Build**:
```bash
bun install
```

**Start**:
```bash
bun run src/socket.ts --host ${FIGMA_SOCKET_HOST:-0.0.0.0} --port ${FIGMA_SOCKET_PORT:-3055}
```

---

## Phase 5: Testing Endpoints

### Local Testing

```bash
# Terminal 1: Start relay
bun run src/socket.ts

# Terminal 2: Start MCP server
bun run dist/server.js --mode=http

# Terminal 3: Test endpoints
curl http://localhost:3000/health
# Expected: {"status":"ok"}

curl -X POST http://localhost:3000/figma/document \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"fileKey":"abc123"}'
# Expected: {"name":"...","lastModified":"..."}
```

### Railway Testing

```bash
# Health check
curl https://mcp-server-production-4ddc.up.railway.app/health

# Document info
curl -X POST https://mcp-server-production-4ddc.up.railway.app/figma/document \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileKey":"YOUR_FILE_KEY"}'
```

---

## Phase 6: Plugin Distribution

### Rebuild Plugin

```bash
cd src/cursor_mcp_plugin
# Update code.js with new defaults
# Update manifest.json with Railway domains
# Package for distribution
```

### User Instructions

1. Install plugin in Figma: `Plugins > Development > Import plugin from manifest`
2. Plugin auto-connects to `wss://relay-production-bcbf.up.railway.app`
3. Status indicator shows connection state
4. Leave Figma open to enable write operations

---

## Acceptance Criteria

- [ ] `/health` returns `{status:"ok"}` without auth
- [ ] `/figma/document` returns file metadata with valid token
- [ ] `/figma/node` returns node details
- [ ] Write ops return 503 when plugin inactive
- [ ] Write ops succeed when plugin connected
- [ ] Plugin connects to Railway relay on load
- [ ] CORS allows requests from Vercel domain
- [ ] Auth token validates correctly

---

## Security Notes

1. **Auth Token**: Single shared token for simplicity, rotate regularly
2. **CORS**: Strict origin whitelist (Vercel domains only)
3. **Rate Limiting**: Add in future if needed
4. **FIGMA_PAT**: Never exposed to client, only server-to-Figma calls
5. **Plugin Channel**: Default "default", per-brand channels optional

---

## Deployment Order

1. **Deploy Relay** first (no breaking changes)
2. **Deploy MCP Server** with REST shim
3. **Test endpoints** via curl/Postman
4. **Rebuild plugin** with new defaults
5. **Distribute plugin** to users

---

## Rollback Plan

If REST shim breaks existing MCP clients:
1. Revert to previous Railway deployment
2. Keep relay running (no changes there)
3. Fix + redeploy MCP server

**Risk**: Low - REST is additive, doesn't affect existing Streamable HTTP transport

---

## Files Changed Summary

### Modified:
- `src/talk_to_figma_mcp/server.ts` - Add REST router
- `src/cursor_mcp_plugin/code.js` - Update defaults
- `manifest.json` - Update allowedDomains
- `package.json` - Add express, cors dependencies

### Created:
- `src/talk_to_figma_mcp/rest-router.ts` - REST endpoint handlers
- `src/talk_to_figma_mcp/relay-client.ts` - Plugin heartbeat checker
- `src/talk_to_figma_mcp/figma-operations.ts` - Operation executors

### Documentation:
- `README.md` - Update with REST API docs
- `DEPLOYMENT.md` - Railway deployment guide
- `PLUGIN.md` - Plugin distribution guide

---

## Estimated Effort

- **Phase 1**: 30 minutes (plugin defaults)
- **Phase 2**: 4-5 hours (REST shim implementation)
- **Phase 3**: 30 minutes (env vars)
- **Phase 4**: 30 minutes (start commands)
- **Phase 5**: 1 hour (testing)
- **Phase 6**: 1 hour (plugin rebuild)

**Total**: ~8 hours

---

## Next Steps

1. Review this plan with team
2. Set up Railway environment variables
3. Implement REST shim (Phase 2)
4. Deploy + test
5. Update plugin defaults
6. Coordinate with tom-chat-sdk deployment
