# Tom Chat SDK - Figma Integration Fix Plan

## Executive Summary

**Status:** Figma plugin integration is WORKING, but Tom AI shows false errors to users.

**Problem:** Tom AI's REST API client (`figma-connect` tool) incorrectly reports connection/command failures even though Figma commands execute successfully.

**Root Cause:** Response handling in `lib/ai/tools/figma-connect.ts` doesn't match the actual message flow from relay/plugin.

---

## Current State Analysis

### ✅ What Works (Confirmed by Railway logs)
1. **WebSocket Relay** - Accepts connections, broadcasts messages correctly
2. **Figma Plugin** - Receives commands, creates frames, sends responses back
3. **Command Execution** - Frame "Tom Connection Check" created successfully in Figma
4. **Broadcast Flow** - Tom → Relay → Plugin works end-to-end

### ❌ What Fails (User Experience)
1. **Join Channel Response** - Times out after 5 seconds, shows error to user
2. **Command Response** - Not received/processed by Tom AI client
3. **User Feedback** - Shows "couldn't connect" even though connection succeeded

---

## Evidence from Railway Logs

### Successful Connection (Relay Logs)
```
[Tom Talk to Figma MCP socket] New client connected
[Tom Talk to Figma MCP socket] Received message from client: {"id":"b4aea9a0-1c6f-4c50-b771-fd33d210539b","type":"join","channel":"default"}
[Tom Talk to Figma MCP socket] Sending message to client: b4aea9a0-1c6f-4c50-b771-fd33d210539b
```
✅ Relay receives join request
✅ Relay confirms join

### False Error (MCP Server Logs)
```
[RelayClient] Failed to join channel: 92 | channel: channelName
error: Join channel request timed out
  at <anonymous> (/app/dist/server.js:97:20)
```
❌ Tom AI shows "Join channel request timed out"
❌ User sees "couldn't connect to Figma"

### But Reality: Command Succeeded!
- Frame created in Figma ✅
- Plugin status shows ONLINE ✅
- Broadcast messages flowing ✅

---

## Root Cause Analysis

### Issue #1: Join Channel Timeout Logic

**Location:** `lib/ai/tools/figma-connect.ts` (or similar REST client file)

**Problem:**
```typescript
// Current (broken) logic:
const timeout = setTimeout(() => {
  reject(new Error("Join channel request timed out"));
}, 5000);
```

**Why it fails:**
- Relay sends join confirmation as broadcast message: `"Joined channel: default"`
- Client expects response with specific `id` field
- Client doesn't recognize broadcast as valid join confirmation
- Timeout fires even though join succeeded

**Expected flow:**
```
Tom → {type: "join", channel: "default", id: "xxx"}
Relay → "Joined channel: default" (broadcast string)
Relay → {id: "xxx", result: "Connected to channel: default"}
```

**Current client behavior:**
```
Tom → sends join request
Tom → waits for {id: "xxx", ...}
Tom → receives "Joined channel: default" string
Tom → doesn't match expected format
Tom → timeout after 5s → ERROR
```

### Issue #2: Command Response Handling

**Problem:**
- Plugin sends responses back through relay
- Tom AI client doesn't listen for/process these responses
- Shows error even when command succeeds

**Expected flow:**
```
Tom → {type: "message", channel: "default", message: {type: "create_frame", params: {...}}}
Relay → broadcasts to Plugin
Plugin → executes command
Plugin → sends {type: "message", channel: "default", message: {id: "...", result: {...}}}
Relay → forwards to Tom
Tom → ❌ doesn't process this response
```

---

## Fix Plan

### File to Modify: `lib/ai/tools/figma-connect.ts`

This file contains the `figma-connect` tool used by Tom AI to communicate with Figma.

### Fix #1: Improve Join Channel Logic

**Before:**
```typescript
const timeout = setTimeout(() => {
  reject(new Error("Join channel request timed out"));
}, 5000);
```

**After:**
```typescript
// Accept multiple join confirmation formats
let joinConfirmed = false;

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  // Format 1: Broadcast string "Joined channel: {name}"
  if (typeof data === 'string' && data.includes('Joined channel:')) {
    joinConfirmed = true;
    clearTimeout(timeout);
    resolve();
  }

  // Format 2: Object with id and result
  if (data.id === requestId && data.result) {
    joinConfirmed = true;
    clearTimeout(timeout);
    resolve();
  }
});

const timeout = setTimeout(() => {
  if (!joinConfirmed) {
    reject(new Error("Join channel request timed out"));
  }
}, 10000); // Increase to 10s for safety
```

### Fix #2: Add Response Handler for Commands

**Add after WebSocket connection:**
```typescript
// Store pending command requests
const pendingCommands = new Map<string, {resolve: Function, reject: Function}>();

// Handle incoming messages from relay/plugin
ws.addEventListener('message', (event) => {
  try {
    const payload = JSON.parse(event.data);
    console.log('[Tom AI] Received from relay:', payload);

    // Handle broadcast messages (responses from plugin)
    if (payload.type === 'broadcast' && payload.message) {
      const message = payload.message;

      // Check if this is a response to our command
      if (message.id && pendingCommands.has(message.id)) {
        const {resolve, reject} = pendingCommands.get(message.id);
        pendingCommands.delete(message.id);

        if (message.error) {
          reject(new Error(message.error));
        } else if (message.result) {
          resolve(message.result);
        } else {
          resolve(message);
        }
      }
    }

    // Handle direct responses (with matching id)
    if (payload.id && pendingCommands.has(payload.id)) {
      const {resolve, reject} = pendingCommands.get(payload.id);
      pendingCommands.delete(payload.id);

      if (payload.error) {
        reject(new Error(payload.error));
      } else {
        resolve(payload.result || payload);
      }
    }
  } catch (error) {
    console.error('[Tom AI] Error processing message:', error);
  }
});
```

### Fix #3: Send Commands with Proper Structure

**Before (if incorrect):**
```typescript
ws.send(JSON.stringify({
  type: "create_frame",
  params: {...}
}));
```

**After (correct format for relay):**
```typescript
const commandId = generateId();

// Store promise for response handling
const commandPromise = new Promise((resolve, reject) => {
  pendingCommands.set(commandId, {resolve, reject});

  // Timeout after 15 seconds
  setTimeout(() => {
    if (pendingCommands.has(commandId)) {
      pendingCommands.delete(commandId);
      reject(new Error("Command execution timed out"));
    }
  }, 15000);
});

// Send command through relay
ws.send(JSON.stringify({
  type: "message",
  channel: "default",
  message: {
    type: "create_frame",
    id: commandId,
    params: {...}
  }
}));

// Wait for response
const result = await commandPromise;
return result;
```

### Fix #4: Better Error Messages

**Current (bad UX):**
```typescript
return "I'm sorry, but I couldn't connect to Figma. Here are some steps to troubleshoot:";
```

**After (better UX):**
```typescript
// If join succeeds but command fails
if (joinSucceeded) {
  return `Connected to Figma successfully! However, the command "${commandType}" encountered an issue: ${error.message}`;
}

// If join fails
return "Couldn't establish connection to Figma relay. Please check:\n1. Figma plugin is running\n2. Plugin shows ONLINE status\n3. Relay server is accessible";
```

---

## Testing Plan

### Test 1: Join Channel
```bash
# From Tom AI admin chat:
"Connect Tom to Figma and show I'm here!"

# Expected result (after fix):
✅ "Connected to Figma successfully!"
✅ No timeout errors
✅ User sees confirmation message
```

### Test 2: Create Frame
```bash
# From Tom AI admin chat:
"Create a red frame 400x300 called Test Frame"

# Expected result (after fix):
✅ Frame created in Figma
✅ Tom AI responds with: "Created frame 'Test Frame' successfully"
✅ No false errors
```

### Test 3: Multiple Commands
```bash
# From Tom AI admin chat:
"Create 3 frames: Header, Content, Footer"

# Expected result (after fix):
✅ All 3 frames created
✅ Tom AI confirms each creation
✅ No timeouts
```

---

## Implementation Steps

### Step 1: Locate the File
```bash
cd ~/tom-chat-sdk
find . -name "figma-connect.ts" -o -name "*figma*.ts" | grep -v node_modules
```

Expected location: `lib/ai/tools/figma-connect.ts`

### Step 2: Read Current Implementation
```bash
cat lib/ai/tools/figma-connect.ts
```

Identify:
- [ ] WebSocket connection logic
- [ ] Join channel request/response handling
- [ ] Command sending logic
- [ ] Response processing (if exists)
- [ ] Error handling

### Step 3: Apply Fixes
1. Add message handler for broadcast responses
2. Create `pendingCommands` Map for tracking requests
3. Update join logic to accept multiple confirmation formats
4. Add proper command ID generation
5. Implement response matching (by ID)
6. Improve timeout handling (increase to 10-15s)
7. Update error messages for better UX

### Step 4: Test Locally
```bash
# Terminal 1: Ensure relay is running
# (Railway production relay is already running)

# Terminal 2: Start Tom AI dev server
cd ~/tom-chat-sdk
npm run dev  # or pnpm dev

# Terminal 3: Open Figma with plugin running

# Browser: Navigate to Tom AI admin chat
# Test: "Connect Tom to Figma and show I'm here!"
```

### Step 5: Verify Logs
Check Railway logs for:
- ✅ No "Join channel request timed out" errors
- ✅ Command responses received by Tom AI
- ✅ Successful broadcast message processing

### Step 6: Deploy to Vercel
```bash
git add lib/ai/tools/figma-connect.ts
git commit -m "fix: properly handle Figma relay responses and eliminate false timeout errors"
git push
```

Vercel will auto-deploy.

---

## Success Criteria

### Before Fix:
- ❌ Tom AI shows "couldn't connect" even when connection succeeds
- ❌ User sees errors despite Figma commands working
- ❌ No feedback on successful frame creation
- ❌ False timeout errors in Railway logs

### After Fix:
- ✅ Tom AI confirms successful connection
- ✅ User sees "Connected to Figma successfully!"
- ✅ Command responses displayed to user ("Frame created")
- ✅ No false timeout errors
- ✅ Railway logs show clean message flow
- ✅ User experience matches actual functionality

---

## Related Files

### Tom Chat SDK Repository
- `lib/ai/tools/figma-connect.ts` - Main file to fix
- `lib/ai/tools/index.ts` - Exports figma-connect tool (may need type updates)
- `.env` or `vercel.json` - Environment variables (FIGMA_SOCKET_URL, etc.)

### Tom to Figma MCP Repository (Already Fixed)
- ✅ `src/cursor_mcp_plugin/ui.html` - Broadcast handling added
- ✅ `src/cursor_mcp_plugin/code.js` - Command execution working
- ✅ `src/socket.ts` - Relay broadcasting correctly

---

## Environment Variables

Ensure these are set in Tom Chat SDK (Vercel):

```bash
FIGMA_SOCKET_URL="wss://relay-production-bcbf.up.railway.app"
FIGMA_SOCKET_AUTH_TOKEN="5499da7c03663e72ab6d00589c1ac174eab791a2cff129f8bad43fef94a49311"
FIGMA_SOCKET_CHANNEL="default"
```

---

## Debugging Tips

### Railway Logs to Monitor:
```bash
# Relay service logs:
[Tom Talk to Figma MCP socket] New client connected
[Tom Talk to Figma MCP socket] Received message from client: ...
[Tom Talk to Figma MCP socket] Broadcasting message to client: ...

# MCP Server logs:
[RelayClient] Connected to relay
[RelayClient] Joined channel: default
[INFO] Sending command to Figma: ...
[DEBUG] Received message: ...
```

### Browser Console (Tom AI):
```javascript
// Add debug logging in figma-connect.ts:
console.log('[Tom AI] WebSocket state:', ws.readyState);
console.log('[Tom AI] Sending command:', command);
console.log('[Tom AI] Received response:', response);
```

### Figma Plugin Console:
```javascript
// Check ui.html logs:
[DEBUG] Received message: {...}
[INFO] Executing broadcast command: create_frame
[DEBUG] Sending response: {...}
```

---

## Risk Assessment

**Risk Level:** Low

**Reasons:**
1. Only modifying client-side code (no server changes)
2. Relay and plugin already working correctly
3. Changes are additive (adding response handling)
4. Can rollback instantly via git revert
5. Vercel deployment is instant

**Mitigation:**
- Test locally before deploying
- Monitor Railway logs after deployment
- Keep Figma plugin open during testing
- Have rollback plan ready

---

## Conclusion

The infrastructure is **working perfectly** (relay, plugin, broadcasts). The **only issue** is Tom AI's client-side response handling.

**Estimated Time:** 30-60 minutes
- 10 min: Locate and read current code
- 20 min: Implement fixes
- 15 min: Test locally
- 10 min: Deploy and verify
- 5 min: Update documentation

**Next Steps:**
1. Switch to `tom-chat-sdk` repository
2. Locate `lib/ai/tools/figma-connect.ts`
3. Apply fixes from this plan
4. Test with "Connect Tom to Figma and show I'm here!"
5. Deploy to Vercel
6. Celebrate! 🎉
