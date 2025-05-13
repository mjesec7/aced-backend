const express = require('express');
const router = express.Router();
const { applyPromoCode, initiatePaymePayment } = require('../controllers/paymentController');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ Apply promo code and unlock access
router.post('/promo', verifyToken, applyPromoCode);

// ✅ Initiate payment through Payme
router.post('/payme', verifyToken, initiatePaymePayment);

module.exports = router;
