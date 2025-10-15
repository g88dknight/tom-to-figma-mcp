# Railway Deployment Guide

This guide covers deploying Tom-to-Figma-MCP to Railway with both WebSocket Relay and MCP Server services.

## Architecture Overview

The system requires **two separate Railway services**:

1. **WebSocket Relay Service** - Routes messages between MCP server and Figma plugin
2. **MCP Server Service** - Exposes MCP tools via Streamable HTTP and REST API

```
Client (REST/MCP) → MCP Server → WebSocket Relay → Figma Plugin
                    (Railway)      (Railway)
```

---

## Service 1: WebSocket Relay

### Build Command
```bash
bun install
```

### Start Command
```bash
bun run src/socket.ts
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIGMA_SOCKET_PORT` | No | `3055` | WebSocket server port |
| `FIGMA_SOCKET_HOST` | No | `127.0.0.1` | Bind address (use `0.0.0.0` for Railway) |
| `FIGMA_SOCKET_AUTH_TOKEN` | **Yes** | - | Auth token for WebSocket connections |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins |
| `PORT` | No | `3055` | Railway will set this automatically |

### Required Settings

```bash
# Railway auto-sets PORT, relay should use it
FIGMA_SOCKET_PORT=$PORT
FIGMA_SOCKET_HOST=0.0.0.0
FIGMA_SOCKET_AUTH_TOKEN=your-secret-token-here
ALLOWED_ORIGINS=*
```

### Health Check

Railway will automatically detect the service is healthy when it binds to `$PORT`.

---

## Service 2: MCP Server

### Build Command
```bash
bun install && bun run build
```

### Start Command
```bash
bun run dist/server.js --mode=http
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIGMA_SOCKET_URL` | **Yes** | - | WebSocket relay URL (e.g., `wss://relay-production-bcbf.up.railway.app`) |
| `FIGMA_SOCKET_CHANNEL` | **Yes** | `default` | Channel name for relay communication |
| `FIGMA_SOCKET_AUTH_TOKEN` | **Yes** | - | Auth token for WebSocket (same as relay token) |
| `MCP_AUTH_TOKEN` | **Yes** | - | Auth token for REST API endpoints |
| `PORT` | No | `3000` | HTTP server port (Railway sets automatically) |
| `HTTP_HOST` | No | `0.0.0.0` | HTTP bind address |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins for REST API |
| `ALLOWED_HOSTS` | No | - | Comma-separated hostname allowlist |

### Required Settings

```bash
# Server config
PORT=3000  # Railway will override this
HTTP_HOST=0.0.0.0
NODE_ENV=production

# Auth tokens
MCP_AUTH_TOKEN=your-secret-token-here
FIGMA_SOCKET_AUTH_TOKEN=your-secret-token-here

# CORS
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://your-frontend-staging.vercel.app

# Relay connection
FIGMA_SOCKET_URL=wss://relay-production-bcbf.up.railway.app
FIGMA_SOCKET_CHANNEL=default
```

### Exposed Endpoints

- `GET /health` - REST API health check (no auth)
- `GET /healthz` - MCP health check (no auth)
- `POST /mcp` - MCP Streamable HTTP endpoint
- `POST /figma/*` - REST API endpoints (requires Bearer token)

---

## Deployment Steps

### 1. Create Railway Project

```bash
railway login
railway init
```

### 2. Deploy Relay Service

```bash
# In project root
railway service create relay

# Deploy relay
railway up --service relay

# Set environment variables
railway variables --service relay set FIGMA_SOCKET_AUTH_TOKEN=your-token
railway variables --service relay set FIGMA_SOCKET_HOST=0.0.0.0
railway variables --service relay set ALLOWED_ORIGINS=*
```

### 3. Deploy MCP Server Service

```bash
# Create service
railway service create mcp-server

# Deploy server
railway up --service mcp-server

# Set environment variables
railway variables --service mcp-server set MCP_AUTH_TOKEN=your-token
railway variables --service mcp-server set FIGMA_SOCKET_AUTH_TOKEN=your-token
railway variables --service mcp-server set FIGMA_SOCKET_URL=wss://relay-production-bcbf.up.railway.app
railway variables --service mcp-server set FIGMA_SOCKET_CHANNEL=default
railway variables --service mcp-server set HTTP_HOST=0.0.0.0
railway variables --service mcp-server set ALLOWED_ORIGINS=https://your-frontend.vercel.app
```

### 4. Configure Figma Plugin

In Figma:
1. Run the "Tom to Figma" plugin
2. Enter settings:
   - **WebSocket Server URL**: `wss://relay-production-bcbf.up.railway.app`
   - **Auth Token**: Same as `FIGMA_SOCKET_AUTH_TOKEN`
   - **Channel Name**: `default` (or your custom channel)
3. Click **Connect**

### 5. Test Deployment

```bash
# Test relay health (should timeout or return relay info)
curl https://relay-production-bcbf.up.railway.app

# Test MCP server health
curl https://mcp-server-production-4ddc.up.railway.app/health
# Expected: {"status":"ok"}

# Test REST API with auth
curl -X POST https://mcp-server-production-4ddc.up.railway.app/figma/document \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"fileKey":"your-file-key"}'
```

---

## Security Configuration

### Auth Tokens

**Best Practice**: Use a strong, randomly generated token:

```bash
# Generate secure token
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the **same token** for:
- `FIGMA_SOCKET_AUTH_TOKEN` (relay service)
- `FIGMA_SOCKET_AUTH_TOKEN` (MCP server service)
- Figma plugin "Auth Token" field

Use a **separate token** for:
- `MCP_AUTH_TOKEN` (REST API authentication)

### CORS Configuration

**Production**:
```bash
ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app-staging.vercel.app
```

**Development**:
```bash
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Permissive** (not recommended for production):
```bash
ALLOWED_ORIGINS=*
```

---

## Troubleshooting

### 503 Service Unavailable

**Error**: `Figma plugin not active`

**Solution**:
1. Open Figma Desktop app
2. Run "Tom to Figma" plugin
3. Verify green "Connected" status
4. Leave Figma open while making requests

### 401 Unauthorized (REST API)

**Error**: `{"error":"Unauthorized"}`

**Solution**:
1. Check `Authorization: Bearer <token>` header is set
2. Verify `MCP_AUTH_TOKEN` in Railway matches request token
3. Ensure no extra spaces in token

### 401 Unauthorized (WebSocket)

**Error**: Plugin shows "Connection failed"

**Solution**:
1. Check `FIGMA_SOCKET_AUTH_TOKEN` matches between:
   - Relay service
   - MCP server service
   - Figma plugin settings
2. Token is sent as URL query param: `?token=your-token`

### Connection Refused

**Error**: Plugin can't connect to relay

**Solution**:
1. Verify relay service is running in Railway
2. Check `FIGMA_SOCKET_HOST=0.0.0.0` (not `127.0.0.1`)
3. Ensure Railway has bound the service to `$PORT`
4. Use `wss://` (not `ws://`) for production URLs

### CORS Errors

**Error**: `Access to fetch at '...' from origin '...' has been blocked by CORS`

**Solution**:
1. Add your origin to `ALLOWED_ORIGINS` in Railway
2. Format: `https://your-domain.com` (no trailing slash)
3. Separate multiple origins with commas
4. Redeploy after changing env vars

---

## Environment Variable Template

### Relay Service (`.env.relay`)
```bash
FIGMA_SOCKET_PORT=$PORT
FIGMA_SOCKET_HOST=0.0.0.0
FIGMA_SOCKET_AUTH_TOKEN=<GENERATE_SECURE_TOKEN>
ALLOWED_ORIGINS=*
```

### MCP Server Service (`.env.mcp`)
```bash
# Server
PORT=$PORT
HTTP_HOST=0.0.0.0
NODE_ENV=production

# Auth
MCP_AUTH_TOKEN=<GENERATE_SEPARATE_TOKEN>
FIGMA_SOCKET_AUTH_TOKEN=<SAME_AS_RELAY_TOKEN>

# CORS
ALLOWED_ORIGINS=https://your-app.vercel.app

# Relay
FIGMA_SOCKET_URL=wss://relay-production-bcbf.up.railway.app
FIGMA_SOCKET_CHANNEL=default
```

---

## Monitoring

### Health Checks

```bash
# MCP Server
curl https://mcp-server-production-4ddc.up.railway.app/health

# Relay (WebSocket - use websocat)
websocat wss://relay-production-bcbf.up.railway.app?token=your-token
```

### Railway Logs

```bash
# View relay logs
railway logs --service relay

# View MCP server logs
railway logs --service mcp-server
```

### Plugin Status

Check Figma plugin UI for:
- ✅ Green "Connected" status
- Channel name displayed
- No error messages

---

## Rollback Plan

If deployment fails:

1. **Revert MCP Server**:
   ```bash
   railway rollback --service mcp-server
   ```

2. **Revert Relay** (if needed):
   ```bash
   railway rollback --service relay
   ```

3. **Check Previous Deployment**:
   ```bash
   railway deployments --service mcp-server
   railway deployments --service relay
   ```

---

## Cost Optimization

Railway offers:
- Free tier: 500 hours/month
- Hobby plan: $5/month per service

**Recommendations**:
- Use shared project for both services
- Set up auto-sleep for non-production environments
- Monitor usage in Railway dashboard

---

## Support

- Railway Docs: https://docs.railway.app
- Tom-to-Figma-MCP Issues: https://github.com/your-repo/issues
- Figma Plugin API: https://www.figma.com/plugin-docs/
