'use strict';

/**
 * RewardReceipt = 回饋實際入帳紀錄
 * 使用者對某個回饋活動某一段期間（通常是一個週期）記錄「銀行/支付實際給了多少」，
 * 系統同時保存當下依交易紀錄算出的「應得回饋」快照，用來核對有沒有少給。
 */
module.exports = (sequelize, DataTypes) => {
  const RewardReceipt = sequelize.define('RewardReceipt', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    eventId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    periodStart: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: '核對期間起日（含）'
    },
    periodEnd: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: '核對期間迄日（含）'
    },
    expectedAmount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: '建立時依交易紀錄計算的應得回饋快照'
    },
    receivedAmount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      comment: '實際入帳的回饋金額 / 點數'
    },
    receivedDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: '入帳日期'
    },
    note: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    tableName: 'reward_receipts',
    indexes: [
      { fields: ['userId'] },
      { fields: ['userId', 'eventId'] },
      { fields: ['userId', 'receivedDate'] }
    ]
  });

  return RewardReceipt;
};
