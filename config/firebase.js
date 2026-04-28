'use strict';

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const logger = require('./logger');

let initialized = false;

function initFirebase() {
  if (initialized) return admin;

  const credPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!credPath) {
    logger.warn('FIREBASE_SERVICE_ACCOUNT_PATH is not set. Firebase auth will not work.');
    return admin;
  }

  const absPath = path.resolve(credPath);
  if (!fs.existsSync(absPath)) {
    logger.warn(`Firebase service account JSON not found at ${absPath}. Auth will fail until provided.`);
    return admin;
  }

  try {
    const serviceAccount = require(absPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    initialized = true;
    logger.info(`Firebase admin initialized (project: ${serviceAccount.project_id})`);
  } catch (err) {
    logger.error('Failed to init Firebase admin', { err: err.message });
  }

  return admin;
}

function getAdmin() {
  if (!initialized) initFirebase();
  return admin;
}

module.exports = { initFirebase, getAdmin, admin };
