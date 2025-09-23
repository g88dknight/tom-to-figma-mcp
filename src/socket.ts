import { Server, ServerWebSocket } from "bun";

const cliArgs = process.argv.slice(2);

const flagMap = cliArgs.reduce<Map<string, string>>((map, arg) => {
  if (!arg.startsWith("--")) {
    return map;
  }

  const [key, value] = arg.slice(2).split("=");
  if (key) {
    map.set(key, value ?? "");
  }
  return map;
}, new Map());

function getFlagValue(name: string): string | undefined {
  if (flagMap.has(name)) {
    const value = flagMap.get(name);
    return value && value.length > 0 ? value : undefined;
  }
  return undefined;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAllowedOrigins(raw?: string): string[] {
  if (!raw || raw.trim().length === 0) {
    return ["*"];
  }

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const port = parseNumber(
  getFlagValue("port") ?? process.env.FIGMA_SOCKET_PORT ?? process.env.PORT,
  3055
);

const host = getFlagValue("host") ?? process.env.FIGMA_SOCKET_HOST ?? "127.0.0.1";

const allowedOriginsInput =
  getFlagValue("allowed-origins") ?? process.env.ALLOWED_ORIGINS ?? "*";
const allowedOrigins = parseAllowedOrigins(allowedOriginsInput);
const allowAllOrigins = allowedOrigins.includes("*");

const expectedAuthToken =
  getFlagValue("figma-socket-auth-token") ??
  getFlagValue("auth-token") ??
  process.env.FIGMA_SOCKET_AUTH_TOKEN ??
  "";

function normalizeAuthToken(token: string): string {
  if (!token) {
    return "";
  }

  const trimmed = token.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("Bearer ") ? trimmed : `Bearer ${trimmed}`;
}

const expectedAuthHeader = normalizeAuthToken(expectedAuthToken);

const LOG_PREFIX = "[Tom Talk to Figma MCP socket]";

function isOriginAllowed(origin: string | null): boolean {
  if (!origin || origin.length === 0) {
    return true;
  }
  return allowAllOrigins || allowedOrigins.includes(origin);
}

function resolveAllowOrigin(origin: string | null): string {
  if (allowAllOrigins) {
    return origin ?? "*";
  }

  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }

  return allowedOrigins[0] ?? "";
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = resolveAllowOrigin(origin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (!allowAllOrigins) {
    headers["Vary"] = "Origin";
  }

  return headers;
}

function isAuthorized(req: Request): boolean {
  if (!expectedAuthHeader) {
    return true;
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader) {
    return false;
  }

  if (authHeader === expectedAuthHeader) {
    return true;
  }

  // Accept raw token without Bearer prefix as a convenience
  const rawToken = expectedAuthHeader.replace(/^Bearer\s+/i, "");
  return authHeader === rawToken || authHeader === `Bearer ${rawToken}`;
}

// Store clients by channel
const channels = new Map<string, Set<ServerWebSocket<any>>>();

function handleConnection(ws: ServerWebSocket<any>) {
  // Don't add to clients immediately - wait for channel join
  console.log(`${LOG_PREFIX} New client connected`);

  // Send welcome message to the new client
  ws.send(JSON.stringify({
    type: "system",
    message: "Please join a channel to start chatting",
  }));

  ws.close = () => {
    console.log(`${LOG_PREFIX} Client disconnected`);

    // Remove client from their channel
    channels.forEach((clients, channelName) => {
      if (clients.has(ws)) {
        clients.delete(ws);

        // Notify other clients in same channel
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "system",
              message: "A user has left the channel",
              channel: channelName
            }));
          }
        });
      }
    });
  };
}

const server = Bun.serve({
  port,
  hostname: host,
  fetch(req: Request, server: Server) {
    const origin = req.headers.get("origin");

    if (!isOriginAllowed(origin)) {
      console.warn(`${LOG_PREFIX} Blocked connection from disallowed origin:`, origin);
      return new Response("Forbidden", {
        status: 403,
        headers: buildCorsHeaders(origin),
      });
    }

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: buildCorsHeaders(origin),
      });
    }

    if (!isAuthorized(req)) {
      console.warn(`${LOG_PREFIX} Unauthorized connection attempt`);
      return new Response("Unauthorized", {
        status: 401,
        headers: buildCorsHeaders(origin),
      });
    }

    // Handle WebSocket upgrade
    const success = server.upgrade(req, {
      headers: buildCorsHeaders(origin),
    });

    if (success) {
      return; // Upgraded to WebSocket
    }

    // Return response for non-WebSocket requests
    return new Response("Tom Talk to Figma MCP socket relay", {
      headers: buildCorsHeaders(origin),
    });
  },
  websocket: {
    open: handleConnection,
    message(ws: ServerWebSocket<any>, message: string | Buffer) {
      try {
        console.log(`${LOG_PREFIX} Received message from client:`, message);
        const data = JSON.parse(message as string);

        if (data.type === "join") {
          const channelName = data.channel;
          if (!channelName || typeof channelName !== "string") {
            ws.send(JSON.stringify({
              type: "error",
              message: "Channel name is required"
            }));
            return;
          }

          // Create channel if it doesn't exist
          if (!channels.has(channelName)) {
            channels.set(channelName, new Set());
          }

          // Add client to channel
          const channelClients = channels.get(channelName)!;
          channelClients.add(ws);

          // Notify client they joined successfully
          ws.send(JSON.stringify({
            type: "system",
            message: `Joined channel: ${channelName}`,
            channel: channelName
          }));

          console.log(`${LOG_PREFIX} Sending message to client:`, data.id);

          ws.send(JSON.stringify({
            type: "system",
            message: {
              id: data.id,
              result: "Connected to channel: " + channelName,
            },
            channel: channelName
          }));

          // Notify other clients in channel
          channelClients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "system",
                message: "A new user has joined the channel",
                channel: channelName
              }));
            }
          });
          return;
        }

        // Handle regular messages
        if (data.type === "message") {
          const channelName = data.channel;
          if (!channelName || typeof channelName !== "string") {
            ws.send(JSON.stringify({
              type: "error",
              message: "Channel name is required"
            }));
            return;
          }

          const channelClients = channels.get(channelName);
          if (!channelClients || !channelClients.has(ws)) {
            ws.send(JSON.stringify({
              type: "error",
              message: "You must join the channel first"
            }));
            return;
          }

          // Broadcast to all clients in the channel
          channelClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              console.log(`${LOG_PREFIX} Broadcasting message to client:`, data.message);
              client.send(JSON.stringify({
                type: "broadcast",
                message: data.message,
                sender: client === ws ? "You" : "User",
                channel: channelName
              }));
            }
          });
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Error handling message:`, err);
      }
    },
    close(ws: ServerWebSocket<any>) {
      // Remove client from their channel
      channels.forEach((clients) => {
        clients.delete(ws);
      });
    }
  }
});
console.log(`${LOG_PREFIX} Listening on ${host}:${server.port}`);
if (!allowAllOrigins) {
  console.log(`${LOG_PREFIX} Allowed origins: ${allowedOrigins.join(", ")}`);
} else {
  console.log(`${LOG_PREFIX} Allowing all origins`);
}

if (expectedAuthHeader) {
  console.log(`${LOG_PREFIX} Expecting Authorization header for connections`);
}
