'use strict';

/**
 * PaymentMethod = 支付方式（icash Pay, LINE Pay, 街口、悠遊付…）
 */
module.exports = (sequelize, DataTypes) => {
  const PaymentMethod = sequelize.define('PaymentMethod', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '使用者上傳的支付方式圖片路徑'
    },
    color: { type: DataTypes.STRING(20), allowNull: true },
    note: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    tableName: 'payment_methods',
    indexes: [
      { fields: ['userId'] },
      { unique: true, fields: ['userId', 'name'], name: 'payment_methods_user_name_unique' }
    ]
  });

  return PaymentMethod;
};
