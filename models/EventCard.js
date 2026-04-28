'use strict';

module.exports = (sequelize, DataTypes) => {
  const EventCard = sequelize.define('EventCard', {
    eventId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    cardId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true
    }
  }, {
    tableName: 'event_cards',
    timestamps: false
  });

  return EventCard;
};
