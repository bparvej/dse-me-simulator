/**
 * DSE-ME Simulator
 * FIX Message Encoder
 *
 * Encodes structured FIX message objects into standard SOH-delimited wire frames
 * with automatic BodyLength (tag 9) and CheckSum (tag 10) calculation.
 */

'use strict';

const { SOH, Tags } = require('../constants');

class FixEncoder {
  /**
   * Format Date to standard FIX UTC timestamp format: YYYYMMDD-HH:mm:ss.SSS
   * @param {Date} [date=new Date()]
   * @returns {string}
   */
  static formatTimestamp(date = new Date()) {
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const yyyy = date.getUTCFullYear();
    const mm = pad(date.getUTCMonth() + 1);
    const dd = pad(date.getUTCDate());
    const hh = pad(date.getUTCHours());
    const min = pad(date.getUTCMinutes());
    const ss = pad(date.getUTCSeconds());
    const ms = pad(date.getUTCMilliseconds(), 3);
    return `${yyyy}${mm}${dd}-${hh}:${min}:${ss}.${ms}`;
  }

  /**
   * Calculate 3-digit FIX CheckSum (tag 10) modulo 256 over message bytes
   * @param {string|Buffer} data
   * @returns {string}
   */
  static calculateChecksum(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      sum = (sum + buf[i]) % 256;
    }
    return String(sum).padStart(3, '0');
  }

  /**
   * Encode an ordered list of [tag, value] pairs into a complete FIX wire frame.
   * Tag 8 is placed first. Tag 9 (BodyLength) is computed and inserted second.
   * Tag 10 (CheckSum) is computed and appended last.
   *
   * @param {Array<[number, string|number]>} fields - Ordered list of [tag, value] pairs (excluding 8, 9, 10)
   * @param {string} [beginString='FIXT.1.1']
   * @returns {string} SOH-delimited FIX message
   */
  static encode(fields, beginString = 'FIXT.1.1') {
    // 1. Build the body content (from Tag 35 onwards)
    let body = '';
    for (const [tag, val] of fields) {
      if (tag === Tags.BeginString || tag === Tags.BodyLength || tag === Tags.CheckSum) {
        continue; // Handled explicitly
      }
      if (val !== undefined && val !== null) {
        body += `${tag}=${val}${SOH}`;
      }
    }

    // 2. Compute BodyLength in bytes (ASCII/Latin1)
    const bodyLength = Buffer.byteLength(body, 'latin1');

    // 3. Assemble Header + Body
    const headAndBody = `8=${beginString}${SOH}9=${bodyLength}${SOH}${body}`;

    // 4. Calculate Checksum over headAndBody
    const checksum = FixEncoder.calculateChecksum(headAndBody);

    // 5. Final wire frame
    return `${headAndBody}10=${checksum}${SOH}`;
  }

  /**
   * Encode a high-level message object with header and body tags.
   *
   * @param {object} options
   * @param {string} options.msgType - Tag 35
   * @param {string} options.senderCompId - Tag 49
   * @param {string} options.targetCompId - Tag 56
   * @param {number} options.msgSeqNum - Tag 34
   * @param {string} [options.senderSubId] - Tag 50
   * @param {string} [options.targetSubId] - Tag 57
   * @param {string} [options.sendingTime] - Tag 52
   * @param {string} [options.possDupFlag] - Tag 43
   * @param {string} [options.origSendingTime] - Tag 122
   * @param {string} [options.defaultApplVerId] - Tag 1137
   * @param {Array<[number, any]>} [options.bodyFields=[]]
   * @param {string} [options.beginString='FIXT.1.1']
   * @returns {string}
   */
  static encodeMessage(options) {
    const {
      msgType,
      senderCompId,
      targetCompId,
      msgSeqNum,
      senderSubId,
      targetSubId,
      sendingTime = FixEncoder.formatTimestamp(),
      possDupFlag,
      origSendingTime,
      defaultApplVerId,
      bodyFields = [],
      beginString = 'FIXT.1.1'
    } = options;

    const fields = [
      [Tags.MsgType, msgType],
      [Tags.SenderCompID, senderCompId],
      [Tags.TargetCompID, targetCompId]
    ];

    if (senderSubId) fields.push([Tags.SenderSubID, senderSubId]);
    if (targetSubId) fields.push([Tags.TargetSubID, targetSubId]);

    fields.push([Tags.MsgSeqNum, msgSeqNum]);
    if (possDupFlag) fields.push([Tags.PossDupFlag, possDupFlag]);
    fields.push([Tags.SendingTime, sendingTime]);
    if (origSendingTime) fields.push([Tags.OrigSendingTime, origSendingTime]);
    if (defaultApplVerId) fields.push([Tags.DefaultApplVerID, defaultApplVerId]);

    // Append application body fields
    for (const field of bodyFields) {
      fields.push(field);
    }

    return FixEncoder.encode(fields, beginString);
  }
}

module.exports = FixEncoder;
