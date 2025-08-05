// models/user.js - ENHANCED VERSION WITH AI INTEGRATION SUPPORT
const mongoose = require('mongoose');

// ✅ Study List Entry Schema
const studyTopicSchema = new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
  subject: { type: String, required: true },
  name: { type: String, required: true },
  level: { type: String, default: 'basic' },
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

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
  questions: [ // Manual and auto
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

// ✅ ENHANCED: AI Usage Schema (renamed from monthlyUsageSchema for clarity)
const aiUsageSchema = new mongoose.Schema({
  messages: { type: Number, default: 0 },
  images: { type: Number, default: 0 },
  lastUsed: { type: Date, default: Date.now },
  // ✅ NEW: AI Context tracking
  contexts: {
    general: { type: Number, default: 0 },        // General chat
    lesson: { type: Number, default: 0 },          // Lesson-specific help
    explanation: { type: Number, default: 0 },     // Help with explanations
    exercise: { type: Number, default: 0 },        // Exercise assistance
    hint: { type: Number, default: 0 },            // Smart hints
    homework: { type: Number, default: 0 }         // Homework help
  },
  // ✅ NEW: Lesson-specific usage tracking
  lessonUsage: {
    type: Map,
    of: Number,
    default: new Map()
  }
}, { _id: false });

// ✅ Main User Schema
const userSchema = new mongoose.Schema({
  // 🔐 Firebase Credentials
  firebaseId: { type: String, required: true, unique: true },
  Login: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, required: true, unique: true },
  photoURL: String,

  // 🧑 Role
  role: { type: String, enum: ['admin', 'user'], default: 'user' },

  // 💳 Subscription Info
  subscriptionPlan: {
    type: String,
    enum: ['free', 'start', 'pro'],
    default: 'free'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'unpaid'],
    default: 'unpaid'
  },
  isBlocked: { type: Boolean, default: false },

  // 📚 Learning
  studyList: [studyTopicSchema],
  progress: {
    type: Object,
    default: {} // e.g. { lessonId: { completedSteps: [], completed: true, stars: 3, timeSpent: 900 } }
  },

  // 💡 Homework & Tests
  homeworkSubmissions: [homeworkSubmissionSchema],
  testResults: [testResultSchema],

  // 🧠 Points System
  totalPoints: { type: Number, default: 0 },

  // 🎯 Goals & Diary
  goals: [goalSchema],
  diary: [diaryEntrySchema],

  // 🏆 Gamification
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  badges: { type: [String], default: [] },

  // ✅ ENHANCED: AI Usage Tracking (renamed for clarity and enhanced functionality)
  aiUsage: {
    type: Map,
    of: aiUsageSchema,
    default: new Map()
  },
  
  // ✅ BACKWARD COMPATIBILITY: Keep existing homeworkUsage for legacy support
  homeworkUsage: {
    type: Map,
    of: aiUsageSchema,
    default: new Map()
  },
  
  lastResetCheck: { type: Date, default: Date.now },

  // 🕐 Timestamps
  createdAt: { type: Date, default: Date.now }
});

// ✅ ENHANCED: Get current month AI usage (replaces getCurrentMonthUsage)
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

// ✅ BACKWARD COMPATIBILITY: Keep existing method name
userSchema.methods.getCurrentMonthUsage = function() {
  return this.getCurrentMonthAIUsage();
};

// ✅ ENHANCED: Increment AI usage with context and lesson tracking
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
  
  // ✅ BACKWARD COMPATIBILITY: Also update homeworkUsage for legacy support
  this.homeworkUsage.set(monthKey, {
    messages: currentUsage.messages,
    images: currentUsage.images,
    lastUsed: currentUsage.lastUsed
  });
  
  await this.save();
  return currentUsage;
};

// ✅ BACKWARD COMPATIBILITY: Keep existing method name
userSchema.methods.incrementUsage = async function(messageCount = 0, imageCount = 0) {
  return this.incrementAIUsage({ messageCount, imageCount });
};

// ✅ ENHANCED: Monthly reset with AI data cleanup
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
  
  // Check if month changed
  if (currentYear > lastYear || (currentYear === lastYear && currentMonth > lastMonth)) {
    // Reset current month usage
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
    this.homeworkUsage.set(monthKey, { messages: 0, images: 0, lastUsed: now }); // Backward compatibility
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

// ✅ ENHANCED: Get usage limits based on plan
userSchema.methods.getUsageLimits = function() {
  const limits = {
    free: { messages: 50, images: 5 },
    start: { messages: -1, images: 20 }, // -1 means unlimited
    pro: { messages: -1, images: -1 }
  };
  
  return limits[this.subscriptionPlan] || limits.free;
};

// ✅ ENHANCED: Check if AI usage is within limits
userSchema.methods.checkAIUsageLimits = function(hasImage = false) {
  const currentUsage = this.getCurrentMonthAIUsage();
  const limits = this.getUsageLimits();
  
  // Check message limit
  if (limits.messages !== -1 && currentUsage.messages >= limits.messages) {
    return {
      allowed: false,
      reason: 'message_limit_exceeded',
      message: `Достигнут лимит сообщений (${limits.messages}) для плана "${this.subscriptionPlan}". Обновите план для продолжения.`
    };
  }
  
  // Check image limit
  if (hasImage && limits.images !== -1 && currentUsage.images >= limits.images) {
    return {
      allowed: false,
      reason: 'image_limit_exceeded',
      message: `Достигнут лимит изображений (${limits.images}) для плана "${this.subscriptionPlan}". Обновите план для продолжения.`
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

// ✅ BACKWARD COMPATIBILITY: Keep existing method name
userSchema.methods.checkUsageLimits = function(hasImage = false) {
  return this.checkAIUsageLimits(hasImage);
};

// ✅ NEW: Get AI usage statistics
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

// ✅ NEW: Get most used lessons
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

// ✅ NEW: Get AI context usage breakdown
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

// ✅ NEW: Check if user needs upgrade suggestion
userSchema.methods.shouldSuggestUpgrade = function() {
  const currentUsage = this.getCurrentMonthAIUsage();
  const limits = this.getUsageLimits();
  const plan = this.subscriptionPlan;
  
  // Don't suggest upgrade for pro users
  if (plan === 'pro') {
    return { shouldSuggest: false };
  }
  
  // Suggest upgrade based on usage patterns
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

// ✅ Indexes for better performance
userSchema.index({ firebaseId: 1 });
userSchema.index({ email: 1 });
userSchema.index({ subscriptionPlan: 1 });
userSchema.index({ lastResetCheck: 1 });

const User = mongoose.model('User', userSchema);
module.exports = User;