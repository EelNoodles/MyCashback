'use strict';

/**
 * Card = 銀行帳戶 / 信用卡 / 金融卡 (debit) / 帳戶
 * - kind 區分類型，UI 可分組顯示
 */
module.exports = (sequelize, DataTypes) => {
  const Card = sequelize.define('Card', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
      comment: '卡片/帳戶名稱，例如「玉山 Pi 卡」、「台新 Richart」'
    },
    kind: {
      type: DataTypes.ENUM('credit', 'debit', 'bank', 'other'),
      allowNull: false,
      defaultValue: 'credit'
    },
    issuer: { type: DataTypes.STRING(120), allowNull: true, comment: '發卡銀行' },
    lastFour: { type: DataTypes.STRING(4), allowNull: true, comment: '卡號末四碼' },
    pan: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'AES-256-GCM 加密後的完整卡號 (base64)，供複製使用；讀取端點需另行提供解密'
    },
    network: {
      type: DataTypes.ENUM('visa', 'mastercard', 'jcb', 'amex', 'unionpay', 'other'),
      allowNull: true,
      defaultValue: null,
      comment: '發卡組織'
    },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '使用者上傳的卡片圖片路徑'
    },
    color: { type: DataTypes.STRING(20), allowNull: true },
    note: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    tableName: 'cards',
    indexes: [
      { fields: ['userId'] },
      { unique: true, fields: ['userId', 'name'], name: 'cards_user_name_unique' }
    ]
  });

  return Card;
};
