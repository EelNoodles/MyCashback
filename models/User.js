'use strict';

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    firebaseUid: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true
    },
    email: { type: DataTypes.STRING(255), allowNull: true },
    displayName: { type: DataTypes.STRING(255), allowNull: true }
  }, {
    tableName: 'users',
    indexes: [{ unique: true, fields: ['firebaseUid'] }]
  });

  return User;
};
