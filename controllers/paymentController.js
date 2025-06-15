// controllers/paymentController.js - FIXED PAYME MERCHANT API IMPLEMENTATION
const User = require('../models/user');

// Payment amounts in tiyin (1 UZS = 100 tiyin)
const PAYMENT_AMOUNTS = {
  start: 260000, // 2600 UZS
  pro: 455000    // 4550 UZS
};

// Transaction states according to Payme documentation
const TransactionState = {
  STATE_IN_PROGRESS: 1,   // Transaction created, waiting for perform
  STATE_DONE: 2,          // Transaction completed successfully
  STATE_CANCELED: -1,     // Transaction cancelled before perform
  STATE_POST_CANCELED: -2 // Transaction cancelled after perform (refunded)
};

// Cancel reasons according to Payme documentation
const CancelReason = {
  RECEIVER_NOT_FOUND: 1,
  DEBIT_OPERATION_ERROR: 2,
  TRANSACTION_ERROR: 3,
  TRANSACTION_TIMEOUT: 4,
  MONEY_BACK: 5,
  UNKNOWN_ERROR: 10
};

// Error codes according to Payme specification
const PaymeError = {
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

// In-memory storage (use database in production)
const transactions = new Map();
const orders = new Map();
const accounts = new Map(); // Map account IDs to user information

// Initialize some test data
let orderIdCounter = 1000;

/**
 * Initialize test accounts and orders
 */
const initializeTestData = () => {
  // Add some test accounts
  accounts.set('100', { userId: 'user1', phone: '998901234567', name: 'Test User 1' });
  accounts.set('101', { userId: 'user2', phone: '998901234568', name: 'Test User 2' });
  accounts.set('102', { userId: 'user3', phone: '998901234569', name: 'Test User 3' });
  
  // Add some test orders
  orders.set(100, { 
    id: 100, 
    accountId: '100',
    amount: 260000, // Start plan
    state: 'available',
    product: 'start_plan',
    created: Date.now()
  });
  
  orders.set(101, { 
    id: 101, 
    accountId: '101',
    amount: 455000, // Pro plan
    state: 'available',
    product: 'pro_plan',
    created: Date.now()
  });
};

// Initialize test data
initializeTestData();

/**
 * Current merchant key for authentication
 */
let currentMerchantKey = process.env.PAYME_MERCHANT_KEY || process.env.PAYME_TEST_KEY || 'test_key';

/**
 * Validates Payme authorization header
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
    return password === currentMerchantKey;
  } catch (error) {
    return false;
  }
};

/**
 * Creates error response according to Payme specification
 */
const createError = (id, code, message, data = null) => {
  const errorMessages = {
    [PaymeError.INVALID_AMOUNT]: {
      ru: 'Неверная сумма',
      en: 'Invalid amount',
      uz: "Noto'g'ri summa"
    },
    [PaymeError.TRANSACTION_NOT_FOUND]: {
      ru: 'Транзакция не найдена',
      en: 'Transaction not found',
      uz: 'Tranzaksiya topilmadi'
    },
    [PaymeError.UNABLE_TO_PERFORM_OPERATION]: {
      ru: 'Невозможно выполнить операцию',
      en: 'Unable to perform operation',
      uz: "Amalni bajarib bo'lmadi"
    },
    [PaymeError.ORDER_COMPLETED]: {
      ru: 'Заказ выполнен. Невозможно отменить транзакцию',
      en: 'Order completed. Unable to cancel transaction',
      uz: 'Buyurtma bajarildi. Tranzaksiyani bekor qilib bo\'lmaydi'
    },
    [PaymeError.ORDER_NOT_EXISTS]: {
      ru: 'Неверный код заказа',
      en: 'Invalid order code',
      uz: "Buyurtma kodi noto'g'ri"
    },
    [PaymeError.ORDER_AVAILABLE]: {
      ru: 'Заказ доступен для оплаты',
      en: 'Order available for payment',
      uz: "Buyurtma to'lov uchun mavjud"
    },
    [PaymeError.ORDER_NOT_AVAILABLE]: {
      ru: 'Заказ недоступен для оплаты',
      en: 'Order not available for payment',
      uz: "Buyurtma to'lov uchun mavjud emas"
    },
    [PaymeError.INVALID_AUTHORIZATION]: {
      ru: 'Ошибка авторизации',
      en: 'Authorization error',
      uz: 'Avtorizatsiya xatosi'
    },
    [PaymeError.METHOD_NOT_FOUND]: {
      ru: 'Метод не найден',
      en: 'Method not found',
      uz: 'Metod topilmadi'
    },
    [PaymeError.INVALID_JSON_RPC]: {
      ru: 'Некорректный JSON-RPC запрос',
      en: 'Invalid JSON-RPC request',
      uz: "Noto'g'ri JSON-RPC so'rov"
    },
    [PaymeError.PARSE_ERROR]: {
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

  // Add data field for account-related errors
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
  
  // Get order ID from account object
  const orderId = account?.order_id;
  
  if (!orderId) {
    throw { code: PaymeError.ORDER_NOT_EXISTS, data: 'order_id' };
  }

  // Find order
  const order = orders.get(Number(orderId));
  if (!order) {
    throw { code: PaymeError.ORDER_NOT_EXISTS, data: 'order_id' };
  }

  // Check if amount matches
  if (Number(amount) !== order.amount) {
    throw { code: PaymeError.INVALID_AMOUNT };
  }

  // Check if order is available
  if (order.state !== 'available') {
    throw { code: PaymeError.ORDER_NOT_AVAILABLE, data: 'order_id' };
  }

  // Check if there's already an active transaction for this order
  for (const [txId, tx] of transactions.entries()) {
    if (tx.account?.order_id === orderId && 
        tx.state === TransactionState.STATE_IN_PROGRESS) {
      throw { code: PaymeError.ORDER_NOT_AVAILABLE, data: 'order_id' };
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
  const orderId = account?.order_id;

  // Check if transaction already exists
  let transaction = transactions.get(id);
  if (transaction) {
    // If transaction exists, just return its current state
    return {
      create_time: transaction.create_time,
      transaction: transaction.transaction,
      state: transaction.state,
      receivers: null
    };
  }

  // Validate order
  if (!orderId) {
    throw { code: PaymeError.ORDER_NOT_EXISTS, data: 'order_id' };
  }

  const order = orders.get(Number(orderId));
  if (!order) {
    throw { code: PaymeError.ORDER_NOT_EXISTS, data: 'order_id' };
  }

  // Validate amount
  if (Number(amount) !== order.amount) {
    throw { code: PaymeError.INVALID_AMOUNT };
  }

  // Check if order is available
  if (order.state !== 'available') {
    throw { code: PaymeError.UNABLE_TO_PERFORM_OPERATION };
  }

  // Check for existing active transaction on this order
  for (const [txId, tx] of transactions.entries()) {
    if (tx.account?.order_id === orderId && 
        tx.state === TransactionState.STATE_IN_PROGRESS) {
      throw { code: PaymeError.UNABLE_TO_PERFORM_OPERATION };
    }
  }

  // Create transaction
  const transactionNumber = String(Date.now()).slice(-8); // Use last 8 digits of timestamp
  transaction = {
    id: id,
    paycom_time: time,
    paycom_time_datetime: new Date(time),
    create_time: Date.now(),
    perform_time: 0,
    cancel_time: 0,
    transaction: transactionNumber,
    state: TransactionState.STATE_IN_PROGRESS,
    amount: Number(amount),
    account: account,
    order_id: orderId,
    reason: null
  };

  transactions.set(id, transaction);
  
  // Lock the order
  order.state = 'locked';
  order.transaction_id = id;

  return {
    create_time: transaction.create_time,
    transaction: transaction.transaction,
    state: transaction.state,
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
    throw { code: PaymeError.TRANSACTION_NOT_FOUND };
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
  if (transaction.state === TransactionState.STATE_CANCELED || 
      transaction.state === TransactionState.STATE_POST_CANCELED) {
    throw { code: PaymeError.UNABLE_TO_PERFORM_OPERATION };
  }

  // Check if transaction expired (12 hours timeout)
  const timeout = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
  const age = Date.now() - transaction.create_time;
  if (age > timeout) {
    // Cancel the transaction due to timeout
    transaction.state = TransactionState.STATE_CANCELED;
    transaction.cancel_time = Date.now();
    transaction.reason = CancelReason.TRANSACTION_TIMEOUT;
    
    // Unlock the order
    const order = orders.get(Number(transaction.order_id));
    if (order) {
      order.state = 'available';
      order.transaction_id = null;
    }
    
    throw { code: PaymeError.UNABLE_TO_PERFORM_OPERATION };
  }

  // Check order still exists and is valid
  const order = orders.get(Number(transaction.order_id));
  if (!order) {
    throw { code: PaymeError.ORDER_NOT_EXISTS, data: 'order_id' };
  }
  
  // Perform transaction
  transaction.state = TransactionState.STATE_DONE;
  transaction.perform_time = Date.now();

  // Mark order as paid
  order.state = 'paid';
  order.paid_time = Date.now();

  // Update user subscription if account is linked to a user
  const accountId = order.accountId;
  if (accountId && accounts.has(accountId)) {
    const accountInfo = accounts.get(accountId);
    if (accountInfo.userId) {
      try {
        const user = await User.findById(accountInfo.userId);
        if (user) {
          // Determine plan based on amount
          let plan = 'free';
          if (transaction.amount === PAYMENT_AMOUNTS.start) {
            plan = 'start';
          } else if (transaction.amount === PAYMENT_AMOUNTS.pro) {
            plan = 'pro';
          }
          
          user.subscriptionPlan = plan;
          user.paymentStatus = 'paid';
          await user.save();
        }
      } catch (error) {
        console.error('Error updating user subscription:', error);
        // Don't throw - payment is still successful
      }
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
    throw { code: PaymeError.TRANSACTION_NOT_FOUND };
  }

  // If already cancelled, return current state
  if (transaction.state === TransactionState.STATE_CANCELED || 
      transaction.state === TransactionState.STATE_POST_CANCELED) {
    return {
      transaction: transaction.transaction,
      cancel_time: transaction.cancel_time,
      state: transaction.state
    };
  }

  // Get order
  const order = orders.get(Number(transaction.order_id));
  
  // Check if order is completed (delivered)
  if (transaction.state === TransactionState.STATE_DONE && order && order.delivered) {
    throw { code: PaymeError.ORDER_COMPLETED };
  }

  // Cancel transaction based on current state
  if (transaction.state === TransactionState.STATE_IN_PROGRESS) {
    // Cancel before perform
    transaction.state = TransactionState.STATE_CANCELED;
  } else if (transaction.state === TransactionState.STATE_DONE) {
    // Cancel after perform (refund)
    transaction.state = TransactionState.STATE_POST_CANCELED;
    
    // Revert order state
    if (order) {
      order.state = 'available';
      order.paid_time = null;
      order.transaction_id = null;
    }
    
    // Revert user subscription
    const accountId = order?.accountId;
    if (accountId && accounts.has(accountId)) {
      const accountInfo = accounts.get(accountId);
      if (accountInfo.userId) {
        try {
          const user = await User.findById(accountInfo.userId);
          if (user) {
            user.subscriptionPlan = 'free';
            user.paymentStatus = 'pending';
            await user.save();
          }
        } catch (error) {
          console.error('Error reverting user subscription:', error);
        }
      }
    }
  }

  transaction.cancel_time = Date.now();
  transaction.reason = reason || CancelReason.UNKNOWN_ERROR;

  // Unlock order if it was locked
  if (order && transaction.state === TransactionState.STATE_CANCELED) {
    order.state = 'available';
    order.transaction_id = null;
  }

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
    throw { code: PaymeError.TRANSACTION_NOT_FOUND };
  }

  return {
    create_time: transaction.create_time,
    perform_time: transaction.perform_time,
    cancel_time: transaction.cancel_time,
    transaction: transaction.transaction,
    state: transaction.state,
    reason: transaction.reason
  };
};

/**
 * GetStatement - Gets transactions for a period
 */
const GetStatement = async (params) => {
  const { from, to } = params;

  const result = [];
  
  // Filter transactions by Payme creation time
  for (const [id, transaction] of transactions.entries()) {
    if (transaction.paycom_time >= from && transaction.paycom_time <= to) {
      result.push({
        id: transaction.id,
        time: transaction.paycom_time,
        amount: transaction.amount,
        account: transaction.account,
        create_time: transaction.create_time,
        perform_time: transaction.perform_time,
        cancel_time: transaction.cancel_time,
        transaction: transaction.transaction,
        state: transaction.state,
        reason: transaction.reason,
        receivers: null
      });
    }
  }

  // Sort by creation time ascending
  result.sort((a, b) => a.time - b.time);

  return { transactions: result };
};

/**
 * Main handler for Payme requests
 */
const handlePaycomRequest = async (req, res) => {
  const { method, params, id } = req.body;

  try {
    // Validate authorization
    if (!validateAuth(req.headers.authorization)) {
      return res.json(createError(id, PaymeError.INVALID_AUTHORIZATION));
    }

    // Validate JSON-RPC format
    if (!id || !method) {
      return res.json(createError(id || 0, PaymeError.INVALID_JSON_RPC));
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
        return res.json(createError(id, PaymeError.METHOD_NOT_FOUND));
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
      res.json(createError(id, PaymeError.UNABLE_TO_PERFORM_OPERATION));
    }
  }
};

/**
 * Sandbox payment handler
 */
const handleSandboxPayment = handlePaycomRequest;

/**
 * Create order for payment
 */
const createOrder = (accountId, amount, product) => {
  const orderId = ++orderIdCounter;
  const order = {
    id: orderId,
    accountId: accountId,
    amount: amount,
    state: 'available',
    product: product,
    created: Date.now(),
    transaction_id: null,
    paid_time: null,
    delivered: false
  };
  
  orders.set(orderId, order);
  return order;
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

    // Create or get account for user
    let accountId = null;
    for (const [id, account] of accounts.entries()) {
      if (account.userId === userId) {
        accountId = id;
        break;
      }
    }
    
    if (!accountId) {
      // Create new account
      accountId = String(accounts.size + 100);
      accounts.set(accountId, {
        userId: userId,
        phone: user.phone || '998900000000',
        name: user.name || 'User'
      });
    }

    // Create order
    const order = createOrder(accountId, amount, `${plan}_plan`);

    const isProduction = process.env.NODE_ENV === 'production';
    const merchantId = process.env.PAYME_MERCHANT_ID || '5e730e8e0b852a417aa49ceb';
    
    // Create payment URL
    const baseUrl = isProduction 
      ? 'https://checkout.paycom.uz' 
      : 'https://test.paycom.uz';
      
    // Encode account parameter
    const accountParam = Buffer.from(JSON.stringify({ order_id: order.id })).toString('base64');
    
    const paymentUrl = `${baseUrl}/${merchantId}/?amount=${amount}&account=${accountParam}`;

    return res.status(200).json({
      message: '✅ Платеж инициирован',
      success: true,
      orderId: order.id,
      amount: amount,
      amountUzs: amount / 100,
      plan: plan,
      paymentUrl: paymentUrl,
      sandbox: !isProduction,
      account: {
        order_id: order.id
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

    return res.json({
      message: '✅ Transaction status retrieved',
      success: true,
      transaction: {
        id: transaction.id,
        state: transaction.state,
        stateText: getTransactionStateText(transaction.state),
        amount: transaction.amount,
        create_time: transaction.create_time,
        perform_time: transaction.perform_time,
        cancel_time: transaction.cancel_time,
        order_id: transaction.order_id
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

/**
 * Set merchant key (for testing)
 */
const setMerchantKey = (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ message: 'Key is required' });
  }
  currentMerchantKey = key;
  return res.json({ message: 'Merchant key updated', success: true });
};

/**
 * Add test order (for testing)
 */
const addTestOrder = (orderId, amount, delivered = false) => {
  const order = {
    id: orderId,
    accountId: '100', // Default test account
    amount: amount,
    state: delivered ? 'delivered' : 'available',
    product: 'test_product',
    created: Date.now(),
    transaction_id: null,
    paid_time: delivered ? Date.now() : null,
    delivered: delivered
  };
  
  orders.set(orderId, order);
  return order;
};

/**
 * Clear all transactions (for testing)
 */
const clearTransactions = () => {
  transactions.clear();
  // Reset orders to available state
  for (const [id, order] of orders.entries()) {
    if (order.state !== 'delivered') {
      order.state = 'available';
      order.transaction_id = null;
      order.paid_time = null;
    }
  }
};

/**
 * List all transactions (for debugging)
 */
const listTransactions = (req, res) => {
  const txList = Array.from(transactions.values()).map(tx => ({
    id: tx.id,
    transaction: tx.transaction,
    state: tx.state,
    stateText: getTransactionStateText(tx.state),
    amount: tx.amount,
    order_id: tx.order_id,
    create_time: tx.create_time,
    perform_time: tx.perform_time,
    cancel_time: tx.cancel_time
  }));

  res.json({
    message: 'Transactions list',
    count: txList.length,
    transactions: txList
  });
};

/**
 * Clear sandbox transactions (for testing)
 */
const clearSandboxTransactions = (req, res) => {
  clearTransactions();
  res.json({
    message: 'All transactions cleared',
    success: true
  });
};

/**
 * Validate user route
 */
const validateUserRoute = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        valid: false
      });
    }

    return res.json({
      message: 'User validated',
      valid: true,
      user: {
        id: user._id,
        name: user.name,
        subscriptionPlan: user.subscriptionPlan,
        paymentStatus: user.paymentStatus
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error validating user',
      valid: false,
      error: error.message
    });
  }
};

/**
 * Handle Payme webhook
 */
const handlePaymeWebhook = handlePaycomRequest;

/**
 * Set account state (for testing)
 */
const setAccountState = (req, res) => {
  const { accountId, userId, phone, name } = req.body;
  
  if (!accountId) {
    return res.status(400).json({ message: 'Account ID is required' });
  }

  accounts.set(accountId, {
    userId: userId || null,
    phone: phone || '998900000000',
    name: name || 'Test Account'
  });

  return res.json({ 
    message: 'Account state updated', 
    success: true,
    account: accounts.get(accountId)
  });
};

module.exports = {
  handlePaycomRequest,
  handleSandboxPayment,
  applyPromoCode,
  initiatePaymePayment,
  checkPaymentStatus,
  validateUserRoute,
  handlePaymeWebhook,
  listTransactions,
  clearSandboxTransactions,
  setAccountState,
  setMerchantKey,
  
  // Helper functions for testing
  addTestOrder,
  clearTransactions,
  
  // Export constants for testing
  TransactionState,
  CancelReason,
  PaymeError
};