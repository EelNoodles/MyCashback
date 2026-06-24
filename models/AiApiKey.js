'use strict';

/**
 * AiApiKey = 使用者自行儲存的第三方 AI 金鑰（目前用於 Gemini）。
 * - 每位使用者可儲存多把，但同時只有一把 isActive=true。
 * - keyEnc 是 AES-256-GCM 加密後 base64；keyMask 只存頭尾片段供顯示。
 */
module.exports = (sequelize, DataTypes) => {
  const AiApiKey = sequelize.define('AiApiKey', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
      comment: '使用者自訂的金鑰名稱，例如「個人 Gemini」、「工作 Gemini」'
    },
    keyEnc: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'AES-256-GCM 加密後的金鑰 (base64)'
    },
    keyMask: {
      type: DataTypes.STRING(40),
      allowNull: false,
      comment: '頭尾片段，供前端顯示識別'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    tableName: 'ai_api_keys',
    indexes: [
      { fields: ['userId'] },
      { fields: ['userId', 'isActive'] }
    ]
  });

  return AiApiKey;
};
