# ADR-002 — Selection of MySQL as Database

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** QFL Engineering

---

## Context

The simulator needs to store session state, sequence numbers, order records, execution records, scenarios, and configuration data.

---

## Decision

Use MySQL 8 with Sequelize ORM.

---

## Rationale

- Mandated by project specification.
- Relational model suits the structured, relational data (sessions, orders, executions).
- ACID transactions for sequence number updates and order state changes.
- MySQL 8 provides JSON column support for flexible metadata storage.
- Sequelize provides a migration framework for controlled schema evolution.

---

## Alternatives Considered

- **PostgreSQL:** Excellent relational database. Rejected — project specification requires MySQL.
- **SQLite:** Lightweight. Rejected — insufficient for production multi-session concurrency.
- **MongoDB:** Document model. Rejected — relational model is more appropriate for this domain.

---

## Consequences

- Raw FIX message bytes are NOT stored in MySQL. MySQL stores metadata only. Raw bytes are in the filesystem archive.
- Sequelize migrations must be used for all schema changes. `sync({ alter: true })` is prohibited in production.
- Database credentials must be managed via environment variables.

---

## Migration Policy

All schema changes must be made via `sequelize-cli` migrations.

Never use `Sequelize.sync({ force: true })` or `Sequelize.sync({ alter: true })` in any non-test environment.
