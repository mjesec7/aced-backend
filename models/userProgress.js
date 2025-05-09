// models/userProgress.js

const mongoose = require('mongoose');

const userProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  topicId: { type: String, required: true },
  percent: { type: Number, default: 0 },
  medal: { type: String, enum: ['none', 'bronze', 'silver', 'gold'], default: 'none' },
}, { timestamps: true });

module.exports = mongoose.model('UserProgress', userProgressSchema);
