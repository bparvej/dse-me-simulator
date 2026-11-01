# Document 15 — Deployment Guide

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Prerequisites

- Linux VPS (Ubuntu 22.04 LTS recommended)
- Docker Engine 24+
- Docker Compose v2+
- Git

---

## 2. Initial Deployment

```bash
# 1. Clone repository
git clone <repository-url> /opt/dse-me-simulator
cd /opt/dse-me-simulator

# 2. Create environment file
cp .env.example .env
# Edit .env with production values

# 3. Create storage directory (must be on persistent volume)
mkdir -p /opt/dse-me-simulator/storage/fix-archive
mkdir -p /opt/dse-me-simulator/logs

# 4. Start services
docker-compose up -d

# 5. Run database migrations
docker-compose exec app npm run db:migrate

# 6. Verify services are running
docker-compose ps
docker-compose logs -f app
```

---

## 3. Important: Storage Persistence

CRITICAL: The FIX archive directory MUST be on persistent storage.

Do NOT rely on container ephemeral filesystem for archive files.

The `docker-compose.yml` mounts `./storage` as a volume. Ensure this path is on durable storage (attached volume, NFS, etc.).

Do NOT deploy this application on platforms (e.g., Render free tier) that use ephemeral container filesystems.

---

## 4. Port Configuration

| Port | Service | Exposure |
|---|---|---|
| 9876 (configurable) | FIX TCP Acceptor | Expose to OMS network only |
| 3000 (configurable) | HTTP Dashboard + Admin API | Restrict access (VPN/firewall) |
| 3306 | MySQL | Internal only — do NOT expose publicly |

---

## 5. Environment Variables

See `.env.example` for all required variables.

Never commit `.env` to version control.

---

## 6. Database Migration Commands

```bash
# Run all pending migrations
npm run db:migrate

# Undo last migration
npm run db:migrate:undo

# Undo all migrations
npm run db:migrate:undo:all

# Create a new migration
npm run db:migration:create -- --name <migration-name>
```

---

## 7. Backup Procedures

### Database Backup

```bash
docker-compose exec mysql mysqldump -u root -p<password> dse_me_simulator > backup_$(date +%Y%m%d).sql
```

### Archive Backup

```bash
tar -czf archive_backup_$(date +%Y%m%d).tar.gz /opt/dse-me-simulator/storage/fix-archive/
```

Automate these backups with cron.

---

## 8. Graceful Shutdown

The application handles SIGTERM for graceful shutdown:
- Closes all active FIX sessions (sends Logout).
- Flushes all pending archive writes.
- Closes all database connections.
- Closes the TCP server.

```bash
docker-compose stop  # Sends SIGTERM, waits for graceful shutdown
```

---

## 9. Updates and Rollbacks

```bash
# Pull new code
git pull origin main

# Rebuild and restart
docker-compose build app
docker-compose up -d app

# Run new migrations
docker-compose exec app npm run db:migrate

# Rollback if needed
docker-compose exec app npm run db:migrate:undo
git checkout <previous-tag>
docker-compose build app
docker-compose up -d app
```

---

## 10. Health Check

```bash
# Check application health
curl http://localhost:3000/health

# Expected response
{"status":"ok","timestamp":"...","tcp":{"listening":true,"port":9876},"db":{"connected":true},"archive":{"status":"ok"}}
```
