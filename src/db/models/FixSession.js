/**
 * DSE-ME Simulator
 * FixSession Model
 */

'use strict';

const { DataTypes, Model } = require('sequelize');

class FixSessionModel extends Model {}

function initFixSession(sequelize) {
  FixSessionModel.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      sessionKey: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: 'BeginString:SenderCompID:TargetCompID'
      },
      senderCompId: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      targetCompId: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('DISCONNECTED', 'CONNECTED', 'ACTIVE', 'LOGOUT_SENT', 'LOGOUT_RECEIVED'),
        allowNull: false,
        defaultValue: 'DISCONNECTED'
      },
      lastInboundSeqNum: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
      },
      lastOutboundSeqNum: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
      },
      expectedInboundSeqNum: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 1
      },
      connectedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      logonAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastMessageAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      disconnectedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      logoutReason: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      remoteAddress: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      remotePort: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true
      },
      totalInbound: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
      },
      totalOutbound: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      sequelize,
      tableName: 'FixSessions',
      modelName: 'FixSession',
      timestamps: true,
      indexes: [
        { name: 'idx_session_key', fields: ['sessionKey'] },
        { name: 'idx_status', fields: ['status'] }
      ]
    }
  );

  return FixSessionModel;
}

module.exports = { FixSessionModel, initFixSession };
