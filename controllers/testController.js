const Test = require('../models/Test');
const TestResult = require('../models/TestResult');

// ✅ Get all available tests
exports.getAvailableTests = async (req, res) => {
  try {
    const tests = await Test.find();
    res.json({ success: true, data: tests });
  } catch (error) {
    console.error('❌ Error fetching tests:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ✅ Get single test by ID
exports.getTestById = async (req, res) => {
  try {
    const { testId } = req.params;
    const test = await Test.findById(testId);

    if (!test) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }

    res.json({ success: true, data: test });
  } catch (error) {
    console.error('❌ Error fetching test:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ✅ Submit test result + auto-grade
exports.submitTestResult = async (req, res) => {
  try {
    const { userId, testId } = req.params;
    const { answers } = req.body; // [{ questionIndex: 0, answer: 'Paris' }, ...]

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }

    const total = test.questions.length;
    let score = 0;
    const detailedResults = [];

    test.questions.forEach((q, index) => {
      const userAnswer = answers.find(a => a.questionIndex === index)?.answer?.trim();
      const correctAnswer = q.correctAnswer?.trim();

      const isCorrect = userAnswer?.toLowerCase() === correctAnswer?.toLowerCase();
      if (isCorrect) score++;

      detailedResults.push({
        question: q.question,
        correctAnswer,
        userAnswer,
        isCorrect
      });
    });

    const percentage = Math.round((score / total) * 100);

    const result = new TestResult({
      userId,
      testId,
      answers,
      score: percentage
    });
    await result.save();

    res.json({
      success: true,
      data: {
        testId,
        score: percentage,
        total,
        correct: score,
        details: detailedResults
      }
    });
  } catch (error) {
    console.error('❌ Error submitting test result:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ✅ Get user’s past test results
exports.getUserTestResults = async (req, res) => {
  try {
    const { userId } = req.params;
    const results = await TestResult.find({ userId }).populate('testId', 'title topic type');
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('❌ Error fetching test results:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ✅ Get specific test result for a user
exports.getTestResult = async (req, res) => {
  try {
    const { firebaseId, testId } = req.params;
    const result = await TestResult.findOne({ userId: firebaseId, testId }).populate('testId');

    if (!result) {
      return res.status(404).json({ success: false, error: 'Result not found' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Error fetching test result:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
