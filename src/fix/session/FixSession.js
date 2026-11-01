/**
 * DSE-ME Simulator
 * FIX Session State Machine
 *
 * Implements FIXT 1.1 session layer lifecycle:
 * - Logon (A) handshake & CompID validation
 * - Heartbeat (0) & Test Request (1) timers
 * - Sequence gap detection, Resend Request (2), and Sequence Reset (4)
 * - Session Reject (3) & Logout (5)
 * - Support for DSE Test S1 First Logon PositionReport (AP) sequence
 */

'use strict';

const { EventEmitter } = require('events');
const { SOH, MsgType, Tags, SessionRejectReason } = require('../constants');
const FixEncoder = require('../encoder/FixEncoder');
const { FixParser, FixMessage } = require('../parser/FixParser');
const logger = require('../../utils/logger');

const SessionState = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTED: 'CONNECTED',
  LOGON_RECEIVED: 'LOGON_RECEIVED',
  ACTIVE: 'ACTIVE',
  LOGOUT_SENT: 'LOGOUT_SENT',
  LOGOUT_RECEIVED: 'LOGOUT_RECEIVED'
});

class FixSession extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.sessionId
   * @param {string} options.senderCompId - Simulator's CompID (default 'TEST')
   * @param {string} options.targetCompId - Client/Broker's CompID (default 'FAR')
   * @param {string} [options.beginString='FIXT.1.1']
   * @param {string} [options.defaultApplVerId='8']
   * @param {number} [options.heartbeatInterval=30]
   * @param {number} [options.heartbeatTolerance=10]
   * @param {number} [options.logoutTimeout=10]
   * @param {boolean} [options.simulateDseFirstLogonGap=false] - For Test S1
   * @param {function} options.sendRaw - Callback (rawMessageString) => void
   * @param {FixArchive} [options.archive]
   */
  constructor(options) {
    super();
    this.sessionId = options.sessionId;
    this.senderCompId = options.senderCompId || 'TEST';
    this.targetCompId = options.targetCompId || 'FAR';
    this.beginString = options.beginString || 'FIXT.1.1';
    this.defaultApplVerId = options.defaultApplVerId || '8';
    this.heartbeatInterval = options.heartbeatInterval || 30;
    this.heartbeatTolerance = options.heartbeatTolerance || 10;
    this.logoutTimeout = options.logoutTimeout || 10;
    this.simulateDseFirstLogonGap = options.simulateDseFirstLogonGap || false;

    this.sendRaw = options.sendRaw || (() => {});
    this.archive = options.archive || null;

    this.state = SessionState.CONNECTED;
    this.inboundSeqNum = 1;
    this.outboundSeqNum = 1;

    // Resend queue for message recovery
    this._sentMessageStore = new Map(); // seqNum -> { msgType, raw, fields }

    // Timers
    this._heartbeatTimer = null;
    this._testRequestTimer = null;
    this._logoutTimer = null;
    this._pendingTestReqId = null;

    this._lastReceivedTime = Date.now();
    this._lastSentTime = Date.now();
  }

  /**
   * Log session event
   */
  _log(level, msg, meta = {}) {
    logger[level]({ sessionId: this.sessionId, state: this.state, inSeq: this.inboundSeqNum, outSeq: this.outboundSeqNum, ...meta }, msg);
  }

  /**
   * Send a FIX message outbound over the transport
   * @param {string} msgType
   * @param {Array<[number, any]>} [bodyFields=[]]
   * @param {object} [extraHeader={}]
   * @returns {string} Encoded message
   */
  send(msgType, bodyFields = [], extraHeader = {}) {
    const seqNum = extraHeader.msgSeqNum || this.outboundSeqNum;
    if (!extraHeader.msgSeqNum) {
      this.outboundSeqNum++;
    }

    const raw = FixEncoder.encodeMessage({
      msgType,
      senderCompId: this.senderCompId,
      targetCompId: this.targetCompId,
      msgSeqNum: seqNum,
      senderSubId: extraHeader.senderSubId,
      targetSubId: extraHeader.targetSubId,
      sendingTime: extraHeader.sendingTime || FixEncoder.formatTimestamp(),
      possDupFlag: extraHeader.possDupFlag,
      origSendingTime: extraHeader.origSendingTime,
      defaultApplVerId: this.defaultApplVerId,
      bodyFields,
      beginString: this.beginString
    });

    // Store for resend recovery
    this._sentMessageStore.set(seqNum, { msgType, raw, bodyFields, extraHeader });

    // Archive outbound message
    if (this.archive) {
      this.archive.archive({
        sessionId: this.sessionId,
        direction: 'outbound',
        rawMessage: raw
      });
    }

    this._lastSentTime = Date.now();
    this.sendRaw(raw);
    this.emit('messageSent', { raw, msgType, seqNum });
    return raw;
  }

  /**
   * Handle incoming parsed FIX message
   * @param {FixMessage} msg
   */
  receive(msg) {
    this._lastReceivedTime = Date.now();

    // Archive inbound message immediately
    if (this.archive) {
      this.archive.archive({
        sessionId: this.sessionId,
        direction: 'inbound',
        rawMessage: msg.raw
      });
    }

    // 1. Syntactic integrity check
    if (!msg.isValid) {
      this._log('warn', 'Received syntactically invalid FIX message', { err: msg.validationError });
      this.sendReject({
        refSeqNum: msg.msgSeqNum || this.inboundSeqNum,
        sessionRejectReason: SessionRejectReason.INCORRECT_DATA_FORMAT,
        text: msg.validationError
      });
      return;
    }

    // 2. Pre-Logon check: first message MUST be Logon (35=A)
    if (this.state === SessionState.CONNECTED) {
      if (msg.msgType !== MsgType.LOGON) {
        this._log('error', `First message must be Logon. Received ${msg.msgType}. Dropping session.`);
        this.sendLogout('First message must be Logon');
        this.disconnect();
        return;
      }
      this._handleLogon(msg);
      return;
    }

    // 3. CompID validation
    if (msg.senderCompId !== this.targetCompId || msg.targetCompId !== this.senderCompId) {
      this._log('error', 'CompID mismatch', { receivedSender: msg.senderCompId, expectedTarget: this.targetCompId });
      this.sendLogout('CompID problem');
      this.disconnect();
      return;
    }

    // 4. Sequence number checking
    const seqNum = msg.msgSeqNum;

    // Sequence Reset (35=4) handling
    if (msg.msgType === MsgType.SEQUENCE_RESET) {
      this._handleSequenceReset(msg);
      return;
    }

    if (seqNum < this.inboundSeqNum) {
      // Possible duplicate
      if (msg.possDupFlag) {
        this._log('info', 'Processing duplicate message PossDupFlag=Y', { seqNum });
      } else {
        this._log('error', `MsgSeqNum too low (expected ${this.inboundSeqNum}, got ${seqNum}). Terminating session.`);
        this.sendLogout(`MsgSeqNum too low, expecting ${this.inboundSeqNum} but received ${seqNum}`);
        this.disconnect();
        return;
      }
    } else if (seqNum > this.inboundSeqNum) {
      // Sequence gap detected
      this._log('warn', `Sequence gap detected: expected ${this.inboundSeqNum}, received ${seqNum}. Requesting resend.`);
      this.sendResendRequest(this.inboundSeqNum, 0); // 0 = up to infinity
      return;
    } else {
      // Sequence numbers match!
      this.inboundSeqNum++;
    }

    // 5. Dispatch based on MsgType
    switch (msg.msgType) {
      case MsgType.LOGON:
        this._handleLogon(msg);
        break;
      case MsgType.HEARTBEAT:
        this._handleHeartbeat(msg);
        break;
      case MsgType.TEST_REQUEST:
        this._handleTestRequest(msg);
        break;
      case MsgType.RESEND_REQUEST:
        this._handleResendRequest(msg);
        break;
      case MsgType.REJECT:
        this._handleReject(msg);
        break;
      case MsgType.LOGOUT:
        this._handleLogout(msg);
        break;
      default:
        // Application message passed to listener
        this.emit('applicationMessage', msg);
        break;
    }
  }

  _handleLogon(msg) {
    this.state = SessionState.LOGON_RECEIVED;
    const clientHeartBtInt = msg.getInt(Tags.HeartBtInt);
    if (clientHeartBtInt && clientHeartBtInt > 0) {
      this.heartbeatInterval = clientHeartBtInt;
    }

    // Check ResetSeqNumFlag (141)
    if (msg.getTag(Tags.ResetSeqNumFlag) === 'Y') {
      this._log('info', 'ResetSeqNumFlag=Y received: resetting sequence numbers to 1');
      this.inboundSeqNum = 1;
      this.outboundSeqNum = 1;
    }

    // Validate CompID
    if (msg.senderCompId !== this.targetCompId || msg.targetCompId !== this.senderCompId) {
      this._log('error', 'Logon rejected due to wrong CompID', {
        receivedSender: msg.senderCompId,
        expectedTarget: this.targetCompId
      });
      this.sendLogout('Logon rejected: wrong CompID');
      this.disconnect();
      return;
    }

    this.inboundSeqNum = msg.msgSeqNum + 1;
    this.state = SessionState.ACTIVE;

    // Check if simulating DSE Test Case S1 (Logon gap with MsgSeqNum=4)
    if (this.simulateDseFirstLogonGap) {
      this._log('info', 'Executing DSE Test Case S1: emitting Logon with MsgSeqNum=4 to trigger ResendRequest');
      this.outboundSeqNum = 4;
      this.send(MsgType.LOGON, [
        [Tags.EncryptMethod, 0],
        [Tags.HeartBtInt, this.heartbeatInterval],
        [Tags.DefaultApplVerID, this.defaultApplVerId]
      ], { msgSeqNum: 4 });
      this.outboundSeqNum = 5;
    } else {
      // Normal Logon response
      this.send(MsgType.LOGON, [
        [Tags.EncryptMethod, 0],
        [Tags.HeartBtInt, this.heartbeatInterval],
        [Tags.DefaultApplVerID, this.defaultApplVerId]
      ]);
    }

    this._startHeartbeatTimers();
    this.emit('logon', msg);
  }

  _handleHeartbeat(msg) {
    const testReqId = msg.getTag(Tags.TestReqID);
    if (testReqId && testReqId === this._pendingTestReqId) {
      this._log('info', `Received Heartbeat response for TestReqID=${testReqId}`);
      this._pendingTestReqId = null;
    }
    this.emit('heartbeat', msg);
  }

  _handleTestRequest(msg) {
    const testReqId = msg.getTag(Tags.TestReqID);
    this._log('info', `Received TestRequest(35=1) with TestReqID=${testReqId}. Echoing Heartbeat.`);
    // Respond immediately with Heartbeat containing TestReqID
    this.send(MsgType.HEARTBEAT, [
      [Tags.TestReqID, testReqId]
    ]);
  }

  _handleResendRequest(msg) {
    const beginSeq = msg.getInt(Tags.BeginSeqNo);
    const endSeq = msg.getInt(Tags.EndSeqNo);
    const effectiveEnd = (endSeq === 0 || endSeq === null) ? (this.outboundSeqNum - 1) : endSeq;

    this._log('info', `Received ResendRequest for range [${beginSeq} - ${effectiveEnd}]`);

    // Special check: If Test S1, respond with Position Reports (AP) and Sequence Reset (4)
    if (this.simulateDseFirstLogonGap && beginSeq === 1) {
      this._sendDseTestS1PositionReports();
      return;
    }

    // Default gap fill replay
    let gapStart = null;

    for (let s = beginSeq; s <= effectiveEnd; s++) {
      const stored = this._sentMessageStore.get(s);

      // Administrative messages (Logon, Logout, Heartbeat, TestRequest, ResendRequest) are skipped using SequenceReset
      const isSessionMsg = !stored || [
        MsgType.LOGON, MsgType.LOGOUT, MsgType.HEARTBEAT,
        MsgType.TEST_REQUEST, MsgType.RESEND_REQUEST
      ].includes(stored.msgType);

      if (isSessionMsg) {
        if (gapStart === null) gapStart = s;
      } else {
        // Flush any preceding gap before resending application message
        if (gapStart !== null) {
          this.sendSequenceReset(gapStart, s, true);
          gapStart = null;
        }
        // Resend application message with PossDupFlag=Y
        this.send(stored.msgType, stored.bodyFields, {
          msgSeqNum: s,
          possDupFlag: 'Y',
          origSendingTime: FixEncoder.formatTimestamp()
        });
      }
    }

    // Flush any trailing gap
    if (gapStart !== null) {
      this.sendSequenceReset(gapStart, effectiveEnd + 1, true);
    }
  }

  /**
   * DSE Test S1: Responds to ResendRequest with 2 Position Reports and a SequenceReset (GapFill)
   */
  _sendDseTestS1PositionReports() {
    this._log('info', 'DSE Test S1: Sending 2 PositionReports and SequenceReset(35=4)');
    const now = FixEncoder.formatTimestamp();

    // Position Report 1 (SeqNum 1)
    this.send(MsgType.POSITION_REPORT, [
      [Tags.PosMaintRptID, `${this.targetCompId}${Date.now()}001`],
      [Tags.ClearingBusinessDate, now.split('-')[0]],
      [1011, 'New'],
      [Tags.NoPartyIDs, 1],
      [Tags.PartyID, this.targetCompId],
      [Tags.PartyIDSource, 'C'],
      [Tags.PartyRole, 7],
      [Tags.SettlSessID, '1'],
      [Tags.PosAmtType, 'LMT'],
      [Tags.PosAmt, '100000000']
    ], { msgSeqNum: 1, possDupFlag: 'Y', origSendingTime: now });

    // Position Report 2 (SeqNum 2)
    this.send(MsgType.POSITION_REPORT, [
      [Tags.PosMaintRptID, `${this.targetCompId}${Date.now()}002`],
      [Tags.ClearingBusinessDate, now.split('-')[0]],
      [1011, 'New'],
      [Tags.NoPartyIDs, 1],
      [Tags.PartyID, this.targetCompId],
      [Tags.PartyIDSource, 'C'],
      [Tags.PartyRole, 7],
      [Tags.SettlSessID, '1'],
      [Tags.PosAmtType, 'LMT'],
      [Tags.PosAmt, '100000000']
    ], { msgSeqNum: 2, possDupFlag: 'Y', origSendingTime: now });

    // Sequence Reset (SeqNum 3 -> new SeqNum 5)
    this.sendSequenceReset(3, 5, true);
  }

  _handleSequenceReset(msg) {
    const newSeqNo = msg.getInt(Tags.NewSeqNo);
    const isGapFill = msg.getTag(Tags.GapFillFlag) === 'Y';

    if (newSeqNo < this.inboundSeqNum) {
      this._log('error', `SequenceReset NewSeqNo ${newSeqNo} < current inbound ${this.inboundSeqNum}`);
      this.sendReject({
        refSeqNum: msg.msgSeqNum,
        sessionRejectReason: SessionRejectReason.VALUE_IS_INCORRECT,
        text: 'Value is incorrect (out of range) for NewSeqNo'
      });
      return;
    }

    this._log('info', `SequenceReset processed: advancing inbound sequence from ${this.inboundSeqNum} to ${newSeqNo} (gapFill=${isGapFill})`);
    this.inboundSeqNum = newSeqNo;
  }

  _handleReject(msg) {
    this._log('warn', 'Session Reject (35=3) received from counterparty', {
      refSeqNum: msg.getInt(Tags.RefSeqNum),
      refTagId: msg.getInt(Tags.RefTagID),
      reason: msg.getInt(Tags.SessionRejectReason),
      text: msg.getTag(Tags.Text)
    });
    this.emit('sessionReject', msg);
  }

  _handleLogout(msg) {
    this._log('info', 'Received Logout (35=5) from counterparty');
    if (this.state === SessionState.LOGOUT_SENT) {
      // Counterparty acknowledged our logout
      this._stopTimers();
      this.state = SessionState.DISCONNECTED;
      this.disconnect();
    } else {
      // Counterparty initiated logout
      this.state = SessionState.LOGOUT_RECEIVED;
      this.send(MsgType.LOGOUT, [
        [Tags.Text, 'Logout confirmation']
      ]);
      this._stopTimers();
      this.state = SessionState.DISCONNECTED;
      this.disconnect();
    }
    this.emit('logout', msg);
  }

  sendHeartbeat(testReqId = null) {
    const fields = [];
    if (testReqId) fields.push([Tags.TestReqID, testReqId]);
    return this.send(MsgType.HEARTBEAT, fields);
  }

  sendTestRequest(testReqId = `TR-${Date.now()}`) {
    this._pendingTestReqId = testReqId;
    return this.send(MsgType.TEST_REQUEST, [
      [Tags.TestReqID, testReqId]
    ]);
  }

  sendResendRequest(beginSeq, endSeq = 0) {
    return this.send(MsgType.RESEND_REQUEST, [
      [Tags.BeginSeqNo, beginSeq],
      [Tags.EndSeqNo, endSeq]
    ]);
  }

  sendSequenceReset(msgSeqNum, newSeqNo, gapFill = true) {
    return this.send(MsgType.SEQUENCE_RESET, [
      [Tags.GapFillFlag, gapFill ? 'Y' : 'N'],
      [Tags.NewSeqNo, newSeqNo]
    ], {
      msgSeqNum,
      possDupFlag: gapFill ? 'Y' : undefined,
      origSendingTime: FixEncoder.formatTimestamp()
    });
  }

  sendReject({ refSeqNum, refTagId, sessionRejectReason, text }) {
    const fields = [
      [Tags.RefSeqNum, refSeqNum]
    ];
    if (refTagId !== undefined && refTagId !== null) fields.push([Tags.RefTagID, refTagId]);
    if (sessionRejectReason !== undefined) fields.push([Tags.SessionRejectReason, sessionRejectReason]);
    if (text) fields.push([Tags.Text, text]);

    return this.send(MsgType.REJECT, fields);
  }

  sendLogout(text = 'Logout') {
    this.state = SessionState.LOGOUT_SENT;
    return this.send(MsgType.LOGOUT, [
      [Tags.Text, text]
    ]);
  }

  _startHeartbeatTimers() {
    this._stopTimers();

    // Check interval every 1 second
    this._heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const intervalMs = this.heartbeatInterval * 1000;
      const toleranceMs = this.heartbeatTolerance * 1000;

      // 1. Send heartbeat if idle for intervalMs
      if (now - this._lastSentTime >= intervalMs) {
        this.sendHeartbeat();
      }

      // 2. Check inbound liveness
      if (now - this._lastReceivedTime >= intervalMs + toleranceMs) {
        if (!this._pendingTestReqId) {
          const trId = `TR-${FixEncoder.formatTimestamp()}`;
          this._log('warn', `Counterparty heartbeat timeout. Sending TestRequest ${trId}`);
          this.sendTestRequest(trId);
        } else if (now - this._lastReceivedTime >= intervalMs + (toleranceMs * 2)) {
          this._log('error', 'Counterparty failed to answer TestRequest. Dropping connection.');
          this.sendLogout('Heartbeat timeout without TestRequest response');
          this.disconnect();
        }
      }
    }, 1000);
  }

  _stopTimers() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._logoutTimer) {
      clearTimeout(this._logoutTimer);
      this._logoutTimer = null;
    }
  }

  disconnect() {
    this._stopTimers();
    this.state = SessionState.DISCONNECTED;
    this.emit('disconnected');
  }
}

module.exports = {
  FixSession,
  SessionState
};
