// routes/payments.js - COMPLETE Payment Routes with ROOT ENDPOINT FIX

const express = require('express');
const router = express.Router();

// Import payment controllers
let paymentController;
try {
  paymentController = require('../controllers/paymentController');
} catch (error) {
  console.error('❌ Failed to load payment controller:', error.message);
}

const { 
  handleSandboxPayment,
  initiatePaymePayment,
  validatePaymeAuth,
  PaymeErrorCode,
  PAYMENT_AMOUNTS
} = paymentController || {};

// ================================
// 🚨 CRITICAL: PayMe Root Webhook Endpoint
// ================================

// PayMe sends webhooks to the root `/api/payments` endpoint
// This is the MAIN endpoint that PayMe expects to find
router.post('/', async (req, res) => {

  
  try {
    if (handleSandboxPayment) {
      // Use the existing PayMe handler
      handleSandboxPayment(req, res);
    } else {
      // Emergency fallback for PayMe JSON-RPC
      const { method, params, id } = req.body || {};
      
      
      if (method === 'CheckPerformTransaction') {
        return res.status(200).json({
          jsonrpc: "2.0",
          id: id,
          result: {
            allow: true,
            detail: {
              receipt_type: 0,
              items: [{
                title: "ACED Subscription",
                price: params?.amount || 26000000,
                count: 1,
                code: "10899002001000000",
                vat_percent: 0,
                package_code: "1"
              }]
            }
          }
        });
      }
      
      if (method === 'CreateTransaction') {
        const transactionId = params?.id || `emergency_${Date.now()}`;
        return res.status(200).json({
          jsonrpc: "2.0",
          id: id,
          result: {
            create_time: Date.now(),
            transaction: transactionId,
            state: 1,
            receivers: null
          }
        });
      }
      
      if (method === 'PerformTransaction') {
        return res.status(200).json({
          jsonrpc: "2.0",
          id: id,
          result: {
            transaction: params?.id || `emergency_${Date.now()}`,
            perform_time: Date.now(),
            state: 2
          }
        });
      }
      
      if (method === 'CheckTransaction') {
        return res.status(200).json({
          jsonrpc: "2.0",
          id: id,
          result: {
            create_time: Date.now() - 300000, // 5 minutes ago
            perform_time: Date.now(),
            cancel_time: 0,
            transaction: params?.id || `emergency_${Date.now()}`,
            state: 2,
            reason: null
          }
        });
      }
      
      if (method === 'CancelTransaction') {
        return res.status(200).json({
          jsonrpc: "2.0",
          id: id,
          result: {
            transaction: params?.id || `emergency_${Date.now()}`,
            cancel_time: Date.now(),
            state: -1
          }
        });
      }
      
      if (method === 'GetStatement') {
        return res.status(200).json({
          jsonrpc: "2.0",
          id: id,
          result: {
            transactions: []
          }
        });
      }
      
      if (method === 'ChangePassword') {
        return res.status(200).json({
          jsonrpc: "2.0",
          id: id,
          result: {
            success: true
          }
        });
      }
      
      // Generic error response for unknown methods
      res.status(200).json({
        jsonrpc: "2.0",
        id: id || null,
        error: {
          code: -32601,
          message: {
            ru: "Метод не найден",
            en: "Method not found", 
            uz: "Usul topilmadi"
          }
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error in root PayMe webhook:', error);
    
    // Final fallback
    res.status(200).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: {
          ru: "Внутренняя ошибка",
          en: "Internal error",
          uz: "Ichki xatolik"
        }
      }
    });
  }
});

// GET endpoint for testing the root
router.get('/', (req, res) => {
  res.json({
    message: '✅ PayMe root endpoint is active',
    server: 'api.aced.live',
    endpoint: '/api/payments',
    timestamp: new Date().toISOString(),
    note: 'This is the main PayMe webhook endpoint',
    supportedMethods: [
      'CheckPerformTransaction',
      'CreateTransaction', 
      'PerformTransaction',
      'CancelTransaction',
      'CheckTransaction',
      'GetStatement',
      'ChangePassword'
    ],
    configuration: {
      merchantId: process.env.PAYME_MERCHANT_ID ? 'configured' : 'missing',
      merchantKey: process.env.PAYME_MERCHANT_KEY ? 'configured' : 'missing',
      environment: process.env.NODE_ENV || 'development',
      controllerLoaded: !!handleSandboxPayment
    }
  });
});

// ================================
// EXISTING ROUTES (from your original payments.js)
// ================================

// ✅ PayMe Webhook Route (alternative endpoint)
router.post('/webhook/payme', (req, res) => {
  if (handleSandboxPayment) {
    handleSandboxPayment(req, res);
  } else {
    res.status(503).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: { ru: "Сервис недоступен", en: "Service unavailable", uz: "Xizmat mavjud emas" }
      }
    });
  }
});

// ✅ Payment Initiation Route (for frontend to call)
// Now accepts: userId, plan, amount, duration, promoCode, promoDiscount, originalAmount, userEmail, userName
router.post('/initiate', async (req, res) => {
  try {
    const {
      userId,
      plan = 'pro',
      amount,              // Amount in tiyin (already calculated with discount)
      duration = 1,        // Duration in months (1, 3, or 6)
      promoCode,           // Applied promo code (if any)
      promoDiscount,       // Discount amount in tiyin
      originalAmount,      // Original amount before discount
      userEmail,
      userName,
      additionalData = {}
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }

    // Import subscription config for pricing
    const { getTierByDuration, SUBSCRIPTION_TIERS } = require('../config/subscriptionConfig');

    // Get tier based on duration
    const tier = getTierByDuration(parseInt(duration) || 1);
    if (!tier) {
      return res.status(400).json({
        success: false,
        message: 'Invalid duration. Must be 1, 3, or 6 months.'
      });
    }

    // Calculate final amount
    let finalAmount = amount || tier.priceInTiyin;
    let originalAmountValue = originalAmount || tier.priceInTiyin;

    // If promo discount is applied, validate it
    if (promoDiscount && promoDiscount > 0) {
      // Ensure discount doesn't exceed original amount
      const discountValue = Math.min(promoDiscount, originalAmountValue);
      finalAmount = originalAmountValue - discountValue;

      // Ensure minimum amount (1000 sum = 100000 tiyin)
      if (finalAmount < 100000 && finalAmount > 0) {
        finalAmount = 100000;
      }
    }

    // Generate transaction ID
    const transactionId = `aced_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isProduction = process.env.NODE_ENV === 'production';

    // Store transaction metadata for later reference
    const transactionMeta = {
      id: transactionId,
      userId,
      plan,
      duration: parseInt(duration),
      amount: finalAmount,
      originalAmount: originalAmountValue,
      promoCode: promoCode || null,
      promoDiscount: promoDiscount || 0,
      userEmail: userEmail || null,
      userName: userName || null,
      createdAt: new Date().toISOString()
    };

    // Try to use the main payment controller
    if (initiatePaymePayment) {
      // Enhance request body with processed values
      req.body.amount = finalAmount;
      req.body.duration = parseInt(duration);
      req.body.transactionMeta = transactionMeta;
      return initiatePaymePayment(req, res);
    }

    // Fallback payment initiation
    if (isProduction && process.env.PAYME_MERCHANT_ID) {
      const paymeParams = new URLSearchParams({
        m: process.env.PAYME_MERCHANT_ID,
        'ac.Login': userId,
        a: finalAmount,
        c: transactionId,
        l: 'uz',
        cr: 'UZS'
      });

      const paymentUrl = `https://checkout.paycom.uz/?${paymeParams.toString()}`;

      return res.json({
        success: true,
        paymentUrl: paymentUrl,
        transaction: transactionMeta
      });
    } else {
      const checkoutUrl = `https://aced.live/payment/checkout?${new URLSearchParams({
        transactionId,
        userId,
        amount: finalAmount,
        plan,
        duration
      }).toString()}`;

      return res.json({
        success: true,
        paymentUrl: checkoutUrl,
        transaction: transactionMeta
      });
    }

  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Alternative endpoint names to match your frontend
router.post('/initiate-payme', (req, res) => {
  if (initiatePaymePayment) {
    initiatePaymePayment(req, res);
  } else {
    // Redirect to /initiate
    req.url = '/initiate';
    router.handle(req, res);
  }
});

// ✅ User validation route (matching your frontend calls)
router.get('/validate-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find user
    const User = require('../models/user');
    const mongoose = require('mongoose');
    
    const user = await User.findOne({
      $or: [
        { firebaseId: userId },
        { _id: mongoose.isValidObjectId(userId) ? userId : null },
        { email: userId }
      ]
    });
    
    if (user) {
      res.json({
        success: true,
        valid: true,
        user: {
          id: user._id,
          firebaseId: user._id,
          name: user.name,
          email: user.email,
          subscriptionPlan: user.subscriptionPlan || 'free'
        },
        source: 'database'
      });
    } else {
      // Development fallback for testing
      if (process.env.NODE_ENV === 'development') {
        res.json({
          success: true,
          valid: true,
          user: {
            id: userId,
            firebaseId: userId,
            name: 'Test User',
            email: 'test@example.com',
            subscriptionPlan: 'free'
          },
          source: 'development_fallback',
          note: 'User validation passed in development mode'
        });
      } else {
        res.status(404).json({
          success: false,
          valid: false,
          error: 'Пользователь не найден'
        });
      }
    }
    
  } catch (error) {
    console.error('❌ User validation error:', error);
    res.status(500).json({
      success: false,
      valid: false,
      error: 'Ошибка проверки пользователя'
    });
  }
});

// ✅ Get Payment Plans Route (for frontend pricing)
// Now returns subscription tiers with duration-based pricing
router.get('/plans', (req, res) => {
  try {
    // Import subscription config
    let subscriptionConfig;
    try {
      subscriptionConfig = require('../config/subscriptionConfig');
    } catch (configError) {
      console.error('❌ Failed to load subscription config:', configError);
    }

    // If we have the config, return duration-based tiers
    if (subscriptionConfig && subscriptionConfig.getAllTiers) {
      const tiers = subscriptionConfig.getAllTiers();

      const plans = {
        tiers: tiers.map(tier => ({
          id: tier.id,
          duration: tier.durationMonths,
          durationDays: tier.duration,
          label: tier.label,
          description: tier.description,
          priceInTiyin: tier.priceInTiyin,
          priceInUZS: tier.priceInUZS,
          displayPrice: tier.displayPrice,
          currency: tier.currency,
          savings: tier.savings,
          savingsPercentage: tier.savingsPercentage,
          pricePerMonth: tier.pricePerMonth || Math.round(tier.priceInUZS / tier.durationMonths),
          featured: tier.featured || false
        })),
        pro: {
          name: 'Pro Plan',
          features: [
            'Full access to all courses',
            'Unlimited AI chat messages',
            'Unlimited AI image analysis',
            'Priority support',
            'Advanced analytics',
            'Homework assistance',
            'Test preparation'
          ]
        }
      };

      return res.json({
        success: true,
        plans: plans
      });
    }

    // Fallback to legacy format
    const planAmounts = PAYMENT_AMOUNTS || { start: 26000000, pro: 45500000 };

    const plans = {
      tiers: [
        {
          id: 'pro-1',
          duration: 1,
          durationDays: 30,
          label: '1 Month',
          priceInTiyin: 25000000,
          priceInUZS: 250000,
          displayPrice: '250,000',
          currency: 'UZS',
          savings: null,
          savingsPercentage: 0,
          featured: false
        },
        {
          id: 'pro-3',
          duration: 3,
          durationDays: 90,
          label: '3 Months',
          priceInTiyin: 67500000,
          priceInUZS: 675000,
          displayPrice: '675,000',
          currency: 'UZS',
          savings: '10%',
          savingsPercentage: 10,
          pricePerMonth: 225000,
          featured: true
        },
        {
          id: 'pro-6',
          duration: 6,
          durationDays: 180,
          label: '6 Months',
          priceInTiyin: 120000000,
          priceInUZS: 1200000,
          displayPrice: '1,200,000',
          currency: 'UZS',
          savings: '20%',
          savingsPercentage: 20,
          pricePerMonth: 200000,
          featured: false
        }
      ],
      pro: {
        name: 'Pro Plan',
        features: [
          'Full access to all courses',
          'Unlimited AI chat messages',
          'Unlimited AI image analysis',
          'Priority support',
          'Advanced analytics'
        ]
      }
    };

    res.json({
      success: true,
      plans: plans
    });
  } catch (error) {
    console.error('❌ Error getting payment plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment plans'
    });
  }
});

// ✅ Payment Status Check Route (for frontend to check payment)
router.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Try to find transaction by order ID
    try {
      const PaymeTransaction = require('../models/paymeTransaction');
      const transaction = await PaymeTransaction.findByOrderId(orderId);
      
      if (!transaction) {
        return res.json({
          success: false,
          status: 'not_found',
          message: 'Payment not found'
        });
      }

      let status = 'pending';
      let message = 'Payment is being processed';

      switch (transaction.state) {
        case 1: // STATE_CREATED
          status = 'pending';
          message = 'Payment is pending';
          break;
        case 2: // STATE_COMPLETED
          status = 'completed';
          message = 'Payment completed successfully';
          break;
        case -1: // STATE_CANCELLED
        case -2: // STATE_CANCELLED_AFTER_COMPLETE
          status = 'cancelled';
          message = 'Payment was cancelled';
          break;
      }

      res.json({
        success: true,
        status: status,
        message: message,
        transaction: {
          id: transaction._id,
          orderId: transaction.Login,
          amount: transaction.amount,
          plan: transaction.subscription_plan,
          state: transaction.state,
          created_at: transaction.create_time,
          completed_at: transaction.perform_time,
          cancelled_at: transaction.cancel_time
        }
      });
    } catch (modelError) {
      
      // Emergency fallback
      res.json({
        success: true,
        status: 'pending',
        message: 'Payment status check (fallback)',
        transaction: {
          id: orderId,
          orderId: orderId,
          amount: 26000000,
          state: 1
        },
        note: 'Emergency response - transaction model not available'
      });
    }

  } catch (error) {
    console.error('❌ Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status'
    });
  }
});

// ============================================
// PAYMENT SUCCESS CALLBACK (Creates inbox message)
// ============================================

/**
 * POST /api/payments/success-callback
 * Called after successful payment to create inbox message
 * This can be called from frontend after payment confirmation
 */
router.post('/success-callback', async (req, res) => {
  try {
    const {
      userId,
      transactionId,
      amount,
      duration,
      plan,
      paymentMethod,
      promoCode,
      promoDiscount,
      originalAmount
    } = req.body;

    if (!userId || !transactionId) {
      return res.status(400).json({
        success: false,
        error: 'userId and transactionId are required'
      });
    }

    // Load models
    const User = require('../models/user');
    const Message = require('../models/message');
    const { getTierByDuration } = require('../config/subscriptionConfig');

    // Find user
    const user = await User.findOne({
      $or: [
        { firebaseId: userId },
        { _id: require('mongoose').Types.ObjectId.isValid(userId) ? userId : null },
        { email: userId }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get tier info
    const tier = getTierByDuration(parseInt(duration) || 1);
    const durationDays = tier ? tier.duration : 30;

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    // Create payment confirmation message
    const paymentData = {
      amount: amount || (tier ? tier.priceInTiyin : 25000000),
      amountFormatted: `${((amount || (tier ? tier.priceInTiyin : 25000000)) / 100).toLocaleString()} UZS`,
      plan: plan || 'pro',
      duration: parseInt(duration) || 1,
      startDate: startDate,
      endDate: endDate,
      paymentMethod: paymentMethod || 'PayMe',
      transactionId: transactionId,
      promoCode: promoCode || null,
      promoDiscount: promoDiscount || 0,
      originalAmount: originalAmount || amount
    };

    // Create the inbox message
    const message = await Message.createPaymentMessage(
      user._id,
      user.firebaseId,
      paymentData
    );

    res.json({
      success: true,
      message: 'Payment confirmation message created',
      data: {
        messageId: message._id,
        subscriptionDetails: {
          plan: plan || 'pro',
          duration: parseInt(duration) || 1,
          startDate: startDate,
          endDate: endDate
        }
      }
    });

  } catch (error) {
    console.error('❌ Error creating payment success message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment confirmation message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// PROMO CODE VALIDATION FOR PAYMENTS
// ============================================

/**
 * POST /api/payments/promo-code
 * Validate a promo code for payment flow and return discount info
 *
 * Expected request body:
 * { code: "PROMOCODE" }
 *
 * Response format for frontend:
 * {
 *   success: true,
 *   message: "Promo code applied!",
 *   data: {
 *     discountPercent: 20,    // OR
 *     discountAmount: 5000000, // OR
 *     grantsPlan: "pro"       // For free access codes
 *   }
 * }
 */
router.post('/promo-code', async (req, res) => {
  try {
    const { code, userId } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Promo code is required'
      });
    }

    // Load PromoCode model
    let Promocode;
    try {
      Promocode = require('../models/promoCode');
    } catch (loadError) {
      console.error('❌ Failed to load Promocode model:', loadError);
      return res.status(503).json({
        success: false,
        error: 'Promo code system is temporarily unavailable'
      });
    }

    // Find the promo code
    const promocode = await Promocode.findOne({
      code: code.trim().toUpperCase(),
      isActive: true
    });

    if (!promocode) {
      return res.status(404).json({
        success: false,
        error: 'Invalid promo code'
      });
    }

    // Validate the promo code
    const validity = promocode.isValid ? promocode.isValid() : { valid: true };

    if (!validity.valid) {
      return res.status(400).json({
        success: false,
        error: validity.reason || 'Promo code is not valid'
      });
    }

    // Check expiry
    if (promocode.expiresAt && promocode.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'This promo code has expired'
      });
    }

    // Check usage limit
    if (promocode.maxUses && promocode.currentUses >= promocode.maxUses) {
      return res.status(400).json({
        success: false,
        error: 'This promo code has reached its usage limit'
      });
    }

    // Check if user has already used this code (if userId provided)
    if (userId) {
      const alreadyUsed = promocode.usedBy?.some(
        usage => usage.userId === userId || usage.userId?.toString() === userId
      );
      if (alreadyUsed) {
        return res.status(400).json({
          success: false,
          error: 'You have already used this promo code'
        });
      }
    }

    // Build response data based on promo code type
    const responseData = {
      code: promocode.code,
      subscriptionDays: promocode.subscriptionDays || 30
    };

    // Determine the type of discount/benefit
    if (promocode.grantsPlan) {
      // Full subscription grant (free access)
      responseData.grantsPlan = promocode.grantsPlan;
    }

    if (promocode.discountPercent && promocode.discountPercent > 0) {
      // Percentage discount
      responseData.discountPercent = promocode.discountPercent;
    }

    if (promocode.discountAmount && promocode.discountAmount > 0) {
      // Fixed amount discount (in tiyin)
      responseData.discountAmount = promocode.discountAmount;
    }

    // If no discount type specified but grantsPlan exists, it's a full subscription
    if (!responseData.discountPercent && !responseData.discountAmount && responseData.grantsPlan) {
      responseData.grantsPlan = promocode.grantsPlan;
    }

    // Add description if available
    if (promocode.description) {
      responseData.description = promocode.description;
    }

    res.json({
      success: true,
      message: 'Promo code applied!',
      data: responseData
    });

  } catch (error) {
    console.error('❌ Error validating promo code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate promo code',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/payments/apply-promo
 * Apply a promo code and update the user's subscription (for free codes)
 */
router.post('/apply-promo', async (req, res) => {
  try {
    const { code, userId } = req.body;

    if (!code || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Promo code and user ID are required'
      });
    }

    // Load models
    const Promocode = require('../models/promoCode');
    const User = require('../models/user');
    const Message = require('../models/message');

    // Find the promo code
    const promocode = await Promocode.findOne({
      code: code.trim().toUpperCase(),
      isActive: true
    });

    if (!promocode) {
      return res.status(404).json({
        success: false,
        error: 'Invalid promo code'
      });
    }

    // Validate the promo code
    const validity = promocode.isValid ? promocode.isValid() : { valid: true };
    if (!validity.valid) {
      return res.status(400).json({
        success: false,
        error: validity.reason || 'Promo code is not valid'
      });
    }

    // Find user
    const user = await User.findOne({
      $or: [
        { firebaseId: userId },
        { _id: require('mongoose').Types.ObjectId.isValid(userId) ? userId : null },
        { email: userId }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user has already used this code
    const alreadyUsed = promocode.usedBy?.some(
      usage => usage.userId === user._id.toString() || usage.userId === user.firebaseId
    );
    if (alreadyUsed) {
      return res.status(400).json({
        success: false,
        error: 'You have already used this promo code'
      });
    }

    // Only apply if it's a subscription-granting promo code
    if (!promocode.grantsPlan) {
      return res.status(400).json({
        success: false,
        error: 'This promo code can only be used during payment checkout'
      });
    }

    // Apply the subscription
    const subscriptionDays = promocode.subscriptionDays || 30;
    await user.grantSubscription(promocode.grantsPlan, subscriptionDays, 'promocode');

    // Record usage
    await promocode.useCode(
      user._id.toString(),
      user.email,
      user.name || 'User',
      req.ip
    );

    // Create inbox message
    try {
      await Message.createPromoMessage(user._id, user.firebaseId, {
        code: promocode.code,
        grantsPlan: promocode.grantsPlan,
        subscriptionDays: subscriptionDays
      });
    } catch (msgError) {
      console.error('❌ Failed to create promo message:', msgError);
    }

    res.json({
      success: true,
      message: `Promo code applied! You now have ${promocode.grantsPlan.toUpperCase()} plan for ${subscriptionDays} days.`,
      data: {
        plan: promocode.grantsPlan,
        subscriptionDays: subscriptionDays,
        expiryDate: user.subscriptionExpiryDate
      }
    });

  } catch (error) {
    console.error('❌ Error applying promo code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply promo code',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Test Route (for development)
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Payment routes working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    server: 'api.aced.live',
    endpoints: {
      root: 'POST /api/payments (PayMe webhook)',
      rootGet: 'GET /api/payments (status check)',
      initiate: 'POST /api/payments/initiate',
      initiatePayme: 'POST /api/payments/initiate-payme',
      validateUser: 'GET /api/payments/validate-user/:userId',
      plans: 'GET /api/payments/plans (with duration-based tiers)',
      status: 'GET /api/payments/status/:orderId',
      webhookPayme: 'POST /api/payments/webhook/payme',
      promoCode: 'POST /api/payments/promo-code (validate promo)',
      applyPromo: 'POST /api/payments/apply-promo (apply free subscription)',
      successCallback: 'POST /api/payments/success-callback (create inbox message)'
    },
    features: {
      durationBasedPricing: true,
      promoCodeSupport: true,
      inboxMessages: true,
      tiers: ['1 month', '3 months (10% off)', '6 months (20% off)']
    },
    controllerStatus: {
      handleSandboxPayment: !!handleSandboxPayment,
      initiatePaymePayment: !!initiatePaymePayment,
      validatePaymeAuth: !!validatePaymeAuth
    }
  });
});

// ✅ PayMe Test Auth Route (for development)
router.post('/test-auth', (req, res) => {
  if (validatePaymeAuth) {
    const authResult = validatePaymeAuth(req);
    
    res.json({
      success: authResult.valid,
      message: authResult.valid ? 'PayMe auth successful' : 'PayMe auth failed',
      error: authResult.error || null,
      environment: process.env.NODE_ENV || 'development'
    });
  } else {
    res.json({
      success: false,
      message: 'PayMe auth validator not available',
      error: 'CONTROLLER_NOT_LOADED'
    });
  }
});

// ================================
// ERROR HANDLING
// ================================

// 404 handler for unmatched routes
router.use('*', (req, res) => {
  
  res.status(404).json({
    message: '❌ Payment endpoint not found',
    path: req.originalUrl,
    method: req.method,
    server: 'api.aced.live',
    availableEndpoints: [
      'POST /api/payments (PayMe webhook root)',
      'GET /api/payments (status)',
      'POST /api/payments/initiate',
      'POST /api/payments/initiate-payme',
      'GET /api/payments/validate-user/:userId',
      'GET /api/payments/plans',
      'GET /api/payments/status/:orderId',
      'POST /api/payments/webhook/payme',
      'GET /api/payments/test',
      'POST /api/payments/test-auth'
    ]
  });
});

module.exports = router;