'use strict';

/**
 * CardTransactionApiKey = 供外部記帳系統呼叫「回報信用卡交易」API 用的個人金鑰。
 * - 明碼權杖只在建立當下回傳一次，之後只存 SHA-256 雜湊供比對。
 * - 可同時擁有多把（例如正式/測試各一把），用 isActive 個別停用。
 */
module.exports = (sequelize, DataTypes) => {
  const CardTransactionApiKey = sequelize.define('CardTransactionApiKey', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
      comment: '使用者自訂名稱，例如「個人記帳系統」'
    },
    keyHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: 'SHA-256(token) 十六進位，僅供比對，不可逆'
    },
    keyMask: {
      type: DataTypes.STRING(40),
      allowNull: false,
      comment: '頭尾片段，供前端顯示識別'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    lastUsedAt: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'card_transaction_api_keys',
    indexes: [
      { fields: ['userId'] },
      { unique: true, fields: ['keyHash'], name: 'card_transaction_api_keys_hash_unique' }
    ]
  });

  return CardTransactionApiKey;
};
