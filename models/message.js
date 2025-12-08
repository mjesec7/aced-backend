// models/message.js - User Inbox/Messages Model
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    // Reference to the user who owns this message
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Firebase ID for lookup by firebaseId
    firebaseId: {
        type: String,
        index: true
    },

    // Message type for categorization
    type: {
        type: String,
        enum: ['payment', 'warning', 'info', 'system', 'promo'],
        default: 'info',
        index: true
    },

    // Message title
    title: {
        type: String,
        required: true,
        maxlength: 200
    },

    // Message content (supports markdown)
    content: {
        type: String,
        required: true,
        maxlength: 5000
    },

    // Additional data (payment details, promo info, etc.)
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Priority level
    priority: {
        type: String,
        enum: ['low', 'normal', 'high'],
        default: 'normal'
    },

    // Read status
    read: {
        type: Boolean,
        default: false,
        index: true
    },

    // When the message was read
    readAt: {
        type: Date,
        default: null
    },

    // Auto-delete after this date (optional)
    expiresAt: {
        type: Date,
        default: null
    },

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// --- Indexes ---
messageSchema.index({ userId: 1, createdAt: -1 });
messageSchema.index({ userId: 1, read: 1 });
messageSchema.index({ firebaseId: 1, createdAt: -1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-delete

// --- Instance Methods ---

/**
 * Mark message as read
 */
messageSchema.methods.markAsRead = async function() {
    if (!this.read) {
        this.read = true;
        this.readAt = new Date();
        await this.save();
    }
    return this;
};

// --- Static Methods ---

/**
 * Get all messages for a user
 * @param {string} userIdOrFirebaseId - MongoDB ObjectId or Firebase ID
 * @param {object} options - Query options (limit, skip, type, unreadOnly)
 */
messageSchema.statics.getMessagesForUser = async function(userIdOrFirebaseId, options = {}) {
    const {
        limit = 50,
        skip = 0,
        type = null,
        unreadOnly = false,
        sortBy = 'createdAt',
        sortOrder = -1
    } = options;

    // Build query - support both ObjectId and Firebase ID
    let query = {};

    if (mongoose.Types.ObjectId.isValid(userIdOrFirebaseId)) {
        query.userId = userIdOrFirebaseId;
    } else {
        query.firebaseId = userIdOrFirebaseId;
    }

    if (type) {
        query.type = type;
    }

    if (unreadOnly) {
        query.read = false;
    }

    return this.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean();
};

/**
 * Get unread count for a user
 */
messageSchema.statics.getUnreadCount = async function(userIdOrFirebaseId) {
    let query = {};

    if (mongoose.Types.ObjectId.isValid(userIdOrFirebaseId)) {
        query.userId = userIdOrFirebaseId;
    } else {
        query.firebaseId = userIdOrFirebaseId;
    }

    query.read = false;

    return this.countDocuments(query);
};

/**
 * Mark all messages as read for a user
 */
messageSchema.statics.markAllAsRead = async function(userIdOrFirebaseId) {
    let query = {};

    if (mongoose.Types.ObjectId.isValid(userIdOrFirebaseId)) {
        query.userId = userIdOrFirebaseId;
    } else {
        query.firebaseId = userIdOrFirebaseId;
    }

    query.read = false;

    return this.updateMany(query, {
        $set: {
            read: true,
            readAt: new Date()
        }
    });
};

/**
 * Create a payment confirmation message
 */
messageSchema.statics.createPaymentMessage = async function(userId, firebaseId, paymentData) {
    const {
        amount,
        amountFormatted,
        plan,
        duration,
        startDate,
        endDate,
        paymentMethod,
        transactionId,
        promoCode,
        promoDiscount,
        originalAmount
    } = paymentData;

    // Format dates
    const formatDate = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // Build content
    let content = `Your payment has been successfully processed!\n\n`;
    content += `**Amount Paid:** ${amountFormatted || `${(amount / 100).toLocaleString()} UZS`}\n`;

    if (promoCode && promoDiscount) {
        content += `**Original Amount:** ${(originalAmount / 100).toLocaleString()} UZS\n`;
        content += `**Promo Code:** ${promoCode}\n`;
        content += `**Discount:** ${(promoDiscount / 100).toLocaleString()} UZS\n`;
    }

    content += `**Plan:** ${plan?.toUpperCase() || 'PRO'} (${duration || 1} month${duration > 1 ? 's' : ''})\n`;
    content += `**Subscription Period:** ${formatDate(startDate)} - ${formatDate(endDate)}\n`;
    content += `**Payment Method:** ${paymentMethod || 'Online Payment'}\n`;
    content += `**Transaction ID:** ${transactionId || 'N/A'}\n\n`;
    content += `Thank you for subscribing to ACED! Enjoy your premium features.`;

    return this.create({
        userId,
        firebaseId,
        type: 'payment',
        title: 'Payment Successful',
        content,
        priority: 'high',
        data: paymentData
    });
};

/**
 * Create a subscription expiry warning message
 */
messageSchema.statics.createExpiryWarning = async function(userId, firebaseId, expiryDate, daysRemaining) {
    return this.create({
        userId,
        firebaseId,
        type: 'warning',
        title: 'Subscription Expiring Soon',
        content: `Your subscription will expire on ${new Date(expiryDate).toLocaleDateString()}. You have ${daysRemaining} day${daysRemaining > 1 ? 's' : ''} remaining. Renew now to continue enjoying premium features!`,
        priority: 'high',
        data: {
            expiryDate,
            daysRemaining
        }
    });
};

/**
 * Create a promo code applied message
 */
messageSchema.statics.createPromoMessage = async function(userId, firebaseId, promoData) {
    const {
        code,
        grantsPlan,
        subscriptionDays,
        discountPercent,
        discountAmount
    } = promoData;

    let content = `Promo code **${code}** has been applied to your account!\n\n`;

    if (grantsPlan) {
        content += `You now have access to the **${grantsPlan.toUpperCase()}** plan for ${subscriptionDays || 30} days.`;
    } else if (discountPercent) {
        content += `You received a **${discountPercent}%** discount on your next payment.`;
    } else if (discountAmount) {
        content += `You received a **${(discountAmount / 100).toLocaleString()} UZS** discount on your next payment.`;
    }

    return this.create({
        userId,
        firebaseId,
        type: 'promo',
        title: 'Promo Code Applied',
        content,
        priority: 'normal',
        data: promoData
    });
};

/**
 * Create a system notification
 */
messageSchema.statics.createSystemMessage = async function(userId, firebaseId, title, content, data = {}) {
    return this.create({
        userId,
        firebaseId,
        type: 'system',
        title,
        content,
        priority: 'normal',
        data
    });
};

// --- Pre-save middleware ---
messageSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// --- Export Model ---
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
module.exports = Message;
