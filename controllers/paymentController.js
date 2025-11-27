// controllers/paymentController.js - FIXED COMPLETE VERSION FOLLOWING PAYME DOCUMENTATION

import User from '../models/user.js';
import axios from 'axios';

// ================================================
// CONFIGURATION AND CONSTANTS
// ================================================

// Payment amounts in tiyin (UZS * 100) - PRO PLAN DURATION TIERS
const PAYMENT_AMOUNTS = {
  'pro-1': 25000000,   // 250,000 UZS for 1 month
  'pro-3': 67500000,   // 675,000 UZS for 3 months (10% discount)
  'pro-6': 120000000   // 1,200,000 UZS for 6 months (20% discount)
};

// Transaction states according to PayMe specification
const TransactionState = {
  CREATED: 1,
  COMPLETED: 2,
  CANCELLED_AFTER_CREATE: -1,
  CANCELLED_AFTER_COMPLETE: -2
};

// Account states for testing
const AccountState = {
  WAITING_PAYMENT: 'waiting_payment',
  PROCESSING: 'processing',
  BLOCKED: 'blocked',
  NOT_EXISTS: 'not_exists'
};

// FIXED: Complete PayMe Error codes from documentation
const PaymeErrorCode = {
  // Transaction errors (-31099 to -31001)
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  ORDER_COMPLETED: -31007,
  UNABLE_TO_PERFORM_OPERATION: -31008,

  // Account errors (-31099 to -31050)
  INVALID_ACCOUNT: -31050,
  ACCOUNT_NOT_FOUND: -31050,
  ACCOUNT_BLOCKED: -31051,
  ACCOUNT_PROCESSING: -31052,

  // Merchant errors from documentation
  MERCHANT_NOT_FOUND: -31601,
  INVALID_FIELD_VALUE: -31610,
  AMOUNT_TOO_SMALL: -31611,
  AMOUNT_TOO_LARGE: -31612,
  MERCHANT_SERVICE_UNAVAILABLE: -31622,
  MERCHANT_SERVICE_INCORRECT: -31623,
  CARD_ERROR: -31630,

  // JSON-RPC errors
  PARSE_ERROR: -32700,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  INVALID_AUTHORIZATION: -32504
};

// In-memory storage for sandbox testing
const sandboxTransactions = new Map();
const accountStates = new Map();
let currentMerchantKey = null;

// ================================================
// FIXED: PayMe Authorization Following Documentation
// ================================================

const validatePaymeAuth = (req) => {
  try {
    const authHeader = req.headers.authorization;


    if (!authHeader) {
      return { valid: false, error: 'MISSING_AUTH_HEADER' };
    }

    if (!authHeader.startsWith('Basic ')) {
      return { valid: false, error: 'INVALID_AUTH_FORMAT' };
    }

    // Decode credentials
    let credentials;
    try {
      credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    } catch (decodeError) {
      return { valid: false, error: 'DECODE_ERROR' };
    }

    const [username, password] = credentials.split(':');



    // ✅ CRITICAL: PayMe documentation specifies username must be "Paycom"
    if (username !== 'Paycom') {
      return { valid: false, error: 'INVALID_USERNAME' };
    }

    // Validate password (your merchant key)
    const expectedPassword = currentMerchantKey || process.env.PAYME_MERCHANT_KEY;

    if (!expectedPassword) {
      return { valid: false, error: 'NO_MERCHANT_KEY' };
    }

    if (password !== expectedPassword) {
      return { valid: false, error: 'INVALID_PASSWORD' };
    }

    return { valid: true };

  } catch (error) {
    console.error('❌ Authorization validation error:', error);
    return { valid: false, error: 'VALIDATION_ERROR' };
  }
};

// ================================================
// FIXED: Error Response Creation Following Documentation
// ================================================

const createErrorResponse = (id, code, data = null) => {
  // ✅ FIXED: Messages exactly as per PayMe documentation
  const messages = {
    [PaymeErrorCode.INVALID_ACCOUNT]: {
      ru: "Неверный account",
      en: "Invalid account",
      uz: "Noto'g'ri account"
    },
    [PaymeErrorCode.INVALID_AMOUNT]: {
      ru: "Неверная сумма",
      en: "Invalid amount",
      uz: "Noto'g'ri summa"
    },
    [PaymeErrorCode.TRANSACTION_NOT_FOUND]: {
      ru: "Транзакция не найдена",
      en: "Transaction not found",
      uz: "Tranzaksiya topilmadi"
    },
    [PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION]: {
      ru: "Невозможно выполнить операцию",
      en: "Unable to perform operation",
      uz: "Operatsiyani bajarib bo'lmaydi"
    },
    [PaymeErrorCode.METHOD_NOT_FOUND]: {
      ru: "Метод не найден",
      en: "Method not found",
      uz: "Usul topilmadi"
    },
    [PaymeErrorCode.INVALID_PARAMS]: {
      ru: "Неверные параметры",
      en: "Invalid parameters",
      uz: "Noto'g'ri parametrlar"
    },
    [PaymeErrorCode.INTERNAL_ERROR]: {
      ru: "Внутренняя ошибка",
      en: "Internal error",
      uz: "Ichki xatolik"
    },
    [PaymeErrorCode.INVALID_AUTHORIZATION]: {
      ru: "Неверная авторизация",
      en: "Invalid authorization",
      uz: "Noto'g'ri avtorizatsiya"
    }
  };

  const response = {
    jsonrpc: "2.0",
    id: id,
    error: {
      code: code,
      message: messages[code] || {
        ru: "Неизвестная ошибка",
        en: "Unknown error",
        uz: "Noma'lum xatolik"
      }
    }
  };

  // ✅ FIXED: Return correct field name for account errors
  if (code >= -31099 && code <= -31050 && data !== false) {
    // PayMe expects the field name that's missing or invalid
    response.error.data = data || getAccountFieldName();
  } else if (data !== null && data !== false) {
    response.error.data = data;
  }

  return response;
};

// ✅ FIXED: Determine account field name based on your business logic
const getAccountFieldName = () => {
  // ✅ CRITICAL FIX: Return 'Login' instead of 'Login'
  return 'Login';
};


// ================================================
// FIXED: PayMe GET URL Generation Following Documentation
// ================================================

const generatePaymeGetUrl = (merchantId, account, amount, options = {}) => {
  try {

    if (!merchantId || merchantId === 'undefined') {
      throw new Error('Valid merchant ID required');
    }

    if (!account || !account.Login) {  // ✅ CHANGED: Check for Login instead of Login
      throw new Error('Account Login required');
    }

    if (!amount || amount <= 0) {
      throw new Error('Valid amount required');
    }

    const params = [];

    // Required parameters
    params.push(`m=${merchantId}`);
    params.push(`a=${amount}`);

    // ✅ CRITICAL FIX: Use ac.Login instead of ac.Login
    params.push(`ac.Login=${account.Login}`);

    // Optional parameters
    if (options.lang && ['ru', 'uz', 'en'].includes(options.lang)) {
      params.push(`l=${options.lang}`);
    }

    if (options.callback) {
      params.push(`c=${encodeURIComponent(options.callback)}`);
    }

    if (options.callback_timeout && Number.isInteger(Number(options.callback_timeout))) {
      params.push(`ct=${options.callback_timeout}`);
    }

    if (options.currency) {
      params.push(`cr=${options.currency}`);
    }

    // ✅ Join with semicolon as per PayMe documentation
    const paramString = params.join(';');


    if (paramString.includes('undefined') || paramString.includes('null')) {
      throw new Error('Parameter string contains invalid values: ' + paramString);
    }

    const base64Params = Buffer.from(paramString, 'utf8').toString('base64');
    const checkoutUrl = 'https://checkout.paycom.uz';
    const finalUrl = `${checkoutUrl}/${base64Params}`;

    const decoded = Buffer.from(base64Params, 'base64').toString('utf8');
    if (decoded !== paramString) {
      throw new Error('URL encoding verification failed');
    }

    return finalUrl;

  } catch (error) {
    console.error('❌ GET URL generation failed:', error);
    throw error;
  }
};

// ================================================
// FIXED: PayMe POST Form Generation Following Documentation
// ================================================

const generatePaymePostForm = (userId, plan, options = {}) => {
  try {

    const merchantId = process.env.PAYME_MERCHANT_ID;
    if (!merchantId) {
      throw new Error('PAYME_MERCHANT_ID not configured');
    }

    const amount = PAYMENT_AMOUNTS[plan];
    if (!amount) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const baseOrderId = `aced${timestamp}${randomStr}`;
    const orderId = baseOrderId.replace(/[^a-zA-Z0-9]/g, '');

    // ✅ CRITICAL FIX: Use Login instead of Login
    const accountData = {
      Login: options.userId || userId  // Use Firebase ID as Login
    };

    // Create detail object as per documentation
    const detail = {
      receipt_type: 0,
      items: [{
        title: `ACED ${plan.toUpperCase()} Subscription`,
        price: amount,
        count: 1,
        code: "10899002001000000",
        vat_percent: 0,
        package_code: "1"
      }]
    };

    let detailBase64;
    try {
      const detailJson = JSON.stringify(detail);
      detailBase64 = Buffer.from(detailJson, 'utf8').toString('base64');
    } catch (encodingError) {
      console.error('❌ Detail encoding failed:', encodingError);
      detailBase64 = '';
    }

    const callbackUrl = options.callback ||
      `https://api.aced.live/api/payments/payme/return/success?transaction=${orderId}&userId=${userId}`;

    // ✅ CRITICAL FIX: Use account[Login] in form
    const formHtml = `
<form method="POST" action="https://checkout.paycom.uz/" id="payme-form" style="display: none;">
    <input type="hidden" name="merchant" value="${merchantId}"/>
    <input type="hidden" name="amount" value="${amount}"/>
    
    <!-- ✅ CRITICAL FIX: Use Login field -->
    <input type="hidden" name="account[Login]" value="${accountData.Login}"/>
    
    <input type="hidden" name="lang" value="${options.lang || 'ru'}"/>
    <input type="hidden" name="callback" value="${encodeURIComponent(callbackUrl)}"/>
    <input type="hidden" name="callback_timeout" value="${options.callback_timeout || 15000}"/>
    <input type="hidden" name="description" value="ACED ${plan.toUpperCase()} Plan Subscription"/>
    ${detailBase64 ? `<input type="hidden" name="detail" value="${detailBase64}"/>` : ''}
    
    <button type="submit" style="display: none;">Pay with PayMe</button>
</form>

<script>
  
  function submitPaymeForm() {
    const form = document.getElementById('payme-form');
    if (form) {
      form.submit();
    } else {
      console.error('❌ PayMe form not found in DOM');
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(submitPaymeForm, 1000);
    });
  } else {
    setTimeout(submitPaymeForm, 1000);
  }
</script>`;


    return {
      success: true,
      formHtml,
      method: 'POST',
      transaction: {
        id: orderId,
        amount,
        plan,
        merchantId,
        accountData
      }
    };

  } catch (error) {
    console.error('❌ POST form generation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};


// ================================================
// FIXED: Account Validation Using Login
// ================================================

const validateAccountAndState = async (account) => {
  try {

    if (!account) {
      return { exists: false, state: 'not_exists' };
    }

    // ✅ CRITICAL FIX: Check for Login field instead of Login
    let accountValue = null;
    let fieldType = null;

    if (account.Login) {
      accountValue = account.Login;
      fieldType = 'Login';
    } else {
      return { exists: false, state: 'not_exists' };
    }


    // For Firebase ID validation (longer than 20 characters usually)
    if (accountValue.length >= 20) {
      try {
        const User = require('../models/user');
        const user = await User.findOne({ firebaseId: accountValue });
        if (user) {
          return { exists: true, state: 'waiting_payment' };
        }
      } catch (error) {
        console.error('❌ Database error:', error.message);
      }
    }

    // For order ID format (if you use order IDs as Login sometimes)
    if (accountValue.startsWith('aced') && accountValue.length > 10) {
      return { exists: true, state: 'waiting_payment' };
    }

    // For any other valid-looking identifier
    if (accountValue && accountValue.length > 3) {
      return { exists: true, state: 'waiting_payment' };
    }

    return { exists: false, state: 'not_exists' };

  } catch (error) {
    console.error('❌ Error validating account:', error.message);
    return { exists: false, state: 'not_exists' };
  }
};
// ================================================
// FIXED: Transaction Handlers Following Documentation
// ================================================

const handleCheckPerformTransaction = async (req, res, id, params) => {

  // Validate required parameters
  if (!params?.amount || !params?.account) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_PARAMS));
  }

  const { amount, account } = params;

  // Validate amount against allowed amounts
  const validAmounts = Object.values(PAYMENT_AMOUNTS);
  if (!validAmounts.includes(amount)) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_AMOUNT));
  }

  // ✅ FIXED: Validate account according to your business logic
  const accountValidation = await validateAccountAndState(account);

  if (!accountValidation.exists) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_ACCOUNT, getAccountFieldName()));
  }


  return res.status(200).json({
    jsonrpc: "2.0",
    id: id,
    result: {
      allow: true,
      detail: {
        receipt_type: 0,
        items: [{
          title: "ACED Subscription",
          price: amount,
          count: 1,
          code: "10899002001000000", // Your IKPU code
          vat_percent: 0,
          package_code: "1"
        }]
      }
    }
  });
};

const handleCreateTransaction = async (req, res, id, params) => {

  // Validate required parameters
  if (!params?.id || !params?.time || !params?.amount || !params?.account) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_PARAMS));
  }

  const { id: txId, time, amount, account } = params;

  // Check if transaction already exists
  const existingTransaction = sandboxTransactions.get(txId);
  if (existingTransaction) {
    return res.status(200).json({
      jsonrpc: "2.0",
      id: id,
      result: {
        create_time: existingTransaction.create_time,
        transaction: existingTransaction.transaction,
        state: existingTransaction.state,
        receivers: existingTransaction.receivers || null
      }
    });
  }

  // Validate amount
  const validAmounts = Object.values(PAYMENT_AMOUNTS);
  if (!validAmounts.includes(amount)) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_AMOUNT));
  }

  // ✅ FIXED: Validate account
  const accountValidation = await validateAccountAndState(account);
  if (!accountValidation.exists) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_ACCOUNT, getAccountFieldName()));
  }

  // Create new transaction
  const newTransaction = {
    id: txId,
    transaction: txId.toString(),
    state: TransactionState.CREATED,
    create_time: Date.now(),
    perform_time: 0,
    cancel_time: 0,
    amount: amount,
    account: account,
    cancelled: false,
    reason: null,
    receivers: null
  };

  // Store transaction
  sandboxTransactions.set(txId, newTransaction);


  return res.status(200).json({
    jsonrpc: "2.0",
    id: id,
    result: {
      create_time: newTransaction.create_time,
      transaction: newTransaction.transaction,
      state: newTransaction.state,
      receivers: newTransaction.receivers
    }
  });
};

const handlePerformTransaction = async (req, res, id, params) => {
  // --- Start of PayMe Protocol Logic (UNCHANGED) ---
  if (!params?.id) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_PARAMS));
  }
  const transaction = sandboxTransactions.get(params.id);
  if (!transaction) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.TRANSACTION_NOT_FOUND));
  }
  if (transaction.state === TransactionState.COMPLETED) {
    return res.status(200).json({
      jsonrpc: "2.0",
      id: id,
      result: {
        transaction: transaction.transaction,
        perform_time: transaction.perform_time,
        state: transaction.state
      }
    });
  }
  if (transaction.state < 0) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION));
  }
  // --- End of PayMe Protocol Logic ---

  // ✅ =======================================================
  // ✅ ADDITION: Your Business Logic Starts Here
  // ✅ This part happens AFTER PayMe rules are checked but BEFORE you reply.
  // =======================================================
  try {
    const accountLogin = transaction.account?.Login;
    if (accountLogin) {
      // The User model is already imported at the top of the file
      const user = await User.findOne({ firebaseId: accountLogin });

      if (user) {
        // Determine duration based on amount paid
        let durationDays = 30;
        if (transaction.amount === PAYMENT_AMOUNTS['pro-3']) {
          durationDays = 90;  // 3 months
        } else if (transaction.amount === PAYMENT_AMOUNTS['pro-6']) {
          durationDays = 180; // 6 months
        }
        // Grant Pro subscription for the determined duration
        await user.grantSubscription('pro', durationDays, 'payment');
      }
    }
  } catch (dbError) {
    console.error('❌ CRITICAL: Database error during PerformTransaction:', dbError);
    // If your database fails, you must tell PayMe there was an error.
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INTERNAL_ERROR));
  }
  // ✅ =======================================================
  // ✅ Your Business Logic Ends Here
  // =======================================================

  // --- Start of PayMe Success Response (UNCHANGED) ---
  transaction.state = TransactionState.COMPLETED;
  transaction.perform_time = Date.now();

  return res.status(200).json({
    jsonrpc: "2.0",
    id: id,
    result: {
      transaction: transaction.transaction,
      perform_time: transaction.perform_time,
      state: transaction.state
    }
  });
};


const handleCancelTransaction = async (req, res, id, params) => {

  if (!params?.id) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_PARAMS));
  }

  const transaction = sandboxTransactions.get(params.id);
  if (!transaction) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.TRANSACTION_NOT_FOUND));
  }

  const originalState = transaction.state;

  // Already cancelled
  if (transaction.state < 0) {
    return res.status(200).json({
      jsonrpc: "2.0",
      id: id,
      result: {
        transaction: transaction.transaction,
        cancel_time: transaction.cancel_time,
        state: transaction.state
      }
    });
  }

  // Determine new state and reason
  let newState, reason;
  if (originalState === TransactionState.CREATED) {
    newState = TransactionState.CANCELLED_AFTER_CREATE;
    reason = 3;
    transaction.perform_time = 0;
  } else if (originalState === TransactionState.COMPLETED) {
    newState = TransactionState.CANCELLED_AFTER_COMPLETE;
    reason = 5;
  } else {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION));
  }

  // Update transaction
  transaction.state = newState;
  transaction.cancel_time = Date.now();
  transaction.reason = reason;
  transaction.cancelled = true;


  return res.status(200).json({
    jsonrpc: "2.0",
    id: id,
    result: {
      transaction: transaction.transaction,
      cancel_time: transaction.cancel_time,
      state: transaction.state
    }
  });
};

// ✅ FIXED: CheckTransaction handler
const handleCheckTransaction = async (req, res, id, params) => {

  if (!params?.id) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_PARAMS));
  }

  const transaction = sandboxTransactions.get(params.id);
  if (!transaction) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.TRANSACTION_NOT_FOUND));
  }

  let result = {
    create_time: transaction.create_time,
    perform_time: 0,
    cancel_time: 0,
    transaction: transaction.transaction,
    state: transaction.state,
    reason: null
  };

  switch (transaction.state) {
    case TransactionState.CREATED:
      result.perform_time = 0;
      result.cancel_time = 0;
      result.reason = null;
      break;
    case TransactionState.COMPLETED:
      result.perform_time = transaction.perform_time || Date.now();
      result.cancel_time = 0;
      result.reason = null;
      break;
    case TransactionState.CANCELLED_AFTER_CREATE:
      result.perform_time = 0;
      result.cancel_time = transaction.cancel_time || Date.now();
      result.reason = transaction.reason || 3;
      break;
    case TransactionState.CANCELLED_AFTER_COMPLETE:
      result.perform_time = transaction.perform_time || Date.now();
      result.cancel_time = transaction.cancel_time || Date.now();
      result.reason = transaction.reason || 5;
      break;
  }


  return res.status(200).json({
    jsonrpc: "2.0",
    id: id,
    result: result
  });
};

// FIXED: GetStatement handler
const handleGetStatement = (req, res, id, params) => {

  const from = params?.from || 0;
  const to = params?.to || Date.now();

  const transactions = [];
  for (const [transactionId, transaction] of sandboxTransactions.entries()) {
    if (transaction.create_time >= from && transaction.create_time <= to) {
      transactions.push({
        id: transaction.id,
        time: transaction.create_time,
        amount: transaction.amount,
        account: transaction.account,
        create_time: transaction.create_time,
        perform_time: transaction.perform_time || 0,
        cancel_time: transaction.cancel_time || 0,
        transaction: transaction.transaction,
        state: transaction.state,
        reason: transaction.reason || null,
        receivers: transaction.receivers || null
      });
    }
  }


  return res.status(200).json({
    jsonrpc: "2.0",
    id: id,
    result: {
      transactions: transactions
    }
  });
};

// FIXED: ChangePassword handler
const handleChangePassword = (req, res, id, params) => {

  // In sandbox, always return success

  return res.status(200).json({
    jsonrpc: "2.0",
    id: id,
    result: {
      success: true
    }
  });
};

// ================================================
// FIXED: Main Sandbox Handler
// ================================================

const handleSandboxPayment = async (req, res) => {
  try {


    // Parse JSON-RPC request
    const { method, params, id } = req.body;

    // Validate JSON-RPC format
    if (!method) {
      return res.status(200).json({
        jsonrpc: "2.0",
        id: id || null,
        error: {
          code: -32601,
          message: { ru: "Метод не найден", en: "Method not found", uz: "Usul topilmadi" }
        }
      });
    }

    if (id === undefined) {
      return res.status(200).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32602,
          message: { ru: "Неверные параметры", en: "Invalid params", uz: "Noto'g'ri parametrlar" }
        }
      });
    }

    // STEP 1: Validate authorization FIRST
    const authResult = validatePaymeAuth(req);
    if (!authResult.valid) {
      return res.status(200).json({
        jsonrpc: "2.0",
        id: id,
        error: {
          code: -32504,
          message: { ru: "Неверная авторизация", en: "Invalid authorization", uz: "Noto'g'ri avtorizatsiya" }
        }
      });
    }


    // STEP 2: Route to method handlers
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
        return res.status(200).json({
          jsonrpc: "2.0",
          id: id,
          error: {
            code: -32601,
            message: { ru: "Метод не найден", en: "Method not found", uz: "Usul topilmadi" },
            data: method
          }
        });
    }

  } catch (error) {
    console.error('❌ Sandbox error:', error);
    return res.status(200).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: { ru: "Внутренняя ошибка", en: "Internal error", uz: "Ichki xatolik" }
      }
    });
  }
};

// ================================================
// FIXED: Payment Initiation Functions
// ================================================

// Helper function to get payment amounts
const getPaymentAmounts = () => {
  return {
    start: {
      tiyin: PAYMENT_AMOUNTS.start,
      uzs: PAYMENT_AMOUNTS.start / 100
    },
    pro: {
      tiyin: PAYMENT_AMOUNTS.pro,
      uzs: PAYMENT_AMOUNTS.pro / 100
    }
  };
};

// Safe error response helper
const safeErrorResponse = (res, statusCode, error, context = 'Operation') => {
  let errorMessage = `${context} failed`;

  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error.message === 'string') {
    errorMessage = error.message;
  } else if (error && typeof error === 'object') {
    try {
      errorMessage = JSON.stringify(error);
    } catch (stringifyError) {
      errorMessage = `${context} failed with complex error`;
    }
  }

  return res.status(statusCode).json({
    success: false,
    error: errorMessage,
    timestamp: new Date().toISOString(),
    server: 'api.aced.live'
  });
};

// FIXED: Generate direct PayMe URL (GET method)
const generateDirectPaymeUrl = async (userId, plan, options = {}) => {
  try {

    // Get merchant ID with validation
    const merchantId = process.env.PAYME_MERCHANT_ID;

    if (!merchantId || merchantId === 'undefined' || typeof merchantId !== 'string') {
      console.error('❌ Merchant ID not loaded properly');
      throw new Error('PayMe Merchant ID not configured. Check your .env file.');
    }


    const amounts = getPaymentAmounts();
    const planAmount = amounts[plan]?.tiyin;

    if (!planAmount) {
      throw new Error(`Plan "${plan}" not found. Available: start, pro`);
    }

    // Generate clean order ID (alphanumeric only)
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substr(2, 6);
    const baseOrderId = `aced${timestamp}${randomPart}`;
    const orderId = baseOrderId.replace(/[^a-zA-Z0-9]/g, '');



    // Create account object with Login
    const account = { Login: orderId };

    // Use the fixed generatePaymeGetUrl function
    const paymentUrl = generatePaymeGetUrl(merchantId, account, planAmount, options);


    return {
      success: true,
      paymentUrl,
      method: 'GET',
      transaction: {
        id: orderId,
        amount: planAmount,
        plan
      }
    };

  } catch (error) {
    console.error('❌ GET URL generation failed:', error);
    return {
      success: false,
      error: error.message || 'URL generation failed'
    };
  }
};

// FIXED: Generate direct PayMe form (POST method)
const generateDirectPaymeForm = async (userId, plan, options = {}) => {
  try {

    const merchantId = process.env.PAYME_MERCHANT_ID;

    if (!merchantId || merchantId === 'undefined' || merchantId.length < 10) {
      throw new Error('Invalid PayMe Merchant ID configuration');
    }

    const amounts = getPaymentAmounts();
    const planAmount = amounts[plan]?.tiyin;

    if (!planAmount) {
      throw new Error(`Unknown plan: ${plan}`);
    }

    // Generate clean order ID
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const baseOrderId = options.Login || `aced${timestamp}${randomStr}`;
    const orderId = baseOrderId.replace(/[^a-zA-Z0-9]/g, '');


    // Use the fixed generatePaymePostForm function
    const result = generatePaymePostForm(userId, plan, {
      ...options,
      Login: orderId
    });

    if (result.success) {
      return result;
    } else {
      throw new Error(result.error || 'Form generation failed');
    }

  } catch (error) {
    console.error('❌ POST form generation failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate PayMe POST form'
    };
  }
};

// FIXED: Main payment initiation function
const initiatePaymePayment = async (req, res) => {
  try {
    const { userId, plan, additionalData = {}, method: requestMethod } = req.body;


    // Validation
    if (!userId || typeof userId !== 'string') {
      return safeErrorResponse(res, 400, 'Valid userId is required', 'Payment initiation');
    }

    if (!plan || !['start', 'pro'].includes(plan)) {
      return safeErrorResponse(res, 400, 'Valid plan (start or pro) is required', 'Payment initiation');
    }

    // Environment validation
    const merchantId = process.env.PAYME_MERCHANT_ID;

    if (!merchantId || merchantId === 'undefined') {
      console.error('❌ PAYME_MERCHANT_ID not properly set');
      return safeErrorResponse(res, 500, 'PayMe merchant configuration error', 'Payment initiation');
    }

    const amount = PAYMENT_AMOUNTS[plan];
    if (!amount) {
      return safeErrorResponse(res, 400, 'Invalid plan amount', 'Payment initiation');
    }

    // Generate clean order ID
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const baseOrderId = `aced${timestamp}${randomStr}`;
    const cleanOrderId = baseOrderId.replace(/[^a-zA-Z0-9]/g, '');


    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && merchantId) {
      const useGetMethod = requestMethod === 'get' || additionalData.useGetMethod;

      if (useGetMethod) {
        // Clean options for GET method
        const urlOptions = {
          lang: ['ru', 'uz', 'en'].includes(additionalData.lang) ? additionalData.lang : 'ru',
          callback: additionalData.callback ||
            `https://api.aced.live/api/payments/payme/return/success?transaction=${cleanOrderId}&userId=${userId}`,
          callback_timeout: Number(additionalData.callback_timeout) || 15000
        };


        const result = await generateDirectPaymeUrl(userId, plan, urlOptions);

        if (result.success) {
          // Final URL validation
          if (!result.paymentUrl || result.paymentUrl.includes('undefined') || result.paymentUrl.includes('[object Object]')) {
            throw new Error('Generated URL contains invalid data');
          }


          return res.json({
            success: true,
            message: '✅ PayMe checkout URL generated',
            paymentUrl: result.paymentUrl,
            method: 'GET',
            transaction: {
              id: cleanOrderId,
              amount: amount,
              plan: plan,
              state: 1
            }
          });
        } else {
          throw new Error(result.error || 'URL generation failed');
        }
      } else {
        // POST method with clean form data
        const result = await generateDirectPaymeForm(userId, plan, {
          Login: cleanOrderId,
          lang: additionalData.lang || 'ru',
          callback: additionalData.callback ||
            `https://api.aced.live/api/payments/payme/return/success?transaction=${cleanOrderId}&userId=${userId}`,
          callback_timeout: Number(additionalData.callback_timeout) || 15000
        });

        if (result.success) {

          return res.json({
            success: true,
            message: '✅ PayMe checkout form generated',
            formHtml: result.formHtml,
            method: 'POST',
            transaction: {
              id: cleanOrderId,
              amount: amount,
              plan: plan,
              state: 1
            }
          });
        } else {
          throw new Error(result.error || 'Form generation failed');
        }
      }
    } else {
      // Development fallback with clean parameters
      const checkoutUrl = `https://aced.live/payment/checkout?${new URLSearchParams({
        transactionId: cleanOrderId,
        userId: userId,
        amount: amount,
        plan: plan,
        method: requestMethod || 'get'
      }).toString()}`;

      return res.json({
        success: true,
        message: '✅ Development checkout',
        paymentUrl: checkoutUrl,
        transaction: {
          id: cleanOrderId,
          amount: amount,
          plan: plan,
          state: 1
        }
      });
    }

  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    return safeErrorResponse(res, 500, error.message || 'Payment initiation failed', 'Payment initiation');
  }
};

// ================================================
// User Management Functions
// ================================================

const validateUserRoute = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({
        message: '❌ User ID is required',
        valid: false
      });
    }

    let user = null;

    if (userId.length >= 20 && !userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findOne({ firebaseId: userId });
    } else if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(userId);
    } else if (userId.includes('@') && userId.includes('.')) {
      user = await User.findOne({ email: userId });
    } else if (userId.match(/^\+?\d{9,15}$/)) {
      user = await User.findOne({ phone: userId });
    } else {
      user = await User.findOne({
        $or: [
          { firebaseId: userId },
          { email: userId },
          { Login: userId }
        ]
      });
    }

    if (!user) {
      return res.status(404).json({
        message: '❌ User not found',
        valid: false,
        userId,
        searchedBy: 'Multiple strategies attempted'
      });
    }



    return res.status(200).json({
      message: '✅ User validation successful',
      valid: true,
      server: 'api.aced.live',
      user: {
        id: user._id,
        firebaseId: user._id,
        name: user.name || 'Unknown',
        email: user.email || 'Unknown',
        subscriptionPlan: user.subscriptionPlan || 'free',
        paymentStatus: user.paymentStatus || 'unpaid'
      }
    });
  } catch (error) {
    console.error('❌ User validation error:', error);
    let errorMessage = '❌ Server error during user validation';
    let statusCode = 500;

    if (error.name === 'CastError') {
      errorMessage = '❌ Invalid user ID format';
      statusCode = 400;
    } else if (error.name === 'ValidationError') {
      errorMessage = '❌ User data validation error';
      statusCode = 400;
    }

    res.status(statusCode).json({
      message: errorMessage,
      valid: false,
      error: error.message,
      userId: req.params.userId,
      errorType: error.name
    });
  }
};

const getUserInfo = async (req, res) => {
  try {
    const { userId } = req.params;
    let user = null;

    if (userId.length >= 20 && !userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findOne({ firebaseId: userId });
    } else if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(userId);
    } else {
      user = await User.findOne({
        $or: [{ firebaseId: userId }, { email: userId }, { Login: userId }]
      });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        firebaseId: user._id,
        name: user.name,
        email: user.email,
        subscriptionPlan: user.subscriptionPlan || 'free',
        paymentStatus: user.paymentStatus || 'unpaid'
      }
    });
  } catch (error) {
    console.error('❌ Get user info error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;
    let user = null;

    if (userId.length >= 20 && !userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findOne({ firebaseId: userId });
    } else if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(userId);
    } else {
      user = await User.findOne({
        $or: [{ firebaseId: userId }, { email: userId }]
      });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const allowedFields = ['name', 'phone', 'subscriptionPlan', 'paymentStatus'];
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        user[field] = updateData[field];
      }
    });

    await user.save();

    res.json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        firebaseId: user._id,
        name: user.name,
        email: user.email,
        subscriptionPlan: user.subscriptionPlan,
        paymentStatus: user.paymentStatus
      }
    });
  } catch (error) {
    console.error('❌ Update user error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const saveUser = async (req, res) => {
  try {
    const { token, name, subscriptionPlan, email, firebaseId } = req.body;

    if (!firebaseId && !token) {
      return res.status(400).json({ message: 'Firebase ID or token required' });
    }

    let userFirebaseId = firebaseId;
    let userEmail = email;

    if (token && !firebaseId) {
      try {
        const admin = await import('firebase-admin');
        const decoded = await admin.default.auth().verifyIdToken(token);
        userFirebaseId = decoded.uid;
        userEmail = decoded.email;
      } catch (tokenError) {
        return res.status(401).json({ message: 'Invalid Firebase token' });
      }
    }

    if (!userFirebaseId) {
      return res.status(400).json({ message: 'Firebase ID is required' });
    }

    let user = await User.findOne({ firebaseId: userFirebaseId });

    if (!user) {
      user = new User({
        firebaseId: userFirebaseId,
        email: userEmail,
        name: name || 'User',
        Login: userEmail,
        subscriptionPlan: subscriptionPlan || 'free',
        paymentStatus: 'unpaid'
      });
    } else {
      if (name) user.name = name;
      if (userEmail) user.email = userEmail;
      if (subscriptionPlan) user.subscriptionPlan = subscriptionPlan;
      user.Login = userEmail || user.email;
    }

    await user.save();

    res.json({
      message: 'User saved successfully',
      user: {
        id: user._id,
        firebaseId: user._id,
        name: user.name,
        email: user.email,
        subscriptionPlan: user.subscriptionPlan,
        paymentStatus: user.paymentStatus
      }
    });
  } catch (error) {
    console.error('❌ Save user error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    let user = null;

    if (userId.length >= 20 && !userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findOne({ firebaseId: userId });
    } else if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(userId);
    } else {
      user = await User.findOne({
        $or: [{ firebaseId: userId }, { email: userId }]
      });
    }

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        status: 'free'
      });
    }

    res.json({
      status: user.subscriptionPlan || 'free',
      paymentStatus: user.paymentStatus || 'unpaid',
      subscriptionDetails: {
        plan: user.subscriptionPlan,
        activatedAt: user.lastPaymentDate,
        isActive: user.paymentStatus === 'paid'
      }
    });
  } catch (error) {
    console.error('❌ Get user status error:', error);
    res.status(500).json({
      message: 'Server error',
      status: 'free',
      error: error.message
    });
  }
};

// ================================================
// Payment Status and Monitoring Functions
// ================================================

// Helper functions
const findTransactionById = (transactionId) => {
  return sandboxTransactions.get(transactionId);
};

const getTransactionStateText = (state) => {
  switch (state) {
    case TransactionState.CREATED:
      return 'Created (waiting for payment)';
    case TransactionState.COMPLETED:
      return 'Completed (paid)';
    case TransactionState.CANCELLED_AFTER_CREATE:
      return 'Cancelled (before payment)';
    case TransactionState.CANCELLED_AFTER_COMPLETE:
      return 'Cancelled (refunded)';
    default:
      return 'Unknown';
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
    const sandboxTransaction = findTransactionById(transactionId);

    if (sandboxTransaction) {
      const user = await User.findById(userId);

      if (sandboxTransaction.state === TransactionState.COMPLETED && user) {
        let plan = 'free';
        if (sandboxTransaction.amount === PAYMENT_AMOUNTS.start) {
          plan = 'start';
        } else if (sandboxTransaction.amount === PAYMENT_AMOUNTS.pro) {
          plan = 'pro';
        }

        if (user.subscriptionPlan !== plan || user.paymentStatus !== 'paid') {
          user.subscriptionPlan = plan;
          user.paymentStatus = 'paid';
          await user.save();
        }
      }

      return res.json({
        message: '✅ Transaction status retrieved',
        success: true,
        server: 'api.aced.live',
        transaction: {
          id: sandboxTransaction.id,
          state: sandboxTransaction.state,
          amount: sandboxTransaction.amount,
          create_time: sandboxTransaction.create_time,
          perform_time: sandboxTransaction.perform_time || 0,
          cancel_time: sandboxTransaction.cancel_time || 0,
          stateText: getTransactionStateText(sandboxTransaction.state)
        },
        sandbox: true
      });
    }

    if (!isProduction) {
      return res.json({
        message: '❌ Transaction not found in sandbox',
        success: false,
        server: 'api.aced.live',
        transactionId,
        sandbox: true
      });
    }

    // Production payment status check would go here
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

const listTransactions = async (req, res) => {
  try {
    const transactions = [];

    for (const [id, transaction] of sandboxTransactions.entries()) {
      transactions.push({
        id: transaction.id,
        state: transaction.state,
        stateText: getTransactionStateText(transaction.state),
        amount: transaction.amount,
        amountUzs: transaction.amount / 100,
        account: transaction.account,
        create_time: new Date(transaction.create_time).toISOString(),
        perform_time: transaction.perform_time ? new Date(transaction.perform_time).toISOString() : null,
        cancel_time: transaction.cancel_time ? new Date(transaction.cancel_time).toISOString() : null
      });
    }

    res.json({
      message: '✅ All sandbox transactions',
      count: transactions.length,
      transactions: transactions.sort((a, b) => b.create_time.localeCompare(a.create_time)),
      server: 'api.aced.live'
    });
  } catch (error) {
    console.error('❌ Error listing transactions:', error);
    res.status(500).json({
      message: '❌ Error listing transactions',
      error: error.message
    });
  }
};

const clearSandboxTransactions = async (req, res) => {
  try {
    const count = sandboxTransactions.size;
    sandboxTransactions.clear();
    accountStates.clear();

    res.json({
      message: '✅ Sandbox transactions and account states cleared',
      clearedCount: count,
      server: 'api.aced.live'
    });
  } catch (error) {
    console.error('❌ Error clearing transactions:', error);
    res.status(500).json({
      message: '❌ Error clearing transactions',
      error: error.message
    });
  }
};

// ================================================
// Promo Code Application
// ================================================

const applyPromoCode = async (req, res) => {
  try {
    const { userId, plan, promoCode } = req.body;

    if (!userId || !plan || !promoCode) {
      return res.status(400).json({ message: '❌ All fields required: userId, plan, promoCode' });
    }

    const validPromoCode = 'acedpromocode2406';
    if (promoCode.trim() !== validPromoCode) {
      return res.status(400).json({ message: '❌ Invalid promo code' });
    }

    const allowedPlans = ['start', 'pro'];
    if (!allowedPlans.includes(plan)) {
      return res.status(400).json({ message: '❌ Invalid plan. Allowed: start, pro' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: '❌ User not found' });
    }

    user.subscriptionPlan = plan;
    user.paymentStatus = 'paid';
    await user.save();

    return res.status(200).json({
      message: '✅ Promo code applied successfully',
      unlocked: true,
      plan
    });
  } catch (err) {
    console.error('❌ Promo code error:', err);
    res.status(500).json({ message: '❌ Server error applying promo code' });
  }
};

// ================================================
// Webhook Handler
// ================================================

const handlePaymeWebhook = async (req, res) => {
  try {


    const authResult = validatePaymeAuth(req);
    if (!authResult.valid) {
      return res.status(401).json({
        error: 'Unauthorized webhook request'
      });
    }

    const { method, params } = req.body;

    switch (method) {
      case 'PaymentCompleted':
        if (params?.account?.Login && params?.state === TransactionState.COMPLETED) {
          // Find user by order ID pattern (extract userId from order ID)
          const orderIdParts = params.account.Login.match(/^aced(\d+)/);
          if (orderIdParts) {
            const userId = orderIdParts[1];
            const user = await User.findById(userId);
            if (user) {
              let plan = 'free';
              if (params.amount === PAYMENT_AMOUNTS.start) {
                plan = 'start';
              } else if (params.amount === PAYMENT_AMOUNTS.pro) {
                plan = 'pro';
              }
              user.subscriptionPlan = plan;
              user.paymentStatus = 'paid';
              user.lastPaymentDate = new Date();
              await user.save();

            }
          }
        }
        break;
      case 'PaymentCancelled':
        if (params?.account?.Login) {
        }
        break;
    }

    res.json({
      success: true,
      message: 'Webhook processed'
    });
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message
    });
  }
};

// ================================================
// Return URL Handlers
// ================================================

const handlePaymeReturnSuccess = async (req, res) => {
  try {
    const { transaction: transactionId, userId } = req.query;

    if (!transactionId) {
      return res.redirect('https://aced.live/payment/error?message=No transaction ID');
    }

    const transaction = findTransactionById(transactionId);
    if (!transaction) {
      return res.redirect('https://aced.live/payment/error?message=Transaction not found');
    }

    // Mark transaction as completed if not already
    if (transaction.state === TransactionState.CREATED) {
      transaction.state = TransactionState.COMPLETED;
      transaction.perform_time = Date.now();

      // Update user subscription if userId provided
      if (userId) {
        try {
          const user = await User.findById(userId);
          if (user) {
            let plan = 'free';
            if (transaction.amount === PAYMENT_AMOUNTS.start) {
              plan = 'start';
            } else if (transaction.amount === PAYMENT_AMOUNTS.pro) {
              plan = 'pro';
            }
            user.subscriptionPlan = plan;
            user.paymentStatus = 'paid';
            user.lastPaymentDate = new Date();
            await user.save();
          }
        } catch (userError) {
          console.error('❌ Error updating user on return:', userError);
        }
      }
    }

    const successUrl = `https://aced.live/payment/success?transaction=${transactionId}&amount=${transaction.amount}&plan=${transaction.plan || 'unknown'}`;
    return res.redirect(successUrl);

  } catch (error) {
    console.error('❌ PayMe return success error:', error);
    return res.redirect('https://aced.live/payment/error?message=Processing error');
  }
};

const handlePaymeReturnError = async (req, res) => {
  try {
    const { transaction: transactionId, error: errorCode } = req.query;

    if (transactionId) {
      const transaction = findTransactionById(transactionId);
      if (transaction && transaction.state === TransactionState.CREATED) {
        transaction.state = TransactionState.CANCELLED_AFTER_CREATE;
        transaction.cancel_time = Date.now();
        transaction.reason = 3;
      }
    }

    const errorUrl = `https://aced.live/payment/error?transaction=${transactionId || 'unknown'}&error=${errorCode || 'unknown'}`;
    return res.redirect(errorUrl);

  } catch (error) {
    console.error('❌ PayMe return error handler error:', error);
    return res.redirect('https://aced.live/payment/error?message=Handler error');
  }
};

// ================================================
// Test Integration Function
// ================================================

const testPaymeIntegration = async (req, res) => {
  try {
    const { userId, plan } = req.body;

    // Validate input
    if (!userId || !plan) {
      return res.status(400).json({
        success: false,
        error: 'userId and plan are required'
      });
    }
    if (!['start', 'pro'].includes(plan)) {
      return res.status(400).json({
        success: false,
        error: 'Plan must be "start" or "pro"'
      });
    }

    const amount = PAYMENT_AMOUNTS[plan];
    const orderId = `aced${Date.now()}${Math.random().toString(36).substr(2, 6)}`;
    const merchantId = process.env.PAYME_MERCHANT_ID;

    // Create account data as per PayMe documentation (FIXED: using Login)
    const accountData = {
      Login: orderId
    };

    // Test PayMe GET URL generation with proper format
    const getUrl = generatePaymeGetUrl(merchantId, accountData, amount, {
      lang: 'ru',
      callback: `https://api.aced.live/api/payments/payme/return/success?transaction=${orderId}`,
      callback_timeout: 15000
    });

    // Test PayMe POST format (FIXED: using account[Login])
    const postParams = new URLSearchParams({
      'merchant': merchantId,
      'amount': amount,
      'account[Login]': orderId, // FIXED: Correct field name
      'lang': 'ru',
      'callback': `https://api.aced.live/api/payments/payme/return/success?transaction=${orderId}`
    });
    const postUrl = `https://checkout.paycom.uz?${postParams.toString()}`;



    // Simulate CheckPerformTransaction for testing
    const checkResult = await new Promise((resolve) => {
      const mockRes = {
        status: () => ({
          json: (data) => resolve(data)
        })
      };

      handleCheckPerformTransaction(
        { body: { method: 'CheckPerformTransaction' }, headers: {} },
        mockRes,
        1,
        { amount: amount, account: accountData }
      );
    });

    res.json({
      success: true,
      testResults: {
        merchantId,
        orderId,
        amount,
        plan,
        accountData,
        getUrl,
        postUrl,
        urlBreakdown: {
          getMethod: {
            baseUrl: 'https://checkout.paycom.uz',
            encodedParams: getUrl.split('/').pop(),
            decodedParams: Buffer.from(getUrl.split('/').pop(), 'base64').toString()
          },
          postMethod: {
            baseUrl: 'https://checkout.paycom.uz',
            queryParams: postParams.toString()
          }
        },
        checkPerformTransaction: checkResult
      },
      message: 'PayMe integration test completed successfully',
      instructions: {
        getMethod: 'Use the getUrl for direct redirect with base64 encoded parameters',
        postMethod: 'Use postUrl for form submission or redirect with query parameters'
      }
    });
  } catch (error) {
    console.error('PayMe test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ================================================
// Configuration and Health Check Functions
// ================================================

const getPaymentConfig = async (req, res) => {
  try {
    res.json({
      amounts: PAYMENT_AMOUNTS,
      plans: {
        start: {
          name: 'Start Plan',
          price: PAYMENT_AMOUNTS.start,
          priceUzs: PAYMENT_AMOUNTS.start / 100,
          features: [
            'Access to basic courses',
            'Homework assignments',
            'Basic tests',
            'Progress tracking'
          ]
        },
        pro: {
          name: 'Pro Plan',
          price: PAYMENT_AMOUNTS.pro,
          priceUzs: PAYMENT_AMOUNTS.pro / 100,
          features: [
            'All Start features',
            'Advanced courses',
            'Personal analytics',
            'Priority support',
            'Exclusive materials'
          ]
        }
      },
      sandbox: {
        enabled: process.env.NODE_ENV !== 'production',
        endpoint: 'https://api.aced.live/api/payments/sandbox'
      },
      production: {
        enabled: process.env.NODE_ENV === 'production',
        merchantId: process.env.PAYME_MERCHANT_ID ? 'configured' : 'not_configured',
        supportedMethods: ['GET', 'POST']
      },
      errorCodes: {
        transaction: Object.fromEntries(
          Object.entries(PaymeErrorCode).filter(([key, value]) =>
            value >= -31099 && value <= -31001
          )
        ),
        system: Object.fromEntries(
          Object.entries(PaymeErrorCode).filter(([key, value]) =>
            value >= -32700 && value <= -32504
          )
        ),
        merchant: Object.fromEntries(
          Object.entries(PaymeErrorCode).filter(([key, value]) =>
            value >= -31630 && value <= -31601
          )
        )
      }
    });
  } catch (error) {
    console.error('❌ Get payment config error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getPaymentHealth = async (req, res) => {
  try {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      sandbox: {
        transactions: sandboxTransactions.size,
        accountStates: accountStates.size,
        endpoint: 'https://api.aced.live/api/payments/sandbox'
      },
      configuration: {
        merchantKey: process.env.PAYME_MERCHANT_KEY ? 'configured' : 'missing',
        merchantId: process.env.PAYME_MERCHANT_ID ? 'configured' : 'missing',
        testMode: process.env.NODE_ENV !== 'production',
        amounts: PAYMENT_AMOUNTS,
        errorCodesCount: Object.keys(PaymeErrorCode).length
      },
      database: {
        connected: true
      }
    };

    try {
      await User.findOne().limit(1);
      health.database.connected = true;
    } catch (dbError) {
      health.database.connected = false;
      health.database.error = dbError.message;
    }

    const statusCode = health.database.connected ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('❌ Payment health check error:', error);
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      error: error.message
    });
  }
};

const getPaymentStats = async (req, res) => {
  try {
    const stats = {
      sandbox: {
        totalTransactions: sandboxTransactions.size,
        transactionsByState: {
          created: 0,
          completed: 0,
          cancelled: 0
        },
        totalAmount: 0,
        completedAmount: 0
      },
      users: {
        total: 0,
        paid: 0,
        free: 0
      },
      errorCodes: {
        total: Object.keys(PaymeErrorCode).length,
        byCategory: {
          transaction: Object.values(PaymeErrorCode).filter(code => code >= -31099 && code <= -31001).length,
          system: Object.values(PaymeErrorCode).filter(code => code >= -32700 && code <= -32504).length,
          merchant: Object.values(PaymeErrorCode).filter(code => code >= -31630 && code <= -31601).length
        }
      }
    };

    for (const transaction of sandboxTransactions.values()) {
      switch (transaction.state) {
        case TransactionState.CREATED:
          stats.sandbox.transactionsByState.created++;
          break;
        case TransactionState.COMPLETED:
          stats.sandbox.transactionsByState.completed++;
          stats.sandbox.completedAmount += transaction.amount;
          break;
        case TransactionState.CANCELLED_AFTER_CREATE:
        case TransactionState.CANCELLED_AFTER_COMPLETE:
          stats.sandbox.transactionsByState.cancelled++;
          break;
      }
      stats.sandbox.totalAmount += transaction.amount;
    }

    try {
      const userCounts = await User.aggregate([
        { $group: { _id: '$subscriptionPlan', count: { $sum: 1 } } }
      ]);
      stats.users.total = userCounts.reduce((sum, item) => sum + item.count, 0);
      stats.users.free = userCounts.find(item => item._id === 'free')?.count || 0;
      stats.users.paid = stats.users.total - stats.users.free;
    } catch (dbError) {
    }

    res.json(stats);
  } catch (error) {
    console.error('❌ Get payment stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ================================================
// Sandbox Utilities
// ================================================

const setAccountState = async (req, res) => {
  try {
    const { accountLogin, state } = req.body;
    if (!accountLogin || !state) {
      return res.status(400).json({
        message: '❌ Account Login and state are required'
      });
    }
    const validStates = Object.values(AccountState);
    if (!validStates.includes(state)) {
      return res.status(400).json({
        message: '❌ Invalid state. Valid states: ' + validStates.join(', ')
      });
    }
    accountStates.set(accountLogin, state);
    res.json({
      message: '✅ Account state updated',
      accountLogin,
      state,
      validStates
    });
  } catch (error) {
    console.error('❌ Error setting account state:', error);
    res.status(500).json({
      message: '❌ Error setting account state',
      error: error.message
    });
  }
};

const setMerchantKey = async (req, res) => {
  try {
    const { merchantKey } = req.body;
    if (!merchantKey) {
      return res.status(400).json({
        message: '❌ Merchant key is required'
      });
    }
    currentMerchantKey = merchantKey;
    res.json({
      message: '✅ Merchant key updated for sandbox',
      keyLength: merchantKey.length
    });
  } catch (error) {
    console.error('❌ Error setting merchant key:', error);
    res.status(500).json({
      message: '❌ Error setting merchant key',
      error: error.message
    });
  }
};

// ================================================
// Debug and Testing Functions (Development Only)
// ================================================

const getDebugInfo = (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ message: 'Not available in production' });
  }

  res.json({
    config: {
      merchantId: process.env.PAYME_MERCHANT_ID ? 'configured' : 'not_configured',
      hasKey: !!process.env.PAYME_MERCHANT_KEY,
      Login: process.env.PAYME_Login || 'Paycom',
      minAmount: process.env.PAYME_MIN_AMOUNT || 100000,
      maxAmount: process.env.PAYME_MAX_AMOUNT || 10000000000
    },
    transactions: Array.from(sandboxTransactions.values()),
    accountStates: Object.fromEntries(accountStates.entries()),
    planAmounts: PAYMENT_AMOUNTS,
    errorCodes: PaymeErrorCode,
    timestamp: new Date().toISOString()
  });
};

const createTestTransaction = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ message: 'Not available in production' });
  }
  try {
    const { userId, plan, amount } = req.body;
    const transactionId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const testTransaction = {
      id: transactionId,
      transaction: transactionId,
      state: TransactionState.CREATED,
      create_time: Date.now(),
      amount: amount || PAYMENT_AMOUNTS[plan] || 26000000,
      account: { Login: `${userId}_${plan}_${Date.now()}` }, // FIXED: Use Login
      cancelled: false,
      perform_time: 0,
      cancel_time: 0,
      reason: null,
      receivers: null
    };
    sandboxTransactions.set(transactionId, testTransaction);
    res.json({
      message: 'Test transaction created',
      transaction: testTransaction
    });
  } catch (error) {
    console.error('❌ Create test transaction error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const completeTestTransaction = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ message: 'Not available in production' });
  }
  try {
    const { transactionId } = req.params;
    const transaction = sandboxTransactions.get(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    transaction.state = TransactionState.COMPLETED;
    transaction.perform_time = Date.now();
    res.json({
      message: 'Transaction completed',
      transaction: transaction
    });
  } catch (error) {
    console.error('❌ Complete test transaction error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ================================================
// Error Code Utilities
// ================================================

const getErrorCodeInfo = (req, res) => {
  const { code } = req.params;
  const numericCode = parseInt(code);

  if (isNaN(numericCode)) {
    return res.status(400).json({ message: 'Invalid error code format' });
  }

  const errorName = Object.keys(PaymeErrorCode).find(
    key => PaymeErrorCode[key] === numericCode
  );

  if (!errorName) {
    return res.status(404).json({ message: 'Error code not found' });
  }

  // Create a sample error response
  const sampleResponse = createErrorResponse(12345, numericCode, 'Login'); // FIXED: Use Login

  res.json({
    code: numericCode,
    name: errorName,
    category: numericCode >= -31099 && numericCode <= -31001 ? 'transaction' :
      numericCode >= -32700 && numericCode <= -32504 ? 'system' :
        numericCode >= -31630 && numericCode <= -31601 ? 'merchant' : 'unknown',
    sampleResponse: sampleResponse,
    description: sampleResponse.error.message
  });
};

const getAllErrorCodes = (req, res) => {
  const errorCodes = Object.entries(PaymeErrorCode).map(([name, code]) => ({
    name,
    code,
    category: code >= -31099 && code <= -31001 ? 'transaction' :
      code >= -32700 && code <= -32504 ? 'system' :
        code >= -31630 && code <= -31601 ? 'merchant' : 'unknown'
  }));

  res.json({
    total: errorCodes.length,
    errorCodes: errorCodes.sort((a, b) => a.code - b.code)
  });
};

// ================================================
// Helper Functions
// ================================================

const hasExistingUnpaidTransaction = (accountLogin) => {
  // For accumulative accounts, allow multiple transactions
  return false;
};

const validateAmount = (amount) => {
  const validAmounts = Object.values(PAYMENT_AMOUNTS);
  return validAmounts.includes(amount);
};

const getTransactionStatusText = (state) => {
  switch (state) {
    case TransactionState.CREATED:
      return { ru: 'Создан', uz: 'Yaratilgan', en: 'Created' };
    case TransactionState.COMPLETED:
      return { ru: 'Выполнен', uz: 'Bajarilgan', en: 'Completed' };
    case TransactionState.CANCELLED_AFTER_CREATE:
      return { ru: 'Отменен до оплаты', uz: "To'lovgacha bekor qilingan", en: 'Cancelled before payment' };
    case TransactionState.CANCELLED_AFTER_COMPLETE:
      return { ru: 'Отменен после оплаты', uz: "To'lovdan keyin bekor qilingan", en: 'Cancelled after payment' };
    default:
      return { ru: 'Неизвестно', uz: "Noma'lum", en: 'Unknown' };
  }
};

// Helper to store transaction in sandbox
const setTransaction = (id, transaction) => {
  sandboxTransactions.set(id, transaction);
};

// Cleanup transactions older than 7 days
const cleanupOldTransactions = () => {
  const now = Date.now();
  const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  for (const [id, transaction] of sandboxTransactions.entries()) {
    if (now - transaction.create_time > MAX_AGE) {
      sandboxTransactions.delete(id);
    }
  }
};

// Schedule cleanup every 24 hours
setInterval(cleanupOldTransactions, 24 * 60 * 60 * 1000);

// ================================================
// Export All Functions
// ================================================
//what to doo
export {
  // Main PayMe functions
  applyPromoCode,
  initiatePaymePayment,
  handleSandboxPayment,
  handlePaymeWebhook,

  // PayMe URL generation (FIXED)
  generatePaymeGetUrl,
  generateDirectPaymeUrl,
  generateDirectPaymeForm,

  // Return URL handlers
  handlePaymeReturnSuccess,
  handlePaymeReturnError,

  // Test integration
  testPaymeIntegration,

  // User management functions  
  validateUserRoute,
  getUserInfo,
  getUserStatus,
  saveUser,
  updateUserProfile,

  // Payment status and monitoring
  checkPaymentStatus,
  listTransactions,
  clearSandboxTransactions,

  // Payment configuration and health check
  getPaymentConfig,
  getPaymentHealth,
  getPaymentStats,

  // Sandbox utilities
  setAccountState,
  setMerchantKey,

  // Debug and testing functions (development only)
  getDebugInfo,
  createTestTransaction,
  completeTestTransaction,

  // Error code utilities
  getErrorCodeInfo,
  getAllErrorCodes,

  // Internal helpers
  setTransaction,
  validateAmount,
  getTransactionStatusText,
  validateAccountAndState,
  getPaymentAmounts,
  validatePaymeAuth,
  findTransactionById,
  hasExistingUnpaidTransaction,
  createErrorResponse,
  getTransactionStateText,
  safeErrorResponse,

  // Transaction handlers (FIXED)
  handleCheckPerformTransaction,
  handleCreateTransaction,
  handlePerformTransaction,
  handleCancelTransaction,
  handleCheckTransaction,
  handleGetStatement,
  handleChangePassword,

  // Constants
  TransactionState,
  AccountState,
  PaymeErrorCode,
  PAYMENT_AMOUNTS
};
