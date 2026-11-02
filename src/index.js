/**
 * DSE-ME Simulator
 * Exchange-side FIX Protocol and Matching Engine Simulator
 * for the Dhaka Stock Exchange (DSE)
 *
 * Application Entry Point
 */

'use strict';

require('dotenv').config();

const config = require('./config');
const logger = require('./utils/logger');
const FixArchive = require('./fix/archive/FixArchive');
const TcpAcceptor = require('./fix/acceptor/TcpAcceptor');
const WebServer = require('./web/server');
const packageJson = require('../package.json');

console.log(`
╔══════════════════════════════════════════════════════════════╗
║          DSE-ME Simulator v${packageJson.version.padEnd(36)}║
║  Exchange-side FIX Protocol & Matching Engine Simulator      ║
║  QFL Engineering — Official DSE Certification Suite v1.3.4  ║
╚══════════════════════════════════════════════════════════════╝
Mode          : ${config.app.operatingMode}
FIX Port      : ${config.fix.port}
SenderCompID  : ${config.fix.senderCompId}
TargetCompID  : ${config.fix.targetCompId}
BeginString   : ${config.fix.beginString} (ApplVerID ${config.fix.defaultApplVerId})
Archive Dir   : ${config.archive.baseDir}
Test Cases    : 60 DSE Certification Scenarios Supported (S1-S12, M1-M12, L1-L19, B1-B11, Z1-Z6)
`);

async function bootstrap() {
  logger.info({ mode: config.app.operatingMode }, 'Starting DSE-ME Simulator...');

  // 1. Initialise FIX Message Archive
  const archive = new FixArchive({
    baseDir: config.archive.baseDir,
    failThreshold: config.archive.failThreshold
  });

  archive.on('fatalError', async (err) => {
    logger.fatal({ err: err.message }, 'Fail-controlled archive shutdown triggered!');
    await shutdown(1);
  });

  // 2. Initialise and start TCP FIX Acceptor
  const acceptor = new TcpAcceptor({
    port: config.fix.port,
    host: config.fix.host,
    senderCompId: config.fix.senderCompId,
    targetCompId: config.fix.targetCompId,
    beginString: config.fix.beginString,
    defaultApplVerId: config.fix.defaultApplVerId,
    heartbeatInterval: config.fix.heartbeatInterval,
    archive
  });

  acceptor.on('logon', ({ connectionId, msg }) => {
    logger.info({ connectionId, sender: msg.senderCompId, target: msg.targetCompId }, 'FIX Logon established successfully');
  });

  acceptor.on('logout', ({ connectionId, msg }) => {
    logger.info({ connectionId }, 'FIX Logout completed');
  });

  acceptor.on('applicationMessage', ({ connectionId, session, msg }) => {
    logger.info({ connectionId, msgType: msg.msgType, seqNum: msg.msgSeqNum }, 'Inbound application FIX message received');
  });

  await acceptor.start();

  logger.info(
    { port: config.fix.port, host: config.fix.host, senderCompId: config.fix.senderCompId, targetCompId: config.fix.targetCompId },
    'DSE-ME Simulator FIX Acceptor is ready for OMS connections'
  );

  // 3. Initialise and start Web Dashboard & HTTP API Server
  const webServer = new WebServer({
    port: config.http.port,
    host: config.http.host,
    config,
    acceptor,
    archive,
    logger
  });

  await webServer.start();

  logger.info(
    { port: webServer.port, host: config.http.host },
    `DSE-ME Web Dashboard is available at http://${config.http.host === '0.0.0.0' ? 'localhost' : config.http.host}:${webServer.port}`
  );

  // 4. Graceful shutdown handler
  let shuttingDown = false;
  async function shutdown(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Graceful shutdown initiated...');

    try {
      await webServer.stop();
      await acceptor.stop();
      await archive.close();
      logger.info('DSE-ME Simulator stopped cleanly.');
      process.exit(exitCode);
    } catch (err) {
      logger.error({ err }, 'Error during simulator shutdown');
      process.exit(1);
    }
  }

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  return { acceptor, archive, webServer, shutdown };
}

if (require.main === module) {
  bootstrap().catch((err) => {
    logger.fatal({ err: err.message }, 'Failed to start DSE-ME Simulator');
    process.exit(1);
  });
}

module.exports = { bootstrap };
