# =============================================================
# DSE-ME Simulator — Dockerfile
# =============================================================

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --only=production

# Production stage
FROM node:22-alpine AS production

LABEL maintainer="QFL Engineering"
LABEL description="DSE-ME Simulator — Exchange-side FIX Protocol and Matching Engine Simulator"
LABEL version="0.1.0"

# Create non-root application user
RUN addgroup -S dse && adduser -S dse -G dse

WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY --chown=dse:dse . .

# Create required directories
RUN mkdir -p storage/fix-archive logs \
    && chown -R dse:dse storage logs

# Switch to non-root user
USER dse

# Expose HTTP dashboard port (FIX TCP port is also needed but documented separately)
EXPOSE 3000
EXPOSE 9876

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Graceful shutdown support
STOPSIGNAL SIGTERM

CMD ["node", "src/index.js"]
