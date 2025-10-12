const mongoose = require('mongoose');

const multicardTransactionSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true 
    },
    multicardUuid: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    invoiceId: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    },
    amount: { 
        type: Number, 
        required: true,
        comment: 'Amount in tiyin (1 UZS = 100 tiyin)'
    },
    plan: { 
        type: String, 
        required: true 
    },
    status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'canceled', 'refunded'],
        default: 'pending',
        index: true
    },
    checkoutUrl: { 
        type: String 
    },
    shortLink: {
        type: String,
        comment: 'Short link for QR code (production only)'
    },
    deeplink: {
        type: String,
        comment: 'Deep link for mobile apps'
    },
    webhookPayload: { 
        type: Object,
        comment: 'Full webhook payload from Multicard'
    },
    paymentDetails: {
        paymentAmount: Number,
        commissionAmount: Number,
        commissionType: {
            type: String,
            enum: ['up', 'down']
        },
        totalAmount: Number,
        ps: String, // Payment service: uzcard, humo, visa, etc.
        phone: String,
        cardPan: String,
        terminalId: String,
        merchantId: String,
        psUniqId: String, // RRN/RefNum
        psResponseCode: String,
        psResponseMsg: String,
        receiptUrl: String,
        paymentTime: Date,
    },
    errorCode: {
        type: String,
        comment: 'Error code from payment system'
    },
    errorMessage: {
        type: String,
        comment: 'Error message from payment system'
    },
    paidAt: { 
        type: Date 
    },
}, { timestamps: true });

// Index for finding pending transactions
multicardTransactionSchema.index({ status: 1, createdAt: -1 });
multicardTransactionSchema.index({ userId: 1, status: 1 });

const MulticardTransaction = mongoose.model('MulticardTransaction', multicardTransactionSchema);

module.exports = MulticardTransaction;