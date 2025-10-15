import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

// Connection state management
let relayWs: WebSocket | null = null;
let currentChannelName: string | null = null;
const pendingRelayRequests = new Map<string, {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

interface RelayConfig {
  socketUrl: string;
  authToken?: string;
  channel: string;
}

let config: RelayConfig | null = null;

// Initialize relay connection
export function initializeRelayClient(relayConfig: RelayConfig): void {
  config = relayConfig;
  connectToRelay();
}

// Connect to WebSocket relay
function connectToRelay(): void {
  if (!config) {
    throw new Error("Relay config not initialized");
  }

  if (relayWs && relayWs.readyState === WebSocket.OPEN) {
    console.log("[RelayClient] Already connected to relay");
    return;
  }

  const socketOptions = config.authToken
    ? { headers: { Authorization: `Bearer ${config.authToken}` } }
    : undefined;

  console.log(`[RelayClient] Connecting to relay at ${config.socketUrl}...`);
  relayWs = socketOptions
    ? new WebSocket(config.socketUrl, socketOptions)
    : new WebSocket(config.socketUrl);

  relayWs.on("open", async () => {
    console.log("[RelayClient] Connected to relay");
    // Join the channel
    try {
      await joinRelayChannel(config!.channel);
    } catch (error) {
      console.error("[RelayClient] Failed to join channel:", error);
    }
  });

  relayWs.on("message", (data: WebSocket.Data) => {
    try {
      const json = JSON.parse(data.toString());

      // Handle responses to pending requests
      if (json.id && pendingRelayRequests.has(json.id)) {
        const request = pendingRelayRequests.get(json.id)!;
        clearTimeout(request.timeout);

        if (json.error) {
          request.reject(new Error(json.error));
        } else {
          request.resolve(json.result || json);
        }

        pendingRelayRequests.delete(json.id);
      }
    } catch (error) {
      console.error("[RelayClient] Error parsing message:", error);
    }
  });

  relayWs.on("error", (error) => {
    console.error("[RelayClient] Socket error:", error);
  });

  relayWs.on("close", () => {
    console.log("[RelayClient] Disconnected from relay");
    relayWs = null;
    currentChannelName = null;

    // Reject all pending requests
    for (const [id, request] of pendingRelayRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Connection closed"));
      pendingRelayRequests.delete(id);
    }

    // Attempt to reconnect
    console.log("[RelayClient] Attempting to reconnect in 2 seconds...");
    setTimeout(connectToRelay, 2000);
  });
}

// Join a channel on the relay
async function joinRelayChannel(channelName: string): Promise<void> {
  if (currentChannelName === channelName) {
    console.log(`[RelayClient] Already joined channel: ${channelName}`);
    return;
  }

  if (!relayWs || relayWs.readyState !== WebSocket.OPEN) {
    throw new Error("Not connected to relay");
  }

  return new Promise((resolve, reject) => {
    const id = uuidv4();
    const request = {
      id,
      type: "join",
      channel: channelName,
    };

    const timeout = setTimeout(() => {
      if (pendingRelayRequests.has(id)) {
        pendingRelayRequests.delete(id);
        reject(new Error("Join channel request timed out"));
      }
    }, 5000);

    pendingRelayRequests.set(id, { resolve, reject, timeout });

    relayWs!.send(JSON.stringify(request));

    // Optimistically set current channel
    currentChannelName = channelName;
    console.log(`[RelayClient] Joined channel: ${channelName}`);
  });
}

// Send command to plugin via relay
export async function sendToPlugin(
  channel: string,
  command: any,
  timeoutMs: number = 30000
): Promise<any> {
  if (!relayWs || relayWs.readyState !== WebSocket.OPEN) {
    throw new Error("Not connected to relay");
  }

  if (currentChannelName !== channel) {
    await joinRelayChannel(channel);
  }

  return new Promise((resolve, reject) => {
    const id = uuidv4();
    const request = {
      id,
      type: "message",
      channel,
      message: {
        id,
        command: command.type,
        params: {
          ...command,
          commandId: id,
        },
      },
    };

    const timeout = setTimeout(() => {
      if (pendingRelayRequests.has(id)) {
        pendingRelayRequests.delete(id);
        reject(new Error("Request to plugin timed out"));
      }
    }, timeoutMs);

    pendingRelayRequests.set(id, { resolve, reject, timeout });

    relayWs!.send(JSON.stringify(request));
    console.log(`[RelayClient] Sent command to plugin: ${command.type}`);
  });
}

// Check if plugin is active on a channel (via heartbeat)
export async function checkRelayHeartbeat(channel: string): Promise<{ active: boolean }> {
  try {
    // Send a lightweight ping command to check if plugin responds
    const result = await sendToPlugin(channel, {
      type: "ping",
    }, 3000); // 3 second timeout for heartbeat

    return { active: true };
  } catch (error) {
    console.log(`[RelayClient] Plugin not active on channel ${channel}:`, error);
    return { active: false };
  }
}

// Get connection status
export function getRelayStatus(): {
  connected: boolean;
  channel: string | null;
} {
  return {
    connected: relayWs !== null && relayWs.readyState === WebSocket.OPEN,
    channel: currentChannelName,
  };
}
