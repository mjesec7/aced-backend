const express = require('express');
const router = express.Router();
const { 
  applyPromoCode, 
  initiatePaymePayment, 
  handleSandboxPayment,
  validateUserRoute 
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

// Main payment routes
router.post('/promo-code', applyPromoCode);
router.post('/initiate-payme', initiatePaymePayment);

// Sandbox routes for testing
router.post('/sandbox', handleSandboxPayment);
router.get('/sandbox/status', (req, res) => {
  res.json({
    message: '✅ Sandbox is running on live server',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    endpoint: 'https://api.aced.live/api/payments/sandbox',
    server: 'api.aced.live',
    frontend: 'aced.live'
  });
});

// User validation routes
router.get('/validate-user/:userId', validateUserRoute);

// Test routes for development
if (process.env.NODE_ENV !== 'production') {
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
          
        default:
          res.status(400).json({
            message: '❌ Unknown test scenario',
            availableScenarios: ['success', 'failure', 'pending']
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
  // ✅ Add production awareness
router.get('/debug/config', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV || 'development',
    server: 'api.aced.live',
    frontend: 'aced.live',
    hasPaymeMerchantId: !!process.env.PAYME_MERCHANT_ID,
    hasPaymeMerchantKey: !!process.env.PAYME_MERCHANT_KEY,
    sandboxUrl: 'https://api.aced.live/api/payments/sandbox',
    liveUrl: process.env.PAYME_API_URL_LIVE || 'https://checkout.paycom.uz/api',
    paymentAmounts: {
      start: '2600 UZS (260000 tiyin)',
      pro: '4550 UZS (455000 tiyin)'
    }
  });
});
}

// Error handling middleware for payment routes
router.use((error, req, res, next) => {
  console.error('❌ Payment route error:', error);
  
  res.status(error.status || 500).json({
    message: '❌ Payment processing error',
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;