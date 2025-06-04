// routes/testRoutes.js - FIXED Test Routes

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Models
const Test = require('../models/Test');
const TestResult = require('../models/TestResult');

// Middleware
const verifyToken = require('../middlewares/authMiddleware');

console.log('✅ testRoutes.js loaded');

// Validation middleware
function validateTestData(req, res, next) {
  try {
    const { title, subject, level, questions } = req.body;
    
    // Basic field validation
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Test title is required'
      });
    }
    
    if (!subject || !subject.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Subject is required'
      });
    }
    
    if (!level || level < 1 || level > 12) {
      return res.status(400).json({
        success: false,
        error: 'Level must be between 1 and 12'
      });
    }
    
    // Questions validation
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one question is required'
      });
    }
    
    // Validate each question
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      
      if (!question.text || !question.text.trim()) {
        return res.status(400).json({
          success: false,
          error: `Question ${i + 1}: Question text is required`
        });
      }
      
      // Validate correct answer exists
      if (question.correctAnswer === undefined || question.correctAnswer === null || question.correctAnswer === '') {
        return res.status(400).json({
          success: false,
          error: `Question ${i + 1}: Correct answer is required`
        });
      }
      
      // Validate multiple choice questions have options
      if (question.type === 'multiple-choice') {
        if (!question.options || !Array.isArray(question.options) || question.options.length < 2) {
          return res.status(400).json({
            success: false,
            error: `Question ${i + 1}: Multiple choice questions need at least 2 options`
          });
        }
        
        // Validate that correct answer is valid for multiple choice
        const correctAnswerIndex = parseInt(question.correctAnswer);
        if (isNaN(correctAnswerIndex) || correctAnswerIndex < 0 || correctAnswerIndex >= question.options.length) {
          return res.status(400).json({
            success: false,
            error: `Question ${i + 1}: Correct answer must be a valid option index`
          });
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('❌ Validation error:', error);
    res.status(400).json({
      success: false,
      error: 'Invalid request data',
      details: error.message
    });
  }
}

// ========== ADMIN ROUTES ==========

// GET all tests (for admin panel)
router.get('/', async (req, res) => {
  try {
    console.log('📥 Admin: GET all tests');
    
    const tests = await Test.find()
      .sort({ createdAt: -1 })
      .lean();
    
    console.log(`✅ Retrieved ${tests.length} tests for admin`);
    
    // Return in both formats for compatibility
    res.json({
      success: true,
      data: tests,
      message: '✅ Tests retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching tests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tests',
      details: error.message
    });
  }
});

// GET specific test by ID (for admin panel)
router.get('/:id', async (req, res) => {
  try {
    console.log('📥 Admin: GET test by ID:', req.params.id);
    
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid test ID format'
      });
    }
    
    const test = await Test.findById(req.params.id).lean();
    
    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }
    
    console.log('✅ Test retrieved:', test.title);
    res.json({
      success: true,
      data: test,
      message: '✅ Test retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching test:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch test',
      details: error.message
    });
  }
});

// POST create new test (from admin panel)
router.post('/', verifyToken, validateTestData, async (req, res) => {
  try {
    console.log('📤 Admin: Creating new test');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    
    // Process questions to ensure proper structure
    const processedQuestions = req.body.questions.map((question, index) => {
      // Clean up the question object
      const processedQuestion = {
        text: question.text.trim(),
        type: question.type || 'multiple-choice',
        points: question.points || 1,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation || ''
      };
      
      // Handle options for multiple choice
      if (question.type === 'multiple-choice' && question.options) {
        processedQuestion.options = question.options.map(opt => ({
          text: (typeof opt === 'string' ? opt : opt.text || '').trim()
        })).filter(opt => opt.text); // Remove empty options
      }
      
      return processedQuestion;
    });
    
    const testData = {
      title: req.body.title.trim(),
      description: req.body.description?.trim() || '',
      subject: req.body.subject.trim(),
      level: parseInt(req.body.level),
      topic: req.body.topic?.trim() || '',
      questions: processedQuestions,
      duration: req.body.duration ? parseInt(req.body.duration) : null,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      allowRetakes: req.body.allowRetakes !== undefined ? req.body.allowRetakes : true,
      showResults: req.body.showResults !== undefined ? req.body.showResults : true,
      randomizeQuestions: req.body.randomizeQuestions || false,
      randomizeOptions: req.body.randomizeOptions || false,
      passingScore: req.body.passingScore || 70,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('🔍 Processed test data:', JSON.stringify(testData, null, 2));
    
    const test = new Test(testData);
    const savedTest = await test.save();
    
    console.log('✅ Test created successfully:', savedTest.title);
    
    res.status(201).json({
      success: true,
      data: savedTest,
      message: '✅ Test created successfully'
    });
    
  } catch (error) {
    console.error('❌ Error creating test:', error);
    console.error('❌ Error stack:', error.stack);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: validationErrors
      });
    }
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'A test with this title already exists',
        details: 'Please choose a different title'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create test',
      details: error.message
    });
  }
});

// PUT update test (from admin panel)
router.put('/:id', verifyToken, validateTestData, async (req, res) => {
  try {
    console.log('🔄 Admin: Updating test:', req.params.id);
    
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid test ID format'
      });
    }
    
    // Process questions similar to create
    const processedQuestions = req.body.questions.map((question) => {
      const processedQuestion = {
        text: question.text.trim(),
        type: question.type || 'multiple-choice',
        points: question.points || 1,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation || ''
      };
      
      if (question.type === 'multiple-choice' && question.options) {
        processedQuestion.options = question.options.map(opt => ({
          text: (typeof opt === 'string' ? opt : opt.text || '').trim()
        })).filter(opt => opt.text);
      }
      
      return processedQuestion;
    });
    
    const updateData = {
      title: req.body.title.trim(),
      description: req.body.description?.trim() || '',
      subject: req.body.subject.trim(),
      level: parseInt(req.body.level),
      topic: req.body.topic?.trim() || '',
      questions: processedQuestions,
      duration: req.body.duration ? parseInt(req.body.duration) : null,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      allowRetakes: req.body.allowRetakes !== undefined ? req.body.allowRetakes : true,
      showResults: req.body.showResults !== undefined ? req.body.showResults : true,
      randomizeQuestions: req.body.randomizeQuestions || false,
      randomizeOptions: req.body.randomizeOptions || false,
      passingScore: req.body.passingScore || 70,
      updatedAt: new Date()
    };
    
    const test = await Test.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }
    
    console.log('✅ Test updated successfully:', test.title);
    
    res.json({
      success: true,
      data: test,
      message: '✅ Test updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error updating test:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to update test',
      details: error.message
    });
  }
});

// DELETE test (from admin panel)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    console.log('🗑️ Admin: Deleting test:', req.params.id);
    
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid test ID format'
      });
    }
    
    const test = await Test.findByIdAndDelete(req.params.id);
    
    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }
    
    // Also delete any test results for this test
    await TestResult.deleteMany({ testId: req.params.id });
    
    console.log('✅ Test deleted successfully:', test.title);
    
    res.json({
      success: true,
      message: '✅ Test deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting test:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete test',
      details: error.message
    });
  }
});

// PATCH toggle test status (from admin panel)
router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    console.log('🔄 Admin: Toggling test status:', req.params.id);
    
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid test ID format'
      });
    }
    
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isActive must be a boolean value'
      });
    }
    
    const test = await Test.findByIdAndUpdate(
      req.params.id,
      { isActive, updatedAt: new Date() },
      { new: true }
    );
    
    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }
    
    console.log('✅ Test status updated:', test.title, 'is now', isActive ? 'active' : 'inactive');
    
    res.json({
      success: true,
      data: test,
      message: `✅ Test ${isActive ? 'activated' : 'deactivated'} successfully`
    });
    
  } catch (error) {
    console.error('❌ Error toggling test status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle test status',
      details: error.message
    });
  }
});

// POST duplicate test (from admin panel)
router.post('/:id/duplicate', verifyToken, async (req, res) => {
  try {
    console.log('📋 Admin: Duplicating test:', req.params.id);
    
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid test ID format'
      });
    }
    
    const originalTest = await Test.findById(req.params.id);
    
    if (!originalTest) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }
    
    // Create duplicate
    const duplicatedTest = new Test({
      ...originalTest.toObject(),
      _id: undefined,
      title: `${originalTest.title} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const savedTest = await duplicatedTest.save();
    
    console.log('✅ Test duplicated successfully:', savedTest.title);
    
    res.status(201).json({
      success: true,
      data: savedTest,
      message: '✅ Test duplicated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error duplicating test:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to duplicate test',
      details: error.message
    });
  }
});

// ========== BULK OPERATIONS ==========

// DELETE all tests (admin only)
router.delete('/all', verifyToken, async (req, res) => {
  try {
    console.log('🧹 Admin: Deleting all tests');
    
    const deleteResult = await Test.deleteMany({});
    await TestResult.deleteMany({}); // Also delete all test results
    
    console.log('✅ All tests deleted:', deleteResult.deletedCount);
    
    res.json({
      success: true,
      message: `✅ ${deleteResult.deletedCount} tests deleted successfully`
    });
    
  } catch (error) {
    console.error('❌ Error deleting all tests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete all tests',
      details: error.message
    });
  }
});

// DELETE tests by subject
router.delete('/subject/:subjectName', verifyToken, async (req, res) => {
  try {
    const subjectName = decodeURIComponent(req.params.subjectName);
    console.log('🧹 Admin: Deleting tests for subject:', subjectName);
    
    const deleteResult = await Test.deleteMany({ subject: subjectName });
    
    console.log('✅ Tests deleted for subject:', subjectName, deleteResult.deletedCount);
    
    res.json({
      success: true,
      message: `✅ ${deleteResult.deletedCount} tests deleted for subject "${subjectName}"`
    });
    
  } catch (error) {
    console.error('❌ Error deleting tests by subject:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete tests by subject',
      details: error.message
    });
  }
});

// ========== USER ROUTES (Keeping existing functionality) ==========

// Middleware to check user ownership
function checkUserMatch(req, res, next) {
  if (!req.user || req.user.uid !== req.params.firebaseId) {
    console.warn(`⚠️ Access denied for user: ${req.user?.uid} vs ${req.params.firebaseId}`);
    return res.status(403).json({ 
      success: false,
      error: '❌ Access denied: user mismatch' 
    });
  }
  next();
}

// GET available tests for user
router.get('/user/:firebaseId', verifyToken, checkUserMatch, async (req, res) => {
  try {
    const tests = await Test.find({ isActive: true }).select('-questions.correctAnswer -questions.explanation');
    console.log(`📥 Retrieved ${tests.length} active tests for user ${req.params.firebaseId}`);
    res.json({ 
      success: true,
      tests: tests,
      message: '✅ Tests retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching tests for user:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch tests',
      details: error.message
    });
  }
});

// GET specific test for user
router.get('/user/:firebaseId/:testId', verifyToken, checkUserMatch, async (req, res) => {
  try {
    const { testId } = req.params;
    const test = await Test.findById(testId).select('-questions.correctAnswer -questions.explanation');
    
    if (!test) {
      return res.status(404).json({ 
        success: false,
        error: 'Test not found' 
      });
    }
    
    if (!test.isActive) {
      return res.status(403).json({ 
        success: false,
        error: 'Test is not active' 
      });
    }
    
    console.log(`📥 Retrieved test ${testId} for user ${req.params.firebaseId}`);
    res.json({ 
      success: true,
      test: test,
      message: '✅ Test retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching test:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch test',
      details: error.message
    });
  }
});


// POST submit test result
router.post('/user/:firebaseId/:testId/submit', verifyToken, checkUserMatch, async (req, res) => {
  try {
    const { firebaseId, testId } = req.params;
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Answers are required' });
    }

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (!test.isActive) {
      return res.status(403).json({ error: 'Test is not active' });
    }

    const total = test.questions.length;
    let correct = 0;
    const detailedResults = [];

    test.questions.forEach((q, index) => {
      const userAnswer = answers.find(a => a.questionIndex === index)?.answer?.trim();
      const correctAnswer = q.correctAnswer?.trim();
      const isCorrect = userAnswer?.toLowerCase() === correctAnswer?.toLowerCase();

      if (isCorrect) correct++;

      detailedResults.push({
        questionIndex: index,
        question: q.text || q.question,
        userAnswer,
        correctAnswer,
        isCorrect
      });
    });

    const percentage = Math.round((correct / total) * 100);

    const result = new TestResult({
      userId: firebaseId,
      testId,
      answers: detailedResults,
      score: percentage,
      submittedAt: new Date()
    });

    await result.save();

    console.log(`✅ Test ${testId} submitted by user ${firebaseId}. Score: ${percentage}%`);

    res.json({
      success: true,
      data: {
        testId,
        correct,
        total,
        score: percentage,
        details: detailedResults
      }
    });
  } catch (error) {
    console.error('❌ Error submitting test result:', error);
    res.status(500).json({ error: 'Failed to submit test result' });
  }
});

// GET test results for user
router.get('/user/:firebaseId/:testId/result', verifyToken, checkUserMatch, async (req, res) => {
  try {
    const { firebaseId, testId } = req.params;

    const result = await TestResult.findOne({ userId: firebaseId, testId }).populate('testId');
    if (!result) {
      return res.status(404).json({ error: 'Test result not found' });
    }

    console.log(`📥 Retrieved test result for user ${firebaseId}, test ${testId}`);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Error fetching test result:', error);
    res.status(500).json({ error: 'Failed to fetch test result' });
  }
});

// GET all test results for user
router.get('/user/:firebaseId/results', verifyToken, checkUserMatch, async (req, res) => {
  try {
    const { firebaseId } = req.params;
    const results = await TestResult.find({ userId: firebaseId }).populate('testId', 'title subject level');

    console.log(`📥 Retrieved ${results.length} test results for user ${firebaseId}`);
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('❌ Error fetching user test results:', error);
    res.status(500).json({ error: 'Failed to fetch test results' });
  }
});

module.exports = router;