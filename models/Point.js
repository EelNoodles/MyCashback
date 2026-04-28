'use strict';

module.exports = (sequelize, DataTypes) => {
  const Point = sequelize.define('Point', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
      comment: '點數/載具名稱，例如「全聯福利點」、「LINE Points」'
    },
    issuer: {
      type: DataTypes.STRING(120),
      allowNull: true,
      comment: '發行單位，例如「全聯」、「LINE Pay」'
    },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '使用者上傳的卡片圖片相對路徑；為空時前端使用首字母漸層產生'
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: '預存的漸層基底色 hex；前端可用此色生成圖示'
    },
    currentBalance: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      comment: '即時餘額，由 PointHistory 重算同步'
    },
    note: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: 'points',
    indexes: [{ fields: ['userId'] }, { fields: ['userId', 'name'] }]
  });

  return Point;
};
