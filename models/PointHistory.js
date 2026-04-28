'use strict';

/**
 * Each row represents a single change in balance.
 *   changeType:
 *     - 'set'    : 直接更新「當前點數」(absolute) -> delta is computed = newBalance - prevBalance
 *     - 'earn'   : 新增獲得 (positive delta)
 *     - 'spend'  : 花費 (negative delta)
 *   delta is always signed; balanceAfter is the cumulative balance right after this entry.
 *   Recalculation logic in the controller will reorder the timeline (by occurredAt asc)
 *   and rebuild balanceAfter for every history row of the same point.
 */
module.exports = (sequelize, DataTypes) => {
  const PointHistory = sequelize.define('PointHistory', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    pointId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    changeType: {
      type: DataTypes.ENUM('set', 'earn', 'spend'),
      allowNull: false,
      defaultValue: 'set'
    },
    delta: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      comment: '相對變動量；正為增加、負為減少'
    },
    balanceAfter: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      comment: '此筆紀錄發生後的餘額快照（重算後寫入）'
    },
    occurredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '使用者宣稱的發生時間（非 createdAt）'
    },
    note: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    tableName: 'point_histories',
    indexes: [
      { fields: ['pointId'] },
      { fields: ['pointId', 'occurredAt'] }
    ]
  });

  return PointHistory;
};
