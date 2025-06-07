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
    
    // 🌐 Production environment detection
    const isProduction = process.env.NODE_ENV === 'production';
    
    // ✅ Fixed API endpoint for production environment
    let paymeApiUrl;
    if (isProduction) {
      paymeApiUrl = process.env.PAYME_API_URL_LIVE || 'https://checkout.paycom.uz/api';
    } else {
      // For development/sandbox - use your live server's sandbox endpoint
      paymeApiUrl = 'https://api.aced.live/api/payments/sandbox';
    }

    console.log('🔍 Payme payment initiation:', {
      userId,
      plan,
      amount,
      accountLogin,
      requestId,
      apiUrl: paymeApiUrl,
      isProduction,
      environment: process.env.NODE_ENV || 'development'
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
          code: checkResponse.error.code,
          sandbox: !isProduction
        });
      }

      if (!checkResponse.result?.allow) {
        return res.status(400).json({
          message: '❌ Оплата недоступна для данного аккаунта',
          sandbox: !isProduction
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
          code: createResponse.error.code,
          sandbox: !isProduction
        });
      }

      // ✅ Production-aware payment URL generation
      let paymentUrl;
      if (isProduction) {
        // Real PayMe checkout URL
        paymentUrl = `https://checkout.paycom.uz/${process.env.PAYME_MERCHANT_ID}`;
      } else {
        // Development/testing - redirect to your sandbox checkout page
        paymentUrl = `https://aced.live/payment/checkout/${requestId}`;
      }

      // Return success response with transaction details
      return res.status(200).json({
        message: '✅ Транзакция успешно создана',
        success: true,
        sandbox: !isProduction,
        transaction: {
          id: requestId,
          transaction: createResponse.result.transaction,
          amount: amount,
          plan: plan,
          state: createResponse.result.state,
          create_time: createResponse.result.create_time
        },
        paymentUrl: paymentUrl,
        // Additional info for frontend
        metadata: {
          userId: userId,
          plan: plan,
          amountUzs: amount / 100,
          environment: isProduction ? 'production' : 'sandbox',
          backendUrl: 'https://api.aced.live',
          frontendUrl: 'https://aced.live'
        }
      });

    } catch (apiError) {
      console.error('❌ Payme API error:', apiError);
      
      if (apiError.response) {
        console.error('API Response data:', apiError.response.data);
        console.error('API Response status:', apiError.response.status);
      }

      return res.status(500).json({
        message: '❌ Ошибка при обращении к платёжной системе',
        error: apiError.message,
        sandbox: !isProduction,
        details: process.env.NODE_ENV === 'development' ? apiError.stack : undefined
      });
    }

  } catch (err) {
    console.error('❌ Ошибка инициации платежа:', err);
    res.status(500).json({ 
      message: '❌ Ошибка сервера при инициации платежа',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// ✅ Enhanced sandbox mock endpoint for testing on live server
const handleSandboxPayment = async (req, res) => {
  try {
    const { method, params, id } = req.body;

    console.log('🧪 Sandbox payment request on live server:', { method, params, id });

    // ✅ Validate request ID
    if (!id) {
      return res.json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32602,
          message: {
            ru: 'Отсутствует ID запроса',
            en: 'Missing request ID'
          }
        }
      });
    }

    // Mock responses for different methods
    switch (method) {
      case 'CheckPerformTransaction':
        // ✅ Enhanced check with account validation
        if (!params?.account?.login) {
          return res.json({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -31050,
              message: {
                ru: 'Неверный аккаунт',
                en: 'Invalid account'
              }
            }
          });
        }
        
        return res.json({
          jsonrpc: '2.0',
          id: id,
          result: {
            allow: true,
            detail: {
              receipt_type: 0
            }
          }
        });

      case 'CreateTransaction':
        // ✅ Enhanced transaction creation
        if (!params?.amount || params.amount < 100) {
          return res.json({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -31001,
              message: {
                ru: 'Неверная сумма',
                en: 'Invalid amount'
              }
            }
          });
        }

        return res.json({
          jsonrpc: '2.0',
          id: id,
          result: {
            transaction: `live_sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            state: 1,
            create_time: Date.now(),
            receivers: null
          }
        });

      case 'CheckTransaction':
        // ✅ Enhanced transaction check
        const transactionId = params?.id || `live_sandbox_${Date.now()}`;
        return res.json({
          jsonrpc: '2.0',
          id: id,
          result: {
            transaction: transactionId,
            state: 2, // completed
            create_time: Date.now() - 120000, // 2 minutes ago
            perform_time: Date.now() - 60000,  // 1 minute ago
            cancel_time: 0,
            reason: null,
            receivers: null
          }
        });

      case 'PerformTransaction':
        // ✅ Enhanced transaction performance
        return res.json({
          jsonrpc: '2.0',
          id: id,
          result: {
            transaction: params?.id || `live_sandbox_${Date.now()}`,
            state: 2,
            perform_time: Date.now()
          }
        });

      case 'CancelTransaction':
        // ✅ Transaction cancellation
        return res.json({
          jsonrpc: '2.0',
          id: id,
          result: {
            transaction: params?.id || `live_sandbox_${Date.now()}`,
            state: -1,
            cancel_time: Date.now()
          }
        });

      default:
        return res.json({
          jsonrpc: '2.0',
          id: id,
          error: {
            code: -32601,
            message: {
              ru: `Метод ${method} не найден`,
              en: `Method ${method} not found`
            }
          }
        });
    }

  } catch (error) {
    console.error('❌ Live sandbox error:', error);
    res.json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32000,
        message: {
          ru: 'Внутренняя ошибка сервера',
          en: 'Internal server error'
        },
        data: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  }
};

// ✅ Production-aware helper function to make Payme API requests
const makePaymeRequest = async (url, payload) => {
  const merchantId = process.env.PAYME_MERCHANT_ID;
  const merchantKey = process.env.PAYME_MERCHANT_KEY;

  const isProduction = process.env.NODE_ENV === 'production';
  const isSandboxUrl = url.includes('/sandbox');
  
  // For production PayMe, use real credentials
  // For sandbox, use test credentials or no auth
  let finalMerchantId = merchantId;
  let finalMerchantKey = merchantKey;
  
  if (!isProduction || isSandboxUrl) {
    finalMerchantId = merchantId || 'test_merchant_id';
    finalMerchantKey = merchantKey || 'test_merchant_key';
  }

  if (!isSandboxUrl && (!finalMerchantId || !finalMerchantKey)) {
    throw new Error('Payme credentials not configured for production');
  }

  // Prepare request
  const requestPayload = {
    jsonrpc: '2.0',
    ...payload
  };

  console.log('🔍 Making Payme request to live server:', {
    url,
    method: payload.method,
    hasAuth: !!(finalMerchantId && finalMerchantKey),
    isProduction,
    isSandbox: isSandboxUrl
  });

  try {
    const requestConfig = {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    };

    // ✅ Only add auth for non-sandbox requests
    if (!isSandboxUrl) {
      requestConfig.auth = {
        username: 'Paycom', // Always 'Paycom' for Payme
        password: finalMerchantKey
      };
    }

    const response = await axios.post(url, requestPayload, requestConfig);

    console.log('✅ Payme request successful:', {
      status: response.status,
      hasResult: !!response.data?.result,
      hasError: !!response.data?.error
    });

    return response.data;

  } catch (error) {
    if (error.response) {
      console.error('Payme API HTTP error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url
      });
      
      return error.response.data || { 
        error: { 
          code: -32000, 
          message: { 
            en: `HTTP ${error.response.status}: ${error.response.statusText}`,
            ru: `Ошибка HTTP ${error.response.status}`
          } 
        } 
      };
    } else if (error.request) {
      console.error('Payme API network error:', {
        message: error.message,
        code: error.code,
        url: error.config?.url
      });
      throw new Error(`Network error: ${error.message}`);
    } else {
      console.error('Payme API request error:', error.message);
      throw error;
    }
  }
};

// Test endpoint to validate user routes
const validateUserRoute = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        message: '❌ User ID is required',
        valid: false
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        message: '❌ User not found',
        valid: false,
        userId
      });
    }

    return res.status(200).json({
      message: '✅ User route is valid',
      valid: true,
      server: 'api.aced.live',
      user: {
        id: user._id,
        name: user.name || 'Unknown',
        email: user.email || 'Unknown',
        subscriptionPlan: user.subscriptionPlan || 'free',
        paymentStatus: user.paymentStatus || 'unpaid'
      }
    });

  } catch (error) {
    console.error('❌ User validation error:', error);
    res.status(500).json({
      message: '❌ Server error during user validation',
      valid: false,
      error: error.message
    });
  }
};

// Payment status check endpoint
const checkPaymentStatus = async (req, res) => {
  try {
    const { transactionId, userId } = req.params;

    if (!transactionId) {
      return res.status(400).json({
        message: '❌ Transaction ID is required',
        success: false
      });
    }

    const isProduction = process.env.NODE_ENV === 'production';
    
    if (!isProduction) {
      // For sandbox/testing, always return success
      return res.json({
        message: '✅ Sandbox payment status check',
        success: true,
        server: 'api.aced.live',
        transaction: {
          id: transactionId,
          state: 2, // completed
          amount: 260000,
          create_time: Date.now() - 120000,
          perform_time: Date.now() - 60000
        },
        sandbox: true
      });
    }

    // For production, implement actual transaction status check
    res.json({
      message: '⚠️ Production payment status check not implemented',
      success: false,
      server: 'api.aced.live',
      transactionId,
      userId
    });

  } catch (error) {
    console.error('❌ Payment status check error:', error);
    res.status(500).json({
      message: '❌ Error checking payment status',
      success: false,
      error: error.message
    });
  }
};

module.exports = { 
  applyPromoCode, 
  initiatePaymePayment,
  handleSandboxPayment,
  validateUserRoute,
  checkPaymentStatus
};