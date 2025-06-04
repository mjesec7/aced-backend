const mongoose = require('mongoose');

// ✅ Exercise Schema - Properly defined for homework exercises
const ExerciseSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['multiple-choice', 'text', 'essay', 'true-false', 'fill-blank', 'matching'],
    default: 'multiple-choice'
  },
  question: {
    type: String,
    required: true,
    trim: true
  },
  instruction: {
    type: String,
    default: ''
  },
  correctAnswer: {
    type: mongoose.Schema.Types.Mixed, // Can be string, number, or array
    required: true
  },
  options: [{
    text: {
      type: String,
      required: true
    },
    value: {
      type: String,
      required: true
    }
  }],
  points: {
    type: Number,
    default: 1,
    min: 0
  },
  difficulty: {
    type: Number,
    min: 1,
    max: 5,
    default: 1
  },
  category: {
    type: String,
    default: ''
  },
  tags: [{
    type: String,
    trim: true
  }],
  explanation: {
    type: String,
    default: ''
  },
  timeLimit: {
    type: Number, // in seconds
    default: null
  }
}, { _id: false }); // Disable auto _id generation since we provide our own

// ✅ Main Homework Schema
const HomeworkSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    enum: ['English', 'Math', 'Science', 'History', 'Geography', 'Literature', 'Physics', 'Chemistry', 'Biology', 'Other'],
    default: 'Other'
  },
  level: {
    type: String,
    required: [true, 'Level is required'],
    enum: ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced'],
    default: 'Beginner'
  },
  instructions: {
    type: String,
    trim: true,
    maxlength: [2000, 'Instructions cannot exceed 2000 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  
  // ✅ FIXED: Properly structured exercises array
  exercises: {
    type: [ExerciseSchema],
    default: [],
    validate: {
      validator: function(exercises) {
        return Array.isArray(exercises);
      },
      message: 'Exercises must be an array'
    }
  },
  
  // Linked lessons (optional)
  linkedLessonIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson'
  }],
  
  // Timing and availability
  dueDate: {
    type: Date,
    default: null
  },
  availableFrom: {
    type: Date,
    default: Date.now
  },
  availableUntil: {
    type: Date,
    default: null
  },
  
  // Settings
  isActive: {
    type: Boolean,
    default: true
  },
  allowRetakes: {
    type: Boolean,
    default: true
  },
  maxAttempts: {
    type: Number,
    default: null // null means unlimited
  },
  showResults: {
    type: Boolean,
    default: true
  },
  showCorrectAnswers: {
    type: Boolean,
    default: true
  },
  randomizeQuestions: {
    type: Boolean,
    default: false
  },
  randomizeOptions: {
    type: Boolean,
    default: false
  },
  
  // Metadata
  difficulty: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  estimatedDuration: {
    type: Number, // in minutes
    default: 30
  },
  totalPoints: {
    type: Number,
    default: function() {
      return this.exercises.reduce((sum, exercise) => sum + (exercise.points || 1), 0);
    }
  },
  passingScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 70
  },
  
  // Categorization
  category: {
    type: String,
    default: 'General'
  },
  tags: [{
    type: String,
    trim: true
  }],
  
  // Creator information
  createdBy: {
    type: String, // Firebase UID of creator
    default: 'system'
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true, // Automatically manage createdAt and updatedAt
  collection: 'homeworks'
});

// ✅ Indexes for better performance
HomeworkSchema.index({ subject: 1, level: 1 });
HomeworkSchema.index({ isActive: 1 });
HomeworkSchema.index({ createdAt: -1 });
HomeworkSchema.index({ dueDate: 1 });
HomeworkSchema.index({ 'exercises.type': 1 });

// ✅ Pre-save middleware to calculate total points
HomeworkSchema.pre('save', function(next) {
  if (this.exercises && this.exercises.length > 0) {
    this.totalPoints = this.exercises.reduce((sum, exercise) => sum + (exercise.points || 1), 0);
  } else {
    this.totalPoints = 0;
  }
  this.updatedAt = new Date();
  next();
});

// ✅ Virtual for exercise count
HomeworkSchema.virtual('exerciseCount').get(function() {
  return this.exercises ? this.exercises.length : 0;
});

// ✅ Virtual for checking if homework is available
HomeworkSchema.virtual('isAvailable').get(function() {
  const now = new Date();
  const availableFrom = this.availableFrom || new Date(0);
  const availableUntil = this.availableUntil || new Date('2099-12-31');
  
  return this.isActive && now >= availableFrom && now <= availableUntil;
});

// ✅ Virtual for checking if homework is overdue
HomeworkSchema.virtual('isOverdue').get(function() {
  if (!this.dueDate) return false;
  return new Date() > this.dueDate;
});

// ✅ Instance method to get exercises by type
HomeworkSchema.methods.getExercisesByType = function(type) {
  return this.exercises.filter(exercise => exercise.type === type);
};

// ✅ Instance method to validate exercise structure
HomeworkSchema.methods.validateExercises = function() {
  const errors = [];
  
  if (!this.exercises || this.exercises.length === 0) {
    errors.push('Homework must have at least one exercise');
  }
  
  this.exercises.forEach((exercise, index) => {
    if (!exercise.question || exercise.question.trim() === '') {
      errors.push(`Exercise ${index + 1}: Question is required`);
    }
    
    if (!exercise.correctAnswer) {
      errors.push(`Exercise ${index + 1}: Correct answer is required`);
    }
    
    if (exercise.type === 'multiple-choice' && (!exercise.options || exercise.options.length < 2)) {
      errors.push(`Exercise ${index + 1}: Multiple choice questions must have at least 2 options`);
    }
  });
  
  return errors;
};

// ✅ Static method to find active homework
HomeworkSchema.statics.findActive = function() {
  return this.find({ isActive: true, $or: [
    { availableUntil: null },
    { availableUntil: { $gte: new Date() } }
  ]});
};

// ✅ Static method to find homework by subject and level
HomeworkSchema.statics.findBySubjectAndLevel = function(subject, level) {
  return this.find({ subject, level, isActive: true });
};

// ✅ Transform function to clean up output
HomeworkSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

HomeworkSchema.set('toObject', {
  virtuals: true
});

module.exports = mongoose.model('Homework', HomeworkSchema);