const express = require('express');
const router = express.Router();
const { applyPromoCode } = require('../controllers/paymentController');

// POST /api/payments/promo
router.post('/promo', applyPromoCode);

module.exports = router;
