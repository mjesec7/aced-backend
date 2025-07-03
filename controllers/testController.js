const Test = require('../models/Test');
const TestResult = require('../models/TestResult');

// ✅ Get all available tests (Enhanced)
exports.getAvailableTests = async (req, res) => {
  try {
    const { subject, level, isActive = true } = req.query;
    
    // Build filter
    const filter = {};
    if (subject) filter.subject = subject;
    if (level) filter.level = parseInt(level);
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const tests = await Test.find(filter).sort({ createdAt: -1 });
    
    console.log(`📊 Retrieved ${tests.length} tests with filters:`, filter);
    res.json({ success: true, data: tests });
  } catch (error) {
    console.error('❌ Error fetching tests:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching tests' });
  }
};

// ✅ Get a single test by ID (Enhanced)
exports.getTestById = async (req, res) => {
  try {
    const { testId } = req.params;
    const { includeAnswers = false } = req.query;
    
    let query = Test.findById(testId);
    
    // Hide correct answers unless specifically requested (for admin)
    if (!includeAnswers) {
      query = query.select('-questions.correctAnswer -questions.explanation');
    }
    
    const test = await query;

    if (!test) {
      return res.status(404).json({ success: false, error: '❌ Test not found' });
    }

    if (!test.isActive && !includeAnswers) {
      return res.status(403).json({ success: false, error: '❌ Test is not active' });
    }

    res.json({ success: true, data: test });
  } catch (error) {
    console.error('❌ Error fetching test:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching test' });
  }
};

// ✅ Submit a test and auto-grade (Enhanced)
exports.submitTestResult = async (req, res) => {
  try {
    const { firebaseId, testId } = req.params;
    const { answers, timeSpent, startTime, endTime } = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ success: false, error: '❌ Answers are required' });
    }

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ success: false, error: '❌ Test not found' });
    }

    if (!test.isActive) {
      return res.status(403).json({ success: false, error: '❌ Test is not active' });
    }

    // Enhanced grading logic
    const total = test.questions.length;
    let correct = 0;
    let totalPoints = 0;
    let earnedPoints = 0;
    const detailedResults = [];

    test.questions.forEach((q, index) => {
      const userAnswerObj = answers.find(a => a.questionIndex === index);
      const userAnswer = userAnswerObj?.answer;
      const points = q.points || 1;
      totalPoints += points;
      
      let isCorrect = false;
      
      // Enhanced answer checking based on question type
      if (q.type === 'multiple-choice') {
        isCorrect = parseInt(userAnswer) === parseInt(q.correctAnswer);
      } else if (q.type === 'true-false') {
        isCorrect = String(userAnswer).toLowerCase() === String(q.correctAnswer).toLowerCase();
      } else if (q.type === 'short-answer') {
        // More flexible short answer checking
        const userAnswerNormalized = String(userAnswer || '').trim().toLowerCase();
        const correctAnswerNormalized = String(q.correctAnswer || '').trim().toLowerCase();
        isCorrect = userAnswerNormalized === correctAnswerNormalized;
      }

      if (isCorrect) {
        correct++;
        earnedPoints += points;
      }

      detailedResults.push({
        questionIndex: index,
        question: q.text,
        userAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        points: isCorrect ? points : 0,
        maxPoints: points
      });
    });

    const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = percentage >= (test.passingScore || 70);

    // Create enhanced test result
    const result = new TestResult({
      userId: firebaseId,
      testId,
      answers: detailedResults,
      score: percentage,
      totalPoints: earnedPoints,
      maxPossiblePoints: totalPoints,
      passed,
      timeSpent: timeSpent || null,
      submittedAt: new Date(),
      ip: req.ip || req.connection.remoteAddress
    });

    await result.save();

    console.log(`✅ Test ${testId} submitted by user ${firebaseId}. Score: ${percentage}% (${earnedPoints}/${totalPoints} points)`);

    res.json({
      success: true,
      data: {
        testId,
        correct,
        total,
        score: percentage,
        earnedPoints,
        totalPoints,
        passed,
        passingScore: test.passingScore || 70,
        timeSpent,
        details: detailedResults
      }
    });
  } catch (error) {
    console.error('❌ Error submitting test result:', error);
    res.status(500).json({ success: false, error: 'Server error while submitting test result' });
  }
};

// ✅ Get all results for a specific user (Enhanced)
exports.getUserTestResults = async (req, res) => {
  try {
    const { firebaseId } = req.params;
    const { page = 1, limit = 10, subject, passed } = req.query;
    
    // Build filter
    const filter = { userId: firebaseId };
    if (passed !== undefined) filter.passed = passed === 'true';
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get results with pagination
    const [results, totalCount] = await Promise.all([
      TestResult.find(filter)
        .populate('testId', 'title topic subject level')
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      TestResult.countDocuments(filter)
    ]);

    // Filter by subject if requested (after population)
    let filteredResults = results;
    if (subject) {
      filteredResults = results.filter(result => 
        result.testId && result.testId.subject === subject
      );
    }

    // Get user statistics
    const userStats = await TestResult.getUserStats(firebaseId);

    res.json({ 
      success: true, 
      data: filteredResults,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      },
      stats: userStats
    });
  } catch (error) {
    console.error('❌ Error fetching user test results:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching user test results' });
  }
};

// ✅ Get a specific test result (Enhanced)
exports.getTestResult = async (req, res) => {
  try {
    const { firebaseId, testId } = req.params;

    const result = await TestResult.findOne({ userId: firebaseId, testId })
      .populate('testId', 'title subject level passingScore');
      
    if (!result) {
      return res.status(404).json({ success: false, error: '❌ Test result not found' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Error fetching test result:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching test result' });
  }
};

// ✅ NEW: Get test statistics for admin
exports.getTestStats = async (req, res) => {
  try {
    const { testId } = req.params;
    
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ success: false, error: '❌ Test not found' });
    }

    const stats = await TestResult.getTestStats(testId);
    
    res.json({
      success: true,
      data: {
        test: {
          id: test._id,
          title: test.title,
          subject: test.subject,
          level: test.level
        },
        ...stats
      }
    });
  } catch (error) {
    console.error('❌ Error fetching test stats:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching test stats' });
  }
};

// ✅ NEW: Create test from lesson quizzes
exports.createTestFromLesson = async (req, res) => {
  try {
    const { lessonId, title, description, duration } = req.body;
    
    const Lesson = require('../models/lesson');
    const lesson = await Lesson.findById(lessonId);
    
    if (!lesson) {
      return res.status(404).json({ success: false, error: '❌ Lesson not found' });
    }

    // Extract quiz questions from lesson steps
    const questions = [];
    lesson.steps.forEach(step => {
      if (step.type === 'quiz' && Array.isArray(step.data)) {
        step.data.forEach(quiz => {
          if (quiz.question && quiz.correctAnswer !== undefined) {
            questions.push({
              text: quiz.question,
              type: quiz.type || 'multiple-choice',
              options: quiz.options || [],
              correctAnswer: quiz.correctAnswer,
              points: 1,
              explanation: quiz.explanation || ''
            });
          }
        });
      }
    });

    if (questions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '❌ No quiz questions found in lesson' 
      });
    }

    // Create test from lesson data
    const test = new Test({
      title: title || `Test: ${lesson.lessonName}`,
      description: description || `Auto-generated test from lesson: ${lesson.lessonName}`,
      subject: lesson.subject,
      level: lesson.level,
      topic: lesson.topic,
      questions,
      duration: duration || null,
      isActive: true,
      createdAt: new Date()
    });

    await test.save();

    console.log(`✅ Test created from lesson ${lessonId}: "${test.title}" with ${questions.length} questions`);
    
    res.status(201).json({
      success: true,
      data: test,
      message: `✅ Test created with ${questions.length} questions from lesson`
    });

  } catch (error) {
    console.error('❌ Error creating test from lesson:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while creating test from lesson' 
    });
  }
};

module.exports = {
  getAvailableTests: exports.getAvailableTests,
  getTestById: exports.getTestById,
  submitTestResult: exports.submitTestResult,
  getUserTestResults: exports.getUserTestResults,
  getTestResult: exports.getTestResult,
  getTestStats: exports.getTestStats,
  createTestFromLesson: exports.createTestFromLesson
};