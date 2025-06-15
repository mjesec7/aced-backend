// controllers/paymentController.js - COMPLETE PAYCOM INTEGRATION
// Based on official Paycom Java/Kotlin template

const User = require('../models/user');
const axios = require('axios');

// Payment amounts in tiyin (1 UZS = 100 tiyin)
const PAYMENT_AMOUNTS = {
  start: 260000, // 2600 UZS
  pro: 455000    // 4550 UZS
};

// Transaction states matching Kotlin enum
const TransactionState = {
  STATE_NEW: 0,           // Initial state (not used in our implementation)
  STATE_IN_PROGRESS: 1,   // Transaction created, waiting for perform
  STATE_DONE: 2,          // Transaction completed successfully
  STATE_CANCELED: -1,     // Transaction cancelled before perform
  STATE_POST_CANCELED: -2 // Transaction cancelled after perform (refunded)
};

// Cancel reasons matching Kotlin enum
const OrderCancelReason = {
  RECEIVER_NOT_FOUND: 1,
  DEBIT_OPERATION_ERROR: 2,
  TRANSACTION_ERROR: 3,
  TRANSACTION_TIMEOUT: 4,
  MONEY_BACK: 5,
  UNKNOWN_ERROR: 10
};

// Error codes according to Paycom specification
const PaycomError = {
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  ORDER_COMPLETED: -31007,
  UNABLE_TO_PERFORM_OPERATION: -31008,
  ORDER_NOT_EXISTS: -31050,
  ORDER_AVAILABLE: -31051,
  ORDER_NOT_AVAILABLE: -31052,
  INVALID_AUTHORIZATION: -32504,
  METHOD_NOT_FOUND: -32601,
  INVALID_JSON_RPC: -32600,
  PARSE_ERROR: -32700
};

// Store transactions in memory (in production, use database)
const transactions = new Map();

// Store orders in memory (simulating database)
const orders = new Map([
  [100, { id: 100, amount: 50000, delivered: true }],
  [101, { id: 101, amount: 55000, delivered: false }],
  [102, { id: 102, amount: 60000, delivered: false }]
]);

// Store current merchant key
let currentMerchantKey = process.env.PAYME_MERCHANT_KEY || process.env.PAYME_TEST_KEY;

/**
 * Validates Paycom authorization header
 */
const validateAuth = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    
    // Username must be "Paycom"
    if (username !== 'Paycom') {
      return false;
    }
    
    // Check password against merchant key
    const expectedPassword = currentMerchantKey;
    
    // For sandbox testing, accept any reasonable password if no key is set
    if (!expectedPassword && password && password.length >= 10) {
      return true;
    }
    
    return password === expectedPassword;
  } catch (error) {
    return false;
  }
};

/**
 * Creates error response according to Paycom specification
 */
const createError = (id, code, message, data = null) => {
  const errorMessages = {
    [PaycomError.INVALID_AMOUNT]: {
      ru: 'Неверная сумма',
      en: 'Invalid amount',
      uz: "Noto'g'ri summa"
    },
    [PaycomError.TRANSACTION_NOT_FOUND]: {
      ru: 'Транзакция не найдена',
      en: 'Transaction not found',
      uz: 'Tranzaksiya topilmadi'
    },
    [PaycomError.UNABLE_TO_PERFORM_OPERATION]: {
      ru: 'Невозможно выполнить операцию',
      en: 'Unable to perform operation',
      uz: "Amalni bajarib bo'lmadi"
    },
    [PaycomError.ORDER_COMPLETED]: {
      ru: 'Заказ выполнен. Невозможно отменить транзакцию',
      en: 'Order completed. Unable to cancel transaction',
      uz: 'Buyurtma bajarildi. Tranzaksiyani bekor qilib bo\'lmaydi'
    },
    [PaycomError.ORDER_NOT_EXISTS]: {
      ru: 'Заказ не найден',
      en: 'Order not found',
      uz: 'Buyurtma topilmadi'
    },
    [PaycomError.ORDER_AVAILABLE]: {
      ru: 'Заказ доступен для оплаты',
      en: 'Order available for payment',
      uz: "Buyurtma to'lov uchun mavjud"
    },
    [PaycomError.ORDER_NOT_AVAILABLE]: {
      ru: 'Заказ недоступен для оплаты',
      en: 'Order not available for payment',
      uz: "Buyurtma to'lov uchun mavjud emas"
    },
    [PaycomError.INVALID_AUTHORIZATION]: {
      ru: 'Ошибка авторизации',
      en: 'Authorization error',
      uz: 'Avtorizatsiya xatosi'
    },
    [PaycomError.METHOD_NOT_FOUND]: {
      ru: 'Метод не найден',
      en: 'Method not found',
      uz: 'Metod topilmadi'
    },
    [PaycomError.INVALID_JSON_RPC]: {
      ru: 'Некорректный JSON-RPC запрос',
      en: 'Invalid JSON-RPC request',
      uz: "Noto'g'ri JSON-RPC so'rov"
    },
    [PaycomError.PARSE_ERROR]: {
      ru: 'Ошибка парсинга JSON',
      en: 'JSON parse error',
      uz: 'JSON tahlil xatosi'
    }
  };

  const response = {
    jsonrpc: '2.0',
    id: id,
    error: {
      code: code,
      message: errorMessages[code] || message || {
        ru: 'Неизвестная ошибка',
        en: 'Unknown error',
        uz: "Noma'lum xato"
      }
    }
  };

  // Add data field for order-related errors
  if (data && code >= -31099 && code <= -31050) {
    response.error.data = data;
  }

  return response;
};

/**
 * CheckPerformTransaction - Checks if transaction can be performed
 */
const CheckPerformTransaction = async (params) => {
  const { amount, account } = params;
  const orderId = account?.order_id || account?.order || account?.id;

  // Validate order exists
  const order = orders.get(Number(orderId));
  if (!order) {
    throw { code: PaycomError.ORDER_NOT_EXISTS, data: 'order_id' };
  }

  // Validate amount matches
  if (amount !== order.amount) {
    throw { code: PaycomError.INVALID_AMOUNT };
  }

  // Check if order is already delivered (not available for payment)
  if (order.delivered) {
    throw { code: PaycomError.ORDER_NOT_AVAILABLE, data: 'order_id' };
  }

  // Check if order has active transaction
  for (const [id, transaction] of transactions.entries()) {
    if (transaction.order?.id === order.id && 
        transaction.state === TransactionState.STATE_IN_PROGRESS) {
      throw { code: PaycomError.ORDER_NOT_AVAILABLE, data: 'order_id' };
    }
  }

  return {
    allow: true,
    detail: {
      receipt_type: 0
    }
  };
};

/**
 * CreateTransaction - Creates a new transaction
 */
const CreateTransaction = async (params) => {
  const { id, time, amount, account } = params;
  const orderId = account?.order_id || account?.order || account?.id;

  // Check if transaction already exists
  const existingTransaction = transactions.get(id);
  if (existingTransaction) {
    return {
      create_time: existingTransaction.create_time,
      transaction: existingTransaction.transaction,
      state: existingTransaction.state,
      receivers: null
    };
  }

  // Validate order exists
  const order = orders.get(Number(orderId));
  if (!order) {
    throw { code: PaycomError.ORDER_NOT_EXISTS, data: 'order_id' };
  }

  // Validate amount
  if (amount !== order.amount) {
    throw { code: PaycomError.INVALID_AMOUNT };
  }

  // Check if order is available
  if (order.delivered) {
    throw { code: PaycomError.UNABLE_TO_PERFORM_OPERATION };
  }

  // Check for existing active transaction on this order
  for (const [txId, transaction] of transactions.entries()) {
    if (transaction.order?.id === order.id && 
        transaction.state === TransactionState.STATE_IN_PROGRESS &&
        txId !== id) {
      throw { code: PaycomError.UNABLE_TO_PERFORM_OPERATION };
    }
  }

  // Create new transaction
  const newTransaction = {
    id: id,
    paycom_id: id,
    paycom_time: new Date(time),
    create_time: Date.now(),
    perform_time: null,
    cancel_time: null,
    transaction: String(transactions.size + 1),
    state: TransactionState.STATE_IN_PROGRESS,
    amount: amount,
    account: account,
    order: order,
    reason: null
  };

  transactions.set(id, newTransaction);

  return {
    create_time: newTransaction.create_time,
    transaction: newTransaction.transaction,
    state: newTransaction.state,
    receivers: null
  };
};

/**
 * PerformTransaction - Completes the transaction
 */
const PerformTransaction = async (params) => {
  const { id } = params;

  // Find transaction
  const transaction = transactions.get(id);
  if (!transaction) {
    throw { code: PaycomError.TRANSACTION_NOT_FOUND };
  }

  // If already completed, return current state
  if (transaction.state === TransactionState.STATE_DONE) {
    return {
      transaction: transaction.transaction,
      perform_time: transaction.perform_time,
      state: transaction.state
    };
  }

  // Check if cancelled
  if (transaction.state < 0) {
    throw { code: PaycomError.UNABLE_TO_PERFORM_OPERATION };
  }

  // Check if transaction expired (12 hours)
  const age = Date.now() - transaction.create_time;
  if (age > 12 * 60 * 60 * 1000) {
    throw { code: PaycomError.UNABLE_TO_PERFORM_OPERATION };
  }

  // Check if order still exists and is valid
  if (transaction.order) {
    const currentOrder = orders.get(transaction.order.id);
    if (!currentOrder) {
      throw { code: PaycomError.ORDER_NOT_EXISTS, data: 'order_id' };
    }
    
    if (currentOrder.delivered) {
      throw { code: PaycomError.ORDER_NOT_AVAILABLE, data: 'order_id' };
    }
  }

  // Perform transaction
  transaction.state = TransactionState.STATE_DONE;
  transaction.perform_time = Date.now();

  // Mark order as delivered
  if (transaction.order) {
    const order = orders.get(transaction.order.id);
    if (order) {
      order.delivered = true;
    }
  }

  return {
    transaction: transaction.transaction,
    perform_time: transaction.perform_time,
    state: transaction.state
  };
};

/**
 * CancelTransaction - Cancels the transaction
 */
const CancelTransaction = async (params) => {
  const { id, reason } = params;

  // Find transaction
  const transaction = transactions.get(id);
  if (!transaction) {
    throw { code: PaycomError.TRANSACTION_NOT_FOUND };
  }

  // If already cancelled, return current state
  if (transaction.state < 0) {
    return {
      transaction: transaction.transaction,
      cancel_time: transaction.cancel_time,
      state: transaction.state
    };
  }

  // Check if order is completed and delivered
  if (transaction.state === TransactionState.STATE_DONE && transaction.order) {
    const order = orders.get(transaction.order.id);
    if (order && order.delivered) {
      // Cannot cancel completed order
      throw { code: PaycomError.ORDER_COMPLETED };
    }
  }

  // Determine new state based on current state
  if (transaction.state === TransactionState.STATE_IN_PROGRESS) {
    transaction.state = TransactionState.STATE_CANCELED;
  } else if (transaction.state === TransactionState.STATE_DONE) {
    // Refund - mark order as not delivered
    if (transaction.order) {
      const order = orders.get(transaction.order.id);
      if (order) {
        order.delivered = false;
      }
    }
    transaction.state = TransactionState.STATE_POST_CANCELED;
  }

  transaction.cancel_time = Date.now();
  transaction.reason = reason || OrderCancelReason.TRANSACTION_ERROR;

  return {
    transaction: transaction.transaction,
    cancel_time: transaction.cancel_time,
    state: transaction.state
  };
};

/**
 * CheckTransaction - Gets transaction information
 */
const CheckTransaction = async (params) => {
  const { id } = params;

  const transaction = transactions.get(id);
  if (!transaction) {
    throw { code: PaycomError.TRANSACTION_NOT_FOUND };
  }

  return {
    create_time: transaction.create_time,
    perform_time: transaction.perform_time || 0,
    cancel_time: transaction.cancel_time || 0,
    transaction: transaction.transaction,
    state: transaction.state,
    reason: transaction.reason || null
  };
};

/**
 * GetStatement - Gets transactions for a period
 */
const GetStatement = async (params) => {
  const { from, to } = params;
  const fromDate = new Date(from);
  const toDate = new Date(to);

  const result = [];
  for (const [id, transaction] of transactions.entries()) {
    if (transaction.paycom_time >= fromDate && transaction.paycom_time <= toDate) {
      result.push({
        id: transaction.paycom_id,
        time: transaction.paycom_time.getTime(),
        amount: transaction.amount,
        account: transaction.account,
        create_time: transaction.create_time,
        perform_time: transaction.perform_time || 0,
        cancel_time: transaction.cancel_time || 0,
        transaction: transaction.transaction,
        state: transaction.state,
        reason: transaction.reason || null,
        receivers: null
      });
    }
  }

  return { transactions: result };
};

/**
 * Main handler for Paycom requests
 */
const handlePaycomRequest = async (req, res) => {
  const { method, params, id } = req.body;

  try {
    // Validate authorization
    if (!validateAuth(req.headers.authorization)) {
      return res.json(createError(id, PaycomError.INVALID_AUTHORIZATION));
    }

    // Validate JSON-RPC format
    if (!id || !method) {
      return res.json(createError(id || 0, PaycomError.INVALID_JSON_RPC));
    }

    let result;
    switch (method) {
      case 'CheckPerformTransaction':
        result = await CheckPerformTransaction(params);
        break;
      case 'CreateTransaction':
        result = await CreateTransaction(params);
        break;
      case 'PerformTransaction':
        result = await PerformTransaction(params);
        break;
      case 'CancelTransaction':
        result = await CancelTransaction(params);
        break;
      case 'CheckTransaction':
        result = await CheckTransaction(params);
        break;
      case 'GetStatement':
        result = await GetStatement(params);
        break;
      default:
        return res.json(createError(id, PaycomError.METHOD_NOT_FOUND));
    }

    res.json({
      jsonrpc: '2.0',
      id: id,
      result: result
    });

  } catch (error) {
    if (error.code) {
      res.json(createError(id, error.code, null, error.data));
    } else {
      console.error('Unexpected error:', error);
      res.json(createError(id, PaycomError.UNABLE_TO_PERFORM_OPERATION));
    }
  }
};

/**
 * Sandbox payment handler - wraps the main handler
 */
const handleSandboxPayment = handlePaycomRequest;

/**
 * Helper function to add a test order
 */
const addTestOrder = (orderId, amount, delivered = false) => {
  orders.set(orderId, { id: orderId, amount, delivered });
  return { id: orderId, amount, delivered };
};

/**
 * Helper function to get order
 */
const getOrder = (orderId) => {
  return orders.get(orderId);
};

/**
 * Helper function to clear all transactions (for testing)
 */
const clearTransactions = () => {
  transactions.clear();
};

/**
 * Helper function to set merchant key
 */
const setMerchantKey = (key) => {
  currentMerchantKey = key;
};

/**
 * Apply promo code
 */
const applyPromoCode = async (req, res) => {
  try {
    const { userId, plan, promoCode } = req.body;

    if (!userId || !plan || !promoCode) {
      return res.status(400).json({ 
        message: '❌ Все поля обязательны: userId, plan, promoCode' 
      });
    }

    const validPromoCode = 'acedpromocode2406';
    if (promoCode.trim() !== validPromoCode) {
      return res.status(400).json({ 
        message: '❌ Неверный промокод' 
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
    res.status(500).json({ 
      message: '❌ Ошибка сервера при применении промокода' 
    });
  }
};

/**
 * Initiate Payme payment
 */
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

    // Create order for this payment
    const orderId = Date.now();
    addTestOrder(orderId, amount, false);

    const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const isProduction = process.env.NODE_ENV === 'production';
    
    let paymentUrl;
    if (isProduction) {
      paymentUrl = `https://checkout.paycom.uz/${process.env.PAYME_MERCHANT_ID}`;
    } else {
      paymentUrl = `https://aced.live/payment/checkout/${requestId}`;
    }

    return res.status(200).json({
      message: '✅ Платеж инициирован',
      success: true,
      sandbox: !isProduction,
      transaction: {
        id: requestId,
        orderId: orderId,
        amount: amount,
        plan: plan,
        state: TransactionState.STATE_NEW,
        create_time: Date.now()
      },
      paymentUrl: paymentUrl,
      metadata: {
        userId: userId,
        plan: plan,
        amountUzs: amount / 100,
        environment: isProduction ? 'production' : 'sandbox'
      }
    });

  } catch (err) {
    console.error('❌ Ошибка инициации платежа:', err);
    res.status(500).json({ 
      message: '❌ Ошибка сервера при инициации платежа',
      error: err.message
    });
  }
};

/**
 * Check payment status
 */
const checkPaymentStatus = async (req, res) => {
  try {
    const { transactionId, userId } = req.params;

    if (!transactionId) {
      return res.status(400).json({
        message: '❌ Transaction ID is required',
        success: false
      });
    }

    const transaction = transactions.get(transactionId);
    if (!transaction) {
      return res.status(404).json({
        message: '❌ Transaction not found',
        success: false
      });
    }

    // Update user if transaction is completed
    if (transaction.state === TransactionState.STATE_DONE && userId) {
      const user = await User.findById(userId);
      if (user) {
        let plan = 'free';
        if (transaction.amount === PAYMENT_AMOUNTS.start) {
          plan = 'start';
        } else if (transaction.amount === PAYMENT_AMOUNTS.pro) {
          plan = 'pro';
        }
        
        if (user.subscriptionPlan !== plan || user.paymentStatus !== 'paid') {
          user.subscriptionPlan = plan;
          user.paymentStatus = 'paid';
          await user.save();
        }
      }
    }

    return res.json({
      message: '✅ Transaction status retrieved',
      success: true,
      transaction: {
        id: transaction.id,
        state: transaction.state,
        stateText: getTransactionStateText(transaction.state),
        amount: transaction.amount,
        create_time: transaction.create_time,
        perform_time: transaction.perform_time || 0,
        cancel_time: transaction.cancel_time || 0
      }
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

/**
 * Get transaction state text
 */
const getTransactionStateText = (state) => {
  switch (state) {
    case TransactionState.STATE_NEW:
      return 'New';
    case TransactionState.STATE_IN_PROGRESS:
      return 'In Progress (waiting for payment)';
    case TransactionState.STATE_DONE:
      return 'Completed (paid)';
    case TransactionState.STATE_CANCELED:
      return 'Cancelled (before payment)';
    case TransactionState.STATE_POST_CANCELED:
      return 'Cancelled (refunded)';
    default:
      return 'Unknown';
  }
};

module.exports = {
  handlePaycomRequest,
  handleSandboxPayment,
  applyPromoCode,
  initiatePaymePayment,
  checkPaymentStatus,
  
  // Helper functions for testing
  addTestOrder,
  getOrder,
  clearTransactions,
  setMerchantKey,
  
  // Export constants for testing
  TransactionState,
  OrderCancelReason,
  PaycomError
};