/**
 * DSE-ME Simulator
 * FIX Protocol & DSE Custom Field Constants
 *
 * Implements FIXT 1.1 session layer, FIX 5.0 SP2 application layer,
 * and official DSE custom tags verified in DSE Certification Test Cases v1.3.4.
 */

'use strict';

const SOH = '\x01';
const PIPE = '|';

const MsgType = Object.freeze({
  HEARTBEAT: '0',
  TEST_REQUEST: '1',
  RESEND_REQUEST: '2',
  REJECT: '3',
  SEQUENCE_RESET: '4',
  LOGOUT: '5',
  EXECUTION_REPORT: '8',
  ORDER_CANCEL_REJECT: '9',
  LOGON: 'A',
  NEW_ORDER_SINGLE: 'D',
  ORDER_CANCEL_REQUEST: 'F',
  ORDER_CANCEL_REPLACE_REQUEST: 'G',
  ORDER_STATUS_REQUEST: 'H',
  DONT_KNOW_TRADE: 'Q',
  POSITION_REPORT: 'AP'
});

const Tags = Object.freeze({
  // Standard Header
  BeginString: 8,
  BodyLength: 9,
  MsgType: 35,
  SenderCompID: 49,
  TargetCompID: 56,
  MsgSeqNum: 34,
  SenderSubID: 50,
  TargetSubID: 57,
  SendingTime: 52,
  PossDupFlag: 43,
  OrigSendingTime: 122,
  DefaultApplVerID: 1137,

  // Standard Trailer
  CheckSum: 10,

  // Session Layer
  EncryptMethod: 98,
  HeartBtInt: 108,
  TestReqID: 112,
  BeginSeqNo: 7,
  EndSeqNo: 16,
  RefSeqNum: 45,
  RefTagID: 371,
  RefMsgType: 372,
  SessionRejectReason: 373,
  Text: 58,
  GapFillFlag: 123,
  NewSeqNo: 36,
  ResetSeqNumFlag: 141,
  Username: 553,
  Password: 554,

  // Orders and Execution
  Account: 1,
  ClOrdID: 11,
  OrigClOrdID: 41,
  OrderID: 37,
  ExecID: 17,
  ExecType: 150,
  OrdStatus: 39,
  Symbol: 55,
  Side: 54,
  OrderQty: 38,
  OrdType: 40,
  Price: 44,
  TimeInForce: 59,
  TransactTime: 60,
  LastQty: 32,
  LastPx: 31,
  LeavesQty: 151,
  CumQty: 14,
  AvgPx: 6,
  MinQty: 110,
  DisplayQty: 1138,
  ExecInst: 18,
  OrdRejReason: 103,
  CxlRejReason: 102,
  CxlRejResponseTo: 434,
  OrdStatusReqID: 790,

  // DSE Trade & Settlement Specifics
  TradeDate: 75,
  SettlDate: 64,
  GrossTradeAmt: 381,
  TrdMatchID: 880,
  AggressorIndicator: 1057,
  SecuritySubType: 762,
  AccountType: 581,

  // DSE Position Report (Tag 35=AP)
  PosMaintRptID: 721,
  ClearingBusinessDate: 715,
  PosReqResult: 728,
  PosAmtType: 707,
  PosAmt: 708,
  SettlSessID: 753,

  // Repeating Party Identification
  NoPartyIDs: 453,
  PartyID: 448,
  PartyIDSource: 447,
  PartyRole: 452
});

const OrdStatus = Object.freeze({
  NEW: '0',
  PARTIALLY_FILLED: '1',
  FILLED: '2',
  DONE_FOR_DAY: '3',
  CANCELED: '4',
  REPLACED: '5',
  PENDING_CANCEL: '6',
  STOPPED: '7',
  REJECTED: '8',
  SUSPENDED: '9',
  PENDING_NEW: 'A',
  CALCULATED: 'B',
  EXPIRED: 'C',
  ACCEPTED_FOR_BIDDING: 'D',
  PENDING_REPLACE: 'E',
  PRIVATE: 'Z' // DSE Private / Suspended order
});

const ExecType = Object.freeze({
  NEW: '0',
  PARTIAL_FILL: '1',
  FILL: '2',
  DONE_FOR_DAY: '3',
  CANCELED: '4',
  REPLACED: '5',
  PENDING_CANCEL: '6',
  STOPPED: '7',
  REJECTED: '8',
  SUSPENDED: '9',
  PENDING_NEW: 'A',
  CALCULATED: 'B',
  EXPIRED: 'C',
  RESTATED: 'D',
  ORDER_STATUS: 'I',
  TRADE: 'F'
});

const Side = Object.freeze({
  BUY: '1',
  SELL: '2'
});

const OrdType = Object.freeze({
  MARKET: '1',
  LIMIT: '2',
  STOP: '3',
  STOP_LIMIT: '4',
  MARKET_AT_BEST: 'Z' // DSE Specific
});

const TimeInForce = Object.freeze({
  DAY: '0',
  GTC: '1',
  OPG: '2',
  IOC: '3',
  FOK: '4',
  GTX: '5',
  GTD: '6'
});

const ExecInst = Object.freeze({
  SUSPEND: 'S', // DSE Private Order
  RELEASE: 'q', // DSE Release Private Order
  WHOLE_OR_NONE: 'w' // Mandatory on DSE BLOCK board
});

const Boards = Object.freeze({
  PUBLIC: 'PUBLIC',
  BLOCK: 'BLOCK',
  BUYIN: 'BUYIN',
  SPUBLIC: 'SPUBLIC',
  ATBPUB: 'ATBPUB'
});

const PartyRole = Object.freeze({
  EXECUTING_FIRM: 1,
  INVESTOR_ID: 5,
  ORDER_ORIGINATION_TRADER: 11,
  EXECUTING_TRADER: 12,
  ENTERING_TRADER: 36
});

const SessionRejectReason = Object.freeze({
  INVALID_TAG: 0,
  REQUIRED_TAG_MISSING: 1,
  TAG_NOT_DEFINED_FOR_MESSAGE: 2,
  UNDEFINED_TAG: 3,
  TAG_SPECIFIED_WITHOUT_VALUE: 4,
  VALUE_IS_INCORRECT: 5,
  INCORRECT_DATA_FORMAT: 6,
  DECRYPTION_PROBLEM: 7,
  SIGNATURE_PROBLEM: 8,
  COMPID_PROBLEM: 9,
  SENDINGTIME_ACCURACY_PROBLEM: 10,
  INVALID_MSGTYPE: 11,
  XML_DATA_INVALID: 12,
  TAG_APPEARS_MORE_THAN_ONCE: 13,
  TAG_OUT_OF_ORDER: 14,
  REPEATING_GROUP_OUT_OF_ORDER: 15,
  INCORRECT_NUM_IN_GROUP: 16
});

module.exports = {
  SOH,
  PIPE,
  MsgType,
  Tags,
  OrdStatus,
  ExecType,
  Side,
  OrdType,
  TimeInForce,
  ExecInst,
  Boards,
  PartyRole,
  SessionRejectReason
};
