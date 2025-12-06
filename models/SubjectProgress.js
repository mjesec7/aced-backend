const mongoose = require('mongoose');

const SubjectProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  subjectName: { type: String, required: true },
  progress: { type: Number, default: 0 } // 0 to 100
});

module.exports = mongoose.model('SubjectProgress', SubjectProgressSchema);
