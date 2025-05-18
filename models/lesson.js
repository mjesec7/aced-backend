const mongoose = require('mongoose');

// ✅ Single exercise inside a group
const exerciseItemSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  options: { type: [String], default: [] },
  hint: { type: String, default: '' }
}, { _id: false });

// ✅ Exercise group schema (10 questions per group)
const exerciseGroupSchema = new mongoose.Schema({
  groupTitle: { type: String, default: '' },
  questions: { type: [exerciseItemSchema], required: true }
}, { _id: false });

// ✅ Quiz schema
const quizSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: {
    type: [String],
    required: true,
    validate: [val => val.length >= 2, '❌ Квиз должен иметь минимум два варианта ответа.']
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
    validate: [val => val.length >= 2, '❌ ABC упражнение должно иметь минимум два варианта.']
  },
  correctAnswer: { type: String, required: true }
}, { _id: false });

// ✅ Main Lesson schema
const lessonSchema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true },
  level: { type: Number, required: true, min: 1 },
  topic: { type: String, required: true, trim: true },
  topicId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Topic' },
  lessonName: { type: String, required: true, trim: true },
  type: { type: String, enum: ['free', 'premium'], default: 'free' },
  description: { type: String, required: true, trim: true },

  // ✅ New: list of explanations
  explanations: { type: [String], default: [] },

  // ✅ New: grouped exercises (10 questions each)
  exerciseGroups: { type: [exerciseGroupSchema], default: [] },

  // ✅ New: full quiz block
  quiz: { type: [quizSchema], default: [] },

  // ✅ Optional compatibility fields
  explanation: { type: String, default: '', trim: true },
  examples: { type: String, default: '', trim: true },
  content: { type: String, default: '', trim: true },
  hint: { type: String, default: '', trim: true },
  exercises: { type: [exerciseItemSchema], default: [] },
  abcExercises: { type: [abcExerciseSchema], default: [] },
  relatedSubjects: { type: [String], default: [] },
  translations: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// ✅ Hooks for logging
lessonSchema.pre('save', function (next) {
  console.log(`🛠️ [Pre-Save] Saving lesson: "${this.lessonName || 'Unnamed'}"`);
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

module.exports = mongoose.model('Lesson', lessonSchema);
