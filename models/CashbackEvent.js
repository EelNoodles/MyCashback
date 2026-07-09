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
    cycleType: {
      type: DataTypes.ENUM('none', 'weekly', 'biweekly', 'monthly'),
      allowNull: false,
      defaultValue: 'none',
      comment: '週期類型：none=無週期, weekly=每週, biweekly=雙週, monthly=每月'
    },
    cycleAnchorDay: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
      comment: 'weekly: 1=Mon~7=Sun, monthly: 1~31 (每月幾號重置)'
    },
    matchUnspecifiedPayment: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '「無指定」：除了 paymentMethods 指定的支付方式外，未使用電子支付的交易也一併累計'
    },
    requireMerchantMatch: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '「商家限定」：交易的備註/卡片/支付方式需包含 merchantKeywords 其中一項才算入'
    },
    merchantKeywords: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '商家關鍵字清單（換行或逗號分隔），比對時忽略大小寫與空白'
    },
    rewardRounding: {
      type: DataTypes.ENUM('round', 'floor'),
      allowNull: false,
      defaultValue: 'round',
      comment: '回饋金額捨入方式：round=四捨五入 (預設), floor=無條件捨去，四捨五入/捨去至整數'
    },
    rewardCalcMode: {
      type: DataTypes.ENUM('aggregate', 'perTransaction'),
      allowNull: false,
      defaultValue: 'aggregate',
      comment: '回饋計算方式：aggregate=週期內消費加總後一次計算 (預設), perTransaction=每筆交易分別計算後加總'
    },
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
