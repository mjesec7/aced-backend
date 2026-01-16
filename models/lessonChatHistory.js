// models/lessonChatHistory.js - Stores AI chat history during lesson sessions
const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const lessonChatHistorySchema = new mongoose.Schema({
  // User identification
  userId: {
    type: String, // Firebase UID
    required: true,
    index: true
  },

  // Lesson identification
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    required: true,
    index: true
  },

  // Current step context
  currentStepIndex: {
    type: Number,
    default: 0
  },

  // Chat messages array
  messages: {
    type: [chatMessageSchema],
    default: []
  },

  // Session metadata
  sessionStartedAt: {
    type: Date,
    default: Date.now
  },

  lastMessageAt: {
    type: Date,
    default: Date.now
  },

  // Track topics discussed (for AI context)
  topicsDiscussed: {
    type: [String],
    default: []
  },

  // Track questions asked (for AI to avoid repetition)
  questionsAsked: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

// Compound index for efficient lookup
lessonChatHistorySchema.index({ userId: 1, lessonId: 1 }, { unique: true });

// TTL index - auto-delete chat history after 7 days of inactivity
lessonChatHistorySchema.index({ lastMessageAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

// Instance method to add a message
lessonChatHistorySchema.methods.addMessage = async function(role, content) {
  this.messages.push({
    role,
    content,
    timestamp: new Date()
  });
  this.lastMessageAt = new Date();

  // Keep only last 20 messages to prevent memory bloat
  if (this.messages.length > 20) {
    this.messages = this.messages.slice(-20);
  }

  return this.save();
};

// Instance method to get recent messages for AI context
lessonChatHistorySchema.methods.getRecentMessages = function(count = 10) {
  return this.messages.slice(-count);
};

// Static method to get or create chat history for a lesson
lessonChatHistorySchema.statics.getOrCreate = async function(userId, lessonId) {
  let history = await this.findOne({ userId, lessonId });

  if (!history) {
    history = new this({
      userId,
      lessonId,
      messages: [],
      sessionStartedAt: new Date()
    });
    await history.save();
  }

  return history;
};

// Static method to clear history for a lesson (e.g., when lesson is restarted)
lessonChatHistorySchema.statics.clearHistory = async function(userId, lessonId) {
  return this.findOneAndUpdate(
    { userId, lessonId },
    {
      messages: [],
      topicsDiscussed: [],
      questionsAsked: [],
      sessionStartedAt: new Date()
    },
    { new: true }
  );
};

const LessonChatHistory = mongoose.model('LessonChatHistory', lessonChatHistorySchema);
module.exports = LessonChatHistory;
