'use strict';

/**
 * CardTransaction = 從外部記帳系統回報的信用卡刷卡紀錄
 * - 用來累計各回饋活動在當前週期內的實際消費，判斷是否已達上限
 * - paymentMethodId = null 代表該筆交易沒有搭配電子支付（純刷卡）
 */
module.exports = (sequelize, DataTypes) => {
  const CardTransaction = sequelize.define('CardTransaction', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    cardId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    paymentMethodId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    rawCardName: {
      type: DataTypes.STRING(120),
      allowNull: true,
      comment: '外部系統回報當下的信用卡名稱原文，供比對失敗時除錯'
    },
    rawPaymentMethodName: {
      type: DataTypes.STRING(120),
      allowNull: true,
      comment: '外部系統回報當下的電子支付名稱原文；null/空字串代表未使用電子支付'
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false
    },
    transactionAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: '實際交易時間（由呼叫端提供）'
    },
    note: { type: DataTypes.STRING(255), allowNull: true },
    externalRef: {
      type: DataTypes.STRING(120),
      allowNull: true,
      comment: '呼叫端（記帳系統）的交易識別碼，供重送時判斷重複'
    },
    source: {
      type: DataTypes.ENUM('api', 'manual'),
      allowNull: false,
      defaultValue: 'api'
    }
  }, {
    tableName: 'card_transactions',
    indexes: [
      { fields: ['userId'] },
      { fields: ['userId', 'cardId', 'transactionAt'] },
      { unique: true, fields: ['userId', 'externalRef'], name: 'card_transactions_user_externalref_unique' }
    ]
  });

  return CardTransaction;
};
