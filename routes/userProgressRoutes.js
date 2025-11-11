const express = require('express');
const router = express.Router();

// routes/userProgressRoutes.js - Add this right after const router = express.Router();
// TEST ROUTE - Add this first to verify the router is working
router.get('/test', (req, res) => {
  console.log('✅ UserProgress router test route hit');
  res.json({
    success: true,
    message: 'UserProgress router is working',
    path: req.originalUrl
  });
});

// TEST ROUTE FOR NESTED PATHS
router.get('/learning-profile/test', (req, res) => {
  console.log('✅ Learning profile test route hit');
  res.json({
    success: true,
    message: 'Learning profile routes are accessible',
    path: req.originalUrl
  });
});

const mongoose = require('mongoose');
const UserProgress = require('../models/userProgress');
const Lesson = require('../models/lesson');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ CRITICAL: ObjectId validation and extraction utility
const extractValidObjectId = (value, fieldName = 'ObjectId') => {
  if (!value) {
    return null;
  }
  
  try {
    let idString = null;
    
    // Handle different input types
    if (typeof value === 'string') {
      idString = value.trim();
    } else if (typeof value === 'object' && value !== null) {
      // Try to extract ID from object - handle all possible field names
      idString = value._id || value.id || value.topicId || value.lessonId || value.ObjectId;
      
      // If it's still an object, convert to string
      if (typeof idString === 'object' && idString !== null) {
        idString = idString.toString();
      }
    } else {
      idString = value.toString();
    }
    
    // Check for invalid string representations
    if (!idString || 
        idString === '[object Object]' || 
        idString === 'null' || 
        idString === 'undefined' ||
        idString === 'NaN' ||
        idString.includes('[object') ||
        idString.length === 0) {
  
      return null;
    }
    
    // Validate ObjectId format (24 character hex string)
    if (!mongoose.Types.ObjectId.isValid(idString)) {

      return null;
    }
    
    return idString;
  } catch (error) {
    console.error(`❌ Error extracting ${fieldName}:`, {
      error: error.message,
      originalValue: value,
      valueType: typeof value
    });
    return null;
  }
};



// ✅ GET /api/progress - Load progress
router.get('/', async (req, res) => {
  const { userId, lessonId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ message: '❌ userId is required as query parameter.' });
  }

  try {
    if (lessonId) {
      // Validate lessonId if provided
      const validLessonId = extractValidObjectId(lessonId, 'lessonId');
      if (!validLessonId) {
        return res.status(400).json({ 
          message: '❌ Invalid lessonId format.',
          received: lessonId,
          expected: '24-character hex string'
        });
      }
      
      // Load specific lesson progress
      const progress = await UserProgress.findOne({ userId, lessonId: validLessonId })
        .populate('lessonId', 'title description order')
        .populate('topicId', 'title description order');
      
      return res.status(200).json({
        message: '✅ Progress loaded',
        data: progress || null
      });
    } else {
      // Load all progress for user
      const progressRecords = await UserProgress.find({ userId })
        .populate('lessonId', 'title description order')
        .populate('topicId', 'title description order')
        .sort({ updatedAt: -1 });

      return res.status(200).json({
        message: '✅ All progress loaded',
        data: progressRecords
      });
    }
  } catch (error) {
    console.error('❌ Error loading progress:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

// ✅ ENHANCED: GET /api/progress/lesson/:lessonId/user/:userId - Get specific lesson progress
router.get('/lesson/:lessonId/user/:userId', async (req, res) => {
  try {
    const { lessonId, userId } = req.params;
    
    const validLessonId = extractValidObjectId(lessonId, 'lessonId');
    if (!validLessonId) {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid lessonId format',
        received: lessonId
      });
    }
    
    const progress = await UserProgress.findOne({ 
      userId, 
      lessonId: validLessonId 
    }).populate('lessonId', 'lessonName subject level');
    
    if (!progress) {
      return res.json({
        success: true,
        progress: null,
        hasProgress: false,
        message: 'No progress found for this lesson'
      });
    }
    
    res.json({
      success: true,
      progress: {
        lessonId: progress.lessonId,
        userId: progress.userId,
        completed: progress.completed,
        completedAt: progress.completedAt,
        progressPercent: progress.progressPercent || 0,
        currentStep: progress.currentStep || 0,
        totalSteps: progress.totalSteps || 0,
        stars: progress.stars || 0,
        score: progress.score || 0,
        timeSpent: progress.timeSpent || 0,
        mistakes: progress.mistakes || 0,
        lastAccessed: progress.updatedAt,
        completedSteps: progress.completedSteps || []
      },
      hasProgress: true,
      lesson: progress.lessonId
    });
    
  } catch (error) {
    console.error('❌ Error getting lesson progress:', error);
    res.status(500).json({
      success: false,
      message: '❌ Failed to get lesson progress',
      error: error.message
    });
  }
});
router.post('/user-progress', verifyToken, async (req, res) => {
  
  try {
    const progressData = req.body;
    const firebaseId = progressData.userId || req.user?.uid;
    
   
    
    // Basic validation
    if (!firebaseId) {
      return res.status(400).json({
        success: false,
        message: '❌ userId is required.',
        error: '❌ userId and lessonId are required.'
      });
    }
    
    if (!progressData.lessonId) {
      return res.status(400).json({
        success: false,
        message: '❌ lessonId is required.',
        error: '❌ userId and lessonId are required.'
      });
    }
    
    // Validate lessonId
    const validLessonId = extractValidObjectId(progressData.lessonId, 'lessonId');
    if (!validLessonId) {
      return res.status(400).json({ 
        success: false,
        message: '❌ Invalid lessonId format.',
        error: '❌ userId and lessonId are required.'
      });
    }
    
    // Get topicId from lesson if needed
    let finalTopicId = null;
    try {
      const lesson = await Lesson.findById(validLessonId);
      if (lesson && lesson.topicId) {
        finalTopicId = extractValidObjectId(lesson.topicId, 'lesson.topicId');
      }
    } catch (lessonError) {
    }
    
    const updateData = {
      userId: firebaseId,
      lessonId: validLessonId,
      topicId: finalTopicId,
      completedSteps: progressData.completedSteps || [],
      progressPercent: Math.min(100, Math.max(0, Number(progressData.progressPercent) || 0)),
      completed: Boolean(progressData.completed),
      currentStep: Math.max(0, Number(progressData.currentStep) || 0),
      totalSteps: Math.max(0, Number(progressData.totalSteps) || 0),
      mistakes: Math.max(0, Number(progressData.mistakes) || 0),
      medal: String(progressData.medal || 'none'),
      duration: Math.max(0, Number(progressData.duration) || 0),
      timeSpent: Math.max(0, Number(progressData.timeSpent) || Number(progressData.duration) || 0),
      stars: Math.min(5, Math.max(0, Number(progressData.stars) || 0)),
      score: Math.max(0, Number(progressData.score) || 0),
      points: Math.max(0, Number(progressData.points) || 0),
      hintsUsed: Math.max(0, Number(progressData.hintsUsed) || 0),
      submittedHomework: Boolean(progressData.submittedHomework),
      updatedAt: new Date()
    };

    // Set completedAt when lesson is marked as completed
    if (updateData.completed && !updateData.completedAt) {
      updateData.completedAt = new Date();
    }
    
    // Remove null/undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === null || updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId: validLessonId },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );
    
    
    res.json({
      success: true,
      data: updated,
      message: '✅ Progress saved/updated',
      endpoint: 'user-progress'
    });
    
  } catch (error) {
    console.error('❌ Error in /api/user-progress:', error);
    
    if (error.name === 'CastError') {
      res.status(400).json({ 
        success: false,
        message: '❌ Invalid data format - ObjectId casting failed',
        error: '❌ userId and lessonId are required.'
      });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({ 
        success: false,
        message: '❌ Validation error',
        error: '❌ userId and lessonId are required.'
      });
    } else {
      res.status(500).json({ 
        success: false,
        message: '❌ Server error',
        error: '❌ Server error'
      });
    }
  }
});

// ✅ FIXED: POST /api/progress - Save or update user progress
router.post('/', verifyToken, async (req, res) => {
  
  try {
    const {
      userId,
      lessonId,
      topicId,
      completedSteps = [],
      progressPercent = 0,
      completed = false,
      currentStep = 0,
      totalSteps = 0,
      mistakes = 0,
      medal = 'none',
      duration = 0,
      timeSpent = 0,
      stars = 0,
      score = 0,
      points = 0,
      hintsUsed = 0,
      submittedHomework = false
    } = req.body;

    // Use Firebase UID from token if userId not provided
    const firebaseId = userId || req.user?.uid;

    if (!firebaseId || !lessonId) {
      console.error('❌ Missing required fields:', { 
        firebaseId: !!firebaseId, 
        lessonId: !!lessonId 
      });
      return res.status(400).json({ 
        message: '❌ userId and lessonId are required.',
        missing: {
          userId: !firebaseId,
          lessonId: !lessonId
        }
      });
    }

    // ✅ STEP 1: Validate and extract lessonId
    const validLessonId = extractValidObjectId(lessonId, 'lessonId');
    if (!validLessonId) {
      console.error('❌ Invalid lessonId received:', {
        original: lessonId,
        type: typeof lessonId,
        stringified: JSON.stringify(lessonId)
      });
      return res.status(400).json({ 
        message: '❌ Invalid lessonId format.',
        received: {
          value: lessonId,
          type: typeof lessonId,
          stringified: JSON.stringify(lessonId)
        },
        expected: '24-character hex string like "6839dfac0ee10d51ff4a5dcb"'
      });
    }
    // ✅ STEP 2: Handle topicId validation and extraction
    let finalTopicId = null;
    
    // First, try to extract topicId from request if provided
    if (topicId !== undefined && topicId !== null) {
      finalTopicId = extractValidObjectId(topicId, 'topicId');
      
      if (finalTopicId) {
      } else {
     
      }
    } else {
    }
    
    // If no valid topicId from request, try to get it from the lesson
    if (!finalTopicId) {
      try {
        const lesson = await Lesson.findById(validLessonId);
        if (lesson && lesson.topicId) {
          finalTopicId = extractValidObjectId(lesson.topicId, 'lesson.topicId');
          if (finalTopicId) {
          } else {
          }
        } else {
      
        }
      } catch (error) {
        console.error('❌ Error fetching lesson for topicId:', error.message);
      }
    }

    // ✅ STEP 3: Prepare update data with validation
    const updateData = {
      completedSteps: Array.isArray(completedSteps) ? completedSteps : [],
      progressPercent: Math.min(100, Math.max(0, Number(progressPercent) || 0)),
      completed: Boolean(completed),
      currentStep: Math.max(0, Number(currentStep) || 0),
      totalSteps: Math.max(0, Number(totalSteps) || 0),
      mistakes: Math.max(0, Number(mistakes) || 0),
      medal: String(medal || 'none'),
      duration: Math.max(0, Number(duration) || 0),
      timeSpent: Math.max(0, Number(timeSpent) || Number(duration) || 0),
      stars: Math.min(5, Math.max(0, Number(stars) || 0)),
      score: Math.max(0, Number(score) || 0),
      points: Math.max(0, Number(points) || 0),
      hintsUsed: Math.max(0, Number(hintsUsed) || 0),
      submittedHomework: Boolean(submittedHomework),
      updatedAt: new Date()
    };

    // Set completedAt when lesson is marked as completed
    if (completed && !updateData.completedAt) {
      updateData.completedAt = new Date();
    }

    // ✅ CRITICAL: Only add topicId if it's valid
    if (finalTopicId) {
      updateData.topicId = finalTopicId;
    } else {
      // Explicitly unset topicId if it was invalid
      updateData.$unset = { topicId: "" };
    }

  

    // ✅ STEP 4: Perform the database update
    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId: validLessonId },
      updateData,
      { 
        upsert: true, 
        new: true, 
        runValidators: true,
        context: 'query' // Important for mongoose validation
      }
    );

    

    res.status(200).json({
      message: '✅ Progress saved/updated',
      data: updated,
      debug: {
        receivedTopicId: {
          original: topicId,
          type: typeof topicId,
          stringified: JSON.stringify(topicId)
        },
        processedTopicId: finalTopicId,
        fromLesson: !req.body.topicId && !!finalTopicId
      }
    });

  } catch (error) {
    console.error('\n❌ ERROR in POST /api/progress:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Enhanced error reporting for specific error types
    if (error.name === 'CastError') {
      console.error('❌ CAST ERROR Details:');
      console.error('  Field causing error:', error.path);
      console.error('  Invalid value:', error.value);
      console.error('  Expected type:', error.kind);
      console.error('  String representation:', String(error.value));
      
      return res.status(400).json({ 
        message: '❌ Invalid data format - ObjectId casting failed', 
        error: {
          field: error.path,
          receivedValue: error.value,
          receivedType: typeof error.value,
          expectedType: error.kind,
          stringRepresentation: String(error.value)
        },
        solution: `The field '${error.path}' must be a valid 24-character hex string ObjectId, not: ${error.value}`
      });
    } else if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(e => ({
        field: e.path,
        message: e.message,
        value: e.value,
        kind: e.kind
      }));
      
      console.error('❌ VALIDATION ERROR Details:', validationErrors);
      
      return res.status(400).json({ 
        message: '❌ Validation error', 
        errors: validationErrors
      });
    } else if (error.name === 'MongooseError') {
      console.error('❌ MONGOOSE ERROR:', error.message);
      return res.status(500).json({
        message: '❌ Database error',
        error: error.message
      });
    }
    
    // Generic error response
    res.status(500).json({ 
      message: '❌ Server error', 
      error: error.message,
      type: error.name
    });
  }
});


// ========================================
// 📊 LEARNING PROFILE MODEL (NEW)
// ========================================

const learningProfileSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  
  // Cognitive Profile
  cognitiveProfile: {
    processingSpeed: { type: Number, min: 0, max: 100, default: 50 },
    workingMemory: { type: Number, min: 0, max: 100, default: 50 },
    visualSpatial: { type: Number, min: 0, max: 100, default: 50 },
    verbalLinguistic: { type: Number, min: 0, max: 100, default: 50 },
    logicalMathematical: { type: Number, min: 0, max: 100, default: 50 }
  },
  
  // Learning Style
  learningStyle: {
    primary: { 
      type: String, 
      enum: ['visual', 'auditory', 'kinesthetic', 'reading-writing'],
      default: 'visual'
    },
    secondary: { type: String }
  },
  
  // Neurotype Patterns
  neurotype: {
    focusPattern: { 
      type: String, 
      enum: ['hyperfocus', 'scattered', 'cyclic', 'steady'],
      default: 'steady'
    },
    attentionSpan: {
      morning: { type: Number, min: 5, max: 120, default: 30 },
      afternoon: { type: Number, min: 5, max: 120, default: 25 },
      evening: { type: Number, min: 5, max: 120, default: 20 }
    }
  },
  
  // Chronotype
  chronotype: {
    type: { 
      type: String, 
      enum: ['lark', 'owl', 'third-bird', 'variable'],
      default: 'third-bird'
    },
    peakHours: [{ type: Number, min: 0, max: 23 }],
    optimalSessionLength: { type: Number, min: 5, max: 90, default: 30 }
  },
  
  // Performance Patterns
  performancePatterns: {
    optimalDifficulty: { type: Number, min: 0, max: 1, default: 0.7 },
    averageAccuracy: { type: Number, min: 0, max: 100, default: 50 },
    completionRate: { type: Number, min: 0, max: 100, default: 50 }
  },
  
  // Adaptive Metrics
  adaptiveMetrics: {
    currentStressLevel: { type: Number, min: 0, max: 100, default: 30 },
    engagementScore: { type: Number, min: 0, max: 100, default: 50 },
    lastUpdated: { type: Date, default: Date.now }
  },
  
  // Preferred Learning Path
  preferredPath: {
    type: String,
    enum: ['storyteller', 'builder', 'scientist', 'artist', 'gamer', 'social', 'debater'],
    default: 'storyteller'
  }
  
}, { timestamps: true });

// Methods
learningProfileSchema.methods.updateFromPerformance = function(performanceData) {
  if (performanceData.speed) {
    this.cognitiveProfile.processingSpeed = 
      (this.cognitiveProfile.processingSpeed * 0.8) + (performanceData.speed * 0.2);
  }
  
  if (performanceData.accuracy) {
    this.performancePatterns.averageAccuracy = 
      (this.performancePatterns.averageAccuracy * 0.8) + (performanceData.accuracy * 0.2);
  }
  
  this.adaptiveMetrics.lastUpdated = new Date();
  return this.save();
};

learningProfileSchema.statics.getOrCreate = async function(userId) {
  let profile = await this.findOne({ userId });
  
  if (!profile) {
    profile = await this.create({ userId });
  }
  
  return profile;
};

const LearningProfile = mongoose.models.LearningProfile || 
  mongoose.model('LearningProfile', learningProfileSchema);

// ========================================
// 🎮 REWARDS MODEL (NEW)
// ========================================

const rewardsSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  level: { type: Number, default: 1 },
  totalPoints: { type: Number, default: 0 },
  currentLevelProgress: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  lastStreakDate: { type: Date },
  nextRewardIn: { type: Number, default: 10 },
  achievements: [{
    id: String,
    name: String,
    icon: String,
    rarity: { 
      type: String, 
      enum: ['common', 'rare', 'epic', 'legendary'],
      default: 'common'
    },
    unlockedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Static method to get or create rewards
rewardsSchema.statics.getOrCreate = async function(userId) {
  let rewards = await this.findOne({ userId });
  
  if (!rewards) {
    rewards = await this.create({
      userId,
      level: 1,
      totalPoints: 0,
      currentLevelProgress: 0,
      streak: 0,
      nextRewardIn: 10,
      achievements: []
    });
  }
  
  return rewards;
};

const Rewards = mongoose.models.Rewards || 
  mongoose.model('Rewards', rewardsSchema);

// ========================================
// 🧬 LEARNING PROFILE ROUTES (UPDATED LOGIC)
// ========================================

// GET /api/progress/learning-profile/:userId
router.get('/learning-profile/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if user has enough activity to generate a profile
    const userProgress = await UserProgress.find({ userId }).limit(5);
    
    if (userProgress.length < 3) {
      // Not enough data yet
      return res.json({
        success: true,
        profile: null,
        message: 'Complete at least 3 lessons to unlock your Learning DNA',
        requirements: {
          current: userProgress.length,
          required: 3,
          remaining: 3 - userProgress.length
        }
      });
    }
    
    // Get or create profile
    let profile = await LearningProfile.findOne({ userId });
    
    if (!profile) {
      // Create initial profile based on existing progress
      profile = await createInitialProfile(userId, userProgress);
    }
    
    res.json({
      success: true,
      profile,
      insights: generateInsights(profile)
    });
      
  } catch (error) {
    console.error('❌ Error fetching learning profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch learning profile',
      message: error.message
    });
  }
});

// Helper function to create initial profile from progress data
async function createInitialProfile(userId, progressData) {
  // Analyze user's performance patterns
  const avgAccuracy = progressData.reduce((sum, p) => {
    const accuracy = p.mistakes > 0 
       ? ((p.completedSteps.length / (p.completedSteps.length + p.mistakes)) * 100)
      : 100;
    return sum + accuracy;
  }, 0) / progressData.length;
  
  const avgDuration = progressData.reduce((sum, p) => sum + (p.duration || 0), 0) / progressData.length;
  const avgStars = progressData.reduce((sum, p) => sum + (p.stars || 0), 0) / progressData.length;
  
  // Determine learning style based on performance
  let primaryStyle = 'visual'; // Default
  if (avgDuration < 300) primaryStyle = 'kinesthetic'; // Fast completion
  else if (avgAccuracy > 90) primaryStyle = 'reading-writing'; // High accuracy
  
  // Determine chronotype based on activity times
  const activityHours = progressData
    .filter(p => p.completedAt)
    .map(p => new Date(p.completedAt).getHours());
    
  const avgHour = activityHours.reduce((sum, h) => sum + h, 0) / activityHours.length;
  let chronotype = 'third-bird';
  let peakHours = [9, 10, 11];
  
  if (avgHour < 10) {
    chronotype = 'lark';
    peakHours = [6, 7, 8, 9];
  } else if (avgHour > 18) {
    chronotype = 'owl';
    peakHours = [20, 21, 22, 23];
  }
  
  // Create profile
  const profile = await LearningProfile.create({
    userId,
    cognitiveProfile: {
      processingSpeed: Math.min(100, (300 / avgDuration) * 50),
      workingMemory: Math.min(100, avgAccuracy * 0.8),
      visualSpatial: 50,
      verbalLinguistic: 50,
      logicalMathematical: Math.min(100, avgStars * 25)
    },
    learningStyle: {
      primary: primaryStyle,
      secondary: 'visual'
    },
    neurotype: {
      focusPattern: avgDuration > 600 ? 'hyperfocus' : 'steady',
      attentionSpan: {
        morning: Math.min(120, avgDuration / 60),
        afternoon: Math.min(120, avgDuration / 60 * 0.8),
        evening: Math.min(120, avgDuration / 60 * 0.6)
      }
    },
    chronotype: {
      type: chronotype,
      peakHours: peakHours,
      optimalSessionLength: Math.round(avgDuration / 60)
    },
    performancePatterns: {
      optimalDifficulty: avgAccuracy / 100,
      averageAccuracy: avgAccuracy,
      completionRate: (progressData.filter(p => p.completed).length / progressData.length) * 100
    },
    adaptiveMetrics: {
      currentStressLevel: avgAccuracy < 70 ? 50 : 30,
      engagementScore: avgStars * 20,
      lastUpdated: new Date()
    },
    preferredPath: avgAccuracy > 85 ? 'scientist' : 'storyteller'
  });
  
  return profile;
}


// POST /api/progress/learning-profile/:userId/update
router.post('/learning-profile/:userId/update', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const performanceData = req.body;
    
    const profile = await LearningProfile.findOne({ userId });
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }
    
    await profile.updateFromPerformance(performanceData);
    
    res.json({
      success: true,
      profile,
      message: 'Profile updated based on performance'
    });
    
  } catch (error) {
    console.error('❌ Error updating profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// GET /api/progress/learning-profile/:userId/recommendation
router.get('/learning-profile/:userId/recommendation', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if profile exists
    const profile = await LearningProfile.findOne({ userId });
    
    if (!profile) {
      // Check if user has enough data
      const progressCount = await UserProgress.countDocuments({ userId });
      
      return res.json({
        success: true,
        recommendation: null,
        message: progressCount < 3 
           ? 'Complete more lessons to unlock personalized recommendations'
          : 'Learning profile not yet generated',
        requirements: {
          current: progressCount,
          required: 3
        }
      });
    }
    
    const recommendation = {
      preferredPath: profile.preferredPath,
      optimalTime: getCurrentOptimalTime(profile.chronotype),
      sessionLength: profile.chronotype.optimalSessionLength,
      difficultyLevel: profile.performancePatterns.optimalDifficulty,
      tips: generateLearningTips(profile)
    };
    
    res.json({
      success: true,
      recommendation
    });
      
  } catch (error) {
    console.error('❌ Error generating recommendation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate recommendation',
      message: error.message
    });
  }
});

// ========================================
// 🔧 HELPER FUNCTIONS (FOR LEARNING PROFILE) (NEW)
// ========================================

function generateInsights(profile) {
  const insights = [];
  
  if (profile.chronotype.type === 'lark') {
    insights.push('🌅 You learn best in the morning! Try studying between 6-10 AM.');
  } else if (profile.chronotype.type === 'owl') {
    insights.push('🦉 You\'re a night owl! Your peak learning time is 8 PM - midnight.');
  }
  
  const avgAttention = (
    profile.neurotype.attentionSpan.morning +
    profile.neurotype.attentionSpan.afternoon +
    profile.neurotype.attentionSpan.evening
  ) / 3;
  
  if (avgAttention < 20) {
    insights.push('⚡ Short, frequent sessions work best for you. Try 15-minute focused bursts.');
  } else if (avgAttention > 45) {
    insights.push('🎯 You can maintain deep focus! Consider 45-60 minute deep work sessions.');
  }
  
  if (profile.learningStyle.primary === 'visual') {
    insights.push('👁️ Visual learner detected! Lessons with diagrams and images suit you best.');
  }
  
  return insights;
}

function getCurrentOptimalTime(chronotype) {
  const now = new Date().getHours();
  
  if (chronotype.peakHours && chronotype.peakHours.length > 0) {
    const closestPeakHour = chronotype.peakHours.reduce((prev, curr) => 
      Math.abs(curr - now) < Math.abs(prev - now) ? curr : prev
    );
    
    return {
      isOptimal: chronotype.peakHours.includes(now),
      nextOptimal: closestPeakHour,
      hoursUntilOptimal: closestPeakHour - now
    };
  }
  
  return null;
}

function generateLearningTips(profile) {
  const tips = [];
  
  if (profile.neurotype.focusPattern === 'hyperfocus') {
    tips.push('Use your hyperfocus superpower, but remember to take breaks!');
  } else if (profile.neurotype.focusPattern === 'scattered') {
    tips.push('Try the Pomodoro Technique: 25 min focus + 5 min break');
  }
  
  return tips;
}

// ========================================
// 🎮 REWARDS ROUTES (NEW)
// ========================================

// GET /api/progress/rewards/:userId - Get user rewards
router.get('/rewards/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const rewards = await Rewards.getOrCreate(userId);
    
    res.json({
      success: true,
      rewards
    });
    
  } catch (error) {
    console.error('❌ Error fetching rewards:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rewards'
    });
  }
});

// POST /api/progress/rewards/:userId/check - Check for reward after step completion
router.post('/rewards/:userId/check', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentStep } = req.body;
    
    let rewards = await Rewards.findOne({ userId });
    
    if (!rewards) {
      rewards = await Rewards.create({ userId });
    }
    
    // Add points for step completion
    const pointsEarned = 10;
    rewards.totalPoints += pointsEarned;
    rewards.currentLevelProgress += 5;
    
    // Check for level up
    let leveledUp = false;
    if (rewards.currentLevelProgress >= 100) {
      rewards.level += 1;
      rewards.currentLevelProgress = 0;
      leveledUp = true;
      
      // Add level achievement
      rewards.achievements.push({
        id: `level-${rewards.level}`,
        name: `Level ${rewards.level} Achieved!`,
        icon: '🎖️',
        rarity: rewards.level % 5 === 0 ? 'legendary' : 
                rewards.level % 3 === 0 ? 'epic' : 
                rewards.level % 2 === 0 ? 'rare' : 'common',
        unlockedAt: new Date()
      });
    }
    
    // Calculate next reward distance
    rewards.nextRewardIn = Math.max(0, 10 - (currentStep % 10));
    
    // Check for milestone achievements
    if (rewards.totalPoints === 100) {
      rewards.achievements.push({
        id: 'first-100',
        name: 'Century Club',
        icon: '💯',
        rarity: 'rare',
        unlockedAt: new Date()
      });
    } else if (rewards.totalPoints === 500) {
      rewards.achievements.push({
        id: 'points-500',
        name: 'Point Master',
        icon: '🌟',
        rarity: 'epic',
        unlockedAt: new Date()
      });
    } else if (rewards.totalPoints === 1000) {
      rewards.achievements.push({
        id: 'points-1000',
        name: 'Legendary Learner',
        icon: '👑',
        rarity: 'legendary',
        unlockedAt: new Date()
      });
    }
    
    await rewards.save();
    
    res.json({
      success: true,
      rewards,
      leveledUp,
      pointsEarned
    });
    
  } catch (error) {
    console.error('❌ Error checking reward:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check reward'
    });
  }
});

// POST /api/progress/rewards/:userId/streak - Update daily streak
router.post('/rewards/:userId/streak', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    let rewards = await Rewards.findOne({ userId });
    
    if (!rewards) {
      rewards = await Rewards.create({ userId });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const lastStreak = rewards.lastStreakDate ? new Date(rewards.lastStreakDate) : null;
    
    if (!lastStreak || lastStreak < today) {
      if (lastStreak) {
        lastStreak.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor((today - lastStreak) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 1) {
          // Consecutive day - increment streak
          rewards.streak += 1;
          
          // Check for streak achievements
          if (rewards.streak === 7) {
            rewards.achievements.push({
              id: 'streak-7',
              name: 'Week Warrior',
              icon: '🔥',
              rarity: 'rare',
              unlockedAt: new Date()
            });
          } else if (rewards.streak === 30) {
            rewards.achievements.push({
              id: 'streak-30',
              name: 'Monthly Master',
              icon: '🏆',
              rarity: 'epic',
              unlockedAt: new Date()
            });
          } else if (rewards.streak === 100) {
            rewards.achievements.push({
              id: 'streak-100',
              name: 'Century Streak',
              icon: '💎',
              rarity: 'legendary',
              unlockedAt: new Date()
            });
          }
        } else if (daysDiff > 1) {
          // Streak broken - reset to 1
          rewards.streak = 1;
        }
        // If daysDiff === 0, already updated today, do nothing
      } else {
        // First streak
        rewards.streak = 1;
      }
      
      rewards.lastStreakDate = today;
      await rewards.save();
    }
    
    res.json({
      success: true,
      streak: rewards.streak,
      rewards
    });
    
  } catch (error) {
    console.error('❌ Error updating streak:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update streak'
    });
  }
});


// ✅ Enhanced error handling middleware
router.use((error, req, res, next) => {
  console.error('\n🔥 UserProgress Route Error Handler:');
  console.error('URL:', req.originalUrl);
  console.error('Method:', req.method);
  console.error('Error:', error.message);
  console.error('Error Type:', error.name);
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      message: '❌ Invalid ObjectId format',
      field: error.path,
      value: error.value,
      expected: '24-character hex string',
      url: req.originalUrl
    });
  }
  
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(e => ({
      field: e.path,
      message: e.message,
      value: e.value
    }));
    
    return res.status(400).json({
      message: '❌ Validation failed',
      errors: errors,
      url: req.originalUrl
    });
  }
  
  // Pass to global error handler if not handled here
  next(error);
});

module.exports = router;