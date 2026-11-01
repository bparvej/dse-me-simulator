# Document 17 — Troubleshooting

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. FIX Session Issues

### Logon rejected — wrong CompID

Symptom: Simulator sends Logout immediately after receiving Logon.

Cause: SenderCompID or TargetCompID in the Logon message does not match the SessionConfiguration.

Fix: Verify OMS is sending the correct SenderCompID and TargetCompID. Check SessionConfiguration in the database or dashboard.

---

### Sequence number mismatch

Symptom: Simulator sends "MsgSeqNum too low" Logout.

Cause: OMS is sending a lower sequence number than expected without ResetSeqNumFlag=Y.

Fix: Ensure OMS preserves sequence numbers across reconnections. If intentional reset is required, send Logon with ResetSeqNumFlag=Y (and confirm this is configured as acceptable).

---

### Heartbeat timeout

Symptom: Simulator sends Test Request, then Logout.

Cause: OMS has not sent any message within HeartBtInt + tolerance seconds.

Fix: Verify OMS heartbeat interval configuration. Verify network connectivity.

---

## 2. Archive Issues

### Archive write failure

Symptom: Dashboard shows "Archive Error" alert. Logs show "ARCHIVE_WRITE_FAILURE".

Cause: Filesystem not writable. Disk full. Permissions issue.

Fix:
1. Check disk space: `df -h`.
2. Check permissions on `storage/fix-archive/`.
3. Check application logs for specific error.
4. Resolve disk/permission issue.
5. The simulator will retry archive writes from the in-memory queue.

---

### Archive directory not found

Symptom: Startup error mentioning `ENOENT` on archive directory.

Fix: Ensure the `ARCHIVE_BASE_DIR` directory exists and is writable. Create it: `mkdir -p storage/fix-archive`.

---

## 3. Database Issues

### Cannot connect to MySQL

Symptom: Application fails to start with MySQL connection error.

Fix:
1. Verify MySQL is running.
2. Verify `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `.env`.
3. Verify database user has required privileges.
4. Check MySQL logs.

---

### Migration errors

Symptom: `npm run db:migrate` fails.

Fix:
1. Check migration file for syntax errors.
2. Check if the migration was already applied: `npm run db:migrate:status`.
3. Roll back: `npm run db:migrate:undo`, fix, and re-run.

---

## 4. TCP Connection Issues

### OMS cannot connect to simulator

Symptom: Connection refused on FIX TCP port.

Fix:
1. Verify simulator is running.
2. Verify `FIX_TCP_PORT` in `.env`.
3. Verify firewall rules allow the OMS IP to reach the configured port.
4. Check application logs for TCP server startup message.

---

## 5. Log Locations

- Application logs: `logs/app.log` (or stdout in Docker).
- Docker: `docker-compose logs -f app`.
- Archive logs: embedded in Pino log output at INFO/ERROR level.

---

## 6. Health Check

```bash
curl http://localhost:3000/health
```

If database is disconnected: `"db": { "connected": false }` — investigate MySQL.
If archive has errors: `"archive": { "status": "error" }` — check filesystem.
If TCP not listening: `"tcp": { "listening": false }` — check port and application startup.
