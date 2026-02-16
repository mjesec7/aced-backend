// routes/exchangeRateRoutes.js
const express = require('express');
const router = express.Router();
const { getExchangeRate } = require('../controllers/exchangeRateController');

// Public endpoint - no auth required (cached, rate-limited by default Express settings)
router.get('/', getExchangeRate);

module.exports = router;
