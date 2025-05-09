const mongoose = require('mongoose');

// ✅ User Schema
const UserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', UserSchema);

// ✅ Subject Schema
const SubjectSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  icon: { type: String }, // optional: URL or icon name
  createdAt: { type: Date, default: Date.now },
});

const Subject = mongoose.model('Subject', SubjectSchema);

// ✅ Export both models
module.exports = {
  User,
  Subject,
};
