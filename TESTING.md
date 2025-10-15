# Testing Guide

This guide covers local and production testing of the Tom-to-Figma-MCP REST API and MCP endpoints.

---

## Local Testing Setup

### Prerequisites

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Build the project**:
   ```bash
   bun run build
   ```

3. **Start the WebSocket relay** (Terminal 1):
   ```bash
   bun run src/socket.ts
   ```
   Expected output:
   ```
   [Tom Talk to Figma MCP socket] Server listening on 127.0.0.1:3055
   ```

4. **Start the MCP server in HTTP mode** (Terminal 2):
   ```bash
   bun run dist/server.js --mode=http
   ```
   Expected output:
   ```
   [INFO] Tom Talk to Figma MCP HTTP server listening on http://0.0.0.0:3000/mcp
   [INFO] Health endpoint available at http://0.0.0.0:3000/healthz
   [INFO] REST API endpoints available at http://0.0.0.0:3000/figma/*
   [INFO] REST health check at http://0.0.0.0:3000/health
   ```

5. **Open Figma plugin**:
   - Open Figma Desktop app
   - Run "Tom to Figma" plugin
   - Configure:
     - WebSocket URL: `ws://127.0.0.1:3055`
     - Auth Token: (leave empty for local testing or set `FIGMA_SOCKET_AUTH_TOKEN`)
     - Channel: `default`
   - Click **Connect**
   - Verify green "Connected" status

---

## REST API Testing

### 1. Health Check (No Auth)

```bash
curl http://localhost:3000/health
```

**Expected Response**:
```json
{"status":"ok"}
```

---

### 2. Get Document Info

**Without plugin active** (should fail):
```bash
curl -X POST http://localhost:3000/figma/document \
  -H "Content-Type: application/json" \
  -d '{"fileKey":"test-file-key"}'
```

**Expected Response** (503):
```json
{
  "error": "Figma plugin not active",
  "message": "Start the Tom plugin in Figma to enable operations"
}
```

**With plugin active**:
```bash
curl -X POST http://localhost:3000/figma/document \
  -H "Content-Type: application/json" \
  -d '{"fileKey":"test-file-key"}'
```

**Expected Response** (200):
```json
{
  "name": "Document Name",
  "lastModified": "2025-01-15T10:00:00Z",
  ...
}
```

---

### 3. Get Node Info

Select a node in Figma and get its ID, then:

```bash
curl -X POST http://localhost:3000/figma/node \
  -H "Content-Type: application/json" \
  -d '{
    "fileKey": "test-file-key",
    "nodeId": "123:456"
  }'
```

**Expected Response**:
```json
{
  "id": "123:456",
  "name": "My Frame",
  "type": "FRAME",
  "width": 200,
  "height": 100,
  ...
}
```

---

### 4. Set Text Content (Write Operation)

```bash
curl -X POST http://localhost:3000/figma/set-text \
  -H "Content-Type: application/json" \
  -d '{
    "fileKey": "test-file-key",
    "nodeId": "789:012",
    "text": "Hello from REST API!"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "name": "Text Node Name"
}
```

---

### 5. Set Fill Color

```bash
curl -X POST http://localhost:3000/figma/set-fill-color \
  -H "Content-Type: application/json" \
  -d '{
    "fileKey": "test-file-key",
    "nodeId": "345:678",
    "color": {
      "r": 1,
      "g": 0,
      "b": 0,
      "a": 1
    }
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "name": "Rectangle Name"
}
```

---

### 6. Set Stroke Color

```bash
curl -X POST http://localhost:3000/figma/set-stroke-color \
  -H "Content-Type: application/json" \
  -d '{
    "fileKey": "test-file-key",
    "nodeId": "456:789",
    "color": {
      "r": 0,
      "g": 0,
      "b": 1,
      "a": 1
    },
    "weight": 2
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "name": "Shape Name"
}
```

---

### 7. Duplicate Frame

```bash
curl -X POST http://localhost:3000/figma/duplicate-frame \
  -H "Content-Type: application/json" \
  -d '{
    "fileKey": "test-file-key",
    "nodeId": "901:234",
    "x": 100,
    "y": 100
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "id": "new-node-id",
  "name": "Frame Copy"
}
```

---

### 8. Export Node as Image

```bash
curl -X POST http://localhost:3000/figma/export \
  -H "Content-Type: application/json" \
  -d '{
    "fileKey": "test-file-key",
    "nodeId": "567:890",
    "format": "png",
    "scale": 2
  }'
```

**Expected Response**:
```json
{
  "imageData": "base64-encoded-image-data",
  "mimeType": "image/png"
}
```

---

### 9. Batch Operations

```bash
curl -X POST http://localhost:3000/figma/batch \
  -H "Content-Type: application/json" \
  -d '{
    "fileKey": "test-file-key",
    "operations": [
      {
        "type": "set_text",
        "nodeId": "111:222",
        "text": "Batch operation 1"
      },
      {
        "type": "set_fill_color",
        "nodeId": "333:444",
        "color": {"r": 0, "g": 1, "b": 0, "a": 1}
      },
      {
        "type": "move_node",
        "nodeId": "555:666",
        "x": 50,
        "y": 50
      }
    ]
  }'
```

**Expected Response**:
```json
{
  "results": [
    {"success": true, "result": {...}},
    {"success": true, "result": {...}},
    {"success": true, "result": {...}}
  ]
}
```

---

## Testing with Authentication

### Local Setup with Auth

1. Set environment variable:
   ```bash
   export MCP_AUTH_TOKEN="test-token-123"
   export FIGMA_SOCKET_AUTH_TOKEN="relay-token-456"
   ```

2. Restart MCP server:
   ```bash
   bun run dist/server.js --mode=http
   ```

3. Test with Bearer token:
   ```bash
   curl -X POST http://localhost:3000/figma/document \
     -H "Authorization: Bearer test-token-123" \
     -H "Content-Type: application/json" \
     -d '{"fileKey":"test-file-key"}'
   ```

### Without Auth (should fail):

```bash
curl -X POST http://localhost:3000/figma/document \
  -H "Content-Type: application/json" \
  -d '{"fileKey":"test-file-key"}'
```

**Expected Response** (401):
```json
{"error":"Unauthorized"}
```

---

## Production Testing (Railway)

### Health Check

```bash
curl https://mcp-server-production-4ddc.up.railway.app/health
```

**Expected**: `{"status":"ok"}`

---

### Authenticated Request

```bash
curl -X POST https://mcp-server-production-4ddc.up.railway.app/figma/document \
  -H "Authorization: Bearer YOUR_MCP_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileKey":"YOUR_FILE_KEY"}'
```

Replace:
- `YOUR_MCP_AUTH_TOKEN` - From Railway env var `MCP_AUTH_TOKEN`
- `YOUR_FILE_KEY` - Figma file key from URL

---

## Testing with Custom Channel

### Set Channel Header

```bash
curl -X POST http://localhost:3000/figma/document \
  -H "X-MCP-Channel: my-custom-channel" \
  -H "Content-Type: application/json" \
  -d '{"fileKey":"test-file-key"}'
```

**Note**: Plugin must be connected to the same channel (`my-custom-channel`).

---

## MCP Streamable HTTP Testing

### Using MCP Inspector

1. Install MCP Inspector:
   ```bash
   npm install -g @modelcontextprotocol/inspector
   ```

2. Connect to local server:
   ```bash
   mcp-inspector http://localhost:3000/mcp
   ```

3. Test tools:
   - `get_document_info`
   - `get_selection`
   - `create_rectangle`
   - etc.

---

## Common Test Scenarios

### Scenario 1: Plugin Disconnected

1. **Close Figma plugin**
2. **Make request**:
   ```bash
   curl -X POST http://localhost:3000/figma/set-text \
     -H "Content-Type: application/json" \
     -d '{"fileKey":"test","nodeId":"1:1","text":"test"}'
   ```
3. **Expected**: `503 Service Unavailable` with error message

---

### Scenario 2: Invalid Node ID

```bash
curl -X POST http://localhost:3000/figma/node \
  -H "Content-Type: application/json" \
  -d '{"fileKey":"test","nodeId":"invalid-id"}'
```

**Expected**: Error response from Figma plugin

---

### Scenario 3: Missing Required Fields

```bash
curl -X POST http://localhost:3000/figma/set-text \
  -H "Content-Type: application/json" \
  -d '{"fileKey":"test"}'
```

**Expected** (400):
```json
{"error":"fileKey, nodeId, and text are required"}
```

---

## Performance Testing

### Load Test with Apache Bench

```bash
# Install Apache Bench (ab)
# macOS: brew install httpd
# Ubuntu: apt-get install apache2-utils

# Test health endpoint
ab -n 1000 -c 10 http://localhost:3000/health

# Test authenticated endpoint
ab -n 100 -c 5 \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -p request.json \
  http://localhost:3000/figma/document
```

**request.json**:
```json
{"fileKey":"test-file-key"}
```

---

## Debugging Tips

### Enable Debug Logging

The MCP server logs to `stderr`. View logs in terminal:

```bash
# Run with debug output visible
bun run dist/server.js --mode=http 2>&1 | grep -E '\[INFO\]|\[ERROR\]'
```

### Check WebSocket Connection

Use `websocat` to test relay:

```bash
# Install websocat
brew install websocat  # macOS
# or download from https://github.com/vi/websocat

# Connect to relay
websocat ws://127.0.0.1:3055

# Send join message
{"type":"join","channel":"default","id":"test-123"}
```

### Monitor Network Traffic

Use browser DevTools or `tcpdump`:

```bash
# Monitor HTTP traffic on port 3000
sudo tcpdump -i lo0 -A -s 0 'tcp port 3000'
```

---

## Test Checklist

Before deploying to production:

- [ ] `/health` returns 200 OK without auth
- [ ] `/figma/*` returns 401 without Bearer token
- [ ] `/figma/*` returns 503 when plugin disconnected
- [ ] Write operations succeed when plugin active
- [ ] Batch operations execute sequentially
- [ ] CORS headers allow configured origins
- [ ] WebSocket relay accepts auth token
- [ ] Plugin connects to relay successfully
- [ ] MCP Streamable HTTP works with inspector
- [ ] Load test shows acceptable performance

---

## Troubleshooting

### Plugin Won't Connect

1. Check relay is running: `curl http://localhost:3055`
2. Verify WebSocket URL in plugin settings
3. Check auth token matches `FIGMA_SOCKET_AUTH_TOKEN`
4. Look for errors in relay terminal

### 503 Errors Despite Plugin Connected

1. Verify plugin shows green "Connected" status
2. Check channel name matches in plugin and request
3. Confirm relay is routing messages (check logs)
4. Try reconnecting plugin

### CORS Errors

1. Check `ALLOWED_ORIGINS` includes request origin
2. Verify no trailing slash in origin URL
3. Restart server after changing env vars
4. Use browser DevTools to see actual origin sent

---

## Next Steps

- See [DEPLOYMENT.md](DEPLOYMENT.md) for Railway deployment
- See [README.md](README.md) for API documentation
- See [CLAUDE.md](CLAUDE.md) for architecture details
