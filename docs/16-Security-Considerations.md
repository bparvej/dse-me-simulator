# Document 16 — Security Considerations

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Credential Management

- No credentials are hardcoded in source code.
- All credentials stored in `.env` files.
- `.env` is in `.gitignore` and must never be committed.
- `.env.example` contains placeholder values only.
- Database credentials: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.
- FIX session credentials: configured in SessionConfigurations table or environment.

---

## 2. FIX Credential Handling

FIX Logon messages may contain Username (tag 553) and Password (tag 554).

Rules:
- Never log Username or Password values in application logs.
- Never display Password in dashboard UI or API responses.
- Redact Password in decoded message display (show `[REDACTED]`).
- Raw archive files preserve original bytes (including credentials) — restrict file system access.
- Archive files should not be publicly accessible.

---

## 3. Dashboard Access

The administration dashboard must not be publicly accessible.

Implement one of the following before exposing the dashboard externally:
- HTTP Basic Authentication (minimum).
- Session-based authentication.
- VPN or firewall restriction.

The Phase 0 dashboard has no authentication. Authentication must be added before production exposure.

---

## 4. TCP Port Security

The FIX TCP acceptor port (default 9876) must only be accessible from known OMS IP addresses.

Use Linux firewall rules (iptables/ufw) or cloud security groups to restrict access.

---

## 5. MySQL Security

- MySQL must not be exposed on a public network interface.
- Use a dedicated database user with minimum required privileges.
- Do not use the MySQL root account for application connections.

---

## 6. Input Validation

All external input must be validated:
- FIX messages: validate CheckSum, BodyLength, required fields.
- REST API parameters: validate types, ranges, and SQL injection prevention (Sequelize ORM handles this).
- File download paths: validate against the archive directory. Prevent path traversal (../).

---

## 7. Error Handling

- Handle all unhandled exceptions: `process.on('uncaughtException', ...)`.
- Handle all unhandled promise rejections: `process.on('unhandledRejection', ...)`.
- Log errors with full context but without sensitive values.
- Do not expose internal error details in HTTP API responses.

---

## 8. Archive Security

- Archive directory permissions: readable only by the application user.
- Dashboard download API must validate file paths before serving.
- Implement archive access audit log.

---

## 9. Dependency Security

- Regularly audit npm dependencies: `npm audit`.
- Do not use abandoned or unmaintained packages.
- Lock dependency versions in `package-lock.json`.
