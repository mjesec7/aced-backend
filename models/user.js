// models/user.js - MERGED & ENHANCED VERSION
const mongoose = require('mongoose');

// --- Sub-Schemas (Organized for clarity) ---

const studyTopicSchema = new mongoose.Schema({
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
    subject: { type: String, required: true },
    name: { type: String, required: true },
    level: { type: String, default: 'basic' },
    addedAt: { type: Date, default: Date.now }
}, { _id: false });

const goalSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: String,
    startDate: Date,
    endDate: Date,
    targetLessons: { type: Number, default: 0 },
    completedLessons: { type: Number, default: 0 },
    progress: { type: Number, default: 0 }
}, { _id: false });

const diaryEntrySchema = new mongoose.Schema({
    date: { type: Date, required: true },
    studyMinutes: Number,
    completedTopics: Number,
    averageGrade: Number
}, { _id: false });

const homeworkSubmissionSchema = new mongoose.Schema({
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    questions: [{
        question: String,
        userAnswer: String,
        correctAnswer: String,
        isCorrect: Boolean,
        submittedAt: { type: Date, default: Date.now }
    }],
    score: Number,
    submittedAt: { type: Date, default: Date.now }
}, { _id: false });

const testResultSchema = new mongoose.Schema({
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
    topic: String,
    type: { type: String, enum: ['grammar', 'vocab'] },
    questions: [{
        question: String,
        selected: String,
        correctAnswer: String,
        isCorrect: Boolean
    }],
    score: Number,
    total: Number,
    date: { type: Date, default: Date.now }
}, { _id: false });

const aiUsageSchema = new mongoose.Schema({
    messages: { type: Number, default: 0 },
    images: { type: Number, default: 0 },
    lastUsed: { type: Date, default: Date.now },
    contexts: {
        general: { type: Number, default: 0 },
        lesson: { type: Number, default: 0 },
        explanation: { type: Number, default: 0 },
        exercise: { type: Number, default: 0 },
        hint: { type: Number, default: 0 },
        homework: { type: Number, default: 0 }
    },
    lessonUsage: {
        type: Map,
        of: Number,
        default: new Map()
    }
}, { _id: false });


// --- Main User Schema ---

const userSchema = new mongoose.Schema({
    // --- Core Identification & Credentials ---
    firebaseId: { type: String, required: true, unique: true, index: true },
    Login: { type: String, required: true, unique: true }, // For PayMe compatibility
    name: String,
    email: { type: String, required: true, unique: true, index: true },
    photoURL: String,
    role: { type: String, enum: ['admin', 'user'], default: 'user' },

    // --- 💳 Subscription & Status (SERVER-AUTHORITATIVE) ---
    subscriptionPlan: {
        type: String,
        enum: ['free', 'start', 'pro', 'premium'],
        default: 'free'
    },
    subscriptionExpiryDate: { // ✅ CRITICAL: Tracks when the subscription ends
        type: Date,
        default: null
    },
    subscriptionSource: { // ✅ CRITICAL: Tracks how the subscription was obtained
        type: String,
        enum: ['payment', 'promocode', 'admin', 'gift', null],
        default: null
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'unpaid'],
        default: 'unpaid'
    },
    isBlocked: { type: Boolean, default: false },
    lastLoginAt: { type: Date },

    // --- 💳 Card Management ---
    cardBindingSession: {
        sessionId: String,
        formUrl: String,
        createdAt: Date,
        expiresAt: Date
    },
    savedCards: [{
        cardToken: {
            type: String,
            required: true
        },
        cardPan: {
            type: String,
            required: true
        },
        ps: {
            type: String,
            enum: ['uzcard', 'humo', 'visa', 'mastercard', 'unionpay']
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }],

    // --- 📚 Learning & Progress ---
    studyList: [studyTopicSchema],
    progress: { type: Object, default: {} },
    homeworkSubmissions: [homeworkSubmissionSchema],
    testResults: [testResultSchema],

    // --- 🎯 Goals & Diary ---
    goals: [goalSchema],
    diary: [diaryEntrySchema],

    // --- 🏆 Gamification & Points ---
    totalPoints: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    badges: { type: [String], default: [] },

    // --- 🤖 AI & Usage Tracking ---
    aiUsage: { type: Map, of: aiUsageSchema, default: new Map() },
    homeworkUsage: { type: Map, of: aiUsageSchema, default: new Map() }, // For backward compatibility
    lastResetCheck: { type: Date, default: Date.now },

}, {
    // ✅ Automatically add createdAt and updatedAt timestamps
    timestamps: true
});


// --- 💳 Subscription Helper Methods ---

/**
 * Determines if the user has an active, non-expired subscription.
 * This is the single source of truth for checking premium status.
 * @returns {boolean} True if the subscription is active and valid.
 */
userSchema.methods.hasActiveSubscription = function() {
    if (this.subscriptionPlan === 'free' || !this.subscriptionExpiryDate) {
        return false;
    }
    // Check if the expiry date is in the future
    return this.subscriptionExpiryDate > new Date();
};

/**
 * Calculates the number of days remaining until the subscription expires.
 * @returns {number|null} Days remaining, or null if no expiry date is set. Returns 0 if expired.
 */
userSchema.methods.daysUntilExpiry = function() {
    if (!this.subscriptionExpiryDate) {
        return null;
    }
    const now = new Date();
    const diffTime = this.subscriptionExpiryDate.getTime() - now.getTime();
    if (diffTime < 0) return 0; // Expired
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * A centralized method to grant or update a user's subscription.
 * @param {string} plan - The plan to grant ('start', 'pro', 'premium').
 * @param {number} durationInDays - The validity period of the subscription.
 * @param {string} source - The source of the subscription ('payment', 'promocode', etc.).
 */
userSchema.methods.grantSubscription = async function(plan, durationInDays, source) {
    const now = new Date();
    this.subscriptionPlan = plan;
    this.subscriptionSource = source;
    // If user already has an active subscription, extend it. Otherwise, create a new one.
    const startDate = this.hasActiveSubscription() ? this.subscriptionExpiryDate : now;
    this.subscriptionExpiryDate = new Date(startDate.getTime() + (durationInDays * 24 * 60 * 60 * 1000));
    await this.save();
};

/**
 * Revokes an active subscription, typically after a refund.
 * This reverts the user to the 'free' plan and clears their expiry date.
 */
userSchema.methods.revokeSubscription = async function() {
    this.subscriptionPlan = 'free';
    this.subscriptionExpiryDate = null;
    this.subscriptionSource = null;
    await this.save();
};


// --- 🤖 AI Usage Methods ---

/**
 * Retrieves or initializes the AI usage data for the current calendar month.
 * @returns {object} The usage object for the current month.
 */
userSchema.methods.getCurrentMonthAIUsage = function() {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`;

    if (!this.aiUsage.has(monthKey)) {
        this.aiUsage.set(monthKey, {
            messages: 0,
            images: 0,
            lastUsed: new Date(),
            contexts: { general: 0, lesson: 0, explanation: 0, exercise: 0, hint: 0, homework: 0 },
            lessonUsage: new Map()
        });
    }

    return this.aiUsage.get(monthKey);
};

// Backward compatibility alias
userSchema.methods.getCurrentMonthUsage = function() {
    return this.getCurrentMonthAIUsage();
};

/**
 * Increments AI usage, tracking messages, images, context, and lesson ID.
 * @param {object} options - The usage details.
 * @param {number} [options.messageCount=0] - Number of messages to add.
 * @param {number} [options.imageCount=0] - Number of images to add.
 * @param {string} [options.context='general'] - The context of the usage.
 * @param {string|null} [options.lessonId=null] - The ID of the lesson related to the usage.
 * @returns {Promise<object>} The updated usage object for the current month.
 */
userSchema.methods.incrementAIUsage = async function(options = {}) {
    const {
        messageCount = 0,
        imageCount = 0,
        context = 'general',
        lessonId = null
    } = options;

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
    let currentUsage = this.getCurrentMonthAIUsage(); // This ensures the entry exists

    // Update totals
    currentUsage.messages += messageCount;
    currentUsage.images += imageCount;
    currentUsage.lastUsed = now;

    // Update context tracking
    if (currentUsage.contexts && currentUsage.contexts[context] !== undefined) {
        currentUsage.contexts[context] += messageCount;
    }

    // Update lesson-specific usage
    if (lessonId && currentUsage.lessonUsage) {
        const lessonUsageCount = currentUsage.lessonUsage.get(lessonId) || 0;
        currentUsage.lessonUsage.set(lessonId.toString(), lessonUsageCount + messageCount);
    }

    this.aiUsage.set(monthKey, currentUsage);

    // Backward compatibility: Also update homeworkUsage
    this.homeworkUsage.set(monthKey, {
        messages: currentUsage.messages,
        images: currentUsage.images,
        lastUsed: currentUsage.lastUsed
    });

    await this.save();
    return currentUsage;
};

// Backward compatibility alias
userSchema.methods.incrementUsage = async function(messageCount = 0, imageCount = 0) {
    return this.incrementAIUsage({ messageCount, imageCount });
};


/**
 * Returns the AI usage limits based on the user's current subscription plan.
 * @returns {{messages: number, images: number}}
 */
userSchema.methods.getUsageLimits = function() {
    const limits = {
        free: { messages: 50, images: 5 },
        start: { messages: -1, images: 20 }, // -1 means unlimited
        pro: { messages: -1, images: -1 },
        premium: { messages: -1, images: -1 }
    };
    return limits[this.subscriptionPlan] || limits.free;
};

/**
 * Checks if a user's intended AI usage is within their plan's limits.
 * @param {boolean} [hasImage=false] - Whether the upcoming request includes an image.
 * @returns {{allowed: boolean, reason?: string, message?: string, remaining?: {messages: number|string, images: number|string}}}
 */
userSchema.methods.checkAIUsageLimits = function(hasImage = false) {
    const currentUsage = this.getCurrentMonthAIUsage();
    const limits = this.getUsageLimits();

    if (limits.messages !== -1 && currentUsage.messages >= limits.messages) {
        return {
            allowed: false,
            reason: 'message_limit_exceeded',
            message: `Message limit (${limits.messages}) reached for your plan. Please upgrade to continue.`
        };
    }

    if (hasImage && limits.images !== -1 && currentUsage.images >= limits.images) {
        return {
            allowed: false,
            reason: 'image_limit_exceeded',
            message: `Image limit (${limits.images}) reached for your plan. Please upgrade to continue.`
        };
    }

    return {
        allowed: true,
        remaining: {
            messages: limits.messages === -1 ? '∞' : Math.max(0, limits.messages - currentUsage.messages),
            images: limits.images === -1 ? '∞' : Math.max(0, limits.images - currentUsage.images)
        }
    };
};

// Backward compatibility alias
userSchema.methods.checkUsageLimits = function(hasImage = false) {
    return this.checkAIUsageLimits(hasImage);
};


/**
 * Checks if the calendar month has changed and resets monthly usage data if needed.
 * Also cleans up usage data older than 6 months.
 * @returns {Promise<boolean>} True if a reset occurred.
 */
userSchema.methods.checkMonthlyReset = async function() {
    const now = new Date();
    if (!this.lastResetCheck) {
        this.lastResetCheck = now;
        await this.save();
        return false;
    }

    const lastReset = new Date(this.lastResetCheck);
    const hasMonthChanged = now.getFullYear() > lastReset.getFullYear() || now.getMonth() > lastReset.getMonth();

    if (hasMonthChanged) {
        this.lastResetCheck = now;

        // Clean up old usage data (older than 6 months)
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 6);
        for (const [key] of this.aiUsage.keys()) {
            const [year, month] = key.split('-').map(Number);
            if (new Date(year, month) < cutoffDate) {
                this.aiUsage.delete(key);
                this.homeworkUsage.delete(key); // Also clear legacy data
            }
        }
        
        await this.save();
        return true; // A reset (or at least a check and potential cleanup) happened
    }

    return false;
};

// --- 📊 AI Analytics Methods ---

/**
 * Retrieves AI usage statistics for a specified number of past months.
 * @param {number} [months=3] - The number of months to retrieve stats for.
 * @returns {Array<object>} An array of monthly usage statistics.
 */
userSchema.methods.getAIUsageStats = function(months = 3) {
    const stats = [];
    const now = new Date();
    for (let i = 0; i < months; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        const usage = this.aiUsage.get(monthKey) || { messages: 0, images: 0, contexts: {}, lessonUsage: new Map() };
        
        stats.unshift({
            month: monthKey,
            messages: usage.messages,
            images: usage.images,
            contexts: usage.contexts || {},
            lessonCount: usage.lessonUsage ? usage.lessonUsage.size : 0,
        });
    }
    return stats;
};

/**
 * Gets a breakdown of AI usage by context for the current month.
 * @returns {object} An object with counts and percentages for each context.
 */
userSchema.methods.getContextUsageBreakdown = function() {
    const { contexts } = this.getCurrentMonthAIUsage();
    if (!contexts) return {};

    const total = Object.values(contexts).reduce((sum, count) => sum + count, 0);
    if (total === 0) return {};

    const breakdown = {};
    for (const [context, count] of Object.entries(contexts)) {
        breakdown[context] = {
            count,
            percentage: Math.round((count / total) * 100)
        };
    }
    return breakdown;
};


// --- Indexes for Performance ---
userSchema.index({ firebaseId: 1 });
userSchema.index({ email: 1 });
userSchema.index({ subscriptionExpiryDate: 1 });
userSchema.index({ subscriptionPlan: 1 });

const User = mongoose.model('User', userSchema);
module.exports = User;