// models/lesson.js - ENHANCED LESSON MODEL WITH VALIDATION
const mongoose = require('mongoose');

// Step configuration schema
const stepConfigSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'introduction',      // Lesson intro
      'explanation',       // Core explanation
      'example',           // Detailed examples
      'demonstration',     // Visual demonstration
      'practice',          // Guided practice
      'exercise',          // Interactive exercises
      'quiz',              // Knowledge check
      'vocabulary',        // Terms and definitions
      'reading',           // Reading comprehension
      'listening',         // Audio exercises
      'writing',           // Writing practice
      'speaking',          // Speaking practice
      'video',             // Video content
      'game',              // Gamified learning
      'discussion',        // Discussion prompts
      'project',           // Mini-projects
      'assessment',        // Formal assessment
      'review',            // Review section
      'summary',           // Lesson summary
      'homework'           // Take-home work
    ]
  },
  required: { type: Boolean, default: false },
  minCount: { type: Number, default: 0 },
  maxCount: { type: Number, default: null },
  order: { type: Number, default: 0 },
  metadata: {
    estimatedMinutes: Number,
    difficulty: String,
    adaptable: Boolean
  }
});

// Step schema with enhanced validation
const lessonStepSchema = new mongoose.Schema({
  type: {
    type: String,
    required: [true, 'Step type is required'],
    enum: {
      values: [
        'introduction', 'explanation', 'example', 'demonstration',
        'practice', 'exercise', 'quiz', 'vocabulary',
        'reading', 'listening', 'writing', 'speaking',
        'video', 'game', 'discussion', 'project',
        'assessment', 'review', 'summary', 'homework'
      ],
      message: '{VALUE} is not a valid step type'
    }
  },
  
  order: {
    type: Number,
    required: true,
    min: [0, 'Order must be non-negative']
  },
  
  title: {
    type: String,
    required: [true, 'Step title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  instructions: {
    type: String,
    required: [true, 'Step instructions are required'],
    trim: true
  },
  
  content: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function(v) {
        // Validate based on step type
        switch(this.type) {
          case 'explanation':
            return v.text && v.text.length >= 100;
          case 'exercise':
            return Array.isArray(v.exercises) && v.exercises.length > 0;
          case 'quiz':
            return Array.isArray(v.questions) && v.questions.length > 0;
          case 'vocabulary':
            return Array.isArray(v.terms) && v.terms.length > 0;
          default:
            return v !== null && v !== undefined;
        }
      },
      message: 'Content validation failed for step type'
    }
  },
  
  // Adaptive difficulty
  difficulty: {
    type: String,
    enum: ['beginner', 'elementary', 'intermediate', 'advanced', 'expert'],
    required: true
  },
  
  // Time management
  estimatedDuration: {
    type: Number, // in minutes
    required: true,
    min: [1, 'Duration must be at least 1 minute'],
    max: [120, 'Duration cannot exceed 120 minutes']
  },
  
  // Scoring and assessment
  scoring: {
    maxPoints: { type: Number, default: 10 },
    passingScore: { type: Number, default: 7 },
    weight: { type: Number, default: 1 }, // Weight in final grade
    allowRetry: { type: Boolean, default: true },
    maxRetries: { type: Number, default: 3 }
  },
  
  // Adaptive learning
  adaptive: {
    skipIfMastered: { type: Boolean, default: false },
    requiredForNext: { type: Boolean, default: true },
    prerequisites: [{ type: String }], // Step IDs
    unlocks: [{ type: String }] // Step IDs
  },
  
  // Media and resources
  media: {
    images: [{
      url: String,
      caption: String,
      alt: String
    }],
    videos: [{
      url: String,
      duration: Number,
      transcript: String
    }],
    audio: [{
      url: String,
      duration: Number,
      transcript: String
    }],
    documents: [{
      url: String,
      type: String,
      size: Number
    }]
  },
  
  // Interactivity
  interactive: {
    enabled: { type: Boolean, default: true },
    features: [String], // ['drag-drop', 'highlighting', 'annotation']
    collaborative: { type: Boolean, default: false }
  },
  
  // Analytics tracking
  analytics: {
    averageCompletionTime: Number,
    averageScore: Number,
    completionRate: Number,
    difficultyRating: Number,
    studentFeedback: Number
  },
  
  // AI enhancement
  ai: {
    enabled: { type: Boolean, default: true },
    hints: { type: Boolean, default: true },
    explanations: { type: Boolean, default: true },
    personalization: { type: Boolean, default: true }
  },
  
  metadata: {
    version: { type: Number, default: 1 },
    lastUpdated: { type: Date, default: Date.now },
    author: String,
    tags: [String],
    isOptional: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false }
  },

  // 🎮 GAME CONFIGURATION
  gameType: {
    type: String,
    enum: [
      'basket-catch',
      'memory-cards',
      'whack-a-mole',
      'tower-builder',
      'target-practice',
      'maze-runner',
      'bubble-pop',
      'lightning-round',
      'scale-balance',
      'pattern-builder'
    ],
    default: null
  },

  gameConfig: {
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium'
    },
    timeLimit: {
      type: Number, // seconds
      default: 60
    },
    targetScore: {
      type: Number,
      default: 100
    },
    lives: {
      type: Number,
      default: 3
    },
    speed: {
      type: Number, // 1-10
      default: 5,
      min: 1,
      max: 10
    },
    items: [{
      id: String,
      content: mongoose.Schema.Types.Mixed,
      isCorrect: Boolean,
      points: Number,
      position: mongoose.Schema.Types.Mixed,
      metadata: mongoose.Schema.Types.Mixed
    }],
    correctAnswers: [mongoose.Schema.Types.Mixed],
    wrongAnswers: [mongoose.Schema.Types.Mixed],
    gameplayData: mongoose.Schema.Types.Mixed
  },

  // Rewards for completing game
  rewards: {
    stars: { type: Number, default: 1, min: 1, max: 3 },
    points: { type: Number, default: 10 },
    badges: [String],
    unlocks: [String]
  }
}, {
  timestamps: true
});

// Main Lesson Schema
const lessonSchema = new mongoose.Schema({
  // Basic Information
  lessonName: {
    type: String,
    required: [true, 'Lesson name is required'],
    trim: true,
    maxlength: [200, 'Lesson name cannot exceed 200 characters'],
    index: true
  },
  
  description: {
    type: String,
    required: [true, 'Lesson description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  
  // Organization
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    index: true
  },
  
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: true,
    index: true
  },
  
  level: {
    type: Number,
    required: true,
    min: [1, 'Level must be at least 1'],
    max: [20, 'Level cannot exceed 20'],
    index: true
  },
  
  difficulty: {
    type: String,
    enum: ['beginner', 'elementary', 'intermediate', 'advanced', 'expert'],
    required: true,
    index: true
  },
  
  // Step Configuration
  stepRequirements: {
    explanation: {
      required: { type: Boolean, default: true },
      minCount: { type: Number, default: 1 },
      maxCount: { type: Number, default: 3 }
    },
    exercise: {
      required: { type: Boolean, default: true },
      minCount: { type: Number, default: 7 },
      maxCount: { type: Number, default: 20 }
    },
    quiz: {
      required: { type: Boolean, default: false },
      minCount: { type: Number, default: 3 },
      maxCount: { type: Number, default: 10 }
    },
    practice: {
      required: { type: Boolean, default: false },
      minCount: { type: Number, default: 2 },
      maxCount: { type: Number, default: 5 }
    }
  },
  
  // Steps array with validation
  steps: {
    type: [lessonStepSchema],
    validate: {
      validator: function(steps) {
        // Validate minimum required steps
        const typeCounts = {};
        steps.forEach(step => {
          typeCounts[step.type] = (typeCounts[step.type] || 0) + 1;
        });
        
        // Check required explanations
        if (this.stepRequirements.explanation.required) {
          const count = typeCounts['explanation'] || 0;
          if (count < this.stepRequirements.explanation.minCount) {
            return false;
          }
        }
        
        // Check required exercises
        if (this.stepRequirements.exercise.required) {
          const count = typeCounts['exercise'] || 0;
          if (count < this.stepRequirements.exercise.minCount) {
            return false;
          }
        }
        
        return true;
      },
      message: 'Lesson does not meet minimum step requirements'
    }
  },
  
  // Learning Path
  learningPath: {
    prerequisites: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson'
    }],
    nextLessons: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson'
    }],
    relatedLessons: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson'
    }]
  },
  
  // Adaptive Learning Configuration
  adaptive: {
    enabled: { type: Boolean, default: true },
    personalizedPaths: { type: Boolean, default: true },
    difficultyAdjustment: { type: Boolean, default: true },
    paceAdjustment: { type: Boolean, default: true },
    
    rules: [{
      condition: String, // "score < 70"
      action: String,    // "add_practice"
      parameters: mongoose.Schema.Types.Mixed
    }]
  },
  
  // Assessment Configuration
  assessment: {
    enabled: { type: Boolean, default: true },
    passingScore: { type: Number, default: 70 },
    certificateEligible: { type: Boolean, default: false },
    
    grading: {
      exercises: { type: Number, default: 40 },
      quizzes: { type: Number, default: 30 },
      participation: { type: Number, default: 20 },
      homework: { type: Number, default: 10 }
    }
  },
  
  // Gamification
  gamification: {
    enabled: { type: Boolean, default: true },
    points: { type: Number, default: 100 },
    badges: [{
      id: String,
      name: String,
      icon: String,
      condition: String
    }],
    achievements: [{
      id: String,
      name: String,
      description: String,
      points: Number
    }]
  },
  
  // Time Management
  timing: {
    estimatedDuration: { type: Number, required: true }, // in minutes
    minDuration: Number,
    maxDuration: Number,
    timeLimit: Number, // optional time limit
    
    schedule: {
      recommendedTime: String, // "morning", "afternoon", "evening"
      recommendedDays: Number, // days to complete
      deadline: Date
    }
  },
  
  // Resources
  resources: {
    materials: [{
      type: String, // 'pdf', 'video', 'link'
      title: String,
      url: String,
      size: Number,
      required: Boolean
    }],
    
    references: [{
      title: String,
      author: String,
      url: String,
      type: String // 'book', 'article', 'website'
    }],
    
    glossary: [{
      term: String,
      definition: String,
      pronunciation: String
    }]
  },
  
  // Collaboration
  collaboration: {
    enabled: { type: Boolean, default: false },
    type: String, // 'peer-review', 'group-work', 'discussion'
    maxGroupSize: Number,
    features: [String]
  },
  
  // Analytics & Tracking
  analytics: {
    totalViews: { type: Number, default: 0 },
    totalCompletions: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    averageTime: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    difficultyRating: { type: Number, default: 0 },
    satisfactionRating: { type: Number, default: 0 },
    
    stepAnalytics: [{
      stepType: String,
      averageTime: Number,
      completionRate: Number,
      averageScore: Number
    }]
  },
  
  // AI Integration
  ai: {
    enabled: { type: Boolean, default: true },
    chatbot: { type: Boolean, default: true },
    voiceAssistant: { type: Boolean, default: false },
    autoGrading: { type: Boolean, default: true },
    contentGeneration: { type: Boolean, default: false },
    
    personalizedHints: { type: Boolean, default: true },
    adaptiveQuestions: { type: Boolean, default: true },
    learningAnalytics: { type: Boolean, default: true }
  },
  
  // Accessibility
  accessibility: {
    wcagLevel: { type: String, default: 'AA' },
    screenReader: { type: Boolean, default: true },
    captions: { type: Boolean, default: true },
    transcripts: { type: Boolean, default: true },
    signLanguage: { type: Boolean, default: false },
    simplifiedVersion: { type: Boolean, default: false }
  },

  // --- 🎓 DUAL-MODE CONFIGURATION ---
  modeRestrictions: {
    schoolOnly: { type: Boolean, default: false },
    studyCentreOnly: { type: Boolean, default: false },
    availableInBothModes: { type: Boolean, default: true },

    // School Mode Requirements
    schoolRequirements: {
      prerequisiteLessons: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lesson'
      }],
      minimumGrade: {
        type: String,
        enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Expert', 'Master']
      },
      mustCompleteInOrder: { type: Boolean, default: true },
      isMandatory: { type: Boolean, default: false },
      allowedRetakes: { type: Number, default: 2 }
    },

    // Study Centre Features
    studyCentreFeatures: {
      allowSkipping: { type: Boolean, default: true },
      showHints: { type: Boolean, default: true },
      unlimitedAttempts: { type: Boolean, default: true },
      selfPaced: { type: Boolean, default: true }
    }
  },

  // --- 📊 DIFFICULTY ADAPTATION ---
  difficultyVariants: {
    simplified: {
      enabled: { type: Boolean, default: false },
      content: mongoose.Schema.Types.Mixed,
      exercises: [mongoose.Schema.Types.Mixed]
    },
    standard: {
      content: mongoose.Schema.Types.Mixed,
      exercises: [mongoose.Schema.Types.Mixed]
    },
    advanced: {
      enabled: { type: Boolean, default: false },
      content: mongoose.Schema.Types.Mixed,
      exercises: [mongoose.Schema.Types.Mixed]
    }
  },

  // --- 🔒 PROGRESSION GATES ---
  progressionGates: [{
    gateType: {
      type: String,
      enum: ['quiz', 'assignment', 'time', 'score', 'prerequisite']
    },
    requirement: mongoose.Schema.Types.Mixed,
    unlocksLessons: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson'
    }],
    isActive: { type: Boolean, default: true }
  }],

  // Status and Publishing
  status: {
    type: String,
    enum: ['draft', 'review', 'approved', 'published', 'archived'],
    default: 'draft',
    index: true
  },
  
  visibility: {
    type: String,
    enum: ['public', 'private', 'restricted'],
    default: 'public'
  },
  
  type: {
    type: String,
    enum: ['free', 'premium', 'trial'],
    default: 'free',
    index: true
  },
  
  // Metadata
  metadata: {
    version: { type: Number, default: 1 },
    language: { type: String, default: 'en' },
    targetAudience: [String],
    keywords: [String],
    seoTitle: String,
    seoDescription: String,
    
    qualityScore: Number,
    reviewedBy: String,
    reviewedAt: Date,
    
    source: String,
    license: String,
    attribution: String
  },
  
  // System fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  deletedAt: Date,
  isActive: { type: Boolean, default: true, index: true }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
lessonSchema.index({ subject: 1, level: 1, difficulty: 1 });
lessonSchema.index({ topicId: 1, status: 1 });
lessonSchema.index({ 'steps.type': 1 });
lessonSchema.index({ createdAt: -1 });
lessonSchema.index({ 'analytics.completionRate': -1 });

// Virtual for total steps
lessonSchema.virtual('totalSteps').get(function() {
  return this.steps ? this.steps.length : 0;
});

// Virtual for exercise count
lessonSchema.virtual('exerciseCount').get(function() {
  return this.steps ? this.steps.filter(s => s.type === 'exercise').length : 0;
});

// Methods
lessonSchema.methods.validateStepRequirements = function() {
  const typeCounts = {};
  this.steps.forEach(step => {
    typeCounts[step.type] = (typeCounts[step.type] || 0) + 1;
  });
  
  const errors = [];
  
  // Check each requirement
  Object.keys(this.stepRequirements).forEach(stepType => {
    const req = this.stepRequirements[stepType];
    const count = typeCounts[stepType] || 0;
    
    if (req.required && count < req.minCount) {
      errors.push(`Lesson requires at least ${req.minCount} ${stepType} step(s), found ${count}`);
    }
    
    if (req.maxCount && count > req.maxCount) {
      errors.push(`Lesson allows maximum ${req.maxCount} ${stepType} step(s), found ${count}`);
    }
  });
  
  return { valid: errors.length === 0, errors };
};

lessonSchema.methods.getAdaptivePath = function(studentProfile) {
  // Generate personalized learning path based on student profile
  const path = [];
  
  this.steps.forEach(step => {
    // Skip if student has mastered this type
    if (step.adaptive.skipIfMastered && 
        studentProfile.masteredTypes?.includes(step.type)) {
      return;
    }
    
    // Add extra practice for struggling areas
    if (studentProfile.strugglingAreas?.includes(step.type)) {
      path.push({
        ...step.toObject(),
        modified: true,
        reason: 'Additional practice added'
      });
      
      // Add a simplified version
      if (step.type === 'exercise') {
        path.push({
          ...step.toObject(),
          difficulty: 'beginner',
          modified: true,
          reason: 'Simplified version for practice'
        });
      }
    } else {
      path.push(step);
    }
  });
  
  return path;
};

lessonSchema.methods.calculateProgress = function(completedSteps) {
  const totalRequired = this.steps.filter(s => !s.metadata.isOptional).length;
  const completed = completedSteps.length;
  return Math.round((completed / totalRequired) * 100);
};

/**
 * Gets appropriate content for a user based on their mode and level.
 * @param {Object} user - The user object
 * @returns {Object} Content tailored to the user
 */
lessonSchema.methods.getContentForUser = function(user) {
  if (user.learningMode === 'school') {
    // Return structured content with gates and restrictions
    const userGrade = user.schoolProfile?.currentGrade || 'A1';

    let content = this.steps;
    let allowedFeatures = {
      hints: this.modeRestrictions?.studyCentreFeatures?.showHints || false,
      skipping: false,
      unlimitedAttempts: false
    };

    // Select difficulty variant based on grade
    if (userGrade < 'B1' && this.difficultyVariants?.simplified?.enabled) {
      content = this.difficultyVariants.simplified.content || this.steps;
    } else if (userGrade >= 'C1' && this.difficultyVariants?.advanced?.enabled) {
      content = this.difficultyVariants.advanced.content || this.steps;
    }

    return {
      content,
      mode: 'school',
      features: allowedFeatures,
      restrictions: {
        mustCompleteInOrder: this.modeRestrictions?.schoolRequirements?.mustCompleteInOrder !== false,
        maxRetakes: this.modeRestrictions?.schoolRequirements?.allowedRetakes || 2,
        requiresGrade: this.modeRestrictions?.schoolRequirements?.minimumGrade
      }
    };
  }

  // Study Centre gets full access with all difficulty options
  return {
    content: {
      simplified: this.difficultyVariants?.simplified?.enabled ? this.difficultyVariants.simplified.content : null,
      standard: this.steps,
      advanced: this.difficultyVariants?.advanced?.enabled ? this.difficultyVariants.advanced.content : null
    },
    mode: 'study_centre',
    features: {
      hints: true,
      skipping: true,
      unlimitedAttempts: true,
      chooseOwnDifficulty: true
    },
    restrictions: {}
  };
};

/**
 * Checks if a user can access this lesson based on mode and requirements.
 * @param {Object} user - The user object
 * @returns {Object} Access status and reason
 */
lessonSchema.methods.canUserAccess = function(user) {
  // Study Centre has unlimited access
  if (user.learningMode === 'study_centre') {
    if (this.modeRestrictions?.schoolOnly) {
      return {
        canAccess: false,
        reason: 'This lesson is only available in School Mode'
      };
    }
    return { canAccess: true };
  }

  // School Mode checks
  if (user.learningMode === 'school') {
    // Check if lesson is study centre only
    if (this.modeRestrictions?.studyCentreOnly) {
      return {
        canAccess: false,
        reason: 'This lesson is only available in Study Centre Mode'
      };
    }

    // Check level access
    if (!user.canAccessLevel(this.level)) {
      return {
        canAccess: false,
        reason: `Level ${this.level} is not yet unlocked. Complete previous levels first.`,
        requiredLevel: this.level,
        currentLevel: user.schoolProfile?.currentLevelCap || 1
      };
    }

    // Check grade requirement
    const minGrade = this.modeRestrictions?.schoolRequirements?.minimumGrade;
    if (minGrade && user.schoolProfile?.currentGrade < minGrade) {
      return {
        canAccess: false,
        reason: `Minimum grade ${minGrade} required. Your current grade: ${user.schoolProfile.currentGrade}`
      };
    }

    // Check prerequisites
    // This would require additional database queries, so return a flag
    if (this.modeRestrictions?.schoolRequirements?.prerequisiteLessons?.length > 0) {
      return {
        canAccess: true,
        checkPrerequisites: true,
        prerequisiteLessons: this.modeRestrictions.schoolRequirements.prerequisiteLessons
      };
    }

    return { canAccess: true };
  }

  // Hybrid mode - combine rules
  return { canAccess: true };
};

// Statics
lessonSchema.statics.generateLessonTemplate = function(level, difficulty) {
  const templates = {
    beginner: {
      stepRequirements: {
        explanation: { required: true, minCount: 2, maxCount: 4 },
        exercise: { required: true, minCount: 7, maxCount: 10 },
        practice: { required: true, minCount: 3, maxCount: 5 }
      },
      suggestedSteps: [
        { type: 'introduction', order: 0 },
        { type: 'explanation', order: 1 },
        { type: 'example', order: 2 },
        { type: 'practice', order: 3 },
        { type: 'exercise', order: 4 },
        { type: 'review', order: 5 }
      ]
    },
    intermediate: {
      stepRequirements: {
        explanation: { required: true, minCount: 1, maxCount: 3 },
        exercise: { required: true, minCount: 10, maxCount: 15 },
        quiz: { required: true, minCount: 3, maxCount: 5 },
        practice: { required: true, minCount: 2, maxCount: 4 }
      },
      suggestedSteps: [
        { type: 'introduction', order: 0 },
        { type: 'explanation', order: 1 },
        { type: 'demonstration', order: 2 },
        { type: 'practice', order: 3 },
        { type: 'exercise', order: 4 },
        { type: 'quiz', order: 5 },
        { type: 'project', order: 6 },
        { type: 'summary', order: 7 }
      ]
    },
    advanced: {
      stepRequirements: {
        explanation: { required: true, minCount: 1, maxCount: 2 },
        exercise: { required: true, minCount: 12, maxCount: 20 },
        quiz: { required: true, minCount: 5, maxCount: 8 },
        project: { required: true, minCount: 1, maxCount: 2 },
        assessment: { required: true, minCount: 1, maxCount: 1 }
      },
      suggestedSteps: [
        { type: 'introduction', order: 0 },
        { type: 'explanation', order: 1 },
        { type: 'demonstration', order: 2 },
        { type: 'exercise', order: 3 },
        { type: 'discussion', order: 4 },
        { type: 'project', order: 5 },
        { type: 'quiz', order: 6 },
        { type: 'assessment', order: 7 },
        { type: 'summary', order: 8 }
      ]
    }
  };
  
  return templates[difficulty] || templates.beginner;
};

// Middleware
lessonSchema.pre('save', async function(next) {
  // Auto-sort steps by order
  if (this.steps && this.steps.length > 0) {
    this.steps.sort((a, b) => a.order - b.order);
  }
  
  // Validate step requirements
  const validation = this.validateStepRequirements();
  if (!validation.valid) {
    return next(new Error(validation.errors.join(', ')));
  }
  
  // Calculate estimated duration
  if (this.steps && !this.timing.estimatedDuration) {
    this.timing.estimatedDuration = this.steps.reduce((total, step) => {
      return total + (step.estimatedDuration || 5);
    }, 0);
  }
  
  next();
});

lessonSchema.post('save', async function(doc) {
  // Update topic statistics
  const Topic = mongoose.model('Topic');
  await Topic.findByIdAndUpdate(doc.topicId, {
    $inc: { lessonCount: 1 },
    $set: { lastUpdated: new Date() }
  });
});

const Lesson = mongoose.model('Lesson', lessonSchema);

module.exports = Lesson;