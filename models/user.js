// models/user.js - COMPLETE SERVER-FIRST USER MANAGEMENT SYSTEM
const mongoose = require('mongoose');

// ============================================================================
// 1. ENHANCED SCHEMAS
// ============================================================================

// ✅ Study List Entry Schema - Server-stored study list
const studyTopicSchema = new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
  subject: { type: String, required: true },
  name: { type: String, required: true },
  level: { type: String, default: 'basic' },
  progress: { type: Number, default: 0 }, // 0-100
  totalLessons: { type: Number, default: 0 },
  completedLessons: { type: Number, default: 0 },
  addedAt: { type: Date, default: Date.now },
  lastAccessedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: true });

// ✅ Subscription Schema - Server-stored subscription data
const subscriptionSchema = new mongoose.Schema({
  plan: { 
    type: String, 
    enum: ['free', 'start', 'pro', 'premium'], 
    default: 'free' 
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'expired', 'cancelled'], 
    default: 'inactive' 
  },
  source: { 
    type: String, 
    enum: ['payment', 'promocode', 'gift', 'trial'], 
    default: null 
  },
  startDate: { type: Date, default: null },
  expiryDate: { type: Date, default: null },
  isAutoRenew: { type: Boolean, default: false },
  
  // Payment tracking
  lastPaymentId: { type: String, default: null },
  paymentHistory: [{
    transactionId: String,
    amount: Number,
    currency: { type: String, default: 'UZS' },
    method: String, // 'payme', 'click', etc.
    status: String,
    paidAt: Date,
    expiryExtended: Date
  }],
  
  // Promocode tracking
  promocodesUsed: [{
    code: String,
    appliedAt: Date,
    expiryExtended: Date,
    grantedPlan: String
  }],
  
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastSync: { type: Date, default: Date.now }
}, { _id: false });

// ✅ Device/Session tracking
const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  deviceType: String, // 'web', 'mobile', 'tablet'
  browser: String,
  os: String,
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  lastIP: String,
  isActive: { type: Boolean, default: true }
}, { _id: false });

// ✅ Progress tracking - Server-stored progress
const progressSchema = new mongoose.Schema({
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic' },
  completedSteps: [String],
  progressPercent: { type: Number, default: 0, min: 0, max: 100 },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
  timeSpent: { type: Number, default: 0 }, // in seconds
  mistakes: { type: Number, default: 0 },
  stars: { type: Number, default: 0, min: 0, max: 5 },
  points: { type: Number, default: 0 },
  hintsUsed: { type: Number, default: 0 },
  lastAccessedAt: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: true });

// ✅ Goal Schema
const goalSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: String,
  startDate: Date,
  endDate: Date,
  targetLessons: { type: Number, default: 0 },
  completedLessons: { type: Number, default: 0 },
  progress: { type: Number, default: 0 }
}, { _id: false });

// ✅ Diary Entry Schema
const diaryEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  studyMinutes: Number,
  completedTopics: Number,
  averageGrade: Number
}, { _id: false });

// ✅ Homework Submission Schema
const homeworkSubmissionSchema = new mongoose.Schema({
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  questions: [
    {
      question: String,
      userAnswer: String,
      correctAnswer: String,
      isCorrect: Boolean,
      submittedAt: { type: Date, default: Date.now }
    }
  ],
  score: Number,
  submittedAt: { type: Date, default: Date.now }
}, { _id: false });

// ✅ Test Result Schema
const testResultSchema = new mongoose.Schema({
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  topic: String,
  type: { type: String, enum: ['grammar', 'vocab'] },
  questions: [
    {
      question: String,
      selected: String,
      correctAnswer: String,
      isCorrect: Boolean
    }
  ],
  score: Number,
  total: Number,
  date: { type: Date, default: Date.now }
}, { _id: false });

// ✅ AI Usage Schema
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

// ============================================================================
// 2. MAIN USER SCHEMA
// ============================================================================

const userSchema = new mongoose.Schema({
  // Firebase/Auth info
  firebaseId: { type: String, required: true, unique: true, index: true },
  Login: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, index: true },
  name: String,
  displayName: String,
  photoURL: String,
  emailVerified: { type: Boolean, default: false },
  
  // Role & Status
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  isBlocked: { type: Boolean, default: false },
  
  // 🚀 SERVER-STORED SUBSCRIPTION DATA
  subscription: subscriptionSchema,
  
  // Legacy subscription fields for backward compatibility
  subscriptionPlan: {
    type: String,
    enum: ['free', 'start', 'pro', 'premium'],
    default: 'free'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'unpaid'],
    default: 'unpaid'
  },
  
  // 🚀 SERVER-STORED STUDY LIST
  studyList: [studyTopicSchema],
  
  // 🚀 SERVER-STORED PROGRESS DATA
  progress: [progressSchema],
  
  // Legacy progress for backward compatibility
  progressLegacy: {
    type: Object,
    default: {}
  },
  
  // Learning stats
  totalPoints: { type: Number, default: 0 },
  totalTimeSpent: { type: Number, default: 0 }, // in seconds
  totalLessonsCompleted: { type: Number, default: 0 },
  
  // Homework & Tests
  homeworkSubmissions: [homeworkSubmissionSchema],
  testResults: [testResultSchema],
  
  // Gamification
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  badges: [String],
  achievements: [{
    id: String,
    name: String,
    description: String,
    earnedAt: Date,
    metadata: mongoose.Schema.Types.Mixed
  }],
  
  // Goals & Diary
  goals: [goalSchema],
  diary: [diaryEntrySchema],
  
  // User preferences - server-stored
  preferences: {
    language: { type: String, default: 'ru' },
    theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' },
    notifications: { type: Boolean, default: true },
    emailUpdates: { type: Boolean, default: false },
    autoSave: { type: Boolean, default: true },
    soundEffects: { type: Boolean, default: true },
    reducedMotion: { type: Boolean, default: false }
  },
  
  // Device tracking
  devices: [deviceSchema],
  
  // AI Usage tracking
  aiUsage: {
    type: Map,
    of: aiUsageSchema,
    default: new Map()
  },
  
  // Backward compatibility for homework usage
  homeworkUsage: {
    type: Map,
    of: aiUsageSchema,
    default: new Map()
  },
  
  lastResetCheck: { type: Date, default: Date.now },
  
  // Sync metadata
  syncData: {
    lastFullSync: { type: Date, default: Date.now },
    lastQuickSync: { type: Date, default: Date.now },
    syncVersion: { type: Number, default: 1 },
    conflictResolutionNeeded: { type: Boolean, default: false }
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now }
});

// ============================================================================
// 3. USER SCHEMA METHODS (AI & Legacy Support)
// ============================================================================

// AI Usage Methods
userSchema.methods.getCurrentMonthAIUsage = function() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  
  if (!this.aiUsage.has(monthKey)) {
    this.aiUsage.set(monthKey, { 
      messages: 0, 
      images: 0, 
      lastUsed: new Date(),
      contexts: {
        general: 0,
        lesson: 0,
        explanation: 0,
        exercise: 0,
        hint: 0,
        homework: 0
      },
      lessonUsage: new Map()
    });
  }
  
  return this.aiUsage.get(monthKey);
};

// Backward compatibility
userSchema.methods.getCurrentMonthUsage = function() {
  return this.getCurrentMonthAIUsage();
};

// Enhanced AI usage increment
userSchema.methods.incrementAIUsage = async function(options = {}) {
  const {
    messageCount = 0,
    imageCount = 0,
    context = 'general',
    lessonId = null
  } = options;
  
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  
  let currentUsage = this.aiUsage.get(monthKey) || { 
    messages: 0, 
    images: 0, 
    lastUsed: new Date(),
    contexts: {
      general: 0,
      lesson: 0,
      explanation: 0,
      exercise: 0,
      hint: 0,
      homework: 0
    },
    lessonUsage: new Map()
  };
  
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
    currentUsage.lessonUsage.set(lessonId, lessonUsageCount + messageCount);
  }
  
  this.aiUsage.set(monthKey, currentUsage);
  
  // Backward compatibility
  this.homeworkUsage.set(monthKey, {
    messages: currentUsage.messages,
    images: currentUsage.images,
    lastUsed: currentUsage.lastUsed
  });
  
  await this.save();
  return currentUsage;
};

// Backward compatibility
userSchema.methods.incrementUsage = async function(messageCount = 0, imageCount = 0) {
  return this.incrementAIUsage({ messageCount, imageCount });
};

// Monthly reset check
userSchema.methods.checkMonthlyReset = async function() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  if (!this.lastResetCheck) {
    this.lastResetCheck = now;
    await this.save();
    return false;
  }
  
  const lastReset = new Date(this.lastResetCheck);
  const lastMonth = lastReset.getMonth();
  const lastYear = lastReset.getFullYear();
  
  if (currentYear > lastYear || (currentYear === lastYear && currentMonth > lastMonth)) {
    const monthKey = `${currentYear}-${currentMonth}`;
    const newUsageData = { 
      messages: 0, 
      images: 0, 
      lastUsed: now,
      contexts: {
        general: 0,
        lesson: 0,
        explanation: 0,
        exercise: 0,
        hint: 0,
        homework: 0
      },
      lessonUsage: new Map()
    };
    
    this.aiUsage.set(monthKey, newUsageData);
    this.homeworkUsage.set(monthKey, { messages: 0, images: 0, lastUsed: now });
    this.lastResetCheck = now;
    
    // Clean up old usage data (keep only last 6 months)
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);
    
    for (const [key] of this.aiUsage) {
      const [year, month] = key.split('-').map(Number);
      const keyDate = new Date(year, month);
      if (keyDate < cutoffDate) {
        this.aiUsage.delete(key);
        this.homeworkUsage.delete(key);
      }
    }
    
    await this.save();
    return true;
  }
  
  return false;
};

// Get usage limits
userSchema.methods.getUsageLimits = function() {
  const planToCheck = this.subscription?.plan || this.subscriptionPlan || 'free';
  
  const limits = {
    free: { messages: 50, images: 5 },
    start: { messages: -1, images: 20 },
    pro: { messages: -1, images: -1 },
    premium: { messages: -1, images: -1 }
  };
  
  return limits[planToCheck] || limits.free;
};

// Check AI usage limits
userSchema.methods.checkAIUsageLimits = function(hasImage = false) {
  const currentUsage = this.getCurrentMonthAIUsage();
  const limits = this.getUsageLimits();
  
  if (limits.messages !== -1 && currentUsage.messages >= limits.messages) {
    return {
      allowed: false,
      reason: 'message_limit_exceeded',
      message: `Достигнут лимит сообщений (${limits.messages}) для плана "${this.subscription?.plan || this.subscriptionPlan}". Обновите план для продолжения.`
    };
  }
  
  if (hasImage && limits.images !== -1 && currentUsage.images >= limits.images) {
    return {
      allowed: false,
      reason: 'image_limit_exceeded',
      message: `Достигнут лимит изображений (${limits.images}) для плана "${this.subscription?.plan || this.subscriptionPlan}". Обновите план для продолжения.`
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

// Backward compatibility
userSchema.methods.checkUsageLimits = function(hasImage = false) {
  return this.checkAIUsageLimits(hasImage);
};

// Get AI usage statistics
userSchema.methods.getAIUsageStats = function(months = 3) {
  const stats = [];
  const now = new Date();
  
  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    const usage = this.aiUsage.get(monthKey) || { 
      messages: 0, 
      images: 0, 
      contexts: {},
      lessonUsage: new Map()
    };
    
    stats.unshift({
      month: monthKey,
      date: date,
      messages: usage.messages,
      images: usage.images,
      contexts: usage.contexts || {},
      lessonCount: usage.lessonUsage ? usage.lessonUsage.size : 0,
      totalInteractions: usage.messages + usage.images
    });
  }
  
  return stats;
};

// Get most used lessons
userSchema.methods.getMostUsedLessons = function(limit = 5) {
  const currentUsage = this.getCurrentMonthAIUsage();
  if (!currentUsage.lessonUsage || currentUsage.lessonUsage.size === 0) {
    return [];
  }
  
  const lessonUsageArray = Array.from(currentUsage.lessonUsage.entries())
    .map(([lessonId, count]) => ({ lessonId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  
  return lessonUsageArray;
};

// Get context usage breakdown
userSchema.methods.getContextUsageBreakdown = function() {
  const currentUsage = this.getCurrentMonthAIUsage();
  const contexts = currentUsage.contexts || {};
  
  const total = Object.values(contexts).reduce((sum, count) => sum + count, 0);
  
  if (total === 0) {
    return {};
  }
  
  const breakdown = {};
  for (const [context, count] of Object.entries(contexts)) {
    breakdown[context] = {
      count: count,
      percentage: Math.round((count / total) * 100)
    };
  }
  
  return breakdown;
};

// Check if user needs upgrade suggestion
userSchema.methods.shouldSuggestUpgrade = function() {
  const currentUsage = this.getCurrentMonthAIUsage();
  const plan = this.subscription?.plan || this.subscriptionPlan || 'free';
  
  if (plan === 'pro' || plan === 'premium') {
    return { shouldSuggest: false };
  }
  
  if (plan === 'free') {
    if (currentUsage.messages > 30 || currentUsage.images > 3) {
      return {
        shouldSuggest: true,
        recommendedPlan: 'start',
        reason: 'Вы активно используете AI помощника. План Start даст вам безлимитные сообщения.',
        benefits: ['Безлимитные сообщения', '20 изображений в месяц', 'Приоритетная поддержка']
      };
    }
  } else if (plan === 'start') {
    if (currentUsage.images > 15) {
      return {
        shouldSuggest: true,
        recommendedPlan: 'pro',
        reason: 'Вы часто используете изображения. План Pro даст полную свободу.',
        benefits: ['Безлимитные сообщения', 'Безлимитные изображения', 'Премиум функции']
      };
    }
  }
  
  return { shouldSuggest: false };
};

// Sync subscription data from legacy fields
userSchema.methods.syncSubscriptionData = function() {
  if (!this.subscription || !this.subscription.plan) {
    this.subscription = {
      plan: this.subscriptionPlan || 'free',
      status: (this.subscriptionPlan && this.subscriptionPlan !== 'free') ? 'active' : 'inactive',
      source: null,
      startDate: null,
      expiryDate: null,
      isAutoRenew: false,
      paymentHistory: [],
      promocodesUsed: [],
      details: {},
      lastSync: new Date()
    };
  }
  return this.subscription;
};

// Indexes for performance
userSchema.index({ firebaseId: 1 });
userSchema.index({ email: 1 });
userSchema.index({ 'subscription.plan': 1 });
userSchema.index({ subscriptionPlan: 1 }); // Legacy support
userSchema.index({ lastResetCheck: 1 });
userSchema.index({ 'syncData.lastFullSync': 1 });

// ============================================================================
// 4. USER SERVICE CLASS
// ============================================================================

class UserService {
  constructor() {
    this.User = mongoose.model('User', userSchema);
  }

  // 🚀 COMPLETE USER DATA SYNC
  async syncUserData(firebaseId, localData = {}) {
    console.log('🔄 Starting complete user data sync for:', firebaseId);
    
    try {
      let user = await this.User.findOne({ firebaseId }).populate([
        { path: 'studyList.topicId', select: 'name subject level' },
        { path: 'progress.lessonId', select: 'title subject topicId' },
        { path: 'progress.topicId', select: 'name subject' }
      ]);

      if (!user) {
        console.log('🆕 Creating new user with initial data');
        user = await this.createUserWithData(firebaseId, localData);
      } else {
        console.log('🔄 Syncing existing user data');
        user = await this.mergeUserData(user, localData);
      }

      return {
        success: true,
        user: this.sanitizeUserData(user),
        syncTimestamp: Date.now(),
        message: 'User data synchronized successfully'
      };

    } catch (error) {
      console.error('❌ User sync failed:', error);
      return {
        success: false,
        error: error.message,
        user: null
      };
    }
  }

  // Create new user with initial local data
  async createUserWithData(firebaseId, localData) {
    const userData = {
      firebaseId,
      email: localData.email,
      name: localData.name || localData.displayName || 'User',
      Login: localData.email,
      
      // Sync subscription from local data
      subscription: {
        plan: localData.subscriptionPlan || 'free',
        status: (localData.subscriptionPlan && localData.subscriptionPlan !== 'free') ? 'active' : 'inactive',
        source: localData.subscriptionSource || null,
        startDate: localData.subscriptionStartDate || null,
        expiryDate: localData.subscriptionExpiryDate || null,
        lastSync: new Date()
      },
      
      // Legacy subscription sync
      subscriptionPlan: localData.subscriptionPlan || 'free',
      paymentStatus: localData.paymentStatus || 'unpaid',
      
      // Sync study list from local data
      studyList: this.parseLocalStudyList(localData.studyList || []),
      
      // Sync progress from local data
      progress: this.parseLocalProgress(localData.progress || []),
      progressLegacy: localData.progress || {},
      
      // Sync preferences from local data
      preferences: {
        ...localData.preferences,
        language: localData.language || 'ru'
      },
      
      syncData: {
        lastFullSync: new Date(),
        syncVersion: 1
      }
    };

    const user = new this.User(userData);
    await user.save();
    
    console.log('✅ Created user with synced data:', user.firebaseId);
    return user;
  }

  // Merge server and local data intelligently
  async mergeUserData(user, localData) {
    const updates = {};
    let hasUpdates = false;

    // 1. Subscription data merge
    if (localData.subscriptionPlan || localData.subscription) {
      const localSub = localData.subscription || {
        plan: localData.subscriptionPlan,
        source: localData.subscriptionSource,
        expiryDate: localData.subscriptionExpiryDate
      };

      const shouldUpdateSubscription = this.shouldUpdateSubscription(user.subscription, localSub);
      if (shouldUpdateSubscription) {
        updates['subscription'] = {
          ...user.subscription,
          ...localSub,
          lastSync: new Date()
        };
        // Update legacy field too
        updates['subscriptionPlan'] = localSub.plan || localData.subscriptionPlan;
        hasUpdates = true;
        console.log('📊 Updating subscription data');
      }
    }

    // 2. Study list merge
    if (localData.studyList && Array.isArray(localData.studyList)) {
      const mergedStudyList = await this.mergeStudyList(user.studyList, localData.studyList);
      if (mergedStudyList.hasChanges) {
        updates['studyList'] = mergedStudyList.data;
        hasUpdates = true;
        console.log('📚 Updating study list');
      }
    }

    // 3. Progress data merge
    if (localData.progress && (Array.isArray(localData.progress) || typeof localData.progress === 'object')) {
      const mergedProgress = await this.mergeProgress(user.progress, localData.progress);
      if (mergedProgress.hasChanges) {
        updates['progress'] = mergedProgress.data;
        updates['progressLegacy'] = localData.progress;
        hasUpdates = true;
        console.log('📈 Updating progress data');
      }
    }

    // 4. Preferences merge
    if (localData.preferences) {
      const mergedPreferences = this.mergePreferences(user.preferences, localData.preferences);
      if (mergedPreferences.hasChanges) {
        updates['preferences'] = mergedPreferences.data;
        hasUpdates = true;
        console.log('⚙️ Updating preferences');
      }
    }

    // Apply updates if any
    if (hasUpdates) {
      updates['syncData.lastFullSync'] = new Date();
      updates['syncData.syncVersion'] = (user.syncData.syncVersion || 1) + 1;
      updates['updatedAt'] = new Date();

      const updatedUser = await this.User.findByIdAndUpdate(
        user._id, 
        { $set: updates }, 
        { new: true, runValidators: true }
      ).populate([
        { path: 'studyList.topicId', select: 'name subject level' },
        { path: 'progress.lessonId', select: 'title subject topicId' }
      ]);

      console.log('✅ User data merged and updated');
      return updatedUser;
    }

    console.log('ℹ️ No updates needed, user data is current');
    return user;
  }

  // Smart subscription comparison
  shouldUpdateSubscription(serverSub, localSub) {
    if (!localSub) return false;
    
    // Local has paid subscription but server doesn't
    if (localSub.plan !== 'free' && (!serverSub || serverSub.plan === 'free')) {
      return true;
    }
    
    // Local subscription is newer
    if (localSub.lastSync && serverSub.lastSync) {
      return new Date(localSub.lastSync) > new Date(serverSub.lastSync);
    }
    
    return false;
  }

  // Merge study lists intelligently
  async mergeStudyList(serverList = [], localList = []) {
    const merged = [...serverList];
    let hasChanges = false;

    for (const localItem of localList) {
      const existingIndex = merged.findIndex(item => 
        item.topicId?.toString() === localItem.topicId?.toString()
      );

      if (existingIndex === -1) {
        // New item from local
        merged.push({
          topicId: localItem.topicId,
          subject: localItem.subject || 'General',
          name: localItem.name || localItem.topic || 'Unnamed Course',
          level: localItem.level || 'basic',
          progress: localItem.progress || 0,
          totalLessons: localItem.totalLessons || localItem.lessonCount || 0,
          completedLessons: localItem.completedLessons || 0,
          addedAt: localItem.addedAt ? new Date(localItem.addedAt) : new Date(),
          lastAccessedAt: new Date(),
          isActive: localItem.isActive !== false,
          metadata: localItem.metadata || {}
        });
        hasChanges = true;
      } else {
        // Update existing if local is newer
        const existing = merged[existingIndex];
        const localDate = new Date(localItem.lastAccessedAt || localItem.addedAt || 0);
        const serverDate = new Date(existing.lastAccessedAt || existing.addedAt || 0);

        if (localDate > serverDate) {
          merged[existingIndex] = {
            ...existing,
            progress: Math.max(existing.progress || 0, localItem.progress || 0),
            lastAccessedAt: new Date()
          };
          hasChanges = true;
        }
      }
    }

    return { data: merged, hasChanges };
  }

  // Merge progress data intelligently
  async mergeProgress(serverProgress = [], localProgress = []) {
    const merged = [...serverProgress];
    let hasChanges = false;

    // Handle both array and object formats for local progress
    const localProgressArray = Array.isArray(localProgress) 
      ? localProgress 
      : Object.entries(localProgress).map(([lessonId, data]) => ({
          lessonId,
          ...data
        }));

    for (const localItem of localProgressArray) {
      const existingIndex = merged.findIndex(item => 
        item.lessonId?.toString() === localItem.lessonId?.toString()
      );

      if (existingIndex === -1) {
        // New progress from local
        merged.push({
          lessonId: localItem.lessonId,
          topicId: localItem.topicId,
          completedSteps: localItem.completedSteps || [],
          progressPercent: localItem.progressPercent || 0,
          completed: localItem.completed || false,
          completedAt: localItem.completed ? new Date() : null,
          timeSpent: localItem.timeSpent || localItem.duration || 0,
          mistakes: localItem.mistakes || 0,
          stars: localItem.stars || 0,
          points: localItem.points || 0,
          hintsUsed: localItem.hintsUsed || 0,
          lastAccessedAt: new Date(),
          metadata: localItem.metadata || {}
        });
        hasChanges = true;
      } else {
        // Merge existing with local data (keep highest progress)
        const existing = merged[existingIndex];
        const shouldUpdate = 
          (localItem.progressPercent || 0) > (existing.progressPercent || 0) ||
          (localItem.completed && !existing.completed) ||
          (localItem.timeSpent || 0) > (existing.timeSpent || 0);

        if (shouldUpdate) {
          merged[existingIndex] = {
            ...existing,
            completedSteps: localItem.completedSteps?.length > existing.completedSteps?.length 
              ? localItem.completedSteps 
              : existing.completedSteps,
            progressPercent: Math.max(existing.progressPercent || 0, localItem.progressPercent || 0),
            completed: existing.completed || localItem.completed,
            completedAt: localItem.completed ? new Date() : existing.completedAt,
            timeSpent: Math.max(existing.timeSpent || 0, localItem.timeSpent || localItem.duration || 0),
            mistakes: Math.max(existing.mistakes || 0, localItem.mistakes || 0),
            stars: Math.max(existing.stars || 0, localItem.stars || 0),
            points: Math.max(existing.points || 0, localItem.points || 0),
            hintsUsed: Math.max(existing.hintsUsed || 0, localItem.hintsUsed || 0),
            lastAccessedAt: new Date(),
            metadata: { ...existing.metadata, ...localItem.metadata }
          };
          hasChanges = true;
        }
      }
    }

    return { data: merged, hasChanges };
  }

  // Merge preferences
  mergePreferences(serverPrefs = {}, localPrefs = {}) {
    const merged = { ...serverPrefs };
    let hasChanges = false;

    for (const [key, value] of Object.entries(localPrefs)) {
      if (merged[key] !== value) {
        merged[key] = value;
        hasChanges = true;
      }
    }

    return { data: merged, hasChanges };
  }

  // Sanitize user data for client response
  sanitizeUserData(user) {
    // Ensure subscription data is synced
    user.syncSubscriptionData();
    
    return {
      firebaseId: user.firebaseId,
      _id: user._id,
      uid: user.firebaseId,
      email: user.email,
      name: user.name,
      displayName: user.displayName || user.name,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
      
      // Subscription data (new format)
      subscription: user.subscription,
      
      // Legacy subscription fields for backward compatibility
      subscriptionPlan: user.subscription?.plan || user.subscriptionPlan || 'free',
      userStatus: user.subscription?.plan || user.subscriptionPlan || 'free',
      paymentStatus: user.paymentStatus,
      
      // Study data
      studyList: user.studyList,
      progress: user.progress,
      progressLegacy: user.progressLegacy, // For backward compatibility
      
      // Stats
      totalPoints: user.totalPoints,
      totalTimeSpent: user.totalTimeSpent,
      totalLessonsCompleted: user.totalLessonsCompleted,
      xp: user.xp,
      level: user.level,
      badges: user.badges,
      achievements: user.achievements,
      
      // Learning data
      homeworkSubmissions: user.homeworkSubmissions,
      testResults: user.testResults,
      goals: user.goals,
      diary: user.diary,
      
      // Preferences
      preferences: user.preferences,
      
      // AI Usage data
      aiUsage: user.aiUsage,
      homeworkUsage: user.homeworkUsage, // Backward compatibility
      currentMonthUsage: user.getCurrentMonthAIUsage(),
      usageLimits: user.getUsageLimits(),
      usageStats: user.getAIUsageStats(),
      
      // Sync metadata
      syncData: user.syncData,
      lastLoginAt: user.lastLoginAt,
      updatedAt: user.updatedAt,
      
      // Device tracking
      devices: user.devices
    };
  }

  // Parse local study list format
  parseLocalStudyList(localList) {
    if (!Array.isArray(localList)) return [];
    
    return localList.map(item => ({
      topicId: item.topicId,
      subject: item.subject || 'General',
      name: item.name || item.topic || 'Unnamed Course',
      level: item.level || 'basic',
      progress: item.progress || 0,
      totalLessons: item.totalLessons || item.lessonCount || 0,
      completedLessons: item.completedLessons || 0,
      addedAt: item.addedAt ? new Date(item.addedAt) : new Date(),
      lastAccessedAt: new Date(),
      isActive: item.isActive !== false,
      metadata: item.metadata || {}
    }));
  }

  // Parse local progress format
  parseLocalProgress(localProgress) {
    if (Array.isArray(localProgress)) {
      return localProgress.map(item => ({
        ...item,
        lastAccessedAt: new Date()
      }));
    }
    
    if (typeof localProgress === 'object') {
      return Object.entries(localProgress).map(([lessonId, data]) => ({
        lessonId,
        ...data,
        lastAccessedAt: new Date()
      }));
    }
    
    return [];
  }

  // Update device information
  async updateDeviceInfo(firebaseId, deviceInfo) {
    try {
      const user = await this.User.findOne({ firebaseId });
      if (!user) return false;

      const deviceId = this.generateDeviceId(deviceInfo);
      const existingDeviceIndex = user.devices.findIndex(d => d.deviceId === deviceId);

      const deviceData = {
        deviceId,
        deviceType: this.detectDeviceType(deviceInfo.userAgent),
        browser: this.detectBrowser(deviceInfo.userAgent),
        os: this.detectOS(deviceInfo.userAgent),
        lastSeen: new Date(),
        lastIP: deviceInfo.ip || null,
        isActive: true
      };

      if (existingDeviceIndex !== -1) {
        user.devices[existingDeviceIndex] = {
          ...user.devices[existingDeviceIndex],
          ...deviceData
        };
      } else {
        deviceData.firstSeen = new Date();
        user.devices.push(deviceData);
      }

      await user.save();
      return true;

    } catch (error) {
      console.error('Failed to update device info:', error);
      return false;
    }
  }

  // Generate device ID from device info
  generateDeviceId(deviceInfo) {
    const crypto = require('crypto');
    const deviceString = `${deviceInfo.userAgent}-${deviceInfo.platform}-${deviceInfo.screen?.width}x${deviceInfo.screen?.height}`;
    return crypto.createHash('md5').update(deviceString).digest('hex').substring(0, 16);
  }

  // Detect device type from user agent
  detectDeviceType(userAgent) {
    if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
      return /iPad/.test(userAgent) ? 'tablet' : 'mobile';
    }
    return 'web';
  }

  // Detect browser from user agent
  detectBrowser(userAgent) {
    if (/Chrome/.test(userAgent)) return 'Chrome';
    if (/Firefox/.test(userAgent)) return 'Firefox';
    if (/Safari/.test(userAgent)) return 'Safari';
    if (/Edge/.test(userAgent)) return 'Edge';
    return 'Unknown';
  }

  // Detect OS from user agent
  detectOS(userAgent) {
    if (/Windows/.test(userAgent)) return 'Windows';
    if (/Mac/.test(userAgent)) return 'macOS';
    if (/Linux/.test(userAgent)) return 'Linux';
    if (/Android/.test(userAgent)) return 'Android';
    if (/iPhone|iPad/.test(userAgent)) return 'iOS';
    return 'Unknown';
  }

  // Apply promocode
  async applyPromocode(firebaseId, promoCode, plan) {
    try {
      const user = await this.User.findOne({ firebaseId });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Check if promocode already used
      const alreadyUsed = user.subscription?.promocodesUsed?.some(p => p.code === promoCode);
      if (alreadyUsed) {
        return { success: false, error: 'Promocode already used' };
      }

      // Apply promocode (this would typically check against a promocodes collection)
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1); // 1 month

      // Update subscription
      user.subscription = {
        ...user.subscription,
        plan: plan,
        status: 'active',
        source: 'promocode',
        startDate: new Date(),
        expiryDate: expiryDate,
        lastSync: new Date()
      };

      // Add to promocodes used
      if (!user.subscription.promocodesUsed) {
        user.subscription.promocodesUsed = [];
      }
      user.subscription.promocodesUsed.push({
        code: promoCode,
        appliedAt: new Date(),
        expiryExtended: expiryDate,
        grantedPlan: plan
      });

      // Update legacy field
      user.subscriptionPlan = plan;
      user.paymentStatus = 'paid';

      await user.save();

      return {
        success: true,
        message: `Promocode applied successfully! ${plan.toUpperCase()} plan activated.`,
        expiryDate: expiryDate,
        user: this.sanitizeUserData(user)
      };

    } catch (error) {
      console.error('Promocode application failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get user by Firebase ID
  async getUserByFirebaseId(firebaseId) {
    try {
      const user = await this.User.findOne({ firebaseId }).populate([
        { path: 'studyList.topicId', select: 'name subject level' },
        { path: 'progress.lessonId', select: 'title subject topicId' }
      ]);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      return {
        success: true,
        user: this.sanitizeUserData(user)
      };

    } catch (error) {
      console.error('Failed to get user:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update user progress
  async updateUserProgress(firebaseId, progressData) {
    try {
      const user = await this.User.findOne({ firebaseId });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Find existing progress or create new
      const existingIndex = user.progress.findIndex(p => 
        p.lessonId?.toString() === progressData.lessonId?.toString()
      );

      if (existingIndex !== -1) {
        // Update existing progress
        user.progress[existingIndex] = {
          ...user.progress[existingIndex],
          ...progressData,
          lastAccessedAt: new Date()
        };
      } else {
        // Add new progress
        user.progress.push({
          ...progressData,
          lastAccessedAt: new Date()
        });
      }

      // Update legacy progress format too
      if (progressData.lessonId) {
        user.progressLegacy[progressData.lessonId] = progressData;
      }

      // Update sync data
      user.syncData.lastQuickSync = new Date();
      user.updatedAt = new Date();

      await user.save();

      return {
        success: true,
        message: 'Progress updated successfully',
        user: this.sanitizeUserData(user)
      };

    } catch (error) {
      console.error('Failed to update progress:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Add to study list
  async addToStudyList(firebaseId, courseData) {
    try {
      const user = await this.User.findOne({ firebaseId });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Check if already in study list
      const exists = user.studyList.some(item => 
        item.topicId?.toString() === courseData.topicId?.toString()
      );

      if (exists) {
        return { success: false, error: 'Course already in study list' };
      }

      // Add to study list
      user.studyList.unshift({
        topicId: courseData.topicId,
        subject: courseData.subject || 'General',
        name: courseData.name || courseData.topic || 'Unnamed Course',
        level: courseData.level || 'basic',
        progress: 0,
        totalLessons: courseData.totalLessons || 0,
        completedLessons: 0,
        addedAt: new Date(),
        lastAccessedAt: new Date(),
        isActive: true,
        metadata: courseData.metadata || {}
      });

      // Update sync data
      user.syncData.lastQuickSync = new Date();
      user.updatedAt = new Date();

      await user.save();

      return {
        success: true,
        message: 'Course added to study list',
        user: this.sanitizeUserData(user)
      };

    } catch (error) {
      console.error('Failed to add to study list:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Remove from study list
  async removeFromStudyList(firebaseId, topicId) {
    try {
      const user = await this.User.findOne({ firebaseId });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Remove from study list
      const initialLength = user.studyList.length;
      user.studyList = user.studyList.filter(item => 
        item.topicId?.toString() !== topicId?.toString()
      );

      if (user.studyList.length === initialLength) {
        return { success: false, error: 'Course not found in study list' };
      }

      // Update sync data
      user.syncData.lastQuickSync = new Date();
      user.updatedAt = new Date();

      await user.save();

      return {
        success: true,
        message: 'Course removed from study list',
        user: this.sanitizeUserData(user)
      };

    } catch (error) {
      console.error('Failed to remove from study list:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update preferences
  async updatePreferences(firebaseId, preferences) {
    try {
      const user = await this.User.findOne({ firebaseId });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Update preferences
      user.preferences = { ...user.preferences, ...preferences };

      // Update sync data
      user.syncData.lastQuickSync = new Date();
      user.updatedAt = new Date();

      await user.save();

      return {
        success: true,
        message: 'Preferences updated successfully',
        user: this.sanitizeUserData(user)
      };

    } catch (error) {
      console.error('Failed to update preferences:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// ============================================================================
// 5. CREATE AND EXPORT MODEL
// ============================================================================

const User = mongoose.model('User', userSchema);

// ============================================================================
// 6. EXPORTS
// ============================================================================

module.exports = {
  User,
  UserService,
  userSchema,
  
  // Schema exports for reference
  studyTopicSchema,
  subscriptionSchema,
  deviceSchema,
  progressSchema,
  goalSchema,
  diaryEntrySchema,
  homeworkSubmissionSchema,
  testResultSchema,
  aiUsageSchema
};