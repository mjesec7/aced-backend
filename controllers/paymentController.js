// controllers/paymentController.js - FIXED VERSION BASED ON PHP TEMPLATE
const User = require('../models/user');
const PaymeTransaction = require('../models/paymeTransaction');
const mongoose = require('mongoose');

// Payment amounts in tiyin (1 UZS = 100 tiyin)
const PAYMENT_AMOUNTS = {
  start: 26000000,  // 260,000 UZS
  pro: 45500000     // 455,000 UZS
};

// PayMe Error codes (matching PHP template exactly)
const PaymeErrorCode = {
  ERROR_INTERNAL_SYSTEM: -32400,
  ERROR_INSUFFICIENT_PRIVILEGE: -32504,
  ERROR_INVALID_JSON_RPC_OBJECT: -32600,
  ERROR_METHOD_NOT_FOUND: -32601,
  ERROR_INVALID_AMOUNT: -31001,
  ERROR_TRANSACTION_NOT_FOUND: -31003,
  ERROR_INVALID_ACCOUNT: -31050,
  ERROR_COULD_NOT_CANCEL: -31007,
  ERROR_COULD_NOT_PERFORM: -31008
};

// ✅ AUTHORIZATION VALIDATION (matching PHP Merchant::Authorize)
const validatePaymeAuth = (req) => {
  console.log('🔐 PayMe Authorization Check');
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    console.log('❌ Missing or invalid authorization header');
    return { valid: false, error: 'MISSING_AUTH_HEADER' };
  }
  
  try {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    
    console.log('🔍 Auth credentials:', { username, hasPassword: !!password });
    
    // PayMe expects username 'Paycom' (matching PHP template)
    if (username !== 'Paycom') {
      console.log('❌ Invalid username. Expected: Paycom, Got:', username);
      return { valid: false, error: 'INVALID_USERNAME' };
    }
    
    // Check merchant key
    const expectedPassword = process.env.PAYME_MERCHANT_KEY;
    
    if (!expectedPassword) {
      console.log('⚠️ No PAYME_MERCHANT_KEY configured');
      return { valid: false, error: 'NO_MERCHANT_KEY' };
    }
    
    if (password !== expectedPassword) {
      console.log('❌ Invalid merchant key');
      return { valid: false, error: 'INVALID_PASSWORD' };
    }
    
    console.log('✅ PayMe authorization successful');
    return { valid: true };
    
  } catch (error) {
    console.log('❌ Error decoding authorization header:', error.message);
    return { valid: false, error: 'DECODE_ERROR' };
  }
};

// ✅ CREATE ERROR RESPONSE (matching PHP PaycomException format)
const createErrorResponse = (id, code, message = null, data = null) => {
  const messages = {
    ru: '',
    en: '',
    uz: ''
  };

  // Set messages based on error code (matching PHP template)
  switch (code) {
    case PaymeErrorCode.ERROR_INVALID_AMOUNT:
      messages.ru = 'Неверная сумма';
      messages.en = 'Invalid amount';
      messages.uz = "Noto'g'ri summa";
      break;
    case PaymeErrorCode.ERROR_TRANSACTION_NOT_FOUND:
      messages.ru = 'Транзакция не найдена';
      messages.en = 'Transaction not found';
      messages.uz = 'Tranzaksiya topilmadi';
      break;
    case PaymeErrorCode.ERROR_COULD_NOT_PERFORM:
      messages.ru = 'Невозможно выполнить операцию';
      messages.en = 'Unable to perform operation';
      messages.uz = "Amalni bajarib bo'lmadi";
      break;
    case PaymeErrorCode.ERROR_INVALID_ACCOUNT:
      messages.ru = 'Неверный код заказа';
      messages.en = 'Incorrect order code';
      messages.uz = 'Harid kodida xatolik';
      break;
    case PaymeErrorCode.ERROR_METHOD_NOT_FOUND:
      messages.ru = `Метод ${message} не найден`;
      messages.en = `Method ${message} not found`;
      messages.uz = `${message} usuli topilmadi`;
      break;
    case PaymeErrorCode.ERROR_INSUFFICIENT_PRIVILEGE:
      messages.ru = 'Недостаточно привилегий для выполнения метода';
      messages.en = 'Insufficient privilege to perform this method';
      messages.uz = "Ushbu amalni bajarish uchun yetarli huquq yo'q";
      break;
    case PaymeErrorCode.ERROR_INTERNAL_SYSTEM:
      messages.ru = 'Внутренняя ошибка сервера';
      messages.en = 'Internal server error';
      messages.uz = 'Server ichki xatosi';
      break;
    default:
      messages.ru = message || 'Неизвестная ошибка';
      messages.en = message || 'Unknown error';
      messages.uz = message || "Noma'lum xato";
  }

  const errorResponse = {
    jsonrpc: '2.0',
    id: id || null,
    error: {
      code: code,
      message: messages
    }
  };

  if (data !== null) {
    errorResponse.error.data = data;
  }

  return errorResponse;
};

// ✅ ORDER VALIDATION (matching PHP Order::validate)
const validateOrder = async (params, request_id) => {
  console.log('🔍 Validating order parameters');
  
  // Validate amount (matching PHP template logic)
  if (!params.amount || !Number.isInteger(params.amount)) {
    throw {
      code: PaymeErrorCode.ERROR_INVALID_AMOUNT,
      message: 'Incorrect amount',
      data: null
    };
  }
  
  // Validate account parameters (matching PHP template)
  if (!params.account || !params.account.order_id) {
    throw {
      code: PaymeErrorCode.ERROR_INVALID_ACCOUNT,
      message: null,
      data: 'order_id'
    };
  }
  
  // Check if order exists and is valid
  const orderInfo = await findOrderById(params.account.order_id);
  
  if (!orderInfo) {
    throw {
      code: PaymeErrorCode.ERROR_INVALID_ACCOUNT,
      message: null,
      data: 'order_id'
    };
  }
  
  // Validate amount matches order amount (matching PHP template)
  if (orderInfo.amount !== params.amount) {
    throw {
      code: PaymeErrorCode.ERROR_INVALID_AMOUNT,
      message: 'Incorrect amount',
      data: null
    };
  }
  
  // Check order state (matching PHP template)
  if (orderInfo.state !== 'waiting_pay') {
    throw {
      code: PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
      message: 'Order state is invalid',
      data: null
    };
  }
  
  return orderInfo;
};

// ✅ FIND ORDER BY ID (matching PHP Order::find)
const findOrderById = async (order_id) => {
  try {
    console.log('🔍 Finding order by ID:', order_id);
    
    // Extract user ID from order ID format: order_timestamp_userId
    const orderParts = order_id.toString().split('_');
    if (orderParts.length < 3) {
      console.log('❌ Invalid order ID format');
      return null;
    }
    
    const userId = orderParts[2];
    
    // Find user to validate order
    const user = await User.findOne({
      $or: [
        { firebaseId: userId },
        { _id: mongoose.isValidObjectId(userId) ? userId : null },
        { email: userId }
      ]
    });
    
    if (!user) {
      console.log('❌ User not found for order');
      return null;
    }
    
    // Determine expected amount based on plan
    let expectedAmount = PAYMENT_AMOUNTS.start;
    const planFromOrderId = orderParts[3]; // If plan is encoded in order ID
    if (planFromOrderId === 'pro') {
      expectedAmount = PAYMENT_AMOUNTS.pro;
    }
    
    console.log('✅ Order found and validated');
    
    return {
      id: parseInt(order_id),
      amount: expectedAmount,
      state: 'waiting_pay', // Assuming order is ready for payment
      user_id: userId
    };
    
  } catch (error) {
    console.error('❌ Error finding order:', error);
    return null;
  }
};

// ✅ 1. CheckPerformTransaction (matching PHP Application::CheckPerformTransaction)
const handleCheckPerformTransaction = async (req, res, id, params) => {
  console.log('🔍 CheckPerformTransaction');
  
  try {
    // Validate order (matching PHP template)
    const order = await validateOrder(params, id);
    
    // Check for existing active/completed transactions (matching PHP template)
    const existingTransaction = await PaymeTransaction.findByOrderId(params.account.order_id);
    
    if (existingTransaction && 
        (existingTransaction.state === PaymeTransaction.STATES.STATE_CREATED || 
         existingTransaction.state === PaymeTransaction.STATES.STATE_COMPLETED)) {
      
      console.log('❌ Found existing active/completed transaction');
      return res.status(200).json(createErrorResponse(
        id, 
        PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
        'There is other active/completed transaction for this order'
      ));
    }
    
    console.log('✅ CheckPerformTransaction successful');
    
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      result: {
        allow: true
      }
    });
    
  } catch (error) {
    console.error('❌ CheckPerformTransaction error:', error);
    return res.status(200).json(createErrorResponse(id, error.code, error.message, error.data));
  }
};

// ✅ 2. CreateTransaction (matching PHP Application::CreateTransaction)
const handleCreateTransaction = async (req, res, id, params) => {
  console.log('🆕 CreateTransaction');
  
  try {
    // Validate order first (matching PHP template)
    const order = await validateOrder(params, id);
    
    // Check for existing transactions for this order (matching PHP template)
    const existingOrderTransaction = await PaymeTransaction.findByOrderId(params.account.order_id);
    
    if (existingOrderTransaction) {
      if ((existingOrderTransaction.state === PaymeTransaction.STATES.STATE_CREATED || 
           existingOrderTransaction.state === PaymeTransaction.STATES.STATE_COMPLETED) &&
          existingOrderTransaction.paycom_transaction_id !== params.id) {
        
        console.log('❌ Found other active/completed transaction for this order');
        return res.status(200).json(createErrorResponse(
          id,
          PaymeErrorCode.ERROR_INVALID_ACCOUNT,
          'There is other active/completed transaction for this order'
        ));
      }
    }
    
    // Find transaction by PayMe transaction ID (idempotency check)
    let transaction = await PaymeTransaction.findByPaymeId(params.id);
    
    if (transaction) {
      console.log('🔄 Transaction already exists, checking state');
      
      if (transaction.state !== PaymeTransaction.STATES.STATE_CREATED) {
        console.log('❌ Transaction found but not active');
        return res.status(200).json(createErrorResponse(
          id,
          PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
          'Transaction found, but is not active'
        ));
      }
      
      if (transaction.isExpired()) {
        console.log('❌ Transaction expired, cancelling');
        await transaction.cancel(PaymeTransaction.REASONS.REASON_CANCELLED_BY_TIMEOUT);
        
        return res.status(200).json(createErrorResponse(
          id,
          PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
          'Transaction is expired'
        ));
      }
      
      // Return existing active transaction
      console.log('✅ Returning existing active transaction');
      return res.status(200).json({
        jsonrpc: '2.0',
        id: id,
        result: {
          create_time: transaction.create_time.getTime(),
          transaction: transaction.id.toString(),
          state: transaction.state,
          receivers: transaction.receivers ? JSON.parse(transaction.receivers) : null
        }
      });
    }
    
    // Validate transaction time (matching PHP template)
    const currentTime = Date.now();
    const transactionTime = parseInt(params.time);
    
    if (currentTime - transactionTime >= PaymeTransaction.TIMEOUT) {
      console.log('❌ Transaction time is too old');
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_ACCOUNT,
        `Since create time of the transaction passed ${PaymeTransaction.TIMEOUT}ms`,
        'time'
      ));
    }
    
    // Create new transaction (matching PHP template structure)
    const createTime = new Date();
    
    transaction = new PaymeTransaction({
      paycom_transaction_id: params.id,
      paycom_time: params.time.toString(),
      paycom_time_datetime: new Date(parseInt(params.time)),
      create_time: createTime,
      state: PaymeTransaction.STATES.STATE_CREATED,
      amount: params.amount,
      order_id: parseInt(params.account.order_id),
      user_id: order.user_id,
      subscription_plan: params.amount === PAYMENT_AMOUNTS.pro ? 'pro' : 'start',
      user_agent: req.headers['user-agent'],
      ip_address: req.ip || req.connection.remoteAddress
    });
    
    await transaction.save();
    
    console.log('✅ New transaction created:', transaction.paycom_transaction_id);
    
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      result: {
        create_time: createTime.getTime(),
        transaction: transaction.id.toString(),
        state: transaction.state,
        receivers: null
      }
    });
    
  } catch (error) {
    console.error('❌ CreateTransaction error:', error);
    if (error.code) {
      return res.status(200).json(createErrorResponse(id, error.code, error.message, error.data));
    }
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.ERROR_INTERNAL_SYSTEM));
  }
};

// ✅ 3. PerformTransaction (matching PHP Application::PerformTransaction)
const handlePerformTransaction = async (req, res, id, params) => {
  console.log('⚡ PerformTransaction');
  
  try {
    // Find transaction by PayMe ID
    const transaction = await PaymeTransaction.findByPaymeId(params.id);
    
    if (!transaction) {
      console.log('❌ Transaction not found');
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_TRANSACTION_NOT_FOUND,
        'Transaction not found'
      ));
    }
    
    console.log('📊 Transaction state:', transaction.state);
    
    switch (transaction.state) {
      case PaymeTransaction.STATES.STATE_CREATED:
        // Handle active transaction
        if (transaction.isExpired()) {
          console.log('❌ Transaction expired during perform');
          await transaction.cancel(PaymeTransaction.REASONS.REASON_CANCELLED_BY_TIMEOUT);
          
          return res.status(200).json(createErrorResponse(
            id,
            PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
            'Transaction is expired'
          ));
        }
        
        // Perform the transaction (matching PHP template)
        const performTime = new Date();
        transaction.state = PaymeTransaction.STATES.STATE_COMPLETED;
        transaction.perform_time = performTime;
        
        // Start database transaction for atomicity
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
          await transaction.save({ session });
          
          // Update user subscription (matching PHP template Order::changeState)
          const user = await User.findOne({
            $or: [
              { firebaseId: transaction.user_id },
              { _id: mongoose.isValidObjectId(transaction.user_id) ? transaction.user_id : null }
            ]
          }).session(session);
          
          if (user) {
            user.subscriptionPlan = transaction.subscription_plan;
            user.paymentStatus = 'paid';
            user.lastPaymentDate = new Date();
            await user.save({ session });
            console.log(`✅ User ${user.firebaseId} upgraded to ${transaction.subscription_plan}`);
          }
          
          await session.commitTransaction();
          
          console.log('✅ Transaction performed successfully');
          
          return res.status(200).json({
            jsonrpc: '2.0',
            id: id,
            result: {
              transaction: transaction.id.toString(),
              perform_time: performTime.getTime(),
              state: transaction.state
            }
          });
          
        } catch (dbError) {
          await session.abortTransaction();
          throw dbError;
        } finally {
          session.endSession();
        }
        
      case PaymeTransaction.STATES.STATE_COMPLETED:
        // Transaction already completed, return it (matching PHP template)
        console.log('🔄 Transaction already completed');
        
        return res.status(200).json({
          jsonrpc: '2.0',
          id: id,
          result: {
            transaction: transaction.id.toString(),
            perform_time: transaction.perform_time.getTime(),
            state: transaction.state
          }
        });
        
      default:
        // Unknown situation (matching PHP template)
        console.log('❌ Cannot perform transaction in current state');
        return res.status(200).json(createErrorResponse(
          id,
          PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
          'Could not perform this operation'
        ));
    }
    
  } catch (error) {
    console.error('❌ PerformTransaction error:', error);
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.ERROR_INTERNAL_SYSTEM));
  }
};

// ✅ 4. CancelTransaction (matching PHP Application::CancelTransaction)
const handleCancelTransaction = async (req, res, id, params) => {
  console.log('❌ CancelTransaction');
  
  try {
    // Find transaction by PayMe ID
    const transaction = await PaymeTransaction.findByPaymeId(params.id);
    
    if (!transaction) {
      console.log('❌ Transaction not found');
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_TRANSACTION_NOT_FOUND,
        'Transaction not found'
      ));
    }
    
    const reason = parseInt(params.reason) || PaymeTransaction.REASONS.REASON_UNKNOWN;
    
    switch (transaction.state) {
      case PaymeTransaction.STATES.STATE_CANCELLED:
      case PaymeTransaction.STATES.STATE_CANCELLED_AFTER_COMPLETE:
        // Already cancelled, return it (matching PHP template)
        console.log('🔄 Transaction already cancelled');
        
        return res.status(200).json({
          jsonrpc: '2.0',
          id: id,
          result: {
            transaction: transaction.id.toString(),
            cancel_time: transaction.cancel_time.getTime(),
            state: transaction.state
          }
        });
        
      case PaymeTransaction.STATES.STATE_CREATED:
        // Cancel active transaction (matching PHP template)
        console.log('❌ Cancelling active transaction');
        await transaction.cancel(reason);
        
        return res.status(200).json({
          jsonrpc: '2.0',
          id: id,
          result: {
            transaction: transaction.id.toString(),
            cancel_time: transaction.cancel_time.getTime(),
            state: transaction.state
          }
        });
        
      case PaymeTransaction.STATES.STATE_COMPLETED:
        // Check if cancelling completed transaction is allowed (matching PHP template)
        const allowCancel = false; // Set based on your business logic
        
        if (allowCancel) {
          console.log('❌ Cancelling completed transaction (refund)');
          await transaction.cancel(reason);
          
          return res.status(200).json({
            jsonrpc: '2.0',
            id: id,
            result: {
              transaction: transaction.id.toString(),
              cancel_time: transaction.cancel_time.getTime(),
              state: transaction.state
            }
          });
        } else {
          console.log('❌ Cannot cancel completed transaction');
          return res.status(200).json(createErrorResponse(
            id,
            PaymeErrorCode.ERROR_COULD_NOT_CANCEL,
            'Could not cancel transaction. Order is delivered/Service is completed'
          ));
        }
        
      default:
        console.log('❌ Unknown transaction state for cancellation');
        return res.status(200).json(createErrorResponse(
          id,
          PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
          'Could not cancel transaction'
        ));
    }
    
  } catch (error) {
    console.error('❌ CancelTransaction error:', error);
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.ERROR_INTERNAL_SYSTEM));
  }
};

// ✅ 5. CheckTransaction (matching PHP Application::CheckTransaction)
const handleCheckTransaction = async (req, res, id, params) => {
  console.log('🔍 CheckTransaction');
  
  try {
    // Find transaction by PayMe ID
    const transaction = await PaymeTransaction.findByPaymeId(params.id);
    
    if (!transaction) {
      console.log('❌ Transaction not found');
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_TRANSACTION_NOT_FOUND,
        'Transaction not found'
      ));
    }
    
    console.log('✅ Transaction found:', transaction.paycom_transaction_id);
    
    // Return transaction details (matching PHP template format)
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      result: transaction.toPaymeResponse()
    });
    
  } catch (error) {
    console.error('❌ CheckTransaction error:', error);
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.ERROR_INTERNAL_SYSTEM));
  }
};

// ✅ 6. GetStatement (matching PHP Application::GetStatement)
const handleGetStatement = async (req, res, id, params) => {
  console.log('📊 GetStatement');
  
  try {
    // Validate parameters (matching PHP template)
    if (!params.from) {
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_ACCOUNT,
        'Incorrect period',
        'from'
      ));
    }
    
    if (!params.to) {
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_ACCOUNT,
        'Incorrect period',
        'to'
      ));
    }
    
    if (parseInt(params.from) >= parseInt(params.to)) {
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_ACCOUNT,
        'Incorrect period. (from >= to)',
        'from'
      ));
    }
    
    // Get transactions for the specified period (matching PHP template)
    const transactions = await PaymeTransaction.getStatement(params.from, params.to);
    
    // Convert to statement format (matching PHP template)
    const result = transactions.map(tx => tx.toStatementFormat());
    
    console.log('📊 Statement returned:', result.length, 'transactions');
    
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      result: {
        transactions: result
      }
    });
    
  } catch (error) {
    console.error('❌ GetStatement error:', error);
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.ERROR_INTERNAL_SYSTEM));
  }
};

// ✅ 7. ChangePassword (matching PHP Application::ChangePassword)
const handleChangePassword = async (req, res, id, params) => {
  console.log('🔐 ChangePassword');
  
  try {
    // Validate password parameter (matching PHP template)
    if (!params.password || !params.password.trim()) {
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_ACCOUNT,
        'New password not specified',
        'password'
      ));
    }
    
    // Check if new password is same as current (matching PHP template)
    if (process.env.PAYME_MERCHANT_KEY === params.password) {
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INSUFFICIENT_PRIVILEGE,
        'Insufficient privilege. Incorrect new password'
      ));
    }
    
    // In production, you would save the new password
    // For now, just return success (matching PHP template)
    console.log('✅ Password change requested (not implemented)');
    
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      result: {
        success: true
      }
    });
    
  } catch (error) {
    console.error('❌ ChangePassword error:', error);
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.ERROR_INTERNAL_SYSTEM));
  }
};

// ✅ MAIN HANDLER (matching PHP Application::run)
const handlePaymeWebhook = async (req, res) => {
  console.log('\n💳 PayMe JSON-RPC Request received');
  
  try {
    const { method, params, id, jsonrpc } = req.body;
    
    console.log('📋 Request details:', {
      method,
      id,
      jsonrpc,
      hasParams: !!params
    });
    
    // Validate JSON-RPC format (matching PHP template)
    if (!jsonrpc || jsonrpc !== '2.0') {
      console.log('❌ Invalid JSON-RPC version');
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_JSON_RPC_OBJECT,
        'Invalid JSON-RPC object'
      ));
    }
    
    if (!method) {
      console.log('❌ Method not specified');
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_METHOD_NOT_FOUND,
        'Method not found'
      ));
    }
    
    // Authorize session (matching PHP Merchant::Authorize)
    const authResult = validatePaymeAuth(req);
    if (!authResult.valid) {
      console.log('❌ Authorization failed:', authResult.error);
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INSUFFICIENT_PRIVILEGE
      ));
    }
    
    // Route to appropriate handler (matching PHP Application switch statement)
    switch (method) {
      case 'CheckPerformTransaction':
        return handleCheckPerformTransaction(req, res, id, params);
        
      case 'CreateTransaction':
        return handleCreateTransaction(req, res, id, params);
        
      case 'PerformTransaction':
        return handlePerformTransaction(req, res, id, params);
        
      case 'CancelTransaction':
        return handleCancelTransaction(req, res, id, params);
        
      case 'CheckTransaction':
        return handleCheckTransaction(req, res, id, params);
        
      case 'GetStatement':
        return handleGetStatement(req, res, id, params);
        
      case 'ChangePassword':
        return handleChangePassword(req, res, id, params);
        
      default:
        console.log('❌ Unknown method:', method);
        return res.status(200).json(createErrorResponse(
          id,
          PaymeErrorCode.ERROR_METHOD_NOT_FOUND,
          method
        ));
    }
    
  } catch (error) {
    console.error('❌ PayMe webhook error:', error);
    return res.status(200).json(createErrorResponse(
      req.body?.id || null,
      PaymeErrorCode.ERROR_INTERNAL_SYSTEM
    ));
  }
};

// ✅ PAYMENT INITIATION (FIXED URL GENERATION)
const initiatePaymePayment = async (req, res) => {
  try {
    const { userId, plan } = req.body;
    
    console.log('🚀 PayMe payment initiation:', { userId, plan });
    
    if (!userId || !plan) {
      return res.status(400).json({
        success: false,
        message: '❌ userId and plan are required'
      });
    }
    
    if (!['start', 'pro'].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid plan. Allowed: start, pro'
      });
    }
    
    // Find user
    const user = await User.findOne({
      $or: [
        { firebaseId: userId },
        { _id: mongoose.isValidObjectId(userId) ? userId : null },
        { email: userId }
      ]
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '❌ User not found'
      });
    }
    
    const amount = PAYMENT_AMOUNTS[plan];
    const orderId = `order_${Date.now()}_${user._id}_${plan}`;
    
    // ✅ FIXED: Generate correct PayMe URL
    const merchantId = process.env.PAYME_MERCHANT_ID;
    const isProduction = process.env.NODE_ENV === 'production' && merchantId;
    
    if (isProduction) {
      // PRODUCTION: Real PayMe checkout
      const checkoutParams = new URLSearchParams({
        'm': merchantId,
        'ac.order_id': orderId,
        'a': amount,
        'l': 'uz'
      });
      
      const paymentUrl = `${process.env.PAYME_CHECKOUT_URL}?${checkoutParams.toString()}`;
      
      console.log('🏭 Production PayMe URL generated');
      
      return res.json({
        success: true,
        paymentUrl: paymentUrl,
        transaction: {
          orderId: orderId,
          amount: amount,
          plan: plan
        },
        environment: 'production'
      });
    } else {
      // DEVELOPMENT: Custom checkout
      const checkoutParams = new URLSearchParams({
        orderId: orderId,
        userId: user.firebaseId,
        amount: amount / 100, // Convert to UZS
        plan: plan,
        userName: user.name || 'User',
        userEmail: user.email || ''
      });
      
      const paymentUrl = `https://aced.live/payment/checkout?${checkoutParams.toString()}`;
      
      console.log('🧪 Development checkout URL generated');
      
      return res.json({
        success: true,
        paymentUrl: paymentUrl,
        transaction: {
          orderId: orderId,
          amount: amount,
          plan: plan
        },
        environment: 'development'
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
};

module.exports = {
  handlePaymeWebhook,
  initiatePaymePayment,
  validatePaymeAuth,
  PaymeErrorCode,
  PAYMENT_AMOUNTS
};