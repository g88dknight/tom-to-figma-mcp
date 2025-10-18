# Tom-to-Figma MCP Server - Update Plan

## Overview

This plan adds SSE (Server-Sent Events) endpoint support to the Tom-to-Figma MCP server to enable integration with AI SDK 5.0's `experimental_createMCPClient`.

**Repository:** https://github.com/g88dknight/tom-to-figma-mcp

---

## 🎯 Goals

1. **Add SSE endpoint**: Expose `/sse` endpoint for AI SDK MCP client
2. **Maintain compatibility**: Keep existing WebSocket relay functionality
3. **Enable AI SDK integration**: Allow Tom Chat SDK to use official MCP client
4. **Minimal changes**: Leverage existing `StreamableHTTPServerTransport`

---

## 📊 Current State Analysis

### What Works ✅

- ✅ MCP server with 40 tools defined
- ✅ WebSocket relay server on Railway
- ✅ `StreamableHTTPServerTransport` imported and initialized
- ✅ HTTP server with REST endpoints
- ✅ Health check at `/health` endpoint
- ✅ Authentication via Bearer token

### What's Missing ❌

- ❌ No SSE endpoint exposed for AI SDK clients
- ❌ AI SDK can't connect (it expects `/sse` endpoint)

### Current Architecture

```
Figma Plugin
    ↓ WebSocket
Relay Server (Railway)
    ↓ WebSocket
MCP Server (server.ts)
    ↓ StreamableHTTPServerTransport
HTTP Server (REST API only)
```

### Target Architecture

```
Tom Chat SDK (AI SDK MCP Client)
    ↓ SSE Transport (HTTPS)
MCP Server /sse endpoint
    ↓ StreamableHTTPServerTransport
    ↓ WebSocket
Relay Server
    ↓ WebSocket
Figma Plugin
```

---

## 🔧 Implementation Steps

### Step 1: Verify Current Implementation

**File:** `src/talk_to_figma_mcp/server.ts`

Check the current HTTP server setup (around line 2744+):

```typescript
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

await server.connect(transport);

const httpServer = createServer(async (req, res) => {
  // Current implementation
});
```

### Step 2: Add SSE Endpoint Handler

**File:** `src/talk_to_figma_mcp/server.ts`

Locate the HTTP server request handler (around line 2760) and add SSE endpoint support:

```typescript
const httpServer = createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("Bad Request");
      return;
    }

    logger.debug(`Incoming request: ${req.method} ${req.url}`);

    // ========================================
    // NEW: SSE Endpoint for AI SDK MCP Client
    // ========================================
    if (req.url === '/sse') {
      logger.info('[SSE] New SSE connection request');

      // Verify authentication
      const authHeader = req.headers.authorization;
      const expectedToken = process.env.FIGMA_SOCKET_AUTH_TOKEN;

      if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
        logger.warn('[SSE] Unauthorized SSE connection attempt');
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, X-MCP-Channel',
      });

      logger.info('[SSE] SSE connection established, delegating to transport');

      // Delegate to StreamableHTTPServerTransport's SSE handler
      try {
        await transport.handleSSEConnection(req, res);
        logger.info('[SSE] SSE connection handled by transport');
      } catch (error) {
        logger.error(`[SSE] Error handling SSE connection: ${error}`);
        if (!res.writableEnded) {
          res.end();
        }
      }
      return;
    }

    // ========================================
    // Existing Health Check Endpoint
    // ========================================
    if (req.url === '/health') {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // ========================================
    // Existing REST Router
    // ========================================
    const restRouter = createRestRouter(ws, currentChannel);
    const restHandled = await restRouter(req, res);

    if (!restHandled) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not Found");
    }
  } catch (error) {
    logger.error(`HTTP request error: ${error}`);
    if (!res.writableEnded) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  }
});
```

### Step 3: Add CORS Preflight Support (Optional)

If AI SDK sends OPTIONS preflight requests, add this before the SSE handler:

```typescript
// Handle CORS preflight
if (req.method === 'OPTIONS') {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-MCP-Channel, Content-Type',
    'Access-Control-Max-Age': '86400',
  });
  res.end();
  return;
}
```

### Step 4: Update Environment Variables

**File:** `.env` or Railway environment variables

Ensure these are set:

```bash
# WebSocket Relay Configuration (existing)
FIGMA_SOCKET_URL="wss://relay-production-bcbf.up.railway.app"
FIGMA_SOCKET_AUTH_TOKEN="5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311"
FIGMA_SOCKET_CHANNEL="default"

# HTTP Server Port (existing)
PORT=3001

# No new env vars needed!
```

### Step 5: Update Logging

Add more detailed SSE-specific logging to help debug connections:

```typescript
// At the top of the file, update the logger object if needed
const logger = {
  info: (message: string) => process.stderr.write(`[INFO] ${message}\n`),
  debug: (message: string) => process.stderr.write(`[DEBUG] ${message}\n`),
  warn: (message: string) => process.stderr.write(`[WARN] ${message}\n`),
  error: (message: string) => process.stderr.write(`[ERROR] ${message}\n`),
  log: (message: string) => process.stderr.write(`[LOG] ${message}\n`),
  sse: (message: string) => process.stderr.write(`[SSE] ${message}\n`), // NEW
};
```

### Step 6: Test SSE Endpoint Locally

```bash
# 1. Install dependencies
pnpm install

# 2. Build the project
pnpm build

# 3. Start the server
node dist/talk_to_figma_mcp/server.js --http

# 4. In another terminal, test SSE endpoint
curl -N -H "Authorization: Bearer 5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311" \
  http://localhost:3001/sse

# Expected: SSE connection opens and stays alive (use Ctrl+C to close)
```

### Step 7: Update Documentation

**File:** `README.md`

Add section about SSE endpoint:

```markdown
## SSE Endpoint for AI SDK Integration

The MCP server exposes an SSE (Server-Sent Events) endpoint for integration with Vercel AI SDK's MCP client.

### Endpoint

```
GET /sse
```

### Headers

```
Authorization: Bearer <FIGMA_SOCKET_AUTH_TOKEN>
X-MCP-Channel: <channel-name>  (optional, defaults to "default")
```

### Example Usage with AI SDK

```typescript
import { experimental_createMCPClient as createMCPClient } from 'ai';

const mcpClient = await createMCPClient({
  name: 'tom-to-figma',
  transport: {
    type: 'sse',
    url: 'https://mcp-server-production-4ddc.up.railway.app/sse',
    headers: {
      Authorization: 'Bearer <your-token>',
      'X-MCP-Channel': 'default',
    },
  },
});

const tools = await mcpClient.tools();
```

### Available Tools

The server exposes 40+ Figma manipulation tools via MCP:
- Document info (get_document_info, get_selection, get_node_info)
- Create elements (create_frame, create_rectangle, create_text)
- Modify nodes (set_text_content, set_fill_color, move_node, resize_node)
- Layout (set_layout_mode, set_padding, set_item_spacing)
- Export (export_node_as_image)
- And 30+ more...

See [server.ts](src/talk_to_figma_mcp/server.ts) for full tool list.
```

---

## 🧪 Testing Plan

### Test 1: Health Check

```bash
curl https://mcp-server-production-4ddc.up.railway.app/health

# Expected:
# {"status":"ok"}
```

### Test 2: SSE Connection

```bash
curl -N -H "Authorization: Bearer 5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311" \
  https://mcp-server-production-4ddc.up.railway.app/sse

# Expected:
# Connection stays open (SSE stream)
# May see keep-alive messages
# Use Ctrl+C to disconnect
```

### Test 3: Unauthorized Access

```bash
curl -N https://mcp-server-production-4ddc.up.railway.app/sse

# Expected:
# HTTP 401 Unauthorized
# {"error":"Unauthorized"}
```

### Test 4: AI SDK Integration

From Tom Chat SDK:

```typescript
// In a test file or directly in chat route
const { experimental_createMCPClient } = require('ai');

const mcpClient = await experimental_createMCPClient({
  name: 'tom-to-figma',
  transport: {
    type: 'sse',
    url: 'https://mcp-server-production-4ddc.up.railway.app/sse',
    headers: {
      Authorization: 'Bearer 5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311',
    },
  },
});

const tools = await mcpClient.tools();
console.log(`Loaded ${Object.keys(tools).length} tools`);
// Expected: "Loaded 40 tools" (or similar)
```

### Test 5: Tool Execution

```typescript
// Test calling a simple tool
const result = await mcpClient.callTool('get_document_info', {});
console.log(result);
// Expected: Document information from Figma (if plugin is connected)
```

---

## 🚀 Deployment Steps

### Option A: Railway Auto-Deploy (Recommended)

If GitHub repo is connected to Railway:

```bash
# 1. Commit changes
git add src/talk_to_figma_mcp/server.ts
git commit -m "Add SSE endpoint for AI SDK MCP client integration

- Add /sse endpoint handler with authentication
- Delegate to StreamableHTTPServerTransport.handleSSEConnection
- Add CORS support for cross-origin requests
- Maintain backward compatibility with existing endpoints
"

# 2. Push to main branch
git push origin main

# 3. Railway will auto-deploy
# Monitor: https://railway.app/project/<project-id>
```

### Option B: Manual Deploy

```bash
# 1. Build locally
pnpm build

# 2. Test build
node dist/talk_to_figma_mcp/server.js --http

# 3. Deploy to Railway via CLI
railway up

# 4. Check deployment
railway logs
```

### Post-Deployment Verification

```bash
# 1. Check health
curl https://mcp-server-production-4ddc.up.railway.app/health

# 2. Check SSE endpoint
curl -N -H "Authorization: Bearer 5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311" \
  https://mcp-server-production-4ddc.up.railway.app/sse

# 3. Monitor Railway logs
railway logs --tail
```

---

## 📋 Verification Checklist

Before marking as complete:

- [ ] SSE endpoint handler added to `server.ts`
- [ ] Authentication check implemented for SSE endpoint
- [ ] CORS headers set for SSE responses
- [ ] Local testing passes (SSE connection works)
- [ ] Code committed to Git
- [ ] Deployed to Railway
- [ ] Health check works: `/health` returns `{"status":"ok"}`
- [ ] SSE endpoint works: `/sse` accepts connections
- [ ] Unauthorized requests are rejected (401)
- [ ] Railway logs show SSE connections
- [ ] Tom Chat SDK can connect via AI SDK MCP client
- [ ] Tom Chat SDK can load 40+ tools
- [ ] Tom Chat SDK can execute tools successfully

---

## 🚨 Rollback Plan

If SSE endpoint causes issues:

### Immediate Rollback

```bash
# Revert to previous Railway deployment
railway rollback

# Or revert Git commit
git revert HEAD
git push origin main
```

### Gradual Rollback

Comment out SSE endpoint in code:

```typescript
// TEMPORARILY DISABLED - rollback
/*
if (req.url === '/sse') {
  // ... SSE handler code ...
  return;
}
*/
```

### Safety Notes

- SSE endpoint is additive - doesn't change existing functionality
- WebSocket relay continues to work as before
- REST endpoints remain unchanged
- Can safely disable SSE without affecting Figma plugin

---

## 🐛 Troubleshooting

### Issue: "Cannot read property 'handleSSEConnection' of undefined"

**Cause:** `StreamableHTTPServerTransport` doesn't have `handleSSEConnection` method

**Solution:** Check MCP SDK version and documentation. May need to use different method:

```typescript
// Alternative approach if handleSSEConnection doesn't exist
if (req.url === '/sse') {
  // Manual SSE handling
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });

  return;
}
```

### Issue: "401 Unauthorized" on valid token

**Cause:** Token mismatch or header format issue

**Debug:**
```typescript
logger.debug(`Auth header received: ${req.headers.authorization}`);
logger.debug(`Expected token: Bearer ${process.env.FIGMA_SOCKET_AUTH_TOKEN}`);
```

### Issue: "Connection immediately closes"

**Cause:** SSE stream not being kept alive

**Solution:**
```typescript
// Add keep-alive heartbeat
const keepAliveInterval = setInterval(() => {
  if (!res.writableEnded) {
    res.write(': ping\n\n');
  }
}, 15000);

req.on('close', () => {
  clearInterval(keepAliveInterval);
  logger.info('[SSE] Client disconnected');
});
```

### Issue: CORS errors from browser

**Solution:** Add CORS headers and OPTIONS handler as shown in Step 3

---

## 📊 Success Metrics

### Before
- ✅ 40 tools defined in MCP server
- ❌ Only accessible via custom HTTP client
- ❌ Can't use AI SDK's official MCP client

### After
- ✅ 40 tools defined in MCP server
- ✅ SSE endpoint available at `/sse`
- ✅ Compatible with AI SDK's `experimental_createMCPClient`
- ✅ Tom Chat SDK can access all tools automatically

---

## 📚 References

- [MCP SDK Documentation](https://modelcontextprotocol.io/)
- [StreamableHTTPServerTransport](https://github.com/modelcontextprotocol/sdk/tree/main/src/server)
- [AI SDK MCP Integration](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- [Server-Sent Events Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)

---

## ✅ Next Steps

1. Implement SSE endpoint in `server.ts`
2. Test locally with curl
3. Deploy to Railway
4. Verify SSE endpoint works
5. Notify Tom Chat SDK team to proceed with their integration
6. Monitor Railway logs for SSE connection activity
7. Update Tom Chat SDK once SSE is confirmed working

---

**Estimated Time:** 1-2 hours
**Risk Level:** Low (additive change, doesn't affect existing functionality)
**Dependencies:** None (standalone change)
**Blocks:** Tom Chat SDK MCP integration (they're waiting for this)

---

## 🤝 Coordination

**Before deploying:**
- Test SSE endpoint locally
- Verify no breaking changes to existing endpoints

**After deploying:**
- Notify Tom Chat SDK team: "SSE endpoint is live at /sse"
- Share Railway logs if needed for debugging
- Monitor for any connection issues
- Be available to troubleshoot integration

**Communication:**
- Tom Chat SDK expects: `https://mcp-server-production-4ddc.up.railway.app/sse`
- Same auth token: `FIGMA_SOCKET_AUTH_TOKEN`
- Same channel system: `X-MCP-Channel` header
