/**
 * Unit Tests for FixParser and FixEncoder
 */

'use strict';

const FixEncoder = require('../../../src/fix/encoder/FixEncoder');
const { FixParser } = require('../../../src/fix/parser/FixParser');
const { Tags, MsgType, SOH } = require('../../../src/fix/constants');

describe('FixEncoder and FixParser', () => {
  test('formats timestamp in standard UTC format', () => {
    const d = new Date(Date.UTC(2026, 10, 1, 12, 30, 45, 123));
    expect(FixEncoder.formatTimestamp(d)).toBe('20261101-12:30:45.123');
  });

  test('encodes and parses a standard FIX Logon (35=A) message with valid checksum', () => {
    const raw = FixEncoder.encodeMessage({
      msgType: MsgType.LOGON,
      senderCompId: 'DSESIM',
      targetCompId: 'OMSFIRM',
      msgSeqNum: 1,
      sendingTime: '20261101-12:00:00.000',
      bodyFields: [
        [Tags.EncryptMethod, 0],
        [Tags.HeartBtInt, 30],
        [Tags.DefaultApplVerID, 8]
      ]
    });

    expect(raw).toContain(`8=FIXT.1.1${SOH}`);
    expect(raw).toContain(`35=A${SOH}`);
    expect(raw).toContain(`49=DSESIM${SOH}`);
    expect(raw).toContain(`56=OMSFIRM${SOH}`);
    expect(raw).toContain(`34=1${SOH}`);
    expect(raw).toContain(`98=0${SOH}`);
    expect(raw).toContain(`108=30${SOH}`);
    expect(raw).toContain(`1137=8${SOH}`);

    // Parse back
    const msg = FixParser.parse(raw);
    expect(msg.isValid).toBe(true);
    expect(msg.msgType).toBe(MsgType.LOGON);
    expect(msg.senderCompId).toBe('DSESIM');
    expect(msg.targetCompId).toBe('OMSFIRM');
    expect(msg.msgSeqNum).toBe(1);
    expect(msg.getInt(Tags.HeartBtInt)).toBe(30);
    expect(msg.getInt(Tags.DefaultApplVerID)).toBe(8);
  });

  test('parses DSE Certification sample message S1 (PositionReport 35=AP)', () => {
    const sample = '8=FIXT.1.1|9=000185|35=AP|49=TEST|56=FAR|34=1|43=Y|52=20210812-03:34:34.389|122=20210812-00:25:07.807|721=FAR1628727905579000000|715=20210812|1011=New|453=1|448=FAR|447=C|452=7|753=1|707=LMT|708=100000000|10=214|';
    
    // Parse without strict bodylength/checksum since sample has zero-padded 9
    const msg = FixParser.parse(sample, { validateChecksum: false, validateBodyLength: false });
    expect(msg.isValid).toBe(true);
    expect(msg.msgType).toBe(MsgType.POSITION_REPORT);
    expect(msg.senderCompId).toBe('TEST');
    expect(msg.targetCompId).toBe('FAR');
    expect(msg.msgSeqNum).toBe(1);
    expect(msg.possDupFlag).toBe(true);
    expect(msg.getTag(Tags.PosAmtType)).toBe('LMT');
    expect(msg.getTag(Tags.PosAmt)).toBe('100000000');
    expect(msg.getTag(Tags.PosMaintRptID)).toBe('FAR1628727905579000000');
  });

  test('parses nested party repeating groups (Tag 453)', () => {
    const raw = FixEncoder.encodeMessage({
      msgType: MsgType.EXECUTION_REPORT,
      senderCompId: 'DSESIM',
      targetCompId: 'OMSFIRM',
      msgSeqNum: 10,
      bodyFields: [
        [Tags.OrderID, '20261101-001'],
        [Tags.ClOrdID, 'ORD-001'],
        [Tags.ExecID, 'EX-001'],
        [Tags.ExecType, '0'],
        [Tags.OrdStatus, '0'],
        [Tags.Symbol, 'DESCO'],
        [Tags.Side, '1'],
        [Tags.NoPartyIDs, 2],
        [Tags.PartyID, '1201500016645131'],
        [Tags.PartyIDSource, 'C'],
        [Tags.PartyRole, 5],
        [Tags.PartyID, 'FARTRDR001'],
        [Tags.PartyIDSource, 'C'],
        [Tags.PartyRole, 36]
      ]
    });

    const msg = FixParser.parse(raw);
    expect(msg.isValid).toBe(true);
    const parties = msg.getPartyGroups();
    expect(parties).toHaveLength(2);
    expect(parties[0]).toEqual({
      partyId: '1201500016645131',
      partyIdSource: 'C',
      partyRole: 5
    });
    expect(parties[1]).toEqual({
      partyId: 'FARTRDR001',
      partyIdSource: 'C',
      partyRole: 36
    });
  });

  test('detects checksum corruption', () => {
    let raw = FixEncoder.encodeMessage({
      msgType: MsgType.HEARTBEAT,
      senderCompId: 'DSESIM',
      targetCompId: 'OMSFIRM',
      msgSeqNum: 2
    });

    // Corrupt one byte in the body
    raw = raw.replace('DSESIM', 'DSEXIM');
    const msg = FixParser.parse(raw, { validateChecksum: true, validateBodyLength: false });
    expect(msg.isValid).toBe(false);
    expect(msg.validationError).toContain('CheckSum mismatch');
  });
});
