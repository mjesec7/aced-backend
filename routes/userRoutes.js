const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ✅ Models
const User = require('../models/user');
const TopicProgress = require('../models/topicProgress');
const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const UserProgress = require('../models/userProgress');
const Homework = require('../models/homework');
const Test = require('../models/Test');
const TestResult = require('../models/TestResult');
const HomeworkProgress = require('../models/homeworkProgress');

// ✅ Firebase & Middleware
const admin = require('../config/firebase');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ Controllers
const homeworkController = require('../controllers/homeworkController');
const testController = require('../controllers/testController');
const userProgressController = require('../controllers/userProgressController');
const { getRecommendations } = require('../controllers/recommendationController');

console.log('✅ userRoutes.js loaded with homework usage tracking');

// ========================================
// 🛠️ UTILITY FUNCTIONS
// ========================================

// Helper function to get current month key
const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
};

// Helper function to extract valid ObjectId from various input formats
const extractValidObjectId = (input, fieldName = 'ObjectId') => {
  if (!input) return null;
  
  try {
    // If it's already a valid ObjectId, return it
    if (mongoose.Types.ObjectId.isValid(input) && typeof input === 'string') {
      return new mongoose.Types.ObjectId(input);
    }
    
    // If it's already an ObjectId instance
    if (input instanceof mongoose.Types.ObjectId) {
      return input;
    }
    
    // If it's an object, try to extract the ID
    if (typeof input === 'object') {
      const possibleIds = [
        input._id,
        input.id,
        input.topicId,
        input.lessonId,
        input.toString?.()
      ];
      
      for (const possibleId of possibleIds) {
        if (possibleId && mongoose.Types.ObjectId.isValid(possibleId)) {
          return new mongoose.Types.ObjectId(possibleId);
        }
      }
    }
    
    // Try converting to string and checking if valid
    const stringValue = String(input);
    if (stringValue !== '[object Object]' && mongoose.Types.ObjectId.isValid(stringValue)) {
      return new mongoose.Types.ObjectId(stringValue);
    }
    
    console.warn(`⚠️ Could not extract valid ObjectId from ${fieldName}:`, {
      input,
      type: typeof input,
      stringified: String(input)
    });
    
    return null;
  } catch (error) {
    console.error(`❌ Error extracting ObjectId from ${fieldName}:`, error.message);
    return null;
  }
};

// Enhanced data sanitization function
const sanitizeProgressData = (data) => {
  const sanitized = { ...data };
  
  // Handle topicId
  if (sanitized.topicId) {
    const validTopicId = extractValidObjectId(sanitized.topicId, 'topicId');
    sanitized.topicId = validTopicId;
  }
  
  // Handle lessonId
  if (sanitized.lessonId) {
    const validLessonId = extractValidObjectId(sanitized.lessonId, 'lessonId');
    sanitized.lessonId = validLessonId;
  }
  
  // Ensure numeric fields are properly converted
  const numericFields = ['progressPercent', 'mistakes', 'duration', 'stars', 'points', 'hintsUsed'];
  numericFields.forEach(field => {
    if (sanitized[field] !== undefined) {
      sanitized[field] = Number(sanitized[field]) || 0;
    }
  });
  
  // Ensure boolean fields are properly converted
  const booleanFields = ['completed', 'submittedHomework'];
  booleanFields.forEach(field => {
    if (sanitized[field] !== undefined) {
      sanitized[field] = Boolean(sanitized[field]);
    }
  });
  
  // Ensure arrays are properly handled
  if (sanitized.completedSteps && !Array.isArray(sanitized.completedSteps)) {
    sanitized.completedSteps = [];
  }
  
  return sanitized;
};

// Middleware
function validateFirebaseId(req, res, next) {
  if (!req.params.firebaseId) return res.status(400).json({ error: '❌ Missing firebaseId' });
  next();
}

function verifyOwnership(req, res, next) {
  if (!req.user || req.user.uid !== req.params.firebaseId)
    return res.status(403).json({ error: '❌ Access denied: User mismatch' });
  next();
}

function validateObjectId(req, res, next) {
  const { id } = req.params;
  if (id && !mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: '❌ Invalid ObjectId' });
  next();
}

// ========================================
// 🔐 AUTH SAVE ROUTE
// ========================================

router.post('/save', async (req, res) => {
  const { token, name, subscriptionPlan } = req.body;
  
  console.log('💾 User save request on api.aced.live:', {
    hasToken: !!token,
    tokenLength: token?.length || 0,
    tokenPreview: token?.slice(0, 30) + '...',
    name,
    subscriptionPlan,
    timestamp: new Date().toISOString()
  });
  
  if (!token || !name) {
    return res.status(400).json({ 
      error: '❌ Missing token or name',
      required: ['token', 'name'],
      server: 'api.aced.live'
    });
  }
  
  try {
    console.log('🔍 Verifying token directly in save route...');
    
    const decoded = await admin.auth().verifyIdToken(token);
    
    console.log('✅ Token verified in save route:', {
      uid: decoded.uid,
      email: decoded.email,
      projectId: decoded.aud,
      expectedProjectId: 'aced-9cf72',
      match: decoded.aud === 'aced-9cf72'
    });
    
    if (decoded.aud !== 'aced-9cf72') {
      console.error('❌ Project ID mismatch in save route:', {
        expected: 'aced-9cf72',
        received: decoded.aud
      });
      return res.status(403).json({ 
        error: '❌ Token from wrong Firebase project',
        expected: 'aced-9cf72',
        received: decoded.aud
      });
    }
    
    const firebaseId = decoded.uid;
    const email = decoded.email;

    let user = await User.findOne({ firebaseId });
    if (!user) {
      console.log('👤 Creating new user:', firebaseId);
      user = new User({ 
        firebaseId, 
        email, 
        name, 
        Login: email,
        subscriptionPlan: subscriptionPlan || 'free',
        diary: [],
        studyList: [],
        homeworkUsage: new Map(),
        lastResetCheck: new Date()
      });
    } else {
      console.log('📝 Updating existing user:', firebaseId);
      user.email = email;
      user.name = name;
      user.Login = email;
      if (subscriptionPlan) user.subscriptionPlan = subscriptionPlan;
      
      // Initialize homework usage if not present
      if (!user.homeworkUsage) {
        user.homeworkUsage = new Map();
      }
      if (!user.lastResetCheck) {
        user.lastResetCheck = new Date();
      }
    }

    await user.save();
    console.log('✅ User saved successfully on api.aced.live');
    
    res.json({
      ...user.toObject(),
      message: '✅ User saved successfully',
      server: 'api.aced.live'
    });
    
  } catch (err) {
    console.error('❌ Token verification failed in save route:', {
      error: err.message,
      code: err.code,
      name: err.name,
      server: 'api.aced.live'
    });
    
    if (err.code && err.code.startsWith('auth/')) {
      res.status(401).json({ 
        error: '❌ Invalid Firebase token',
        details: err.message,
        code: err.code
      });
    } else {
      res.status(500).json({ 
        error: '❌ Server error during user save',
        details: err.message
      });
    }
  }
});

// ========================================
// 📊 HOMEWORK HELP USAGE TRACKING ROUTES
// ========================================

// ✅ GET current month usage
router.get('/:firebaseId/usage/:monthKey', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId, monthKey } = req.params;
    
    const user = await User.findOne({ firebaseId });
    if (!user) {
      return res.status(404).json({ error: '❌ User not found' });
    }

    // Check and perform monthly reset if needed
    await user.checkMonthlyReset();
    
    const currentUsage = user.getCurrentMonthUsage();
    const limits = user.getUsageLimits();

    res.json({
      success: true,
      usage: currentUsage,
      plan: user.subscriptionPlan,
      limits,
      monthKey,
      remaining: {
        messages: limits.messages === -1 ? '∞' : Math.max(0, limits.messages - currentUsage.messages),
        images: limits.images === -1 ? '∞' : Math.max(0, limits.images - currentUsage.images)
      }
    });

  } catch (error) {
    console.error('❌ Failed to get usage:', error);
    res.status(500).json({ error: '❌ Internal server error' });
  }
});

// ✅ POST reset usage for specific month (admin/testing)
router.post('/:firebaseId/usage/:monthKey/reset', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId, monthKey } = req.params;
    
    const user = await User.findOne({ firebaseId });
    if (!user) {
      return res.status(404).json({ error: '❌ User not found' });
    }

    const resetUsage = { messages: 0, images: 0, lastUsed: new Date() };
    user.homeworkUsage.set(monthKey, resetUsage);
    user.lastResetCheck = new Date();
    
    await user.save();

    console.log(`🔄 Manual usage reset for user ${firebaseId}, month ${monthKey}`);

    res.json({
      success: true,
      usage: resetUsage,
      monthKey,
      message: '✅ Usage reset successfully'
    });

  } catch (error) {
    console.error('❌ Failed to reset usage:', error);
    res.status(500).json({ error: '❌ Internal server error' });
  }
});

// ✅ GET usage statistics
router.get('/:firebaseId/usage/stats', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId } = req.params;
    const months = parseInt(req.query.months) || 6;
    
    const user = await User.findOne({ firebaseId });
    if (!user) {
      return res.status(404).json({ error: '❌ User not found' });
    }

    // Generate stats for last N months
    const stats = [];
    const now = new Date();
    let totalMessages = 0;
    let totalImages = 0;
    
    for (let i = 0; i < months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      const usage = user.homeworkUsage.get(monthKey) || { messages: 0, images: 0 };
      
      stats.push({
        monthKey,
        month: date.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' }),
        usage,
        timestamp: date.toISOString()
      });
      
      totalMessages += usage.messages || 0;
      totalImages += usage.images || 0;
    }
    
    const averageDaily = {
      messages: Math.round((totalMessages / (months * 30)) * 100) / 100,
      images: Math.round((totalImages / (months * 30)) * 100) / 100
    };

    res.json({
      success: true,
      stats: stats.reverse(), // Most recent first
      totalUsage: { messages: totalMessages, images: totalImages },
      averageDaily,
      period: `${months} months`
    });

  } catch (error) {
    console.error('❌ Failed to get usage stats:', error);
    res.status(500).json({ error: '❌ Internal server error' });
  }
});

// ========================================
// 🤖 AI CHAT ENDPOINT WITH USAGE TRACKING
// ========================================

router.post('/chat', verifyToken, async (req, res) => {
  try {
    const { userInput, imageUrl, lessonId, trackUsage, monthKey, hasImage } = req.body;
    const firebaseId = req.user.uid;

    if (!userInput && !imageUrl) {
      return res.status(400).json({ error: '❌ Missing user input or image' });
    }

    // Get user and check usage limits
    const user = await User.findOne({ firebaseId });
    if (!user) {
      return res.status(404).json({ error: '❌ User not found' });
    }

    // Check and perform monthly reset if needed
    await user.checkMonthlyReset();
    
    // Check usage limits
    const limitCheck = user.checkUsageLimits(hasImage);
    if (!limitCheck.allowed) {
      return res.status(403).json({ 
        error: limitCheck.message,
        code: limitCheck.reason,
        currentUsage: user.getCurrentMonthUsage(),
        limits: user.getUsageLimits()
      });
    }

    // Make the actual AI request (implement your AI service here)
    let aiResponse;
    try {
      // TODO: Replace with your actual AI service call
      aiResponse = await makeAIRequest(userInput, imageUrl, lessonId);
    } catch (aiError) {
      console.error('❌ AI request failed:', aiError);
      return res.status(500).json({ error: '❌ AI service temporarily unavailable' });
    }

    // Update usage if tracking is enabled
    if (trackUsage) {
      const newUsage = await user.incrementUsage(1, hasImage ? 1 : 0);
      const limits = user.getUsageLimits();

      console.log(`📊 Usage updated for user ${firebaseId}:`, newUsage);
      
      res.json({
        reply: aiResponse,
        success: true,
        updatedUsage: newUsage,
        remaining: {
          messages: limits.messages === -1 ? '∞' : Math.max(0, limits.messages - newUsage.messages),
          images: limits.images === -1 ? '∞' : Math.max(0, limits.images - newUsage.images)
        }
      });
    } else {
      res.json({
        reply: aiResponse,
        success: true
      });
    }

  } catch (error) {
    console.error('❌ Chat endpoint error:', error);
    res.status(500).json({ error: '❌ Internal server error' });
  }
});

// Helper function to make AI request (implement based on your AI provider)
async function makeAIRequest(userInput, imageUrl, lessonId) {
  // Example implementation for OpenAI
  try {
    // This is a placeholder - replace with your actual AI service
    // For now, return a simple response
    return `Я получил ваш запрос: "${userInput}". Это тестовый ответ. Пожалуйста, настройте ваш AI сервис в функции makeAIRequest.`;
  } catch (error) {
    console.error('❌ AI service error:', error);
    throw new Error('AI service error');
  }
}

// ========================================
// 📄 USER INFO ROUTES
// ========================================

router.get('/:firebaseId', validateFirebaseId, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json(user);
  } catch (error) {
    console.error('❌ Error fetching user:', error);
    res.status(500).json({ error: '❌ Server error' });
  }
});

router.get('/:firebaseId/status', validateFirebaseId, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json({ status: user.subscriptionPlan || 'free' });
  } catch (error) {
    console.error('❌ Error fetching user status:', error);
    res.status(500).json({ error: '❌ Server error' });
  }
});

// ========================================
// 🎯 RECOMMENDATIONS ROUTE
// ========================================

router.get('/:firebaseId/recommendations', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET recommendations for user:', req.params.firebaseId);
  
  try {
    if (getRecommendations) {
      return getRecommendations(req, res);
    }
    
    const userId = req.params.firebaseId;
    const user = await User.findOne({ firebaseId: userId });
    const studyListTopicIds = user?.studyList?.map(item => item.topicId?.toString()).filter(Boolean) || [];
    
    const allTopics = await Topic.find({
      _id: { $nin: studyListTopicIds }
    }).limit(10);
    
    const topicsWithLessons = await Promise.all(
      allTopics.map(async (topic) => {
        const lessons = await Lesson.find({ topicId: topic._id });
        return {
          ...topic.toObject(),
          lessons: lessons
        };
      })
    );
    
    const recommendations = topicsWithLessons.filter(topic => topic.lessons.length > 0);
    
    console.log(`✅ Returning ${recommendations.length} recommendations`);
    res.json(recommendations);
    
  } catch (error) {
    console.error('❌ Error fetching recommendations:', error);
    res.status(500).json({ error: '❌ Error fetching recommendations' });
  }
});

// ========================================
// 📚 HOMEWORK ROUTES (ENHANCED)
// ========================================

router.get('/:firebaseId/homeworks', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET all homeworks for user:', req.params.firebaseId);
  
  try {
    const userId = req.params.firebaseId;
    
    const userProgress = await HomeworkProgress.find({ userId })
      .populate('lessonId', 'title lessonName subject homework')
      .sort({ updatedAt: -1 });
    
    const standaloneHomework = await Homework.find({ isActive: true });
    const lessonsWithHomework = await Lesson.find({ 
      homework: { $exists: true, $ne: [], $not: { $size: 0 } } 
    });
    
    const allHomeworks = [];
    
    // Add standalone homework
    for (const hw of standaloneHomework) {
      const userHwProgress = userProgress.find(up => 
        up.homeworkId?.toString() === hw._id.toString() ||
        up.metadata?.standaloneHomeworkId === hw._id.toString()
      );
      
      allHomeworks.push({
        _id: hw._id,
        title: hw.title,
        subject: hw.subject,
        level: hw.level,
        instructions: hw.instructions,
        dueDate: hw.dueDate,
        difficulty: hw.difficulty,
        exercises: hw.exercises || [],
        type: 'standalone',
        completed: userHwProgress?.completed || false,
        score: userHwProgress?.score || 0,
        updatedAt: userHwProgress?.updatedAt || hw.updatedAt,
        hasProgress: !!userHwProgress
      });
    }
    
    // Add lesson-based homework
    for (const lesson of lessonsWithHomework) {
      const userHwProgress = userProgress.find(up => up.lessonId?.toString() === lesson._id.toString());
      
      allHomeworks.push({
        lessonId: lesson._id,
        title: `Домашнее задание: ${lesson.lessonName || lesson.title}`,
        lessonName: lesson.lessonName || lesson.title,
        subject: lesson.subject,
        level: lesson.level,
        instructions: lesson.homeworkInstructions || '',
        exercises: lesson.homework || [],
        type: 'lesson',
        completed: userHwProgress?.completed || false,
        score: userHwProgress?.score || 0,
        updatedAt: userHwProgress?.updatedAt || lesson.updatedAt,
        hasProgress: !!userHwProgress
      });
    }
    
    // Sort by priority
    allHomeworks.sort((a, b) => {
      const getStatus = (hw) => {
        if (!hw.hasProgress) return 'pending';
        if (!hw.completed) return 'in-progress';
        return 'completed';
      };
      
      const statusPriority = { 'in-progress': 0, 'pending': 1, 'completed': 2 };
      const aStatus = getStatus(a);
      const bStatus = getStatus(b);
      
      if (statusPriority[aStatus] !== statusPriority[bStatus]) {
        return statusPriority[aStatus] - statusPriority[bStatus];
      }
      
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    
    console.log(`✅ Returning ${allHomeworks.length} homework items`);
    res.json({
      success: true,
      data: allHomeworks,
      message: '✅ Homework list retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching user homeworks:', error);
    res.status(500).json({ error: '❌ Error fetching homework list' });
  }
});

// ========================================
// 🧪 TEST ROUTES (ENHANCED)
// ========================================

router.get('/:firebaseId/tests', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET all tests for user:', req.params.firebaseId);
  
  try {
    const userId = req.params.firebaseId;
    
    const tests = await Test.find({ isActive: true }).select('-questions.correctAnswer -questions.explanation');
    const userResults = await TestResult.find({ userId });
    
    const testsWithProgress = tests.map(test => {
      const userResult = userResults.find(result => result.testId.toString() === test._id.toString());
      
      return {
        ...test.toObject(),
        userProgress: userResult ? {
          completed: true,
          score: userResult.score,
          submittedAt: userResult.submittedAt,
          canRetake: test.allowRetakes
        } : {
          completed: false,
          canRetake: true
        }
      };
    });
    
    console.log(`✅ Returning ${testsWithProgress.length} tests`);
    res.json({
      success: true,
      tests: testsWithProgress,
      message: '✅ Tests retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching user tests:', error);
    res.status(500).json({ error: '❌ Error fetching tests' });
  }
});

router.get('/:firebaseId/tests/:testId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET test for user:', req.params.firebaseId, 'testId:', req.params.testId);
  
  try {
    const { testId } = req.params;
    
    const test = await Test.findById(testId).select('-questions.correctAnswer -questions.explanation');
    
    if (!test) {
      return res.status(404).json({ error: '❌ Test not found' });
    }
    
    if (!test.isActive) {
      return res.status(403).json({ error: '❌ Test is not active' });
    }
    
    // Randomize questions if enabled
    if (test.randomizeQuestions && test.questions.length > 0) {
      test.questions = test.questions.sort(() => Math.random() - 0.5);
    }
    
    // Randomize options if enabled
    if (test.randomizeOptions) {
      test.questions.forEach(question => {
        if (question.options && question.options.length > 0) {
          question.options = question.options.sort(() => Math.random() - 0.5);
        }
      });
    }
    
    console.log(`✅ Test ${testId} retrieved successfully`);
    res.json({
      success: true,
      test: test,
      message: '✅ Test retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching test:', error);
    res.status(500).json({ error: '❌ Error fetching test' });
  }
});

router.post('/:firebaseId/tests/:testId/submit', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📤 POST test submission for user:', req.params.firebaseId, 'testId:', req.params.testId);
  
  try {
    const { firebaseId, testId } = req.params;
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: '❌ Answers are required and must be an array' });
    }

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ error: '❌ Test not found' });
    }

    if (!test.isActive) {
      return res.status(403).json({ error: '❌ Test is not active' });
    }

    // Check if user can retake the test
    const existingResult = await TestResult.findOne({ userId: firebaseId, testId });
    if (existingResult && !test.allowRetakes) {
      return res.status(400).json({ error: '❌ Test retakes are not allowed' });
    }

    const total = test.questions.length;
    let correct = 0;
    const detailedResults = [];

    // Grade the test
    test.questions.forEach((q, index) => {
      const userAnswer = answers.find(a => a.questionIndex === index)?.answer?.trim();
      const correctAnswer = q.correctAnswer;
      
      let isCorrect = false;
      if (q.type === 'multiple-choice' && Array.isArray(q.options)) {
        if (typeof correctAnswer === 'number') {
          const correctOptionText = q.options[correctAnswer]?.text || q.options[correctAnswer];
          isCorrect = userAnswer === correctOptionText;
        } else {
          isCorrect = userAnswer === correctAnswer;
        }
      } else {
        isCorrect = userAnswer?.toLowerCase() === correctAnswer?.toString().toLowerCase();
      }

      if (isCorrect) correct++;

      detailedResults.push({
        questionIndex: index,
        question: q.text || q.question,
        userAnswer,
        correctAnswer: test.showResults ? correctAnswer : null,
        isCorrect: test.showResults ? isCorrect : null,
        points: isCorrect ? (q.points || 1) : 0
      });
    });

    const percentage = Math.round((correct / total) * 100);
    const totalPoints = detailedResults.reduce((sum, result) => sum + (result.points || 0), 0);
    const passed = percentage >= (test.passingScore || 70);

    // Save or update test result
    const resultData = {
      userId: firebaseId,
      testId,
      answers: detailedResults,
      score: percentage,
      totalPoints,
      passed,
      submittedAt: new Date()
    };

    let result;
    if (existingResult && test.allowRetakes) {
      result = await TestResult.findByIdAndUpdate(existingResult._id, resultData, { new: true });
    } else {
      result = new TestResult(resultData);
      await result.save();
    }

    console.log(`✅ Test ${testId} submitted by user ${firebaseId}. Score: ${percentage}%`);

    res.json({
      success: true,
      data: {
        testId,
        correct,
        total,
        score: percentage,
        totalPoints,
        passed,
        details: test.showResults ? detailedResults : null,
        message: `Test completed! Score: ${percentage}%`
      }
    });
    
  } catch (error) {
    console.error('❌ Error submitting test result:', error);
    res.status(500).json({ error: '❌ Error submitting test result' });
  }
});

router.get('/:firebaseId/tests/:testId/result', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET test result for user:', req.params.firebaseId, 'testId:', req.params.testId);
  
  try {
    const { firebaseId, testId } = req.params;

    const result = await TestResult.findOne({ userId: firebaseId, testId }).populate('testId');
    if (!result) {
      return res.status(404).json({ error: '❌ Test result not found' });
    }

    console.log(`✅ Test result retrieved for user ${firebaseId}, test ${testId}`);
    res.json({ 
      success: true, 
      data: result,
      message: '✅ Test result retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching test result:', error);
    res.status(500).json({ error: '❌ Error fetching test result' });
  }
});

router.get('/:firebaseId/tests/results', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET all test results for user:', req.params.firebaseId);
  
  try {
    const { firebaseId } = req.params;
    const results = await TestResult.find({ userId: firebaseId })
      .populate('testId', 'title subject level topic')
      .sort({ submittedAt: -1 });

    console.log(`✅ Retrieved ${results.length} test results for user ${firebaseId}`);
    res.json({ 
      success: true, 
      data: results,
      message: '✅ Test results retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching user test results:', error);
    res.status(500).json({ error: '❌ Error fetching test results' });
  }
});

// ========================================
// 📚 STANDALONE HOMEWORK ROUTES (ENHANCED)
// ========================================

router.get('/:firebaseId/homework/:homeworkId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET standalone homework for user:', req.params.firebaseId, 'homeworkId:', req.params.homeworkId);
  
  try {
    const { firebaseId, homeworkId } = req.params;
    
    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      return res.status(404).json({ error: '❌ Homework not found' });
    }
    
    if (!homework.isActive) {
      return res.status(403).json({ error: '❌ Homework is not active' });
    }
    
    // Get user's progress - try multiple strategies
    let userProgress = await HomeworkProgress.findOne({
      userId: firebaseId,
      $or: [
        { homeworkId: homeworkId },
        { lessonId: homeworkId },
        { 'metadata.standaloneHomeworkId': homeworkId }
      ]
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
    res.status(500).json({ error: '❌ Error fetching homework' });
  }
});

router.post('/:firebaseId/homework/:homeworkId/save', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('💾 POST save standalone homework for user:', req.params.firebaseId, 'homeworkId:', req.params.homeworkId);
  
  try {
    const { firebaseId, homeworkId } = req.params;
    const { answers } = req.body;
    
    if (!firebaseId || !homeworkId) {
      return res.status(400).json({ error: '❌ Missing required parameters' });
    }
    
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: '❌ Answers must be an array' });
    }

    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      console.log('❌ Homework not found for ID:', homeworkId);
      return res.status(404).json({ error: '❌ Homework not found' });
    }

    console.log('✅ Homework found:', homework.title);

    // Check for existing progress using homeworkId field
    let existingProgress = await HomeworkProgress.findOne({
      userId: firebaseId,
      homeworkId: homeworkId
    });

    console.log('Existing progress:', existingProgress ? 'Found' : 'Not found');

    const progressData = {
      userId: firebaseId,
      homeworkId: homeworkId,  // Use the actual homeworkId field
      lessonId: null,
      answers: answers,
      completed: false,
      metadata: {
        type: 'standalone',
        homeworkTitle: homework.title
      },
      updatedAt: new Date()
    };

    let progress;
    if (existingProgress) {
      console.log('📝 Updating existing progress...');
      progress = await HomeworkProgress.findByIdAndUpdate(
        existingProgress._id,
        progressData,
        { new: true, runValidators: true }
      );
    } else {
      console.log('📝 Creating new progress...');
      progress = new HomeworkProgress(progressData);
      await progress.save();
    }

    console.log(`✅ Standalone homework progress saved for user ${firebaseId}`);
    res.json({
      success: true,
      data: progress,
      message: '✅ Homework progress saved'
    });
    
  } catch (error) {
    console.error('❌ Error saving standalone homework:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    if (error.name === 'ValidationError') {
      res.status(400).json({ error: '❌ Validation error: ' + error.message });
    } else if (error.name === 'CastError') {
      res.status(400).json({ error: '❌ Invalid ID format' });
    } else {
      res.status(500).json({ error: '❌ Error saving homework progress' });
    }
  }
});

router.post('/:firebaseId/homework/:homeworkId/submit', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📤 POST submit standalone homework for user:', req.params.firebaseId, 'homeworkId:', req.params.homeworkId);
  
  try {
    const { firebaseId, homeworkId } = req.params;
    const { answers } = req.body;
    
    console.log('📝 Received submission data:', {
      firebaseId,
      homeworkId,
      answersCount: answers?.length || 0,
      answersType: Array.isArray(answers) ? 'array' : typeof answers
    });
    
    if (!mongoose.Types.ObjectId.isValid(homeworkId)) {
      console.error('❌ Invalid homework ID format:', homeworkId);
      return res.status(400).json({ 
        success: false,
        error: '❌ Invalid homework ID format' 
      });
    }
    
    if (!Array.isArray(answers)) {
      console.error('❌ Answers not array:', typeof answers);
      return res.status(400).json({ 
        success: false,
        error: '❌ Answers must be an array' 
      });
    }

    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      console.error('❌ Homework not found:', homeworkId);
      return res.status(404).json({ 
        success: false,
        error: '❌ Homework not found' 
      });
    }

    if (!homework.exercises || homework.exercises.length === 0) {
      console.error('❌ Homework has no exercises:', homeworkId);
      return res.status(400).json({ 
        success: false,
        error: '❌ Homework has no exercises to grade' 
      });
    }

    console.log('📝 Grading homework with', homework.exercises.length, 'exercises');

    // Auto-grade the homework
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
      
      // Better answer comparison for different question types
      let isCorrect = false;
      
      if (exercise.type === 'multiple-choice') {
        // For multiple choice, check both exact match and option text match
        isCorrect = userAnswer.toLowerCase() === correctAnswerNormalized.toLowerCase();
        
        // Also check if user answer matches any option that equals correct answer
        if (!isCorrect && exercise.options && exercise.options.length > 0) {
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
        userAnswer: userAnswer.substring(0, 30) + '...',
        correctAnswer: correctAnswerNormalized.substring(0, 30) + '...',
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

    // Save progress with homeworkId field
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
      { 
        userId: firebaseId, 
        homeworkId: homeworkId
      },
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
    console.error('❌ Full error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: '❌ Error submitting homework',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ========================================
// 📖 LESSON PROGRESS ROUTES (ENHANCED)
// ========================================

router.get('/:firebaseId/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    
    const progress = await UserProgress.findOne({ 
      userId: firebaseId, 
      lessonId: lessonId 
    }).populate('lessonId', 'title description').populate('topicId', 'name description');
    
    if (!progress) {
      return res.status(200).json({});
    }
    
    res.json(progress);
  } catch (error) {
    console.error('❌ Error fetching user lesson progress:', error);
    res.status(500).json({ error: '❌ Error fetching lesson progress' });
  }
});

router.post('/:firebaseId/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📚 POST lesson progress for user:', req.params.firebaseId, 'lesson:', req.params.lessonId);
  
  try {
    const { firebaseId, lessonId } = req.params;
    const progressData = req.body;
    
    console.log('📝 Raw progress data received:', {
      ...progressData,
      topicIdType: typeof progressData.topicId,
      topicIdValue: progressData.topicId
    });
    
    // Sanitize the progress data to handle ObjectId issues
    const sanitizedData = sanitizeProgressData(progressData);
    
    console.log('📝 Sanitized progress data:', {
      ...sanitizedData,
      topicIdType: typeof sanitizedData.topicId,
      topicIdValue: sanitizedData.topicId
    });
    
    // If no topicId provided or extraction failed, try to get it from lesson
    let finalTopicId = sanitizedData.topicId;
    if (!finalTopicId) {
      try {
        const lesson = await Lesson.findById(lessonId);
        if (lesson && lesson.topicId) {
          finalTopicId = extractValidObjectId(lesson.topicId, 'lesson.topicId');
          console.log('📖 Got topicId from lesson:', finalTopicId);
        }
      } catch (lessonError) {
        console.warn('⚠️ Could not fetch lesson for topicId:', lessonError.message);
      }
    }
    
    const updateData = {
      userId: firebaseId,
      lessonId: lessonId,
      topicId: finalTopicId,
      completedSteps: sanitizedData.completedSteps || [],
      progressPercent: sanitizedData.progressPercent || 0,
      completed: sanitizedData.completed || false,
      mistakes: sanitizedData.mistakes || 0,
      medal: sanitizedData.medal || 'none',
      duration: sanitizedData.duration || 0,
      stars: sanitizedData.stars || 0,
      points: sanitizedData.points || 0,
      hintsUsed: sanitizedData.hintsUsed || 0,
      submittedHomework: sanitizedData.submittedHomework || false,
      updatedAt: new Date()
    };
    
    // Remove undefined/null fields to avoid casting issues
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === null || updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    console.log('📝 Final update data:', {
      ...updateData,
      topicIdType: typeof updateData.topicId
    });
    
    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );
    
    console.log('✅ Lesson progress saved successfully');
    res.json({
      success: true,
      data: updated,
      message: '✅ Progress saved'
    });
  } catch (error) {
    console.error('❌ Error saving user lesson progress:', error);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      path: error.path,
      value: error.value,
      kind: error.kind
    });
    
    // Handle specific error types
    if (error.name === 'CastError') {
      res.status(400).json({ 
        error: '❌ Invalid data format',
        field: error.path,
        value: error.value,
        message: 'Please check the data format and try again'
      });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({ 
        error: '❌ Validation error',
        details: Object.values(error.errors).map(e => e.message)
      });
    } else {
      res.status(500).json({ 
        error: '❌ Error saving lesson progress',
        message: error.message
      });
    }
  }
});
// ========================================
// 🔧 COMPLETE FIX FOR MISSING PROGRESS ROUTES
// ========================================

// PROBLEM ANALYSIS:
// Your frontend calls: POST /api/users/ba9kX3mIQdM1wgShGOxrRNkf7c22/progress/save
// 
// Available routes:
// - userProgressRoutes.js has: POST /api/progress (mounted at /api/progress)
// - userLessonRoutes.js has: POST /api/user/:firebaseId/lesson/:lessonId (mounted at /api/user)
// - userRoutes.js has: various user routes (mounted at /api/users)
//
// MISSING: The specific /api/users/:firebaseId/progress/save endpoint

// ========================================
// 1. ADD TO userRoutes.js (PRIORITY FIX)
// ========================================

// Add this to your userRoutes.js file around line 870:

// ✅ MISSING ROUTE: Progress save endpoint
router.post('/:firebaseId/progress/save', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('💾 POST /users/:firebaseId/progress/save for user:', req.params.firebaseId);
  
  try {
    const { firebaseId } = req.params;
    const progressData = req.body;
    
    console.log('📝 Progress data received:', {
      lessonId: progressData.lessonId,
      completed: progressData.completed,
      progressPercent: progressData.progressPercent,
      stars: progressData.stars,
      points: progressData.points
    });
    
    // Basic validation
    if (!progressData.lessonId) {
      return res.status(400).json({
        success: false,
        error: 'Missing lessonId in progress data'
      });
    }

    // Use the existing sanitizeProgressData function from userRoutes.js
    const sanitizedData = sanitizeProgressData(progressData);
    
    // Get topicId from lesson if not provided or invalid
    let finalTopicId = sanitizedData.topicId;
    if (!finalTopicId) {
      try {
        const lesson = await Lesson.findById(progressData.lessonId);
        if (lesson && lesson.topicId) {
          finalTopicId = extractValidObjectId(lesson.topicId, 'lesson.topicId');
          console.log('📖 Got topicId from lesson:', finalTopicId);
        }
      } catch (lessonError) {
        console.warn('⚠️ Could not fetch lesson for topicId:', lessonError.message);
      }
    }
    
    const updateData = {
      userId: firebaseId,
      lessonId: progressData.lessonId,
      topicId: finalTopicId,
      completedSteps: sanitizedData.completedSteps || [],
      progressPercent: sanitizedData.progressPercent || 0,
      completed: sanitizedData.completed || false,
      mistakes: sanitizedData.mistakes || 0,
      medal: sanitizedData.medal || 'none',
      duration: sanitizedData.duration || 0,
      stars: sanitizedData.stars || 0,
      points: sanitizedData.points || 0,
      hintsUsed: sanitizedData.hintsUsed || 0,
      submittedHomework: sanitizedData.submittedHomework || false,
      updatedAt: new Date()
    };
    
    // Remove null/undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === null || updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    console.log('📝 Saving progress with data:', updateData);
    
    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId: progressData.lessonId },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );
    
    console.log('✅ Progress saved successfully via /users/:firebaseId/progress/save');
    
    res.json({
      success: true,
      data: updated,
      message: '✅ Progress saved successfully',
      endpoint: 'users/progress/save'
    });
    
  } catch (error) {
    console.error('❌ Error saving progress via /users/:firebaseId/progress/save:', error);
    
    // Enhanced error handling
    if (error.name === 'CastError') {
      res.status(400).json({ 
        success: false,
        error: '❌ Invalid data format',
        field: error.path,
        value: error.value,
        message: 'Please check the data format and try again'
      });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({ 
        success: false,
        error: '❌ Validation error',
        details: Object.values(error.errors).map(e => e.message)
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: '❌ Error saving progress',
        message: error.message
      });
    }
  }
});
router.post('/:firebaseId/study-list', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const studyListData = req.body;
    
    console.log('📥 Study list data received:', studyListData);
    
    // Check required fields
    if (!studyListData.topicId || (!studyListData.topic && !studyListData.topicName)) {
      return res.status(400).json({
        success: false,
        error: 'topicId and topic name are required'
      });
    }
    
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.studyList) {
      user.studyList = [];
    }

    // Check if already exists
    const exists = user.studyList.some(item => item.topicId === studyListData.topicId);
    if (exists) {
      return res.status(400).json({
        success: false,
        error: 'Этот курс уже добавлен в ваш список'
      });
    }
    
    // Map frontend data to what your User model expects
    const mappedData = {
      name: studyListData.topic || studyListData.topicName,  // This was missing!
      topicId: studyListData.topicId,
      subject: studyListData.subject || 'General',
      level: studyListData.level || 1,
      lessonCount: studyListData.lessonCount || 0,
      totalTime: studyListData.totalTime || 10,
      type: studyListData.type || 'free',
      description: studyListData.description || '',
      isActive: studyListData.isActive !== false,
      addedAt: studyListData.addedAt || new Date()
    };
    
    user.studyList.push(mappedData);
    await user.save();
    
    res.status(201).json({
      success: true,
      message: 'Курс успешно добавлен в ваш список',
      data: mappedData
    });
    
  } catch (error) {
    console.error('❌ Study list error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message
    });
  }
});
// ========================================
// 📚 STUDY LIST MANAGEMENT (ENHANCED)
// ========================================

router.get('/:firebaseId/study-list', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    
    if (!user.studyList) {
      user.studyList = [];
      await user.save();
      return res.json({ success: true, data: [] });
    }
    
    console.log(`📚 Found ${user.studyList.length} study list entries for user ${req.params.firebaseId}`);
    
    const validStudyList = [];
    const invalidTopicIds = [];
    let needsCleanup = false;
    
    for (const entry of user.studyList) {
      if (!entry.topicId) {
        console.warn('⚠️ Study list entry without topicId:', entry);
        validStudyList.push(entry);
        continue;
      }
      
      try {
        console.log(`🔍 Validating topic: ${entry.topicId} - "${entry.name || entry.topic}"`);
        
        // ✅ ENHANCED VALIDATION: Check both Topic collection AND Lesson collection
        const topicExists = await Topic.exists({ _id: entry.topicId });
        const lessonsExist = await Lesson.exists({ topicId: entry.topicId });
        
        if (topicExists || lessonsExist) {
          console.log(`✅ Topic validation passed: ${entry.topicId} (Topic: ${!!topicExists}, Lessons: ${!!lessonsExist})`);
          validStudyList.push(entry);
        } else {
          console.warn(`🗑️ Invalid topic reference found: ${entry.topicId} - "${entry.name || entry.topic}" (no topic or lessons)`);
          invalidTopicIds.push(entry.topicId.toString());
          needsCleanup = true;
        }
      } catch (validationError) {
        console.error(`❌ Error validating topic ${entry.topicId}:`, validationError.message);
        // ✅ KEEP ENTRY ON VALIDATION ERROR (don't delete due to temporary issues)
        validStudyList.push(entry);
      }
    }
    
    if (needsCleanup && invalidTopicIds.length > 0) {
      console.log(`🧹 Cleaning up ${invalidTopicIds.length} invalid topic references`);
      user.studyList = validStudyList;
      await user.save();
      console.log(`✅ Cleaned study list: ${user.studyList.length} valid entries remaining`);
    }
    
    // ✅ CONSISTENT RESPONSE FORMAT
    res.json({
      success: true,
      data: user.studyList,
      message: `✅ Study list retrieved (${user.studyList.length} entries)`
    });
    
  } catch (error) {
    console.error('❌ Error fetching study list:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Error fetching study list',
      message: error.message 
    });
  }
});

router.post('/:firebaseId/study-list', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const studyListData = req.body;
    
    console.log('📥 Study list data received:', studyListData);
    
    // Check required fields
    if (!studyListData.topicId || (!studyListData.topic && !studyListData.topicName)) {
      return res.status(400).json({
        success: false,
        error: 'topicId and topic name are required'
      });
    }
    
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.studyList) {
      user.studyList = [];
    }

    // Check if already exists
    const exists = user.studyList.some(item => 
      item.topicId?.toString() === studyListData.topicId?.toString() ||
      (item.topic || item.name) === (studyListData.topic || studyListData.topicName)
    );
    
    if (exists) {
      return res.status(400).json({
        success: false,
        error: 'Этот курс уже добавлен в ваш список'
      });
    }
    
    // ✅ ENHANCED VALIDATION: Check both Topic and Lesson collections
    const topicExists = await Topic.exists({ _id: studyListData.topicId });
    const lessonsExist = await Lesson.exists({ topicId: studyListData.topicId });
    
    if (!topicExists && !lessonsExist) {
      console.warn(`⚠️ No topic or lessons found for topicId: ${studyListData.topicId}`);
      return res.status(400).json({
        success: false,
        error: 'Курс не найден в системе'
      });
    }
    
    console.log(`✅ Topic validation passed: ${studyListData.topicId} (Topic: ${!!topicExists}, Lessons: ${!!lessonsExist})`);
    
    // Map frontend data to what your User model expects
    const mappedData = {
      topicId: studyListData.topicId,
      name: studyListData.topic || studyListData.topicName,
      topic: studyListData.topic || studyListData.topicName,
      subject: studyListData.subject || 'General',
      level: studyListData.level || 1,
      lessonCount: studyListData.lessonCount || 0,
      totalTime: studyListData.totalTime || 10,
      type: studyListData.type || 'free',
      description: studyListData.description || '',
      isActive: studyListData.isActive !== false,
      addedAt: studyListData.addedAt || new Date(),
      // ✅ ADD METADATA FOR DEBUGGING
      metadata: {
        hasTopicInDb: !!topicExists,
        hasLessonsInDb: !!lessonsExist,
        source: topicExists ? 'topic-collection' : 'lesson-based',
        addedVia: 'study-list-api'
      }
    };
    
    user.studyList.push(mappedData);
    await user.save();
    
    console.log(`✅ Added topic to study list: ${mappedData.name} (${mappedData.topicId})`);
    
    res.status(201).json({
      success: true,
      message: 'Курс успешно добавлен в ваш список',
      data: mappedData
    });
    
  } catch (error) {
    console.error('❌ Study list add error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message
    });
  }
});

// 🔧 ALSO FIX: Delete route to handle both topic and lesson-based topics
router.delete('/:firebaseId/study-list/:topicId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ 
      success: false,
      error: '❌ User not found' 
    });
    
    if (!user.studyList) {
      return res.json({ 
        success: true,
        message: '✅ Study list is empty', 
        data: [] 
      });
    }
    
    const initialCount = user.studyList.length;
    
    // Remove entries matching the topicId
    user.studyList = user.studyList.filter(entry => {
      const topicIdMatch = entry.topicId?.toString() !== req.params.topicId;
      const entryIdMatch = entry._id?.toString() !== req.params.topicId;
      return topicIdMatch && entryIdMatch;
    });
    
    const finalCount = user.studyList.length;
    const removedCount = initialCount - finalCount;
    
    await user.save();
    
    if (removedCount > 0) {
      console.log(`✅ Removed ${removedCount} entry(ies) from study list`);
      res.json({ 
        success: true,
        message: `✅ Removed ${removedCount} topic(s)`, 
        data: user.studyList,
        removedCount
      });
    } else {
      console.log(`⚠️ No matching entries found for removal: ${req.params.topicId}`);
      res.json({ 
        success: true,
        message: '⚠️ No matching topic found to remove', 
        data: user.studyList,
        removedCount: 0
      });
    }
    
  } catch (error) {
    console.error('❌ Error removing from study list:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Error removing topic',
      message: error.message
    });
  }
});
// ========================================
// 📊 USER PROGRESS ROUTES
// ========================================

router.get('/:firebaseId/progress', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  req.params.userId = req.params.firebaseId;
  return userProgressController.getUserProgress(req, res);
});

router.get('/:firebaseId/progress/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  req.params.userId = req.params.firebaseId;
  return userProgressController.getLessonProgress(req, res);
});

router.get('/:firebaseId/progress/topic/:topicId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  req.params.userId = req.params.firebaseId;
  return userProgressController.getTopicProgress(req, res);
});

router.get('/:firebaseId/progress/topics', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  req.params.userId = req.params.firebaseId;
  return userProgressController.getAllTopicsProgress(req, res);
});

// Legacy lesson progress support
router.post('/:firebaseId/progress', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { lessonId, section } = req.body;
  if (!lessonId || !section) return res.status(400).json({ error: '❌ Missing lessonId or section' });
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    user.progress ||= {};
    user.progress[lessonId] ||= {};
    user.progress[lessonId][section] = true;
    await user.save();
    res.json(user.progress[lessonId]);
  } catch (error) {
    console.error('❌ Error saving legacy progress:', error);
    res.status(500).json({ error: '❌ Error saving progress' });
  }
});

// Topic Progress
router.get('/:firebaseId/topics-progress', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const lessons = await Lesson.find({});
    const topicMap = {};
    
    lessons.forEach(lesson => {
      if (lesson.topicId) {
        const topicIdStr = lesson.topicId.toString();
        
        if (!topicMap[topicIdStr]) {
          topicMap[topicIdStr] = {
            topicId: topicIdStr,
            topicName: lesson.topic,
            total: 0,
            completed: 0
          };
        }
        topicMap[topicIdStr].total++;
      }
    });
    
    const userProgress = await UserProgress.find({ userId: req.params.firebaseId });
    
    for (const progress of userProgress) {
      if (progress.completed && progress.lessonId) {
        const lesson = lessons.find(l => l._id.toString() === progress.lessonId.toString());
        if (lesson && lesson.topicId) {
          const topicIdStr = lesson.topicId.toString();
          if (topicMap[topicIdStr]) {
            topicMap[topicIdStr].completed++;
          }
        }
      }
    }
    
    const topicProgress = {};
    
    Object.values(topicMap).forEach(topic => {
      const percentage = topic.total > 0 ? Math.round((topic.completed / topic.total) * 100) : 0;
      
      topicProgress[topic.topicId] = percentage;
      
      if (topic.topicName) {
        topicProgress[topic.topicName] = percentage;
      }
      
      console.log(`📊 Topic: ${topic.topicName} (${topic.topicId}) - ${topic.completed}/${topic.total} = ${percentage}%`);
    });
    
    res.json(topicProgress);
  } catch (error) {
    console.error('❌ Error calculating topic progress:', error);
    res.status(500).json({ error: '❌ Error calculating topic progress' });
  }
});

// ========================================
// 📊 ANALYTICS ENDPOINT (ENHANCED)
// ========================================

router.get('/:firebaseId/analytics', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📊 Analytics GET request received for user:', req.params.firebaseId);
  
  try {
    const firebaseId = req.params.firebaseId;
    
    // Double-check authentication
    if (!req.user || req.user.uid !== firebaseId) {
      console.error('❌ User mismatch - token uid:', req.user?.uid, 'requested uid:', firebaseId);
      return res.status(403).json({ 
        success: false,
        error: '❌ Access denied: User mismatch' 
      });
    }
    
    const userProgress = await UserProgress.find({ userId: firebaseId });
    const user = await User.findOne({ firebaseId });
    
    if (!user) {
      console.error('❌ User not found:', firebaseId);
      // Create a minimal user record if it doesn't exist
      const newUser = new User({
        firebaseId: firebaseId,
        email: req.user.email,
        name: req.user.name || req.user.email || 'User',
        subscriptionPlan: 'free',
        diary: [],
        studyList: [],
        homeworkUsage: new Map(),
        lastResetCheck: new Date()
      });
      await newUser.save();
      console.log('✅ Created new user record for analytics');
      
      // Return empty analytics for new user
      return res.json({
        success: true,
        data: {
          studyDays: 0,
          totalDays: 0,
          completedSubjects: 0,
          totalSubjects: 0,
          totalLessonsDone: 0,
          weeklyLessons: 0,
          monthlyLessons: 0,
          streakDays: 0,
          averageTime: '0 мин',
          totalPoints: 0,
          totalStars: 0,
          hintsUsed: 0,
          avgPointsPerDay: 0,
          knowledgeChart: new Array(12).fill(0),
          subjects: [],
          mostActiveDay: null,
          recentActivity: [],
          lastUpdated: new Date().toISOString(),
          dataQuality: {
            hasActivityData: false,
            hasSubjectData: false,
            validDates: 0
          }
        },
        message: '✅ Empty analytics for new user'
      });
    }
    
    console.log(`📊 Found user ${user.name} with ${userProgress.length} progress entries`);
    
    const completedLessons = userProgress.filter(p => p.completed).length;
    const totalStars = userProgress.reduce((sum, p) => sum + (p.stars || 0), 0);
    const totalPoints = userProgress.reduce((sum, p) => sum + (p.points || 0), 0);
    const hintsUsed = userProgress.reduce((sum, p) => sum + (p.hintsUsed || 0), 0);
    
    const studyDates = new Set();
    
    if (user.diary && user.diary.length > 0) {
      user.diary.forEach(entry => {
        if (entry.date) {
          studyDates.add(new Date(entry.date).toDateString());
        }
      });
    }
    
    userProgress.forEach(progress => {
      if (progress.updatedAt) {
        studyDates.add(new Date(progress.updatedAt).toDateString());
      }
    });
    
    const studyDays = studyDates.size;
    
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const weeklyLessons = userProgress.filter(p => 
      p.completed && p.updatedAt && new Date(p.updatedAt) >= oneWeekAgo
    ).length;
    
    const monthlyLessons = userProgress.filter(p => 
      p.completed && p.updatedAt && new Date(p.updatedAt) >= oneMonthAgo
    ).length;
    
    const avgPointsPerDay = studyDays > 0 ? Math.round(totalPoints / studyDays) : 0;
    
    let averageTime = '0 мин';
    if (user.diary && user.diary.length > 0) {
      const totalMinutes = user.diary.reduce((sum, entry) => sum + (entry.studyMinutes || 0), 0);
      const avgMinutes = Math.round(totalMinutes / user.diary.length);
      averageTime = `${avgMinutes} мин`;
    }
    
    const knowledgeChart = new Array(12).fill(0);
    
    const recentActivity = userProgress
      .filter(p => p.completed && p.updatedAt)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 10)
      .map(p => ({
        date: p.updatedAt,
        lesson: `Урок ${p.lessonId}`,
        points: p.points || 0,
        duration: p.duration || 15
      }));
    
    const lessons = await Lesson.find({});
    const topicMap = {};
    
    lessons.forEach(lesson => {
      if (lesson.topicId && lesson.topic) {
        const topicIdStr = lesson.topicId.toString();
        
        if (!topicMap[topicIdStr]) {
          topicMap[topicIdStr] = {
            name: lesson.topic,
            total: 0,
            completed: 0
          };
        }
        topicMap[topicIdStr].total++;
      }
    });
    
    userProgress.forEach(progress => {
      if (progress.completed && progress.lessonId) {
        const lesson = lessons.find(l => l._id.toString() === progress.lessonId.toString());
        if (lesson && lesson.topicId) {
          const topicIdStr = lesson.topicId.toString();
          if (topicMap[topicIdStr]) {
            topicMap[topicIdStr].completed++;
          }
        }
      }
    });
    
    const subjects = Object.values(topicMap).map(topic => ({
      name: topic.name,
      progress: topic.total > 0 ? Math.round((topic.completed / topic.total) * 100) : 0
    }));
    
    const dataQuality = {
      hasActivityData: user.diary && user.diary.length > 0,
      hasSubjectData: subjects.length > 0,
      validDates: studyDays
    };
    
    const analyticsData = {
      studyDays,
      totalDays: studyDays,
      completedSubjects: subjects.filter(s => s.progress === 100).length,
      totalSubjects: subjects.length,
      totalLessonsDone: completedLessons,
      
      weeklyLessons,
      monthlyLessons,
      streakDays: 0, // Simplified for now
      averageTime,
      
      totalPoints,
      totalStars,
      hintsUsed,
      avgPointsPerDay,
      
      knowledgeChart,
      subjects,
      
      mostActiveDay: null, // Simplified for now
      recentActivity,
      
      lastUpdated: new Date().toISOString(),
      dataQuality
    };
    
    console.log('✅ Analytics calculated successfully');
    
    res.json({
      success: true,
      data: analyticsData,
      message: '✅ Analytics loaded successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching analytics:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Error fetching analytics',
      details: error.message 
    });
  }
});

router.get('/:firebaseId/points', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const progress = await UserProgress.find({ userId: req.params.firebaseId });
    const totalPoints = progress.reduce((sum, p) => sum + (p.points || 0), 0);
    res.json({ totalPoints });
  } catch (error) {
    console.error('❌ Error fetching points:', error);
    res.status(500).json({ error: '❌ Error fetching points' });
  }
});

// ========================================
// 📔 DIARY ROUTES (ENHANCED)
// ========================================

router.get('/:firebaseId/diary', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json(user.diary || []);
  } catch (error) {
    console.error('❌ Diary fetch error:', error);
    res.status(500).json({ error: '❌ Error fetching diary' });
  }
});

router.post('/:firebaseId/diary', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { firebaseId } = req.params;
  const { date, studyMinutes, completedTopics, averageGrade, lessonName, duration, mistakes, stars } = req.body;
  
  if (!date) {
    return res.status(400).json({ error: '❌ Missing date' });
  }
  
  const finalStudyMinutes = studyMinutes || Math.ceil((duration || 0) / 60) || 0;
  const finalCompletedTopics = completedTopics || (lessonName ? 1 : 0);
  const finalAverageGrade = averageGrade || (stars ? stars * 20 : 0);
  
  if (finalStudyMinutes < 0 || finalStudyMinutes > 1440) {
    return res.status(400).json({ error: '❌ Invalid study minutes (0-1440)' });
  }
  
  try {
    const user = await User.findOne({ firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    
    user.diary ||= [];
    
    const existingEntryIndex = user.diary.findIndex(entry => {
      const entryDate = new Date(entry.date).toDateString();
      const newDate = new Date(date).toDateString();
      return entryDate === newDate;
    });
    
    const diaryEntry = {
      date: new Date(date),
      studyMinutes: finalStudyMinutes,
      completedTopics: finalCompletedTopics,
      averageGrade: finalAverageGrade,
      lessonName: lessonName || '',
      mistakes: mistakes || 0,
      stars: stars || 0
    };
    
    if (existingEntryIndex >= 0) {
      const existing = user.diary[existingEntryIndex];
      user.diary[existingEntryIndex] = {
        ...existing,
        studyMinutes: existing.studyMinutes + finalStudyMinutes,
        completedTopics: existing.completedTopics + finalCompletedTopics,
        averageGrade: Math.round((existing.averageGrade + finalAverageGrade) / 2),
        mistakes: existing.mistakes + (mistakes || 0),
        stars: existing.stars + (stars || 0)
      };
    } else {
      user.diary.push(diaryEntry);
    }
    
    await user.save();
    res.status(201).json({ 
      message: '✅ Diary entry saved', 
      diary: user.diary,
      entry: diaryEntry
    });
  } catch (error) {
    console.error('❌ Diary save error:', error);
    res.status(500).json({ 
      error: '❌ Error saving diary', 
      details: error.message 
    });
  }
});

// ========================================
// 🔄 LEGACY HOMEWORK ROUTES (BACKWARD COMPATIBILITY)
// ========================================

router.get('/:firebaseId/homeworks/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.getHomeworkByLesson);
router.post('/:firebaseId/homeworks/save', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.saveHomework);
router.post('/:firebaseId/homeworks/lesson/:lessonId/submit', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.submitHomework);

// ========================================
// 🔄 LEGACY TEST CONTROLLER ROUTES (BACKWARD COMPATIBILITY)
// ========================================

router.get('/:firebaseId/tests/legacy', validateFirebaseId, verifyToken, verifyOwnership, testController.getAvailableTests);
router.get('/:firebaseId/tests/legacy/:testId', validateFirebaseId, verifyToken, verifyOwnership, testController.getTestById);
router.post('/:firebaseId/tests/legacy/:testId/submit', validateFirebaseId, verifyToken, verifyOwnership, testController.submitTestResult);
router.get('/:firebaseId/tests/legacy/:testId/result', validateFirebaseId, verifyToken, verifyOwnership, testController.getTestResult);

// ========================================
// 🔄 MONTHLY USAGE RESET CRON JOB
// ========================================

// Only set up cron job if node-cron is available
try {
  const cron = require('node-cron');
  
  // Run monthly reset on the 1st day of each month at 00:01
  cron.schedule('1 0 1 * *', async () => {
    console.log('🔄 Running monthly homework usage reset...');
    
    try {
      const users = await User.find({});
      const currentMonthKey = getCurrentMonthKey();
      let resetCount = 0;
      
      for (const user of users) {
        try {
          // Reset current month usage
          user.homeworkUsage.set(currentMonthKey, { messages: 0, images: 0, lastUsed: new Date() });
          user.lastResetCheck = new Date();
          
          await user.save();
          resetCount++;
          
          console.log(`✅ Reset usage for user: ${user._id}`);
        } catch (userError) {
          console.error(`❌ Failed to reset usage for user ${user._id}:`, userError.message);
        }
      }
      
      console.log(`✅ Monthly reset completed for ${resetCount} users`);
      
    } catch (error) {
      console.error('❌ Monthly reset failed:', error);
    }
  }, {
    timezone: "Asia/Tashkent" // Adjust to your timezone
  });
  
  console.log('✅ Monthly usage reset cron job scheduled');
} catch (cronError) {
  console.warn('⚠️ node-cron not available, monthly reset will be handled manually');
}

// ========================================
// 🚨 ERROR HANDLING MIDDLEWARE
// ========================================

router.use((error, req, res, next) => {
  console.error('❌ UserRoutes Error:', {
    message: error.message,
    name: error.name,
    path: error.path,
    value: error.value,
    kind: error.kind,
    url: req.originalUrl,
    method: req.method
  });

  // Handle MongoDB casting errors specifically
  if (error.name === 'CastError') {
    return res.status(400).json({
      error: '❌ Invalid data format',
      field: error.path,
      value: error.value,
      message: `Invalid ${error.kind} format for field '${error.path}'`,
      suggestion: error.path === 'topicId' ? 'Please provide a valid topic ID' : 'Please check the data format'
    });
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    const validationErrors = Object.values(error.errors).map(e => ({
      field: e.path,
      message: e.message,
      value: e.value
    }));

    return res.status(400).json({
      error: '❌ Validation error',
      details: validationErrors,
      message: 'Please check the required fields and data formats'
    });
  }

  // Handle duplicate key errors
  if (error.code === 11000) {
    return res.status(409).json({
      error: '❌ Duplicate entry',
      field: Object.keys(error.keyValue || {})[0],
      message: 'This record already exists'
    });
  }

  // Generic error response
  res.status(500).json({
    error: '❌ Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;