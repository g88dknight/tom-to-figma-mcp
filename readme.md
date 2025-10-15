# Tom to Figma MCP

**Tom to Figma** is a production-ready Model Context Protocol (MCP) server and Figma plugin that enables AI agents to control Figma documents. Built with TypeScript and Bun, it supports both local development and cloud deployments with HTTP transport and WebSocket relay.

## ✨ Features

- 🔌 **40+ MCP Tools** - Complete Figma API coverage (create, modify, export, scan)
- 🌐 **Hosted & Local** - Works with external AI agents (OpenAI, Claude API) and local IDEs (Cursor, VSCode)
- 🔗 **REST API** - Direct HTTP/JSON endpoints for any client (alongside MCP protocol)
- 🔒 **Secure** - Built-in authentication with token-based access
- 🚀 **Production Ready** - Deployed on Railway with WebSocket relay
- 📱 **Modern UI** - Clean Figma plugin with Geist font and dark theme

## 🏗️ Architecture

```
AI Agent (OpenAI/Claude/IDE)
        │  (HTTP or stdio)
        ▼
MCP Server (server.ts)
        │  (WebSocket + Auth)
        ▼
Relay (socket.ts)
        │  (Channel-based routing)
        ▼
Figma Plugin (Tom to Figma)
        │  (Figma Plugin API)
        ▼
Figma Document
```

### Three-Layer System:

1. **MCP Server** - Exposes 40 tools via MCP protocol (stdio or HTTP)
2. **WebSocket Relay** - Routes messages between server and plugin with channel support
3. **Figma Plugin** - Executes commands in Figma and returns results

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) 1.2+
- [Figma Desktop App](https://www.figma.com/downloads/)
- Node.js 18+ (for external deployments)

### 1️⃣ Local Development Setup

```bash
# Clone and install
git clone https://github.com/grab/tom-talk-to-figma-mcp.git
cd tom-talk-to-figma-mcp
bun install

# Build the project
bun run build

# Terminal 1: Start WebSocket relay
bun socket

# Terminal 2: Start MCP server (stdio mode for local IDE)
bunx tom-talk-to-figma-mcp
```

### 2️⃣ Install Figma Plugin

1. Open Figma Desktop App
2. Go to **Plugins** → **Development** → **Import plugin from manifest**
3. Select `src/cursor_mcp_plugin/manifest.json`
4. Run "Tom to Figma" plugin from your development plugins

### 3️⃣ Configure Plugin Connection

In the Figma plugin UI:
- **WebSocket Server URL**: `ws://127.0.0.1:3055` (local) or `wss://relay-production-bcbf.up.railway.app` (hosted)
- **Auth Token**: Your secret token (optional for local dev)
- **Channel Name**: `default` (must match MCP server config)
- Click **Connect** ✅

### 4️⃣ Configure Your IDE

**For Cursor/VSCode** - Create `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "tom-to-figma": {
      "command": "bunx",
      "args": ["tom-talk-to-figma-mcp"],
      "env": {
        "FIGMA_SOCKET_URL": "ws://127.0.0.1:3055",
        "FIGMA_SOCKET_CHANNEL": "default"
      }
    }
  }
}
```

### 5️⃣ Test It!

Ask your AI agent:
```
"Create a red rectangle 300x200 in Figma"
```

## 🌐 Connecting External AI Agents

### For OpenAI, Claude API, Anthropic Console, etc.

**Production MCP Server URL:**
```
https://mcp-server-production-4ddc.up.railway.app
```

**Authentication:**
- Type: `Access token` / `API key`
- Token: Get your token from deployment admin

**Configuration Example (OpenAI Custom Actions):**
```json
{
  "url": "https://mcp-server-production-4ddc.up.railway.app",
  "authentication": {
    "type": "bearer",
    "token": "your-auth-token-here"
  }
}
```

**In Anthropic Console:**
1. Go to "Connect to MCP Server"
2. URL: `https://mcp-server-production-4ddc.up.railway.app`
3. Label: `tom-to-figma`
4. Authentication: Select "Access token / API key"
5. Token: Paste your auth token
6. Click **Connect**

## 🔌 REST API

In addition to MCP protocol, Tom to Figma exposes a **REST API** for direct HTTP/JSON access.

### Base URL
```
https://mcp-server-production-4ddc.up.railway.app
```

### Authentication
All `/figma/*` endpoints require a Bearer token:
```bash
Authorization: Bearer YOUR_MCP_AUTH_TOKEN
```

### Available Endpoints

#### Health Check (No Auth Required)
```bash
GET /health
```
**Response:** `{"status":"ok"}`

---

#### Get Document Info
```bash
POST /figma/document
Content-Type: application/json

{
  "fileKey": "your-figma-file-key"
}
```

#### Get Node Info
```bash
POST /figma/node
Content-Type: application/json

{
  "fileKey": "your-figma-file-key",
  "nodeId": "123:456"
}
```

#### Set Text Content
```bash
POST /figma/set-text
Content-Type: application/json

{
  "fileKey": "your-figma-file-key",
  "nodeId": "789:012",
  "text": "New text content"
}
```

#### Set Fill Color
```bash
POST /figma/set-fill-color
Content-Type: application/json

{
  "fileKey": "your-figma-file-key",
  "nodeId": "345:678",
  "color": {
    "r": 1,
    "g": 0,
    "b": 0,
    "a": 1
  }
}
```

#### Batch Operations
```bash
POST /figma/batch
Content-Type: application/json

{
  "fileKey": "your-figma-file-key",
  "operations": [
    {
      "type": "set_text",
      "nodeId": "111:222",
      "text": "Hello"
    },
    {
      "type": "set_fill_color",
      "nodeId": "333:444",
      "color": {"r": 0, "g": 1, "b": 0, "a": 1}
    }
  ]
}
```

### Custom Channel (Optional)
To use a custom channel, add the `X-MCP-Channel` header:
```bash
X-MCP-Channel: my-custom-channel
```

### Example: Full Request
```bash
curl -X POST https://mcp-server-production-4ddc.up.railway.app/figma/set-text \
  -H "Authorization: Bearer YOUR_MCP_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-MCP-Channel: default" \
  -d '{
    "fileKey": "abc123xyz",
    "nodeId": "1:2",
    "text": "Updated via REST API"
  }'
```

### Error Responses

#### Plugin Not Active (503)
```json
{
  "error": "Figma plugin not active",
  "message": "Start the Tom plugin in Figma to enable write operations"
}
```

#### Unauthorized (401)
```json
{"error": "Unauthorized"}
```

#### Missing Fields (400)
```json
{"error": "fileKey, nodeId, and text are required"}
```

**📖 Full REST API documentation:** See [TESTING.md](TESTING.md)

## 📝 Available MCP Tools (40+)

### Document & Selection
- `get_document_info` - Get current document information
- `get_selection` - Get currently selected nodes
- `read_my_design` - Read entire design structure
- `get_node_info` - Get specific node details
- `get_nodes_info` - Get multiple nodes at once

### Node Creation
- `create_rectangle` - Create rectangle shapes
- `create_frame` - Create frame containers
- `create_text` - Create text nodes
- `create_component_instance` - Instantiate components

### Node Manipulation
- `set_fill_color` - Change fill colors
- `set_stroke_color` - Change stroke colors
- `move_node` - Move nodes to new positions
- `resize_node` - Resize nodes
- `clone_node` - Duplicate nodes
- `delete_node` / `delete_multiple_nodes` - Remove nodes
- `set_corner_radius` - Round corners
- `set_text_content` / `set_multiple_text_contents` - Update text

### Layout (Auto Layout)
- `set_layout_mode` - Enable auto layout
- `set_padding` - Set padding values
- `set_axis_align` - Configure alignment
- `set_layout_sizing` - Set sizing behavior
- `set_item_spacing` - Configure spacing

### Export
- `export_node_as_image` - Export as PNG, JPG, SVG, or PDF

### Components
- `get_local_components` - List all components
- `get_instance_overrides` - Get instance properties
- `set_instance_overrides` - Modify instance overrides

### And more...
- Annotations, reactions, scanning, focus management, connections

## ⚙️ Configuration

### Environment Variables

#### MCP Server
```bash
FIGMA_SOCKET_URL=wss://relay-production-bcbf.up.railway.app
FIGMA_SOCKET_CHANNEL=default          # Must match plugin channel
FIGMA_SOCKET_AUTH_TOKEN=your-token    # Required for production (WebSocket auth)
MCP_AUTH_TOKEN=your-rest-api-token    # Required for REST API endpoints
PORT=3000
HTTP_HOST=0.0.0.0
ALLOWED_ORIGINS=*
```

#### WebSocket Relay
```bash
FIGMA_SOCKET_PORT=8080
FIGMA_SOCKET_AUTH_TOKEN=your-token    # Same as MCP server
ALLOWED_ORIGINS=*
```

#### Figma Plugin (UI Settings)
- **WebSocket Server URL**: `wss://relay-production-bcbf.up.railway.app`
- **Auth Token**: Same as `FIGMA_SOCKET_AUTH_TOKEN`
- **Channel Name**: `default` (must match `FIGMA_SOCKET_CHANNEL`)

### CLI Flags (Override Environment Variables)

```bash
# MCP Server
bunx tom-talk-to-figma-mcp \
  --mode=http \
  --port=3000 \
  --figma-socket-url=wss://relay.example.com \
  --figma-socket-channel=my-channel \
  --figma-socket-auth-token=secret

# WebSocket Relay
bun socket \
  --port=8080 \
  --host=0.0.0.0 \
  --allowed-origins=* \
  --figma-socket-auth-token=secret
```

## 🚢 Deployment

### Railway (Recommended)

Deploy **two services** in the same Railway project:

#### Service 1: WebSocket Relay
```bash
# Start Command
bun socket

# Environment Variables
FIGMA_SOCKET_PORT=8080
FIGMA_SOCKET_AUTH_TOKEN=<generate-random-token>
ALLOWED_ORIGINS=*
```

#### Service 2: MCP Server
```bash
# Start Command
bun start

# Environment Variables
FIGMA_SOCKET_URL=wss://relay-production-bcbf.up.railway.app
FIGMA_SOCKET_CHANNEL=default
FIGMA_SOCKET_AUTH_TOKEN=<same-token-as-relay>
MCP_AUTH_TOKEN=<generate-separate-token-for-rest-api>
PORT=3000
HTTP_HOST=0.0.0.0
ALLOWED_ORIGINS=*
```

### Docker

```bash
# Build
docker build -t tom-to-figma-mcp .

# Run MCP Server
docker run -p 3000:3000 \
  -e FIGMA_SOCKET_URL=wss://relay.example.com \
  -e FIGMA_SOCKET_CHANNEL=default \
  -e FIGMA_SOCKET_AUTH_TOKEN=your-token \
  tom-to-figma-mcp

# Run Relay
docker run -p 8080:8080 \
  -e FIGMA_SOCKET_PORT=8080 \
  -e FIGMA_SOCKET_AUTH_TOKEN=your-token \
  tom-to-figma-mcp bun socket
```

### Fly.io / Render

Similar to Railway - deploy two separate services with the same configuration.

## 🔧 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **403 Forbidden** | Add origin to `ALLOWED_ORIGINS` in relay config |
| **401 Unauthorized** | Verify `FIGMA_SOCKET_AUTH_TOKEN` matches in all three places |
| **Connection refused** | Use `--host 0.0.0.0` for containerized relay |
| **Plugin stuck connecting** | Use `wss://` (not `ws://`) for hosted environments |
| **Channel mismatch** | Ensure `FIGMA_SOCKET_CHANNEL` matches plugin "Channel Name" |
| **"Please join a channel"** | Set `FIGMA_SOCKET_CHANNEL` or configure in plugin UI |

### Debug Tips

1. **Check Railway logs** for connection attempts
2. **Verify channel names** match exactly (case-sensitive)
3. **Test auth token** - try connecting without it first (local dev)
4. **Use browser DevTools** in Figma plugin to see WebSocket errors

## 🛠️ Development

```bash
# Install dependencies
bun install

# Build project
bun run build

# Watch mode (auto-rebuild)
bun run dev

# Generate MCP config
bun setup

# Run tests (manual testing via IDE)
# 1. Start relay: bun socket
# 2. Start server: bunx tom-talk-to-figma-mcp
# 3. Connect Figma plugin
# 4. Test MCP tools via IDE
```

## 📚 Documentation

- [CLAUDE.md](CLAUDE.md) - Detailed technical documentation
- [DEPLOYMENT.md](DEPLOYMENT.md) - Railway deployment guide
- [TESTING.md](TESTING.md) - REST API testing and examples
- [Figma Plugin API](https://www.figma.com/plugin-docs/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (MCP tools + Figma plugin)
5. Submit a pull request

## 📄 License

[MIT](LICENSE)

## 🙏 Credits

Originally created as "Cursor Talk to Figma MCP", evolved into **Tom to Figma** with production hosting support. Thanks to all contributors!

---

**Need help?** Open an issue on [GitHub](https://github.com/grab/tom-talk-to-figma-mcp/issues)
