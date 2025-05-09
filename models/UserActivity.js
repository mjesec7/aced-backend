const mongoose = require('mongoose');

const UserActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, required: true },
  duration: { type: Number, default: 0 }, // in minutes
  points: { type: Number, default: 0 }    // optional "knowledge points"
});

module.exports = mongoose.model('UserActivity', UserActivitySchema);
