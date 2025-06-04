const express = require('express');
const router = express.Router();

const verifyToken = require('../middlewares/authMiddleware');
const Test = require('../models/Test');
const TestResult = require('../models/TestResult');

// ✅ Admin routes for test management (from admin panel)
// GET all tests (for admin panel)
router.get('/', async (req, res) => {
  try {
    const tests = await Test.find().sort({ createdAt: -1 });
    console.log(`📥 Admin: Retrieved ${tests.length} tests`);
    res.json(tests);
  } catch (error) {
    console.error('❌ Error fetching tests for admin:', error);
    res.status(500).json({ error: 'Failed to fetch tests' });
  }
});

// POST new test (from admin panel)
router.post('/', verifyToken, async (req, res) => {
  try {
    const testData = {
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Ensure questions have IDs and proper structure
    if (testData.questions) {
      testData.questions = testData.questions.map(question => ({
        ...question,
        _id: question._id || `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: question.type || 'multiple-choice',
        points: question.points || 1,
        options: question.options || []
      }));
    }

    const test = new Test(testData);
    await test.save();
    
    console.log('✅ Admin: Created test:', test.title);
    res.status(201).json(test);
  } catch (error) {
    console.error('❌ Error creating test:', error);
    res.status(500).json({ error: 'Failed to create test' });
  }
});

// PUT update test (from admin panel)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };

    // Ensure questions have IDs and proper structure
    if (updateData.questions) {
      updateData.questions = updateData.questions.map(question => ({
        ...question,
        _id: question._id || `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: question.type || 'multiple-choice',
        points: question.points || 1,
        options: question.options || []
      }));
    }

    const test = await Test.findByIdAndUpdate(id, updateData, { new: true });
    
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    console.log('✅ Admin: Updated test:', test.title);
    res.json(test);
  } catch (error) {
    console.error('❌ Error updating test:', error);
    res.status(500).json({ error: 'Failed to update test' });
  }
});

// DELETE test (from admin panel)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const test = await Test.findByIdAndDelete(id);
    
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    console.log('✅ Admin: Deleted test:', test.title);
    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting test:', error);
    res.status(500).json({ error: 'Failed to delete test' });
  }
});

// GET test by ID (for admin panel)
router.get('/:id', async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    res.json(test);
  } catch (error) {
    console.error('❌ Error fetching test:', error);
    res.status(500).json({ error: 'Failed to fetch test' });
  }
});

// PATCH toggle test status (from admin panel)
router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    const test = await Test.findByIdAndUpdate(
      id, 
      { isActive, updatedAt: new Date() }, 
      { new: true }
    );
    
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    console.log('✅ Admin: Toggled test status:', test.title, 'is now', isActive ? 'active' : 'inactive');
    res.json(test);
  } catch (error) {
    console.error('❌ Error toggling test status:', error);
    res.status(500).json({ error: 'Failed to toggle test status' });
  }
});

// POST duplicate test (from admin panel)
router.post('/:id/duplicate', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const originalTest = await Test.findById(id);
    
    if (!originalTest) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    const duplicatedTest = new Test({
      ...originalTest.toObject(),
      _id: undefined,
      title: `${originalTest.title} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await duplicatedTest.save();
    
    console.log('✅ Admin: Duplicated test:', duplicatedTest.title);
    res.status(201).json(duplicatedTest);
  } catch (error) {
    console.error('❌ Error duplicating test:', error);
    res.status(500).json({ error: 'Failed to duplicate test' });
  }
});

// ✅ User routes for taking tests
// 🧠 Ensure Firebase token matches requested user
function checkUserMatch(req, res, next) {
  if (!req.user || req.user.uid !== req.params.firebaseId) {
    console.warn(`⚠️ Access denied for user: ${req.user?.uid} vs ${req.params.firebaseId}`);
    return res.status(403).json({ error: '❌ Access denied: user mismatch' });
  }
  next();
}

// GET available tests for user
router.get('/user/:firebaseId', verifyToken, checkUserMatch, async (req, res) => {
  try {
    const tests = await Test.find({ isActive: true }).select('-questions.correctAnswer');
    console.log(`📥 Retrieved ${tests.length} active tests for user ${req.params.firebaseId}`);
    res.json({ tests });
  } catch (error) {
    console.error('❌ Error fetching tests for user:', error);
    res.status(500).json({ error: 'Failed to fetch tests' });
  }
});

// GET specific test for user
router.get('/user/:firebaseId/:testId', verifyToken, checkUserMatch, async (req, res) => {
  try {
    const { testId } = req.params;
    const test = await Test.findById(testId).select('-questions.correctAnswer');
    
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    if (!test.isActive) {
      return res.status(403).json({ error: 'Test is not active' });
    }
    
    console.log(`📥 Retrieved test ${testId} for user ${req.params.firebaseId}`);
    res.json({ test });
  } catch (error) {
    console.error('❌ Error fetching test:', error);
    res.status(500).json({ error: 'Failed to fetch test' });
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