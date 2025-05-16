const mongoose = require('mongoose');

// ✅ Exercise schema
const exerciseSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  options: { type: [String], default: [] }
}, { _id: false });

// ✅ Quiz schema
const quizSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: {
    type: [String],
    default: [],
    validate: [val => val.length >= 2, '❌ Квиз должен иметь как минимум два варианта ответа.']
  },
  answer: { type: String, required: true }
}, { _id: false });

// ✅ ABC Exercise schema
const abcExerciseSchema = new mongoose.Schema({
  question: { type: String, required: true },
  instruction: { type: String, default: '' },
  options: {
    type: [String],
    required: true,
    validate: [val => val.length >= 2, '❌ ABC упражнение должно иметь как минимум два варианта ответа.']
  },
  correctAnswer: { type: String, required: true }
}, { _id: false });

// ✅ Multilingual string schema
const localizedString = {
  en: { type: String, default: '' },
  ru: { type: String, default: '' },
  uz: { type: String, default: '' }
};

// ✅ Main lesson schema
const lessonSchema = new mongoose.Schema({
  // 🧠 Metadata
  subject: { type: String, required: true, trim: true },
  level: { type: Number, required: true, min: 1 },
  topic: { type: String, required: true, trim: true },
  topicId: { type: String, required: true, trim: true },
  lessonName: { type: localizedString, required: true },
  type: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  },

  // 📝 Main content
  description: { type: localizedString, required: true },
  explanation: { type: localizedString, default: () => ({}) },
  examples: { type: localizedString, default: () => ({}) },
  content: { type: localizedString, default: () => ({}) },
  hint: { type: localizedString, default: () => ({}) },

  // 🧪 Exercises and quizzes
  exercises: { type: [exerciseSchema], default: [] },
  quizzes: { type: [quizSchema], default: [] },
  abcExercises: { type: [abcExerciseSchema], default: [] },

  // 🧩 Related subjects
  relatedSubjects: { type: [String], default: [] }

}, { timestamps: true });

// ✅ Logging hooks
lessonSchema.pre('save', function (next) {
  console.log(`🛠️ [Pre-Save] Saving lesson: "${this.lessonName.en || 'Unnamed'}"`);
  next();
});

lessonSchema.post('save', function (doc) {
  console.log(`✅ [Post-Save] Lesson saved: "${doc.lessonName.en || 'Unnamed'}" (ID: ${doc._id})`);
});

lessonSchema.post('find', function (docs) {
  console.log(`🔎 [Find] Lessons found: ${docs.length}`);
});

lessonSchema.post('findOne', function (doc) {
  if (doc) {
    console.log(`🔍 [FindOne] Lesson found: "${doc.lessonName.en || 'Unnamed'}" (ID: ${doc._id})`);
  } else {
    console.warn('⚠️ [FindOne] No lesson found.');
  }
});

lessonSchema.post('findOneAndUpdate', function (doc) {
  if (doc) {
    console.log(`🔄 [Update] Lesson updated: "${doc.lessonName.en || 'Unnamed'}" (ID: ${doc._id})`);
  } else {
    console.warn('⚠️ [Update] No lesson found to update.');
  }
});

lessonSchema.post('findOneAndDelete', function (doc) {
  if (doc) {
    console.log(`🗑️ [Delete] Lesson deleted: "${doc.lessonName.en || 'Unnamed'}" (ID: ${doc._id})`);
  } else {
    console.warn('⚠️ [Delete] No lesson found to delete.');
  }
});

const Lesson = mongoose.model('Lesson', lessonSchema);
module.exports = Lesson;
