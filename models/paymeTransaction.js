// models/paymeTransaction.js - UPDATED with fiscal data support
const mongoose = require('mongoose');

// Transaction states (matching PayMe documentation)
const STATES = {
  STATE_CREATED: 1,                    // Transaction created, waiting for payment
  STATE_COMPLETED: 2,                  // Transaction completed successfully
  STATE_CANCELLED: -1,                 // Transaction cancelled before completion
  STATE_CANCELLED_AFTER_COMPLETE: -2  // Transaction cancelled after completion (refund)
};

// Cancellation reasons (matching PayMe documentation)
const REASONS = {
  REASON_RECIPIENTS_NOT_FOUND: 1,      // Recipients not found
  REASON_PROCESSING_EXECUTION_FAILED: 2, // Processing execution failed
  REASON_EXECUTION_FAILED: 3,          // Execution failed
  REASON_CANCELLED_BY_TIMEOUT: 4,      // Cancelled by timeout
  REASON_FUND_RETURNED: 5,             // Fund returned
  REASON_UNKNOWN: 10                   // Unknown reason
};

// Transaction timeout (12 hours in milliseconds)
const TIMEOUT = 43200000; // 12 hours

const paymeTransactionSchema = new mongoose.Schema({
  // PayMe transaction identifiers
  paycom_transaction_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // PayMe transaction time (as string for exact storage)
  paycom_time: {
    type: String,
    required: true
  },
  
  // PayMe transaction time as Date object
  paycom_time_datetime: {
    type: Date,
    required: true
  },
  
  // Transaction creation time in our system
  create_time: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  // Transaction performance time
  perform_time: {
    type: Date,
    default: null
  },
  
  // Transaction cancellation time
  cancel_time: {
    type: Date,
    default: null
  },
  
  // Transaction amount in tiyin
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Transaction state
  state: {
    type: Number,
    required: true,
    enum: Object.values(STATES),
    default: STATES.STATE_CREATED
  },
  
  // Cancellation reason (if cancelled)
  reason: {
    type: Number,
    enum: Object.values(REASONS),
    default: null
  },
  
  // Order information
  order_id: {
    type: Number,
    required: true,
    index: true
  },
  
  // User information
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
  
  // Request metadata
  user_agent: {
    type: String,
    default: null
  },
  
  ip_address: {
    type: String,
    default: null
  },
  
  // Receivers for chain payments (stored as JSON string)
  receivers: {
    type: String,
    default: null
  },
  
  // ✅ NEW: Fiscal data fields (for SetFiscalData method)
  fiscal_perform_data: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  
  fiscal_cancel_data: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  
  // Receipt ID for fiscal operations
  receipt_id: {
    type: String,
    default: null,
    index: true
  }
}, {
  timestamps: true,
  collection: 'payme_transactions'
});

// ✅ INDEXES for better performance
paymeTransactionSchema.index({ paycom_transaction_id: 1 });
paymeTransactionSchema.index({ order_id: 1 });
paymeTransactionSchema.index({ user_id: 1 });
paymeTransactionSchema.index({ create_time: 1 });
paymeTransactionSchema.index({ state: 1 });
paymeTransactionSchema.index({ receipt_id: 1 }, { sparse: true });

// ✅ STATIC METHODS

// Find transaction by PayMe transaction ID
paymeTransactionSchema.statics.findByPaymeId = function(paymeId) {
  return this.findOne({ paycom_transaction_id: paymeId });
};

// Find transaction by order ID
paymeTransactionSchema.statics.findByOrderId = function(orderId) {
  return this.findOne({ order_id: parseInt(orderId) });
};

// Get statement for a time period (for GetStatement method)
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

// Count today's payments for a user (for rate limiting)
paymeTransactionSchema.statics.countTodayPayments = function(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return this.countDocuments({
    user_id: userId,
    create_time: {
      $gte: today,
      $lt: tomorrow
    },
    state: { $in: [STATES.STATE_CREATED, STATES.STATE_COMPLETED] }
  });
};

// ✅ INSTANCE METHODS

// Check if transaction is expired
paymeTransactionSchema.methods.isExpired = function() {
  const now = Date.now();
  const createdTime = this.create_time.getTime();
  return (now - createdTime) >= TIMEOUT;
};

// Cancel transaction
paymeTransactionSchema.methods.cancel = async function(reason = REASONS.REASON_UNKNOWN) {
  if (this.state === STATES.STATE_COMPLETED) {
    this.state = STATES.STATE_CANCELLED_AFTER_COMPLETE;
  } else {
    this.state = STATES.STATE_CANCELLED;
  }
  
  this.reason = reason;
  this.cancel_time = new Date();
  
  return await this.save();
};

// Convert to PayMe response format (for CheckTransaction)
paymeTransactionSchema.methods.toPaymeResponse = function() {
  return {
    create_time: this.create_time.getTime(),
    perform_time: this.perform_time ? this.perform_time.getTime() : 0,
    cancel_time: this.cancel_time ? this.cancel_time.getTime() : 0,
    transaction: this._id.toString(),
    state: this.state,
    reason: this.reason
  };
};

// Convert to statement format (for GetStatement)
paymeTransactionSchema.methods.toStatementFormat = function() {
  const result = {
    id: this.paycom_transaction_id,
    time: parseInt(this.paycom_time),
    amount: this.amount,
    account: {
      order_id: this.order_id.toString()
    },
    create_time: this.create_time.getTime(),
    perform_time: this.perform_time ? this.perform_time.getTime() : 0,
    cancel_time: this.cancel_time ? this.cancel_time.getTime() : 0,
    transaction: this._id.toString(),
    state: this.state,
    reason: this.reason,
    receivers: this.receivers ? JSON.parse(this.receivers) : null
  };
  
  return result;
};

// Get fiscal data for receipt
paymeTransactionSchema.methods.getFiscalData = function(type) {
  if (type === 'PERFORM') {
    return this.fiscal_perform_data;
  } else if (type === 'CANCEL') {
    return this.fiscal_cancel_data;
  }
  return null;
};

// Set fiscal data
paymeTransactionSchema.methods.setFiscalData = async function(type, fiscalData) {
  if (type === 'PERFORM') {
    this.fiscal_perform_data = fiscalData;
  } else if (type === 'CANCEL') {
    this.fiscal_cancel_data = fiscalData;
  }
  
  // Set receipt ID if provided in fiscal data
  if (fiscalData && fiscalData.receipt_id) {
    this.receipt_id = fiscalData.receipt_id;
  }
  
  return await this.save();
};

// ✅ VIRTUAL FIELDS

// Virtual field for amount in UZS (for display)
paymeTransactionSchema.virtual('amount_uzs').get(function() {
  return this.amount / 100;
});

// Virtual field for formatted state
paymeTransactionSchema.virtual('state_name').get(function() {
  switch (this.state) {
    case STATES.STATE_CREATED:
      return 'created';
    case STATES.STATE_COMPLETED:
      return 'completed';
    case STATES.STATE_CANCELLED:
      return 'cancelled';
    case STATES.STATE_CANCELLED_AFTER_COMPLETE:
      return 'cancelled_after_complete';
    default:
      return 'unknown';
  }
});

// Virtual field for formatted reason
paymeTransactionSchema.virtual('reason_name').get(function() {
  if (!this.reason) return null;
  
  switch (this.reason) {
    case REASONS.REASON_RECIPIENTS_NOT_FOUND:
      return 'recipients_not_found';
    case REASONS.REASON_PROCESSING_EXECUTION_FAILED:
      return 'processing_execution_failed';
    case REASONS.REASON_EXECUTION_FAILED:
      return 'execution_failed';
    case REASONS.REASON_CANCELLED_BY_TIMEOUT:
      return 'cancelled_by_timeout';
    case REASONS.REASON_FUND_RETURNED:
      return 'fund_returned';
    case REASONS.REASON_UNKNOWN:
      return 'unknown';
    default:
      return 'unknown';
  }
});

// ✅ MIDDLEWARE

// Pre-save middleware for validation
paymeTransactionSchema.pre('save', function(next) {
  // Validate state transitions
  if (this.isModified('state')) {
    const validTransitions = {
      [STATES.STATE_CREATED]: [STATES.STATE_COMPLETED, STATES.STATE_CANCELLED],
      [STATES.STATE_COMPLETED]: [STATES.STATE_CANCELLED_AFTER_COMPLETE],
      [STATES.STATE_CANCELLED]: [], // No transitions from cancelled
      [STATES.STATE_CANCELLED_AFTER_COMPLETE]: [] // No transitions from cancelled after complete
    };
    
    if (this.isNew) {
      // New transaction, must start with STATE_CREATED
      if (this.state !== STATES.STATE_CREATED) {
        return next(new Error('New transaction must start with STATE_CREATED'));
      }
    } else {
      // Existing transaction, validate transition
      const originalState = this.$locals.original_state;
      if (originalState && !validTransitions[originalState].includes(this.state)) {
        return next(new Error(`Invalid state transition from ${originalState} to ${this.state}`));
      }
    }
  }
  
  // Set timestamps based on state
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

// Pre-findOneAndUpdate middleware to track original state
paymeTransactionSchema.pre('findOneAndUpdate', async function(next) {
  const docToUpdate = await this.model.findOne(this.getQuery());
  if (docToUpdate) {
    this.set('$locals.original_state', docToUpdate.state);
  }
  next();
});

// ✅ EXPORT WITH CONSTANTS
const PaymeTransaction = mongoose.model('PaymeTransaction', paymeTransactionSchema);

PaymeTransaction.STATES = STATES;
PaymeTransaction.REASONS = REASONS;
PaymeTransaction.TIMEOUT = TIMEOUT;

module.exports = PaymeTransaction;