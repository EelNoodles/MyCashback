'use strict';

module.exports = (sequelize, DataTypes) => {
  const EventPaymentMethod = sequelize.define('EventPaymentMethod', {
    eventId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    paymentMethodId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true
    }
  }, {
    tableName: 'event_payment_methods',
    timestamps: false
  });

  return EventPaymentMethod;
};
