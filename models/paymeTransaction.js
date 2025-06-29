// models/paymeTransaction.js - EXACT REPLICA OF PHP TEMPLATE STRUCTURE
const mongoose = require('mongoose');

// Transaction states matching PHP template exactly
const TRANSACTION_STATES = {
  STATE_CREATED: 1,
  STATE_COMPLETED: 2,
  STATE_CANCELLED: -1,
  STATE_CANCELLED_AFTER_COMPLETE: -2
};

// Cancellation reasons matching PHP template
const CANCELLATION_REASONS = {
  REASON_RECEIVERS_NOT_FOUND: 1,
  REASON_PROCESSING_EXECUTION_FAILED: 2,
  REASON_EXECUTION_FAILED: 3,
  REASON_CANCELLED_BY_TIMEOUT: 4,
  REASON_FUND_RETURNED: 5,
  REASON_UNKNOWN: 10
};

const paymeTransactionSchema = new mongoose.Schema({
  // ✅ EXACT FIELDS FROM PHP TEMPLATE
  
  // PayMe transaction ID (VARCHAR(25) in PHP)
  paycom_transaction_id: {
    type: String,
    required: true,
    unique: true,
    maxlength: 25,
    index: true
  },
  
  // PayMe time as string (VARCHAR(13) in PHP)
  paycom_time: {
    type: String,
    required: true,
    maxlength: 13
  },
  
  // PayMe time as datetime (DATETIME in PHP)
  paycom_time_datetime: {
    type: Date,
    required: true
  },
  
  // Create time (DATETIME in PHP)
  create_time: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Perform time (DATETIME NULL in PHP)
  perform_time: {
    type: Date,
    default: null
  },
  
  // Cancel time (DATETIME NULL in PHP)
  cancel_time: {
    type: Date,
    default: null
  },
  
  // Amount in tiyin (INT(11) in PHP)
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Transaction state (TINYINT(2) in PHP)
  state: {
    type: Number,
    required: true,
    enum: [
      TRANSACTION_STATES.STATE_CREATED,
      TRANSACTION_STATES.STATE_COMPLETED,
      TRANSACTION_STATES.STATE_CANCELLED,
      TRANSACTION_STATES.STATE_CANCELLED_AFTER_COMPLETE
    ],
    default: TRANSACTION_STATES.STATE_CREATED
  },
  
  // Cancellation reason (TINYINT(2) NULL in PHP)
  reason: {
    type: Number,
    default: null,
    enum: [
      null,
      CANCELLATION_REASONS.REASON_RECEIVERS_NOT_FOUND,
      CANCELLATION_REASONS.REASON_PROCESSING_EXECUTION_FAILED,
      CANCELLATION_REASONS.REASON_EXECUTION_FAILED,
      CANCELLATION_REASONS.REASON_CANCELLED_BY_TIMEOUT,
      CANCELLATION_REASONS.REASON_FUND_RETURNED,
      CANCELLATION_REASONS.REASON_UNKNOWN
    ]
  },
  
  // Receivers JSON (VARCHAR(500) in PHP)
  receivers: {
    type: String, // JSON string, exactly like PHP template
    default: null,
    maxlength: 500
  },
  
  // Order ID (INT(11) in PHP) - CRITICAL for PayMe
  order_id: {
    type: Number,
    required: true,
    index: true
  },
  
  // ✅ ADDITIONAL FIELDS FOR YOUR BUSINESS LOGIC
  
  // User identification
  user_id: {
    type: String,
    required: true,
    index: true
  },
  
  // Subscription plan
  subscription_plan: {
    type: String,
    enum: ['start', 'pro'],
    required: true
  },
  
  // Audit fields
  user_agent: String,
  ip_address: String
  
}, {
  timestamps: false, // We manage our own timestamps like PHP template
  collection: 'payme_transactions'
});

// ✅ INDEXES FOR PERFORMANCE (matching PHP template PRIMARY KEY)
paymeTransactionSchema.index({ paycom_transaction_id: 1 }, { unique: true });
paymeTransactionSchema.index({ order_id: 1 });
paymeTransactionSchema.index({ user_id: 1 });
paymeTransactionSchema.index({ state: 1 });

// ✅ STATIC METHODS (matching PHP template methods)

// Find transaction by PayMe transaction ID (PHP: find by id)
paymeTransactionSchema.statics.findByPaymeId = function(paycom_transaction_id) {
  return this.findOne({ paycom_transaction_id });
};

// Find transaction by order ID (PHP: find by account.order_id)
paymeTransactionSchema.statics.findByOrderId = function(order_id) {
  return this.findOne({ 
    order_id: parseInt(order_id),
    state: { $in: [TRANSACTION_STATES.STATE_CREATED, TRANSACTION_STATES.STATE_COMPLETED] }
  });
};

// Get statement report (PHP: report method)
paymeTransactionSchema.statics.getStatement = function(from_date, to_date) {
  const fromDate = new Date(parseInt(from_date));
  const toDate = new Date(parseInt(to_date));
  
  return this.find({
    paycom_time_datetime: {
      $gte: fromDate,
      $lte: toDate
    }
  }).sort({ paycom_time_datetime: 1 });
};

// ✅ INSTANCE METHODS (matching PHP template methods)

// Check if transaction is expired (PHP: isExpired method)
paymeTransactionSchema.methods.isExpired = function() {
  const TIMEOUT = 43200000; // 12 hours in milliseconds (PHP: TIMEOUT constant)
  if (this.state !== TRANSACTION_STATES.STATE_CREATED) {
    return false;
  }
  const now = Date.now();
  const createTime = this.create_time.getTime();
  return Math.abs(now - createTime) > TIMEOUT;
};

// Cancel transaction (PHP: cancel method)
paymeTransactionSchema.methods.cancel = function(reason) {
  this.cancel_time = new Date();
  
  // Set state based on current state (exactly like PHP template)
  if (this.state === TRANSACTION_STATES.STATE_COMPLETED) {
    // Scenario: CreateTransaction -> PerformTransaction -> CancelTransaction
    this.state = TRANSACTION_STATES.STATE_CANCELLED_AFTER_COMPLETE;
  } else {
    // Scenario: CreateTransaction -> CancelTransaction
    this.state = TRANSACTION_STATES.STATE_CANCELLED;
  }
  
  this.reason = reason || CANCELLATION_REASONS.REASON_UNKNOWN;
  
  return this.save();
};

// Convert to PayMe response format (for JSON-RPC responses)
paymeTransactionSchema.methods.toPaymeResponse = function() {
  return {
    create_time: this.create_time.getTime(),
    perform_time: this.perform_time ? this.perform_time.getTime() : 0,
    cancel_time: this.cancel_time ? this.cancel_time.getTime() : 0,
    transaction: this.id.toString(), // Internal transaction ID
    state: this.state,
    reason: this.reason
  };
};

// Convert to statement format (for GetStatement method)
paymeTransactionSchema.methods.toStatementFormat = function() {
  return {
    id: this.paycom_transaction_id, // PayMe transaction ID
    time: parseInt(this.paycom_time),
    amount: this.amount,
    account: {
      order_id: this.order_id,
      user_id: this.user_id
    },
    create_time: this.create_time.getTime(),
    perform_time: this.perform_time ? this.perform_time.getTime() : 0,
    cancel_time: this.cancel_time ? this.cancel_time.getTime() : 0,
    transaction: this.id.toString(),
    state: this.state,
    reason: this.reason,
    receivers: this.receivers ? JSON.parse(this.receivers) : null
  };
};

// Export constants along with model
const PaymeTransaction = mongoose.model('PaymeTransaction', paymeTransactionSchema);

PaymeTransaction.STATES = TRANSACTION_STATES;
PaymeTransaction.REASONS = CANCELLATION_REASONS;
PaymeTransaction.TIMEOUT = 43200000; // 12 hours

module.exports = PaymeTransaction;