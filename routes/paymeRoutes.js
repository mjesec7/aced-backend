// routes/paymeRoutes.js - UPDATED WITH ALL NEW ENDPOINTS

const express = require('express');
const router = express.Router();
const { 
  applyPromoCode, 
  initiatePaymePayment, 
  handleSandboxPayment,
  validateUserRoute,
  checkPaymentStatus,
  handlePaymeWebhook,
  listTransactions,
  clearSandboxTransactions
} = require('../controllers/paymentController');

// Middleware for logging requests in development
const logRequests = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📝 ${req.method} ${req.path}`, {
      body: req.body,
      params: req.params,
      query: req.query,
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Apply logging middleware
router.use(logRequests);

// ======================================
// MAIN PAYMENT ROUTES
// ======================================

// Promo code application
router.post('/promo-code', applyPromoCode);

// Initiate PayMe payment
router.post('/initiate-payme', initiatePaymePayment);

// ======================================
// PAYME SANDBOX & WEBHOOK ROUTES
// ======================================

// Main sandbox endpoint for PayMe API testing
router.post('/sandbox', handleSandboxPayment);

// Sandbox status check
router.get('/sandbox/status', (req, res) => {
  res.json({
    message: '✅ Sandbox is running on live server',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    endpoint: 'https://api.aced.live/api/payments/sandbox',
    server: 'api.aced.live',
    frontend: 'aced.live',
    availableMethods: [
      'CheckPerformTransaction',
      'CreateTransaction',
      'PerformTransaction',
      'CancelTransaction',
      'CheckTransaction',
      'GetStatement',
      'ChangePassword'
    ]
  });
});

// PayMe webhook endpoint for notifications
router.post('/webhook', handlePaymeWebhook);

// ======================================
// VALIDATION & STATUS ROUTES
// ======================================

// User validation
router.get('/validate-user/:userId', validateUserRoute);

// Payment status check (with optional userId)
router.get('/status/:transactionId/:userId?', checkPaymentStatus);
router.get('/status/:transactionId', checkPaymentStatus);

// ======================================
// DEBUG & TESTING ROUTES (Development Only)
// ======================================

if (process.env.NODE_ENV !== 'production') {
  // List all sandbox transactions
  router.get('/transactions', listTransactions);
  
  // Clear all sandbox transactions
  router.delete('/transactions/clear', clearSandboxTransactions);
  
  // Test endpoint to simulate different payment scenarios
  router.post('/test/scenario', async (req, res) => {
    const { scenario, userId, plan } = req.body;
    
    try {
      switch (scenario) {
        case 'success':
          res.json({
            success: true,
            message: '✅ Payment successful (test)',
            transaction: {
              id: 'test_' + Date.now(),
              state: 2,
              amount: plan === 'pro' ? 455000 : 260000
            }
          });
          break;
          
        case 'failure':
          res.status(400).json({
            success: false,
            message: '❌ Payment failed (test)',
            error: {
              code: -31008,
              message: { ru: 'Недостаточно средств', en: 'Insufficient funds' }
            }
          });
          break;
          
        case 'pending':
          res.json({
            success: true,
            message: '⏳ Payment pending (test)',
            transaction: {
              id: 'test_' + Date.now(),
              state: 1,
              amount: plan === 'pro' ? 455000 : 260000
            }
          });
          break;
          
        case 'cancelled':
          res.json({
            success: true,
            message: '❌ Payment cancelled (test)',
            transaction: {
              id: 'test_' + Date.now(),
              state: -1,
              amount: plan === 'pro' ? 455000 : 260000
            }
          });
          break;
          
        default:
          res.status(400).json({
            message: '❌ Unknown test scenario',
            availableScenarios: ['success', 'failure', 'pending', 'cancelled']
          });
      }
    } catch (error) {
      res.status(500).json({
        message: '❌ Test scenario error',
        error: error.message
      });
    }
  });

  // Debug endpoint to check configuration
  router.get('/debug/config', (req, res) => {
    res.json({
      environment: process.env.NODE_ENV || 'development',
      server: 'api.aced.live',
      frontend: 'aced.live',
      hasPaymeMerchantId: !!process.env.PAYME_MERCHANT_ID,
      hasPaymeMerchantKey: !!process.env.PAYME_MERCHANT_KEY,
      sandboxUrl: 'https://api.aced.live/api/payments/sandbox',
      liveUrl: process.env.PAYME_API_URL_LIVE || 'https://checkout.paycom.uz/api',
      webhookUrl: 'https://api.aced.live/api/payments/webhook',
      paymentAmounts: {
        start: '2600 UZS (260000 tiyin)',
        pro: '4550 UZS (455000 tiyin)'
      },
      transactionStates: {
        1: 'Created (waiting for payment)',
        2: 'Completed (paid)',
        '-1': 'Cancelled (before payment)',
        '-2': 'Cancelled (refunded)'
      },
      routes: {
        sandbox: 'POST /api/payments/sandbox',
        webhook: 'POST /api/payments/webhook',
        status: 'GET /api/payments/status/:transactionId/:userId?',
        transactions: 'GET /api/payments/transactions',
        clearTransactions: 'DELETE /api/payments/transactions/clear'
      }
    });
  });
  
  // Test endpoint to create a sample transaction
  router.post('/test/create-transaction', async (req, res) => {
    const { userId, plan } = req.body;
    
    if (!userId || !plan) {
      return res.status(400).json({
        message: '❌ userId and plan are required'
      });
    }
    
    const transactionId = 'test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const amount = plan === 'pro' ? 455000 : 260000;
    
    res.json({
      message: '✅ Test transaction created',
      transaction: {
        id: transactionId,
        amount: amount,
        amountUzs: amount / 100,
        plan: plan,
        userId: userId,
        paymentUrl: `https://aced.live/payment/checkout/${transactionId}`,
        sandbox: true
      }
    });
  });
}

// ======================================
// HEALTH CHECK
// ======================================

router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Payment Routes',
    timestamp: new Date().toISOString(),
    server: 'api.aced.live',
    endpoints: {
      promo: 'POST /api/payments/promo-code',
      initiate: 'POST /api/payments/initiate-payme',
      sandbox: 'POST /api/payments/sandbox',
      webhook: 'POST /api/payments/webhook',
      status: 'GET /api/payments/status/:transactionId/:userId?',
      validateUser: 'GET /api/payments/validate-user/:userId'
    }
  });
});

// ======================================
// ERROR HANDLING
// ======================================

// 404 handler for payment routes
router.use('*', (req, res) => {
  res.status(404).json({
    message: '❌ Payment endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'POST /api/payments/promo-code',
      'POST /api/payments/initiate-payme',
      'POST /api/payments/sandbox',
      'POST /api/payments/webhook',
      'GET /api/payments/status/:transactionId/:userId?',
      'GET /api/payments/validate-user/:userId',
      'GET /api/payments/health'
    ]
  });
});

// Error handling middleware for payment routes
router.use((error, req, res, next) => {
  console.error('❌ Payment route error:', error);
  
  // Check if it's a PayMe error format
  if (error.code && typeof error.code === 'number' && error.code < 0) {
    return res.status(200).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: error.code,
        message: error.message || { ru: 'Ошибка', en: 'Error', uz: 'Xato' },
        data: error.data || null
      }
    });
  }
  
  // Standard error response
  res.status(error.status || 500).json({
    message: '❌ Payment processing error',
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;