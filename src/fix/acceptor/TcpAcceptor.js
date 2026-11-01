/**
 * DSE-ME Simulator
 * TCP FIX Acceptor with Stream Buffer Accumulator
 *
 * Handles concurrent TCP connections, robust framing of partial packets
 * and concatenated messages, and routes to per-connection FixSession instances.
 */

'use strict';

const net = require('net');
const { EventEmitter } = require('events');
const { SOH, PIPE } = require('../constants');
const { FixParser } = require('../parser/FixParser');
const { FixSession } = require('../session/FixSession');
const logger = require('../../utils/logger');

class TcpAcceptor extends EventEmitter {
  /**
   * @param {object} options
   * @param {number} options.port
   * @param {string} [options.host='0.0.0.0']
   * @param {string} [options.senderCompId='TEST']
   * @param {string} [options.targetCompId='FAR']
   * @param {string} [options.beginString='FIXT.1.1']
   * @param {string} [options.defaultApplVerId='8']
   * @param {number} [options.heartbeatInterval=30]
   * @param {FixArchive} [options.archive]
   * @param {boolean} [options.simulateDseFirstLogonGap=false]
   */
  constructor(options = {}) {
    super();
    this.port = options.port || 9876;
    this.host = options.host || '0.0.0.0';
    this.senderCompId = options.senderCompId || 'TEST';
    this.targetCompId = options.targetCompId || 'FAR';
    this.beginString = options.beginString || 'FIXT.1.1';
    this.defaultApplVerId = options.defaultApplVerId || '8';
    this.heartbeatInterval = options.heartbeatInterval || 30;
    this.archive = options.archive || null;
    this.simulateDseFirstLogonGap = options.simulateDseFirstLogonGap || false;

    this.server = null;
    this.sessions = new Map(); // connectionId -> { session, socket }
    this._connectionCounter = 0;
  }

  /**
   * Start listening on TCP port
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this._handleConnection(socket));

      this.server.on('error', (err) => {
        logger.error({ err, port: this.port, host: this.host }, 'TCP Acceptor server error');
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        logger.info({ port: this.port, host: this.host }, 'TCP FIX Acceptor started and listening');
        this.emit('listening', { port: this.port, host: this.host });
        resolve();
      });
    });
  }

  /**
   * Process a new incoming TCP connection
   * @param {net.Socket} socket
   */
  _handleConnection(socket) {
    const connectionId = `conn-${Date.now()}-${++this._connectionCounter}`;
    const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.info({ connectionId, remoteAddress }, 'New incoming TCP connection accepted');

    // Create FixSession for this socket
    const session = new FixSession({
      sessionId: connectionId,
      senderCompId: this.senderCompId,
      targetCompId: this.targetCompId,
      beginString: this.beginString,
      defaultApplVerId: this.defaultApplVerId,
      heartbeatInterval: this.heartbeatInterval,
      simulateDseFirstLogonGap: this.simulateDseFirstLogonGap,
      archive: this.archive,
      sendRaw: (data) => {
        if (!socket.destroyed) {
          socket.write(data, 'latin1');
        }
      }
    });

    this.sessions.set(connectionId, { session, socket });

    // Forward session events
    session.on('logon', (msg) => this.emit('logon', { connectionId, session, msg }));
    session.on('logout', (msg) => this.emit('logout', { connectionId, session, msg }));
    session.on('applicationMessage', (msg) => this.emit('applicationMessage', { connectionId, session, msg }));
    session.on('disconnected', () => {
      if (!socket.destroyed) socket.destroy();
      this.sessions.delete(connectionId);
      this.emit('sessionDisconnected', { connectionId, session });
    });

    // Stream buffer for TCP chunks
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      buffer = this._extractFrames(buffer, session, connectionId);
    });

    socket.on('error', (err) => {
      logger.warn({ connectionId, err: err.message }, 'Socket error on FIX connection');
      session.disconnect();
    });

    socket.on('close', () => {
      logger.info({ connectionId }, 'Socket closed');
      session.disconnect();
      this.sessions.delete(connectionId);
    });
  }

  /**
   * Extract complete FIX frames from the buffer accumulator.
   * Handles SOH and pipe delimiter framing.
   *
   * @param {string} buf
   * @param {FixSession} session
   * @param {string} connectionId
   * @returns {string} Remaining unparsed buffer
   */
  _extractFrames(buf, session, connectionId) {
    while (buf.length > 0) {
      // Find BeginString ("8=")
      const beginIdx = buf.indexOf('8=');
      if (beginIdx === -1) {
        // No BeginString found, discard garbage
        return '';
      }

      if (beginIdx > 0) {
        // Discard leading bytes before 8=
        buf = buf.substring(beginIdx);
      }

      // Check for SOH delimiter or PIPE delimiter
      const delim = buf.includes(SOH) ? SOH : (buf.includes(PIPE) ? PIPE : SOH);

      // Find BodyLength tag 9
      const tag9Prefix = `9=`;
      const tag9Idx = buf.indexOf(tag9Prefix);
      if (tag9Idx === -1) {
        // Incomplete header, wait for more data
        return buf;
      }

      const tag9End = buf.indexOf(delim, tag9Idx);
      if (tag9End === -1) {
        // Incomplete BodyLength, wait for more data
        return buf;
      }

      const bodyLength = parseInt(buf.substring(tag9Idx + tag9Prefix.length, tag9End), 10);
      if (isNaN(bodyLength)) {
        logger.warn({ connectionId }, 'Malformed BodyLength tag in stream buffer. Resetting buffer.');
        return '';
      }

      // Find tag 10 (CheckSum): starts after body
      const tag10Prefix = `10=`;
      const tag10Idx = buf.indexOf(tag10Prefix, tag9End);
      if (tag10Idx === -1) {
        // Incomplete message, wait for more data
        return buf;
      }

      const tag10End = buf.indexOf(delim, tag10Idx);
      if (tag10End === -1) {
        // Incomplete CheckSum, wait for more data
        return buf;
      }

      // Complete frame found!
      const frameEnd = tag10End + delim.length;
      const rawFrame = buf.substring(0, frameEnd);
      buf = buf.substring(frameEnd);

      try {
        const parsed = FixParser.parse(rawFrame);
        session.receive(parsed);
      } catch (err) {
        logger.error({ connectionId, err: err.message, raw: rawFrame }, 'Failed to parse extracted FIX frame');
      }
    }

    return buf;
  }

  /**
   * Stop the TCP acceptor and disconnect all active sessions
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      for (const [connectionId, { session, socket }] of this.sessions.entries()) {
        try {
          session.disconnect();
          socket.destroy();
        } catch (e) {
          // ignore
        }
      }
      this.sessions.clear();

      if (this.server) {
        this.server.close(() => {
          logger.info('TCP FIX Acceptor stopped successfully');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = TcpAcceptor;
