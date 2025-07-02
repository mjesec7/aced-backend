// routes/paymeRoutes.js - COMPLETE UPDATED WITH ALL ENDPOINTS INCLUDING FORM GENERATION

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

// In-memory storage for sandbox transactions
let sandboxTransactions = new Map();

// Helper functions for transaction management
const getTransaction = (transactionId) => {
  return sandboxTransactions.get(transactionId) || null;
};

const setTransaction = (transactionId, transaction) => {
  sandboxTransactions.set(transactionId, transaction);
};

const findTransactionById = (transactionId) => {
  for (let [key, value] of sandboxTransactions) {
    if (value.id === transactionId || key === transactionId) {
      return value;
    }
  }
  return null;
};

// Payment amounts configuration
const PAYMENT_AMOUNTS = {
  start: 26000000, // 260,000 UZS in tiyin
  pro: 45500000    // 455,000 UZS in tiyin
};

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
// PAYME FORM GENERATION ENDPOINTS (NEW)
// ======================================

// Generate payment form (POST method)
router.post('/generate-form', async (req, res) => {
  try {
    const { userId, plan, method = 'post', lang = 'ru' } = req.body;
    
    if (!userId || !plan) {
      return res.status(400).json({
        success: false,
        message: 'userId and plan are required'
      });
    }

    const User = require('../models/user');
    const user = await User.findOne({ firebaseId: userId });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const amount = PAYMENT_AMOUNTS[plan];
    const merchantId = process.env.PAYME_MERCHANT_ID;
    const transactionId = `aced_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (method === 'post') {
      // ✅ CRITICAL FIX: Use account[Login] instead of account[Login]
      const formHtml = `
        <form method="POST" action="https://checkout.paycom.uz/" id="payme-form">
          <input type="hidden" name="merchant" value="${merchantId}" />
          <input type="hidden" name="amount" value="${amount}" />
          <input type="hidden" name="account[Login]" value="${user._id}" />
          <input type="hidden" name="lang" value="${lang}" />
          <input type="hidden" name="callback" value="https://api.aced.live/api/payments/payme/return/success?transaction=${transactionId}" />
          <input type="hidden" name="callback_timeout" value="15000" />
          <input type="hidden" name="description" value="ACED ${plan.toUpperCase()} Plan Subscription" />
          <button type="submit">Pay with Payme</button>
        </form>
        <script>
          document.getElementById('payme-form').submit();
        </script>
      `;
      
      return res.json({
        success: true,
        method: 'POST',
        formHtml: formHtml,
        transaction: { id: transactionId, amount: amount, plan: plan }
      });
      
    } else if (method === 'get') {
      // ✅ CRITICAL FIX: Use ac.Login parameter
      const params = {
        m: merchantId,
        a: amount,
        l: lang,
        cr: 'UZS'
      };

      params['ac.Login'] = user._id;  // ✅ FIXED
      
      if (req.body.callback) {
        params.c = req.body.callback;
      } else {
        params.c = `https://api.aced.live/api/payments/payme/return/success?transaction=${transactionId}&userId=${userId}`;
      }
      
      params.ct = 15000;
      
      const paramString = Object.entries(params)
        .map(([key, value]) => `${key}=${value}`)
        .join(';');
      
      const encodedParams = Buffer.from(paramString).toString('base64');
      const paymentUrl = `https://checkout.paycom.uz/${encodedParams}`;
      
      return res.json({
        success: true,
        method: 'GET',
        paymentUrl,
        transaction: { id: transactionId, amount, plan }
      });
    }
    
  } catch (error) {
    console.error('❌ Form generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate payment form',
      error: error.message
    });
  }
});
// Generate payment button/QR code (according to documentation)
router.post('/generate-button', async (req, res) => {
  try {
    const { userId, plan, type = 'button', style = 'colored', lang = 'ru' } = req.body;
    
    const User = require('../models/user');
    const user = await User.findOne({ firebaseId: userId });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const amount = PAYMENT_AMOUNTS[plan];
    const merchantId = process.env.PAYME_MERCHANT_ID;
    const transactionId = `aced_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Generate HTML according to documentation.
    // Note: For button (and QR) generation, use account[Login] instead of account[Login].
    const buttonHtml = `
      <body onload="Paycom.Button('#form-payme', '#button-container')">
        <form id="form-payme" method="POST" action="https://checkout.paycom.uz/">
          <input type="hidden" name="merchant" value="${merchantId}">
          <input type="hidden" name="account[Login]" value="${user._id}">
          <input type="hidden" name="amount" value="${amount}">
          <input type="hidden" name="lang" value="${lang}">
          <input type="hidden" name="button" data-type="svg" value="${style}">
          <div id="button-container"></div>
        </form>
        <script src="https://cdn.paycom.uz/integration/js/checkout.min.js"></script>
      </body>
    `;
    
    const qrHtml = `
      <body onload="Paycom.QR('#form-payme', '#qr-container')">
        <form id="form-payme" method="POST" action="https://checkout.paycom.uz/">
          <input type="hidden" name="merchant" value="${merchantId}">
          <input type="hidden" name="account[Login]" value="${user._id}">
          <input type="hidden" name="amount" value="${amount}">
          <input type="hidden" name="lang" value="${lang}">
          <input type="hidden" name="qr" data-width="250">
          <div id="qr-container"></div>
        </form>
        <script src="https://cdn.paycom.uz/integration/js/checkout.min.js"></script>
      </body>
    `;
    
    return res.json({
      success: true,
      type: type,
      buttonHtml: type === 'button' ? buttonHtml : null,
      qrHtml: type === 'qr' ? qrHtml : null,
      transaction: {
        id: transactionId,
        amount: amount,
        plan: plan
      }
    });
    
  } catch (error) {
    console.error('❌ Button generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate payment button/QR',
      error: error.message
    });
  }
});

// ======================================
// PAYME RETURN HANDLERS (SUCCESS/FAILURE/CANCEL)
// ======================================

// ✅ PayMe Success Return Handler
router.get('/payme/return/success', async (req, res) => {
  console.log('✅ PayMe SUCCESS return:', req.query);
  
  const transactionId = req.query.transaction || req.query.id || req.query.c;
  const userId = req.query.userId || req.query.user_id;
  
  try {
    if (!transactionId) {
      console.warn('⚠️ No transaction ID in PayMe success return');
      return res.redirect('https://aced.live/payment-failed?error=missing_transaction_id');
    }

    // Check transaction status in your system
    const transaction = getTransaction(transactionId) || findTransactionById(transactionId);
    
    if (transaction) {
      // Update transaction as completed
      transaction.state = 2; // Completed
      transaction.perform_time = Date.now();
      setTransaction(transactionId, transaction);
      
      // Update user subscription if transaction is valid
      if (transaction.account?.user_id) {
        try {
          const User = require('../models/user');
          const user = await User.findOne({ firebaseId: transaction.account.user_id });
          
          if (user && transaction.plan) {
            user.subscriptionPlan = transaction.plan;
            user.paymentStatus = 'paid';
            user.lastPaymentDate = new Date();
            await user.save();
            console.log(`✅ User ${user._id} upgraded to ${transaction.plan}`);
          }
        } catch (userUpdateError) {
          console.warn('⚠️ Failed to update user subscription:', userUpdateError.message);
        }
      }
      
      // Redirect to success page with transaction details
      const successParams = new URLSearchParams({
        transaction: transactionId,
        plan: transaction.plan || 'unknown',
        amount: transaction.amount || 0,
        source: 'payme'
      });
      
      return res.redirect(`https://aced.live/payment-success?${successParams.toString()}`);
    } else {
      console.warn('⚠️ Transaction not found in our system:', transactionId);
      // Still redirect to success, but without details
      return res.redirect(`https://aced.live/payment-success?transaction=${transactionId}&source=payme`);
    }
    
  } catch (error) {
    console.error('❌ Error processing PayMe success return:', error);
    return res.redirect(`https://aced.live/payment-failed?transaction=${transactionId}&error=processing_error&source=payme`);
  }
});

// ✅ PayMe Failure Return Handler
router.get('/payme/return/failure', async (req, res) => {
  console.log('❌ PayMe FAILURE return:', req.query);
  
  const transactionId = req.query.transaction || req.query.id || req.query.c;
  const error = req.query.error || req.query.reason || 'payment_failed';
  
  // Update transaction status if we have it
  if (transactionId) {
    const transaction = getTransaction(transactionId);
    if (transaction) {
      transaction.state = -1; // Cancelled
      transaction.cancel_time = Date.now();
      transaction.reason = error;
      setTransaction(transactionId, transaction);
    }
  }
  
  const failureParams = new URLSearchParams({
    transaction: transactionId || 'unknown',
    error: error,
    source: 'payme'
  });
  
  res.redirect(`https://aced.live/payment-failed?${failureParams.toString()}`);
});

// ✅ PayMe Cancel Return Handler
router.get('/payme/return/cancel', async (req, res) => {
  console.log('🚫 PayMe CANCEL return:', req.query);
  
  const transactionId = req.query.transaction || req.query.id || req.query.c;
  
  // Update transaction status
  if (transactionId) {
    const transaction = getTransaction(transactionId);
    if (transaction) {
      transaction.state = -1; // Cancelled
      transaction.cancel_time = Date.now();
      transaction.reason = 'user_cancelled';
      setTransaction(transactionId, transaction);
    }
  }
  
  const cancelParams = new URLSearchParams({
    transaction: transactionId || 'unknown',
    error: 'payment_cancelled',
    source: 'payme'
  });
  
  res.redirect(`https://aced.live/payment-failed?${cancelParams.toString()}`);
});

// ✅ PayMe Webhook/Notification Handler
router.post('/payme/notify', async (req, res) => {
  console.log('🔔 PayMe WEBHOOK notification:', req.body);
  
  try {
    // PayMe sends JSON-RPC 2.0 notifications
    const { method, params } = req.body;
    
    if (method && params) {
      console.log(`🔔 PayMe notification method: ${method}`);
      
      // Handle different notification types
      switch (method) {
        case 'TransactionPerformed':
          if (params.transaction && params.state === 2) {
            const transactionId = params.transaction;
            const transaction = getTransaction(transactionId);
            
            if (transaction) {
              transaction.state = 2; // Completed
              transaction.perform_time = Date.now();
              setTransaction(transactionId, transaction);
              console.log(`✅ Transaction ${transactionId} marked as completed via webhook`);
            }
          }
          break;
          
        case 'TransactionCancelled':
          if (params.transaction) {
            const transactionId = params.transaction;
            const transaction = getTransaction(transactionId);
            
            if (transaction) {
              transaction.state = -1; // Cancelled
              transaction.cancel_time = Date.now();
              setTransaction(transactionId, transaction);
              console.log(`❌ Transaction ${transactionId} marked as cancelled via webhook`);
            }
          }
          break;
      }
    }
    
    // Always respond with success to PayMe
    res.json({ 
      jsonrpc: '2.0',
      result: { received: true },
      id: req.body.id || null
    });
    
  } catch (error) {
    console.error('❌ Error processing PayMe webhook:', error);
    res.status(500).json({ 
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Internal error' },
      id: req.body?.id || null
    });
  }
});

// ======================================
// MAIN PAYMENT ROUTES
// ======================================

// Promo code application
router.post('/promo-code', applyPromoCode);

// Initiate PayMe payment - UPDATED VERSION
router.post('/initiate-payme', async (req, res) => {
  try {
    const { userId, plan, name, phone } = req.body;

    console.log('🚀 PayMe payment initiation:', { userId, plan });

    if (!userId || !plan) {
      return res.status(400).json({ 
        success: false,
        message: '❌ userId and plan are required' 
      });
    }

    const allowedPlans = ['start', 'pro'];
    if (!allowedPlans.includes(plan)) {
      return res.status(400).json({ 
        success: false,
        message: '❌ Invalid plan. Allowed: start, pro' 
      });
    }

    // Find user
    const User = require('../models/user');
    let user = await User.findOne({ firebaseId: userId }).catch(() => null) ||
               await User.findById(userId).catch(() => null) ||
               await User.findOne({ email: userId }).catch(() => null);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: '❌ User not found' 
      });
    }

    const amount = PAYMENT_AMOUNTS[plan];
    if (!amount) {
      return res.status(400).json({ 
        success: false,
        message: '❌ Invalid plan amount' 
      });
    }

    const transactionId = `aced_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isProduction = process.env.NODE_ENV === 'production';
    const merchantId = process.env.PAYME_MERCHANT_ID;

    // Store transaction in our system
    const transaction = {
      id: transactionId,
      userId: user._id,
      amount: amount,
      plan: plan,
      state: 1, // Created
      create_time: Date.now(),
      perform_time: 0,
      account: { 
        Login: user._id,
        user_id: user._id 
      }
    };
    setTransaction(transactionId, transaction);

    if (isProduction && merchantId) {
      // PRODUCTION: Direct to PayMe
      const paymeParams = {
        m: merchantId,                    // Merchant ID
        'ac.Login': user._id,      // Account ID
        a: amount,                        // Amount in tiyin
        c: transactionId,                 // Our transaction ID
        ct: Date.now(),                   // Timestamp
        l: 'uz',                         // Language
        cr: 'UZS'                        // Currency
      };

      const paymentUrl = `https://checkout.paycom.uz/?${new URLSearchParams(paymeParams).toString()}`;
      
      console.log('🔗 Production PayMe URL generated');

      return res.status(200).json({
        success: true,
        message: '✅ Redirecting to PayMe checkout',
        paymentUrl: paymentUrl,
        transaction: {
          id: transactionId,
          amount: amount,
          plan: plan,
          state: 1
        },
        metadata: {
          userId: userId,
          plan: plan,
          amountUzs: amount / 100,
          environment: 'production'
        }
      });
    } else {
      // DEVELOPMENT: Our checkout page
      const checkoutUrl = `https://aced.live/payment/checkout?${new URLSearchParams({
        transactionId: transactionId,
        userId: user._id,
        amount: amount,
        amountUzs: amount / 100,
        plan: plan,
        userName: user.name || 'User',
        userEmail: user.email || '',
        currentPlan: user.subscriptionPlan || 'free'
      }).toString()}`;

      console.log('🧪 Development: Redirecting to checkout page');

      return res.status(200).json({
        success: true,
        message: '✅ Development checkout',
        paymentUrl: checkoutUrl,
        transaction: {
          id: transactionId,
          amount: amount,
          plan: plan,
          state: 1
        },
        metadata: {
          userId: userId,
          plan: plan,
          amountUzs: amount / 100,
          environment: 'development'
        }
      });
    }

  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Payment initiation failed',
      error: error.message
    });
  }
});

// ======================================
// DEVELOPMENT SIMULATION ENDPOINTS
// ======================================

// Initialize payment (for checkout page) - UPDATED
router.post('/initialize', async (req, res) => {
  try {
    const { transactionId, cardNumber, expiryDate, cardHolder, amount, userId, plan } = req.body;
    
    console.log('💳 Development: Simulating card initialization');
    
    // Basic validation
    if (!cardNumber || !expiryDate || !cardHolder) {
      return res.json({
        success: false,
        message: 'Missing card details'
      });
    }
    
    // Check card type
    const cleanNumber = cardNumber.replace(/\s/g, '');
    let cardType = null;
    
    if (cleanNumber.startsWith('8600') || cleanNumber.startsWith('9860') || 
        cleanNumber.startsWith('5440') || cleanNumber.startsWith('6440')) {
      cardType = 'Humo';
    } else if (cleanNumber.startsWith('5614') || cleanNumber.startsWith('6262')) {
      cardType = 'UzCard';
    }
    
    if (!cardType) {
      return res.json({
        success: false,
        message: 'Only Humo and UzCard are supported'
      });
    }
    
    // In development, just return success
    // In production, PayMe handles this
    return res.json({
      success: true,
      requiresSms: true,
      maskedPhone: '+998 ** *** **56', // Fake masked phone
      cardType: cardType,
      message: 'SMS code sent (development mode - use any 6 digits)'
    });
    
  } catch (error) {
    console.error('Initialize error:', error);
    res.status(500).json({
      success: false,
      message: 'Initialization failed'
    });
  }
});

// Verify SMS code - UPDATED
router.post('/verify-sms', async (req, res) => {
  try {
    const { transactionId, smsCode } = req.body;
    
    console.log('📱 Development: Simulating SMS verification');
    
    if (!smsCode || smsCode.length !== 6) {
      return res.json({
        success: false,
        message: 'SMS code must be 6 digits'
      });
    }
    
    // In development, accept any 6-digit code
    // In production, PayMe handles this
    return res.json({
      success: true,
      message: 'SMS verified successfully (development mode)'
    });
    
  } catch (error) {
    console.error('SMS verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed'
    });
  }
});

// Complete payment - UPDATED
router.post('/complete', async (req, res) => {
  try {
    const { transactionId, userId, plan } = req.body;
    
    console.log('✅ Development: Completing payment');
    
    // Find user and update subscription
    const User = require('../models/user');
    let user = await User.findOne({ firebaseId: userId });
    
    if (!user) {
      // Try other search methods
      user = await User.findById(userId).catch(() => null) ||
             await User.findOne({ email: userId }).catch(() => null);
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Update subscription
    user.subscriptionPlan = plan;
    user.paymentStatus = 'paid';
    user.lastPaymentDate = new Date();
    await user.save();
    
    // Update transaction if exists
    if (sandboxTransactions && sandboxTransactions.has(transactionId)) {
      const transaction = sandboxTransactions.get(transactionId);
      transaction.state = 2; // Completed
      transaction.perform_time = Date.now();
    }
    
    console.log('✅ Payment completed for user:', user._id);
    
    return res.json({
      success: true,
      message: 'Payment completed successfully',
      user: {
        id: user._id,
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
    console.error('Payment completion error:', error);
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
  // List all sandbox transactions - UPDATED to use local storage
  router.get('/transactions', (req, res) => {
    const transactions = Array.from(sandboxTransactions.values());
    res.json({
      message: '✅ Sandbox transactions',
      count: transactions.length,
      transactions: transactions,
      timestamp: new Date().toISOString()
    });
  });
  
  // Clear all sandbox transactions - UPDATED
  router.delete('/transactions/clear', (req, res) => {
    const count = sandboxTransactions.size;
    sandboxTransactions.clear();
    res.json({
      message: `✅ Cleared ${count} sandbox transactions`,
      timestamp: new Date().toISOString()
    });
  });
  
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
        generateForm: 'POST /api/payments/generate-form',
        generateButton: 'POST /api/payments/generate-button',
        initialize: 'POST /api/payments/initialize',
        verifySms: 'POST /api/payments/verify-sms',
        complete: 'POST /api/payments/complete',
        sandbox: 'POST /api/payments/sandbox',
        webhook: 'POST /api/payments/webhook',
        status: 'GET /api/payments/status/:transactionId/:userId?',
        transactions: 'GET /api/payments/transactions',
        clearTransactions: 'DELETE /api/payments/transactions/clear',
        setAccountState: 'POST /api/payments/sandbox/account-state',
        setMerchantKey: 'POST /api/payments/sandbox/merchant-key',
        paymeReturnSuccess: 'GET /api/payments/payme/return/success',
        paymeReturnFailure: 'GET /api/payments/payme/return/failure',
        paymeReturnCancel: 'GET /api/payments/payme/return/cancel',
        paymeNotify: 'POST /api/payments/payme/notify'
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
      generateForm: 'POST /api/payments/generate-form',
      generateButton: 'POST /api/payments/generate-button',
      initialize: 'POST /api/payments/initialize',
      verifySms: 'POST /api/payments/verify-sms',
      complete: 'POST /api/payments/complete',
      sandbox: 'POST /api/payments/sandbox',
      webhook: 'POST /api/payments/webhook',
      status: 'GET /api/payments/status/:transactionId/:userId?',
      validateUser: 'GET /api/payments/validate-user/:userId',
      setAccountState: 'POST /api/payments/sandbox/account-state',
      setMerchantKey: 'POST /api/payments/sandbox/merchant-key',
      paymeReturnSuccess: 'GET /api/payments/payme/return/success',
      paymeReturnFailure: 'GET /api/payments/payme/return/failure',
      paymeReturnCancel: 'GET /api/payments/payme/return/cancel',
      paymeNotify: 'POST /api/payments/payme/notify'
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
      'POST /api/payments/generate-form',
      'POST /api/payments/generate-button',
      'POST /api/payments/initialize',
      'POST /api/payments/verify-sms',
      'POST /api/payments/complete',
      'POST /api/payments/sandbox',
      'POST /api/payments/webhook',
      'GET /api/payments/status/:transactionId/:userId?',
      'GET /api/payments/validate-user/:userId',
      'GET /api/payments/health',
      'POST /api/payments/sandbox/account-state',
      'POST /api/payments/sandbox/merchant-key',
      'GET /api/payments/payme/return/success',
      'GET /api/payments/payme/return/failure',
      'GET /api/payments/payme/return/cancel',
      'POST /api/payments/payme/notify'
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