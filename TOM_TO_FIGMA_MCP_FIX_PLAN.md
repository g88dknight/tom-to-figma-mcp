# План исправлений для tom-to-figma-mcp

## Проблема

Tom успешно отправляет команды через relay, но **Figma plugin не обрабатывает их и не отправляет ответ обратно**.

### Текущее поведение (из логов):

✅ **Tom → Relay** - работает
```javascript
// Tom отправляет:
{
  type: "message",
  channel: "default",
  message: {
    type: "create_frame",
    params: {...}
  }
}
```

✅ **Relay → Figma Plugin** - работает
```javascript
// Relay транслирует:
{
  type: "broadcast",
  message: {
    type: "create_frame",
    params: {...}
  },
  sender: "User",
  channel: "default"
}
```

❌ **Figma Plugin обработка** - НЕ РАБОТАЕТ
- Plugin получает broadcast сообщение
- Plugin логирует: `[INFO] Received broadcast message: {...}`
- **НО не обрабатывает команду и не отвечает!**

❌ **Tom timeout** - 10 секунд ожидания без ответа

---

## Анализ кода tom-to-figma-mcp

### 1. Relay сервер (`src/socket.ts`)

**Что делает:**
- Получает `type: "message"` от Tom
- Транслирует всем клиентам в канале как `type: "broadcast"`

```typescript
// Строки 10047-10057
if (data.type === "message") {
  channelClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "broadcast",
        message: data.message,  // {type: "create_frame", params: {...}}
        sender: client === ws ? "You" : "User",
        channel: channelName
      }));
    }
  });
}
```

**Статус:** ✅ Работает корректно

---

### 2. Figma Plugin UI (`src/cursor_mcp_plugin/ui.html`)

**Обработчик WebSocket сообщений (строки 5228-5261):**

```javascript
state.socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Received message:", data);

  if (data.type === "system") {
    // Обрабатывает системные сообщения (join, etc.)
  } else if (data.type === "error") {
    // Обрабатывает ошибки
  }

  handleSocketMessage(data);  // <-- Передаёт дальше
};
```

**Функция `handleSocketMessage` (строки 5291-5332):**

```javascript
async function handleSocketMessage(payload) {
  const data = payload.message;  // <-- ПРОБЛЕМА! Для broadcast это undefined!

  // Проверяет наличие data.id и data.command
  if (data.command) {
    // Отправляет команду в plugin code
    parent.postMessage({
      pluginMessage: {
        type: "execute-command",
        id: data.id,
        command: data.command,
        params: data.params
      }
    }, "*");
  }
}
```

**❌ ПРОБЛЕМА #1:**
Для `broadcast` сообщений:
- `payload = {type: "broadcast", message: {...}, sender: "User", channel: "default"}`
- `data = payload.message = {type: "create_frame", params: {...}}`
- `data.command` - **undefined!** (есть только `data.type`)

**Решение:**
Нужно проверять `data.type` вместо `data.command`:

```javascript
async function handleSocketMessage(payload) {
  // Для broadcast сообщений
  if (payload.type === "broadcast") {
    const data = payload.message;

    if (data.type) {  // <-- Проверяем type, не command!
      parent.postMessage({
        pluginMessage: {
          type: "execute-command",
          id: generateId(),  // <-- Генерируем ID
          command: data.type,  // <-- "create_frame"
          params: data.params
        }
      }, "*");
    }
    return;
  }

  // Для прямых команд (существующая логика)
  const data = payload.message;
  if (data && data.command) {
    parent.postMessage({
      pluginMessage: {
        type: "execute-command",
        id: data.id,
        command: data.command,
        params: data.params
      }
    }, "*");
  }
}
```

---

### 3. Figma Plugin Code (`src/cursor_mcp_plugin/code.js`)

**Обработчик сообщений от UI (строки 192-222):**

```javascript
figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case "execute-command":
      try {
        const result = await handleCommand(msg.command, msg.params);
        // Отправляет результат обратно в UI
        figma.ui.postMessage({
          type: "command-result",
          id: msg.id,
          result
        });
      } catch (error) {
        figma.ui.postMessage({
          type: "command-error",
          id: msg.id,
          error: error.message || "Error executing command"
        });
      }
      break;
  }
};
```

**Функция `handleCommand` (строки 248-255):**

```javascript
async function handleCommand(command, params) {
  switch (command) {
    case "create_frame":
      return await createFrame(params);  // <-- ✅ Обработчик существует!
    // ... другие команды
  }
}
```

**Статус:** ✅ Обработчик команды существует

**❌ ПРОБЛЕМА #2:**
UI получает результат через `figma.ui.postMessage()`, но **не отправляет его обратно в WebSocket!**

---

### 4. UI обработка результатов команд

**Текущий код (строка 5474):**

```javascript
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;

  if (msg.type === "command-result") {
    // ❌ НИЧЕГО НЕ ДЕЛАЕТ с результатом!
  }

  if (msg.type === "command-error") {
    // ❌ НИЧЕГО НЕ ДЕЛАЕТ с ошибкой!
  }

  if (msg.type === "notify") {
    // Показывает уведомление
  }

  if (msg.type === "command_progress") {
    updateProgressUI(msg);
  }
};
```

**Решение:**
Нужно добавить отправку результата обратно в WebSocket:

```javascript
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;

  if (msg.type === "command-result") {
    // ✅ Отправляем успешный результат обратно
    sendSuccessResponse(msg.id, msg.result);
  }

  if (msg.type === "command-error") {
    // ✅ Отправляем ошибку обратно
    sendErrorResponse(msg.id, msg.error);
  }

  // ... остальная логика
};
```

---

## План изменений

### Файл: `src/cursor_mcp_plugin/ui.html`

#### Изменение 1: Обработка broadcast сообщений

**Локация:** Функция `handleSocketMessage` (строки 5291-5332)

**Было:**
```javascript
async function handleSocketMessage(payload) {
  const data = payload.message;

  if (data.id && state.pendingRequests.has(data.id)) {
    // ... обработка ответов
  }

  if (data.command) {
    parent.postMessage({
      pluginMessage: {
        type: "execute-command",
        id: data.id,
        command: data.command,
        params: data.params
      }
    }, "*");
  }
}
```

**Должно стать:**
```javascript
async function handleSocketMessage(payload) {
  console.log("[DEBUG] Received message:", JSON.stringify(payload));

  // Handle broadcast messages from relay
  if (payload.type === "broadcast") {
    const data = payload.message;
    console.log("[DEBUG] Processing broadcast:", JSON.stringify(data));

    if (data.type) {
      const commandId = generateId();
      console.log(`[INFO] Executing broadcast command: ${data.type}, id: ${commandId}`);

      // Store command ID to track response
      state.broadcastCommands = state.broadcastCommands || new Map();
      state.broadcastCommands.set(commandId, {
        originalData: payload,
        timestamp: Date.now()
      });

      parent.postMessage({
        pluginMessage: {
          type: "execute-command",
          id: commandId,
          command: data.type,
          params: data.params
        }
      }, "*");
    }
    return;
  }

  // Handle direct command responses (existing logic)
  const data = payload.message;

  if (data && data.id && state.pendingRequests.has(data.id)) {
    const { resolve, reject } = state.pendingRequests.get(data.id);
    state.pendingRequests.delete(data.id);

    if (data.error) {
      reject(new Error(data.error));
    } else {
      resolve(data.result);
    }
    return;
  }

  // Handle direct commands (existing logic for MCP server)
  if (data && data.command) {
    parent.postMessage({
      pluginMessage: {
        type: "execute-command",
        id: data.id,
        command: data.command,
        params: data.params
      }
    }, "*");
  }
}
```

#### Изменение 2: Отправка результатов обратно в WebSocket

**Локация:** Функция `window.onmessage` (строка 5474+)

**Найти блок:**
```javascript
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;

  if (msg.type === "command-result") {
    // ... возможно пусто или минимальная обработка
  }

  if (msg.type === "command-error") {
    // ... возможно пусто или минимальная обработка
  }
```

**Добавить:**
```javascript
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;

  if (msg.type === "command-result") {
    console.log(`[INFO] Command completed successfully:`, msg.id);

    // Send result back to WebSocket
    if (state.connected && state.socket) {
      sendSuccessResponse(msg.id, msg.result);
    }

    // Clean up broadcast command tracking
    if (state.broadcastCommands && state.broadcastCommands.has(msg.id)) {
      console.log(`[INFO] Broadcast command completed:`, msg.id);
      state.broadcastCommands.delete(msg.id);
    }
  }

  if (msg.type === "command-error") {
    console.error(`[ERROR] Command failed:`, msg.id, msg.error);

    // Send error back to WebSocket
    if (state.connected && state.socket) {
      sendErrorResponse(msg.id, msg.error);
    }

    // Clean up broadcast command tracking
    if (state.broadcastCommands && state.broadcastCommands.has(msg.id)) {
      console.log(`[INFO] Broadcast command failed:`, msg.id);
      state.broadcastCommands.delete(msg.id);
    }
  }

  // ... остальная существующая логика
};
```

#### Изменение 3: Инициализация state.broadcastCommands

**Локация:** Начало скрипта, где определяется `state` объект (около строки 5044)

**Найти:**
```javascript
const state = {
  socket: null,
  connected: false,
  serverUrl: DEFAULT_SOCKET_URL,
  authToken: "",
  channel: DEFAULT_CHANNEL,
  pendingRequests: new Map()
};
```

**Добавить:**
```javascript
const state = {
  socket: null,
  connected: false,
  serverUrl: DEFAULT_SOCKET_URL,
  authToken: "",
  channel: DEFAULT_CHANNEL,
  pendingRequests: new Map(),
  broadcastCommands: new Map()  // <-- Добавить эту строку
};
```

---

## Ожидаемый результат после изменений

### Поток работы:

1. **Tom → Relay**
   ```javascript
   {type: "message", channel: "default", message: {type: "create_frame", params: {...}}}
   ```

2. **Relay → Figma Plugin UI**
   ```javascript
   {type: "broadcast", message: {type: "create_frame", params: {...}}, sender: "User", channel: "default"}
   ```

3. **✅ Plugin UI обрабатывает broadcast**
   - Распознаёт `payload.type === "broadcast"`
   - Извлекает `data.type` как команду
   - Генерирует ID и отправляет в plugin code

4. **Plugin Code → UI (результат)**
   ```javascript
   {type: "command-result", id: "...", result: {...}}
   ```

5. **✅ UI отправляет результат в WebSocket**
   ```javascript
   {
     type: "message",
     channel: "default",
     message: {
       id: "...",
       result: {...}
     }
   }
   ```

6. **Relay → Tom**
   ```javascript
   {
     type: "broadcast",
     message: {id: "...", result: {...}},
     sender: "User",
     channel: "default"
   }
   ```

7. **✅ Tom получает ответ и не таймаутится!**

---

## Дополнительные улучшения (опционально)

### 1. Таймаут для broadcast команд

Добавить очистку зависших команд:

```javascript
// После инициализации state
setInterval(() => {
  if (!state.broadcastCommands) return;

  const now = Date.now();
  const TIMEOUT = 30000; // 30 секунд

  for (const [id, data] of state.broadcastCommands.entries()) {
    if (now - data.timestamp > TIMEOUT) {
      console.warn(`[WARN] Broadcast command timeout: ${id}`);
      state.broadcastCommands.delete(id);
    }
  }
}, 5000);
```

### 2. Улучшенное логирование

Добавить более детальные логи для отладки:

```javascript
function sendSuccessResponse(id, result) {
  if (!state.connected || !state.socket) {
    console.error("[ERROR] Cannot send response: socket not connected");
    return;
  }

  console.log(`[INFO] Sending success response for command ${id}`);
  console.log(`[DEBUG] Response data:`, JSON.stringify(result));

  state.socket.send(JSON.stringify({
    type: "message",
    channel: state.channel,
    message: {
      id,
      result
    }
  }));
}
```

---

## Проверка после изменений

### 1. Локальное тестирование

```bash
# В репозитории tom-to-figma-mcp
bun run src/socket.ts
```

Открыть Figma plugin и проверить консоль:
- `[DEBUG] Received message:` - должен показывать broadcast
- `[INFO] Executing broadcast command: create_frame` - команда обрабатывается
- `[INFO] Command completed successfully` - результат получен
- `[INFO] Sending success response` - ответ отправлен

### 2. Проверка логов Railway

После деплоя на Railway проверить:
- ✅ `[Tom Talk to Figma MCP socket] Received message from client: {"type":"message",...}`
- ✅ `[Tom Talk to Figma MCP socket] Broadcasting message to client`
- ✅ **НОВОЕ:** `[Tom Talk to Figma MCP socket] Received message from client: {"type":"message","channel":"default","message":{"id":"...","result":{...}}}`

### 3. Проверка логов Vercel (Tom)

- ✅ `[Figma Connect] Command sent: create_frame`
- ✅ `[Figma Connect] Received: {type: "broadcast", message: {...}, sender: "User"}`
- ✅ **НОВОЕ:** Не должно быть таймаута!
- ✅ **НОВОЕ:** `[Figma Connect] Command result: {success: true, ...}`

---

## Резюме

**3 ключевых изменения в `src/cursor_mcp_plugin/ui.html`:**

1. ✅ Обработка `type: "broadcast"` сообщений
2. ✅ Извлечение команды из `data.type` вместо `data.command`
3. ✅ Отправка результатов команд обратно в WebSocket через `sendSuccessResponse()`

**Файлы для изменения:**
- `src/cursor_mcp_plugin/ui.html` - ВСЕ изменения здесь

**Файлы БЕЗ изменений:**
- `src/cursor_mcp_plugin/code.js` - уже имеет обработчик `create_frame`
- `src/socket.ts` - relay работает корректно

---

## Следующие шаги

1. Сделать изменения в `src/cursor_mcp_plugin/ui.html`
2. Протестировать локально
3. Закоммитить и задеплоить на Railway
4. Переустановить плагин в Figma (или перезапустить)
5. Проверить работу через Tom
