const mongoose = require('mongoose');
const crypto = require('crypto');

// ✨ Enhanced constants with documentation
const STATES = {
  STATE_CREATED: 1,               // Initial state when transaction is created
  STATE_COMPLETED: 2,             // Successfully completed transaction
  STATE_CANCELLED: -1,            // Cancelled before completion
  STATE_CANCELLED_AFTER_COMPLETE: -2,  // Cancelled/refunded after completion
  STATE_PROCESSING: 3,            // ✨ New: Transaction is being processed
  STATE_FAILED: -3                // ✨ New: Transaction failed permanently
};

const REASONS = {
  REASON_RECIPIENTS_NOT_FOUND: 1,        // Recipients not found
  REASON_PROCESSING_EXECUTION_FAILED: 2,  // Processing execution failed
  REASON_EXECUTION_FAILED: 3,             // Execution failed
  REASON_CANCELLED_BY_TIMEOUT: 4,         // Cancelled by timeout
  REASON_FUND_RETURNED: 5,                // Fund returned
  REASON_USER_CANCELLED: 6,               // ✨ New: User initiated cancellation
  REASON_MERCHANT_CANCELLED: 7,           // ✨ New: Merchant initiated cancellation
  REASON_INSUFFICIENT_FUNDS: 8,           // ✨ New: Insufficient funds
  REASON_CARD_EXPIRED: 9,                // ✨ New: Card expired
  REASON_UNKNOWN: 10                     // Unknown reason
};

// ✨ New: Payment Types
const PAYMENT_TYPES = {
  SUBSCRIPTION: 'subscription',
  ONE_TIME: 'one_time',
  RECURRING: 'recurring'
};

// ✨ New: Subscription Plans with metadata
const SUBSCRIPTION_PLANS = {
  START: {
    code: 'start',
    displayName: 'Starter Plan',
    durationDays: 30,
    amount: 26000000 // 260,000 UZS in tiyin
  },
  PRO: {
    code: 'pro',
    displayName: 'Pro Plan',
    durationDays: 30,
    amount: 45500000 // 455,000 UZS in tiyin
  },
  PREMIUM: {  // ✨ New plan
    code: 'premium',
    displayName: 'Premium Plan',
    durationDays: 30,
    amount: 65000000 // 650,000 UZS in tiyin
  }
};

const TIMEOUT = 43200000; // 12 hours in milliseconds

const paymeTransactionSchema = new mongoose.Schema({
  // Core Transaction Info
  paycom_transaction_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  merchant_trans_id: {
    type: String,
    index: true,
    sparse: true,
    trim: true
  },
  
  // Time tracking
  paycom_time: {
    type: String,
    required: true
  },
  paycom_time_datetime: {
    type: Date,
    required: true
  },
  create_time: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  perform_time: {
    type: Date,
    default: null
  },
  cancel_time: {
    type: Date,
    default: null
  },
  last_retry_time: {
    type: Date,
    default: null
  },
  next_retry_time: {  // ✨ New: Schedule next retry
    type: Date,
    default: null
  },
  
  // Amount and Currency
  amount: {
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'Amount must be an integer (in tiyins)'
    }
  },
  currency: {  // ✨ New: Support for multiple currencies
    type: String,
    default: 'UZS',
    enum: ['UZS', 'USD'],
    uppercase: true
  },
  
  // Status tracking
  state: {
    type: Number,
    required: true,
    enum: Object.values(STATES),
    default: STATES.STATE_CREATED,
    index: true
  },
  reason: {
    type: Number,
    enum: Object.values(REASONS),
    default: null
  },
  
  // Error handling
  error_code: {
    type: Number,
    default: null
  },
  error_message: {
    type: String,
    trim: true,
    default: null
  },
  retry_count: {
    type: Number,
    default: 0,
    min: 0
  },
  max_retries: {  // ✨ New: Configure max retries per transaction
    type: Number,
    default: 3,
    min: 0
  },
  
  // Order and User Info
  login: {
    type: Number,
    required: true,
    index: true
  },
  user_id: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  
  // Payment Details
  payment_type: {  // ✨ New: Type of payment
    type: String,
    enum: Object.values(PAYMENT_TYPES),
    required: true,
    default: PAYMENT_TYPES.ONE_TIME
  },
  subscription_plan: {
    type: String,
    enum: Object.keys(SUBSCRIPTION_PLANS).map(key => SUBSCRIPTION_PLANS[key].code),
    required: function() {
      return this.payment_type === PAYMENT_TYPES.SUBSCRIPTION;
    }
  },
  
  // Card Info (masked)
  card_info: {
    masked_pan: String,  // Last 4 digits only
    expiry: String,      // MM/YY format
    card_type: String,   // VISA, MASTERCARD, etc.
    issuer_bank: String
  },
  
  // Request metadata
  user_agent: {
    type: String,
    default: null
  },
  ip_address: {
    type: String,
    default: null
  },
  device_info: {  // ✨ New: Enhanced device tracking
    type: {
      platform: String,
      browser: String,
      device_type: String,
      os: String
    },
    default: null
  },
  
  // Transaction metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Fiscal data
  fiscal_perform_data: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  fiscal_cancel_data: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  receipt_id: {
    type: String,
    default: null,
    index: true,
    trim: true
  },
  
  // Chain payment support
  receivers: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: 'payme_transactions'
});

// ✨ Enhanced indexes
paymeTransactionSchema.index({ paycom_transaction_id: 1 });
paymeTransactionSchema.index({ login: 1 });
paymeTransactionSchema.index({ user_id: 1 });
paymeTransactionSchema.index({ create_time: 1 });
paymeTransactionSchema.index({ state: 1 });
paymeTransactionSchema.index({ receipt_id: 1 }, { sparse: true });
paymeTransactionSchema.index({ merchant_trans_id: 1 }, { sparse: true });
paymeTransactionSchema.index({ 'card_info.masked_pan': 1 }, { sparse: true });
paymeTransactionSchema.index({ payment_type: 1, subscription_plan: 1 }, { sparse: true });

// ✨ Enhanced Virtuals
paymeTransactionSchema.virtual('amount_uzs').get(function() {
  return this.amount / 100;
});

paymeTransactionSchema.virtual('state_name').get(function() {
  const stateNames = {
    [STATES.STATE_CREATED]: 'created',
    [STATES.STATE_COMPLETED]: 'completed',
    [STATES.STATE_CANCELLED]: 'cancelled',
    [STATES.STATE_CANCELLED_AFTER_COMPLETE]: 'cancelled_after_complete',
    [STATES.STATE_PROCESSING]: 'processing',
    [STATES.STATE_FAILED]: 'failed'
  };
  return stateNames[this.state] || 'unknown';
});

paymeTransactionSchema.virtual('can_retry').get(function() {
  return this.retry_count < this.max_retries && 
         [STATES.STATE_FAILED, STATES.STATE_PROCESSING].includes(this.state);
});

// ✨ Enhanced Static Methods
paymeTransactionSchema.statics.findByPaymeId = function(paymeId) {
  return this.findOne({ paycom_transaction_id: paymeId });
};

paymeTransactionSchema.statics.findByOrderId = function(orderId) {
  return this.findOne({ login: parseInt(orderId) });
};

paymeTransactionSchema.statics.getStatement = function(from, to) {
  const fromDate = new Date(parseInt(from));
  const toDate = new Date(parseInt(to));
  
  return this.find({
    paycom_time_datetime: {
      $gte: fromDate,
      $lte: toDate
    }
  }).sort({ paycom_time_datetime: 1 });
};

paymeTransactionSchema.statics.getUserTransactions = function(userId, options = {}) {
  const query = { user_id: userId };
  
  if (options.state) {
    query.state = options.state;
  }
  
  if (options.from) {
    query.create_time = { $gte: new Date(options.from) };
  }
  
  if (options.to) {
    query.create_time = { ...query.create_time, $lte: new Date(options.to) };
  }
  
  return this.find(query)
             .sort({ create_time: -1 })
             .limit(options.limit || 50)
             .skip(options.skip || 0);
};

// ✨ Enhanced Instance Methods
paymeTransactionSchema.methods.isExpired = function() {
  const now = Date.now();
  const createdTime = this.create_time.getTime();
  return (now - createdTime) >= TIMEOUT;
};

paymeTransactionSchema.methods.cancel = async function(reason = REASONS.REASON_UNKNOWN) {
  if (this.state === STATES.STATE_COMPLETED) {
    this.state = STATES.STATE_CANCELLED_AFTER_COMPLETE;
  } else {
    this.state = STATES.STATE_CANCELLED;
  }
  
  this.reason = reason;
  this.cancel_time = new Date();
  
  // ✨ Add fiscal cancel data if needed
  if (this.fiscal_perform_data) {
    // Implementation for fiscal cancel data
  }
  
  return await this.save();
};

paymeTransactionSchema.methods.setError = async function(code, message) {
  this.error_code = code;
  this.error_message = message;
  this.last_retry_time = new Date();
  
  if (this.retry_count >= this.max_retries) {
    this.state = STATES.STATE_FAILED;
  }
  
  return await this.save();
};

paymeTransactionSchema.methods.retry = async function() {
  if (!this.can_retry) {
    throw new Error('Maximum retry attempts reached or transaction cannot be retried');
  }
  
  this.retry_count += 1;
  this.last_retry_time = new Date();
  this.state = STATES.STATE_PROCESSING;
  this.next_retry_time = new Date(Date.now() + (Math.pow(2, this.retry_count) * 60000)); // Exponential backoff
  
  return await this.save();
};

paymeTransactionSchema.methods.setMetadata = async function(key, value) {
  if (!this.metadata) this.metadata = {};
  this.metadata[key] = value;
  return await this.save();
};

paymeTransactionSchema.methods.toPaymeResponse = function() {
  return {
    create_time: this.create_time.getTime(),
    perform_time: this.perform_time ? this.perform_time.getTime() : 0,
    cancel_time: this.cancel_time ? this.cancel_time.getTime() : 0,
    transaction: this._id.toString(),
    state: this.state,
    reason: this.reason,
    receivers: this.receivers ? JSON.parse(this.receivers) : null
  };
};

// ✨ Enhanced Middleware
paymeTransactionSchema.pre('save', function(next) {
  // Validate state transitions
  if (this.isModified('state')) {
    const validTransitions = {
      [STATES.STATE_CREATED]: [STATES.STATE_COMPLETED, STATES.STATE_CANCELLED, STATES.STATE_PROCESSING],
      [STATES.STATE_PROCESSING]: [STATES.STATE_COMPLETED, STATES.STATE_FAILED, STATES.STATE_CANCELLED],
      [STATES.STATE_COMPLETED]: [STATES.STATE_CANCELLED_AFTER_COMPLETE],
      [STATES.STATE_FAILED]: [STATES.STATE_PROCESSING],
      [STATES.STATE_CANCELLED]: [],
      [STATES.STATE_CANCELLED_AFTER_COMPLETE]: []
    };
    
    if (this.isNew) {
      if (this.state !== STATES.STATE_CREATED && this.state !== STATES.STATE_PROCESSING) {
        return next(new Error('New transaction must start with STATE_CREATED or STATE_PROCESSING'));
      }
    } else {
      const originalState = this.$locals.original_state;
      if (originalState && !validTransitions[originalState].includes(this.state)) {
        return next(new Error(`Invalid state transition from ${originalState} to ${this.state}`));
      }
    }
  }
  
  // Update timestamps based on state
  if (this.isModified('state')) {
    if (this.state === STATES.STATE_COMPLETED && !this.perform_time) {
      this.perform_time = new Date();
    }
    if ((this.state === STATES.STATE_CANCELLED || this.state === STATES.STATE_CANCELLED_AFTER_COMPLETE) && !this.cancel_time) {
      this.cancel_time = new Date();
    }
  }
  
  next();
});

// =============================================
// 💰 PAYME API INTEGRATION CLASS - ADDED TO MODEL
// =============================================

class PaymeAPI {
  constructor() {
    // ✅ These should come from environment variables
    this.merchantId = process.env.PAYME_MERCHANT_ID || 'your_merchant_id';
    this.secretKey = process.env.PAYME_SECRET_KEY || 'your_secret_key';
    this.checkoutUrl = process.env.PAYME_CHECKOUT_URL || 'https://checkout.paycom.uz';
    this.testMode = process.env.PAYME_TEST_MODE === 'true';
    
    // Use test URLs if in test mode
    if (this.testMode) {
      this.checkoutUrl = 'https://test.paycom.uz';
    }
  }

  /**
   * Generate PayMe checkout URL using GET method.
   *
   * This method builds URL parameters by appending individual account fields
   * with an "ac." prefix. For example, if options.login is provided, the parameter
   * "ac.login" will be included.
   *
   * Example Data:
   * m=587f72c72cac0d162c722ae2
   * ac.login=197
   * a=500
   *
   * Resulting URL (after base64 encoding):
   * https://checkout.paycom.uz/{base64EncodedParameters}
   */
  generateGetUrl(userId, plan, options = {}) {
    try {
      const amount = this.getPlanAmount(plan);
      
      // Build parameters according to PayMe documentation.
      const params = {
        m: this.merchantId,
        a: amount,
        l: options.lang || 'ru',
        c: options.callback || `${process.env.FRONTEND_URL}/payment/success`,
        ct: options.callback_timeout || 15000,
        cr: 'UZS'
      };
  
      // Ensure account login is a string. If it's not provided or not a string, default to userId.
      const loginValue = (options.login !== undefined && options.login !== null)
        ? (typeof options.login === 'string' ? options.login : String(options.login))
        : String(userId);
      const accountParams = { login: loginValue };
  
      // Append account fields with the "ac." prefix.
      Object.keys(accountParams).forEach(key => {
        if (accountParams[key] !== undefined && accountParams[key] !== null) {
          params[`ac.${key}`] = accountParams[key];
        }
      });
  
      console.log('🔗 GET URL params:', params);
  
      // Construct parameter string separated by semicolons.
      const paramString = Object.keys(params)
        .map(key => `${key}=${params[key]}`)
        .join(';');
  
      // Encode parameters in base64 as required by PayMe GET method.
      const encodedParams = Buffer.from(paramString).toString('base64');
      const fullUrl = `${this.checkoutUrl}/${encodedParams}`;
  
      console.log('✅ Generated PayMe GET URL:', fullUrl);
      return fullUrl;
  
    } catch (error) {
      console.error('❌ Error generating GET URL:', error);
      throw new Error('Failed to generate payment URL');
    }
  }
  /**
   * Generate PayMe form HTML for POST method
   */
  generatePostForm(userId, plan, options = {}) {
    try {
      const amount = this.getPlanAmount(plan);
      
      // Ensure account login is a string.
      const loginValue = (options.login !== undefined && options.login !== null)
        ? (typeof options.login === 'string' ? options.login : String(options.login))
        : String(userId);
      const accountParams = { login: loginValue };

      const formFields = [
        { name: 'merchant', value: this.merchantId },
        { name: 'amount', value: amount },
        { name: 'lang', value: options.lang || 'ru' },
        { name: 'callback', value: options.callback || `${process.env.FRONTEND_URL}/payment/success` },
        { name: 'callback_timeout', value: options.callback_timeout || 15000 },
        { name: 'description', value: `Payment for ${plan} plan - User ${userId}` }
      ];

      // Add account field with proper format
      Object.keys(accountParams).forEach(key => {
        if (accountParams[key]) {
          formFields.push({
            name: `account[${key}]`,
            value: accountParams[key]
          });
        }
      });

      const formHtml = `
        <form id="payme-form" method="POST" action="${this.checkoutUrl}" style="display: none;">
          ${formFields.map(field => `<input type="hidden" name="${field.name}" value="${field.value}" />`).join('\n          ')}
          <button type="submit">Pay with PayMe</button>
        </form>
        <script>
          setTimeout(function() {
            document.getElementById('payme-form').submit();
          }, 2000);
        </script>
      `;
      console.log('📝 Generated PayMe POST form');
      return formHtml;

    } catch (error) {
      console.error('❌ Error generating POST form:', error);
      throw new Error('Failed to generate payment form');
    }
  }

  /**
   * Generate PayMe button HTML
   */
  generateButton(userId, plan, options = {}) {
    try {
      const paymentUrl = this.generateGetUrl(userId, plan, options);
      const buttonHtml = `
        <div>
          <a href="${paymentUrl}" target="_blank" rel="noopener noreferrer">
            <img src="https://cdn.payme.uz/payme-logos/logo/favicon/favicon-business.svg" alt="PayMe" width="24" height="24">
            Pay with PayMe
          </a>
        </div>
      `;
      return buttonHtml;
    } catch (error) {
      console.error('❌ Error generating button:', error);
      throw new Error('Failed to generate payment button');
    }
  }

  /**
   * Generate QR code HTML for mobile payments
   */
  generateQR(userId, plan, options = {}) {
    try {
      const paymentUrl = this.generateGetUrl(userId, plan, options);
      const qrWidth = options.qrWidth || 250;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrWidth}x${qrWidth}&data=${encodeURIComponent(paymentUrl)}`;
      const qrHtml = `
        <div>
          <div>
            <h3>Scan to Pay with PayMe</h3>
            <p>Open PayMe app and scan this QR code</p>
          </div>
          <div>
            <img src="${qrCodeUrl}" alt="PayMe QR Code" width="${qrWidth}" height="${qrWidth}">
          </div>
          <div>
            <p><strong>Amount:</strong> ${this.formatAmount(this.getPlanAmount(plan))}</p>
            <p><strong>Plan:</strong> ${plan}</p>
            <a href="${paymentUrl}">Or pay via web browser</a>
          </div>
        </div>
      `;
      return qrHtml;
    } catch (error) {
      console.error('❌ Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Get amount in tiyin for a plan
   */
  getPlanAmount(plan) {
    const planData = Object.values(SUBSCRIPTION_PLANS).find(p => p.code === plan);
    if (!planData) {
      throw new Error(`Invalid plan: ${plan}`);
    }
    return planData.amount;
  }

  /**
   * Format amount for display
   */
  formatAmount(amountInTiyin) {
    const uzs = Math.floor(amountInTiyin / 100);
    return new Intl.NumberFormat('uz-UZ', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(uzs) + ' UZS';
  }

  /**
   * Validate PayMe callback/webhook
   */
  validateCallback(data, signature) {
    try {
      const expectedSignature = crypto
        .createHmac('sha1', this.secretKey)
        .update(JSON.stringify(data))
        .digest('hex');
      return signature === expectedSignature;
    } catch (error) {
      console.error('❌ Error validating callback:', error);
      return false;
    }
  }
}

// Attach PaymeAPI as a static property to the model
paymeTransactionSchema.statics.PaymeAPI = PaymeAPI;

// Export model with constants
const PaymeTransaction = mongoose.model('PaymeTransaction', paymeTransactionSchema);

PaymeTransaction.STATES = STATES;
PaymeTransaction.REASONS = REASONS;
PaymeTransaction.TIMEOUT = TIMEOUT;
PaymeTransaction.PAYMENT_TYPES = PAYMENT_TYPES;
PaymeTransaction.SUBSCRIPTION_PLANS = SUBSCRIPTION_PLANS;

module.exports = PaymeTransaction;