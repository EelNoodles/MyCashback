'use strict';

/**
 * FcmToken — 儲存使用者裝置的 FCM 推播 Token
 * 一個使用者可能有多台裝置，每台對應一個 token。
 */
module.exports = (sequelize, DataTypes) => {
  const FcmToken = sequelize.define('FcmToken', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    token: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: 'FCM registration token'
    },
    deviceInfo: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '裝置資訊 (UA 或自訂標籤)'
    }
  }, {
    tableName: 'fcm_tokens',
    indexes: [
      { fields: ['userId'] },
      { unique: true, fields: ['token'], name: 'fcm_tokens_token_unique' }
    ]
  });

  return FcmToken;
};
