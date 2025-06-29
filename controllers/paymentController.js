// controllers/paymentController.js - FIXED VERSION WITH CORRECT ERRORS
const User = require('../models/user');
const PaymeTransaction = require('../models/paymeTransaction');
const mongoose = require('mongoose');

// Payment amounts in tiyin (1 UZS = 100 tiyin)
const PAYMENT_AMOUNTS = {
  start: 26000000,  // 260,000 UZS
  pro: 45500000     // 455,000 UZS
};

// ✅ CORRECT PayMe Error codes from documentation
const PaymeErrorCode = {
  // System errors
  ERROR_INTERNAL_SYSTEM: -32400,
  ERROR_INSUFFICIENT_PRIVILEGE: -32504,
  ERROR_INVALID_JSON_RPC_OBJECT: -32600,
  ERROR_METHOD_NOT_FOUND: -32601,
  ERROR_INVALID_PARAMS: -32602,
  ERROR_PARSE_ERROR: -32700,
  
  // Transaction errors
  ERROR_INVALID_AMOUNT: -31001,
  ERROR_TRANSACTION_NOT_FOUND: -31003,
  ERROR_COULD_NOT_CANCEL: -31007,
  ERROR_COULD_NOT_PERFORM: -31008,
  
  // Account errors (range -31050 to -31099 for account validation)
  ERROR_INVALID_ACCOUNT: -31050,
  ERROR_ACCOUNT_NOT_FOUND: -31051,
  ERROR_INVALID_ORDER_ID: -31052,
  ERROR_ORDER_NOT_FOUND: -31053,
  ERROR_ORDER_ALREADY_PAID: -31054,
  ERROR_ORDER_EXPIRED: -31055,
  
  // SetFiscalData errors
  ERROR_RECEIPT_NOT_FOUND: -32001,
  ERROR_INVALID_JSON: -32700,
  ERROR_INVALID_FISCAL_PARAMS: -32602
};

// ✅ AUTHORIZATION VALIDATION
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
    
    // PayMe expects username 'Paycom'
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

// ✅ CREATE ERROR RESPONSE with proper message format
const createErrorResponse = (id, code, message = null, data = null) => {
  // Default messages based on PayMe documentation
  let errorMessage = message;
  
  if (!errorMessage) {
    switch (code) {
      case PaymeErrorCode.ERROR_INVALID_AMOUNT:
        errorMessage = {
          ru: 'Неверная сумма',
          en: 'Invalid amount',
          uz: "Noto'g'ri summa"
        };
        break;
      case PaymeErrorCode.ERROR_TRANSACTION_NOT_FOUND:
        errorMessage = {
          ru: 'Транзакция не найдена',
          en: 'Transaction not found',
          uz: 'Tranzaksiya topilmadi'
        };
        break;
      case PaymeErrorCode.ERROR_COULD_NOT_PERFORM:
        errorMessage = {
          ru: 'Невозможно выполнить операцию',
          en: 'Unable to perform operation',
          uz: "Amalni bajarib bo'lmadi"
        };
        break;
      case PaymeErrorCode.ERROR_COULD_NOT_CANCEL:
        errorMessage = {
          ru: 'Заказ выполнен. Невозможно отменить транзакцию. Товар или услуга предоставлена покупателю в полном объеме.',
          en: 'Order completed. Cannot cancel transaction. Product or service has been fully provided to the customer.',
          uz: 'Buyurtma bajarildi. Tranzaksiyani bekor qilib bolmaydi. Mahsulot yoki xizmat xaridorga toʻliq hajmda taqdim etildi.'
        };
        break;
      case PaymeErrorCode.ERROR_INVALID_ACCOUNT:
        errorMessage = {
          ru: 'Неверный код заказа',
          en: 'Incorrect order code',
          uz: 'Harid kodida xatolik'
        };
        break;
      case PaymeErrorCode.ERROR_METHOD_NOT_FOUND:
        errorMessage = {
          ru: `Метод не найден`,
          en: `Method not found`,
          uz: `Usul topilmadi`
        };
        break;
      case PaymeErrorCode.ERROR_INSUFFICIENT_PRIVILEGE:
        errorMessage = {
          ru: 'Недостаточно привилегий для выполнения метода',
          en: 'Insufficient privilege to perform this method',
          uz: "Ushbu amalni bajarish uchun yetarli huquq yo'q"
        };
        break;
      case PaymeErrorCode.ERROR_INTERNAL_SYSTEM:
        errorMessage = {
          ru: 'Внутренняя ошибка сервера',
          en: 'Internal server error',
          uz: 'Server ichki xatosi'
        };
        break;
      case PaymeErrorCode.ERROR_RECEIPT_NOT_FOUND:
        errorMessage = {
          ru: 'Чек с таким id не найден',
          en: 'Receipt with this id not found',
          uz: 'Bunday id bilan chek topilmadi'
        };
        break;
      case PaymeErrorCode.ERROR_INVALID_JSON:
        errorMessage = {
          ru: 'Отправлен не валидный JSON объект',
          en: 'Invalid JSON object sent',
          uz: 'Yaroqsiz JSON obyekt yuborildi'
        };
        break;
      case PaymeErrorCode.ERROR_INVALID_FISCAL_PARAMS:
        errorMessage = {
          ru: 'Не валидные параметры',
          en: 'Invalid parameters',
          uz: 'Yaroqsiz parametrlar'
        };
        break;
      default:
        errorMessage = {
          ru: 'Неизвестная ошибка',
          en: 'Unknown error',
          uz: "Noma'lum xato"
        };
    }
  }

  const errorResponse = {
    jsonrpc: '2.0',
    id: id || null,
    error: {
      code: code,
      message: errorMessage
    }
  };

  if (data !== null) {
    errorResponse.error.data = data;
  }

  return errorResponse;
};

// ✅ ORDER VALIDATION with correct error codes
const validateOrder = async (params, request_id) => {
  console.log('🔍 Validating order parameters');
  
  // Validate amount
  if (!params.amount || !Number.isInteger(params.amount) || params.amount <= 0) {
    throw {
      code: PaymeErrorCode.ERROR_INVALID_AMOUNT,
      message: null,
      data: null
    };
  }
  
  // Validate account parameters
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
  
  // Validate amount matches order amount
  if (orderInfo.amount !== params.amount) {
    throw {
      code: PaymeErrorCode.ERROR_INVALID_AMOUNT,
      message: null,
      data: null
    };
  }
  
  // Check order state
  if (orderInfo.state !== 'waiting_pay') {
    throw {
      code: PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
      message: null,
      data: null
    };
  }
  
  return orderInfo;
};

// ✅ FIND ORDER BY ID
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
    const planFromOrderId = orderParts[3];
    if (planFromOrderId === 'pro') {
      expectedAmount = PAYMENT_AMOUNTS.pro;
    }
    
    console.log('✅ Order found and validated');
    
    return {
      id: parseInt(order_id),
      amount: expectedAmount,
      state: 'waiting_pay',
      user_id: userId
    };
    
  } catch (error) {
    console.error('❌ Error finding order:', error);
    return null;
  }
};

// ✅ 1. CheckPerformTransaction
const handleCheckPerformTransaction = async (req, res, id, params) => {
  console.log('🔍 CheckPerformTransaction');
  
  try {
    // Validate order
    const order = await validateOrder(params, id);
    
    // Check for existing active/completed transactions
    const existingTransaction = await PaymeTransaction.findByOrderId(params.account.order_id);
    
    if (existingTransaction && 
        (existingTransaction.state === PaymeTransaction.STATES.STATE_CREATED || 
         existingTransaction.state === PaymeTransaction.STATES.STATE_COMPLETED)) {
      
      console.log('❌ Found existing active/completed transaction');
      return res.status(200).json(createErrorResponse(
        id, 
        PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
        null
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

// ✅ 2. CreateTransaction
const handleCreateTransaction = async (req, res, id, params) => {
  console.log('🆕 CreateTransaction');
  
  try {
    // Validate order first
    const order = await validateOrder(params, id);
    
    // Check for existing transactions for this order
    const existingOrderTransaction = await PaymeTransaction.findByOrderId(params.account.order_id);
    
    if (existingOrderTransaction) {
      if ((existingOrderTransaction.state === PaymeTransaction.STATES.STATE_CREATED || 
           existingOrderTransaction.state === PaymeTransaction.STATES.STATE_COMPLETED) &&
          existingOrderTransaction.paycom_transaction_id !== params.id) {
        
        console.log('❌ Found other active/completed transaction for this order');
        return res.status(200).json(createErrorResponse(
          id,
          PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
          null
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
          null
        ));
      }
      
      if (transaction.isExpired()) {
        console.log('❌ Transaction expired, cancelling');
        await transaction.cancel(PaymeTransaction.REASONS.REASON_CANCELLED_BY_TIMEOUT);
        
        return res.status(200).json(createErrorResponse(
          id,
          PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
          null
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
    
    // Validate transaction time
    const currentTime = Date.now();
    const transactionTime = parseInt(params.time);
    
    if (currentTime - transactionTime >= PaymeTransaction.TIMEOUT) {
      console.log('❌ Transaction time is too old');
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
        null
      ));
    }
    
    // Create new transaction
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

// ✅ 3. PerformTransaction
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
        null
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
            null
          ));
        }
        
        // Perform the transaction
        const performTime = new Date();
        transaction.state = PaymeTransaction.STATES.STATE_COMPLETED;
        transaction.perform_time = performTime;
        
        // Start database transaction for atomicity
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
          await transaction.save({ session });
          
          // Update user subscription
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
        // Transaction already completed, return it
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
        // Unknown situation
        console.log('❌ Cannot perform transaction in current state');
        return res.status(200).json(createErrorResponse(
          id,
          PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
          null
        ));
    }
    
  } catch (error) {
    console.error('❌ PerformTransaction error:', error);
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.ERROR_INTERNAL_SYSTEM));
  }
};

// ✅ 4. CancelTransaction
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
        null
      ));
    }
    
    const reason = parseInt(params.reason) || PaymeTransaction.REASONS.REASON_UNKNOWN;
    
    switch (transaction.state) {
      case PaymeTransaction.STATES.STATE_CANCELLED:
      case PaymeTransaction.STATES.STATE_CANCELLED_AFTER_COMPLETE:
        // Already cancelled, return it
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
        // Cancel active transaction
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
        // Check if cancelling completed transaction is allowed
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
            null
          ));
        }
        
      default:
        console.log('❌ Unknown transaction state for cancellation');
        return res.status(200).json(createErrorResponse(
          id,
          PaymeErrorCode.ERROR_COULD_NOT_PERFORM,
          null
        ));
    }
    
  } catch (error) {
    console.error('❌ CancelTransaction error:', error);
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.ERROR_INTERNAL_SYSTEM));
  }
};

// ✅ 5. CheckTransaction
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
        null
      ));
    }
    
    console.log('✅ Transaction found:', transaction.paycom_transaction_id);
    
    // Return transaction details
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

// ✅ 6. GetStatement
const handleGetStatement = async (req, res, id, params) => {
  console.log('📊 GetStatement');
  
  try {
    // Validate parameters
    if (!params.from) {
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_PARAMS,
        null,
        'from'
      ));
    }
    
    if (!params.to) {
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_PARAMS,
        null,
        'to'
      ));
    }
    
    if (parseInt(params.from) >= parseInt(params.to)) {
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_PARAMS,
        null,
        'from'
      ));
    }
    
    // Get transactions for the specified period
    const transactions = await PaymeTransaction.getStatement(params.from, params.to);
    
    // Convert to statement format
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

// ✅ 7. SetFiscalData (NEW - from documentation)
const handleSetFiscalData = async (req, res, id, params) => {
  console.log('🧾 SetFiscalData');
  
  try {
    // Validate parameters
    if (!params.id || !params.type || !params.fiscal_data) {
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_FISCAL_PARAMS,
        null
      ));
    }
    
    // Validate type
    if (!['PERFORM', 'CANCEL'].includes(params.type)) {
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_FISCAL_PARAMS,
        {
          ru: 'Неверный тип чека',
          en: 'Invalid receipt type',
          uz: 'Chek turi noto\'g\'ri'
        }
      ));
    }
    
    // Find transaction by receipt ID (this is different from PayMe transaction ID)
    const transaction = await PaymeTransaction.findOne({
      $or: [
        { paycom_transaction_id: params.id },
        { receipt_id: params.id }
      ]
    });
    
    if (!transaction) {
      console.log('❌ Receipt not found');
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_RECEIPT_NOT_FOUND,
        null
      ));
    }
    
    // Store fiscal data
    if (params.type === 'PERFORM') {
      transaction.fiscal_perform_data = params.fiscal_data;
    } else if (params.type === 'CANCEL') {
      transaction.fiscal_cancel_data = params.fiscal_data;
    }
    
    await transaction.save();
    
    console.log('✅ Fiscal data saved for transaction:', transaction.paycom_transaction_id);
    
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      result: {
        success: true
      }
    });
    
  } catch (error) {
    console.error('❌ SetFiscalData error:', error);
    return res.status(200).json(createErrorResponse(
      id,
      PaymeErrorCode.ERROR_INTERNAL_SYSTEM,
      null
    ));
  }
};

// ✅ MAIN HANDLER
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
    
    // Validate JSON-RPC format
    if (!jsonrpc || jsonrpc !== '2.0') {
      console.log('❌ Invalid JSON-RPC version');
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INVALID_JSON_RPC_OBJECT,
        null
      ));
    }
    
    if (!method) {
      console.log('❌ Method not specified');
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_METHOD_NOT_FOUND,
        null
      ));
    }
    
    // Authorize session
    const authResult = validatePaymeAuth(req);
    if (!authResult.valid) {
      console.log('❌ Authorization failed:', authResult.error);
      return res.status(200).json(createErrorResponse(
        id,
        PaymeErrorCode.ERROR_INSUFFICIENT_PRIVILEGE,
        null
      ));
    }
    
    // Route to appropriate handler
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
        
      case 'SetFiscalData':
        return handleSetFiscalData(req, res, id, params);
        
      default:
        console.log('❌ Unknown method:', method);
        return res.status(200).json(createErrorResponse(
          id,
          PaymeErrorCode.ERROR_METHOD_NOT_FOUND,
          null
        ));
    }
    
  } catch (error) {
    console.error('❌ PayMe webhook error:', error);
    return res.status(200).json(createErrorResponse(
      req.body?.id || null,
      PaymeErrorCode.ERROR_INTERNAL_SYSTEM,
      null
    ));
  }
};

// ✅ PAYMENT INITIATION
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
    
    // Generate correct PayMe URL
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