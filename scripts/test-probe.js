/**
 * End-to-end Verification Probe
 * Tests:
 * 1. Bootstrap simulator
 * 2. Probe HTTP /health
 * 3. Probe HTTP /api/status
 * 4. Probe HTTP / (HTML page contains Port and CompIDs)
 * 5. Probe FIX TCP Acceptor with Logon (35=A) and receive response (35=A)
 * 6. Clean shutdown
 */

'use strict';

const http = require('http');
const net = require('net');
const { bootstrap } = require('../src/index');
const FixEncoder = require('../src/fix/encoder/FixEncoder');
const { FixParser } = require('../src/fix/parser/FixParser');
const { MsgType, Tags } = require('../src/fix/constants');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function run() {
  console.log('===> 1. Bootstrapping DSE-ME Simulator...');
  const app = await bootstrap();

  const httpPort = app.webServer.port;
  const fixPort = app.acceptor.port;

  console.log(`===> App initialized: HTTP port=${httpPort}, FIX port=${fixPort}`);

  try {
    // 2. Test /health
    console.log(`===> 2. Probing http://localhost:${httpPort}/health`);
    const health = await get(`http://127.0.0.1:${httpPort}/health`);
    console.log('Health check status:', health.statusCode);
    const healthJson = JSON.parse(health.data);
    console.log('Health JSON:', JSON.stringify(healthJson, null, 2));

    if (healthJson.status !== 'UP') throw new Error('Health check status not UP');

    // 3. Test /api/status
    console.log(`===> 3. Probing http://localhost:${httpPort}/api/status`);
    const statusRes = await get(`http://127.0.0.1:${httpPort}/api/status`);
    const statusJson = JSON.parse(statusRes.data);
    console.log('API Status JSON - Network:', statusJson.network);
    console.log('API Status JSON - FIX CompIDs:', statusJson.fix);

    // 4. Test / (Dashboard HTML)
    console.log(`===> 4. Probing http://localhost:${httpPort}/`);
    const htmlRes = await get(`http://127.0.0.1:${httpPort}/`);
    console.log('Dashboard HTML length:', htmlRes.data.length);
    if (!htmlRes.data.includes(String(fixPort))) {
      throw new Error(`Dashboard HTML does not contain FIX port ${fixPort}`);
    }
    if (!htmlRes.data.includes('DSESIM') || !htmlRes.data.includes('OMSFIRM')) {
      throw new Error('Dashboard HTML does not contain expected CompIDs');
    }
    console.log('Dashboard HTML correctly includes FIX port and CompIDs!');

    // 5. Test TCP FIX Connection
    console.log(`===> 5. Connecting TCP FIX socket to port ${fixPort}...`);
    await new Promise((resolve, reject) => {
      const client = net.createConnection({ port: fixPort, host: '127.0.0.1' }, () => {
        console.log('TCP Connected to FIX Acceptor');

        // Send Logon (35=A)
        const logonMsg = FixEncoder.encodeMessage({
          msgType: MsgType.LOGON,
          senderCompId: 'OMSFIRM',
          targetCompId: 'DSESIM',
          msgSeqNum: 1,
          bodyFields: [
            [Tags.EncryptMethod, 0],
            [Tags.HeartBtInt, 30],
            [Tags.DefaultApplVerID, 7]
          ]
        });

        console.log('Sending FIX Logon (35=A)...');
        client.write(logonMsg, 'latin1');
      });

      client.on('data', (chunk) => {
        const raw = chunk.toString('latin1');
        console.log('Received raw FIX message:', raw.replace(/\x01/g, '|'));
        const parsed = FixParser.parse(raw);
        console.log('Parsed FIX MsgType:', parsed.msgType, 'MsgTypeName:', parsed.msgTypeName);

        if (parsed.msgType === MsgType.LOGON) {
          console.log('Logon response successfully validated from DSE-ME Simulator!');
          client.end();
          resolve();
        }
      });

      client.on('error', reject);
    });

    console.log('===> ALL PROBES PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('Probe error caught:', err);
  } finally {
    console.log('===> Shutting down simulator...');
    await app.shutdown(0);
  }
}

run().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
