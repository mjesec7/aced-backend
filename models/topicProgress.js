// backend/models/topicProgress.js
const mongoose = require('mongoose');

const topicProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Link to User
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true }, // Link to Topic
  
  totalLessons: { type: Number, required: true, default: 0 },
  completedLessons: { type: Number, required: true, default: 0 },
  
  percent: { type: Number, default: 0 }, // 0-100 progress
  medal: { 
    type: String, 
    enum: ['none', 'bronze', 'silver', 'gold'], 
    default: 'none' 
  },
}, { timestamps: true });

const TopicProgress = mongoose.model('TopicProgress', topicProgressSchema);

module.exports = TopicProgress;
