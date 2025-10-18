# Tom to Figma Plugin Updates

This document outlines required updates to the Figma plugin to fix issues discovered during integration testing with Tom Chat SDK.

## Current Status

### ✅ What Works
- Plugin connects to WebSocket relay successfully
- Shows ONLINE status in plugin interface
- Receives broadcast messages from relay
- Creates frames in Figma file

### ❌ What Needs Fixing

1. **UI Status doesn't update after connection** - Shows "OFFLINE" in header even when connected
2. **Empty frames created** - Frame is created with correct name but missing:
   - Background fill (mint green color)
   - Text elements with timestamp and message
3. **No response sent back** - Plugin doesn't send execution result back to Tom

---

## Fix #1: Update UI Connection Status

### Problem
The plugin UI shows "OFFLINE" in the header even after successful WebSocket connection. Status only updates on page refresh.

### Solution
Add event listeners to update UI when connection state changes.

**Location**: `ui.html` or main UI component

```typescript
// Add to WebSocket initialization code
socket.addEventListener('open', () => {
  console.log('[Figma Plugin] WebSocket connected');
  updateConnectionStatus('ONLINE');
});

socket.addEventListener('close', () => {
  console.log('[Figma Plugin] WebSocket disconnected');
  updateConnectionStatus('OFFLINE');
});

socket.addEventListener('error', (error) => {
  console.error('[Figma Plugin] WebSocket error:', error);
  updateConnectionStatus('ERROR');
});

// Listen for join confirmation
socket.addEventListener('message', (event) => {
  try {
    const message = JSON.parse(event.data);

    // Update status when successfully joined channel
    if (message.type === 'system') {
      if (message.message?.includes('Joined channel') ||
          message.message?.includes('Connected to channel')) {
        updateConnectionStatus('ONLINE');
      }
    }
  } catch (err) {
    console.error('[Figma Plugin] Failed to parse message:', err);
  }
});

// Helper function to update UI
function updateConnectionStatus(status: 'ONLINE' | 'OFFLINE' | 'ERROR') {
  const statusElement = document.querySelector('.connection-status');
  if (statusElement) {
    statusElement.textContent = status;
    statusElement.className = `connection-status status-${status.toLowerCase()}`;
  }

  // Also update any status indicators
  const indicator = document.querySelector('.status-indicator');
  if (indicator) {
    indicator.className = `status-indicator ${status.toLowerCase()}`;
  }
}
```

**CSS for status indicator**:
```css
.connection-status {
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
}

.status-online {
  color: #10b981;
  background: #d1fae5;
}

.status-offline {
  color: #6b7280;
  background: #f3f4f6;
}

.status-error {
  color: #ef4444;
  background: #fee2e2;
}
```

---

## Fix #2: Handle Broadcast Messages Correctly

### Problem
Plugin receives broadcast messages but doesn't extract the command from the nested structure.

### Current Message Format from Relay
```json
{
  "type": "broadcast",
  "message": {
    "type": "create_frame",
    "id": "58077f63-4f3e-4d8b-be8a-8b874f7625bb",
    "params": { ... }
  },
  "sender": "Tom",
  "channel": "default"
}
```

### Solution
Update message handler to extract command from broadcast envelope.

**Location**: `code.ts` or main plugin code

```typescript
figma.ui.onmessage = async (msg) => {
  // Handle messages from UI (WebSocket)
  if (msg.type === 'websocket-message') {
    const message = msg.data;

    // Extract command from broadcast envelope
    let command = null;

    if (message.type === 'broadcast' && message.message) {
      // Broadcast message - extract nested command
      command = message.message;
      console.log('[Figma Plugin] Received broadcast command:', command.type);
    } else if (message.type && message.id && message.params) {
      // Direct command message
      command = message;
      console.log('[Figma Plugin] Received direct command:', command.type);
    }

    // Execute command if we extracted one
    if (command) {
      await executeCommand(command);
    }
  }
};

async function executeCommand(command: any) {
  console.log('[Figma Plugin] Executing command:', command);

  try {
    let result = null;

    switch (command.type) {
      case 'create_frame':
        result = await handleCreateFrame(command);
        break;

      // Add other command handlers here
      default:
        console.warn('[Figma Plugin] Unknown command type:', command.type);
        sendCommandResponse(command.id, {
          success: false,
          error: `Unknown command type: ${command.type}`
        });
        return;
    }

    // Send success response
    sendCommandResponse(command.id, {
      success: true,
      result: result
    });

  } catch (error) {
    console.error('[Figma Plugin] Command execution failed:', error);

    // Send error response
    sendCommandResponse(command.id, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
```

---

## Fix #3: Implement Full create_frame Handler

### Problem
Plugin creates frame with name only, ignoring:
- `fills` (background color)
- `children` (text elements)

### Solution
Implement complete frame creation with all parameters.

**Location**: `code.ts`

```typescript
async function handleCreateFrame(command: any): Promise<any> {
  const { params } = command;

  console.log('[Figma Plugin] Creating frame with params:', params);

  // Create frame
  const frame = figma.createFrame();
  frame.name = params.name || 'Untitled Frame';

  // Set size and position
  if (params.width) frame.resize(params.width, params.height || 100);
  if (params.x !== undefined) frame.x = params.x;
  if (params.y !== undefined) frame.y = params.y;

  // Apply fills (background color)
  if (params.fills && params.fills.length > 0) {
    try {
      const fills: Paint[] = params.fills.map((fill: any) => {
        if (fill.type === 'SOLID') {
          return {
            type: 'SOLID',
            color: {
              r: fill.color.r,
              g: fill.color.g,
              b: fill.color.b
            },
            opacity: fill.opacity || 1
          } as SolidPaint;
        }
        // Add other fill types as needed
        return fill;
      });

      frame.fills = fills;
      console.log('[Figma Plugin] Applied fills:', fills);
    } catch (error) {
      console.error('[Figma Plugin] Failed to apply fills:', error);
    }
  }

  // Create children (text elements, etc.)
  if (params.children && params.children.length > 0) {
    for (const childParams of params.children) {
      try {
        if (childParams.type === 'TEXT') {
          const textNode = await createTextNode(childParams);
          frame.appendChild(textNode);
        }
        // Add other node types as needed (rectangles, etc.)
      } catch (error) {
        console.error('[Figma Plugin] Failed to create child:', childParams, error);
      }
    }
  }

  // Select and zoom to the created frame
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);

  return {
    frameId: frame.id,
    frameName: frame.name,
    childrenCreated: params.children?.length || 0
  };
}

async function createTextNode(params: any): Promise<TextNode> {
  const text = figma.createText();

  // Load font before setting text
  // Try to use the font specified, or fall back to Inter
  try {
    const fontFamily = params.fontFamily || 'Inter';
    const fontStyle = params.fontWeight >= 700 ? 'Bold' :
                     params.fontWeight >= 600 ? 'Semi Bold' :
                     params.fontWeight >= 500 ? 'Medium' : 'Regular';

    await figma.loadFontAsync({
      family: fontFamily,
      style: fontStyle
    });

    text.fontName = { family: fontFamily, style: fontStyle };
  } catch (fontError) {
    // Fallback to Inter Regular
    console.warn('[Figma Plugin] Failed to load font, using Inter Regular:', fontError);
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    text.fontName = { family: 'Inter', style: 'Regular' };
  }

  // Set text content
  text.characters = params.characters || '';

  // Set text properties
  if (params.fontSize) text.fontSize = params.fontSize;
  if (params.x !== undefined) text.x = params.x;
  if (params.y !== undefined) text.y = params.y;

  // Set text color if provided
  if (params.color) {
    text.fills = [{
      type: 'SOLID',
      color: params.color
    }];
  }

  return text;
}
```

---

## Fix #4: Send Response Back to Tom

### Problem
Plugin executes command but never sends result back through WebSocket. Tom waits 15 seconds then times out.

### Solution
Send response message with matching command ID.

**Location**: Plugin code (both `code.ts` and `ui.html`)

**In `code.ts`**:
```typescript
function sendCommandResponse(commandId: string, result: any) {
  // Send message to UI to forward via WebSocket
  figma.ui.postMessage({
    type: 'send-response',
    commandId: commandId,
    result: result
  });
}
```

**In `ui.html`** (WebSocket UI code):
```typescript
// Listen for response messages from plugin code
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;

  if (msg.type === 'send-response') {
    // Send response back through WebSocket
    const response = {
      type: 'message',
      channel: channelName, // Use your current channel
      message: {
        id: msg.commandId,
        result: msg.result
      }
    };

    console.log('[Figma Plugin UI] Sending response:', response);
    socket.send(JSON.stringify(response));
  }
};

// Forward WebSocket messages to plugin code
socket.addEventListener('message', (event) => {
  try {
    const message = JSON.parse(event.data);

    // Forward to plugin code for processing
    parent.postMessage({
      pluginMessage: {
        type: 'websocket-message',
        data: message
      }
    }, '*');
  } catch (err) {
    console.error('[Figma Plugin UI] Failed to parse message:', err);
  }
});
```

---

## Testing Checklist

After implementing these fixes, test the following:

### Connection Status
- [ ] Open plugin in Figma
- [ ] Verify status shows "OFFLINE" initially
- [ ] Click connect (if manual connection)
- [ ] Verify status updates to "ONLINE" immediately
- [ ] Close WebSocket connection
- [ ] Verify status updates to "OFFLINE"

### Frame Creation
- [ ] Send "Connect Tom to Figma and show I'm here!" from Tom chat
- [ ] Verify frame is created with:
  - [ ] Name: "Tom Connection Check"
  - [ ] Size: 600x400
  - [ ] Background: Mint green (#8AD1B8 or rgb(0.54, 0.82, 0.71))
  - [ ] Text 1: "I'm here!" (64px, bold, at 50,50)
  - [ ] Text 2: Current time (32px, at 50,200)
  - [ ] Text 3: Current date (20px, at 50,260)
- [ ] Verify Tom receives success response (no timeout)
- [ ] Verify Tom shows success message with frame details

### Error Handling
- [ ] Send invalid command
- [ ] Verify plugin sends error response
- [ ] Verify Tom receives error (no timeout)
- [ ] Check plugin console for error logs

---

## Repository Information

**Figma Plugin Repository**: https://github.com/g88dknight/tom-to-figma-mcp

**Related Files**:
- `code.ts` - Main plugin logic
- `ui.html` - Plugin UI and WebSocket client
- `manifest.json` - Plugin configuration

**Testing Against**:
- Tom Chat SDK: https://github.com/g88dknight/tom-chat-sdk
- WebSocket Relay: wss://relay-production-bcbf.up.railway.app
- Channel: `default`

---

## Summary

All issues are on the **Figma plugin side**. Tom Chat SDK is working correctly:
- ✅ Connects to relay
- ✅ Joins channel successfully
- ✅ Sends properly formatted commands with ID tracking
- ✅ Waits for responses with improved timeout handling
- ✅ Handles broadcast messages

The plugin just needs to:
1. Update UI status on WebSocket events
2. Extract commands from broadcast envelopes
3. Apply all frame parameters (fills, children)
4. Send responses back with matching command IDs

---

**Document Version**: 1.0
**Date**: October 18, 2025
**Author**: Claude Code
**Status**: Ready for implementation
