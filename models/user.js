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

// ✅ NEW: Monthly Homework Usage Schema
const monthlyUsageSchema = new mongoose.Schema({
  messages: { type: Number, default: 0 },
  images: { type: Number, default: 0 },
  lastUsed: { type: Date, default: Date.now }
}, { _id: false });

// ✅ Main User Schema
const userSchema = new mongoose.Schema({
  // 🔐 Firebase Credentials
  firebaseId: { type: String, required: true, unique: true },
  login: { type: String, required: true, unique: true },
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

  // ✅ NEW: Homework Help Usage Tracking
  homeworkUsage: {
    type: Map,
    of: monthlyUsageSchema,
    default: new Map()
  },
  lastResetCheck: { type: Date, default: Date.now },

  // 🕐 Timestamps
  createdAt: { type: Date, default: Date.now }
});

// ✅ Helper method to get current month usage
userSchema.methods.getCurrentMonthUsage = function() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  
  if (!this.homeworkUsage.has(monthKey)) {
    this.homeworkUsage.set(monthKey, { messages: 0, images: 0, lastUsed: new Date() });
  }
  
  return this.homeworkUsage.get(monthKey);
};

// ✅ Helper method to increment usage
userSchema.methods.incrementUsage = async function(messageCount = 0, imageCount = 0) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  
  let currentUsage = this.homeworkUsage.get(monthKey) || { messages: 0, images: 0, lastUsed: new Date() };
  
  currentUsage.messages += messageCount;
  currentUsage.images += imageCount;
  currentUsage.lastUsed = now;
  
  this.homeworkUsage.set(monthKey, currentUsage);
  
  await this.save();
  return currentUsage;
};

// ✅ Helper method to check monthly reset
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
    this.homeworkUsage.set(monthKey, { messages: 0, images: 0, lastUsed: now });
    this.lastResetCheck = now;
    
    await this.save();
    console.log(`🔄 Monthly usage reset for user ${this.firebaseId}`);
    return true;
  }
  
  return false;
};

// ✅ Helper method to get usage limits based on plan
userSchema.methods.getUsageLimits = function() {
  const limits = {
    free: { messages: 50, images: 5 },
    start: { messages: -1, images: 20 }, // -1 means unlimited
    pro: { messages: -1, images: -1 }
  };
  
  return limits[this.subscriptionPlan] || limits.free;
};

// ✅ Helper method to check if usage is within limits
userSchema.methods.checkUsageLimits = function(hasImage = false) {
  const currentUsage = this.getCurrentMonthUsage();
  const limits = this.getUsageLimits();
  
  // Check message limit
  if (limits.messages !== -1 && currentUsage.messages >= limits.messages) {
    return {
      allowed: false,
      reason: 'message_limit_exceeded',
      message: `Достигнут лимит сообщений (${limits.messages}) для плана "${this.subscriptionPlan}".`
    };
  }
  
  // Check image limit
  if (hasImage && limits.images !== -1 && currentUsage.images >= limits.images) {
    return {
      allowed: false,
      reason: 'image_limit_exceeded',
      message: `Достигнут лимит изображений (${limits.images}) для плана "${this.subscriptionPlan}".`
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

const User = mongoose.model('User', userSchema);
module.exports = User;