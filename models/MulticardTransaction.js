const mongoose = require('mongoose');

const multicardTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    multicardUuid: { type: String, required: true, unique: true, index: true },
    invoiceId: { type: String, required: true, index: true }, // Your internal invoice ID
    amount: { type: Number, required: true },
    plan: { type: String, required: true },
    status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'canceled'],
        default: 'pending',
    },
    callbackPayload: { type: Object },
}, { timestamps: true });

const MulticardTransaction = mongoose.model('MulticardTransaction', multicardTransactionSchema);

module.exports = MulticardTransaction;