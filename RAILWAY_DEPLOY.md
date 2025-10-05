# Railway Deployment Guide for Tom Talk to Figma MCP

Этот проект требует развертывания **двух отдельных сервисов** на Railway:

1. **WebSocket Relay** - транспортный relay для коммуникации
2. **MCP Server** - основной сервер с MCP инструментами

## Предварительные требования

- Установлен [Railway CLI](https://docs.railway.app/guides/cli) v4.8.0+
- Авторизация в Railway: `railway login`
- Git репозиторий проекта

## Шаг 1: Создание проекта Railway

```bash
# Инициализировать Railway проект (интерактивно)
railway init

# Выбрать workspace и создать новый проект
# Имя проекта: tom-talk-to-figma-mcp
```

Это создаст файл `railway.toml` в корне проекта.

## Шаг 2: Развертывание WebSocket Relay

### 2.1 Создать сервис relay

В веб-интерфейсе Railway (https://railway.app):
- Откройте созданный проект
- Нажмите **"+ New"** → **"Empty Service"**
- Назовите сервис: `relay`

Или через CLI:
```bash
railway service create relay
```

### 2.2 Настроить переменные окружения для relay

В настройках сервиса `relay` добавьте:

| Variable | Value | Description |
|----------|-------|-------------|
| `FIGMA_SOCKET_HOST` | `0.0.0.0` | Bind address для Railway |
| `FIGMA_SOCKET_PORT` | `3055` | WebSocket port |
| `FIGMA_SOCKET_AUTH_TOKEN` | `your-secure-token-123` | Общий токен авторизации (сгенерируйте безопасный) |
| `ALLOWED_ORIGINS` | `*` | CORS policy (или список доменов через запятую) |

### 2.3 Настроить команду запуска relay

**Вариант A: Через Procfile (рекомендуется)**

Railway автоматически обнаружит `Procfile` в корне проекта:
```procfile
relay: bun run src/socket.ts --host 0.0.0.0 --port ${PORT:-3055}
```

**Вариант B: Через настройки Railway**

В настройках сервиса `relay`:
- Settings → Deploy → Custom Start Command:
  ```bash
  bun run src/socket.ts --host 0.0.0.0 --port ${PORT:-3055}
  ```

### 2.4 Деплой relay

```bash
# Переключиться на сервис relay
railway service relay

# Задеплоить код
railway up

# Или через git (если настроен GitHub integration)
git push railway main
```

### 2.5 Получить публичный URL relay

После успешного деплоя:
```bash
# Сгенерировать публичный домен
railway domain

# Получить URL (будет вида: relay.railway.app)
railway open
```

Скопируйте полный WebSocket URL: `wss://your-relay-domain.railway.app`

---

## Шаг 3: Развертывание MCP Server

### 3.1 Создать сервис mcp-server

В веб-интерфейсе Railway:
- Нажмите **"+ New"** → **"Empty Service"**
- Назовите сервис: `mcp-server`

Или через CLI:
```bash
railway service create mcp-server
```

### 3.2 Настроить переменные окружения для MCP server

В настройках сервиса `mcp-server` добавьте:

| Variable | Value | Description |
|----------|-------|-------------|
| `PORT` | `3000` | HTTP порт MCP сервера |
| `HTTP_HOST` | `0.0.0.0` | Bind address |
| `FIGMA_SOCKET_URL` | `wss://your-relay-domain.railway.app` | **URL relay из шага 2.5** |
| `FIGMA_SOCKET_CHANNEL` | `default` | Канал по умолчанию |
| `FIGMA_SOCKET_AUTH_TOKEN` | `your-secure-token-123` | **Тот же токен, что и в relay** |
| `ALLOWED_ORIGINS` | `*` | CORS policy |
| `ALLOWED_HOSTS` | `your-mcp-domain.railway.app` | Разрешенные хосты (домен MCP сервиса) |

### 3.3 Настроить Docker-based деплой

Railway автоматически обнаружит `Dockerfile` и `railway.json`:

**railway.json** (уже создан):
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "bun run dist/server.js --mode=http",
    "healthcheckPath": "/",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 3.4 Деплой MCP server

```bash
# Переключиться на сервис mcp-server
railway service mcp-server

# Задеплоить
railway up

# Или через git
git push railway main
```

### 3.5 Получить публичный URL MCP server

```bash
# Сгенерировать публичный домен
railway domain

# Получить URL
railway open
```

---

## Шаг 4: Проверка работоспособности

### 4.1 Проверить relay

```bash
# WebSocket endpoint должен отвечать
curl -I https://your-relay-domain.railway.app

# Ожидаемый ответ: 200 OK с текстом "Tom Talk to Figma MCP socket relay"
```

### 4.2 Проверить MCP server

```bash
# HTTP endpoint должен работать
curl https://your-mcp-domain.railway.app

# Проверить логи
railway logs --service mcp-server

# Проверить relay логи
railway logs --service relay
```

### 4.3 Тестирование через Figma Plugin

1. Откройте Figma плагин UI
2. В настройках WebSocket введите: `wss://your-relay-domain.railway.app`
3. Channel: `default`
4. Нажмите "Connect"
5. Проверьте статус подключения

---

## Управление сервисами

### Просмотр логов

```bash
# Логи relay
railway logs --service relay

# Логи MCP server
railway logs --service mcp-server

# Следить за логами в реальном времени
railway logs --service mcp-server --follow
```

### Обновление переменных окружения

```bash
# Через CLI
railway variables set FIGMA_SOCKET_URL=wss://new-url.railway.app --service mcp-server

# Или через веб-интерфейс Railway
```

### Рестарт сервисов

```bash
# Рестарт конкретного сервиса
railway service relay
railway redeploy

railway service mcp-server
railway redeploy
```

### Удаление сервисов

```bash
# Удалить сервис
railway service delete relay

# Удалить весь проект
railway project delete
```

---

## Архитектура деплоя

```
┌─────────────────┐
│  IDE/MCP Client │
└────────┬────────┘
         │ HTTP/SSE
         │
         v
┌─────────────────────────┐
│   MCP Server Service    │
│  (mcp-server.railway.app)│
│  Port: 3000             │
│  ENV:                   │
│  - FIGMA_SOCKET_URL     │
│  - FIGMA_SOCKET_TOKEN   │
└────────┬────────────────┘
         │ WebSocket (WSS)
         │
         v
┌─────────────────────────┐
│  WebSocket Relay Service│
│  (relay.railway.app)    │
│  Port: 3055             │
│  ENV:                   │
│  - FIGMA_SOCKET_TOKEN   │
│  - ALLOWED_ORIGINS      │
└────────┬────────────────┘
         │ WebSocket
         │
         v
┌─────────────────────────┐
│    Figma Plugin         │
│  (browser-based)        │
└─────────────────────────┘
```

---

## Troubleshooting

### Ошибка: "403 Forbidden"

**Причина:** CORS policy блокирует origin.

**Решение:** Добавьте ваш origin в `ALLOWED_ORIGINS` для relay сервиса:
```bash
railway variables set ALLOWED_ORIGINS="https://figma.com,https://www.figma.com" --service relay
```

### Ошибка: "Connection refused"

**Причина:** Relay недоступен или неправильный URL.

**Решение:**
1. Проверьте логи relay: `railway logs --service relay`
2. Проверьте публичный домен relay
3. Убедитесь, что `FIGMA_SOCKET_URL` использует `wss://` (не `ws://`)

### Ошибка: "Unauthorized"

**Причина:** Несовпадение токенов авторизации.

**Решение:** Убедитесь, что `FIGMA_SOCKET_AUTH_TOKEN` одинаковый в обоих сервисах.

### Plugin не подключается

**Причина:** Relay не слушает на `0.0.0.0` или неправильный порт.

**Решение:**
- Проверьте `FIGMA_SOCKET_HOST=0.0.0.0` в relay
- Проверьте логи relay на наличие "Listening on 0.0.0.0:..."

---

## Дополнительные настройки

### Мониторинг

Railway предоставляет встроенный мониторинг:
- CPU usage
- Memory usage
- Network traffic
- Request logs

Доступ: Project → Service → Metrics

### Scaling

Railway автоматически масштабирует сервисы по требованию. Для ручной настройки:
- Settings → Resources → Memory/CPU limits

### Custom Domains

Для использования собственных доменов:
1. Settings → Domains → Add Custom Domain
2. Настройте CNAME записи в вашем DNS провайдере
3. Обновите `ALLOWED_HOSTS` и `ALLOWED_ORIGINS`

---

## Полезные ссылки

- [Railway Docs](https://docs.railway.app)
- [Railway CLI Reference](https://docs.railway.app/guides/cli)
- [Tom Talk to Figma MCP GitHub](https://github.com/your-repo)
- [Figma Plugin Documentation](https://www.figma.com/plugin-docs)

---

## Безопасность

⚠️ **Важные рекомендации:**

1. **Никогда не коммитьте** реальные значения `FIGMA_SOCKET_AUTH_TOKEN`
2. Используйте сильные, случайные токены (минимум 32 символа)
3. Ограничивайте `ALLOWED_ORIGINS` конкретными доменами в production
4. Регулярно ротируйте токены авторизации
5. Используйте Railway secrets для чувствительных данных

Генерация безопасного токена:
```bash
# macOS/Linux
openssl rand -hex 32

# или
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

**Последнее обновление:** 2025-10-05
