# Document 18 — Configuration Reference

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Environment Variables

All configuration is provided via environment variables loaded from `.env`.

### Application

| Variable | Description | Default | Required |
|---|---|---|---|
| NODE_ENV | Runtime environment (development/production/test) | development | Yes |
| APP_NAME | Application name shown in logs and UI | DSE-ME Simulator | No |
| LOG_LEVEL | Pino log level (trace/debug/info/warn/error) | info | No |
| OPERATING_MODE | Active mode: PROTOCOL or EXCHANGE | PROTOCOL | Yes |

### HTTP Server

| Variable | Description | Default | Required |
|---|---|---|---|
| HTTP_PORT | Dashboard and API port | 3000 | Yes |
| HTTP_HOST | Bind address | 0.0.0.0 | No |

### FIX TCP Server

| Variable | Description | Default | Required |
|---|---|---|---|
| FIX_TCP_PORT | FIX acceptor TCP port | 9876 | Yes |
| FIX_TCP_HOST | Bind address | 0.0.0.0 | No |

### FIX Session Defaults

| Variable | Description | Default | Required |
|---|---|---|---|
| FIX_SENDER_COMP_ID | Simulator SenderCompID | DSESIM | Yes |
| FIX_TARGET_COMP_ID | Expected OMS TargetCompID | OMSFIRM | Yes |
| FIX_BEGIN_STRING | Session protocol version | FIXT.1.1 | Yes |
| FIX_DEFAULT_APPL_VER_ID | Application version ID (UNVERIFIED: confirm with DSE) | 7 | Yes |
| FIX_HEARTBEAT_INTERVAL | Heartbeat interval in seconds | 30 | Yes |
| FIX_MAX_LATENCY | SendingTime accuracy check in seconds | 120 | No |
| FIX_HEARTBEAT_TOLERANCE | Extra seconds before sending Test Request | 10 | No |
| FIX_LOGOUT_RESPONSE_TIMEOUT | Seconds to wait for Logout response | 10 | No |

### Database

| Variable | Description | Default | Required |
|---|---|---|---|
| DB_HOST | MySQL host | localhost | Yes |
| DB_PORT | MySQL port | 3306 | No |
| DB_NAME | Database name | dse_me_simulator | Yes |
| DB_USER | Database user | — | Yes |
| DB_PASSWORD | Database password | — | Yes |
| DB_POOL_MIN | Connection pool minimum | 2 | No |
| DB_POOL_MAX | Connection pool maximum | 10 | No |

### Archive

| Variable | Description | Default | Required |
|---|---|---|---|
| ARCHIVE_BASE_DIR | Base directory for FIX archives | storage/fix-archive | Yes |
| ARCHIVE_FAIL_THRESHOLD | Max consecutive archive failures before shutdown | 10 | No |
| ARCHIVE_ENABLE_SHA256 | Compute SHA-256 hash per message | false | No |
| ARCHIVE_RETENTION_DAYS | Days to retain archive files (0=never delete) | 0 | No |

---

## 2. Per-Session Configuration

Per-session configuration is stored in the `SessionConfigurations` table and manageable via the admin dashboard.

See `docs/08-Database-Design.md` for the full table schema.

---

## 3. npm Scripts

| Script | Description |
|---|---|
| `npm start` | Start in production mode |
| `npm run dev` | Start in development mode with nodemon |
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests |
| `npm run test:integration` | Run integration tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run db:migrate` | Run all pending migrations |
| `npm run db:migrate:undo` | Undo last migration |
| `npm run db:migration:create` | Create a new migration file |
| `npm run lint` | Run ESLint |
