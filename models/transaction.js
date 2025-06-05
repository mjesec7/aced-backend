// models/transaction.js

const mongoose = require('mongoose');
const { Schema } = mongoose;

const transactionSchema = new Schema({
  paymeId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: 'The Payme `id` field from the JSON-RPC call'
  },
  transaction: {
    type: String,
    required: true,
    description: 'The transaction number assigned by Payme (e.g. "123456")'
  },
  accountLogin: {
    type: String,
    required: true,
    description: 'The Payme account login (e.g. user identifier or phone).'
  },
  amount: {
    type: Number,
    required: true,
    description: 'Amount in tiyin (e.g. 260000 for 26,000 UZS).'
  },
  state: {
    type: Number,
    required: true,
    enum: [1, 2, -1],
    description: '1 = Created, 2 = Performed, -1 = Canceled'
  },
  createTime: {
    type: Date,
    required: true,
    description: 'Timestamp when transaction was created'
  },
  performTime: {
    type: Date,
    default: null,
    description: 'Timestamp when transaction was performed (if state=2)'
  },
  cancelTime: {
    type: Date,
    default: null,
    description: 'Timestamp when transaction was canceled (if state=-1)'
  },
  reason: {
    type: Number,
    default: null,
    description: 'Error or cancellation code sent by Payme (e.g. 10)'
  },
  fiscalPerform: {
    type: Schema.Types.Mixed,
    default: null,
    description: 'Fiscal data returned during SetFiscalData after perform (if any)'
  },
  fiscalCancel: {
    type: Schema.Types.Mixed,
    default: null,
    description: 'Fiscal data returned during SetFiscalData after cancel (if any)'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Transaction', transactionSchema);
