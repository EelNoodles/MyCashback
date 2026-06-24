'use strict';

const sequelize = require('../config/database');
const { Sequelize, DataTypes } = require('sequelize');

const User = require('./User')(sequelize, DataTypes);
const Point = require('./Point')(sequelize, DataTypes);
const PointHistory = require('./PointHistory')(sequelize, DataTypes);
const CashbackEvent = require('./CashbackEvent')(sequelize, DataTypes);
const Card = require('./Card')(sequelize, DataTypes);
const PaymentMethod = require('./PaymentMethod')(sequelize, DataTypes);
const EventCard = require('./EventCard')(sequelize, DataTypes);
const EventPaymentMethod = require('./EventPaymentMethod')(sequelize, DataTypes);
const PointExpiry = require('./PointExpiry')(sequelize, DataTypes);
const FcmToken = require('./FcmToken')(sequelize, DataTypes);
const AiApiKey = require('./AiApiKey')(sequelize, DataTypes);

// ---------- Associations ----------

// User 1 -> N Point / CashbackEvent / Card / PaymentMethod
User.hasMany(Point, { foreignKey: 'userId', onDelete: 'CASCADE' });
Point.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(CashbackEvent, { foreignKey: 'userId', onDelete: 'CASCADE' });
CashbackEvent.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Card, { foreignKey: 'userId', onDelete: 'CASCADE' });
Card.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(PaymentMethod, { foreignKey: 'userId', onDelete: 'CASCADE' });
PaymentMethod.belongsTo(User, { foreignKey: 'userId' });

// Point 1 -> N PointHistory
Point.hasMany(PointHistory, { foreignKey: 'pointId', as: 'histories', onDelete: 'CASCADE' });
PointHistory.belongsTo(Point, { foreignKey: 'pointId', as: 'point' });

// Point 1 -> N PointExpiry
Point.hasMany(PointExpiry, { foreignKey: 'pointId', as: 'expiries', onDelete: 'CASCADE' });
PointExpiry.belongsTo(Point, { foreignKey: 'pointId', as: 'point' });

// User 1 -> N PointExpiry
User.hasMany(PointExpiry, { foreignKey: 'userId', onDelete: 'CASCADE' });
PointExpiry.belongsTo(User, { foreignKey: 'userId' });

// User 1 -> N FcmToken
User.hasMany(FcmToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
FcmToken.belongsTo(User, { foreignKey: 'userId' });

// User 1 -> N AiApiKey
User.hasMany(AiApiKey, { foreignKey: 'userId', onDelete: 'CASCADE' });
AiApiKey.belongsTo(User, { foreignKey: 'userId' });

// CashbackEvent <-> Card (M:N) via EventCard
CashbackEvent.belongsToMany(Card, {
  through: EventCard,
  foreignKey: 'eventId',
  otherKey: 'cardId',
  as: 'cards'
});
Card.belongsToMany(CashbackEvent, {
  through: EventCard,
  foreignKey: 'cardId',
  otherKey: 'eventId',
  as: 'events'
});

// CashbackEvent <-> PaymentMethod (M:N) via EventPaymentMethod
CashbackEvent.belongsToMany(PaymentMethod, {
  through: EventPaymentMethod,
  foreignKey: 'eventId',
  otherKey: 'paymentMethodId',
  as: 'paymentMethods'
});
PaymentMethod.belongsToMany(CashbackEvent, {
  through: EventPaymentMethod,
  foreignKey: 'paymentMethodId',
  otherKey: 'eventId',
  as: 'events'
});

module.exports = {
  sequelize,
  Sequelize,
  User,
  Point,
  PointHistory,
  PointExpiry,
  CashbackEvent,
  Card,
  PaymentMethod,
  EventCard,
  EventPaymentMethod,
  FcmToken,
  AiApiKey
};
