// routes/payments.js

const express = require('express');
const router = express.Router();
const { applyPromoCode, initiatePaymePayment } = require('../controllers/paymentController');
const verifyToken = require('../middlewares/authMiddleware');

// Apply a promo code (unlocks subscription)
router.post('/promo', verifyToken, applyPromoCode);

// Initiate a Payme payment (sandbox) from the frontend
router.post('/payme', verifyToken, initiatePaymePayment);

module.exports = router;
