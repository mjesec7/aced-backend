const mongoose = require('mongoose');

// ✅ Exercises inside lesson
const exerciseSchema = new mongoose.Schema({
  question: { type: String, required: true },
  correctAnswer: { type: String, default: '' }
}, { _id: false });

// ✅ Quiz options inside lesson
const quizOptionSchema = new mongoose.Schema({
  option: { type: String, required: true }
}, { _id: false });

// ✅ Quiz block inside lesson
const quizSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: {
    type: [quizOptionSchema],
    default: [],
    validate: [arrayLimit, '❌ Квиз должен иметь как минимум два варианта ответа.']
  },
  correctAnswer: { type: String, required: true }
}, { _id: false });

// ✅ Helper to validate at least 2 quiz options
function arrayLimit(val) {
  return val.length >= 2;
}

// ✅ Lesson schema
const lessonSchema = new mongoose.Schema({
  // 🎯 Basic metadata
  subject: { type: String, required: true, trim: true },
  level: { type: Number, required: true, min: 1 },
  topic: { type: String, required: true, trim: true }, // ✅ CHANGED from ObjectId to String
  lessonName: { type: String, required: true, trim: true },

  // 🧠 Main lesson content
  explanation: { type: String, default: '' },
  content: { type: String, default: '' },
  examples: { type: String, default: '' },

  // 💡 Additional fields
  hint: { type: String, default: '' },
  exercise: { type: String, default: '' },
  exercises: {
    type: [exerciseSchema],
    default: []
  },
  quiz: {
    type: [quizSchema],
    default: []
  },
  relatedSubjects: {
    type: [String],
    default: []
  },

  // 🔓 Access level
  type: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  }
}, { timestamps: true });

/* ──────── LOGGING HOOKS ──────── */
lessonSchema.pre('save', function (next) {
  console.log(`🛠️ [Pre-Save] Saving lesson: "${this.lessonName}"`);
  next();
});

lessonSchema.post('save', function (doc) {
  console.log(`✅ [Post-Save] Lesson saved: "${doc.lessonName}" (ID: ${doc._id})`);
});

lessonSchema.post('find', function (docs) {
  console.log(`🔎 [Find] Lessons found: ${docs.length}`);
});

lessonSchema.post('findOne', function (doc) {
  if (doc) {
    console.log(`🔍 [FindOne] Lesson found: "${doc.lessonName}" (ID: ${doc._id})`);
  } else {
    console.warn('⚠️ [FindOne] No lesson found.');
  }
});

lessonSchema.post('findOneAndUpdate', function (doc) {
  if (doc) {
    console.log(`🔄 [Update] Lesson updated: "${doc.lessonName}" (ID: ${doc._id})`);
  } else {
    console.warn('⚠️ [Update] No lesson found to update.');
  }
});

lessonSchema.post('findOneAndDelete', function (doc) {
  if (doc) {
    console.log(`🗑️ [Delete] Lesson deleted: "${doc.lessonName}" (ID: ${doc._id})`);
  } else {
    console.warn('⚠️ [Delete] No lesson found to delete.');
  }
});

const Lesson = mongoose.model('Lesson', lessonSchema);
module.exports = Lesson;
