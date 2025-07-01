// routes/payments.js - COMPLETE Payment Routes (UPDATED for correct GET URL generation)

const express = require('express');
const router = express.Router();
const { 
  handlePaymeWebhook, 
  initiatePaymePayment,
  validatePaymeAuth,
  PaymeErrorCode,
  PAYMENT_AMOUNTS
} = require('../controllers/paymentController');

// ✅ PayMe Webhook Route (for PayMe to call)
router.post('/webhook/payme', handlePaymeWebhook);

// ✅ Payment Initiation Route (for frontend to call)
router.post('/initiate', initiatePaymePayment);

// ✅ Alternative endpoint names to match your frontend
router.post('/initiate-payme', initiatePaymePayment);

// ✅ User validation route (matching your frontend calls)
router.get('/validate-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('🔍 Validating user for payment:', userId);
    
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
          firebaseId: user.firebaseId,
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
router.get('/plans', (req, res) => {
  try {
    const plans = {
      start: {
        name: 'Start Plan',
        price_uzs: PAYMENT_AMOUNTS.start / 100, // Convert tiyin to UZS
        price_tiyin: PAYMENT_AMOUNTS.start,
        features: [
          'Basic features',
          'Limited usage',
          'Email support'
        ]
      },
      pro: {
        name: 'Pro Plan', 
        price_uzs: PAYMENT_AMOUNTS.pro / 100, // Convert tiyin to UZS
        price_tiyin: PAYMENT_AMOUNTS.pro,
        features: [
          'All features',
          'Unlimited usage',
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
    
    // Find transaction by order ID
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
      case PaymeTransaction.STATES.STATE_CREATED:
        status = 'pending';
        message = 'Payment is pending';
        break;
      case PaymeTransaction.STATES.STATE_COMPLETED:
        status = 'completed';
        message = 'Payment completed successfully';
        break;
      case PaymeTransaction.STATES.STATE_CANCELLED:
      case PaymeTransaction.STATES.STATE_CANCELLED_AFTER_COMPLETE:
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
        orderId: transaction.order_id,
        amount: transaction.amount,
        plan: transaction.subscription_plan,
        state: transaction.state,
        created_at: transaction.create_time,
        completed_at: transaction.perform_time,
        cancelled_at: transaction.cancel_time
      }
    });

  } catch (error) {
    console.error('❌ Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status'
    });
  }
});

// ✅ Test Route (for development)
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Payment routes working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ✅ PayMe Test Auth Route (for development)
router.post('/test-auth', (req, res) => {
  const authResult = validatePaymeAuth(req);
  
  res.json({
    success: authResult.valid,
    message: authResult.valid ? 'PayMe auth successful' : 'PayMe auth failed',
    error: authResult.error || null,
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;