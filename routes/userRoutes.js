const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ✅ Models
const User = require('../models/user');
const TopicProgress = require('../models/topicProgress');
const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const UserProgress = require('../models/userProgress');
const Homework = require('../models/homework'); // Add standalone homework model
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

console.log('✅ userRoutes.js loaded');

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

// Auth Save
router.post('/save', async (req, res) => {
  const { token, name, subscriptionPlan } = req.body;
  if (!token || !name) return res.status(400).json({ error: '❌ Missing token or name' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const firebaseId = decoded.uid;
    const email = decoded.email;

    let user = await User.findOne({ firebaseId });
    if (!user) {
      user = new User({ firebaseId, email, name, subscriptionPlan: subscriptionPlan || 'free' });
    } else {
      user.email = email;
      user.name = name;
      if (subscriptionPlan) user.subscriptionPlan = subscriptionPlan;
    }

    await user.save();
    res.json(user);
  } catch (err) {
    console.error('❌ Firebase token invalid:', err.message);
    res.status(401).json({ error: '❌ Invalid Firebase token' });
  }
});

// Info
router.get('/:firebaseId', validateFirebaseId, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json(user);
  } catch {
    res.status(500).json({ error: '❌ Server error' });
  }
});

router.get('/:firebaseId/status', validateFirebaseId, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json({ status: user.subscriptionPlan || 'free' });
  } catch {
    res.status(500).json({ error: '❌ Server error' });
  }
});

// ✅ FIXED: Recommendations route
router.get('/:firebaseId/recommendations', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET recommendations for user:', req.params.firebaseId);
  
  try {
    if (getRecommendations) {
      return getRecommendations(req, res);
    }
    
    const userId = req.params.firebaseId;
    const user = await User.findOne({ firebaseId: userId });
    const studyListTopicIds = user?.studyList?.map(item => item.topicId?.toString()) || [];
    
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

// ✅ ENHANCED: User's homework endpoints
router.get('/:firebaseId/homeworks', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET all homeworks for user:', req.params.firebaseId);
  
  try {
    const userId = req.params.firebaseId;
    
    // Get user's homework progress
    const userProgress = await HomeworkProgress.find({ userId })
      .populate('lessonId', 'title lessonName subject homework')
      .sort({ updatedAt: -1 });
    
    // Get all standalone homework assignments
    const standaloneHomework = await Homework.find({ isActive: true });
    
    // Get lessons with homework
    const lessonsWithHomework = await Lesson.find({ 
      homework: { $exists: true, $ne: [], $not: { $size: 0 } } 
    });
    
    const allHomeworks = [];
    
    // Add standalone homework from admin panel
    for (const hw of standaloneHomework) {
      const userHwProgress = userProgress.find(up => up.homeworkId?.toString() === hw._id.toString());
      
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
    
    // Sort by priority (in-progress first, then pending, then completed)
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

// ✅ ENHANCED: User's tests endpoints  
router.get('/:firebaseId/tests', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET all tests for user:', req.params.firebaseId);
  
  try {
    const userId = req.params.firebaseId;
    
    // Get all active tests (hide correct answers for users)
    const tests = await Test.find({ isActive: true }).select('-questions.correctAnswer -questions.explanation');
    
    // Get user's test results
    const userResults = await TestResult.find({ userId });
    
    // Add user progress info to each test
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

// ✅ Get specific test for user (without correct answers)
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

// ✅ Submit test result
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
        // Handle multiple choice answers
        if (typeof correctAnswer === 'number') {
          const correctOptionText = q.options[correctAnswer]?.text || q.options[correctAnswer];
          isCorrect = userAnswer === correctOptionText;
        } else {
          isCorrect = userAnswer === correctAnswer;
        }
      } else {
        // Handle other answer types
        isCorrect = userAnswer?.toLowerCase() === correctAnswer?.toString().toLowerCase();
      }

      if (isCorrect) correct++;

      detailedResults.push({
        questionIndex: index,
        question: q.text || q.question,
        userAnswer,
        correctAnswer: test.showResults ? correctAnswer : null, // Hide correct answers if not allowed
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
      // Update existing result
      result = await TestResult.findByIdAndUpdate(existingResult._id, resultData, { new: true });
    } else {
      // Create new result
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

// ✅ Get test result
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

// ✅ Get all test results for user
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

// ✅ ENHANCED: Standalone homework endpoints
router.get('/:firebaseId/homework/:homeworkId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET standalone homework for user:', req.params.firebaseId, 'homeworkId:', req.params.homeworkId);
  
  try {
    const { firebaseId, homeworkId } = req.params;
    
    // Get the standalone homework
    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      return res.status(404).json({ error: '❌ Homework not found' });
    }
    
    if (!homework.isActive) {
      return res.status(403).json({ error: '❌ Homework is not active' });
    }
    
    // Get user's progress on this homework - use a unique identifier
    // Since HomeworkProgress might not have homeworkId field, we'll check for it
    let userProgress = await HomeworkProgress.findOne({
      userId: firebaseId,
      $or: [
        { homeworkId: homeworkId },  // Try homeworkId if it exists
        { lessonId: homeworkId },    // Fallback to lessonId
        { 'metadata.standaloneHomeworkId': homeworkId }  // Use metadata field
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
    
    // Validate inputs
    if (!firebaseId || !homeworkId) {
      return res.status(400).json({ error: '❌ Missing required parameters' });
    }
    
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: '❌ Answers must be an array' });
    }

    console.log('🔍 Looking for homework with ID:', homeworkId);
    
    // Verify homework exists with better error handling
    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      console.log('❌ Homework not found for ID:', homeworkId);
      return res.status(404).json({ error: '❌ Homework not found' });
    }

    console.log('✅ Homework found:', homework.title);

    // Check for existing progress
    console.log('🔍 Looking for existing progress...');
    let existingProgress = await HomeworkProgress.findOne({
      userId: firebaseId,
      'metadata.standaloneHomeworkId': homeworkId
    });

    console.log('Existing progress:', existingProgress ? 'Found' : 'Not found');

    const progressData = {
      userId: firebaseId,
      lessonId: null,
      answers: answers,
      completed: false,
      metadata: {
        type: 'standalone',
        standaloneHomeworkId: homeworkId,
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
    console.error('Stack trace:', error.stack);
    
    // Send more specific error based on error type
    if (error.name === 'ValidationError') {
      res.status(400).json({ error: '❌ Validation error: ' + error.message });
    } else if (error.name === 'CastError') {
      res.status(400).json({ error: '❌ Invalid ID format' });
    } else {
      res.status(500).json({ error: '❌ Error saving homework progress' });
    }
  }
});

// ✅ Submit standalone homework - FIXED VERSION
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
    
    // Validate ObjectId format
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

    // Get homework with exercises
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

    // ✅ FIXED: Use proper homeworkId field instead of metadata
    const progressData = {
      userId: firebaseId,
      homeworkId: homeworkId, // Use the actual homeworkId field
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

    // ✅ FIXED: Use proper query with homeworkId field
    const progress = await HomeworkProgress.findOneAndUpdate(
      { 
        userId: firebaseId, 
        homeworkId: homeworkId  // Use the actual homeworkId field
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

// ✅ Get user's progress for a specific lesson
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

// ✅ Save user's progress for a specific lesson
router.post('/:firebaseId/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    const progressData = req.body;
    
    let topicId = progressData.topicId;
    if (!topicId) {
      const lesson = await Lesson.findById(lessonId);
      if (lesson) {
        topicId = lesson.topicId;
      }
    }
    
    const updateData = {
      userId: firebaseId,
      lessonId: lessonId,
      topicId: topicId,
      ...progressData,
      updatedAt: new Date()
    };
    
    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId },
      updateData,
      { upsert: true, new: true }
    );
    
    res.json(updated);
  } catch (error) {
    console.error('❌ Error saving user lesson progress:', error);
    res.status(500).json({ error: '❌ Error saving lesson progress' });
  }
});

// Study List Management
router.get('/:firebaseId/study-list', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    
    if (!user.studyList) {
      user.studyList = [];
      await user.save();
      return res.json([]);
    }
    
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
        const topicExists = await Topic.exists({ _id: entry.topicId });
        
        if (topicExists) {
          validStudyList.push(entry);
        } else {
          console.warn(`🗑️ Invalid topic reference found: ${entry.topicId} - "${entry.name}"`);
          invalidTopicIds.push(entry.topicId.toString());
          needsCleanup = true;
        }
      } catch (validationError) {
        console.error(`❌ Error validating topic ${entry.topicId}:`, validationError.message);
        validStudyList.push(entry);
      }
    }
    
    if (needsCleanup) {
      console.log(`🧹 Cleaning up ${invalidTopicIds.length} invalid topic references`);
      user.studyList = validStudyList;
      await user.save();
      console.log(`✅ Cleaned study list: ${user.studyList.length} valid entries remaining`);
    }
    
    res.json(user.studyList);
    
  } catch (error) {
    console.error('❌ Error fetching study list:', error);
    res.status(500).json({ error: '❌ Error fetching study list' });
  }
});

router.post('/:firebaseId/study-list', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { subject, level, topic, topicId } = req.body;
  
  console.log('📥 Adding to study list:', { subject, level, topic, topicId });
  console.log('🔍 TopicId details:', {
    type: typeof topicId,
    value: topicId,
    isObject: typeof topicId === 'object',
    stringified: JSON.stringify(topicId)
  });
  
  if (!subject || !topic) {
    console.error('❌ Missing required fields:', { subject: !!subject, topic: !!topic });
    return res.status(400).json({ error: '❌ Missing subject or topic' });
  }
  
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) {
      console.error('❌ User not found:', req.params.firebaseId);
      return res.status(404).json({ error: '❌ User not found' });
    }

    console.log('✅ User found:', user.name);

    if (!user.studyList) {
      user.studyList = [];
      console.log('📝 Initialized empty study list');
    }

    const exists = user.studyList.some(entry => entry.name === topic && entry.subject === subject);
    
    if (exists) {
      console.log('⚠️ Topic already exists in study list');
      return res.json(user.studyList);
    }

    let validTopicId = null;
    
    if (topicId) {
      if (typeof topicId === 'object') {
        const extractedId = topicId._id || topicId.id || topicId.topicId;
        console.log('🔍 Extracted ID from object:', extractedId);
        
        if (extractedId && mongoose.Types.ObjectId.isValid(extractedId)) {
          validTopicId = extractedId;
          console.log('✅ Valid ObjectId format from object:', validTopicId);
        } else if (extractedId) {
          console.warn('⚠️ Invalid ObjectId format from object:', extractedId);
        }
      } else if (typeof topicId === 'string') {
        if (mongoose.Types.ObjectId.isValid(topicId)) {
          validTopicId = topicId;
          console.log('✅ Valid ObjectId format from string:', validTopicId);
        } else {
          console.warn('⚠️ Invalid ObjectId format from string:', topicId);
        }
      }
    }
    
    if (validTopicId) {
      try {
        const topicExists = await Topic.findById(validTopicId);
        if (!topicExists) {
          console.error('❌ Topic not found in database:', validTopicId);
          return res.status(400).json({ 
            error: '❌ Topic not found in database',
            topicId: validTopicId
          });
        }
        console.log('✅ Topic verified in database:', topicExists.name || topicExists.title);
        
        validTopicId = new mongoose.Types.ObjectId(validTopicId);
        
      } catch (dbError) {
        console.error('❌ Database error while validating topic:', dbError.message);
        return res.status(500).json({ 
          error: '❌ Error validating topic in database',
          details: dbError.message
        });
      }
    } else {
      console.error('❌ No valid topicId provided');
      return res.status(400).json({ 
        error: '❌ Valid topicId is required',
        provided: topicId,
        message: 'Topic must exist in the database before adding to study list'
      });
    }

    const newEntry = { 
      name: topic, 
      subject, 
      level: level || null, 
      topicId: validTopicId
    };
    
    console.log('➕ Adding new entry:', {
      name: newEntry.name,
      subject: newEntry.subject,
      level: newEntry.level,
      topicId: newEntry.topicId.toString()
    });
    
    user.studyList.push(newEntry);
    
    await user.save();
    console.log('✅ Study list saved successfully');
    
    res.json(user.studyList);
    
  } catch (error) {
    console.error('❌ Error saving study list:', error);
    console.error('❌ Error stack:', error.stack);
    
    if (error.name === 'ValidationError') {
      console.error('❌ Validation error details:');
      const validationDetails = [];
      
      for (const field in error.errors) {
        const fieldError = error.errors[field];
        console.error(`  - Field: ${field}`);
        console.error(`  - Message: ${fieldError.message}`);
        console.error(`  - Value: ${fieldError.value}`);
        
        validationDetails.push({
          field,
          message: fieldError.message,
          value: fieldError.value
        });
      }
      
      return res.status(400).json({ 
        error: '❌ Validation error', 
        details: validationDetails.map(d => `${d.field}: ${d.message}`),
        fullDetails: validationDetails
      });
    }
    
    res.status(500).json({ 
      error: '❌ Error saving study list',
      message: error.message
    });
  }
});

router.delete('/:firebaseId/study-list/:topicId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    
    if (!user.studyList) {
      return res.json({ message: '✅ Study list is empty', studyList: [] });
    }
    
    const initialCount = user.studyList.length;
    
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
        message: `✅ Removed ${removedCount} topic(s)`, 
        studyList: user.studyList,
        removedCount
      });
    } else {
      console.log(`⚠️ No matching entries found for removal: ${req.params.topicId}`);
      res.json({ 
        message: '⚠️ No matching topic found to remove', 
        studyList: user.studyList,
        removedCount: 0
      });
    }
    
  } catch (error) {
    console.error('❌ Error removing from study list:', error);
    res.status(500).json({ error: '❌ Error removing topic' });
  }
});

// User Progress Routes
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
  } catch {
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

// Analytics
// ✅ FIXED: Analytics endpoint with proper authentication handling
router.get('/:firebaseId/analytics', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📊 Analytics GET request received for user:', req.params.firebaseId);
  console.log('🔐 Auth user:', req.user?.uid);
  console.log('🔐 Token user email:', req.user?.email);
  
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
        studyList: []
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
    
    let streakDays = 0;
    if (user.diary && user.diary.length > 0) {
      const sortedDiary = user.diary
        .filter(entry => entry.date)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      
      const today = new Date();
      let currentDate = new Date(today);
      currentDate.setHours(0, 0, 0, 0);
      
      for (const entry of sortedDiary) {
        const entryDate = new Date(entry.date);
        entryDate.setHours(0, 0, 0, 0);
        
        const diffDays = Math.floor((currentDate - entryDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0 || diffDays === 1) {
          streakDays++;
          currentDate = new Date(entryDate);
        } else {
          break;
        }
      }
    }
    
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
    
    let mostActiveDay = null;
    if (user.diary && user.diary.length > 0) {
      const dayCount = {};
      const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
      
      user.diary.forEach(entry => {
        if (entry.date && entry.studyMinutes > 0) {
          const dayOfWeek = new Date(entry.date).getDay();
          dayCount[dayOfWeek] = (dayCount[dayOfWeek] || 0) + entry.studyMinutes;
        }
      });
      
      let maxMinutes = 0;
      let maxDay = null;
      Object.entries(dayCount).forEach(([day, minutes]) => {
        if (minutes > maxMinutes) {
          maxMinutes = minutes;
          maxDay = parseInt(day);
        }
      });
      
      if (maxDay !== null) {
        mostActiveDay = dayNames[maxDay];
      }
    }
    
    const generateRealKnowledgeChart = async (firebaseId) => {
      const monthlyData = new Array(12).fill(0);
      const now = new Date();
      
      for (let i = 0; i < 12; i++) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        
        const monthProgress = await UserProgress.find({
          userId: firebaseId,
          updatedAt: {
            $gte: monthStart,
            $lte: monthEnd
          }
        });
        
        const monthPoints = monthProgress.reduce((sum, p) => sum + (p.points || 0), 0);
        
        monthlyData[11 - i] = monthPoints;
      }
      
      let cumulativeData = [];
      let runningTotal = 0;
      for (let i = 0; i < monthlyData.length; i++) {
        runningTotal += monthlyData[i];
        cumulativeData.push(runningTotal);
      }
      
      return cumulativeData;
    };
    
    const knowledgeChart = await generateRealKnowledgeChart(firebaseId);
    
    const recentActivity = await Promise.all(
      userProgress
        .filter(p => p.completed && p.updatedAt)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 10)
        .map(async (p) => {
          let lessonName = `Урок ${p.lessonId}`;
          try {
            const lesson = await Lesson.findById(p.lessonId).select('lessonName title topic');
            if (lesson) {
              lessonName = lesson.lessonName || lesson.title || lesson.topic || lessonName;
            }
          } catch (err) {
            console.log('⚠️ Lesson not found for activity:', p.lessonId);
          }
          
          return {
            date: p.updatedAt,
            lesson: lessonName,
            points: p.points || 0,
            duration: p.duration || Math.floor(Math.random() * 30) + 15
          };
        })
    );
    
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
      streakDays,
      averageTime,
      
      totalPoints,
      totalStars,
      hintsUsed,
      avgPointsPerDay,
      
      knowledgeChart,
      subjects,
      
      mostActiveDay,
      recentActivity,
      
      lastUpdated: new Date().toISOString(),
      dataQuality
    };
    
    console.log('✅ Analytics calculated successfully:', {
      studyDays,
      completedLessons,
      totalPoints,
      subjects: subjects.length,
      knowledgeChart: knowledgeChart.slice(-3)
    });
    
    res.json({
      success: true,
      data: analyticsData,
      message: '✅ Analytics loaded successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching analytics:', error);
    console.error('Stack trace:', error.stack);
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
  } catch {
    res.status(500).json({ error: '❌ Error fetching points' });
  }
});

// Diary
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
  const { date, studyMinutes, completedTopics, averageGrade } = req.body;
  
  console.log('📥 Diary entry data:', { date, studyMinutes, completedTopics, averageGrade });
  
  if (!date) {
    console.error('❌ Missing date in diary entry');
    return res.status(400).json({ error: '❌ Missing date' });
  }
  
  const studyMinutesNum = Number(studyMinutes) || 0;
  const completedTopicsNum = Number(completedTopics) || 0;
  const averageGradeNum = Number(averageGrade) || 0;
  
  if (studyMinutesNum < 0 || studyMinutesNum > 1440) {
    return res.status(400).json({ error: '❌ Invalid study minutes (0-1440)' });
  }
  
  if (completedTopicsNum < 0 || completedTopicsNum > 100) {
    return res.status(400).json({ error: '❌ Invalid completed topics (0-100)' });
  }
  
  if (averageGradeNum < 0 || averageGradeNum > 100) {
    return res.status(400).json({ error: '❌ Invalid average grade (0-100)' });
  }
  
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    
    user.diary ||= [];
    
    const existingEntryIndex = user.diary.findIndex(entry => {
      const entryDate = new Date(entry.date).toDateString();
      const newDate = new Date(date).toDateString();
      return entryDate === newDate;
    });
    
    const diaryEntry = {
      date: new Date(date),
      studyMinutes: studyMinutesNum,
      completedTopics: completedTopicsNum,
      averageGrade: averageGradeNum
    };
    
    if (existingEntryIndex >= 0) {
      user.diary[existingEntryIndex] = diaryEntry;
      console.log('📝 Updated existing diary entry for date:', date);
    } else {
      user.diary.push(diaryEntry);
      console.log('📝 Added new diary entry for date:', date);
    }
    
    await user.save();
    res.status(201).json({ 
      message: '✅ Saved diary entry', 
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

// ✅ LEGACY: Keep existing homework routes for backward compatibility
router.get('/:firebaseId/homeworks/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.getHomeworkByLesson);
router.post('/:firebaseId/homeworks/save', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.saveHomework);
router.post('/:firebaseId/homeworks/lesson/:lessonId/submit', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.submitHomework);

// ✅ LEGACY: Keep existing test controller routes for backward compatibility
router.get('/:firebaseId/tests/legacy', validateFirebaseId, verifyToken, verifyOwnership, testController.getAvailableTests);
router.get('/:firebaseId/tests/legacy/:testId', validateFirebaseId, verifyToken, verifyOwnership, testController.getTestById);
router.post('/:firebaseId/tests/legacy/:testId/submit', validateFirebaseId, verifyToken, verifyOwnership, testController.submitTestResult);
router.get('/:firebaseId/tests/legacy/:testId/result', validateFirebaseId, verifyToken, verifyOwnership, testController.getTestResult);

module.exports = router;