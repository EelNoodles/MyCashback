'use strict';

module.exports = (sequelize, DataTypes) => {
  const CashbackEvent = sequelize.define('CashbackEvent', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false, comment: '活動名稱' },
    description: { type: DataTypes.TEXT, allowNull: true, comment: '原始活動說明' },

    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },

    cashbackPercent: {
      type: DataTypes.DECIMAL(6, 3),
      allowNull: true,
      comment: '回饋百分比 (0-100)'
    },
    cashbackFixed: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: '固定回饋金額 (與 percent 二擇一)'
    },
    rewardType: {
      type: DataTypes.ENUM('point', 'cash', 'coupon', 'other'),
      allowNull: false,
      defaultValue: 'cash'
    },
    maxReward: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: '回饋上限'
    },
    minimumSpend: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      comment: '回饋門檻 (例如單筆滿 200)'
    },
    sourceUrl: { type: DataTypes.STRING(1000), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: 'cashback_events',
    indexes: [
      { fields: ['userId'] },
      { fields: ['userId', 'endDate'] },
      { fields: ['userId', 'startDate'] }
    ]
  });

  return CashbackEvent;
};
