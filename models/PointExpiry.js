'use strict';

/**
 * PointExpiry — 每筆點數可設定多組到期日與對應數量
 * 例如：全聯福利點 215 點 → 2026/4/5 到期, 135 點 → 2026/5/6 到期
 *
 * status:
 *   - 'active'    = 警報啟用中，顯示倒數
 *   - 'dismissed' = 已使用 / 警報已解除
 */
module.exports = (sequelize, DataTypes) => {
  const PointExpiry = sequelize.define('PointExpiry', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    pointId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      comment: '即將到期的點數數量'
    },
    expiryDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: '到期日期'
    },
    status: {
      type: DataTypes.ENUM('active', 'dismissed'),
      allowNull: false,
      defaultValue: 'active',
      comment: 'active=警報中, dismissed=已使用/已解除'
    },
    note: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    tableName: 'point_expiries',
    indexes: [
      { fields: ['pointId'] },
      { fields: ['userId', 'status'] },
      { fields: ['userId', 'expiryDate'] }
    ]
  });

  return PointExpiry;
};
