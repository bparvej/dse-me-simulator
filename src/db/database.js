/**
 * DSE-ME Simulator
 * Database Manager & Sequelize Connection
 */

'use strict';

const { Sequelize } = require('sequelize');
const config = require('../config');
const logger = require('../utils/logger');
const { FixSessionModel, initFixSession } = require('./models/FixSession');
const { FixMessageMetadataModel, initFixMessageMetadata } = require('./models/FixMessageMetadata');
const { CertificationTestCaseModel, initCertificationTestCase } = require('./models/CertificationTestCase');
const dseCases = require('../config/dse-certification-cases.json');

class Database {
  constructor(options = {}) {
    const dialect = options.dialect || config.db.dialect;
    const isSqlite = dialect === 'sqlite';

    if (isSqlite) {
      this.sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: options.storage || config.db.storage || ':memory:',
        logging: false
      });
    } else {
      this.sequelize = new Sequelize(config.db.database, config.db.username, config.db.password, {
        host: config.db.host,
        port: config.db.port,
        dialect: 'mysql',
        logging: false,
        pool: {
          min: config.db.pool.min,
          max: config.db.pool.max,
          acquire: 30000,
          idle: 10000
        }
      });
    }

    // Initialize models
    this.FixSession = initFixSession(this.sequelize);
    this.FixMessageMetadata = initFixMessageMetadata(this.sequelize);
    this.CertificationTestCase = initCertificationTestCase(this.sequelize);

    // Associations
    this.FixSession.hasMany(this.FixMessageMetadata, { foreignKey: 'sessionId' });
    this.FixMessageMetadata.belongsTo(this.FixSession, { foreignKey: 'sessionId' });
  }

  /**
   * Authenticate and synchronize schema
   * @param {object} [syncOptions]
   */
  async initialize(syncOptions = { alter: true }) {
    try {
      await this.sequelize.authenticate();
      logger.info('Database connection established successfully');
      await this.sequelize.sync(syncOptions);
      logger.info('Database models synchronized');

      // Seed DSE Certification test cases if table is empty
      await this.seedCertificationCases();
    } catch (err) {
      logger.error({ err: err.message }, 'Database initialization failed');
      throw err;
    }
  }

  /**
   * Seed the 60 DSE certification cases into database
   */
  async seedCertificationCases() {
    try {
      const count = await this.CertificationTestCase.count();
      if (count === 0 && Array.isArray(dseCases)) {
        logger.info(`Seeding ${dseCases.length} DSE Certification Test Cases into database...`);
        for (const tc of dseCases) {
          await this.CertificationTestCase.create({
            caseId: tc.id,
            category: tc.category,
            description: tc.description,
            importance: tc.importance,
            status: 'NOT_RUN'
          });
        }
        logger.info('Successfully seeded all 60 DSE Certification Test Cases');
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to seed certification cases');
    }
  }

  async close() {
    await this.sequelize.close();
    logger.info('Database connection closed');
  }
}

module.exports = Database;
