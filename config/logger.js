'use strict';

const path = require('path');
const fs = require('fs');
const winston = require('winston');
require('winston-daily-rotate-file');

const logDir = path.resolve(process.env.LOG_DIR || './logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const level = process.env.LOG_LEVEL || 'info';

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level: lvl, message, ...meta }) => {
    const m = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} [${lvl}] ${message}${m}`;
  })
);

const transports = [
  new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '10m',
    maxFiles: '14d',
    level,
    format: fileFormat
  }),
  new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '10m',
    maxFiles: '30d',
    level: 'error',
    format: fileFormat
  })
];

if (process.env.NODE_ENV !== 'production') {
  transports.push(new winston.transports.Console({ format: consoleFormat, level }));
}

const logger = winston.createLogger({
  level,
  defaultMeta: { service: 'mycashback' },
  transports,
  exitOnError: false
});

module.exports = logger;
