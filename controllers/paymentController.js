// ================================================
// User validation and management routes
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
    console.log('🔍 Validating user ID:', userId);
    let user = null;
    if (userId.length >= 20 && !userId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('🔥 Searching by firebaseId');
      user = await User.findOne({ firebaseId: userId });
    } else if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('🍃 Searching by _id');
      user = await User.findById(userId);
    } else if (userId.includes('@') && userId.includes('.')) {
      console.log('📧 Searching by email');
      user = await User.findOne({ email: userId });
    } else if (userId.match(/^\+?\d{9,15}$/)) {
      console.log('📱 Searching by phone');
      user = await User.findOne({ phone: userId });
    } else {
      console.log('🔄 Fallback search');
      user = await User.findOne({
        $or: [
          { firebaseId: userId },
          { email: userId },
          { login: userId }
        ]
      });
    }
    if (!user) {
      console.log('❌ User not found for ID:', userId);
      return res.status(404).json({
        message: '❌ User not found',
        valid: false,
        userId,
        searchedBy: 'Multiple strategies attempted'
      });
    }
    console.log('✅ User found:', {
      id: user._id,
      firebaseId: user.firebaseId,
      email: user.email,
      name: user.name
    });
    return res.status(200).json({
      message: '✅ User validation successful',
      valid: true,
      server: 'api.aced.live',
      user: {
        id: user._id,
        firebaseId: user.firebaseId,
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
        $or: [{ firebaseId: userId }, { email: userId }, { login: userId }]
      });
    }
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      user: {
        id: user._id,
        firebaseId: user.firebaseId,
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
        firebaseId: user.firebaseId,
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
        // Dynamic import for firebase-admin in ES modules
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
        login: userEmail,
        subscriptionPlan: subscriptionPlan || 'free',
        paymentStatus: 'unpaid'
      });
    } else {
      if (name) user.name = name;
      if (userEmail) user.email = userEmail;
      if (subscriptionPlan) user.subscriptionPlan = subscriptionPlan;
      user.login = userEmail || user.email;
    }
    await user.save();
    res.json({
      message: 'User saved successfully',
      user: {
        id: user._id,
        firebaseId: user.firebaseId,
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
// Payment status and monitoring functions
// ================================================
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
// Promo code application
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
// Webhook handler
// ================================================
const handlePaymeWebhook = async (req, res) => {
  try {
    console.log('🔔 PayMe Webhook received:', {
      method: req.body?.method,
      params: req.body?.params,
      hasAuth: !!req.headers.authorization
    });
    const authResult = validatePaymeAuth(req);
    if (!authResult.valid) {
      console.log('❌ Webhook authorization failed');
      return res.status(401).json({
        error: 'Unauthorized webhook request'
      });
    }
    const { method, params } = req.body;
    switch (method) {
      case 'PaymentCompleted':
        if (params?.account?.order_id && params?.state === TransactionState.COMPLETED) {
          // Find user by order ID pattern (extract userId from order ID)
          const orderIdParts = params.account.order_id.match(/^aced(\d+)/);
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
              console.log('✅ User subscription updated via webhook:', {
                userId: userId,
                plan
              });
            }
          }
        }
        break;
      case 'PaymentCancelled':
        if (params?.account?.order_id) {
          console.log('⚠️ Payment cancelled for order:', params.account.order_id);
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
// NEW: PayMe Return URL Handlers
// ================================================
const handlePaymeReturnSuccess = async (req, res) => {
  try {
    const { transaction: transactionId, userId } = req.query;
    console.log('✅ PayMe return success for transaction:', transactionId);
    
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
            console.log('✅ User subscription updated on return:', { userId, plan });
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
    console.log('❌ PayMe return error for transaction:', transactionId, 'Error:', errorCode);
    
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
// Additional helper functions and utilities
// ================================================

// Helper to store transaction in sandbox
const setTransaction = (id, transaction) => {
  sandboxTransactions.set(id, transaction);
};

// Validate that provided amount is valid
const validateAmount = (amount) => {
  const validAmounts = Object.values(PAYMENT_AMOUNTS);
  return validAmounts.includes(amount);
};

// Get transaction status text in multiple languages
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

// Validate transaction parameters
const validateTransactionParams = (params) => {
  if (!params) return false;
  const requiredFields = ['id', 'time', 'amount'];
  return requiredFields.every(field => {
    if (field === 'amount') {
      return validateAmount(params[field]);
    }
    return params[field] !== undefined;
  });
};

// Validate account parameters
const validateAccountParams = (account) => {
  if (!account) return false;
  return account.order_id || account.login;
};

// Get account state from sandbox or default to waiting payment
const getAccountState = (accountLogin) => {
  return accountStates.get(accountLogin) || AccountState.WAITING_PAYMENT;
};

// Check if a transaction can be cancelled
const canCancelTransaction = (transaction) => {
  if (!transaction) return false;
  if (transaction.state === TransactionState.CANCELLED_AFTER_CREATE ||
      transaction.state === TransactionState.CANCELLED_AFTER_COMPLETE) {
    return false;
  }
  const txAge = Date.now() - transaction.create_time;
  if (txAge > 24 * 60 * 60 * 1000) {
    return false;
  }
  return true;
};

// Enhanced error handling during payment operations
const handlePaymentError = (error, req, res) => {
  console.error('Payment processing error:', error);
  const errorContext = {
    path: req.path,
    method: req.method,
    body: req.body,
    headers: {
      ...req.headers,
      authorization: req.headers.authorization ? '[REDACTED]' : undefined
    },
    error: {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }
  };
  console.error('Error context:', errorContext);
  if (error.name === 'ValidationError') {
    return res.status(200).json(createErrorResponse(
      req.body?.id,
      PaymeErrorCode.INVALID_PARAMS,
      null,
      error.message
    ));
  }
  if (error.name === 'MongoError' && error.code === 11000) {
    return res.status(200).json(createErrorResponse(
      req.body?.id,
      PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION,
      null,
      'Duplicate transaction'
    ));
  }
  return res.status(200).json(createErrorResponse(
    req.body?.id,
    PaymeErrorCode.INTERNAL_ERROR,
    null,
    process.env.NODE_ENV === 'development' ? error.message : undefined
  ));
};

// Process webhook notifications with additional actions
const processWebhookNotification = async (notification) => {
  try {
    const { method, params } = notification;
    switch (method) {
      case 'PaymentProcessing':
        if (params?.account?.order_id) {
          accountStates.set(params.account.order_id, AccountState.PROCESSING);
        }
        break;
      case 'PaymentCancelled':
        if (params?.account?.order_id) {
          accountStates.delete(params.account.order_id);
        }
        break;
      case 'PaymentExpired':
        // Handle expired payments if needed.
        break;
    }
    return true;
  } catch (error) {
    console.error('Webhook processing error:', error);
    return false;
  }
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

// Process payment helper to update user subscription
const processPayment = async (userId, amount, plan) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    user.subscriptionPlan = plan;
    user.paymentStatus = 'paid';
    user.lastPaymentDate = new Date();
    await user.save();
    return {
      success: true,
      user: {
        id: user._id,
        plan: user.subscriptionPlan,
        status: user.paymentStatus
      }
    };
  } catch (error) {
    console.error('Payment processing error:', error);
    throw error;
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
      console.warn('Could not get user stats:', dbError.message);
    }
    
    res.json(stats);
  } catch (error) {
    console.error('❌ Get payment stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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
      login: process.env.PAYME_LOGIN || 'Paycom',
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
      account: { order_id: `${userId}_${plan}_${Date.now()}` },
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
  const sampleResponse = createErrorResponse(12345, numericCode, 'sample_method');
  
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
// Export all functions
// ================================================
export {
  // Main PayMe functions
  applyPromoCode, 
  initiatePaymePayment,
  handleSandboxPayment,
  handlePaymeWebhook,
  
  // NEW: PayMe URL generation
  generatePaymeGetUrl,
  generateDirectPaymeUrl,
  generateDirectPaymeForm,
  
  // NEW: Return URL handlers
  handlePaymeReturnSuccess,
  handlePaymeReturnError,
  
  // NEW: Test integration
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
  validateTransactionParams,
  validateAccountParams,
  getAccountState,
  canCancelTransaction,
  handlePaymentError,
  processWebhookNotification,
  cleanupOldTransactions,
  processPayment,
  
  // Helper functions
  safeErrorResponse,
  getPaymentAmounts,
  validateAccountAndState,
  validatePaymeAuth,
  findTransactionById,
  hasExistingUnpaidTransaction,
  createErrorResponse,
  getTransactionStateText,
  createDetailObject,
  
  // Transaction handlers
  handleCheckPerformTransaction,
  handleCreateTransaction,
  handlePerformTransaction,
  handleCancelTransaction,
  handleCheckTransaction,
  handleGetStatement,
  handleChangePassword
};// controllers/paymentController.js - COMPLETE MERGED VERSION WITH ALL FEATURES AND FIXES

import User from '../models/user.js';
import axios from 'axios';

// Payment amounts in tiyin (UZS * 100)
const PAYMENT_AMOUNTS = {
  start: 26000000,  // 260,000 UZS in tiyin
  pro: 45500000     // 455,000 UZS in tiyin
};

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

// In-memory storage for sandbox testing
const sandboxTransactions = new Map();
const accountStates = new Map();
let currentMerchantKey = null;

// Transaction states according to Payme spec
const TransactionState = {
  CREATED: 1,
  COMPLETED: 2,
  CANCELLED_AFTER_CREATE: -1,
  CANCELLED_AFTER_COMPLETE: -2
};

// Account states for testing purposes
const AccountState = {
  WAITING_PAYMENT: 'waiting_payment',
  PROCESSING: 'processing',
  BLOCKED: 'blocked',
  NOT_EXISTS: 'not_exists'
};

// PayMe Error codes - COMPLETE with all documentation error codes
const PaymeErrorCode = {
  // Transaction errors
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  UNABLE_TO_PERFORM_OPERATION: -31008,
  ORDER_COMPLETED: -31007,
  
  // Account errors
  INVALID_ACCOUNT: -31050,
  ACCOUNT_NOT_FOUND: -31050,
  ACCOUNT_BLOCKED: -31051,
  ACCOUNT_PROCESSING: -31052,
  ACCOUNT_INVALID: -31099,
  
  // Additional error codes from documentation
  MERCHANT_NOT_FOUND: -31601,
  INVALID_FIELD_VALUE: -31610,
  AMOUNT_TOO_SMALL: -31611,
  AMOUNT_TOO_LARGE: -31612,
  MERCHANT_SERVICE_UNAVAILABLE: -31622,
  MERCHANT_SERVICE_INCORRECT: -31623,
  CARD_ERROR: -31630,
  
  // JSON-RPC errors
  INVALID_JSON_RPC: -32700,
  PARSE_ERROR: -32700,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  INVALID_AUTHORIZATION: -32504
};

// ✅ FIXED: Safe error response helper
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
    error: errorMessage, // Always a string
    timestamp: new Date().toISOString(),
    server: 'api.aced.live'
  });
};

// ✅ FIXED: Generate GET URL with proper validation
const generateDirectPaymeUrl = async (userId, plan, options = {}) => {
  try {
    console.log('🔗 Generating PayMe GET URL - Method 1');
    
    // Get merchant ID with validation
    const merchantId = import.meta.env.VITE_PAYME_MERCHANT_ID || process.env.PAYME_MERCHANT_ID;
    
    if (!merchantId || merchantId === 'undefined' || typeof merchantId !== 'string') {
      console.error('❌ Merchant ID not loaded properly');
      console.error('Current value:', merchantId, 'Type:', typeof merchantId);
      throw new Error('PayMe Merchant ID not configured. Check your .env file.');
    }
    
    console.log('✅ Merchant ID loaded:', merchantId.substring(0, 10) + '...');
    
    const amounts = getPaymentAmounts();
    const planAmount = amounts[plan]?.tiyin;
    
    if (!planAmount) {
      throw new Error(`Plan "${plan}" not found. Available: start, pro`);
    }
    
    // Generate clean order ID (alphanumeric only)
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substr(2, 6);
    const orderId = `aced${timestamp}${randomPart}`;
    
    console.log('💰 Payment details:', {
      plan,
      orderId,
      amountTiyin: planAmount,
      amountUzs: amounts[plan].uzs
    });
    
    // Build parameters according to GET documentation
    const params = [];
    params.push(`m=${merchantId}`);
    params.push(`ac.order_id=${orderId}`);
    params.push(`a=${planAmount}`);
    
    if (options.lang && ['ru', 'uz', 'en'].includes(options.lang)) {
      params.push(`l=${options.lang}`);
    }
    
    if (options.callback) {
      params.push(`c=${encodeURIComponent(options.callback)}`);
    }
    
    if (options.callback_timeout) {
      params.push(`ct=${options.callback_timeout}`);
    }
    
    // Join with semicolon as per documentation
    const paramString = params.join(';');
    console.log('📝 Parameter string:', paramString);
    
    // Validate no undefined values
    if (paramString.includes('undefined') || paramString.includes('null')) {
      throw new Error('Parameter string contains invalid values: ' + paramString);
    }
    
    // Base64 encode
    const base64Params = btoa(paramString);
    const paymentUrl = `https://checkout.paycom.uz/${base64Params}`;
    
    // Final verification
    const verification = atob(base64Params);
    console.log('✅ Verification - decoded:', verification);
    
    if (verification !== paramString) {
      throw new Error('URL encoding/decoding mismatch');
    }
    
    console.log('✅ PayMe GET URL generated successfully');
    
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

// ✅ FIXED: Generate POST form with safe error handling
const generateDirectPaymeForm = async (userId, plan, options = {}) => {
  try {
    console.log('📝 Generating PayMe POST form - Method 2');
    
    // ✅ CRITICAL FIX: Clean merchant ID
    const merchantId = (import.meta.env.VITE_PAYME_MERCHANT_ID || process.env.PAYME_MERCHANT_ID || '68016cc1a5e04614247f7174').trim();
    
    // ✅ VALIDATION: Check merchant ID
    if (!merchantId || merchantId === 'undefined' || merchantId.length < 10) {
      throw new Error('Invalid PayMe Merchant ID configuration');
    }
    
    const amounts = getPaymentAmounts();
    const planAmount = amounts[plan]?.tiyin;
    
    if (!planAmount) {
      throw new Error(`Unknown plan: ${plan}`);
    }
    
    // ✅ CRITICAL FIX: Generate CLEAN order ID (only alphanumeric)
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const orderId = options.order_id || `aced${timestamp}${randomStr}`;
    
    // ✅ SANITIZE: Remove any special characters from order ID
    const cleanOrderId = orderId.replace(/[^a-zA-Z0-9]/g, '');
    
    console.log('🧹 Clean order ID generated:', cleanOrderId);
    
    // ✅ Create detail object as per PayMe documentation
    const detail = {
      receipt_type: 0,
      items: [{
        title: `ACED ${plan.toUpperCase()} Subscription`,
        price: planAmount,
        count: 1,
        code: "10899002001000000", // IKPU code for digital services
        vat_percent: 0,
        package_code: "123456"
      }]
    };
    
    // ✅ Safe JSON encoding
    let detailBase64;
    try {
      const detailJson = JSON.stringify(detail);
      detailBase64 = btoa(unescape(encodeURIComponent(detailJson)));
    } catch (encodingError) {
      console.error('❌ Detail encoding failed:', encodingError);
      detailBase64 = ''; // Fallback to empty detail
    }
    
    // ✅ Generate clean callback URL
    const callbackUrl = options.callback || `${process.env.FRONTEND_URL || 'https://aced.live'}/payment/success`;
    const cleanCallback = encodeURIComponent(callbackUrl);
    
    // ✅ Validate language parameter
    const validLanguages = ['ru', 'uz', 'en'];
    const language = validLanguages.includes(options.lang) ? options.lang : 'ru';
    
    // ✅ Validate timeout parameter
    const callbackTimeout = options.callback_timeout && Number.isInteger(Number(options.callback_timeout)) 
      ? options.callback_timeout 
      : 15000;
    
    // ✅ Generate form HTML exactly as per POST documentation
    const formHtml = `
    <form method="POST" action="https://checkout.paycom.uz/" id="payme-form" style="display: none;">
      <!-- Required fields -->
      <input type="hidden" name="merchant" value="${merchantId}"/>
      <input type="hidden" name="amount" value="${planAmount}"/>
      <input type="hidden" name="account[order_id]" value="${cleanOrderId}"/>
      
      <!-- Optional fields -->
      <input type="hidden" name="lang" value="${language}"/>
      <input type="hidden" name="callback" value="${cleanCallback}"/>
      <input type="hidden" name="callback_timeout" value="${callbackTimeout}"/>
      <input type="hidden" name="description" value="ACED ${plan.toUpperCase()} Plan Subscription"/>
      ${detailBase64 ? `<input type="hidden" name="detail" value="${detailBase64}"/>` : ''}
      
      <!-- Submit button (hidden, auto-submit) -->
      <button type="submit" style="display: none;">Pay with PayMe</button>
    </form>
    
    <script>
      console.log('📝 PayMe POST form auto-submitting...');
      
      // Wait for DOM to be ready
      function submitPaymeForm() {
        const form = document.getElementById('payme-form');
        if (form) {
          console.log('✅ Form found, submitting to PayMe...');
          form.submit();
        } else {
          console.error('❌ PayMe form not found in DOM');
        }
      }
      
      // Auto-submit after short delay
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          setTimeout(submitPaymeForm, 1000);
        });
      } else {
        setTimeout(submitPaymeForm, 1000);
      }
    </script>
    `;
    
    console.log('✅ PayMe POST form generated successfully');
    console.log('📋 Form details:', {
      merchantId: merchantId.substring(0, 10) + '...',
      orderId: cleanOrderId,
      amount: planAmount,
      plan: plan,
      language: language,
      callback: callbackUrl
    });
    
    return {
      success: true,
      formHtml,
      method: 'POST',
      transaction: {
        id: cleanOrderId,
        amount: planAmount,
        plan: plan,
        merchantId: merchantId
      }
    };
    
  } catch (error) {
    console.error('❌ POST form generation failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate PayMe POST form'
    };
  }
};

// ✅ FIXED: Replace this function in controllers/paymentController.js around line 78
const generatePaymeGetUrl = (merchantId, account, amount, options = {}) => {
  try {
    console.log('🔍 Backend URL generation input:', {
      merchantId: merchantId ? merchantId.substring(0, 10) + '...' : 'MISSING',
      account,
      amount,
      options
    });
    
    // ✅ CRITICAL FIX: Validate and clean inputs
    if (!merchantId || merchantId === 'undefined' || merchantId === 'null') {
      throw new Error('Invalid merchant ID provided');
    }
    
    if (!account || !account.order_id) {
      throw new Error('Account object must have order_id');
    }
    
    if (!amount || amount <= 0 || !Number.isInteger(Number(amount))) {
      throw new Error('Amount must be a positive integer');
    }
    
    // ✅ SANITIZE: Clean the order ID
    const cleanOrderId = String(account.order_id).replace(/[^a-zA-Z0-9]/g, '');
    
    if (!cleanOrderId || cleanOrderId.length < 3) {
      throw new Error('Order ID must be at least 3 alphanumeric characters');
    }
    
    // ✅ CRITICAL FIX: Build clean parameters
    const params = [];
    
    // Merchant ID (validated)
    params.push(`m=${merchantId.trim()}`);
    
    // Clean order ID
    params.push(`ac.order_id=${cleanOrderId}`);
    
    // Clean amount
    params.push(`a=${Number(amount)}`);
    
    // Optional clean parameters
    if (options.lang && /^[a-z]{2}$/.test(options.lang)) {
      params.push(`l=${options.lang}`);
    }
    
    if (options.callback && options.callback.startsWith('http')) {
      // Properly encode callback URL
      const encodedCallback = encodeURIComponent(options.callback);
      params.push(`c=${encodedCallback}`);
    }
    
    if (options.callback_timeout && Number.isInteger(Number(options.callback_timeout))) {
      params.push(`ct=${Number(options.callback_timeout)}`);
    }
    
    // Currency
    params.push(`cr=UZS`);
    
    // ✅ CRITICAL FIX: Safe parameter string
    const paramString = params.join(';');
    
    console.log('📝 Backend clean param string:', paramString);
    
    // ✅ VALIDATION: Check for problematic content
    if (paramString.includes('undefined') || 
        paramString.includes('[object Object]') ||
        paramString.includes('null')) {
      console.error('❌ Parameter string contains invalid values:', paramString);
      throw new Error('Parameter string contains invalid values');
    }
    
    // ✅ SAFE ENCODING: Use Buffer with error handling
    let encodedParams;
    try {
      encodedParams = Buffer.from(paramString, 'utf8').toString('base64');
    } catch (encodingError) {
      console.error('❌ Buffer encoding failed:', encodingError);
      throw new Error('Failed to encode payment parameters');
    }
    
    // ✅ VALIDATION: Verify encoding
    try {
      const verification = Buffer.from(encodedParams, 'base64').toString('utf8');
      if (verification !== paramString) {
        throw new Error('Parameter encoding/decoding mismatch');
      }
      console.log('✅ Backend verification - decoded params:', verification);
    } catch (verificationError) {
      console.error('❌ Backend verification failed:', verificationError);
      throw new Error('Generated URL failed verification');
    }
    
    // Use checkout URL
    const baseUrl = process.env.PAYME_CHECKOUT_URL || 'https://checkout.paycom.uz';
    const finalUrl = `${baseUrl}/${encodedParams}`;
    
    console.log('🔗 Backend generated clean PayMe URL:', finalUrl);
    
    return finalUrl;
    
  } catch (error) {
    console.error('❌ Backend URL generation error:', error);
    throw error;
  }
};

// ================================================
// Account validation function
// ================================================
const validateAccountAndState = async (accountLogin) => {
  try {
    console.log('🔍 Validating account and state:', accountLogin);
    
    // Get current state from sandbox UI
    const currentState = accountStates.get(accountLogin);
    if (currentState) {
      console.log('📊 Account state from UI:', currentState);
      return {
        exists: currentState !== AccountState.NOT_EXISTS,
        state: currentState
      };
    }
    
    // Treat these test values as non-existent for sandbox testing
    const testValues = ['login', 'jjk', 'test', 'demo', 'admin', 'user', ''];
    if (!accountLogin || testValues.includes(accountLogin.toLowerCase())) {
      console.log('❌ Test value detected, treating as non-existent');
      return {
        exists: false,
        state: AccountState.NOT_EXISTS
      };
    }
    
    let user = null;
    if (accountLogin.length >= 20 && !accountLogin.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('🔥 Searching user by firebaseId');
      user = await User.findOne({ firebaseId: accountLogin });
    } else if (accountLogin.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('🍃 Searching user by _id');
      user = await User.findById(accountLogin);
    } else if (accountLogin.includes('@') && accountLogin.includes('.')) {
      console.log('📧 Searching user by email');
      user = await User.findOne({ email: accountLogin });
    } else if (accountLogin.match(/^\+?\d{9,15}$/)) {
      console.log('📱 Searching user by phone');
      user = await User.findOne({ phone: accountLogin });
    } else {
      console.log('🔄 Fallback: searching by multiple fields');
      user = await User.findOne({
        $or: [
          { firebaseId: accountLogin },
          { email: accountLogin },
          { login: accountLogin }
        ]
      });
    }
    
    if (user) {
      console.log('✅ User found for account validation:', {
        id: user._id,
        firebaseId: user.firebaseId,
        email: user.email
      });
      return {
        exists: true,
        state: AccountState.WAITING_PAYMENT
      };
    }
    
    console.log('❌ Account not found in system');
    return {
      exists: false,
      state: AccountState.NOT_EXISTS
    };
    
  } catch (error) {
    console.error('❌ Error validating account:', error.message);
    if (error.name === 'CastError') {
      console.log('🔧 CastError occurred, treating account as non-existent');
      return {
        exists: false,
        state: AccountState.NOT_EXISTS
      };
    }
    return {
      exists: false,
      state: AccountState.NOT_EXISTS
    };
  }
};

// ================================================
// PayMe Authorization Validation
// ================================================
const validatePaymeAuth = (req) => {
  const authHeader = req.headers.authorization;
  console.log('🔐 PayMe Authorization Check:', {
    hasAuthHeader: !!authHeader,
    method: req.body?.method,
    authHeaderStart: authHeader ? authHeader.substring(0, 30) + '...' : 'None',
    userAgent: req.headers['user-agent']?.substring(0, 50),
    environment: process.env.NODE_ENV
  });
  
  // Check if this is likely a PayMe system request
  const userAgent = req.headers['user-agent'] || '';
  const isLikelyPayMeRequest = userAgent.includes('PayMe') || 
                               userAgent.includes('Paycom') ||
                               userAgent.includes('curl') ||
                               req.headers['x-payme-request'] === 'true';
  
  if (!isLikelyPayMeRequest && process.env.NODE_ENV !== 'development') {
    console.log('⚠️ Request doesn\'t appear to be from PayMe system');
    return { valid: false, error: 'NOT_PAYME_REQUEST' };
  }
  
  // DEVELOPMENT MODE: More lenient auth checking
  if (process.env.NODE_ENV === 'development') {
    if (!authHeader) {
      console.log('⚠️ No auth header in development mode - allowing for testing');
      return { valid: true, note: 'Development mode - no auth required' };
    }
  }
  
  if (!authHeader) {
    console.log('❌ Authorization header missing');
    return { valid: false, error: 'MISSING_AUTH_HEADER' };
  }
  
  if (!authHeader.startsWith('Basic ')) {
    console.log('❌ Not Basic authorization format');
    return { valid: false, error: 'INVALID_AUTH_FORMAT' };
  }
  
  try {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    console.log('🔍 Decoded credentials:', {
      username: username || 'empty',
      hasPassword: !!password,
      passwordLength: password?.length || 0
    });
    
    // PayMe expects username 'Paycom'
    const expectedUsername = 'Paycom';
    if (username !== expectedUsername) {
      console.log('❌ Invalid username. Expected: Paycom, Got:', username);
      return { valid: false, error: 'INVALID_USERNAME' };
    }
    
    // Check merchant key from env or currentMerchantKey
    const expectedPassword = currentMerchantKey || process.env.PAYME_MERCHANT_KEY || process.env.PAYME_TEST_KEY;
    
    // DEVELOPMENT: Accept any reasonable password for testing
    if (process.env.NODE_ENV === 'development') {
      if (!password || password.length < 10) {
        console.log('❌ Password too short for development');
        return { valid: false, error: 'INVALID_PASSWORD' };
      }
      console.log('✅ Development mode - accepting merchant key');
      return { valid: true };
    }
    
    if (!expectedPassword) {
      console.log('⚠️ No PAYME_MERCHANT_KEY configured');
      if (!password || password.length < 10) {
        console.log('❌ Password too short or missing');
        return { valid: false, error: 'INVALID_PASSWORD' };
      }
      console.log('✅ Accepting any reasonable password for testing');
      return { valid: true };
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

// ================================================
// Helper functions for sandbox transactions
// ================================================
const findTransactionById = (transactionId) => {
  return sandboxTransactions.get(transactionId);
};

const hasExistingUnpaidTransaction = (accountLogin) => {
  // For accumulative accounts, allow multiple transactions. Here, we always return false.
  return false;
};

// ================================================
// UPDATED: Enhanced error response creation with all new error codes
// ================================================
const createErrorResponse = (id, code, messageKey, data = null) => {
  const messages = {
    ru: '',
    en: '',
    uz: ''
  };

  switch (code) {
    case PaymeErrorCode.INVALID_ACCOUNT:
    case PaymeErrorCode.ACCOUNT_NOT_FOUND:
      messages.ru = 'Аккаунт не найден';
      messages.en = 'Account not found';
      messages.uz = 'Hisob topilmadi';
      break;
    case PaymeErrorCode.INVALID_AMOUNT:
      messages.ru = 'Неверная сумма';
      messages.en = 'Invalid amount';
      messages.uz = 'Noto\'g\'ri summa';
      break;
    case PaymeErrorCode.TRANSACTION_NOT_FOUND:
      messages.ru = 'Транзакция не найдена';
      messages.en = 'Transaction not found';
      messages.uz = 'Tranzaksiya topilmadi';
      break;
    case PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION:
      messages.ru = 'Невозможно выполнить операцию';
      messages.en = 'Unable to perform operation';
      messages.uz = 'Operatsiyani bajarib bo\'lmaydi';
      break;
    case PaymeErrorCode.METHOD_NOT_FOUND:
      messages.ru = 'Метод не найден';
      messages.en = 'Method not found';
      messages.uz = 'Usul topilmadi';
      break;
    case PaymeErrorCode.INVALID_PARAMS:
      messages.ru = 'Неверные параметры';
      messages.en = 'Invalid parameters';
      messages.uz = 'Noto\'g\'ri parametrlar';
      break;
    case PaymeErrorCode.INTERNAL_ERROR:
      messages.ru = 'Внутренняя ошибка';
      messages.en = 'Internal error';
      messages.uz = 'Ichki xatolik';
      break;
    case PaymeErrorCode.INVALID_AUTHORIZATION:
      messages.ru = 'Неверная авторизация';
      messages.en = 'Invalid authorization';
      messages.uz = 'Noto\'g\'ri avtorizatsiya';
      break;
    default:
      messages.ru = 'Неизвестная ошибка';
      messages.en = 'Unknown error';
      messages.uz = 'Noma\'lum xatolik';
      break;
  }

  const errorResponse = {
    jsonrpc: '2.0',
    id: id || null,
    error: {
      code: code,
      message: messages
    }
  };

  // ✅ FIX: For account errors, return the expected field name
  if (code >= -31099 && code <= -31050 && data !== false) {
    // PayMe expects the field name that's missing or invalid
    errorResponse.error.data = data || 'order_id'; // Changed from 'login'
  } else if (data !== null && data !== false) {
    errorResponse.error.data = data;
  }

  return errorResponse;
};

// ================================================
// MAIN SANDBOX HANDLER
// ================================================
const handleSandboxPayment = async (req, res) => {
  try {
    const { method, params, id } = req.body;
    console.log('🧪 PayMe Sandbox Request:', {
      method,
      hasParams: !!params,
      hasId: !!id,
      hasAuth: !!req.headers.authorization,
      userAgent: req.headers['user-agent']?.substring(0, 50),
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    });

    if (!method) {
      console.log('❌ No method provided');
      return res.status(200).json(createErrorResponse(id, PaymeErrorCode.METHOD_NOT_FOUND, 'method'));
    }

    if (!id && id !== 0) {
      console.log('❌ No request ID provided');
      return res.status(200).json(createErrorResponse(null, PaymeErrorCode.INVALID_PARAMS));
    }

    // STEP 1: Validate authorization
    const authResult = validatePaymeAuth(req);
    if (!authResult.valid) {
      console.log('❌ Authorization FAILED:', authResult.error);
      if (authResult.error === 'NOT_PAYME_REQUEST') {
        return res.status(200).json({
          error: 'This endpoint is only for PayMe system integration',
          message: 'PayMe Sandbox API endpoint',
          timestamp: new Date().toISOString(),
          server: 'api.aced.live',
          note: 'This endpoint should only be called by PayMe payment system'
        });
      }
      return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_AUTHORIZATION));
    }

    console.log('✅ Authorization PASSED - processing business logic for method:', method);

    // STEP 2: Handle business logic based on method
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
        return res.status(200).json(createErrorResponse(id, PaymeErrorCode.METHOD_NOT_FOUND, method));
    }
  } catch (error) {
    console.error('❌ Sandbox error:', error);
    return res.status(200).json(createErrorResponse(
      req.body?.id || null, 
      PaymeErrorCode.INTERNAL_ERROR,
      null,
      process.env.NODE_ENV === 'development' ? error.message : null
    ));
  }
};

// ================================================
// CheckPerformTransaction
// ================================================
const handleCheckPerformTransaction = async (req, res, id, params) => {
  console.log('🔍 Processing CheckPerformTransaction with:', {
    amount: params?.amount,
    account: params?.account
  });
  
  // CRITICAL FIX: Check for order_id (not login)
  const orderId = params?.account?.order_id;
                          
  if (!orderId) {
    console.log('❌ No order_id provided');
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      error: {
        code: -31050,
        message: { ru: 'Неверный account', en: 'Invalid account', uz: 'Noto\'g\'ri account' },
        data: 'order_id' // FIXED: Return correct field name
      }
    });
  }
  
  // For order_id, we don't need to validate against users
  // Just check if the amount is valid
  const validAmounts = Object.values(PAYMENT_AMOUNTS);
  if (!params?.amount || !validAmounts.includes(params.amount)) {
    console.log('❌ Invalid amount:', params?.amount);
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      error: {
        code: -31001,
        message: { ru: 'Неверная сумма', en: 'Invalid amount', uz: 'Noto\'g\'ri summa' }
      }
    });
  }
  
  console.log('✅ CheckPerformTransaction successful');
  return res.status(200).json({
    jsonrpc: '2.0',
    id: id,
    result: {
      allow: true,
      detail: { 
        receipt_type: 0,
        items: [{
          title: "ACED Subscription",
          price: params.amount,
          count: 1,
          code: "10899002001000000", // YOUR IKPU
          vat_percent: 0,
          package_code: "1"
        }]
      }
    }
  });
};

// ================================================
// CreateTransaction
// ================================================
const handleCreateTransaction = async (req, res, id, params) => {
  console.log('🔍 Processing CreateTransaction (CORRECTED)');
  
  // ✅ CORRECTED: Look for order_id
  const createOrderId = params?.account?.order_id;
  
  if (!createOrderId) {
    console.log('❌ No order_id provided in CreateTransaction');
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      error: {
        code: -31050,
        message: { 
          ru: 'Неверный account', 
          en: 'Invalid account', 
          uz: 'Noto\'g\'ri account' 
        },
        data: 'order_id'
      }
    });
  }
  
  // For order_id based accounts, we don't need extensive user validation
  // Just validate the transaction parameters
  
  const existingTransaction = sandboxTransactions.get(params?.id);
  if (existingTransaction) {
    console.log('✅ Transaction already exists:', params.id);
    return res.status(200).json({
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
  
  if (!params?.id || !params?.time || !params?.amount) {
    console.log('❌ Missing required parameters');
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      error: {
        code: -32602,
        message: { 
          ru: 'Неверные параметры', 
          en: 'Invalid params', 
          uz: 'Noto\'g\'ri parametrlar' 
        }
      }
    });
  }
  
  const validCreateAmounts = Object.values(PAYMENT_AMOUNTS);
  if (!validCreateAmounts.includes(params.amount)) {
    console.log('❌ Invalid amount:', params?.amount);
    return res.status(200).json({
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

  const newTransaction = {
    id: params.id,
    transaction: params.id.toString(),
    state: 1, // CREATED
    create_time: Date.now(),
    amount: params.amount,
    account: params.account,
    cancelled: false,
    perform_time: 0,
    cancel_time: 0,
    reason: null,
    receivers: null
  };
  
  sandboxTransactions.set(params.id, newTransaction);
  
  console.log('✅ CreateTransaction successful (CORRECTED)');
  
  return res.status(200).json({
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

// ================================================
// PerformTransaction
// ================================================
const handlePerformTransaction = async (req, res, id, params) => {
  console.log('🔍 Processing PerformTransaction for:', params?.id);
  
  if (!params?.id) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_PARAMS));
  }
  
  const performTransaction = findTransactionById(params.id);
  if (!performTransaction) {
    console.log('❌ Transaction not found:', params.id);
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.TRANSACTION_NOT_FOUND));
  }
  
  if (performTransaction.state < 0) {
    console.log('❌ Cannot perform cancelled transaction');
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION));
  }
  
  if (performTransaction.state === TransactionState.COMPLETED) {
    console.log('✅ Transaction already performed');
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      result: {
        transaction: performTransaction.transaction,
        perform_time: performTransaction.perform_time,
        state: performTransaction.state
      }
    });
  }
  
  const txAge = Date.now() - performTransaction.create_time;
  if (txAge > 12 * 60 * 60 * 1000) {
    console.log('❌ Transaction expired');
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION));
  }
  
  performTransaction.state = TransactionState.COMPLETED;
  performTransaction.perform_time = Date.now();
  console.log('✅ PerformTransaction successful');
  return res.status(200).json({
    jsonrpc: '2.0',
    id: id,
    result: {
      transaction: performTransaction.transaction,
      perform_time: performTransaction.perform_time,
      state: performTransaction.state
    }
  });
};

// ================================================
// CancelTransaction
// ================================================
const handleCancelTransaction = async (req, res, id, params) => {
  const cancelTransaction = findTransactionById(params?.id);
  if (!cancelTransaction) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.TRANSACTION_NOT_FOUND));
  }
  
  const originalState = cancelTransaction.state;
  if (cancelTransaction.state < 0) {
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id,
      result: {
        transaction: cancelTransaction.transaction,
        cancel_time: cancelTransaction.cancel_time,
        state: cancelTransaction.state
      }
    });
  }
  
  let newState, reason;
  if (originalState === TransactionState.CREATED) {
    newState = TransactionState.CANCELLED_AFTER_CREATE;
    reason = 3;
    cancelTransaction.perform_time = 0;
  } else if (originalState === TransactionState.COMPLETED) {
    newState = TransactionState.CANCELLED_AFTER_COMPLETE;
    reason = 5;
  } else {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.UNABLE_TO_PERFORM_OPERATION));
  }
  
  cancelTransaction.state = newState;
  cancelTransaction.cancel_time = Date.now();
  cancelTransaction.reason = reason;
  cancelTransaction.cancelled = true;
  
  return res.status(200).json({
    jsonrpc: '2.0',
    id: id,
    result: {
      transaction: cancelTransaction.transaction,
      cancel_time: cancelTransaction.cancel_time,
      state: cancelTransaction.state
    }
  });
};

// ================================================
// CheckTransaction
// ================================================
const handleCheckTransaction = async (req, res, id, params) => {
  if (!params?.id) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.INVALID_PARAMS));
  }
  
  const checkTransaction = findTransactionById(params.id);
  if (!checkTransaction) {
    return res.status(200).json(createErrorResponse(id, PaymeErrorCode.TRANSACTION_NOT_FOUND));
  }
  
  let result = {
    create_time: checkTransaction.create_time,
    perform_time: 0,
    cancel_time: 0,
    transaction: checkTransaction.transaction,
    state: checkTransaction.state,
    reason: null
  };
  
  switch (checkTransaction.state) {
    case TransactionState.CREATED:
      result.perform_time = 0;
      result.cancel_time = 0;
      result.reason = null;
      break;
    case TransactionState.COMPLETED:
      result.perform_time = checkTransaction.perform_time || Date.now();
      result.cancel_time = 0;
      result.reason = null;
      break;
    case TransactionState.CANCELLED_AFTER_CREATE:
      result.perform_time = 0;
      result.cancel_time = checkTransaction.cancel_time || Date.now();
      result.reason = checkTransaction.reason || 3;
      break;
    case TransactionState.CANCELLED_AFTER_COMPLETE:
      result.perform_time = checkTransaction.perform_time || Date.now();
      result.cancel_time = checkTransaction.cancel_time || Date.now();
      result.reason = checkTransaction.reason || 5;
      break;
  }
  
  return res.status(200).json({
    jsonrpc: '2.0',
    id: id,
    result: result
  });
};

// ================================================
// GetStatement
// ================================================
const handleGetStatement = async (req, res, id, params) => {
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
    jsonrpc: '2.0',
    id: id,
    result: {
      transactions: transactions
    }
  });
};

// ================================================
// ChangePassword
// ================================================
const handleChangePassword = async (req, res, id, params) => {
  console.log('✅ ChangePassword method called');
  return res.status(200).json({
    jsonrpc: '2.0',
    id: id,
    result: {
      success: true
    }
  });
};

// ✅ FIXED: Main payment initiation function
const initiatePaymePayment = async (req, res) => {
  try {
    const { userId, plan, additionalData = {}, method: requestMethod } = req.body;
    
    console.log('🚀 Backend payment initiation:', { userId, plan, additionalData, requestMethod });
    
    // ✅ VALIDATION: Clean inputs
    if (!userId || typeof userId !== 'string') {
      return safeErrorResponse(res, 400, 'Valid userId is required', 'Payment initiation');
    }
    
    if (!plan || !['start', 'pro'].includes(plan)) {
      return safeErrorResponse(res, 400, 'Valid plan (start or pro) is required', 'Payment initiation');
    }
    
    // ✅ ENVIRONMENT VALIDATION
    const merchantId = process.env.PAYME_MERCHANT_ID;
    
    if (!merchantId || merchantId === 'undefined') {
      console.error('❌ PAYME_MERCHANT_ID not properly set');
      return safeErrorResponse(res, 500, 'PayMe merchant configuration error', 'Payment initiation');
    }
    
    const amount = PAYMENT_AMOUNTS[plan];
    if (!amount) {
      return safeErrorResponse(res, 400, 'Invalid plan amount', 'Payment initiation');
    }
    
    // ✅ CLEAN ORDER ID GENERATION
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const baseOrderId = `aced${timestamp}${randomStr}`;
    const cleanOrderId = baseOrderId.replace(/[^a-zA-Z0-9]/g, '');
    
    console.log('🧹 Generated clean order ID:', cleanOrderId);
    
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction && merchantId) {
      const useGetMethod = requestMethod === 'get' || additionalData.useGetMethod;
      
      if (useGetMethod) {
        // ✅ CLEAN ACCOUNT DATA
        const accountData = {
          order_id: cleanOrderId
        };
        
        // ✅ CLEAN OPTIONS
        const urlOptions = {
          lang: (additionalData.lang === 'ru' || additionalData.lang === 'uz' || additionalData.lang === 'en') 
                ? additionalData.lang : 'ru',
          callback: additionalData.callback || 
                   `https://api.aced.live/api/payments/payme/return/success?transaction=${cleanOrderId}&userId=${userId}`,
          callback_timeout: Number(additionalData.callback_timeout) || 15000
        };
        
        console.log('🎯 Calling generatePaymeGetUrl with clean data:', {
          merchantId: merchantId.substring(0, 10) + '...',
          accountData,
          amount,
          urlOptions
        });
        
        const result = await generateDirectPaymeUrl(userId, plan, urlOptions);
        
        if (result.success) {
          // ✅ FINAL URL VALIDATION
          if (!result.paymentUrl || result.paymentUrl.includes('undefined') || result.paymentUrl.includes('[object Object]')) {
            throw new Error('Generated URL contains invalid data');
          }
          
          console.log('🔗 Production PayMe URL generated successfully');
          
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
          order_id: cleanOrderId,
          lang: additionalData.lang || 'ru',
          callback: additionalData.callback || 
                   `https://api.aced.live/api/payments/payme/return/success?transaction=${cleanOrderId}&userId=${userId}`,
          callback_timeout: Number(additionalData.callback_timeout) || 15000
        });
        
        if (result.success) {
          console.log('📝 Production PayMe form generated successfully');
          
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

const createDetailObject = (plan, amount) => {
  const detail = {
    receipt_type: 0,
    items: [{
      title: `ACED ${plan.toUpperCase()} Subscription`,
      price: amount,
      count: 1,
      code: "10899002001000000", // YOUR IKPU CODE
      vat_percent: 0,
      package_code: "1"
    }]
  };
  
  return Buffer.from(JSON.stringify(detail)).toString('base64');
};

// NEW: PayMe Test Integration Function - UPDATED
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
    const orderId = `${userId}_${plan}_${Date.now()}`;
    const merchantId = process.env.PAYME_MERCHANT_ID;
    
    // Create account data as per PayMe documentation
    const accountData = {
      order_id: orderId
    };
    
    // Test PayMe GET URL generation with proper format
    const getUrl = generatePaymeGetUrl(merchantId, accountData, amount, {
      lang: 'ru',
      callback: `https://api.aced.live/api/payments/payme/return/success?transaction=${orderId}`,
      callback_timeout: 15000
    });
    
    // Test PayMe POST format
    const postParams = new URLSearchParams({
      'merchant': merchantId,
      'amount': amount,
      'account[order_id]': orderId,
      'lang': 'ru',
      'callback': `https://api.aced.live/api/payments/payme/return/success?transaction=${orderId}`
    });
    const postUrl = `https://checkout.paycom.uz?${postParams.toString()}`;
    
    console.log('🧪 PayMe Test Integration:', {
      merchantId,
      orderId,
      amount,
      plan,
      accountData,
      getUrl,
      postUrl
    });
    
    // Simulate CheckPerformTransaction for testing
    const checkResult = await handleCheckPerformTransaction(
      { body: { method: 'CheckPerformTransaction' }, headers: {} },
      { status: () => ({ json: (data) => data }) },
      1,
      { amount: amount, account: accountData }
    );
    
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
// Sandbox utilities: Set account state and merchant key
// ================================================
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