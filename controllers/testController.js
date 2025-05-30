const Test = require('../models/Test');
const TestResult = require('../models/TestResult');

// ✅ Get all available tests
exports.getAvailableTests = async (req, res) => {
  try {
    const tests = await Test.find();
    res.json({ success: true, data: tests });
  } catch (error) {
    console.error('❌ Error fetching tests:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching tests' });
  }
};

// ✅ Get a single test by ID
exports.getTestById = async (req, res) => {
  try {
    const { testId } = req.params;
    const test = await Test.findById(testId);

    if (!test) {
      return res.status(404).json({ success: false, error: '❌ Test not found' });
    }

    res.json({ success: true, data: test });
  } catch (error) {
    console.error('❌ Error fetching test:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching test' });
  }
};

// ✅ Submit a test and auto-grade
exports.submitTestResult = async (req, res) => {
  try {
    const { firebaseId, testId } = req.params;
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ success: false, error: '❌ Answers are required' });
    }

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ success: false, error: '❌ Test not found' });
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
        question: q.question,
        userAnswer,
        correctAnswer,
        isCorrect
      });
    });

    const percentage = Math.round((correct / total) * 100);

    const result = new TestResult({
      userId: firebaseId,
      testId,
      answers,
      score: percentage
    });

    await result.save();

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
    res.status(500).json({ success: false, error: 'Server error while submitting test result' });
  }
};

// ✅ Get all results for a specific user
exports.getUserTestResults = async (req, res) => {
  try {
    const { firebaseId } = req.params;
    const results = await TestResult.find({ userId: firebaseId }).populate('testId', 'title topic type');

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('❌ Error fetching user test results:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching user test results' });
  }
};

// ✅ Get a specific test result
exports.getTestResult = async (req, res) => {
  try {
    const { firebaseId, testId } = req.params;

    const result = await TestResult.findOne({ userId: firebaseId, testId }).populate('testId');
    if (!result) {
      return res.status(404).json({ success: false, error: '❌ Test result not found' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Error fetching test result:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching test result' });
  }
};
