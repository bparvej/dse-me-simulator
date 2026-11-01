/**
 * DSE-ME Simulator
 * FIX Message Archive
 *
 * Implements Tier 1 dual-tier archiving:
 * - Append-only raw FIX message logs preserving exact SOH bytes.
 * - Daily directory partitioning: <baseDir>/<YYYYMMDD>/<sessionId>/inbound.fix | outbound.fix
 * - Fail-controlled integrity monitoring: throws / emits fatal alert if consecutive disk failures exceed threshold.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const logger = require('../../utils/logger');

class FixArchive extends EventEmitter {
  constructor(options = {}) {
    super();
    this.baseDir = options.baseDir || path.resolve(process.cwd(), 'storage', 'fix-archive');
    this.failThreshold = options.failThreshold || 10;
    this.consecutiveFailures = 0;
    this.isShuttingDown = false;
    this._writeStreams = new Map(); // key -> fs.WriteStream
  }

  /**
   * Get formatted YYYYMMDD date string for directory partitioning
   * @param {Date} [date=new Date()]
   */
  getDatePartition(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  }

  /**
   * Get or create append stream for a session and direction
   * @param {string} sessionId
   * @param {'inbound'|'outbound'} direction
   * @returns {fs.WriteStream}
   */
  _getStream(sessionId, direction) {
    const partition = this.getDatePartition();
    const streamKey = `${partition}:${sessionId}:${direction}`;

    if (this._writeStreams.has(streamKey)) {
      return this._writeStreams.get(streamKey);
    }

    const sessionDir = path.join(this.baseDir, partition, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const filePath = path.join(sessionDir, `${direction}.fix`);
    const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'latin1' });

    stream.on('error', (err) => {
      this.consecutiveFailures++;
      logger.error({ err, sessionId, direction, failures: this.consecutiveFailures }, 'Archive write stream error');

      if (this.consecutiveFailures >= this.failThreshold) {
        const fatalErr = new Error(`Archive failure threshold reached (${this.failThreshold}). Initiating fail-controlled shutdown.`);
        this.emit('fatalError', fatalErr);
      }
    });

    this._writeStreams.set(streamKey, stream);
    return stream;
  }

  /**
   * Archive an inbound or outbound FIX message.
   *
   * @param {object} params
   * @param {string} params.sessionId
   * @param {'inbound'|'outbound'} params.direction
   * @param {string|Buffer} params.rawMessage
   * @param {Date} [params.timestamp=new Date()]
   */
  archive({ sessionId, direction, rawMessage, timestamp = new Date() }) {
    if (this.isShuttingDown) {
      logger.warn({ sessionId, direction }, 'Cannot archive message: archive is shutting down');
      return;
    }

    try {
      const stream = this._getStream(sessionId, direction);
      const isoTime = timestamp.toISOString();
      const rawStr = Buffer.isBuffer(rawMessage) ? rawMessage.toString('latin1') : String(rawMessage);
      
      // Prefix with ISO timestamp and length for auditing
      const entry = `[${isoTime}] [LEN:${Buffer.byteLength(rawStr, 'latin1')}] ${rawStr}\n`;

      const success = stream.write(entry);
      if (success) {
        this.consecutiveFailures = 0; // Reset counter on success
      }
    } catch (err) {
      this.consecutiveFailures++;
      logger.error({ err, sessionId, direction, failures: this.consecutiveFailures }, 'Failed to write to FIX archive');

      if (this.consecutiveFailures >= this.failThreshold) {
        this.emit('fatalError', new Error(`Archive failure threshold reached (${this.failThreshold})`));
      }
    }
  }

  /**
   * Flush and close all active file streams
   * @returns {Promise<void>}
   */
  async close() {
    this.isShuttingDown = true;
    const promises = [];

    for (const [key, stream] of this._writeStreams.entries()) {
      promises.push(
        new Promise((resolve) => {
          stream.end(() => {
            resolve();
          });
        })
      );
    }

    await Promise.all(promises);
    this._writeStreams.clear();
    logger.info('All FIX archive file handles flushed and closed successfully');
  }
}

module.exports = FixArchive;
