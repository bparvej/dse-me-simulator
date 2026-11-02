/**
 * Unit Tests for Database and Models
 */

'use strict';

const Database = require('../../../src/db/database');

describe('Database & CertificationTestCase Seeding', () => {
  let db;

  beforeAll(async () => {
    db = new Database({ dialect: 'sqlite', storage: ':memory:' });
    await db.initialize({ force: true });
  });

  afterAll(async () => {
    await db.close();
  });

  test('seeds all 60 DSE certification test cases', async () => {
    const cases = await db.CertificationTestCase.findAll({ order: [['caseId', 'ASC']] });
    expect(cases.length).toBe(60);

    // Verify S1, M1, L1, B1, Z1 exist
    const caseIds = cases.map(c => c.caseId);
    expect(caseIds).toContain('S1');
    expect(caseIds).toContain('S12');
    expect(caseIds).toContain('M1');
    expect(caseIds).toContain('L1');
    expect(caseIds).toContain('B1');
    expect(caseIds).toContain('Z1');
    expect(caseIds).toContain('Z6');
  });

  test('creates FixSession record and associated metadata', async () => {
    const session = await db.FixSession.create({
      sessionKey: 'FIXT.1.1:TEST:FAR',
      senderCompId: 'TEST',
      targetCompId: 'FAR',
      status: 'ACTIVE',
      lastInboundSeqNum: 1,
      lastOutboundSeqNum: 1
    });

    expect(session.id).toBeDefined();

    const meta = await db.FixMessageMetadata.create({
      archiveId: 'test-uuid-001',
      sessionId: session.id,
      direction: 'INBOUND',
      archivedAt: new Date(),
      msgType: 'A',
      msgTypeName: 'Logon',
      msgSeqNum: 1,
      senderCompId: 'FAR',
      targetCompId: 'TEST',
      beginString: 'FIXT.1.1',
      parseStatus: 'OK',
      processingStatus: 'PROCESSED',
      messageLength: 98
    });

    expect(meta.id).toBeDefined();

    const fetchedSession = await db.FixSession.findByPk(session.id, {
      include: [db.FixMessageMetadata]
    });
    expect(fetchedSession.FixMessageMetadata).toHaveLength(1);
    expect(fetchedSession.FixMessageMetadata[0].msgType).toBe('A');
  });
});
