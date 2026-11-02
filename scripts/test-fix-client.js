/**
 * DSE-ME Simulator — Test FIX Client
 *
 * Simulates an OMS / Broker client connecting over TCP to test
 * Logon handshake (35=A), Heartbeat (35=0), and Logout (35=5).
 *
 * Usage:
 *   node scripts/test-fix-client.js
 *   node scripts/test-fix-client.js --host=localhost --port=9876
 */

'use strict';

const net = require('net');
const FixEncoder = require('../src/fix/encoder/FixEncoder');
const { FixParser } = require('../src/fix/parser/FixParser');
const { MsgType, Tags, SOH } = require('../src/fix/constants');

// Parse CLI args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  acc[k] = v || true;
  return acc;
}, {});

const HOST = args.host || process.env.FIX_TCP_HOST || '127.0.0.1';
const PORT = parseInt(args.port || process.env.FIX_TCP_PORT || '9876', 10);
const SENDER_COMP_ID = args.sender || process.env.FIX_TARGET_COMP_ID || 'OMSFIRM';
const TARGET_COMP_ID = args.target || process.env.FIX_SENDER_COMP_ID || 'DSESIM';

console.log(`
┌────────────────────────────────────────────────────────────┐
│         DSE-ME Simulator — FIX Test Client                │
└────────────────────────────────────────────────────────────┘
Target Host      : ${HOST}
Target Port      : ${PORT}
Client CompID    : ${SENDER_COMP_ID} (Tag 49)
Exchange CompID  : ${TARGET_COMP_ID} (Tag 56)
`);

let outSeqNum = 1;
let inSeqNum = 1;
let buffer = '';

console.log(`Connecting to TCP socket at ${HOST}:${PORT}...`);
const socket = net.createConnection({ host: HOST, port: PORT }, () => {
  console.log(`✔ TCP Socket Connected to ${HOST}:${PORT}\n`);

  // Step 1: Send FIX Logon (35=A)
  console.log(`[OUTBOUND] Sending Logon (35=A), SeqNum=${outSeqNum}...`);
  const logonRaw = FixEncoder.encodeMessage({
    msgType: MsgType.LOGON,
    senderCompId: SENDER_COMP_ID,
    targetCompId: TARGET_COMP_ID,
    msgSeqNum: outSeqNum++,
    bodyFields: [
      [Tags.EncryptMethod, 0],
      [Tags.HeartBtInt, 30],
      [Tags.DefaultApplVerID, 7]
    ]
  });

  console.log(`Raw FIX: ${logonRaw.replace(/\x01/g, '|')}`);
  socket.write(logonRaw, 'latin1');
});

socket.on('data', (chunk) => {
  buffer += chunk.toString('latin1');

  while (buffer.includes(SOH)) {
    const tag10Idx = buffer.indexOf('10=');
    if (tag10Idx === -1) break;
    const endIdx = buffer.indexOf(SOH, tag10Idx);
    if (endIdx === -1) break;

    const rawMsg = buffer.substring(0, endIdx + 1);
    buffer = buffer.substring(endIdx + 1);

    handleMessage(rawMsg);
  }
});

function handleMessage(rawMsg) {
  try {
    const parsed = FixParser.parse(rawMsg);
    console.log(`\n[INBOUND] Received MsgType=${parsed.msgType} (${parsed.msgTypeName || 'Msg'}), SeqNum=${parsed.msgSeqNum}`);
    console.log(`Raw FIX: ${rawMsg.replace(/\x01/g, '|')}`);

    if (parsed.msgType === MsgType.LOGON) {
      console.log('✔ FIX Logon Handshake Successful!');

      // Step 2: Send Heartbeat (35=0)
      setTimeout(() => {
        console.log(`\n[OUTBOUND] Sending Heartbeat (35=0), SeqNum=${outSeqNum}...`);
        const hbRaw = FixEncoder.encodeMessage({
          msgType: MsgType.HEARTBEAT,
          senderCompId: SENDER_COMP_ID,
          targetCompId: TARGET_COMP_ID,
          msgSeqNum: outSeqNum++
        });
        socket.write(hbRaw, 'latin1');

        // Step 3: Send Logout (35=5)
        setTimeout(() => {
          console.log(`\n[OUTBOUND] Sending Logout (35=5), SeqNum=${outSeqNum}...`);
          const logoutRaw = FixEncoder.encodeMessage({
            msgType: MsgType.LOGOUT,
            senderCompId: SENDER_COMP_ID,
            targetCompId: TARGET_COMP_ID,
            msgSeqNum: outSeqNum++
          });
          socket.write(logoutRaw, 'latin1');
        }, 1000);
      }, 500);
    } else if (parsed.msgType === MsgType.LOGOUT) {
      console.log('✔ Logout acknowledged by exchange. Closing socket cleanly.');
      socket.end();
      console.log('\n========================================');
      console.log('✔ ALL FIX TEST CHECKS COMPLETED SUCCESSFULLY!');
      console.log('========================================');
      process.exit(0);
    }
  } catch (err) {
    console.error('Error handling message:', err);
  }
}

socket.on('error', (err) => {
  console.error(`✖ Socket Error: ${err.message}`);
  process.exit(1);
});

socket.on('close', () => {
  console.log('TCP Socket closed.');
});

