// routes/paymeRoutes.js - COMPLETE UPDATED WITH ALL ENDPOINTS

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
  clearSandboxTransactions,
  setAccountState,
  setMerchantKey
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
// PAYME CHECKOUT ENDPOINTS (NEW)
// ======================================

// Initialize payment (for checkout page)
router.post('/initialize', async (req, res) => {
  try {
    const { transactionId, cardNumber, expiryDate, cardHolder, amount, userId, plan } = req.body;
    
    console.log('💳 Payment initialization request:', {
      transactionId,
      cardNumber: cardNumber ? cardNumber.slice(0, 4) + '****' + cardNumber.slice(-4) : 'None',
      amount,
      userId,
      plan
    });
    
    // Validate required fields
    if (!transactionId || !cardNumber || !expiryDate || !cardHolder || !amount || !userId || !plan) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Simulate card validation
    const cardType = cardNumber.startsWith('8600') || cardNumber.startsWith('9860') || 
                    cardNumber.startsWith('5440') || cardNumber.startsWith('6440') ? 'Humo' : 
                    cardNumber.startsWith('5614') || cardNumber.startsWith('6262') ? 'UzCard' : null;
    
    if (!cardType) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported card type. Please use Humo (8600, 9860, 5440, 6440) or UzCard (5614, 6262)'
      });
    }
    
    // For Uzbek cards, require SMS verification
    if (cardType === 'Humo' || cardType === 'UzCard') {
      return res.json({
        success: true,
        requiresSms: true,
        maskedPhone: '+998 ** *** **12',
        cardType,
        message: 'SMS verification required'
      });
    }
    
    // For other cards, proceed directly
    return res.json({
      success: true,
      requiresSms: false,
      cardType,
      message: 'Card validated successfully'
    });
    
  } catch (error) {
    console.error('❌ Payment initialization error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment initialization failed',
      error: error.message
    });
  }
});

// Verify SMS code
router.post('/verify-sms', async (req, res) => {
  try {
    const { transactionId, smsCode } = req.body;
    
    console.log('📱 SMS verification request:', {
      transactionId,
      smsCodeLength: smsCode?.length
    });
    
    if (!transactionId || !smsCode) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID and SMS code are required'
      });
    }
    
    if (smsCode.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'SMS code must be 6 digits'
      });
    }
    
    // For demo purposes, accept any 6-digit code
    // In production, this would verify with the actual bank/PayMe
    return res.json({
      success: true,
      message: 'SMS code verified successfully'
    });
    
  } catch (error) {
    console.error('❌ SMS verification error:', error);
    res.status(500).json({
      success: false,
      message: 'SMS verification failed',
      error: error.message
    });
  }
});

// Complete payment
router.post('/complete', async (req, res) => {
  try {
    const { transactionId, userId, plan, cardType, cardLast4 } = req.body;
    
    console.log('✅ Payment completion request:', {
      transactionId,
      userId,
      plan,
      cardType,
      cardLast4
    });
    
    if (!transactionId || !userId || !plan) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Find and update user subscription
    const User = require('../models/user');
    let user = null;
    
    try {
      // Try different search methods for user
      if (userId.length >= 20 && !userId.match(/^[0-9a-fA-F]{24}$/)) {
        user = await User.findOne({ firebaseId: userId });
      } else if (userId.match(/^[0-9a-fA-F]{24}$/)) {
        user = await User.findById(userId);
      } else {
        user = await User.findOne({
          $or: [
            { firebaseId: userId },
            { email: userId }
          ]
        });
      }
    } catch (searchError) {
      if (searchError.name === 'CastError') {
        user = await User.findOne({ firebaseId: userId });
      }
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Update user subscription
    user.subscriptionPlan = plan;
    user.paymentStatus = 'paid';
    user.lastPaymentDate = new Date();
    
    await user.save();
    
    console.log('✅ User subscription updated:', {
      userId: user.firebaseId,
      newPlan: plan
    });
    
    return res.json({
      success: true,
      message: 'Payment completed successfully',
      user: {
        id: user.firebaseId,
        plan: user.subscriptionPlan,
        paymentStatus: user.paymentStatus
      },
      transaction: {
        id: transactionId,
        status: 'completed',
        completedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Payment completion error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment completion failed',
      error: error.message
    });
  }
});

// ======================================
// PAYME SANDBOX & WEBHOOK ROUTES
// ======================================

// Main sandbox endpoint for PayMe API testing
router.post('/sandbox', handleSandboxPayment);

// Set account state for testing
router.post('/sandbox/account-state', setAccountState);

// Set merchant key for testing
router.post('/sandbox/merchant-key', setMerchantKey);

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
              amount: plan === 'pro' ? 45500000 : 26000000
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
              amount: plan === 'pro' ? 45500000 : 26000000
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
              amount: plan === 'pro' ? 45500000 : 26000000
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
        start: '260,000 UZS (26000000 tiyin)',
        pro: '455,000 UZS (45500000 tiyin)'
      },
      transactionStates: {
        1: 'Created (waiting for payment)',
        2: 'Completed (paid)',
        '-1': 'Cancelled (before payment)',
        '-2': 'Cancelled (refunded)'
      },
      routes: {
        initialize: 'POST /api/payments/initialize',
        verifySms: 'POST /api/payments/verify-sms',
        complete: 'POST /api/payments/complete',
        sandbox: 'POST /api/payments/sandbox',
        webhook: 'POST /api/payments/webhook',
        status: 'GET /api/payments/status/:transactionId/:userId?',
        transactions: 'GET /api/payments/transactions',
        clearTransactions: 'DELETE /api/payments/transactions/clear',
        setAccountState: 'POST /api/payments/sandbox/account-state',
        setMerchantKey: 'POST /api/payments/sandbox/merchant-key'
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
    const amount = plan === 'pro' ? 45500000 : 26000000;
    
    res.json({
      message: '✅ Test transaction created',
      transaction: {
        id: transactionId,
        amount: amount,
        amountUzs: amount / 100,
        plan: plan,
        userId: userId,
        checkoutUrl: `https://aced.live/payment/checkout?${new URLSearchParams({
          transactionId,
          userId,
          amount,
          plan,
          amountUzs: amount / 100,
          userName: 'Test User',
          userEmail: 'test@example.com',
          currentPlan: 'free'
        }).toString()}`,
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
      initialize: 'POST /api/payments/initialize',
      verifySms: 'POST /api/payments/verify-sms',
      complete: 'POST /api/payments/complete',
      sandbox: 'POST /api/payments/sandbox',
      webhook: 'POST /api/payments/webhook',
      status: 'GET /api/payments/status/:transactionId/:userId?',
      validateUser: 'GET /api/payments/validate-user/:userId',
      setAccountState: 'POST /api/payments/sandbox/account-state',
      setMerchantKey: 'POST /api/payments/sandbox/merchant-key'
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
      'POST /api/payments/initialize',
      'POST /api/payments/verify-sms',
      'POST /api/payments/complete',
      'POST /api/payments/sandbox',
      'POST /api/payments/webhook',
      'GET /api/payments/status/:transactionId/:userId?',
      'GET /api/payments/validate-user/:userId',
      'GET /api/payments/health',
      'POST /api/payments/sandbox/account-state',
      'POST /api/payments/sandbox/merchant-key'
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