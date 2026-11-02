/**
 * DSE-ME Simulator
 * FixMessageMetadata Model
 */

'use strict';

const { DataTypes, Model } = require('sequelize');

class FixMessageMetadataModel extends Model {}

function initFixMessageMetadata(sequelize) {
  FixMessageMetadataModel.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      archiveId: {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true
      },
      sessionId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true
      },
      direction: {
        type: DataTypes.ENUM('INBOUND', 'OUTBOUND'),
        allowNull: false
      },
      archivedAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      msgType: {
        type: DataTypes.STRING(10),
        allowNull: false
      },
      msgTypeName: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      msgSeqNum: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false
      },
      senderCompId: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      targetCompId: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      beginString: {
        type: DataTypes.STRING(20),
        allowNull: false
      },
      applVerId: {
        type: DataTypes.STRING(10),
        allowNull: true
      },
      checkSum: {
        type: DataTypes.STRING(5),
        allowNull: true
      },
      bodyLength: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true
      },
      parseStatus: {
        type: DataTypes.ENUM('OK', 'INVALID_CHECKSUM', 'INVALID_BODYLENGTH', 'PARSE_ERROR', 'UNKNOWN'),
        allowNull: false,
        defaultValue: 'OK'
      },
      processingStatus: {
        type: DataTypes.ENUM('PENDING', 'PROCESSED', 'ERROR', 'REJECTED'),
        allowNull: false,
        defaultValue: 'PROCESSED'
      },
      archiveFile: {
        type: DataTypes.STRING(500),
        allowNull: true
      },
      messageLength: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      sequelize,
      tableName: 'FixMessageMetadata',
      modelName: 'FixMessageMetadata',
      timestamps: true,
      indexes: [
        { name: 'idx_direction', fields: ['direction'] },
        { name: 'idx_msg_type', fields: ['msgType'] },
        { name: 'idx_msg_seq_num', fields: ['msgSeqNum'] },
        { name: 'idx_archived_at', fields: ['archivedAt'] }
      ]
    }
  );

  return FixMessageMetadataModel;
}

module.exports = { FixMessageMetadataModel, initFixMessageMetadata };
