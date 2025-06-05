const User = require('../models/user');
const axios = require('axios');

// Payment amounts in tiyin (1 UZS = 100 tiyin)
const PAYMENT_AMOUNTS = {
  start: 260000, // 2600 UZS
  pro: 455000    // 4550 UZS
};

const applyPromoCode = async (req, res) => {
  try {
    const { userId, plan, promoCode } = req.body;

    // 🔍 Validate input presence
    if (!userId || !plan || !promoCode) {
      return res.status(400).json({ message: '❌ Все поля обязательны: userId, plan, promoCode' });
    }

    // 🔐 Validate promo code
    const validPromoCode = 'acedpromocode2406';
    if (promoCode.trim() !== validPromoCode) {
      return res.status(400).json({ message: '❌ Неверный промокод' });
    }

    // 🔍 Validate plan type
    const allowedPlans = ['start', 'pro'];
    if (!allowedPlans.includes(plan)) {
      return res.status(400).json({ message: '❌ Неверный тариф. Возможные значения: start, pro' });
    }

    // 🧑 Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: '❌ Пользователь не найден по ID' });
    }

    // 💾 Update plan and status
    user.subscriptionPlan = plan;
    user.paymentStatus = 'paid';
    await user.save();

    return res.status(200).json({
      message: '✅ Промокод успешно применён',
      unlocked: true,
      plan
    });

  } catch (err) {
    console.error('❌ Ошибка применения промокода:', err);
    res.status(500).json({ message: '❌ Ошибка сервера при применении промокода' });
  }
};

const initiatePaymePayment = async (req, res) => {
  try {
    const { userId, plan } = req.body;

    // 🔍 Validate input
    if (!userId || !plan) {
      return res.status(400).json({ 
        message: '❌ Все поля обязательны: userId, plan' 
      });
    }

    // 🔍 Validate plan type
    const allowedPlans = ['start', 'pro'];
    if (!allowedPlans.includes(plan)) {
      return res.status(400).json({ 
        message: '❌ Неверный тариф. Возможные значения: start, pro' 
      });
    }

    // 🧑 Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        message: '❌ Пользователь не найден по ID' 
      });
    }

    // Get payment amount for the plan
    const amount = PAYMENT_AMOUNTS[plan];
    if (!amount) {
      return res.status(400).json({ 
        message: '❌ Неверный тариф для оплаты' 
      });
    }

    // Use user ID as login for Payme
    const accountLogin = userId;
    
    // Generate unique request ID
    const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    // Determine API endpoint based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const paymeApiUrl = isProduction 
      ? process.env.PAYME_API_URL_LIVE || 'https://checkout.paycom.uz/api'
      : process.env.PAYME_API_URL_SANDBOX || `${req.protocol}://${req.get('host')}/api/payments/sandbox`;

    console.log('🔍 Payme payment initiation:', {
      userId,
      plan,
      amount,
      accountLogin,
      requestId,
      apiUrl: paymeApiUrl,
      isProduction
    });

    try {
      // Step 1: Check if transaction can be performed
      const checkResponse = await makePaymeRequest(paymeApiUrl, {
        id: requestId,
        method: 'CheckPerformTransaction',
        params: {
          account: { login: accountLogin },
          amount: amount
        }
      });

      console.log('✅ CheckPerformTransaction response:', checkResponse);

      if (checkResponse.error) {
        console.error('❌ CheckPerformTransaction failed:', checkResponse.error);
        return res.status(400).json({
          message: '❌ Не удалось проверить возможность оплаты',
          error: checkResponse.error.message?.ru || checkResponse.error.message?.en || 'Ошибка проверки',
          code: checkResponse.error.code
        });
      }

      if (!checkResponse.result?.allow) {
        return res.status(400).json({
          message: '❌ Оплата недоступна для данного аккаунта'
        });
      }

      // Step 2: Create transaction
      const createResponse = await makePaymeRequest(paymeApiUrl, {
        id: requestId,
        method: 'CreateTransaction',
        params: {
          id: requestId,
          time: Date.now(),
          account: { login: accountLogin },
          amount: amount
        }
      });

      console.log('✅ CreateTransaction response:', createResponse);

      if (createResponse.error) {
        console.error('❌ CreateTransaction failed:', createResponse.error);
        return res.status(400).json({
          message: '❌ Не удалось создать транзакцию',
          error: createResponse.error.message?.ru || createResponse.error.message?.en || 'Ошибка создания транзакции',
          code: createResponse.error.code
        });
      }

      // Return success response with transaction details
      return res.status(200).json({
        message: '✅ Транзакция успешно создана',
        success: true,
        transaction: {
          id: requestId,
          transaction: createResponse.result.transaction,
          amount: amount,
          plan: plan,
          state: createResponse.result.state,
          create_time: createResponse.result.create_time
        },
        // For frontend to continue with payment flow
        paymentUrl: isProduction 
          ? `https://checkout.paycom.uz/${process.env.PAYME_MERCHANT_ID}` 
          : null
      });

    } catch (apiError) {
      console.error('❌ Payme API error:', apiError);
      
      if (apiError.response) {
        console.error('API Response data:', apiError.response.data);
        console.error('API Response status:', apiError.response.status);
      }

      return res.status(500).json({
        message: '❌ Ошибка при обращении к платёжной системе',
        error: apiError.message
      });
    }

  } catch (err) {
    console.error('❌ Ошибка инициации платежа:', err);
    res.status(500).json({ 
      message: '❌ Ошибка сервера при инициации платежа',
      error: err.message 
    });
  }
};

// Helper function to make Payme API requests
const makePaymeRequest = async (url, payload) => {
  const merchantId = process.env.PAYME_MERCHANT_ID;
  const merchantKey = process.env.PAYME_MERCHANT_KEY;

  if (!merchantId || !merchantKey) {
    throw new Error('Payme credentials not configured');
  }

  // Prepare request
  const requestPayload = {
    jsonrpc: '2.0',
    ...payload
  };

  console.log('🔍 Making Payme request:', {
    url,
    method: payload.method,
    hasAuth: !!(merchantId && merchantKey)
  });

  try {
    const response = await axios.post(url, requestPayload, {
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        username: 'Paycom', // Always 'Paycom' for Payme
        password: merchantKey
      },
      timeout: 30000, // 30 second timeout
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      // API responded with error status
      console.error('Payme API HTTP error:', {
        status: error.response.status,
        data: error.response.data
      });
      return error.response.data || { 
        error: { 
          code: -32000, 
          message: { en: 'API Error', ru: 'Ошибка API' } 
        } 
      };
    } else if (error.request) {
      // Network error
      console.error('Payme API network error:', error.message);
      throw new Error(`Network error: ${error.message}`);
    } else {
      // Other error
      console.error('Payme API request error:', error.message);
      throw error;
    }
  }
};

module.exports = { 
  applyPromoCode, 
  initiatePaymePayment 
};