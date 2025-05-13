const mongoose = require('mongoose');

// ✅ Study List Topic Entry
const studyTopicSchema = new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
  subject: { type: String, required: true },
  name: { type: String, required: true },
  level: { type: String, default: 'basic' },
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

// ✅ Learning Goal
const goalSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: String,
  startDate: Date,
  endDate: Date,
  targetLessons: { type: Number, default: 0 },
  completedLessons: { type: Number, default: 0 },
  progress: { type: Number, default: 0 }
}, { _id: false });

// ✅ Diary Entry
const diaryEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  studyMinutes: Number,
  completedTopics: Number,
  averageGrade: Number
}, { _id: false });

// ✅ User Model
const userSchema = new mongoose.Schema({
  firebaseId: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, required: true, unique: true },
  photoURL: String,

  role: { type: String, enum: ['admin', 'user'], default: 'user' },

  // 🔐 Subscription System
  subscriptionPlan: { type: String, enum: ['free', 'start', 'pro'], default: 'free' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },

  // 🧠 Study
  studyList: [studyTopicSchema],
  progress: { type: Object, default: {} },

  // 🎯 Goals & Diary
  goals: [goalSchema],
  diary: [diaryEntrySchema],

  // 🏆 XP, Leveling, Badges
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  badges: { type: [String], default: [] },

  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
module.exports = User;
