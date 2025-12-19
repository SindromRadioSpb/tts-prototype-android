'use strict';

require('dotenv').config();

const express = require('express');
const { env } = require('../config/env');

function mountPlatform(app) {
  // Skeleton healthz: DB подключим в следующем коммите
  app.get('/healthz', (req, res) => {
    res.status(200).json({ ok: true, db: env.databaseUrl ? 'configured' : 'skip' });
  });

  // Anchor router, чтобы платформа “жила рядом” и не задевала старые /api
  const router = express.Router();
  app.use('/api/platform', router);
}

module.exports = { mountPlatform };
