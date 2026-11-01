# Document 08 — Database Design

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Database

- Engine: MySQL 8
- ORM: Sequelize 6.x
- Migration tool: sequelize-cli
- Schema management: Migrations only. Do NOT use `sync({ alter: true })` in production.

---

## 2. Entity Overview

| Table | Purpose | Phase |
|---|---|---|
| SessionConfigurations | FIX session configurations | Phase 1 |
| FixSessions | Active/historical FIX session instances | Phase 1 |
| FixMessageMetadata | Metadata for every archived FIX message | Phase 1 |
| Orders | Orders received from OMS | Phase 2 |
| Executions | Execution reports generated | Phase 2 |
| OrderBooks | Order book snapshots (optional) | Phase 3 |
| Securities | Security master | Phase 3 |
| TradingSessions | Exchange trading session schedules | Phase 3 |
| Scenarios | Protocol Mode scenario definitions | Phase 2 |
| ScenarioSteps | Steps within a scenario | Phase 2 |
| ScenarioExecutions | Record of scenario executions | Phase 2 |
| SystemConfigurations | Key-value configuration store | Phase 1 |
| AuditLogs | Audit trail for admin actions | Phase 1 |

---

## 3. Table Definitions

### 3.1 SessionConfigurations

Stores the configured parameters for each expected FIX session.

```sql
CREATE TABLE SessionConfigurations (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  senderCompId    VARCHAR(50) NOT NULL COMMENT 'Simulator CompID',
  targetCompId    VARCHAR(50) NOT NULL COMMENT 'OMS CompID',
  beginString     VARCHAR(20) NOT NULL DEFAULT 'FIXT.1.1',
  defaultApplVerId VARCHAR(5) NOT NULL DEFAULT '7',
  heartBtInt      SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  tcpPort         SMALLINT UNSIGNED NOT NULL DEFAULT 9876,
  resetSeqNumOnLogon TINYINT(1) NOT NULL DEFAULT 1,
  maxLatency      SMALLINT UNSIGNED NOT NULL DEFAULT 120,
  isActive        TINYINT(1) NOT NULL DEFAULT 1,
  notes           TEXT,
  createdAt       DATETIME NOT NULL,
  updatedAt       DATETIME NOT NULL,
  UNIQUE KEY uq_session_compids (senderCompId, targetCompId)
);
```

---

### 3.2 FixSessions

Tracks individual session instances (one per TCP connection lifecycle).

```sql
CREATE TABLE FixSessions (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sessionConfigId     INT UNSIGNED NOT NULL,
  sessionKey          VARCHAR(200) NOT NULL COMMENT 'BeginString:SenderCompID:TargetCompID',
  senderCompId        VARCHAR(50) NOT NULL,
  targetCompId        VARCHAR(50) NOT NULL,
  status              ENUM('DISCONNECTED','CONNECTED','ACTIVE','LOGOUT_SENT') NOT NULL DEFAULT 'DISCONNECTED',
  lastInboundSeqNum   INT UNSIGNED NOT NULL DEFAULT 0,
  lastOutboundSeqNum  INT UNSIGNED NOT NULL DEFAULT 0,
  expectedInboundSeqNum INT UNSIGNED NOT NULL DEFAULT 1,
  connectedAt         DATETIME,
  logonAt             DATETIME,
  lastMessageAt       DATETIME,
  disconnectedAt      DATETIME,
  logoutReason        VARCHAR(255),
  remoteAddress       VARCHAR(50),
  remotePort          SMALLINT UNSIGNED,
  totalInbound        INT UNSIGNED NOT NULL DEFAULT 0,
  totalOutbound       INT UNSIGNED NOT NULL DEFAULT 0,
  createdAt           DATETIME NOT NULL,
  updatedAt           DATETIME NOT NULL,
  FOREIGN KEY (sessionConfigId) REFERENCES SessionConfigurations(id),
  INDEX idx_session_key (sessionKey),
  INDEX idx_status (status)
);
```

---

### 3.3 FixMessageMetadata

Metadata for every archived FIX message. Raw bytes are in the filesystem archive.

```sql
CREATE TABLE FixMessageMetadata (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  archiveId       CHAR(36) NOT NULL COMMENT 'UUID',
  sessionId       INT UNSIGNED NOT NULL,
  direction       ENUM('INBOUND','OUTBOUND') NOT NULL,
  archivedAt      DATETIME(3) NOT NULL,
  msgType         VARCHAR(3) NOT NULL,
  msgTypeName     VARCHAR(50),
  msgSeqNum       INT UNSIGNED NOT NULL,
  senderCompId    VARCHAR(50) NOT NULL,
  targetCompId    VARCHAR(50) NOT NULL,
  beginString     VARCHAR(20) NOT NULL,
  applVerId       VARCHAR(5),
  checkSum        CHAR(3),
  bodyLength      INT UNSIGNED,
  parseStatus     ENUM('OK','INVALID_CHECKSUM','INVALID_BODYLENGTH','PARSE_ERROR','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  processingStatus ENUM('PENDING','PROCESSED','ERROR','REJECTED') NOT NULL DEFAULT 'PENDING',
  archiveFile     VARCHAR(500) NOT NULL,
  fileOffset      BIGINT UNSIGNED NOT NULL,
  messageLength   INT UNSIGNED NOT NULL,
  sha256          CHAR(64),
  notes           TEXT,
  createdAt       DATETIME NOT NULL,
  UNIQUE KEY uq_archive_id (archiveId),
  FOREIGN KEY (sessionId) REFERENCES FixSessions(id),
  INDEX idx_direction (direction),
  INDEX idx_msg_type (msgType),
  INDEX idx_msg_seq_num (msgSeqNum),
  INDEX idx_archived_at (archivedAt),
  INDEX idx_session_direction (sessionId, direction)
);
```

---

### 3.4 Orders

Order records received from OMS.

```sql
CREATE TABLE Orders (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sessionId       INT UNSIGNED NOT NULL,
  clOrdId         VARCHAR(50) NOT NULL COMMENT 'Client Order ID (tag 11)',
  origClOrdId     VARCHAR(50) COMMENT 'Original ClOrdID for replacements',
  orderId         VARCHAR(50) COMMENT 'Exchange-assigned Order ID',
  symbol          VARCHAR(20) NOT NULL,
  side            TINYINT UNSIGNED NOT NULL COMMENT '1=Buy, 2=Sell',
  orderQty        DECIMAL(18,6) NOT NULL,
  ordType         TINYINT UNSIGNED NOT NULL COMMENT '1=Market, 2=Limit',
  price           DECIMAL(18,6) COMMENT 'Null for market orders',
  timeInForce     TINYINT UNSIGNED COMMENT '0=Day, 1=GTC, 3=IOC, 4=FOK',
  ordStatus       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  cumQty          DECIMAL(18,6) NOT NULL DEFAULT 0,
  leavesQty       DECIMAL(18,6) NOT NULL,
  transactTime    DATETIME(3),
  mode            ENUM('PROTOCOL','EXCHANGE') NOT NULL,
  scenarioId      INT UNSIGNED COMMENT 'NULL if Exchange Mode',
  rawMsgArchiveId CHAR(36) COMMENT 'Reference to FixMessageMetadata.archiveId',
  createdAt       DATETIME NOT NULL,
  updatedAt       DATETIME NOT NULL,
  FOREIGN KEY (sessionId) REFERENCES FixSessions(id),
  UNIQUE KEY uq_session_clordid (sessionId, clOrdId),
  INDEX idx_symbol (symbol),
  INDEX idx_ord_status (ordStatus)
);
```

---

### 3.5 Executions

Execution report records.

```sql
CREATE TABLE Executions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  orderId         INT UNSIGNED NOT NULL,
  sessionId       INT UNSIGNED NOT NULL,
  execId          VARCHAR(50) NOT NULL COMMENT 'Unique execution ID (tag 17)',
  execType        VARCHAR(2) NOT NULL COMMENT 'FIX ExecType (tag 150)',
  ordStatus       VARCHAR(2) NOT NULL COMMENT 'FIX OrdStatus (tag 39)',
  lastQty         DECIMAL(18,6) COMMENT 'Quantity of this fill',
  lastPx          DECIMAL(18,6) COMMENT 'Price of this fill',
  cumQty          DECIMAL(18,6) NOT NULL,
  leavesQty       DECIMAL(18,6) NOT NULL,
  counterpartyOrderId INT UNSIGNED COMMENT 'Matched order (Exchange Mode)',
  transactTime    DATETIME(3) NOT NULL,
  rawMsgArchiveId CHAR(36),
  createdAt       DATETIME NOT NULL,
  FOREIGN KEY (orderId) REFERENCES Orders(id),
  FOREIGN KEY (sessionId) REFERENCES FixSessions(id),
  UNIQUE KEY uq_exec_id (execId),
  INDEX idx_order_id (orderId)
);
```

---

### 3.6 Securities

Security master for Exchange Mode.

```sql
CREATE TABLE Securities (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  symbol          VARCHAR(20) NOT NULL,
  isin            VARCHAR(20),
  name            VARCHAR(200),
  exchange        VARCHAR(20) DEFAULT 'DSE',
  currency        VARCHAR(3) DEFAULT 'BDT',
  lotSize         INT UNSIGNED DEFAULT 1,
  tickSize        DECIMAL(18,6) DEFAULT 0.01,
  priceBandUpper  DECIMAL(18,6) COMMENT 'UNVERIFIED - DSE circuit breaker rules',
  priceBandLower  DECIMAL(18,6) COMMENT 'UNVERIFIED - DSE circuit breaker rules',
  isActive        TINYINT(1) NOT NULL DEFAULT 1,
  createdAt       DATETIME NOT NULL,
  updatedAt       DATETIME NOT NULL,
  UNIQUE KEY uq_symbol (symbol)
);
```

---

### 3.7 Scenarios

Protocol Mode scenario definitions.

```sql
CREATE TABLE Scenarios (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  matchType       ENUM('SYMBOL','ANY') NOT NULL DEFAULT 'ANY',
  matchSymbol     VARCHAR(20),
  matchSide       TINYINT UNSIGNED COMMENT 'NULL = any side',
  isActive        TINYINT(1) NOT NULL DEFAULT 1,
  isDefault       TINYINT(1) NOT NULL DEFAULT 0,
  createdAt       DATETIME NOT NULL,
  updatedAt       DATETIME NOT NULL
);
```

---

### 3.8 ScenarioSteps

Steps within a scenario.

```sql
CREATE TABLE ScenarioSteps (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scenarioId      INT UNSIGNED NOT NULL,
  stepOrder       TINYINT UNSIGNED NOT NULL,
  stepType        ENUM('ACK','PARTIAL_FILL','FULL_FILL','REJECT','CANCEL_ACK','CANCEL_REJECT') NOT NULL,
  delayMs         INT UNSIGNED NOT NULL DEFAULT 0,
  fillQtyPct      DECIMAL(5,2) COMMENT 'Percentage of OrderQty to fill',
  fillQtyFixed    DECIMAL(18,6) COMMENT 'Fixed fill quantity',
  fillPriceOffset DECIMAL(18,6) DEFAULT 0 COMMENT 'Offset from limit price',
  rejectReason    VARCHAR(255),
  createdAt       DATETIME NOT NULL,
  updatedAt       DATETIME NOT NULL,
  FOREIGN KEY (scenarioId) REFERENCES Scenarios(id)
);
```

---

### 3.9 ScenarioExecutions

History of scenario executions.

```sql
CREATE TABLE ScenarioExecutions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scenarioId      INT UNSIGNED NOT NULL,
  orderId         INT UNSIGNED NOT NULL,
  startedAt       DATETIME NOT NULL,
  completedAt     DATETIME,
  status          ENUM('RUNNING','COMPLETED','ERROR') NOT NULL DEFAULT 'RUNNING',
  stepCount       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  notes           TEXT,
  createdAt       DATETIME NOT NULL,
  FOREIGN KEY (scenarioId) REFERENCES Scenarios(id),
  FOREIGN KEY (orderId) REFERENCES Orders(id)
);
```

---

### 3.10 TradingSessions

Exchange Mode trading session schedules.

```sql
CREATE TABLE TradingSessions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  tradingDate     DATE NOT NULL,
  preOpenStart    TIME,
  preOpenEnd      TIME,
  openStart       TIME,
  openEnd         TIME,
  closeTime       TIME,
  status          ENUM('SCHEDULED','PRE_OPEN','OPEN','CLOSED','HALTED') NOT NULL DEFAULT 'SCHEDULED',
  notes           TEXT,
  createdAt       DATETIME NOT NULL,
  updatedAt       DATETIME NOT NULL
);
```

---

### 3.11 SystemConfigurations

Key-value configuration store for application settings.

```sql
CREATE TABLE SystemConfigurations (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  configKey       VARCHAR(100) NOT NULL,
  configValue     TEXT,
  dataType        ENUM('STRING','INTEGER','BOOLEAN','JSON') NOT NULL DEFAULT 'STRING',
  description     VARCHAR(500),
  isSecret        TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Never expose in API if true',
  createdAt       DATETIME NOT NULL,
  updatedAt       DATETIME NOT NULL,
  UNIQUE KEY uq_config_key (configKey)
);
```

---

### 3.12 AuditLogs

Audit trail for administrator actions.

```sql
CREATE TABLE AuditLogs (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  action          VARCHAR(100) NOT NULL,
  entityType      VARCHAR(50),
  entityId        VARCHAR(50),
  performedBy     VARCHAR(100) NOT NULL DEFAULT 'system',
  details         JSON,
  ipAddress       VARCHAR(50),
  createdAt       DATETIME NOT NULL,
  INDEX idx_action (action),
  INDEX idx_created_at (createdAt)
);
```

---

## 4. Entity Relationships

```
SessionConfigurations 1---* FixSessions
FixSessions 1---* FixMessageMetadata
FixSessions 1---* Orders
Orders 1---* Executions
Scenarios 1---* ScenarioSteps
Scenarios 1---* ScenarioExecutions
Orders 1---1 ScenarioExecutions
Orders *---* Securities (by symbol)
```

---

## 5. Migration Strategy

- Use `sequelize-cli` for all schema changes.
- Never use `sync({ force: true })` or `sync({ alter: true })` in production.
- Each migration is a separate file with an `up` and `down` function.
- Run migrations: `npm run db:migrate`.
- Roll back: `npm run db:migrate:undo`.
- Create new migration: `npm run db:migration:create -- --name <name>`.

---

## 6. Indexes

Key indexes to implement:

| Table | Index | Reason |
|---|---|---|
| FixSessions | sessionKey | Fast session lookup on Logon |
| FixSessions | status | Filter active sessions |
| FixMessageMetadata | direction, msgType | Message search |
| FixMessageMetadata | sessionId, archivedAt | Session message browsing |
| FixMessageMetadata | archiveId | Lookup by archive ID |
| Orders | sessionId, clOrdId | Order lookup by ClOrdID |
| Orders | symbol | Order book query |
| Executions | orderId | Execution lookup per order |
| Executions | execId | Unique execution lookup |

---

## 7. Data Types

- Use `DECIMAL` for all price and quantity fields. Never use `FLOAT` or `DOUBLE` for financial values.
- Use `DATETIME(3)` for millisecond precision timestamps where relevant.
- Use `DATETIME` for standard timestamps.
- Use `TINYINT(1)` for booleans.
- Use `CHAR(36)` for UUIDs.
- Use `ENUM` for well-defined status fields.
