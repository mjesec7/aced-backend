// controllers/paymentController.js - COMPLETE PAYMENT SYSTEM WITH ACCOUNTS

const User = require('../models/user');
const Account = require('../models/account');
const axios = require('axios');

// Payment amounts in tiyin (1 UZS = 100 tiyin)
const PAYMENT_AMOUNTS = {
  start: 260000, // 2600 UZS
  pro: 455000    // 4550 UZS
};

// Store transactions in memory (for quick access, also stored in DB)
const transactionCache = new Map();

// Store the current merchant key for sandbox testing
let currentMerchantKey = null;

// Transaction states according to Payme spec
const TransactionState = {
  CREATED: 1,      // Transaction created
  COMPLETED: 2,    // Transaction completed (money transferred)
  CANCELLED_AFTER_CREATE: -1,  // Cancelled before completion
  CANCELLED_AFTER_COMPLETE: -2 // Cancelled after completion (refund)
};

// Account states for testing
const AccountState = {
  WAITING_PAYMENT: 'waiting_payment',
  PROCESSING: 'processing',
  BLOCKED: 'blocked',
  NOT_EXISTS: 'not_exists'
};

// Error codes according to Payme specification
const PaymeErrorCode = {
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  UNABLE_TO_PERFORM_OPERATION: -31008,
  ORDER_COMPLETED: -31007,
  INVALID_ACCOUNT: -31050,
  ACCOUNT_NOT_FOUND: -31050,
  ACCOUNT_BLOCKED: -31051,
  ACCOUNT_PROCESSING: -31052,
  ACCOUNT_INVALID: -31099,
  INVALID_JSON_RPC: -32700,
  PARSE_ERROR: -32700,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  INVALID_AUTHORIZATION: -32504
};

// ✅ Initialize account for existing users on startup
const initializeAccounts = async () => {
  try {
    const users = await User.find({});
    
    for (const user of users) {
      // Check if user already has an account
      const existingAccount = await Account.findOne({ userId: user._id });
      
      if (!existingAccount) {
        // Create account for user
        await Account.createAccountForUser(user._id, {
          email: user.email,
          phone: user.phone,
          name: user.name
        });
        
        console.log(`✅ Created account for user: ${user.email || user._id}`);
      }
    }
    
    console.log('✅ Account initialization complete');
  } catch (error) {
    console.error('❌ Error initializing accounts:', error);
  }
};

// Call this when server starts
initializeAccounts();

// ✅ Enhanced account validation with real Account model
const validateAccountAndState = async (accountIdentifier) => {
  try {
    console.log('🔍 Validating account:', accountIdentifier);
    
    // Find account by various identifiers
    const account = await Account.findByIdentifier(accountIdentifier);
    
    if (!account) {
      console.log('❌ Account not found');
      return {
        exists: false,
        state: AccountState.NOT_EXISTS,
        account: null
      };
    }
    
    console.log('✅ Account found:', {
      accountNumber: account.accountNumber,
      status: account.status,
      balance: account.balance
    });
    
    // Map account status to PayMe states
    switch (account.status) {
      case 'active':
        return {
          exists: true,
          state: AccountState.WAITING_PAYMENT,
          account: account
        };
        
      case 'blocked':
        return {
          exists: true,
          state: AccountState.BLOCKED,
          account: account
        };
        
      case 'processing':
        return {
          exists: true,
          state: AccountState.PROCESSING,
          account: account
        };
        
      case 'suspended':
        return {
          exists: true,
          state: AccountState.BLOCKED,
          account: account
        };
        
      default:
        return {
          exists: true,
          state: AccountState.WAITING_PAYMENT,
          account: account
        };
    }
    
  } catch (error) {
    console.error('❌ Error validating account:', error.message);
    return {
      exists: false,
      state: AccountState.NOT_EXISTS,
      account: null
    };
  }
};

// ✅ PayMe Authorization Validation
const validatePaymeAuth = (req) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return { valid: false, error: 'INVALID_AUTH' };
  }
  
  try {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    
    if (username !== 'Paycom') {
      return { valid: false, error: 'INVALID_USERNAME' };
    }
    
    const expectedPassword = currentMerchantKey || process.env.PAYME_MERCHANT_KEY || process.env.PAYME_TEST_KEY;
    
    if (!expectedPassword) {
      // Sandbox mode - accept any reasonable password
      if (!password || password.length < 10) {
        return { valid: false, error: 'INVALID_PASSWORD' };
      }
      return { valid: true };
    }
    
    if (password !== expectedPassword) {
      return { valid: false, error: 'INVALID_PASSWORD' };
    }
    
    return { valid: true };
    
  } catch (error) {
    return { valid: false, error: 'DECODE_ERROR' };
  }
};

// ✅ Create proper error response
const createErrorResponse = (id, code, messageKey, data = null) => {
  const messages = {
    ru: '',
    en: '',
    uz: ''
  };

  switch (code) {
    case PaymeErrorCode.INVALID_AMOUNT:
      messages.ru = 'Неверная сумма';
      messages.en = 'Invalid amount';
      messages.uz = "Noto'g'ri summa";
      break;
    case PaymeErrorCode.TRANSACTION_NOT_FOUND:
      messages.ru = 'Транзакция не найдена';
      messages.en = 'Transaction not found';
      messages.uz = 'Tranzaksiya topilmadi';
      break;
    case PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION:
      messages.ru = 'Невозможно выполнить операцию';
      messages.en = 'Unable to perform operation';
      messages.uz = "Amalni bajarib bo'lmadi";
      break;
    case PaymeErrorCode.ORDER_COMPLETED:
      messages.ru = 'Заказ выполнен. Невозможно отменить транзакцию';
      messages.en = 'Order completed. Unable to cancel transaction';
      messages.uz = 'Buyurtma bajarildi. Tranzaksiyani bekor qilib bo\'lmaydi';
      break;
    case PaymeErrorCode.METHOD_NOT_FOUND:
      messages.ru = `Метод ${messageKey} не найден`;
      messages.en = `Method ${messageKey} not found`;
      messages.uz = `${messageKey} usuli topilmadi`;
      break;
    case PaymeErrorCode.INVALID_AUTHORIZATION:
      messages.ru = 'Недостаточно привилегий для выполнения метода';
      messages.en = 'Insufficient privileges to perform this method';
      messages.uz = "Ushbu amalni bajarish uchun yetarli huquq yo'q";
      break;
    default:
      if (code >= -31099 && code <= -31050) {
        if (code === -31050) {
          messages.ru = 'Аккаунт не найден';
          messages.en = 'Account not found';
          messages.uz = 'Hisob topilmadi';
        } else if (code === -31051) {
          messages.ru = 'Невозможно выполнить операцию';
          messages.en = 'Unable to perform operation';
          messages.uz = "Amalni bajarib bo'lmadi";
        } else if (code === -31052) {
          messages.ru = 'Невозможно выполнить операцию';
          messages.en = 'Unable to perform operation';
          messages.uz = "Amalni bajarib bo'lmadi";
        } else {
          messages.ru = 'Невозможно выполнить операцию';
          messages.en = 'Unable to perform operation';
          messages.uz = "Amalni bajarib bo'lmadi";
        }
      } else {
        messages.ru = 'Неизвестная ошибка';
        messages.en = 'Unknown error';
        messages.uz = "Noma'lum xato";
      }
  }

  const errorResponse = {
    jsonrpc: '2.0',
    id: id || null,
    error: {
      code: code,
      message: messages
    }
  };

  if (code >= -31099 && code <= -31050 && data !== false) {
    errorResponse.error.data = data || 'login';
  } else if (data !== null && data !== false) {
    errorResponse.error.data = data;
  }

  return errorResponse;
};

// ✅ Main PayMe Sandbox Handler
const handleSandboxPayment = async (req, res) => {
  try {
    const { method, params, id } = req.body;

    console.log('🧪 PayMe Sandbox Request:', {
      method,
      hasParams: !!params,
      hasId: !!id
    });

    // Validate authorization first
    const authResult = validatePaymeAuth(req);
    if (!authResult.valid) {
      return res.json(createErrorResponse(id, PaymeErrorCode.INVALID_AUTHORIZATION));
    }

    if (!id) {
      return res.json(createErrorResponse(null, PaymeErrorCode.INVALID_PARAMS));
    }

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
        return res.json(createErrorResponse(id, PaymeErrorCode.METHOD_NOT_FOUND, method));
    }

  } catch (error) {
    console.error('❌ Sandbox error:', error);
    res.status(200).json(createErrorResponse(
      req.body?.id || null, 
      PaymeErrorCode.INTERNAL_ERROR
    ));
  }
};
// ✅ CheckPerformTransaction handler - FIXED for all test scenarios
const handleCheckPerformTransaction = async (req, res, id, params) => {
  console.log('🔍 Processing CheckPerformTransaction with:', {
    amount: params?.amount,
    account: params?.account
  });
  
  // Get account login - handle both 'login' and 'Login' cases
  const accountLogin = params?.account?.login || params?.account?.Login;
  if (!accountLogin) {
    console.log('❌ No account login provided');
    // Return error in range -31050 to -31099 with data field
    return res.json(createErrorResponse(id, -31050, null, 'login'));
  }
  
  // ✅ Validate amount FIRST (before account validation)
  const validAmounts = Object.values(PAYMENT_AMOUNTS);
  if (!params?.amount || !validAmounts.includes(params.amount)) {
    console.log('❌ Invalid amount:', params?.amount, 'Valid amounts:', validAmounts);
    // IMPORTANT: For amount errors, do NOT include data field
    return res.json(createErrorResponse(id, PaymeErrorCode.INVALID_AMOUNT, null, false));
  }
  
  // ✅ Check account state AFTER amount validation
  const accountInfo = await validateAccountAndState(accountLogin);
  console.log('📊 Account validation result:', accountInfo);
  
  // Handle different account states according to Paycom specs
  // For CheckPerformTransaction, account errors should be in range -31050 to -31099
  switch (accountInfo.state) {
    case AccountState.NOT_EXISTS:
      console.log('❌ Account does not exist');
      // Return -31050 for non-existent account with data field
      return res.json(createErrorResponse(id, -31050, null, 'login'));
      
    case AccountState.PROCESSING:
      console.log('❌ Account is being processed by another transaction');
      // Return -31051 for processing state with data field
      return res.json(createErrorResponse(id, -31051, null, 'login'));
      
    case AccountState.BLOCKED:
      console.log('❌ Account is blocked (already paid/cancelled)');
      // Return -31052 for blocked state with data field
      return res.json(createErrorResponse(id, -31052, null, 'login'));
      
    case AccountState.WAITING_PAYMENT:
      // ✅ FIXED: For waiting_payment state, return success
      console.log('✅ Account is in waiting_payment state - transaction allowed');
      break;
      
    default:
      // If no specific state, check if account exists
      if (!accountInfo.exists) {
        console.log('❌ Account does not exist in system');
        return res.json(createErrorResponse(id, -31050, null, 'login'));
      }
      // If account exists but no specific state, allow transaction
      console.log('✅ Account exists - transaction allowed');
  }
  
  // Success response - only for waiting_payment state with valid amount
  console.log('✅ CheckPerformTransaction successful');
  return res.json({
    jsonrpc: '2.0',
    id: id,
    result: {
      allow: true,
      detail: { receipt_type: 0 }
    }
  });
};

// ✅ CreateTransaction handler - FIXED according to Payme documentation
const handleCreateTransaction = async (req, res, id, params) => {
  console.log('🔍 Processing CreateTransaction with:', {
    id: params?.id,
    amount: params?.amount,
    account: params?.account,
    time: params?.time
  });
  
  // ✅ IMPORTANT: Check if transaction already exists (idempotency)
  const existingTransaction = sandboxTransactions.get(params?.id);
  if (existingTransaction) {
    console.log('✅ Transaction already exists, returning existing transaction:', params.id);
    // According to docs: if transaction exists, return its current state
    return res.json({
      jsonrpc: '2.0',
      id: id,
      result: {
        create_time: existingTransaction.create_time,
        transaction: existingTransaction.transaction,
        state: existingTransaction.state,
        receivers: existingTransaction.receivers || null
      }
    });
  }
  
  // ✅ Validate required parameters
  if (!params?.id || !params?.time || !params?.amount || !params?.account) {
    console.log('❌ Missing required parameters');
    return res.json(createErrorResponse(id, PaymeErrorCode.INVALID_PARAMS));
  }
  
  // Get account login - handle both 'login' and 'Login' cases
  const createAccountLogin = params?.account?.login || params?.account?.Login;
  if (!createAccountLogin) {
    console.log('❌ No account login provided');
    return res.json(createErrorResponse(id, -31050, null, 'login'));
  }
  
  // ✅ Validate amount
  const validCreateAmounts = Object.values(PAYMENT_AMOUNTS);
  if (!validCreateAmounts.includes(params.amount)) {
    console.log('❌ Invalid amount:', params?.amount, 'Valid amounts:', validCreateAmounts);
    return res.json(createErrorResponse(id, PaymeErrorCode.INVALID_AMOUNT, null, false));
  }
  
  // ✅ Check account validity
  const createAccountInfo = await validateAccountAndState(createAccountLogin);
  console.log('📊 Create transaction account validation:', createAccountInfo);
  
  // Check if account exists
  if (!createAccountInfo.exists) {
    console.log('❌ Account does not exist');
    return res.json(createErrorResponse(id, -31050, null, 'login'));
  }
  
  // ✅ Handle different account states
  switch (createAccountInfo.state) {
    case AccountState.NOT_EXISTS:
      console.log('❌ Account does not exist');
      return res.json(createErrorResponse(id, -31050, null, 'login'));
      
    case AccountState.BLOCKED:
      console.log('❌ Account is blocked');
      return res.json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION, null, false));
      
    case AccountState.PROCESSING:
      console.log('❌ Account is processing another transaction');
      return res.json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION, null, false));
      
    case AccountState.WAITING_PAYMENT:
      // ✅ FIXED: For waiting_payment state, we should CREATE the transaction
      // The account is ready to receive payment
      console.log('✅ Account is in waiting_payment state - creating transaction');
      break;
      
    default:
      // If account exists but no specific state, check for unpaid transactions
      if (hasExistingUnpaidTransaction(createAccountLogin)) {
        console.log('❌ Account already has an unpaid transaction');
        return res.json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION, null, false));
      }
      console.log('✅ Account exists and ready for transaction');
  }

  // ✅ Create new transaction - СЧЕТ НАКОПИТЕЛЬНЫЙ (accumulative account)
  const newTransaction = {
    id: params.id,
    transaction: params.id.toString(), // Transaction ID in merchant system
    state: TransactionState.CREATED,
    create_time: Date.now(),
    amount: params.amount,
    account: params.account,
    cancelled: false,
    perform_time: 0,
    cancel_time: 0,
    reason: null,
    receivers: null // Direct payment - merchant is the receiver
  };
  
  // Store transaction
  sandboxTransactions.set(params.id, newTransaction);
  
  console.log('✅ CreateTransaction successful - new transaction created');
  
  // Return success response according to Payme spec
  return res.json({
    jsonrpc: '2.0',
    id: id,
    result: {
      create_time: newTransaction.create_time,
      transaction: newTransaction.transaction,
      state: newTransaction.state,
      receivers: newTransaction.receivers
    }
  });
};
// ✅ FIXED PerformTransaction handler - Returns error -31008 for cancelled transactions
const handlePerformTransaction = async (req, res, id, params) => {
  console.log('🔍 Processing PerformTransaction for:', params?.id);
  
  // Validate that transaction ID is provided
  if (!params?.id) {
    console.log('❌ Transaction ID not provided');
    return res.json(createErrorResponse(id, PaymeErrorCode.INVALID_PARAMS));
  }
  
  const performTransactionId = params.id;
  const performTransaction = findTransactionById(performTransactionId);
  
  if (!performTransaction) {
    console.log('❌ Transaction not found for perform:', performTransactionId);
    return res.json(createErrorResponse(id, PaymeErrorCode.TRANSACTION_NOT_FOUND));
  }
  
  // ✅ CRITICAL: Check if transaction is cancelled (state -1 or -2)
  if (performTransaction.state < 0) {
    console.log('❌ Cannot perform cancelled transaction. State:', performTransaction.state);
    return res.json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION));
  }
  
  // Check if already performed (idempotency)
  if (performTransaction.state === TransactionState.COMPLETED) {
    console.log('✅ Transaction already performed, returning existing result');
    return res.json({
      jsonrpc: '2.0',
      id: id,
      result: {
        transaction: performTransaction.transaction,
        perform_time: performTransaction.perform_time,
        state: performTransaction.state
      }
    });
  }
  
  // Check if transaction is expired (12 hours for Payme)
  const txAge = Date.now() - performTransaction.create_time;
  if (txAge > 12 * 60 * 60 * 1000) {
    console.log('❌ Transaction expired (older than 12 hours)');
    return res.json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION));
  }
  
  // ✅ Check account state before performing transaction
  const performAccountLogin = performTransaction.account?.login || performTransaction.account?.Login;
  if (performAccountLogin) {
    // Re-validate account state at the time of perform
    const performAccountInfo = await validateAccountAndState(performAccountLogin);
    
    console.log('📊 Account state during perform:', performAccountInfo);
    
    // Check if account doesn't exist
    if (!performAccountInfo.exists || performAccountInfo.state === AccountState.NOT_EXISTS) {
      console.log('❌ Account not found during perform');
      return res.json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION));
    }
    
    // Check if account is blocked
    if (performAccountInfo.state === AccountState.BLOCKED) {
      console.log('❌ Account is blocked during perform - returning -31008');
      return res.json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION));
    }
    
    // Check if account is processing another transaction
    if (performAccountInfo.state === AccountState.PROCESSING) {
      console.log('❌ Account is processing another transaction - returning -31008');
      return res.json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION));
    }
  }
  
  // ✅ All checks passed - perform the transaction
  performTransaction.state = TransactionState.COMPLETED;
  performTransaction.perform_time = Date.now();
  
  console.log('✅ PerformTransaction successful for:', performTransactionId);
  return res.json({
    jsonrpc: '2.0',
    id: id,
    result: {
      transaction: performTransaction.transaction,
      perform_time: performTransaction.perform_time,
      state: performTransaction.state
    }
  });
};

// ✅ CORRECTLY FIXED CancelTransaction handler
const handleCancelTransaction = async (req, res, id, params) => {
  console.log('🔍 Processing CancelTransaction for:', params?.id, 'with reason:', params?.reason);
  
  const cancelTransactionId = params?.id;
  const cancelTransaction = findTransactionById(cancelTransactionId);
  
  if (!cancelTransaction) {
    console.log('❌ Transaction not found for cancel:', cancelTransactionId);
    return res.json(createErrorResponse(id, PaymeErrorCode.TRANSACTION_NOT_FOUND));
  }
  
  console.log('📊 Transaction details before cancel:', {
    id: cancelTransactionId,
    currentState: cancelTransaction.state,
    hasPerformTime: !!cancelTransaction.perform_time,
    performTime: cancelTransaction.perform_time
  });
  
  // Check if already cancelled
  if (cancelTransaction.state < 0) {
    console.log('✅ Transaction already cancelled, returning existing result');
    return res.json({
      jsonrpc: '2.0',
      id: id,
      result: {
        transaction: cancelTransaction.transaction,
        cancel_time: cancelTransaction.cancel_time,
        state: cancelTransaction.state
      }
    });
  }
  
  // Check if order is completed (blocked account scenario)
  if (cancelTransaction.state === TransactionState.COMPLETED) {
    const accountLogin = cancelTransaction.account?.login || cancelTransaction.account?.Login;
    const accountState = accountStates.get(accountLogin);
    
    if (accountState === AccountState.BLOCKED) {
      console.log('❌ Order is completed, cannot cancel');
      return res.json(createErrorResponse(id, PaymeErrorCode.ORDER_COMPLETED));
    }
  }
  
  // ✅ CRITICAL FIX: Determine state based on ACTUAL transaction state
  let newState;
  let reason;
  
  // Check the ACTUAL current state of the transaction
  if (cancelTransaction.state === TransactionState.CREATED) {
    // Transaction is in CREATED state (1) -> Cancel to state -1
    newState = TransactionState.CANCELLED_AFTER_CREATE; // -1
    reason = 3;
    console.log('✅ Cancelling CREATED transaction -> state will be -1, reason = 3');
  } else if (cancelTransaction.state === TransactionState.COMPLETED) {
    // Transaction is in COMPLETED state (2) -> Cancel to state -2
    newState = TransactionState.CANCELLED_AFTER_COMPLETE; // -2
    reason = 5;
    console.log('✅ Cancelling COMPLETED transaction -> state will be -2, reason = 5');
  } else {
    console.log('❌ Cannot cancel transaction in state:', cancelTransaction.state);
    return res.json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION));
  }
  
  // Apply the cancellation
  cancelTransaction.state = newState;
  cancelTransaction.cancel_time = Date.now();
  cancelTransaction.reason = reason;
  cancelTransaction.cancelled = true;
  
  // For CREATED transactions, ensure perform_time is 0
  if (newState === TransactionState.CANCELLED_AFTER_CREATE) {
    cancelTransaction.perform_time = 0;
  }
  
  console.log('✅ CancelTransaction completed:', {
    id: cancelTransactionId,
    newState: newState,
    reason: reason,
    perform_time: cancelTransaction.perform_time
  });
  
  return res.json({
    jsonrpc: '2.0',
    id: id,
    result: {
      transaction: cancelTransaction.transaction,
      cancel_time: cancelTransaction.cancel_time,
      state: cancelTransaction.state
    }
  });
};
// ✅ FIXED CheckTransaction handler - Correctly returns transaction states
const handleCheckTransaction = async (req, res, id, params) => {
  console.log('🔍 Processing CheckTransaction for:', params?.id);
  
  // Validate that transaction ID is provided
  if (!params?.id) {
    console.log('❌ Transaction ID not provided');
    return res.json(createErrorResponse(id, PaymeErrorCode.INVALID_PARAMS));
  }
  
  const checkTransactionId = params.id;
  const checkTransaction = findTransactionById(checkTransactionId);
  
  if (!checkTransaction) {
    console.log('❌ Transaction not found:', checkTransactionId);
    return res.json(createErrorResponse(id, PaymeErrorCode.TRANSACTION_NOT_FOUND));
  }
  
  // Log current transaction state
  console.log('📊 Current transaction state:', {
    id: checkTransactionId,
    state: checkTransaction.state,
    stateText: getTransactionStateText(checkTransaction.state)
  });
  
  // Build response based on transaction state
  let result = {
    create_time: checkTransaction.create_time,
    perform_time: 0,
    cancel_time: 0,
    transaction: checkTransaction.transaction,
    state: checkTransaction.state,
    reason: null
  };
  
  // ✅ Handle each state according to Payme specification
  switch (checkTransaction.state) {
    case TransactionState.CREATED: // State 1
      // Transaction created but not performed
      result.perform_time = 0;
      result.cancel_time = 0;
      result.reason = null;
      break;
      
    case TransactionState.COMPLETED: // State 2
      // Transaction completed
      result.perform_time = checkTransaction.perform_time || Date.now();
      result.cancel_time = 0;
      result.reason = null;
      break;
      
    case TransactionState.CANCELLED_AFTER_CREATE: // State -1
      // Cancelled before payment
      result.perform_time = 0; // Never performed
      result.cancel_time = checkTransaction.cancel_time || Date.now();
      result.reason = checkTransaction.reason || 3;
      break;
      
    case TransactionState.CANCELLED_AFTER_COMPLETE: // State -2
      // Cancelled after payment (refunded)
      result.perform_time = checkTransaction.perform_time || Date.now();
      result.cancel_time = checkTransaction.cancel_time || Date.now();
      result.reason = checkTransaction.reason || 5;
      break;
      
    default:
      console.log('⚠️ Unknown transaction state:', checkTransaction.state);
      break;
  }
  
  console.log('✅ CheckTransaction response:', {
    state: result.state,
    perform_time: result.perform_time,
    cancel_time: result.cancel_time,
    reason: result.reason
  });
  
  return res.json({
    jsonrpc: '2.0',
    id: id,
    result: result
  });
};
// ✅ GetStatement handler
const handleGetStatement = async (req, res, id, params) => {
  console.log('🔍 Processing GetStatement with:', {
    from: params?.from,
    to: params?.to
  });
  
  const from = params?.from || 0;
  const to = params?.to || Date.now();
  
  // Filter transactions by time range
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
  
  console.log(`✅ GetStatement returning ${transactions.length} transactions`);
  return res.json({
    jsonrpc: '2.0',
    id: id,
    result: {
      transactions: transactions
    }
  });
};

// ✅ ChangePassword handler
const handleChangePassword = async (req, res, id, params) => {
  console.log('✅ ChangePassword method called');
  // According to PayMe documentation, this method should return success
  // even though it's not actually implemented in most merchant systems
  return res.json({
    jsonrpc: '2.0',
    id: id,
    result: {
      success: true
    }
  });
};

// ✅ New endpoint to set account state for testing
const setAccountState = async (req, res) => {
  try {
    const { accountLogin, state } = req.body;
    
    if (!accountLogin || !state) {
      return res.status(400).json({
        message: '❌ Account login and state are required'
      });
    }
    
    const validStates = Object.values(AccountState);
    if (!validStates.includes(state)) {
      return res.status(400).json({
        message: '❌ Invalid state. Valid states: ' + validStates.join(', ')
      });
    }
    
    accountStates.set(accountLogin, state);
    
    console.log('✅ Account state set:', { accountLogin, state });
    
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

// ✅ Production-aware helper function
const makePaymeRequest = async (url, payload) => {
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

    if (merchantKey) {
      requestConfig.auth = {
        username: 'Paycom',
        password: merchantKey
      };
      console.log('🔐 Added Basic auth for PayMe request');
    }

    const response = await axios.post(url, requestPayload, requestConfig);
    return response.data;

  } catch (error) {
    if (error.response) {
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
      throw error;
    }
  }
};

// ✅ Keep existing functions unchanged
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
    
    // Set account state to waiting_payment for new payment
    accountStates.set(accountLogin, AccountState.WAITING_PAYMENT);
    
    let paymeApiUrl;
    if (isProduction) {
      paymeApiUrl = process.env.PAYME_API_URL_LIVE || 'https://checkout.paycom.uz/api';
    } else {
      paymeApiUrl = 'https://api.aced.live/api/payments/sandbox';
    }

    try {
      const checkResponse = await makePaymeRequest(paymeApiUrl, {
        id: requestId,
        method: 'CheckPerformTransaction',
        params: {
          account: { login: accountLogin },
          amount: amount
        }
      });

      if (checkResponse.error) {
        return res.status(400).json({
          message: '❌ Не удалось проверить возможность оплаты',
          error: checkResponse.error.message?.ru || checkResponse.error.message?.en || 'Ошибка проверки',
          code: checkResponse.error.code,
          sandbox: !isProduction
        });
      }

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

      if (createResponse.error) {
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
    
    // Check sandbox transactions first
    const sandboxTransaction = findTransactionById(transactionId);
    if (sandboxTransaction) {
      const user = await User.findById(userId);
      
      // Update user if transaction is completed
      if (sandboxTransaction.state === TransactionState.COMPLETED && user) {
        // Determine plan based on amount
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
          console.log('✅ User subscription updated:', { userId, plan });
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

// Helper function to get transaction state text
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

// ✅ New function to handle webhook notifications from Payme
const handlePaymeWebhook = async (req, res) => {
  try {
    console.log('🔔 PayMe Webhook received:', {
      method: req.body?.method,
      params: req.body?.params,
      hasAuth: !!req.headers.authorization
    });

    // Validate authorization for webhooks
    const authResult = validatePaymeAuth(req);
    if (!authResult.valid) {
      console.log('❌ Webhook authorization failed');
      return res.status(401).json({
        error: 'Unauthorized webhook request'
      });
    }

    const { method, params } = req.body;

    // Handle different webhook notifications
    switch (method) {
      case 'PaymentCompleted':
        // Update user subscription when payment is completed
        if (params?.account?.login && params?.state === TransactionState.COMPLETED) {
          const user = await User.findById(params.account.login);
          if (user) {
            let plan = 'free';
            if (params.amount === PAYMENT_AMOUNTS.start) {
              plan = 'start';
            } else if (params.amount === PAYMENT_AMOUNTS.pro) {
              plan = 'pro';
            }
            
            user.subscriptionPlan = plan;
            user.paymentStatus = 'paid';
            await user.save();
            
            console.log('✅ User subscription updated via webhook:', {
              userId: params.account.login,
              plan
            });
          }
        }
        break;
        
      case 'PaymentCancelled':
        // Handle payment cancellation
        if (params?.account?.login) {
          const user = await User.findById(params.account.login);
          if (user && user.paymentStatus === 'paid') {
            // Only revert if this was their latest payment
            // You might want to add more logic here
            console.log('⚠️ Payment cancelled for user:', params.account.login);
          }
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

// ✅ Debug function to list all transactions (for testing)
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

// ✅ Function to clear sandbox transactions (for testing)
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

// ✅ Set merchant key for testing
const setMerchantKey = async (req, res) => {
  try {
    const { merchantKey } = req.body;
    
    if (!merchantKey) {
      return res.status(400).json({
        message: '❌ Merchant key is required'
      });
    }
    
    currentMerchantKey = merchantKey;
    
    console.log('✅ Merchant key set for sandbox testing');
    
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

module.exports = { 
  applyPromoCode, 
  initiatePaymePayment,
  handleSandboxPayment,
  validateUserRoute,
  checkPaymentStatus,
  handlePaymeWebhook,
  listTransactions,
  clearSandboxTransactions,
  setAccountState,
  setMerchantKey
};