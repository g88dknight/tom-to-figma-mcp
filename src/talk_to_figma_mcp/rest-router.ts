import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { checkRelayHeartbeat, sendToPlugin } from "./relay-client.js";
import { executeOperation, executeBatchOperations, FigmaOperation } from "./figma-operations.js";

export interface RestRouterConfig {
  authToken?: string;
  allowedOrigins: string[];
}

// Create REST API router
export function createRestRouter(config: RestRouterConfig): express.Application {
  const app = express();

  // CORS configuration
  app.use(
    cors({
      origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : "*",
      credentials: true,
    })
  );

  app.use(express.json());

  // Auth middleware
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!config.authToken) {
      // No auth required
      return next();
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");

    if (!token || token !== config.authToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    next();
  };

  // Health check (no auth required)
  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Apply auth to all /figma/* routes
  app.use("/figma/*", authMiddleware);

  // Get document info (READ operation - can use Figma REST API or MCP)
  app.post("/figma/document", async (req: Request, res: Response) => {
    try {
      const { fileKey } = req.body;

      if (!fileKey) {
        return res.status(400).json({ error: "fileKey is required" });
      }

      const channel = (req.headers["x-mcp-channel"] as string) || "default";

      // Check plugin heartbeat
      const heartbeat = await checkRelayHeartbeat(channel);
      if (!heartbeat.active) {
        return res.status(503).json({
          error: "Figma plugin not active",
          message: "Start the Tom plugin in Figma to enable operations",
        });
      }

      // Send to plugin
      const result = await sendToPlugin(channel, {
        type: "get_document_info",
        fileKey,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // Get node info (READ operation)
  app.post("/figma/node", async (req: Request, res: Response) => {
    try {
      const { fileKey, nodeId } = req.body;

      if (!fileKey || !nodeId) {
        return res.status(400).json({ error: "fileKey and nodeId are required" });
      }

      const channel = (req.headers["x-mcp-channel"] as string) || "default";

      // Check plugin heartbeat
      const heartbeat = await checkRelayHeartbeat(channel);
      if (!heartbeat.active) {
        return res.status(503).json({
          error: "Figma plugin not active",
          message: "Start the Tom plugin in Figma to enable operations",
        });
      }

      // Send to plugin
      const result = await sendToPlugin(channel, {
        type: "get_node_info",
        nodeId,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // Set text content (WRITE operation)
  app.post("/figma/set-text", async (req: Request, res: Response) => {
    try {
      const { fileKey, nodeId, text } = req.body;

      if (!fileKey || !nodeId || text === undefined) {
        return res.status(400).json({
          error: "fileKey, nodeId, and text are required",
        });
      }

      const channel = (req.headers["x-mcp-channel"] as string) || "default";

      // Check plugin heartbeat
      const heartbeat = await checkRelayHeartbeat(channel);
      if (!heartbeat.active) {
        return res.status(503).json({
          error: "Figma plugin not active",
          message: "Start the Tom plugin in Figma to enable write operations",
        });
      }

      // Send to plugin
      const result = await executeOperation(channel, fileKey, {
        type: "set_text",
        nodeId,
        text,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // Set fill color (WRITE operation)
  app.post("/figma/set-fill-color", async (req: Request, res: Response) => {
    try {
      const { fileKey, nodeId, color } = req.body;

      if (!fileKey || !nodeId || !color) {
        return res.status(400).json({
          error: "fileKey, nodeId, and color are required",
        });
      }

      const channel = (req.headers["x-mcp-channel"] as string) || "default";

      // Check plugin heartbeat
      const heartbeat = await checkRelayHeartbeat(channel);
      if (!heartbeat.active) {
        return res.status(503).json({
          error: "Figma plugin not active",
          message: "Start the Tom plugin in Figma to enable write operations",
        });
      }

      // Send to plugin
      const result = await executeOperation(channel, fileKey, {
        type: "set_fill_color",
        nodeId,
        color,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // Set stroke color (WRITE operation)
  app.post("/figma/set-stroke-color", async (req: Request, res: Response) => {
    try {
      const { fileKey, nodeId, color, weight } = req.body;

      if (!fileKey || !nodeId || !color) {
        return res.status(400).json({
          error: "fileKey, nodeId, and color are required",
        });
      }

      const channel = (req.headers["x-mcp-channel"] as string) || "default";

      // Check plugin heartbeat
      const heartbeat = await checkRelayHeartbeat(channel);
      if (!heartbeat.active) {
        return res.status(503).json({
          error: "Figma plugin not active",
          message: "Start the Tom plugin in Figma to enable write operations",
        });
      }

      // Send to plugin
      const result = await executeOperation(channel, fileKey, {
        type: "set_stroke_color",
        nodeId,
        color,
        weight: weight || 1,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // Clone/duplicate frame (WRITE operation)
  app.post("/figma/duplicate-frame", async (req: Request, res: Response) => {
    try {
      const { fileKey, nodeId, newName, x, y } = req.body;

      if (!fileKey || !nodeId) {
        return res.status(400).json({
          error: "fileKey and nodeId are required",
        });
      }

      const channel = (req.headers["x-mcp-channel"] as string) || "default";

      // Check plugin heartbeat
      const heartbeat = await checkRelayHeartbeat(channel);
      if (!heartbeat.active) {
        return res.status(503).json({
          error: "Figma plugin not active",
          message: "Start the Tom plugin in Figma to enable write operations",
        });
      }

      // Send to plugin
      const result = await executeOperation(channel, fileKey, {
        type: "clone_node",
        nodeId,
        x,
        y,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // Export node as image (READ operation - could use Figma REST API)
  app.post("/figma/export", async (req: Request, res: Response) => {
    try {
      const { fileKey, nodeId, format = "png", scale = 1 } = req.body;

      if (!fileKey || !nodeId) {
        return res.status(400).json({
          error: "fileKey and nodeId are required",
        });
      }

      const channel = (req.headers["x-mcp-channel"] as string) || "default";

      // Check plugin heartbeat
      const heartbeat = await checkRelayHeartbeat(channel);
      if (!heartbeat.active) {
        return res.status(503).json({
          error: "Figma plugin not active",
          message: "Start the Tom plugin in Figma to enable operations",
        });
      }

      // Send to plugin
      const result = await sendToPlugin(channel, {
        type: "export_node_as_image",
        nodeId,
        format: format.toUpperCase(),
        scale,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // Batch operations
  app.post("/figma/batch", async (req: Request, res: Response) => {
    try {
      const { fileKey, operations } = req.body;

      if (!fileKey || !operations || !Array.isArray(operations)) {
        return res.status(400).json({
          error: "fileKey and operations (array) are required",
        });
      }

      const channel = (req.headers["x-mcp-channel"] as string) || "default";

      // Check plugin heartbeat
      const heartbeat = await checkRelayHeartbeat(channel);
      if (!heartbeat.active) {
        return res.status(503).json({
          error: "Figma plugin not active",
          message: "Start the Tom plugin in Figma to enable write operations",
        });
      }

      // Execute operations
      const results = await executeBatchOperations(
        channel,
        fileKey,
        operations as FigmaOperation[]
      );

      res.json({ results });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  return app;
}
