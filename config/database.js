'use strict';

const { Sequelize } = require('sequelize');
const logger = require('./logger');

const dbLogging = String(process.env.DB_LOGGING || 'false').toLowerCase() === 'true';

const sequelize = new Sequelize(
  process.env.DB_NAME || 'mycashback',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    dialect: 'mysql',
    timezone: '+08:00',
    logging: dbLogging ? (msg) => logger.debug(msg) : false,
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      underscored: false,
      freezeTableName: false
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

module.exports = sequelize;
