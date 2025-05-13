const mongoose = require('mongoose');

// ✅ Study Plan
const studyPlanSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  levels: { type: [Number], default: [] },
  topics: { type: [String], default: [] },
}, { _id: false });

// ✅ User Goals
const goalSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: String,
  startDate: Date,
  endDate: Date,
  targetLessons: { type: Number, default: 0 },
  completedLessons: { type: Number, default: 0 },
  progress: { type: Number, default: 0 },
}, { _id: false });

// ✅ User Diary Entries
const diaryEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  studyMinutes: Number,
  completedTopics: Number,
  averageGrade: Number,
}, { _id: false });

// ✅ User Schema
const userSchema = new mongoose.Schema({
  firebaseId: { type: String, required: true, unique: true },
  name: String,
  email: { type: String, required: true, unique: true },
  photoURL: String,

  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  subscriptionPlan: { type: String, enum: ['free', 'start', 'pro'], default: 'free' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },

  studyPlan: [studyPlanSchema],
  progress: { type: Object, default: {} },
  goals: [goalSchema],
  diary: [diaryEntrySchema],

  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  badges: { type: [String], default: [] },

  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
module.exports = User;
