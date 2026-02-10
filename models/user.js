// models/user.js - MERGED & ENHANCED VERSION
const mongoose = require('mongoose');

// --- Sub-Schemas (Organized for clarity) ---

const studyTopicSchema = new mongoose.Schema({
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
    subject: { type: String, required: true },
    name: { type: String, required: true },
    topic: String,
    level: { type: mongoose.Schema.Types.Mixed, default: 'basic' },
    lessonCount: { type: Number, default: 0 },
    totalTime: { type: Number, default: 0 },
    type: { type: String, default: 'free' },
    description: String,
    isActive: { type: Boolean, default: true },
    metadata: mongoose.Schema.Types.Mixed,
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

const modeHistorySchema = new mongoose.Schema({
    fromMode: String,
    toMode: String,
    switchedAt: { type: Date, default: Date.now },
    reason: String
}, { _id: false });

const bookmarkSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    bookmarkedAt: { type: Date, default: Date.now },
    notes: String
}, { _id: false });

const personalPathSchema = new mongoose.Schema({
    name: String,
    description: String,
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    createdAt: { type: Date, default: Date.now },
    progress: { type: Number, default: 0 }
}, { _id: false });

const completedLevelSchema = new mongoose.Schema({
    level: Number,
    completedDate: Date,
    finalScore: Number,
    certificate: String,
    unlockedNext: [Number]
}, { _id: false });


// --- Main User Schema ---

const userSchema = new mongoose.Schema({
    // --- Core Identification & Credentials ---
    firebaseId: { type: String, required: true, unique: true, index: true },
    Login: { type: String, unique: true, sparse: true }, // For PayMe compatibility (sparse allows multiple null values)
    name: String,
    email: { type: String, unique: true, sparse: true, index: true },
    photoURL: String,
    role: { type: String, enum: ['admin', 'user'], default: 'user' },

    // --- 💳 Subscription & Status (SERVER-AUTHORITATIVE) ---
    subscriptionPlan: {
        type: String,
        enum: ['free', 'start', 'pro', 'premium'],
        default: 'free'
    },
    subscriptionExpiryDate: {
        type: Date,
        default: null
    },
    subscriptionSource: {
        type: String,
        enum: ['payment', 'promocode', 'admin', 'gift', null],
        default: null
    },
    subscriptionDuration: {
        type: Number,
        enum: [1, 3, 6, null],
        default: null
    },
    subscriptionActivatedAt: {
        type: Date,
        default: null
    },
    subscriptionAmount: {
        type: Number,
        default: 0
    },
    lastPaymentDate: {
        type: Date,
        default: null
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'unpaid'],
        default: 'unpaid'
    },

    // --- 🤖 AI Usage Tracking ---
    aiUsage: {
        type: Map,
        of: aiUsageSchema,
        default: new Map()
    },
    homeworkUsage: {
        type: Map,
        of: new mongoose.Schema({
            messages: { type: Number, default: 0 },
            images: { type: Number, default: 0 },
            lastUsed: Date
        }, { _id: false }),
        default: new Map()
    },
    lastResetCheck: Date,

    // --- 🎓 Learning Mode ---
    learningMode: {
        type: String,
        enum: ['study_centre', 'school', 'hybrid'],
        default: 'study_centre',
        index: true
    },
    modeHistory: [modeHistorySchema],

    // --- 🏫 School Profile ---
    schoolProfile: {
        currentLevelCap: { type: Number, default: 1 },
        currentGrade: { type: String, default: 'A1' },
        accessibleLevels: [Number],
        lockedLevels: [Number],
        completedLevels: [completedLevelSchema],
        progressLocked: { type: Boolean, default: false },
        placementTestTaken: { type: Boolean, default: false },
        placementTestDate: Date,
        placementTestResults: mongoose.Schema.Types.Mixed
    },

    // --- 📚 Study Centre Profile ---
    studyCentreProfile: {
        bookmarkedCourses: [bookmarkSchema],
        personalPaths: [personalPathSchema],
        preferences: {
            showAllLevels: { type: Boolean, default: true }
        }
    },

    // --- 📖 Study Topics & Progress ---
    studyList: [studyTopicSchema],
    goals: [goalSchema],
    diary: [diaryEntrySchema],
    homeworkSubmissions: [homeworkSubmissionSchema],
    testResults: [testResultSchema],

    // --- Timestamps ---
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});


// --- Instance Methods ---

/**
 * Checks if the user currently has an active (non-expired) subscription.
 * @returns {boolean}
 */
userSchema.methods.hasActiveSubscription = function () {
    if (this.subscriptionPlan === 'free') return false;
    if (!this.subscriptionExpiryDate) return false;
    return new Date() < new Date(this.subscriptionExpiryDate);
};

/**
 * A centralized method to grant or update a user's subscription.
 * @param {string} plan - The plan to grant ('start', 'pro', 'premium').
 * @param {number} durationInDays - The validity period of the subscription.
 * @param {string} source - The source of the subscription ('payment', 'promocode', etc.).
 * @param {number} durationMonths - Optional: The duration tier in months (1, 3, or 6).
 */
userSchema.methods.grantSubscription = async function (plan, durationInDays, source, durationMonths = null) {
    const now = new Date();

    // If not currently active, set the activation date
    if (!this.hasActiveSubscription()) {
        this.subscriptionActivatedAt = now;
    }

    this.subscriptionPlan = plan;
    this.subscriptionSource = source;

    // Calculate duration tier in months if not provided
    if (durationMonths === null || durationMonths === undefined) {
        if (durationInDays <= 31) {
            durationMonths = 1;
        } else if (durationInDays <= 95) {
            durationMonths = 3;
        } else {
            durationMonths = 6;
        }
    }
    this.subscriptionDuration = durationMonths;

    // If user already has an active subscription, extend it. Otherwise, create a new one.
    const startDate = this.hasActiveSubscription() ? this.subscriptionExpiryDate : now;
    this.subscriptionExpiryDate = new Date(startDate.getTime() + (durationInDays * 24 * 60 * 60 * 1000));

    // ✅ SYNC WITH FIREBASE CUSTOM CLAIMS
    try {
        const admin = require('../firebaseAdmin'); // Ensure you have this configured
        if (admin && this.firebaseId) {
            await admin.auth().setCustomUserClaims(this.firebaseId, {
                plan: plan,
                status: 'active',
                expiry: this.subscriptionExpiryDate.getTime()
            });
        }
    } catch (firebaseError) {
        console.error('Failed to sync subscription with Firebase:', firebaseError);
        // Don't fail the transaction, just log the error
    }

    await this.save();
};

/**
 * Revokes an active subscription, typically after a refund.
 */
userSchema.methods.revokeSubscription = async function () {
    this.subscriptionPlan = 'free';
    this.subscriptionExpiryDate = null;
    this.subscriptionSource = null;
    this.subscriptionDuration = null;
    await this.save();
};


// --- 🤖 AI Usage Methods ---

/**
 * Retrieves or initializes the AI usage data for the current calendar month.
 * @returns {object} The usage object for the current month.
 */
userSchema.methods.getCurrentMonthAIUsage = function () {
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
userSchema.methods.getCurrentMonthUsage = function () {
    return this.getCurrentMonthAIUsage();
};

/**
 * Increments AI usage, tracking messages, images, context, and lesson ID.
 * @param {object} options - The usage details.
 * @returns {Promise<object>} The updated usage object for the current month.
 */
userSchema.methods.incrementAIUsage = async function (options = {}) {
    const {
        messageCount = 0,
        imageCount = 0,
        context = 'general',
        lessonId = null
    } = options;

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
    let currentUsage = this.getCurrentMonthAIUsage();

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
userSchema.methods.incrementUsage = async function (messageCount = 0, imageCount = 0) {
    return this.incrementAIUsage({ messageCount, imageCount });
};

/**
 * Returns the AI usage limits based on the user's current subscription plan.
 * @returns {{messages: number, images: number}}
 */
userSchema.methods.getUsageLimits = function () {
    const limits = {
        free: { messages: 50, images: 5 },
        start: { messages: -1, images: 20 },
        pro: { messages: -1, images: -1 },
        premium: { messages: -1, images: -1 }
    };
    return limits[this.subscriptionPlan] || limits.free;
};

/**
 * Checks if a user's intended AI usage is within their plan's limits.
 * @param {boolean} [hasImage=false] - Whether the upcoming request includes an image.
 * @returns {object}
 */
userSchema.methods.checkAIUsageLimits = function (hasImage = false) {
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
userSchema.methods.checkUsageLimits = function (hasImage = false) {
    return this.checkAIUsageLimits(hasImage);
};

/**
 * Checks if the calendar month has changed and resets monthly usage data if needed.
 * @returns {Promise<boolean>} True if a reset occurred.
 */
userSchema.methods.checkMonthlyReset = async function () {
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
        for (const key of this.aiUsage.keys()) {
            const [year, month] = key.split('-').map(Number);
            if (new Date(year, month) < cutoffDate) {
                this.aiUsage.delete(key);
                this.homeworkUsage.delete(key);
            }
        }

        await this.save();
        return true;
    }

    return false;
};


// --- 📊 AI Analytics Methods ---

/**
 * Retrieves AI usage statistics for a specified number of past months.
 * @param {number} [months=3] - The number of months to retrieve stats for.
 * @returns {Array<object>} An array of monthly usage statistics.
 */
userSchema.methods.getAIUsageStats = function (months = 3) {
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
userSchema.methods.getContextUsageBreakdown = function () {
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


// --- 🎓 Dual-Mode Learning Methods ---

/**
 * Switches the user's learning mode to a new mode.
 * @param {string} newMode - The new learning mode ('study_centre', 'school', 'hybrid')
 * @param {string} reason - The reason for switching modes
 * @returns {Promise<User>} The updated user document
 */
userSchema.methods.switchMode = async function (newMode, reason = '') {
    this.modeHistory.push({
        fromMode: this.learningMode,
        toMode: newMode,
        switchedAt: new Date(),
        reason
    });

    this.learningMode = newMode;

    // Apply mode-specific settings
    if (newMode === 'school') {
        if (!this.schoolProfile) {
            this.schoolProfile = {};
        }
        this.schoolProfile.progressLocked = true;
    } else if (newMode === 'study_centre') {
        if (!this.studyCentreProfile) {
            this.studyCentreProfile = {};
        }
        this.studyCentreProfile.preferences = this.studyCentreProfile.preferences || {};
        this.studyCentreProfile.preferences.showAllLevels = true;
    }

    return this.save();
};

/**
 * Checks if a user can access a specific level based on their learning mode.
 * @param {number} level - The level to check access for
 * @returns {boolean} True if the user can access the level
 */
userSchema.methods.canAccessLevel = function (level) {
    if (this.learningMode === 'study_centre') {
        return true;
    }

    if (this.learningMode === 'school' && this.schoolProfile) {
        const isAccessible = this.schoolProfile.accessibleLevels?.includes(level);
        const isNotLocked = !this.schoolProfile.lockedLevels?.includes(level);
        const withinCap = level <= (this.schoolProfile.currentLevelCap || 1);

        return isAccessible || (isNotLocked && withinCap);
    }

    if (this.learningMode === 'hybrid') {
        return this.studyCentreProfile?.preferences?.showAllLevels ||
            this.schoolProfile?.accessibleLevels?.includes(level);
    }

    return false;
};

/**
 * Unlocks the next level for a user in school mode.
 * @param {number} completedLevel - The level that was just completed
 * @param {number} score - The score achieved
 * @param {string} certificate - Certificate URL if applicable
 * @returns {Promise<User>} The updated user document
 */
userSchema.methods.completeLevel = async function (completedLevel, score, certificate = null) {
    if (this.learningMode !== 'school' || !this.schoolProfile) {
        throw new Error('Level completion is only available in school mode');
    }

    this.schoolProfile.completedLevels = this.schoolProfile.completedLevels || [];
    this.schoolProfile.completedLevels.push({
        level: completedLevel,
        completedDate: new Date(),
        finalScore: score,
        certificate: certificate,
        unlockedNext: [completedLevel + 1]
    });

    this.schoolProfile.currentLevelCap = Math.max(
        this.schoolProfile.currentLevelCap || 1,
        completedLevel + 1
    );

    this.schoolProfile.accessibleLevels = this.schoolProfile.accessibleLevels || [];
    if (!this.schoolProfile.accessibleLevels.includes(completedLevel + 1)) {
        this.schoolProfile.accessibleLevels.push(completedLevel + 1);
    }

    // Update current grade based on new level cap
    const platformSettings = require('../config/platformSettings');
    this.schoolProfile.currentGrade = platformSettings.levelGradeMapping[this.schoolProfile.currentLevelCap] || 'A1';

    return this.save();
};

/**
 * Records a placement test result and sets initial level access.
 * @param {Object} testResults - The test results object
 * @returns {Promise<User>} The updated user document
 */
userSchema.methods.recordPlacementTest = async function (testResults) {
    if (!this.schoolProfile) {
        this.schoolProfile = {};
    }

    this.schoolProfile.placementTestTaken = true;
    this.schoolProfile.placementTestDate = new Date();
    this.schoolProfile.placementTestResults = testResults;
    this.schoolProfile.currentLevelCap = testResults.levelAssigned || 1;

    this.schoolProfile.accessibleLevels = Array.from(
        { length: testResults.levelAssigned || 1 },
        (_, i) => i + 1
    );

    const platformSettings = require('../config/platformSettings');
    this.schoolProfile.currentGrade = platformSettings.levelGradeMapping[testResults.levelAssigned] || 'A1';

    return this.save();
};

/**
 * Adds a bookmark in study centre mode.
 * @param {string} courseId - The course ID to bookmark
 * @param {string} notes - Optional notes
 * @returns {Promise<User>} The updated user document
 */
userSchema.methods.addBookmark = async function (courseId, notes = '') {
    if (!this.studyCentreProfile) {
        this.studyCentreProfile = { bookmarkedCourses: [] };
    }

    if (!this.studyCentreProfile.bookmarkedCourses) {
        this.studyCentreProfile.bookmarkedCourses = [];
    }

    const existing = this.studyCentreProfile.bookmarkedCourses.find(
        b => b.courseId.toString() === courseId.toString()
    );

    if (!existing) {
        this.studyCentreProfile.bookmarkedCourses.push({
            courseId,
            bookmarkedAt: new Date(),
            notes
        });
    }

    return this.save();
};

/**
 * Creates a personal learning path in study centre mode.
 * @param {string} name - Path name
 * @param {string} description - Path description
 * @param {Array} courses - Array of course IDs
 * @returns {Promise<User>} The updated user document
 */
userSchema.methods.createPersonalPath = async function (name, description, courses = []) {
    if (!this.studyCentreProfile) {
        this.studyCentreProfile = { personalPaths: [] };
    }

    if (!this.studyCentreProfile.personalPaths) {
        this.studyCentreProfile.personalPaths = [];
    }

    this.studyCentreProfile.personalPaths.push({
        name,
        description,
        courses,
        createdAt: new Date(),
        progress: 0
    });

    return this.save();
};


// --- Indexes for Performance ---
userSchema.index({ subscriptionExpiryDate: 1 });
userSchema.index({ subscriptionPlan: 1 });
userSchema.index({ 'schoolProfile.currentLevelCap': 1 });


// --- Pre-save middleware ---
userSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});


// --- Export Model ---
const User = mongoose.models.User || mongoose.model('User', userSchema);

// --- Index Migration: Convert non-sparse unique indexes to sparse ---
// This runs once on startup to fix indexes that prevent multiple null values
(async () => {
    try {
        const collection = User.collection;
        const indexes = await collection.indexes();

        for (const idx of indexes) {
            // Drop non-sparse unique indexes on Login and email, then let Mongoose recreate as sparse
            if (idx.unique && !idx.sparse && (idx.key.Login || idx.key.email) && idx.name !== '_id_') {
                console.log(`Dropping non-sparse unique index: ${idx.name}`);
                await collection.dropIndex(idx.name);
            }
        }

        // Ensure the sparse indexes are created
        await User.syncIndexes();
    } catch (err) {
        // Silently ignore if collection doesn't exist yet or indexes already correct
        if (err.code !== 26 && err.codeName !== 'NamespaceNotFound') {
            console.warn('Index migration warning:', err.message);
        }
    }
})();

module.exports = User;