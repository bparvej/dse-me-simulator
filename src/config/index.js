/**
 * DSE-ME Simulator
 * Configuration Loader and Validator
 */

'use strict';

const path = require('path');
require('dotenv').config();

const config = {
  app: {
    env: process.env.NODE_ENV || 'development',
    name: process.env.APP_NAME || 'DSE-ME Simulator',
    logLevel: process.env.LOG_LEVEL || 'info',
    operatingMode: (process.env.OPERATING_MODE || 'PROTOCOL').toUpperCase()
  },

  http: {
    port: parseInt(process.env.HTTP_PORT || '3000', 10),
    host: process.env.HTTP_HOST || '0.0.0.0'
  },

  fix: {
    port: parseInt(process.env.FIX_TCP_PORT || '9876', 10),
    host: process.env.FIX_TCP_HOST || '0.0.0.0',
    senderCompId: process.env.FIX_SENDER_COMP_ID || 'DSESIM',
    targetCompId: process.env.FIX_TARGET_COMP_ID || 'OMSFIRM',
    beginString: process.env.FIX_BEGIN_STRING || 'FIXT.1.1',
    defaultApplVerId: process.env.FIX_DEFAULT_APPL_VER_ID || '7',
    heartbeatInterval: parseInt(process.env.FIX_HEARTBEAT_INTERVAL || '30', 10),
    maxLatency: parseInt(process.env.FIX_MAX_LATENCY || '120', 10),
    heartbeatTolerance: parseInt(process.env.FIX_HEARTBEAT_TOLERANCE || '10', 10),
    logoutResponseTimeout: parseInt(process.env.FIX_LOGOUT_RESPONSE_TIMEOUT || '10', 10)
  },

  archive: {
    baseDir: process.env.ARCHIVE_BASE_DIR || path.resolve(process.cwd(), 'storage', 'fix-archive'),
    failThreshold: parseInt(process.env.ARCHIVE_FAIL_THRESHOLD || '10', 10),
    enableSha256: process.env.ARCHIVE_ENABLE_SHA256 === 'true',
    retentionDays: parseInt(process.env.ARCHIVE_RETENTION_DAYS || '0', 10)
  },

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME || 'dse_me_simulator',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    dialect: process.env.DB_DIALECT || 'mysql',
    storage: process.env.DB_STORAGE || undefined,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10)
    }
  }
};

module.exports = config;
