const mongoose = require('mongoose');

// ✅ Enhanced Exercise schema for different types
const exerciseSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String },
  correctAnswer: { type: String },
  options: { type: [String], default: [] },
  points: { type: Number, default: 1 },
  includeInHomework: { type: Boolean, default: false }
}, { _id: false });

// ✅ Enhanced Quiz schema with multiple question types
const quizSchema = new mongoose.Schema({
  question: { type: String, required: true },
  type: {
    type: String,
    enum: ['multiple-choice', 'true-false', 'short-answer'],
    default: 'multiple-choice'
  },
  options: {
    type: [{
      text: { type: String, required: true }
    }],
    default: [],
    validate: [
      function(val) {
        // Only validate options for multiple-choice
        if (this.type === 'multiple-choice') {
          return val.length >= 2;
        }
        return true;
      },
      '❌ Multiple choice questions must have at least 2 options'
    ]
  },
  correctAnswer: { type: String },
  explanation: { type: String, default: '' }
}, { _id: false });

// ✅ Enhanced Vocabulary schema
const vocabSchema = new mongoose.Schema({
  term: { type: String, required: true },
  definition: { type: String, required: true },
  example: { type: String, default: '' }
}, { _id: false });

// ✅ Reading Questions schema
const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  answer: { type: String, required: true }
}, { _id: false });

// ✅ Enhanced Step schema supporting all new step types
const stepSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'explanation', 'example', 'practice', 'exercise', 
      'vocabulary', 'quiz', 'video', 'audio', 
      'reading', 'writing'
    ]
  },
  data: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true,
    validate: {
      validator: function(data) {
        // Validate based on step type
        switch (this.type) {
          case 'explanation':
          case 'example':
          case 'reading':
            return data && (typeof data.content === 'string' || typeof data === 'string');
          
          case 'exercise':
            return Array.isArray(data) && data.every(ex => 
              ex.question && (ex.answer || ex.correctAnswer)
            );
          
          case 'vocabulary':
            return Array.isArray(data) && data.every(vocab => 
              vocab.term && vocab.definition
            );
          
          case 'quiz':
            return Array.isArray(data) && data.every(quiz => 
              quiz.question && quiz.correctAnswer
            );
          
          case 'video':
          case 'audio':
            return data && (data.url || data.description);
          
          case 'practice':
            return data && (data.instructions || data.type);
          
          case 'writing':
            return data && (data.prompt || data.wordLimit);
          
          default:
            return true;
        }
      },
      message: '❌ Invalid data format for step type'
    }
  }
}, { _id: false });

// ✅ Main lesson schema with enhanced support
const lessonSchema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true },
  level: { type: Number, required: true, min: 1, max: 12 },
  topic: { type: String, required: true, trim: true },
  topicId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true, 
    ref: 'Topic' 
  },
  lessonName: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  },

  description: { type: String, required: true, trim: true },
  
  // ✅ Enhanced content fields
  explanations: { type: [String], default: [] },
  examples: { type: String, default: '', trim: true },
  content: { type: String, default: '', trim: true },
  hint: { type: String, default: '', trim: true },

  // ✅ New structured steps system
  steps: { 
    type: [stepSchema], 
    default: [],
    validate: [
      function(steps) {
        // Ensure at least one step exists
        return steps.length > 0;
      },
      '❌ Lesson must have at least one step'
    ]
  },
  
  // ✅ Legacy support for existing data
  quiz: { type: [quizSchema], default: [] },
  relatedSubjects: { type: [String], default: [] },

  // ✅ Enhanced homework support
  homework: {
    exercises: { type: [exerciseSchema], default: [] },
    quizzes: { type: [quizSchema], default: [] },
    totalExercises: { type: Number, default: 0 }
  },

  // ✅ Multilingual and metadata support
  translations: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: {
    difficulty: { 
      type: String, 
      enum: ['beginner', 'intermediate', 'advanced'], 
      default: 'beginner' 
    },
    estimatedDuration: { type: Number, default: 30 }, // in minutes
    prerequisites: { type: [String], default: [] },
    learningObjectives: { type: [String], default: [] }
  },

  // ✅ Performance and analytics
  stats: {
    viewCount: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 }
  },

  // ✅ Status and visibility
  isActive: { type: Boolean, default: true },
  isDraft: { type: Boolean, default: false },
  publishedAt: { type: Date },
  
}, { 
  timestamps: true,
  // ✅ Enable strict mode to prevent unexpected fields
  strict: true
});

// ✅ Indexes for better performance
lessonSchema.index({ subject: 1, level: 1 });
lessonSchema.index({ topicId: 1 });
lessonSchema.index({ subject: 1, level: 1, type: 1 });
lessonSchema.index({ isActive: 1, isDraft: 1 });

// ✅ Virtual for homework count
lessonSchema.virtual('homeworkCount').get(function() {
  return (this.homework?.exercises?.length || 0) + 
         (this.homework?.quizzes?.length || 0);
});

// ✅ Pre-save middleware to calculate homework totals
lessonSchema.pre('save', function(next) {
  if (this.homework) {
    this.homework.totalExercises = (this.homework.exercises?.length || 0) + 
                                   (this.homework.quizzes?.length || 0);
  }
  
  // Set published date if not draft and not already set
  if (!this.isDraft && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

// ✅ Static method to find lessons with homework
lessonSchema.statics.findWithHomework = function() {
  return this.find({
    $or: [
      { 'homework.exercises.0': { $exists: true } },
      { 'homework.quizzes.0': { $exists: true } }
    ]
  });
};

// ✅ Instance method to extract homework for separate homework creation
lessonSchema.methods.extractHomework = function() {
  const homeworkExercises = [];
  
  // Extract from steps marked for homework
  this.steps.forEach(step => {
    if (step.type === 'exercise' && Array.isArray(step.data)) {
      step.data.forEach(exercise => {
        if (exercise.includeInHomework) {
          homeworkExercises.push({
            question: exercise.question,
            correctAnswer: exercise.answer || exercise.correctAnswer,
            points: exercise.points || 1,
            type: 'short-answer'
          });
        }
      });
    }
    
    if (step.type === 'quiz' && Array.isArray(step.data)) {
      step.data.forEach(quiz => {
        homeworkExercises.push({
          question: quiz.question,
          type: quiz.type,
          options: quiz.options,
          correctAnswer: quiz.correctAnswer,
          points: 1
        });
      });
    }
  });
  
  // Add existing homework
  if (this.homework?.exercises) {
    homeworkExercises.push(...this.homework.exercises);
  }
  
  if (this.homework?.quizzes) {
    homeworkExercises.push(...this.homework.quizzes);
  }
  
  return homeworkExercises;
};

// ✅ Logging Hooks (keep existing ones)
lessonSchema.pre('save', function (next) {
  next();
});

lessonSchema.post('save', function (doc) {
});

lessonSchema.post('find', function (docs) {
});

lessonSchema.post('findOne', function (doc) {
  if (doc) {
  } else {
  }
});

lessonSchema.post('findOneAndUpdate', function (doc) {
  if (doc) {
  } else {
  }
});

lessonSchema.post('findOneAndDelete', function (doc) {
  if (doc) {
  } else {
  }
});

const Lesson = mongoose.model('Lesson', lessonSchema);
module.exports = Lesson;