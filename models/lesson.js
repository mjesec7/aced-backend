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
  answer: { type: String },
  correctAnswer: { type: String }
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

// ✅ Vocabulary schema
const vocabSchema = new mongoose.Schema({
  term: { type: String, required: true },
  definition: { type: String, required: true }
}, { _id: false });

// ✅ Exercise Group schema
const exerciseGroupSchema = new mongoose.Schema({
  exercises: [exerciseSchema]
}, { _id: false });

// ✅ Step schema for custom structured lessons
const stepSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['explanation', 'example', 'tryout', 'exercise', 'quiz', 'vocabulary']
  },
  data: { type: mongoose.Schema.Types.Mixed, required: true }
}, { _id: false });

// ✅ Main lesson schema
const lessonSchema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true },
  level: { type: Number, required: true, min: 1 },
  topic: { type: String, required: true, trim: true },
  topicId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Topic' },
  lessonName: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  },

  description: { type: String, required: true, trim: true },
  explanations: { type: [String], default: [] },
  examples: { type: String, default: '', trim: true },
  content: { type: String, default: '', trim: true },
  hint: { type: String, default: '', trim: true },

  exerciseGroups: { type: [exerciseGroupSchema], default: [] },
  quiz: { type: [quizSchema], default: [] },
  relatedSubjects: { type: [String], default: [] },

  // ✅ NEW: Dynamic steps
  steps: { type: [stepSchema], default: [] },

  // ✅ NEW: Homework questions (separate from quiz)
  homework: {
    type: [abcExerciseSchema],
    default: []
  },

  translations: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// ✅ Logging Hooks
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

const Lesson = mongoose.model('Lesson', lessonSchema);
module.exports = Lesson;