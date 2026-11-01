# Document 09 — API Reference

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Overview

The REST API provides administration, monitoring, and configuration endpoints.

Base URL: `http://localhost:3000/api/v1`

Authentication: Required before production exposure (see doc 16).

All responses are JSON unless otherwise noted.

---

## 2. System Endpoints

### GET /health

Returns application health status.

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-11-01T06:22:17.123Z",
  "tcp": { "listening": true, "port": 9876 },
  "db": { "connected": true },
  "archive": { "status": "ok", "failureCount": 0 }
}
```

### GET /api/v1/status

Returns detailed system status.

---

## 3. Session Endpoints

### GET /api/v1/sessions

List all FIX sessions (active and historical).

Query params: `status`, `limit`, `offset`

### GET /api/v1/sessions/:id

Get session detail by ID.

### POST /api/v1/sessions/:id/logout

Initiate logout on a specified session.

### GET /api/v1/sessions/:id/messages

Get paginated message list for a session.

---

## 4. Message Archive Endpoints

### GET /api/v1/messages

Search messages across all sessions.

Query params: `sessionId`, `direction`, `msgType`, `msgSeqNum`, `from`, `to`, `limit`, `offset`

### GET /api/v1/messages/:archiveId

Get message detail and decoded content.

### GET /api/v1/messages/:archiveId/raw

Download raw FIX bytes for a message.

---

## 5. Order Endpoints

### GET /api/v1/orders

List orders.

Query params: `sessionId`, `symbol`, `ordStatus`, `limit`, `offset`

### GET /api/v1/orders/:id

Get order detail.

### GET /api/v1/orders/:id/executions

Get executions for an order.

---

## 6. Scenario Endpoints

### GET /api/v1/scenarios

List all scenarios.

### POST /api/v1/scenarios

Create a scenario.

### PUT /api/v1/scenarios/:id

Update a scenario.

### DELETE /api/v1/scenarios/:id

Delete a scenario.

### POST /api/v1/scenarios/:id/activate

Activate a scenario.

### POST /api/v1/scenarios/:id/deactivate

Deactivate a scenario.

---

## 7. Configuration Endpoints

### GET /api/v1/config/sessions

List session configurations.

### POST /api/v1/config/sessions

Create a session configuration.

### PUT /api/v1/config/sessions/:id

Update a session configuration.

### GET /api/v1/config/system

Get system configuration values (non-secret).

### PUT /api/v1/config/system/:key

Update a system configuration value.

### POST /api/v1/config/mode

Change operating mode (PROTOCOL / EXCHANGE).

---

## 8. Error Responses

All errors return:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

HTTP status codes:
- 400: Validation error
- 401: Unauthorized
- 404: Not found
- 409: Conflict
- 500: Internal server error
