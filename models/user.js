const mongoose = require('mongoose');

// ✅ Study List Entry Schema
const studyTopicSchema = new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
  subject: { type: String, required: true },
  name: { type: String, required: true }, // Only the plain localized string (not object)
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

// ✅ Main User Schema
const userSchema = new mongoose.Schema({
  // 🔐 Firebase Credentials
  firebaseId: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, required: true, unique: true },
  photoURL: String,

  // 🧑 Role
  role: { type: String, enum: ['admin', 'user'], default: 'user' },

  // 💳 Subscription Info
  subscriptionPlan: {
    type: String,
    enum: ['free', 'start', 'pro'],
    default: 'free' // ✅ Always defaults to free
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },

  // 📚 Learning
  studyList: [studyTopicSchema],
  progress: {
    type: Object,
    default: {} // { lessonId: { completed: true, score: X, ... } }
  },

  // 🎯 Goals & Diary
  goals: [goalSchema],
  diary: [diaryEntrySchema],

  // 🏆 Gamification
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  badges: { type: [String], default: [] },

  // 🕐 Timestamps
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
module.exports = User;
