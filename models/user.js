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
    subscriptionDuration: { // ✅ NEW: Tracks subscription duration tier (1, 3, or 6 months)
        type: Number,
        enum: [1, 3, 6, null],
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

    // --- 🎓 DUAL-MODE LEARNING SYSTEM ---
    learningMode: {
        type: String,
        enum: ['study_centre', 'school', 'hybrid'],
        default: 'study_centre',
        index: true
    },

    // --- 🏫 SCHOOL MODE PROFILE ---
    schoolProfile: {
        // Placement Test Data
        placementTestTaken: { type: Boolean, default: false },
        placementTestDate: Date,
        placementTestResults: {
            overallScore: Number,
            levelAssigned: Number,
            percentile: Number,
            subjects: [{
                name: String,
                score: Number,
                recommendedLevel: Number
            }]
        },

        // Academic Progress
        currentGrade: {
            type: String,
            enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Expert', 'Master'],
            default: 'A1'
        },
        currentSemester: { type: Number, default: 1 },
        academicYear: String,

        // Access Control
        progressLocked: { type: Boolean, default: true },
        accessibleLevels: [Number], // Only these levels can be accessed
        lockedLevels: [Number], // Explicitly locked levels
        currentLevelCap: { type: Number, default: 1 },

        // Curriculum Tracking
        mandatoryCourses: [{
            courseId: mongoose.Schema.Types.ObjectId,
            status: {
                type: String,
                enum: ['not_started', 'in_progress', 'completed'],
                default: 'not_started'
            },
            deadline: Date,
            grade: String,
            attempts: { type: Number, default: 0 }
        }],

        // Completion Requirements
        completedLevels: [{
            level: Number,
            completedDate: Date,
            finalScore: Number,
            certificate: String,
            unlockedNext: [Number] // Levels unlocked by completing this
        }],

        // School-Specific Settings
        curriculum: {
            type: String,
            enum: ['standard', 'accelerated', 'remedial', 'custom'],
            default: 'standard'
        },
        requiredCoursesPerLevel: { type: Number, default: 5 },
        minPassingScore: { type: Number, default: 70 }
    },

    // --- 🌟 STUDY CENTRE PROFILE ---
    studyCentreProfile: {
        explorationHistory: [{
            topicId: mongoose.Schema.Types.ObjectId,
            accessedAt: Date,
            timeSpent: Number,
            completed: Boolean
        }],

        bookmarkedCourses: [{
            courseId: mongoose.Schema.Types.ObjectId,
            bookmarkedAt: Date,
            notes: String
        }],

        personalPaths: [{
            name: String,
            description: String,
            courses: [mongoose.Schema.Types.ObjectId],
            createdAt: Date,
            progress: Number
        }],

        preferences: {
            showAllLevels: { type: Boolean, default: true },
            allowJumping: { type: Boolean, default: true },
            explorationMode: { type: Boolean, default: true }
        }
    },

    // --- 🔄 MODE TRANSITION HISTORY ---
    modeHistory: [{
        fromMode: String,
        toMode: String,
        switchedAt: Date,
        reason: String
    }],

    // --- 🏅 ACHIEVEMENTS ---
    achievements: [{
        id: String,
        name: String,
        description: String,
        icon: String,
        type: String,
        unlockedAt: Date,
        data: mongoose.Schema.Types.Mixed
    }]

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
userSchema.methods.hasActiveSubscription = function () {
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
userSchema.methods.daysUntilExpiry = function () {
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
 * @param {number} durationMonths - Optional: The duration tier in months (1, 3, or 6). If not provided, will be calculated.
 */
userSchema.methods.grantSubscription = async function (plan, durationInDays, source, durationMonths = null) {
    const now = new Date();
    this.subscriptionPlan = plan;
    this.subscriptionSource = source;

    // Calculate duration tier in months if not provided
    if (!durationMonths) {
        // Approximate: 30 days = 1 month, 90 days = 3 months, 180 days = 6 months
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
    await this.save();
};

/**
 * Revokes an active subscription, typically after a refund.
 * This reverts the user to the 'free' plan and clears their expiry date.
 */
userSchema.methods.revokeSubscription = async function () {
    this.subscriptionPlan = 'free';
    this.subscriptionExpiryDate = null;
    this.subscriptionSource = null;
    this.subscriptionDuration = null; // Clear duration tier
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
 * @param {number} [options.messageCount=0] - Number of messages to add.
 * @param {number} [options.imageCount=0] - Number of images to add.
 * @param {string} [options.context='general'] - The context of the usage.
 * @param {string|null} [options.lessonId=null] - The ID of the lesson related to the usage.
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
 * Also cleans up usage data older than 6 months.
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
        return true; // Study Centre can access everything
    }

    if (this.learningMode === 'school' && this.schoolProfile) {
        // Check if level is unlocked
        const isAccessible = this.schoolProfile.accessibleLevels?.includes(level);
        const isNotLocked = !this.schoolProfile.lockedLevels?.includes(level);
        const withinCap = level <= (this.schoolProfile.currentLevelCap || 1);

        return isAccessible || (isNotLocked && withinCap);
    }

    // Hybrid mode - more complex logic
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

    // Add to completed levels
    this.schoolProfile.completedLevels = this.schoolProfile.completedLevels || [];
    this.schoolProfile.completedLevels.push({
        level: completedLevel,
        completedDate: new Date(),
        finalScore: score,
        certificate: certificate,
        unlockedNext: [completedLevel + 1]
    });

    // Unlock next level
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

    // Grant access to all levels up to assigned level
    this.schoolProfile.accessibleLevels = Array.from(
        { length: testResults.levelAssigned || 1 },
        (_, i) => i + 1
    );

    // Set current grade
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

    // Check if already bookmarked
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
// ✅ FIXED: Removed duplicate indexes (firebaseId, email, learningMode already have index: true inline)
userSchema.index({ subscriptionExpiryDate: 1 });
userSchema.index({ subscriptionPlan: 1 });
userSchema.index({ 'schoolProfile.currentLevelCap': 1 });

// ✅ Check if model already exists to prevent "Cannot overwrite model" errors in hot-reload scenarios
const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;