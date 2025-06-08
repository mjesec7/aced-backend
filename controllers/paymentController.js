// controllers/paymentController.js - FINAL VERSION WITH ALL UZ TRANSLATIONS

const User = require('../models/user');
const axios = require('axios');

// Payment amounts in tiyin (1 UZS = 100 tiyin)
const PAYMENT_AMOUNTS = {
  start: 260000, // 2600 UZS
  pro: 455000    // 4550 UZS
};

// ✅ PayMe Authorization Validation
const validatePaymeAuth = (req) => {
  const authHeader = req.headers.authorization;
  
  console.log('🔐 PayMe Authorization Check:', {
    hasAuthHeader: !!authHeader,
    method: req.body?.method,
    authHeaderStart: authHeader ? authHeader.substring(0, 20) + '...' : 'None'
  });
  
  // Check if Authorization header exists
  if (!authHeader) {
    console.log('❌ Authorization header missing');
    return { valid: false, error: 'MISSING_AUTH_HEADER' };
  }
  
  // Check if it's Basic auth format
  if (!authHeader.startsWith('Basic ')) {
    console.log('❌ Not Basic authorization format');
    return { valid: false, error: 'INVALID_AUTH_FORMAT' };
  }
  
  try {
    // Decode and validate credentials
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    
    console.log('🔍 Decoded credentials:', {
      username: username || 'empty',
      hasPassword: !!password,
      passwordLength: password?.length || 0
    });
    
    // Validate PayMe specific credentials
    const expectedUsername = 'Paycom';
    const expectedPassword = process.env.PAYME_MERCHANT_KEY;
    
    // Check username
    if (username !== expectedUsername) {
      console.log('❌ Invalid username. Expected: Paycom, Got:', username);
      return { valid: false, error: 'INVALID_USERNAME' };
    }
    
    // Check password (merchant key)
    if (!expectedPassword) {
      console.log('⚠️ No PAYME_MERCHANT_KEY configured - this will fail in sandbox tests');
      return { valid: false, error: 'NO_MERCHANT_KEY_CONFIGURED' };
    }
    
    if (password !== expectedPassword) {
      console.log('❌ Invalid password/merchant key');
      return { valid: false, error: 'INVALID_PASSWORD' };
    }
    
    console.log('✅ PayMe authorization successful');
    return { valid: true };
    
  } catch (decodeError) {
    console.log('❌ Error decoding authorization header:', decodeError.message);
    return { valid: false, error: 'DECODE_ERROR' };
  }
};

// ✅ COMPLETE PayMe Sandbox Handler with ALL UZ translations
const handleSandboxPayment = async (req, res) => {
  try {
    const { method, params, id } = req.body;

    console.log('🧪 PayMe Sandbox Request:', {
      method,
      hasParams: !!params,
      hasId: !!id,
      hasAuth: !!req.headers.authorization,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']?.substring(0, 50)
    });

    // ✅ ALWAYS validate authorization FIRST
    const authResult = validatePaymeAuth(req);
    
    if (!authResult.valid) {
      console.log('❌ Authorization validation failed:', authResult.error);
      
      // Return -32504 for ANY authorization issue
      return res.json({
        jsonrpc: '2.0',
        id: id || null,
        error: {
          code: -32504,
          message: {
            ru: 'Недостаточно привилегий для выполнения метода',
            en: 'Insufficient privileges to perform this method',
            uz: 'Ushbu amalni bajarish uchun yetarli huquq yo\'q'
          }
        }
      });
    }

    console.log('✅ Authorization passed, processing method:', method);

    // Validate request structure
    if (!id) {
      return res.json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32602,
          message: {
            ru: 'Неверный запрос',
            en: 'Invalid Request',
            uz: 'Noto\'g\'ri so\'rov'
          }
        }
      });
    }

    // Handle methods AFTER authorization passes
    switch (method) {
      case 'CheckPerformTransaction':
        // Validate account
        if (!params?.account?.login) {
          return res.json({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -31050,
              message: {
                ru: 'Неверный аккаунт',
                en: 'Invalid account',
                uz: 'Noto\'g\'ri hisob'
              }
            }
          });
        }
        
        // Validate amount
        if (!params?.amount || params.amount < 100) {
          return res.json({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -31001,
              message: {
                ru: 'Неверная сумма',
                en: 'Invalid amount',
                uz: 'Noto\'g\'ri summa'
              }
            }
          });
        }
        
        // Success response
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
        // Validate amount first
        if (!params?.amount || params.amount < 100) {
          return res.json({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -31001,
              message: {
                ru: 'Неверная сумма',
                en: 'Invalid amount',
                uz: 'Noto\'g\'ri summa'
              }
            }
          });
        }

        // Validate account
        if (!params?.account?.login) {
          return res.json({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -31050,
              message: {
                ru: 'Неверный аккаунт',
                en: 'Invalid account',
                uz: 'Noto\'g\'ri hisob'
              }
            }
          });
        }

        // Create transaction
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
        if (!params?.id) {
          return res.json({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -31003,
              message: {
                ru: 'Транзакция не найдена',
                en: 'Transaction not found',
                uz: 'Tranzaksiya topilmadi'
              }
            }
          });
        }
        
        return res.json({
          jsonrpc: '2.0',
          id: id,
          result: {
            transaction: params.id,
            state: 2,
            perform_time: Date.now()
          }
        });

      case 'CancelTransaction':
        if (!params?.id) {
          return res.json({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -31003,
              message: {
                ru: 'Транзакция не найдена',
                en: 'Transaction not found',
                uz: 'Tranzaksiya topilmadi'
              }
            }
          });
        }
        
        return res.json({
          jsonrpc: '2.0',
          id: id,
          result: {
            transaction: params.id,
            state: -1,
            cancel_time: Date.now()
          }
        });

      case 'GetStatement':
        return res.json({
          jsonrpc: '2.0',
          id: id,
          error: {
            code: -32601,
            message: {
              ru: 'Метод GetStatement не найден',
              en: 'Method GetStatement not found',
              uz: 'GetStatement usuli topilmadi'
            }
          }
        });

      case 'ChangePassword':
        return res.json({
          jsonrpc: '2.0',
          id: id,
          error: {
            code: -32601,
            message: {
              ru: 'Метод ChangePassword не найден',
              en: 'Method ChangePassword not found',
              uz: 'ChangePassword usuli topilmadi'
            }
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
              en: `Method ${method} not found`,
              uz: `${method} usuli topilmadi`
            }
          }
        });
    }

  } catch (error) {
    console.error('❌ Sandbox error:', error);
    res.json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32000,
        message: {
          ru: 'Внутренняя ошибка сервера',
          en: 'Internal server error',
          uz: 'Server ichki xatosi'
        },
        data: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  }
};

// ✅ Production-aware helper function with proper authorization
const makePaymeRequest = async (url, payload) => {
  const merchantId = process.env.PAYME_MERCHANT_ID;
  const merchantKey = process.env.PAYME_MERCHANT_KEY;

  const isProduction = process.env.NODE_ENV === 'production';
  const isSandboxUrl = url.includes('/sandbox');
  
  console.log('🔍 Making PayMe request:', {
    url,
    method: payload.method,
    isProduction,
    isSandbox: isSandboxUrl,
    hasMerchantKey: !!merchantKey
  });

  // Prepare request
  const requestPayload = {
    jsonrpc: '2.0',
    ...payload
  };

  try {
    const requestConfig = {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    // Add authorization for all requests (even sandbox for testing)
    if (merchantKey) {
      requestConfig.auth = {
        username: 'Paycom',
        password: merchantKey
      };
      console.log('🔐 Added Basic auth for PayMe request');
    } else {
      console.log('⚠️ No merchant key - request will likely fail');
    }

    const response = await axios.post(url, requestPayload, requestConfig);

    console.log('✅ PayMe request successful:', {
      status: response.status,
      hasResult: !!response.data?.result,
      hasError: !!response.data?.error
    });

    return response.data;

  } catch (error) {
    if (error.response) {
      console.error('PayMe API HTTP error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      
      return error.response.data || { 
        error: { 
          code: -32000, 
          message: { 
            ru: `Ошибка HTTP ${error.response.status}`,
            en: `HTTP ${error.response.status}: ${error.response.statusText}`,
            uz: `HTTP ${error.response.status} xatosi`
          } 
        } 
      };
    } else {
      console.error('PayMe API request error:', error.message);
      throw error;
    }
  }
};

// ✅ Existing functions unchanged
const applyPromoCode = async (req, res) => {
  try {
    const { userId, plan, promoCode } = req.body;

    if (!userId || !plan || !promoCode) {
      return res.status(400).json({ message: '❌ Все поля обязательны: userId, plan, promoCode' });
    }

    const validPromoCode = 'acedpromocode2406';
    if (promoCode.trim() !== validPromoCode) {
      return res.status(400).json({ message: '❌ Неверный промокод' });
    }

    const allowedPlans = ['start', 'pro'];
    if (!allowedPlans.includes(plan)) {
      return res.status(400).json({ message: '❌ Неверный тариф. Возможные значения: start, pro' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: '❌ Пользователь не найден по ID' });
    }

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

    if (!userId || !plan) {
      return res.status(400).json({ 
        message: '❌ Все поля обязательны: userId, plan' 
      });
    }

    const allowedPlans = ['start', 'pro'];
    if (!allowedPlans.includes(plan)) {
      return res.status(400).json({ 
        message: '❌ Неверный тариф. Возможные значения: start, pro' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        message: '❌ Пользователь не найден по ID' 
      });
    }

    const amount = PAYMENT_AMOUNTS[plan];
    if (!amount) {
      return res.status(400).json({ 
        message: '❌ Неверный тариф для оплаты' 
      });
    }

    const accountLogin = userId;
    const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const isProduction = process.env.NODE_ENV === 'production';
    
    let paymeApiUrl;
    if (isProduction) {
      paymeApiUrl = process.env.PAYME_API_URL_LIVE || 'https://checkout.paycom.uz/api';
    } else {
      paymeApiUrl = 'https://api.aced.live/api/payments/sandbox';
    }

    console.log('🔍 PayMe payment initiation:', {
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

      let paymentUrl;
      if (isProduction) {
        paymentUrl = `https://checkout.paycom.uz/${process.env.PAYME_MERCHANT_ID}`;
      } else {
        paymentUrl = `https://aced.live/payment/checkout/${requestId}`;
      }

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
      console.error('❌ PayMe API error:', apiError);
      
      return res.status(500).json({
        message: '❌ Ошибка при обращении к платёжной системе',
        error: apiError.message,
        sandbox: !isProduction
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
      return res.json({
        message: '✅ Sandbox payment status check',
        success: true,
        server: 'api.aced.live',
        transaction: {
          id: transactionId,
          state: 2,
          amount: 260000,
          create_time: Date.now() - 120000,
          perform_time: Date.now() - 60000
        },
        sandbox: true
      });
    }

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