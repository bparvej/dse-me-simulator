/**
 * DSE-ME Simulator
 * Web Dashboard & Management HTTP Server
 */

'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const dseCases = require('../config/dse-certification-cases.json');
const packageJson = require('../../package.json');
const fs = require('fs');

class WebServer {
  /**
   * @param {object} options
   * @param {number} options.port
   * @param {string} options.host
   * @param {object} options.config
   * @param {TcpAcceptor} options.acceptor
   * @param {FixArchive} options.archive
   * @param {object} options.logger
   */
  constructor(options) {
    this.port = options.port || 3000;
    this.host = options.host || '0.0.0.0';
    this.config = options.config;
    this.acceptor = options.acceptor;
    this.archive = options.archive;
    this.logger = options.logger;

    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: { origin: '*' }
    });

    this.startTime = Date.now();
    this.recentLogs = [];
    this.maxLogs = 200;
    this.stats = {
      totalConnections: 0,
      totalInboundMessages: 0,
      totalOutboundMessages: 0
    };

    this._setupExpress();
    this._setupRoutes();
    this._setupSocketIO();
    this._wireAcceptorEvents();
  }

  _setupExpress() {
    this.app.set('view engine', 'ejs');
    this.app.set('views', path.join(__dirname, 'views'));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use('/public', express.static(path.join(__dirname, 'public')));
  }

  _wireAcceptorEvents() {
    if (!this.acceptor) return;

    this.acceptor.on('listening', ({ port, host }) => {
      this.addLog('SYSTEM', `TCP FIX Acceptor listening on ${host}:${port}`, { port, host });
    });

    this.acceptor.on('logon', ({ connectionId, msg }) => {
      this.stats.totalInboundMessages++;
      this.addLog('LOGON', `Logon accepted for session ${connectionId} (Sender: ${msg.senderCompId}, Target: ${msg.targetCompId})`, {
        connectionId,
        senderCompId: msg.senderCompId,
        targetCompId: msg.targetCompId,
        seq: msg.msgSeqNum
      });
      this.io.emit('session_updated', this._getSessionSummary());
    });

    this.acceptor.on('logout', ({ connectionId, msg }) => {
      this.addLog('LOGOUT', `Logout received on ${connectionId}`, { connectionId });
      this.io.emit('session_updated', this._getSessionSummary());
    });

    this.acceptor.on('applicationMessage', ({ connectionId, msg }) => {
      this.stats.totalInboundMessages++;
      this.addLog('MSG_IN', `Inbound FIX [35=${msg.msgType}] (${msg.msgTypeName || 'Msg'}) SeqNum=${msg.msgSeqNum} on ${connectionId}`, {
        connectionId,
        msgType: msg.msgType,
        seqNum: msg.msgSeqNum
      });
      this.io.emit('stats_updated', this.stats);
    });

    this.acceptor.on('sessionDisconnected', ({ connectionId }) => {
      this.addLog('DISCONNECT', `Session disconnected: ${connectionId}`, { connectionId });
      this.io.emit('session_updated', this._getSessionSummary());
    });

    if (this.archive) {
      this.archive.on('fatalError', (err) => {
        this.addLog('FATAL', `Archive fatal error: ${err.message}`, { error: err.message });
      });
    }
  }

  addLog(type, message, details = {}) {
    const entry = {
      id: Date.now() + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    };
    this.recentLogs.unshift(entry);
    if (this.recentLogs.length > this.maxLogs) {
      this.recentLogs.pop();
    }
    this.io.emit('new_log', entry);
  }

  _getSessionSummary() {
    const sessions = [];
    if (this.acceptor && this.acceptor.sessions) {
      for (const [connectionId, { session, socket }] of this.acceptor.sessions.entries()) {
        sessions.push({
          connectionId,
          remoteAddress: socket && !socket.destroyed ? `${socket.remoteAddress}:${socket.remotePort}` : 'Unknown',
          state: session.state,
          senderCompId: session.senderCompId,
          targetCompId: session.targetCompId,
          inboundSeqNum: session.inboundSeqNum,
          outboundSeqNum: session.outboundSeqNum,
          lastReceivedAt: session._lastReceivedTime ? new Date(session._lastReceivedTime).toLocaleTimeString() : 'N/A',
          lastSentAt: session._lastSentTime ? new Date(session._lastSentTime).toLocaleTimeString() : 'N/A'
        });
      }
    }
    return sessions;
  }

  _formatUptime() {
    const totalSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  _setupRoutes() {
    // Health check endpoint for Docker and monitoring
    this.app.get('/health', (req, res) => {
      const isListening = this.acceptor && this.acceptor.server && this.acceptor.server.listening;
      res.status(200).json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        mode: this.config.app.operatingMode,
        ports: {
          fix: this.config.fix.port,
          http: this.port
        },
        fixAcceptor: isListening ? 'LISTENING' : 'STOPPED',
        activeSessions: this.acceptor && this.acceptor.sessions ? this.acceptor.sessions.size : 0
      });
    });

    // Main Dashboard Overview
    this.app.get('/', (req, res) => {
      const activeSessions = this._getSessionSummary();
      const isFixListening = this.acceptor && this.acceptor.server && this.acceptor.server.listening;

      res.render('index', {
        title: 'DSE-ME Simulator — Overview & Ports',
        version: packageJson.version,
        config: this.config,
        uptime: this._formatUptime(),
        ports: {
          fixPort: this.config.fix.port,
          fixHost: this.config.fix.host,
          httpPort: this.port,
          httpHost: this.host,
          fixStatus: isFixListening ? 'LISTENING' : 'STOPPED'
        },
        fixConfig: {
          senderCompId: this.config.fix.senderCompId,
          targetCompId: this.config.fix.targetCompId,
          beginString: this.config.fix.beginString,
          defaultApplVerId: this.config.fix.defaultApplVerId,
          heartbeatInterval: this.config.fix.heartbeatInterval,
          heartbeatTolerance: this.config.fix.heartbeatTolerance,
          maxLatency: this.config.fix.maxLatency,
          operatingMode: this.config.app.operatingMode
        },
        archiveStatus: {
          baseDir: this.config.archive.baseDir,
          failures: this.archive ? this.archive.consecutiveFailures : 0,
          threshold: this.config.archive.failThreshold,
          healthy: !this.archive || this.archive.consecutiveFailures === 0
        },
        activeSessions,
        stats: this.stats,
        testCasesCount: Array.isArray(dseCases) ? dseCases.length : 60,
        recentLogs: this.recentLogs.slice(0, 50)
      });
    });

    // Sessions View
    this.app.get('/sessions', (req, res) => {
      res.render('sessions', {
        title: 'Active FIX Sessions — DSE-ME Simulator',
        version: packageJson.version,
        config: this.config,
        activeSessions: this._getSessionSummary()
      });
    });

    // Test Cases View (60 Official DSE Certification Scenarios)
    this.app.get('/testcases', (req, res) => {
      res.render('testcases', {
        title: 'DSE Certification Test Suite (v1.3.4 - 2024)',
        version: packageJson.version,
        config: this.config,
        testCases: dseCases || []
      });
    });

    // Archive Viewer
    this.app.get('/archive', (req, res) => {
      let archiveFiles = [];
      try {
        const baseDir = this.config.archive.baseDir;
        if (fs.existsSync(baseDir)) {
          const partitions = fs.readdirSync(baseDir);
          for (const partition of partitions) {
            const partitionPath = path.join(baseDir, partition);
            if (fs.statSync(partitionPath).isDirectory()) {
              const sessions = fs.readdirSync(partitionPath);
              for (const session of sessions) {
                const sessionPath = path.join(partitionPath, session);
                if (fs.statSync(sessionPath).isDirectory()) {
                  const files = fs.readdirSync(sessionPath);
                  for (const file of files) {
                    const fullPath = path.join(sessionPath, file);
                    const stats = fs.statSync(fullPath);
                    archiveFiles.push({
                      partition,
                      session,
                      fileName: file,
                      size: stats.size,
                      mtime: stats.mtime
                    });
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        this.logger.warn({ err: err.message }, 'Failed to scan archive directory');
      }

      res.render('archive', {
        title: 'FIX Message Archive Explorer',
        version: packageJson.version,
        config: this.config,
        archiveFiles
      });
    });

    // REST APIs
    this.app.get('/api/status', (req, res) => {
      res.json({
        app: packageJson.name,
        version: packageJson.version,
        uptime: process.uptime(),
        mode: this.config.app.operatingMode,
        network: {
          fixPort: this.config.fix.port,
          fixHost: this.config.fix.host,
          httpPort: this.port,
          httpHost: this.host,
          fixStatus: this.acceptor && this.acceptor.server && this.acceptor.server.listening ? 'LISTENING' : 'STOPPED'
        },
        fix: {
          senderCompId: this.config.fix.senderCompId,
          targetCompId: this.config.fix.targetCompId,
          beginString: this.config.fix.beginString,
          applVerId: this.config.fix.defaultApplVerId,
          heartbeatInterval: this.config.fix.heartbeatInterval
        },
        archive: {
          baseDir: this.config.archive.baseDir,
          healthy: !this.archive || this.archive.consecutiveFailures === 0
        },
        activeSessions: this._getSessionSummary(),
        stats: this.stats
      });
    });

    this.app.get('/api/sessions', (req, res) => {
      res.json(this._getSessionSummary());
    });

    this.app.get('/api/testcases', (req, res) => {
      res.json(dseCases || []);
    });

    this.app.post('/api/sessions/:id/disconnect', (req, res) => {
      const connectionId = req.params.id;
      if (this.acceptor && this.acceptor.sessions && this.acceptor.sessions.has(connectionId)) {
        const { session, socket } = this.acceptor.sessions.get(connectionId);
        try {
          session.disconnect();
          socket.destroy();
          res.json({ success: true, message: `Session ${connectionId} disconnected` });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });
  }

  _setupSocketIO() {
    this.io.on('connection', (socket) => {
      socket.emit('initial_state', {
        ports: {
          fixPort: this.config.fix.port,
          httpPort: this.port
        },
        sessions: this._getSessionSummary(),
        stats: this.stats,
        recentLogs: this.recentLogs.slice(0, 30)
      });
    });
  }

  /**
   * Start HTTP server
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      const tryListen = (portToTry) => {
        this.server.removeAllListeners('error');
        this.server.on('error', (err) => {
          if ((err.code === 'EACCES' || err.code === 'EADDRINUSE') && portToTry === this.config.http.port && portToTry === 3000) {
            this.logger.warn(
              { port: portToTry, fallbackPort: 3001, code: err.code },
              `Port ${portToTry} not accessible (${err.code}). Falling back to port 3001.`
            );
            this.port = 3001;
            tryListen(3001);
          } else {
            this.logger.error({ err, port: portToTry }, 'Web dashboard server error');
            reject(err);
          }
        });

        this.server.listen(portToTry, this.host, () => {
          this.port = portToTry;
          this.logger.info({ port: this.port, host: this.host }, 'Web dashboard server listening');
          this.addLog('SYSTEM', `Web Dashboard online at http://${this.host === '0.0.0.0' ? 'localhost' : this.host}:${this.port}`);
          resolve();
        });
      };

      tryListen(this.port);
    });
  }

  /**
   * Stop HTTP server
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      this.io.close();
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Web dashboard server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = WebServer;
