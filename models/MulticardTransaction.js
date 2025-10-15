const mongoose = require('mongoose');

const multicardTransactionSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true 
    },
    
    // Type of transaction
    transactionType: {
        type: String,
        enum: ['payment', 'card_binding'],
        default: 'payment',
        index: true
    },
    
    // For payments
    multicardUuid: { 
        type: String, 
        index: true 
    },
    invoiceId: { 
        type: String, 
        index: true 
    },
    amount: { 
        type: Number,
        comment: 'Amount in tiyin (1 UZS = 100 tiyin)'
    },
    plan: { 
        type: String
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
    
    // For card binding
    sessionId: {
        type: String,
        index: true,
        comment: 'Card binding session ID (also called payer_id)'
    },
    formUrl: {
        type: String,
        comment: 'URL where user enters card details'
    },
    redirectUrl: {
        type: String,
        comment: 'Where to redirect after success'
    },
    redirectDeclineUrl: {
        type: String,
        comment: 'Where to redirect after decline/cancel'
    },
    callbackUrl: {
        type: String,
        comment: 'Backend URL to receive callback'
    },
    expiresAt: { 
        type: Date,
        comment: 'Session expires in 15 minutes (for card binding)'
    },
    
    // Common fields
    status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'canceled', 'refunded', 'active', 'expired'],
        default: 'pending',
        index: true
    },
    
    webhookPayload: { 
        type: Object,
        comment: 'Full webhook/callback payload from Multicard'
    },
    
    // Card details (for both payment and binding)
    cardToken: {
        type: String,
        comment: 'Token to use for payments'
    },
    cardPan: {
        type: String,
        comment: 'Masked card number'
    },
    ps: {
        type: String,
        comment: 'Payment system: uzcard, humo, visa, mastercard, unionpay'
    },
    phone: {
        type: String,
        comment: 'Card holder phone'
    },
    holderName: {
        type: String,
        comment: 'Card holder name'
    },
    pinfl: {
        type: String,
        comment: 'PINFL for Uzcard/Humo'
    },
    
    paymentDetails: {
        paymentAmount: Number,
        commissionAmount: Number,
        commissionType: {
            type: String,
            enum: ['up', 'down']
        },
        totalAmount: Number,
        terminalId: String,
        merchantId: String,
        psUniqId: String, // RRN/RefNum
        psResponseCode: String,
        psResponseMsg: String,
        receiptUrl: String,
        paymentTime: Date,
        otpHash: String,
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
    refundedAt: {
        type: Date,
        comment: 'Date when payment was refunded'
    },
    boundAt: {
        type: Date,
        comment: 'Date when card was bound'
    }
}, { timestamps: true });

// Indexes
multicardTransactionSchema.index({ status: 1, createdAt: -1 });
multicardTransactionSchema.index({ userId: 1, status: 1 });
multicardTransactionSchema.index({ transactionType: 1, status: 1 });
multicardTransactionSchema.index({ sessionId: 1 }); // For card binding lookups

const MulticardTransaction = mongoose.model('MulticardTransaction', multicardTransactionSchema);

module.exports = MulticardTransaction;