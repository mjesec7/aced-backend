// 1. Fix the HomeworkProgress model to support standalone homework
// models/homeworkProgress.js

const mongoose = require('mongoose');

const HomeworkProgressSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: [true, 'User ID is required']
  },
  
  // For lesson-based homework
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    default: null
  },
  
  // ✅ FIXED: Add support for standalone homework
  homeworkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Homework',
    default: null
  },
  
  // ✅ FIXED: Add metadata field for additional info
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  answers: [{
    questionIndex: {
      type: Number,
      required: true
    },
    userAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: ''
    },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: ''
    },
    isCorrect: {
      type: Boolean,
      default: false
    },
    points: {
      type: Number,
      default: 0
    },
    type: {
      type: String,
      enum: ['auto', 'manual'],
      default: 'auto'
    }
  }],
  
  completed: {
    type: Boolean,
    default: false
  },
  
  score: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  totalPoints: {
    type: Number,
    default: 0
  },
  
  maxPoints: {
    type: Number,
    default: 0
  },
  
  stars: {
    type: Number,
    min: 0,
    max: 3,
    default: 0
  },
  
  submittedAt: {
    type: Date,
    default: null
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// ✅ FIXED: Add indexes for better performance
HomeworkProgressSchema.index({ userId: 1, lessonId: 1 });
HomeworkProgressSchema.index({ userId: 1, homeworkId: 1 });
HomeworkProgressSchema.index({ userId: 1 });
HomeworkProgressSchema.index({ completed: 1 });

// ✅ FIXED: Add validation to ensure either lessonId or homeworkId is present
HomeworkProgressSchema.pre('save', function(next) {
  if (!this.lessonId && !this.homeworkId) {
    return next(new Error('Either lessonId or homeworkId must be provided'));
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('HomeworkProgress', HomeworkProgressSchema);

// 2. ✅ FIXED: Add missing routes for standalone homework in userRoutes.js
// Add these routes to routes/userRoutes.js

// ✅ ENHANCED: Standalone homework endpoints (FIXED)
router.get('/:firebaseId/homework/:homeworkId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET standalone homework for user:', req.params.firebaseId, 'homeworkId:', req.params.homeworkId);
  
  try {
    const { firebaseId, homeworkId } = req.params;
    
    // Get the standalone homework
    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Homework not found' 
      });
    }
    
    if (!homework.isActive) {
      return res.status(403).json({ 
        success: false,
        error: '❌ Homework is not active' 
      });
    }
    
    // ✅ FIXED: Proper query for standalone homework progress
    let userProgress = await HomeworkProgress.findOne({
      userId: firebaseId,
      homeworkId: homeworkId
    });
    
    res.json({
      success: true,
      data: {
        homework: homework,
        userProgress: userProgress,
        questions: homework.exercises || []
      },
      message: '✅ Homework retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching standalone homework:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Error fetching homework',
      details: error.message 
    });
  }
});

// ✅ FIXED: Save standalone homework progress
router.post('/:firebaseId/homework/:homeworkId/save', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('💾 POST save standalone homework for user:', req.params.firebaseId, 'homeworkId:', req.params.homeworkId);
  
  try {
    const { firebaseId, homeworkId } = req.params;
    const { answers } = req.body;
    
    if (!Array.isArray(answers)) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Answers must be an array' 
      });
    }

    // Verify homework exists
    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Homework not found' 
      });
    }

    // ✅ FIXED: Proper data structure for standalone homework
    const progressData = {
      userId: firebaseId,
      homeworkId: homeworkId,
      lessonId: null, // No lesson for standalone homework
      answers: answers.map((answer, index) => ({
        questionIndex: index,
        userAnswer: answer.userAnswer || answer.answer || answer,
        correctAnswer: '',
        isCorrect: false,
        points: 0,
        type: 'auto'
      })),
      completed: false,
      metadata: {
        type: 'standalone',
        homeworkTitle: homework.title
      },
      updatedAt: new Date()
    };

    // Update or create progress
    const progress = await HomeworkProgress.findOneAndUpdate(
      { userId: firebaseId, homeworkId: homeworkId },
      progressData,
      { upsert: true, new: true, runValidators: true }
    );

    console.log(`💾 Standalone homework progress saved for user ${firebaseId}`);
    res.json({
      success: true,
      data: progress,
      message: '✅ Homework progress saved'
    });
    
  } catch (error) {
    console.error('❌ Error saving standalone homework:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Error saving homework progress',
      details: error.message 
    });
  }
});

// ✅ FIXED: Submit standalone homework with proper grading
router.post('/:firebaseId/homework/:homeworkId/submit', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📤 POST submit standalone homework for user:', req.params.firebaseId, 'homeworkId:', req.params.homeworkId);
  
  try {
    const { firebaseId, homeworkId } = req.params;
    const { answers } = req.body;
    
    if (!Array.isArray(answers)) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Answers must be an array' 
      });
    }

    // Get homework with exercises
    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Homework not found' 
      });
    }

    console.log('📝 Grading homework with', homework.exercises.length, 'exercises');

    // ✅ FIXED: Auto-grade the homework properly
    const gradedAnswers = answers.map((answer, index) => {
      const exercise = homework.exercises[index];
      
      if (!exercise) {
        console.warn(`⚠️ No exercise found for answer index ${index}`);
        return {
          questionIndex: index,
          userAnswer: answer.userAnswer || answer.answer || answer || '',
          correctAnswer: '',
          isCorrect: false,
          points: 0,
          type: 'auto'
        };
      }

      const correctAnswer = exercise.correctAnswer || '';
      const userAnswer = (answer.userAnswer || answer.answer || answer || '').toString().trim();
      const correctAnswerNormalized = correctAnswer.toString().trim();
      
      // ✅ FIXED: Better answer comparison for different question types
      let isCorrect = false;
      
      if (exercise.type === 'multiple-choice') {
        // For multiple choice, check both exact match and option text match
        isCorrect = userAnswer.toLowerCase() === correctAnswerNormalized.toLowerCase();
        
        // Also check if user answer matches any option that equals correct answer
        if (!isCorrect && exercise.options) {
          const matchingOption = exercise.options.find(opt => 
            (opt.text || opt).toLowerCase() === userAnswer.toLowerCase()
          );
          if (matchingOption) {
            isCorrect = (matchingOption.text || matchingOption).toLowerCase() === correctAnswerNormalized.toLowerCase();
          }
        }
      } else {
        // For text-based questions, case-insensitive comparison
        isCorrect = userAnswer.toLowerCase() === correctAnswerNormalized.toLowerCase();
      }
      
      const points = isCorrect ? (exercise.points || 1) : 0;

      console.log(`🔍 Question ${index + 1}:`, {
        type: exercise.type,
        userAnswer: userAnswer.substring(0, 50),
        correctAnswer: correctAnswerNormalized.substring(0, 50),
        isCorrect,
        points
      });

      return {
        questionIndex: index,
        userAnswer: userAnswer,
        correctAnswer: correctAnswerNormalized,
        isCorrect,
        points,
        type: 'auto'
      };
    });

    // Calculate score
    const totalQuestions = gradedAnswers.length;
    const correctAnswers = gradedAnswers.filter(a => a.isCorrect).length;
    const totalPoints = gradedAnswers.reduce((sum, a) => sum + a.points, 0);
    const maxPoints = homework.exercises.reduce((sum, ex) => sum + (ex.points || 1), 0);
    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    
    // Calculate stars
    let stars = 0;
    if (score >= 90) stars = 3;
    else if (score >= 70) stars = 2;
    else if (score >= 50) stars = 1;

    console.log('📊 Grading results:', {
      totalQuestions,
      correctAnswers,
      totalPoints,
      maxPoints,
      score,
      stars
    });

    // ✅ FIXED: Update progress with proper structure
    const progressData = {
      userId: firebaseId,
      homeworkId: homeworkId,
      lessonId: null,
      answers: gradedAnswers,
      completed: true,
      score: score,
      totalPoints: totalPoints,
      maxPoints: maxPoints,
      stars: stars,
      metadata: {
        type: 'standalone',
        homeworkTitle: homework.title
      },
      submittedAt: new Date(),
      updatedAt: new Date()
    };

    const progress = await HomeworkProgress.findOneAndUpdate(
      { userId: firebaseId, homeworkId: homeworkId },
      progressData,
      { upsert: true, new: true, runValidators: true }
    );

    console.log(`📤 Standalone homework submitted by user ${firebaseId}. Score: ${score}%`);

    res.json({
      success: true,
      data: {
        progress,
        score,
        totalPoints,
        maxPoints,
        correctAnswers,
        totalQuestions,
        stars,
        details: `${correctAnswers}/${totalQuestions} correct (${score}%)`
      },
      message: '✅ Homework submitted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error submitting standalone homework:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Error submitting homework',
      details: error.message 
    });
  }
});

// 3. ✅ FIXED: Update the homework routes to return proper data structure
// In routes/homeworkRoutes.js - fix the GET route for single homework

router.get('/:id', async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id)
      .populate('linkedLessonIds', 'title lessonName subject');
    
    if (!homework) {
      return res.status(404).json({ 
        success: false,
        error: 'Homework not found' 
      });
    }
    
    console.log('📥 Admin: Retrieved homework:', homework.title);
    console.log('📝 Homework exercises count:', homework.exercises?.length || 0);
    
    // ✅ FIXED: Return consistent data structure
    res.json({
      success: true,
      data: homework,
      message: '✅ Homework retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching homework:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch homework',
      details: error.message 
    });
  }
});

// 4. ✅ FIXED: Update the frontend API to handle different response formats
// Update src/api.js with better error handling

export const getStandaloneHomework = async (userId, homeworkId) => {
  try {
    // Try user-specific endpoint first
    const { data } = await api.get(`/users/${userId}/homework/${homeworkId}`);
    return data;
  } catch (userError) {
    console.warn('⚠️ User homework endpoint failed:', userError.message);
    
    try {
      // Fallback to direct homework endpoint
      const { data } = await api.get(`/homeworks/${homeworkId}`);
      return {
        success: true,
        data: {
          homework: data.data || data,
          userProgress: null,
          questions: (data.data || data)?.exercises || []
        }
      };
    } catch (directError) {
      console.error('❌ All homework endpoints failed:', directError.message);
      throw directError;
    }
  }
};

export const submitStandaloneHomework = async (userId, homeworkId, answers) => {
  try {
    // Use the user-specific submit endpoint
    const { data } = await api.post(`/users/${userId}/homework/${homeworkId}/submit`, { answers });
    return data;
  } catch (error) {
    console.error('❌ Failed to submit standalone homework:', error);
    
    // Log the actual error for debugging
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    throw error;
  }
};