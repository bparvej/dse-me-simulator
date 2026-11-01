/**
 * DSE-ME Simulator
 * Structured Application Logger
 *
 * Built on Pino with sensitive field redaction (passwords, Tag 554).
 */

'use strict';

const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  redact: {
    paths: ['password', 'req.headers.authorization', '*.password', 'tag554'],
    censor: '[REDACTED]'
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss.l o',
          ignore: 'pid,hostname'
        }
      }
    : undefined
});

module.exports = logger;
