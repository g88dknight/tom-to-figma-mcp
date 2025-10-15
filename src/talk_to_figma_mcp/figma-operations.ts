import { sendToPlugin } from "./relay-client.js";

// Operation type definition
export interface FigmaOperation {
  type: string;
  [key: string]: any;
}

// Execute a single Figma operation
export async function executeOperation(
  channel: string,
  fileKey: string,
  operation: FigmaOperation
): Promise<any> {
  const { type, ...params } = operation;

  switch (type) {
    case "set_text":
      return await sendToPlugin(channel, {
        type: "set_text_content",
        nodeId: params.nodeId,
        text: params.text,
      });

    case "set_fill_color":
      return await sendToPlugin(channel, {
        type: "set_fill_color",
        nodeId: params.nodeId,
        color: params.color,
      });

    case "set_stroke_color":
      return await sendToPlugin(channel, {
        type: "set_stroke_color",
        nodeId: params.nodeId,
        color: params.color,
        weight: params.weight,
      });

    case "move_node":
      return await sendToPlugin(channel, {
        type: "move_node",
        nodeId: params.nodeId,
        x: params.x,
        y: params.y,
      });

    case "resize_node":
      return await sendToPlugin(channel, {
        type: "resize_node",
        nodeId: params.nodeId,
        width: params.width,
        height: params.height,
      });

    case "clone_node":
      return await sendToPlugin(channel, {
        type: "clone_node",
        nodeId: params.nodeId,
        x: params.x,
        y: params.y,
      });

    case "delete_node":
      return await sendToPlugin(channel, {
        type: "delete_node",
        nodeId: params.nodeId,
      });

    case "create_rectangle":
      return await sendToPlugin(channel, {
        type: "create_rectangle",
        x: params.x,
        y: params.y,
        width: params.width,
        height: params.height,
        name: params.name,
        parentId: params.parentId,
      });

    case "create_frame":
      return await sendToPlugin(channel, {
        type: "create_frame",
        x: params.x,
        y: params.y,
        width: params.width,
        height: params.height,
        name: params.name,
        parentId: params.parentId,
      });

    case "create_text":
      return await sendToPlugin(channel, {
        type: "create_text",
        x: params.x,
        y: params.y,
        text: params.text,
        fontSize: params.fontSize,
        fontWeight: params.fontWeight,
        fontColor: params.fontColor,
        name: params.name,
        parentId: params.parentId,
      });

    case "set_corner_radius":
      return await sendToPlugin(channel, {
        type: "set_corner_radius",
        nodeId: params.nodeId,
        radius: params.radius,
        corners: params.corners,
      });

    case "set_layout_mode":
      return await sendToPlugin(channel, {
        type: "set_layout_mode",
        nodeId: params.nodeId,
        layoutMode: params.layoutMode,
        layoutWrap: params.layoutWrap,
      });

    case "set_padding":
      return await sendToPlugin(channel, {
        type: "set_padding",
        nodeId: params.nodeId,
        paddingTop: params.paddingTop,
        paddingRight: params.paddingRight,
        paddingBottom: params.paddingBottom,
        paddingLeft: params.paddingLeft,
      });

    case "set_axis_align":
      return await sendToPlugin(channel, {
        type: "set_axis_align",
        nodeId: params.nodeId,
        primaryAxisAlignItems: params.primaryAxisAlignItems,
        counterAxisAlignItems: params.counterAxisAlignItems,
      });

    case "set_layout_sizing":
      return await sendToPlugin(channel, {
        type: "set_layout_sizing",
        nodeId: params.nodeId,
        layoutSizingHorizontal: params.layoutSizingHorizontal,
        layoutSizingVertical: params.layoutSizingVertical,
      });

    case "set_item_spacing":
      return await sendToPlugin(channel, {
        type: "set_item_spacing",
        nodeId: params.nodeId,
        itemSpacing: params.itemSpacing,
        counterAxisSpacing: params.counterAxisSpacing,
      });

    default:
      throw new Error(`Unknown operation type: ${type}`);
  }
}

// Execute multiple operations in batch
export async function executeBatchOperations(
  channel: string,
  fileKey: string,
  operations: FigmaOperation[]
): Promise<any[]> {
  const results: any[] = [];

  for (const operation of operations) {
    try {
      const result = await executeOperation(channel, fileKey, operation);
      results.push({ success: true, result });
    } catch (error) {
      results.push({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
