# Tom Talk to Figma MCP - Railway Deployment Info

## Deployment Summary

✅ **Successfully deployed** on Railway on 2025-10-06

**Project:** tom-to-figma
**Project ID:** 96cd2005-f86f-4468-b84e-1c05f384f351
**Environment:** production

---

## Service 1: WebSocket Relay

**Service Name:** relay
**Service ID:** 2f4d0d47-4e9c-4068-9040-9c9caaf1d12f

### Public URL
🚀 **https://relay-production-bcbf.up.railway.app**

WebSocket endpoint: `wss://relay-production-bcbf.up.railway.app`

### Environment Variables
```bash
FIGMA_SOCKET_HOST=0.0.0.0
FIGMA_SOCKET_PORT=3055
FIGMA_SOCKET_AUTH_TOKEN=5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311
ALLOWED_ORIGINS=*
```

### Build Configuration
- Uses `nixpacks.toml` (deleted after deployment, needs recreation for relay)
- Start command: `bun run src/socket.ts --host 0.0.0.0 --port ${PORT:-3055}`

---

## Service 2: MCP Server

**Service Name:** mcp-server
**Service ID:** b846cbd6-6f68-436d-b26e-bd52c372f8e6

### Public URL
🚀 **https://mcp-server-production-4ddc.up.railway.app**

### Environment Variables
```bash
PORT=3000
HTTP_HOST=0.0.0.0
FIGMA_SOCKET_URL=wss://relay-production-bcbf.up.railway.app
FIGMA_SOCKET_CHANNEL=default
FIGMA_SOCKET_AUTH_TOKEN=5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311
ALLOWED_ORIGINS=*
```

### Build Configuration
- Uses `Dockerfile`
- Start command: `bun run dist/server.js --mode=http`
- Build configured via `railway.json`

---

## Architecture

```
IDE/MCP Client
    ↓ HTTP/SSE
MCP Server
  https://mcp-server-production-4ddc.up.railway.app
    ↓ WebSocket (WSS)
WebSocket Relay
  wss://relay-production-bcbf.up.railway.app
    ↓ WebSocket
Figma Plugin (browser)
```

---

## Testing

### Test Relay
```bash
curl -I https://relay-production-bcbf.up.railway.app
```

Expected response: HTTP 200 with body "Tom Talk to Figma MCP socket relay"

### Test MCP Server
```bash
curl https://mcp-server-production-4ddc.up.railway.app
```

### Check Logs
```bash
# Relay logs
railway service relay && railway logs --follow

# MCP server logs
railway service mcp-server && railway logs --follow
```

---

## Figma Plugin Configuration

To connect the Figma plugin to your deployed services:

1. Open Figma Plugin UI
2. Navigate to WebSocket Settings
3. Set WebSocket URL: `wss://relay-production-bcbf.up.railway.app`
4. Set Channel: `default`
5. (Optional) Set Auth Token if using protected relay
6. Click "Connect"

---

## Management Commands

### Update Environment Variables
```bash
# Switch to service
railway service relay
# or
railway service mcp-server

# Set variable
railway variables --set "KEY=value"
```

### Redeploy Services
```bash
# Redeploy relay
railway service relay && railway redeploy

# Redeploy MCP server
railway service mcp-server && railway redeploy
```

### View Service Info
```bash
railway status
```

### Open in Browser
```bash
# Open project dashboard
railway open

# Open specific service logs
railway service mcp-server && railway open
```

---

## Important Notes

⚠️ **Security Token**

The auth token `5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311` is shared between both services. Keep it secure and don't commit to version control.

🔄 **nixpacks.toml**

The file was deleted during deployment. To redeploy relay service later, you'll need to recreate it or use the backup in git history.

📝 **CORS Configuration**

Currently set to `ALLOWED_ORIGINS=*` (allow all). For production, restrict to specific domains:
```bash
railway service relay
railway variables --set "ALLOWED_ORIGINS=https://figma.com,https://www.figma.com"
```

---

## Troubleshooting

### Service not responding
1. Check deployment status: `railway service <name> && railway logs`
2. Verify environment variables: `railway variables`
3. Check service health in Railway dashboard

### WebSocket connection fails
1. Ensure relay is using WSS (not WS) protocol
2. Check `FIGMA_SOCKET_AUTH_TOKEN` matches in both services
3. Verify CORS settings allow your origin

### Build failures
1. Check build logs at the URL provided during `railway up`
2. Ensure `Dockerfile` exists for mcp-server
3. Ensure all dependencies in `package.json` are correct

---

## Next Steps

1. ✅ Test both services are responding
2. ✅ Configure Figma Plugin with relay URL
3. ✅ Test end-to-end communication (IDE → MCP → Relay → Figma)
4. 🔄 Consider adding custom domains
5. 🔄 Restrict CORS to specific origins for production
6. 🔄 Set up monitoring/alerting
7. 🔄 Rotate auth token periodically

---

**Deployed by:** Railway CLI v4.8.0
**Date:** 2025-10-06
