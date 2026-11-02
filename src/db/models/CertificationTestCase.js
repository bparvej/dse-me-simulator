/**
 * DSE-ME Simulator
 * CertificationTestCase Model
 *
 * Tracks the execution and certification status of all 60 DSE test cases.
 */

'use strict';

const { DataTypes, Model } = require('sequelize');

class CertificationTestCaseModel extends Model {}

function initCertificationTestCase(sequelize) {
  CertificationTestCaseModel.init(
    {
      caseId: {
        type: DataTypes.STRING(20),
        primaryKey: true
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      importance: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('NOT_RUN', 'IN_PROGRESS', 'PASSED', 'FAILED'),
        allowNull: false,
        defaultValue: 'NOT_RUN'
      },
      lastRunAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastRunResult: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      sequelize,
      tableName: 'CertificationTestCases',
      modelName: 'CertificationTestCase',
      timestamps: true
    }
  );

  return CertificationTestCaseModel;
}

module.exports = { CertificationTestCaseModel, initCertificationTestCase };
