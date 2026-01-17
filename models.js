const mongoose = require('mongoose');

// ✅ User Schema
const UserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String },
  subscriptionPlan: { type: String, enum: ['free', 'start', 'pro'], default: 'free' },
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

// ✅ Helper for multilingual fields
const MultiLangString = {
  en: { type: String, required: true },
  ru: { type: String, required: true },
  uz: { type: String, required: true },
};

// ✅ Lesson Schema (supports multilanguage)
const LessonSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  level: { type: Number, required: true },
  type: { type: String, enum: ['free', 'premium'], required: true },
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },

  lessonName: MultiLangString,
  description: MultiLangString,
  explanation: MultiLangString,
  examples: MultiLangString,
  content: MultiLangString,
  hint: MultiLangString,

  exercises: [
    {
      question: MultiLangString,
      answer: { type: String, required: true },
      options: [String]
    }
  ],

  quizzes: [
    {
      question: MultiLangString,
      answer: { type: String, required: true },
      options: [String]
    }
  ],

  relatedSubjects: [String],
  createdAt: { type: Date, default: Date.now }
});

const Lesson = mongoose.model('Lesson', LessonSchema);

module.exports = {
  User,
  Subject,
  Lesson,
};
