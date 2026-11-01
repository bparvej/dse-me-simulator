/**
 * DSE-ME Simulator
 * FIX Message Parser
 *
 * High-performance FIX tag-value parser with checksum and bodylength validation,
 * repeating party group support, and field accessors.
 */

'use strict';

const { SOH, PIPE, Tags } = require('../constants');
const FixEncoder = require('../encoder/FixEncoder');

class FixMessage {
  constructor(raw, fields = [], isValid = true, validationError = null) {
    this.raw = raw;
    this.fields = fields; // Array of { tag: number, value: string }
    this.isValid = isValid;
    this.validationError = validationError;

    // Index by tag
    this._tags = new Map();
    for (const { tag, value } of fields) {
      if (!this._tags.has(tag)) {
        this._tags.set(tag, value);
      }
    }

    // Header convenience properties
    this.beginString = this._tags.get(Tags.BeginString) || null;
    this.bodyLength = this._tags.has(Tags.BodyLength) ? parseInt(this._tags.get(Tags.BodyLength), 10) : null;
    this.msgType = this._tags.get(Tags.MsgType) || null;
    this.senderCompId = this._tags.get(Tags.SenderCompID) || null;
    this.targetCompId = this._tags.get(Tags.TargetCompID) || null;
    this.msgSeqNum = this._tags.has(Tags.MsgSeqNum) ? parseInt(this._tags.get(Tags.MsgSeqNum), 10) : null;
    this.senderSubId = this._tags.get(Tags.SenderSubID) || null;
    this.targetSubId = this._tags.get(Tags.TargetSubID) || null;
    this.sendingTime = this._tags.get(Tags.SendingTime) || null;
    this.possDupFlag = this._tags.get(Tags.PossDupFlag) === 'Y';
    this.origSendingTime = this._tags.get(Tags.OrigSendingTime) || null;
    this.checkSum = this._tags.get(Tags.CheckSum) || null;
  }

  getTag(tag) {
    return this._tags.get(Number(tag)) || null;
  }

  getInt(tag) {
    const val = this.getTag(tag);
    return val !== null ? parseInt(val, 10) : null;
  }

  getFloat(tag) {
    const val = this.getTag(tag);
    return val !== null ? parseFloat(val) : null;
  }

  hasTag(tag) {
    return this._tags.has(Number(tag));
  }

  getAllTags(tag) {
    const targetTag = Number(tag);
    return this.fields.filter(f => f.tag === targetTag).map(f => f.value);
  }

  /**
   * Extract repeating party groups (Tag 453 NoPartyIDs)
   * Standard DSE repeating structure: 448 (PartyID), 447 (PartyIDSource), 452 (PartyRole)
   */
  getPartyGroups() {
    const count = this.getInt(Tags.NoPartyIDs);
    if (!count || count <= 0) return [];

    const parties = [];
    let inGroup = false;
    let currentParty = null;

    for (const { tag, value } of this.fields) {
      if (tag === Tags.NoPartyIDs) {
        inGroup = true;
        continue;
      }
      if (!inGroup) continue;

      if (tag === Tags.PartyID) {
        if (currentParty) parties.push(currentParty);
        currentParty = { partyId: value, partyIdSource: null, partyRole: null };
      } else if (tag === Tags.PartyIDSource && currentParty) {
        currentParty.partyIdSource = value;
      } else if (tag === Tags.PartyRole && currentParty) {
        currentParty.partyRole = parseInt(value, 10);
      } else if (tag < 447 || tag > 453) {
        // Tag outside party group ends the repeating group
        if (currentParty) {
          parties.push(currentParty);
          currentParty = null;
        }
        inGroup = false;
      }
    }

    if (currentParty) parties.push(currentParty);
    return parties;
  }

  /**
   * Return printable representation with pipe delimiter instead of SOH
   */
  toHumanReadable() {
    return this.raw.replace(new RegExp(SOH, 'g'), PIPE);
  }
}

class FixParser {
  /**
   * Parse a raw FIX message string or Buffer into a FixMessage instance.
   *
   * @param {string|Buffer} rawInput
   * @param {object} [options]
   * @param {boolean} [options.validateChecksum=true]
   * @param {boolean} [options.validateBodyLength=true]
   * @returns {FixMessage}
   */
  static parse(rawInput, options = {}) {
    const { validateChecksum = true, validateBodyLength = true } = options;
    const raw = Buffer.isBuffer(rawInput) ? rawInput.toString('latin1') : String(rawInput);

    if (!raw || raw.length === 0) {
      return new FixMessage(raw, [], false, 'Empty FIX message');
    }

    // Determine delimiter (SOH or pipe)
    const delimiter = raw.includes(SOH) ? SOH : (raw.includes(PIPE) ? PIPE : SOH);
    const parts = raw.split(delimiter);

    const fields = [];
    let beginStringFound = false;
    let checksumFound = false;
    let actualBodyLength = 0;
    let declaredBodyLength = null;
    let declaredChecksum = null;
    let tag35Seen = false;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) {
        return new FixMessage(raw, fields, false, `Malformed tag-value pair: "${part}"`);
      }

      const tagStr = part.slice(0, eqIdx);
      const valStr = part.slice(eqIdx + 1);
      const tag = parseInt(tagStr, 10);

      if (isNaN(tag)) {
        return new FixMessage(raw, fields, false, `Invalid non-numeric tag: "${tagStr}"`);
      }

      if (tag === Tags.BeginString) {
        beginStringFound = true;
      } else if (tag === Tags.BodyLength) {
        declaredBodyLength = parseInt(valStr, 10);
      } else if (tag === Tags.CheckSum) {
        declaredChecksum = valStr;
        checksumFound = true;
      }

      // Calculate actual body length from tag 35 up to before tag 10
      if (tag === Tags.MsgType) {
        tag35Seen = true;
      }
      if (tag35Seen && tag !== Tags.CheckSum) {
        // Tag + '=' + Value + Delimiter
        actualBodyLength += Buffer.byteLength(`${part}${SOH}`, 'latin1');
      }

      fields.push({ tag, value: valStr });
    }

    // Check basic headers
    if (!beginStringFound) {
      return new FixMessage(raw, fields, false, 'Missing BeginString (tag 8)');
    }
    if (!checksumFound) {
      return new FixMessage(raw, fields, false, 'Missing CheckSum (tag 10)');
    }

    // Validate BodyLength
    if (validateBodyLength && declaredBodyLength !== null) {
      if (declaredBodyLength !== actualBodyLength) {
        return new FixMessage(
          raw,
          fields,
          false,
          `BodyLength mismatch: declared ${declaredBodyLength}, computed ${actualBodyLength}`
        );
      }
    }

    // Validate CheckSum
    if (validateChecksum && declaredChecksum !== null) {
      // Find position of tag 10 in raw
      const chkIdx = raw.indexOf(`10=${declaredChecksum}`);
      if (chkIdx !== -1) {
        const dataBeforeCheckSum = raw.substring(0, chkIdx);
        // Normalize delimiter to SOH if parsed from pipe
        const normalizedData = delimiter === PIPE
          ? dataBeforeCheckSum.replace(new RegExp('\\|', 'g'), SOH)
          : dataBeforeCheckSum;
        const computedChecksum = FixEncoder.calculateChecksum(normalizedData);
        if (computedChecksum !== declaredChecksum) {
          return new FixMessage(
            raw,
            fields,
            false,
            `CheckSum mismatch: declared ${declaredChecksum}, computed ${computedChecksum}`
          );
        }
      }
    }

    return new FixMessage(raw, fields, true, null);
  }
}

module.exports = {
  FixParser,
  FixMessage
};
