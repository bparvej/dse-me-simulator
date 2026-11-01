/**
 * Integration Tests for DSE FIX Session & Transport Suite (S1 - S4)
 */

'use strict';

const net = require('net');
const path = require('path');
const fs = require('fs');
const TcpAcceptor = require('../../src/fix/acceptor/TcpAcceptor');
const FixEncoder = require('../../src/fix/encoder/FixEncoder');
const { FixParser } = require('../../src/fix/parser/FixParser');
const FixArchive = require('../../src/fix/archive/FixArchive');
const { MsgType, Tags, SOH } = require('../../src/fix/constants');

const TEST_PORT = 19876;
const TEST_ARCHIVE_DIR = path.resolve(__dirname, '..', '..', 'storage', 'test-archive');

describe('DSE FIX Session & Transport Integration Tests', () => {
  let acceptor;
  let archive;

  beforeAll(async () => {
    archive = new FixArchive({ baseDir: TEST_ARCHIVE_DIR });
    acceptor = new TcpAcceptor({
      port: TEST_PORT,
      host: '127.0.0.1',
      senderCompId: 'TEST',
      targetCompId: 'FAR',
      archive
    });
    await acceptor.start();
  });

  afterAll(async () => {
    await acceptor.stop();
    await archive.close();
    // Clean test archive
    if (fs.existsSync(TEST_ARCHIVE_DIR)) {
      fs.rmSync(TEST_ARCHIVE_DIR, { recursive: true, force: true });
    }
  });

  function createClientSocket() {
    return new Promise((resolve, reject) => {
      const client = net.createConnection({ port: TEST_PORT, host: '127.0.0.1' }, () => {
        resolve(client);
      });
      client.on('error', reject);
    });
  }

  test('Logon handshake, heartbeat exchange, and clean logout (S2, S3)', async () => {
    const client = await createClientSocket();
    const receivedMessages = [];

    let buffer = '';
    client.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      while (buffer.includes(SOH)) {
        const tag10Idx = buffer.indexOf('10=');
        if (tag10Idx === -1) break;
        const endIdx = buffer.indexOf(SOH, tag10Idx);
        if (endIdx === -1) break;

        const rawMsg = buffer.substring(0, endIdx + 1);
        buffer = buffer.substring(endIdx + 1);
        receivedMessages.push(FixParser.parse(rawMsg));
      }
    });

    // 1. Send Logon (35=A) from broker FAR to exchange TEST
    const logonMsg = FixEncoder.encodeMessage({
      msgType: MsgType.LOGON,
      senderCompId: 'FAR',
      targetCompId: 'TEST',
      msgSeqNum: 1,
      bodyFields: [
        [Tags.EncryptMethod, 0],
        [Tags.HeartBtInt, 30],
        [Tags.DefaultApplVerID, 8]
      ]
    });
    client.write(logonMsg);

    // Wait for Logon response (35=A)
    await new Promise((r) => setTimeout(r, 200));

    expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
    const logonResp = receivedMessages[0];
    expect(logonResp.msgType).toBe(MsgType.LOGON);
    expect(logonResp.senderCompId).toBe('TEST');
    expect(logonResp.targetCompId).toBe('FAR');
    expect(logonResp.msgSeqNum).toBe(1);

    // 2. Send Inbound TestRequest (35=1, Case S4)
    const testReqMsg = FixEncoder.encodeMessage({
      msgType: MsgType.TEST_REQUEST,
      senderCompId: 'FAR',
      targetCompId: 'TEST',
      msgSeqNum: 2,
      bodyFields: [
        [Tags.TestReqID, 'TR-CERT-001']
      ]
    });
    client.write(testReqMsg);

    await new Promise((r) => setTimeout(r, 200));
    expect(receivedMessages.length).toBeGreaterThanOrEqual(2);
    const hbResp = receivedMessages[1];
    expect(hbResp.msgType).toBe(MsgType.HEARTBEAT);
    expect(hbResp.getTag(Tags.TestReqID)).toBe('TR-CERT-001');

    // 3. Send Logout (35=5, Case S3)
    const logoutMsg = FixEncoder.encodeMessage({
      msgType: MsgType.LOGOUT,
      senderCompId: 'FAR',
      targetCompId: 'TEST',
      msgSeqNum: 3,
      bodyFields: [
        [Tags.Text, 'Normal logout']
      ]
    });
    client.write(logoutMsg);

    await new Promise((r) => setTimeout(r, 200));
    expect(receivedMessages.length).toBeGreaterThanOrEqual(3);
    const logoutResp = receivedMessages[2];
    expect(logoutResp.msgType).toBe(MsgType.LOGOUT);

    client.destroy();
  });

  test('Handles partial TCP frames split across multiple packets', async () => {
    const client = await createClientSocket();
    const receivedMessages = [];

    let buffer = '';
    client.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      while (buffer.includes(SOH)) {
        const tag10Idx = buffer.indexOf('10=');
        if (tag10Idx === -1) break;
        const endIdx = buffer.indexOf(SOH, tag10Idx);
        if (endIdx === -1) break;

        const rawMsg = buffer.substring(0, endIdx + 1);
        buffer = buffer.substring(endIdx + 1);
        receivedMessages.push(FixParser.parse(rawMsg));
      }
    });

    const fullLogon = FixEncoder.encodeMessage({
      msgType: MsgType.LOGON,
      senderCompId: 'FAR',
      targetCompId: 'TEST',
      msgSeqNum: 1,
      bodyFields: [
        [Tags.EncryptMethod, 0],
        [Tags.HeartBtInt, 30],
        [Tags.DefaultApplVerID, 8]
      ]
    });

    // Split message into two halves
    const half = Math.floor(fullLogon.length / 2);
    const chunk1 = fullLogon.slice(0, half);
    const chunk2 = fullLogon.slice(half);

    // Send chunk 1
    client.write(chunk1);
    await new Promise((r) => setTimeout(r, 50));
    expect(receivedMessages).toHaveLength(0); // Not complete yet

    // Send chunk 2
    client.write(chunk2);
    await new Promise((r) => setTimeout(r, 200));
    expect(receivedMessages).toHaveLength(1); // Successfully assembled!
    expect(receivedMessages[0].msgType).toBe(MsgType.LOGON);

    client.destroy();
  });

  test('DSE Test Case S1: First Logon of Day triggers gap recovery, Position Reports (35=AP), and SequenceReset (35=4)', async () => {
    // Start separate acceptor simulating DSE Test S1
    const s1Acceptor = new TcpAcceptor({
      port: TEST_PORT + 1,
      host: '127.0.0.1',
      senderCompId: 'TEST',
      targetCompId: 'FAR',
      simulateDseFirstLogonGap: true
    });
    await s1Acceptor.start();

    const client = await net.createConnection({ port: TEST_PORT + 1, host: '127.0.0.1' });
    const receivedMessages = [];

    let buffer = '';
    client.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      while (buffer.includes(SOH)) {
        const tag10Idx = buffer.indexOf('10=');
        if (tag10Idx === -1) break;
        const endIdx = buffer.indexOf(SOH, tag10Idx);
        if (endIdx === -1) break;

        const rawMsg = buffer.substring(0, endIdx + 1);
        buffer = buffer.substring(endIdx + 1);
        receivedMessages.push(FixParser.parse(rawMsg));
      }
    });

    // Step 1: Broker sends Logon with MsgSeqNum=1
    const logon = FixEncoder.encodeMessage({
      msgType: MsgType.LOGON,
      senderCompId: 'FAR',
      targetCompId: 'TEST',
      msgSeqNum: 1,
      bodyFields: [
        [Tags.EncryptMethod, 0],
        [Tags.HeartBtInt, 30],
        [Tags.DefaultApplVerID, 8]
      ]
    });
    client.write(logon);

    // Step 2: DSE replies with MsgSeqNum=4 (intentional gap per DSE Test S1)
    await new Promise((r) => setTimeout(r, 200));
    expect(receivedMessages).toHaveLength(1);
    const dseLogon = receivedMessages[0];
    expect(dseLogon.msgType).toBe(MsgType.LOGON);
    expect(dseLogon.msgSeqNum).toBe(4);

    // Step 3: Broker detects gap (expected 1, got 4) and sends ResendRequest for 1-3
    const resendReq = FixEncoder.encodeMessage({
      msgType: MsgType.RESEND_REQUEST,
      senderCompId: 'FAR',
      targetCompId: 'TEST',
      msgSeqNum: 2,
      bodyFields: [
        [Tags.BeginSeqNo, 1],
        [Tags.EndSeqNo, 0] // 0 = to infinity
      ]
    });
    client.write(resendReq);

    // Step 4: DSE replies with 2 Position Reports (35=AP) + SequenceReset (35=4)
    await new Promise((r) => setTimeout(r, 300));
    expect(receivedMessages.length).toBeGreaterThanOrEqual(4);

    // Message 2: PositionReport 1 (MsgSeqNum 1)
    const posRpt1 = receivedMessages[1];
    expect(posRpt1.msgType).toBe(MsgType.POSITION_REPORT);
    expect(posRpt1.msgSeqNum).toBe(1);
    expect(posRpt1.possDupFlag).toBe(true);
    expect(posRpt1.getTag(Tags.PosAmtType)).toBe('LMT');
    expect(posRpt1.getTag(Tags.PosAmt)).toBe('100000000');

    // Message 3: PositionReport 2 (MsgSeqNum 2)
    const posRpt2 = receivedMessages[2];
    expect(posRpt2.msgType).toBe(MsgType.POSITION_REPORT);
    expect(posRpt2.msgSeqNum).toBe(2);

    // Message 4: SequenceReset (MsgSeqNum 3 -> NewSeqNo 5)
    const seqReset = receivedMessages[3];
    expect(seqReset.msgType).toBe(MsgType.SEQUENCE_RESET);
    expect(seqReset.msgSeqNum).toBe(3);
    expect(seqReset.getTag(Tags.GapFillFlag)).toBe('Y');
    expect(seqReset.getInt(Tags.NewSeqNo)).toBe(5);

    client.destroy();
    await s1Acceptor.stop();
  });
});
