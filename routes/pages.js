'use strict';

const express = require('express');
const { buildSpec } = require('../docs/openapi');
const { buildDocsModel } = require('../docs/viewModel');

const router = express.Router();

const TITLE = 'MyCashback';

function page(view, title, active, extra = {}) {
  return (req, res) => res.render(view, { title: `${title} - ${TITLE}`, pageTitle: title, active, ...extra });
}

router.get('/', page('dashboard', '首頁', 'dashboard'));
router.get('/recommend', page('recommend', '刷哪張', 'recommend'));
router.get('/cashback', page('cashback', '回饋活動', 'cashback'));
router.get('/transactions', page('transactions', '交易紀錄', 'transactions'));
router.get('/transactions/map', (req, res) => res.render('transactions-map', {
  title: `消費地圖 - ${TITLE}`,
  pageTitle: '消費地圖',
  active: 'transactions',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ''
}));
router.get('/points', page('points', '點數', 'points'));
router.get('/settings', page('settings', '設定', 'settings'));
router.get('/tags', page('tags', '卡片與支付方式', 'settings'));
router.get('/developers', (req, res) => {
  const spec = buildSpec({ baseUrl: (process.env.BASE_URL || '').replace(/\/$/, '') });
  res.render('developers', {
    title: `API 串接文件 - ${TITLE}`,
    pageTitle: 'API 串接文件',
    active: 'settings',
    model: buildDocsModel(spec, `${req.protocol}://${req.get('host')}`)
  });
});

module.exports = router;
