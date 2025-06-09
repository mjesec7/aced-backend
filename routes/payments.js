// routes/payments.js - UPDATED WITH ADDITIONAL AUTHENTICATED ENDPOINTS

const express = require('express');
const router = express.Router();
const { 
  applyPromoCode, 
  initiatePaymePayment,
  checkPaymentStatus,
  listTransactions
} = require('../controllers/paymentController');
const verifyToken = require('../middlewares/authMiddleware');

// ======================================
// AUTHENTICATED PAYMENT ROUTES
// ======================================

// Apply a promo code (unlocks subscription)
router.post('/promo', verifyToken, applyPromoCode);

// Initiate a Payme payment from the frontend
router.post('/payme', verifyToken, initiatePaymePayment);

// Check payment status (authenticated version)
router.get('/status/:transactionId', verifyToken, async (req, res, next) => {
  // Add the userId from the authenticated user to the params
  req.params.userId = req.user?.uid || req.user?.id;
  return checkPaymentStatus(req, res, next);
});

// Get user's transaction history (authenticated)
router.get('/my-transactions', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        message: '❌ User ID not found in token',
        success: false
      });
    }
    
    // In a real implementation, you would filter transactions by userId
    // For now, we'll return a message indicating this is a placeholder
    res.json({
      message: '✅ User transactions endpoint',
      userId: userId,
      note: 'This endpoint would return user-specific transactions in production',
      transactions: []
    });
    
  } catch (error) {
    console.error('❌ Error fetching user transactions:', error);
    res.status(500).json({
      message: '❌ Error fetching transactions',
      error: error.message
    });
  }
});

// ======================================
// HEALTH CHECK
// ======================================

router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Authenticated Payment Routes',
    timestamp: new Date().toISOString(),
    endpoints: {
      promo: 'POST /api/payments/promo (requires auth)',
      initiate: 'POST /api/payments/payme (requires auth)',
      status: 'GET /api/payments/status/:transactionId (requires auth)',
      myTransactions: 'GET /api/payments/my-transactions (requires auth)'
    }
  });
});

// ======================================
// ERROR HANDLING
// ======================================

// 404 handler
router.use('*', (req, res) => {
  res.status(404).json({
    message: '❌ Authenticated payment endpoint not found',
    path: req.originalUrl,
    method: req.method,
    note: 'All endpoints in this route require authentication',
    availableEndpoints: [
      'POST /api/payments/promo',
      'POST /api/payments/payme',
      'GET /api/payments/status/:transactionId',
      'GET /api/payments/my-transactions',
      'GET /api/payments/health'
    ]
  });
});

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('❌ Authenticated payment route error:', error);
  
  res.status(error.status || 500).json({
    message: '❌ Payment processing error',
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    authenticated: true,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;