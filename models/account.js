// models/account.js
const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  accountNumber: {
    type: String,
    required: true,
    unique: true,
    index: true,
    uppercase: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0,
    // Store in tiyin (1 UZS = 100 tiyin)
    get: v => Math.round(v),
    set: v => Math.round(v)
  },
  currency: {
    type: String,
    default: 'UZS',
    enum: ['UZS', 'USD']
  },
  status: {
    type: String,
    enum: ['active', 'blocked', 'suspended', 'processing'],
    default: 'active'
  },
  type: {
    type: String,
    enum: ['personal', 'business', 'savings'],
    default: 'personal'
  },
  metadata: {
    email: String,
    phone: String,
    name: String
  },
  transactions: [{
    transactionId: {
      type: String,
      required: true,
      index: true
    },
    paymeTransactionId: String,
    amount: Number,
    type: {
      type: String,
      enum: ['credit', 'debit', 'pending'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled', 'refunded'],
      default: 'pending'
    },
    description: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    performTime: Date,
    cancelTime: Date,
    reason: Number
  }],
  lastActivity: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance
accountSchema.index({ accountNumber: 1, status: 1 });
accountSchema.index({ userId: 1, status: 1 });
accountSchema.index({ 'transactions.transactionId': 1 });

// Generate unique account number
accountSchema.statics.generateAccountNumber = async function() {
  let accountNumber;
  let exists = true;
  
  while (exists) {
    // Format: ACC + Year + Month + Random 6 digits
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(100000 + Math.random() * 900000);
    accountNumber = `ACC${year}${month}${random}`;
    
    // Check if already exists
    exists = await this.findOne({ accountNumber });
  }
  
  return accountNumber;
};

// Create account for new user
accountSchema.statics.createAccountForUser = async function(userId, userData = {}) {
  const accountNumber = await this.generateAccountNumber();
  
  const account = new this({
    accountNumber,
    userId,
    metadata: {
      email: userData.email,
      phone: userData.phone,
      name: userData.name
    }
  });
  
  await account.save();
  return account;
};

// Find account by various methods
accountSchema.statics.findByIdentifier = async function(identifier) {
  if (!identifier) return null;
  
  // Try to find by account number first
  let account = await this.findOne({ 
    accountNumber: identifier.toUpperCase(),
    status: { $ne: 'suspended' }
  });
  
  if (account) return account;
  
  // Try to find by user ID
  if (identifier.match(/^[a-f\d]{24}$/i)) {
    account = await this.findOne({ 
      userId: identifier,
      status: { $ne: 'suspended' }
    });
    if (account) return account;
  }
  
  // Try to find by email or phone in metadata
  account = await this.findOne({
    $or: [
      { 'metadata.email': identifier },
      { 'metadata.phone': identifier }
    ],
    status: { $ne: 'suspended' }
  });
  
  return account;
};

// Check if account can receive payment
accountSchema.methods.canReceivePayment = function(amount) {
  if (this.status !== 'active') {
    return { 
      allowed: false, 
      reason: `Account is ${this.status}`,
      code: this.status === 'blocked' ? -31051 : -31052
    };
  }
  
  // Check for any pending transactions
  const hasPendingTransaction = this.transactions.some(
    tx => tx.status === 'pending' && tx.type === 'credit'
  );
  
  if (hasPendingTransaction && this.status === 'processing') {
    return {
      allowed: false,
      reason: 'Account has pending transaction',
      code: -31052
    };
  }
  
  return { allowed: true };
};

// Add transaction to account
accountSchema.methods.addTransaction = async function(transactionData) {
  this.transactions.push({
    transactionId: transactionData.id,
    paymeTransactionId: transactionData.paymeId,
    amount: transactionData.amount,
    type: 'credit',
    status: 'pending',
    description: transactionData.description || 'Payment via PayMe',
    timestamp: new Date()
  });
  
  this.lastActivity = new Date();
  await this.save();
  
  return this.transactions[this.transactions.length - 1];
};

// Complete transaction
accountSchema.methods.completeTransaction = async function(transactionId) {
  const transaction = this.transactions.find(tx => tx.transactionId === transactionId);
  
  if (!transaction) {
    throw new Error('Transaction not found in account');
  }
  
  if (transaction.status === 'completed') {
    return transaction; // Already completed
  }
  
  transaction.status = 'completed';
  transaction.performTime = new Date();
  
  // Update balance
  if (transaction.type === 'credit') {
    this.balance += transaction.amount;
  } else if (transaction.type === 'debit') {
    this.balance -= transaction.amount;
  }
  
  this.lastActivity = new Date();
  await this.save();
  
  return transaction;
};

// Cancel transaction
accountSchema.methods.cancelTransaction = async function(transactionId, reason) {
  const transaction = this.transactions.find(tx => tx.transactionId === transactionId);
  
  if (!transaction) {
    throw new Error('Transaction not found in account');
  }
  
  const wasCompleted = transaction.status === 'completed';
  
  transaction.status = wasCompleted ? 'refunded' : 'cancelled';
  transaction.cancelTime = new Date();
  transaction.reason = reason;
  
  // If was completed, refund the amount
  if (wasCompleted && transaction.type === 'credit') {
    this.balance -= transaction.amount;
  }
  
  this.lastActivity = new Date();
  await this.save();
  
  return transaction;
};

// Update timestamp on save
accountSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Account', accountSchema);