const HomeworkProgress = require('../models/homeworkProgress');
const UserProgress = require('../models/userProgress');
const Lesson = require('../models/lesson');

// ✅ Get all homework records for a user
exports.getAllHomeworks = async (req, res) => {
  try {
    const { firebaseId } = req.params;
    
    if (!firebaseId) {
      return res.status(400).json({ 
        error: '❌ Firebase ID is required',
        message: '❌ Firebase ID is required' 
      });
    }

    const homeworks = await HomeworkProgress.find({ userId: firebaseId })
      .populate('lessonId', 'title description homework')
      .sort({ updatedAt: -1 });

    console.log(`📥 Found ${homeworks.length} homework records for user ${firebaseId}`);

    res.status(200).json({
      message: '✅ Homework records retrieved successfully',
      data: homeworks
    });

  } catch (error) {
    console.error('❌ Error getting all homeworks:', error);
    res.status(500).json({ 
      error: '❌ Server error',
      message: '❌ Failed to retrieve homework records',
      details: error.message 
    });
  }
};

// ✅ Get homework for a specific lesson
exports.getHomeworkByLesson = async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    
    if (!firebaseId || !lessonId) {
      return res.status(400).json({ 
        error: '❌ Firebase ID and Lesson ID are required',
        message: '❌ Firebase ID and Lesson ID are required' 
      });
    }

    // Find existing homework progress
    const homework = await HomeworkProgress.findOne({ 
      userId: firebaseId, 
      lessonId 
    }).populate('lessonId', 'title description homework');

    // Get lesson details for homework questions
    const lesson = await Lesson.findById(lessonId).select('homework');

    if (!lesson) {
      return res.status(404).json({ 
        error: '❌ Lesson not found',
        message: '❌ Lesson not found' 
      });
    }

    console.log(`📥 Homework for user ${firebaseId}, lesson ${lessonId}:`, homework ? 'Found' : 'Not found');

    res.status(200).json({
      message: '✅ Homework data retrieved successfully',
      data: {
        homework: homework || null,
        questions: lesson.homework || []
      }
    });

  } catch (error) {
    console.error('❌ Error getting homework by lesson:', error);
    res.status(500).json({ 
      error: '❌ Server error',
      message: '❌ Failed to retrieve homework',
      details: error.message 
    });
  }
};

// ✅ Save or update homework answers (draft mode)
exports.saveHomework = async (req, res) => {
  try {
    const { firebaseId } = req.params;
    const { lessonId, answers } = req.body;
    
    if (!firebaseId || !lessonId) {
      return res.status(400).json({ 
        error: '❌ Firebase ID and Lesson ID are required',
        message: '❌ Firebase ID and Lesson ID are required' 
      });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({ 
        error: '❌ Answers must be an array',
        message: '❌ Answers must be an array' 
      });
    }

    // Update or create homework progress
    const homework = await HomeworkProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId },
      { 
        answers,
        completed: false, // Save as draft
        updatedAt: new Date()
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true 
      }
    ).populate('lessonId', 'title description');

    console.log(`💾 Homework saved (draft) for user ${firebaseId}, lesson ${lessonId}`);

    res.status(200).json({
      message: '✅ Homework saved as draft',
      data: homework
    });

  } catch (error) {
    console.error('❌ Error saving homework:', error);
    res.status(500).json({ 
      error: '❌ Server error',
      message: '❌ Failed to save homework',
      details: error.message 
    });
  }
};

// ✅ Submit and auto-grade homework
exports.submitHomework = async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    const { answers } = req.body;
    
    if (!firebaseId || !lessonId) {
      return res.status(400).json({ 
        error: '❌ Firebase ID and Lesson ID are required',
        message: '❌ Firebase ID and Lesson ID are required' 
      });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({ 
        error: '❌ Answers must be an array',
        message: '❌ Answers must be an array' 
      });
    }

    // Get lesson with homework questions
    const lesson = await Lesson.findById(lessonId).select('homework');
    if (!lesson || !lesson.homework) {
      return res.status(404).json({ 
        error: '❌ Lesson or homework not found',
        message: '❌ Lesson or homework not found' 
      });
    }

    // Auto-grade the homework
    const gradedAnswers = answers.map((answer, index) => {
      const question = lesson.homework[index];
      if (!question) {
        return {
          questionIndex: index,
          userAnswer: answer.userAnswer || '',
          correctAnswer: '',
          isCorrect: false,
          type: 'auto'
        };
      }

      const correctAnswer = question.correctAnswer || '';
      const userAnswer = (answer.userAnswer || '').toString().trim().toLowerCase();
      const correctAnswerNormalized = correctAnswer.toString().trim().toLowerCase();
      
      const isCorrect = userAnswer === correctAnswerNormalized;

      return {
        questionIndex: index,
        userAnswer: answer.userAnswer || '',
        correctAnswer,
        isCorrect,
        type: 'auto'
      };
    });

    // Calculate score and stars
    const totalQuestions = gradedAnswers.length;
    const correctAnswers = gradedAnswers.filter(a => a.isCorrect).length;
    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    
    let stars = 0;
    if (score >= 90) stars = 3;
    else if (score >= 70) stars = 2;
    else if (score >= 50) stars = 1;

    // Update homework progress
    const homework = await HomeworkProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId },
      { 
        answers: gradedAnswers,
        completed: true,
        score,
        stars,
        submittedAt: new Date(),
        updatedAt: new Date()
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true 
      }
    ).populate('lessonId', 'title description');

    // Update user progress to mark homework as submitted
    await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId },
      { 
        submittedHomework: true,
        homeworkScore: score,
        updatedAt: new Date()
      },
      { upsert: false } // Don't create if doesn't exist
    );

    console.log(`🎯 Homework submitted and graded for user ${firebaseId}, lesson ${lessonId}. Score: ${score}%, Stars: ${stars}`);

    res.status(200).json({
      message: '✅ Homework submitted and graded successfully',
      data: {
        homework,
        score,
        stars,
        totalQuestions,
        correctAnswers,
        details: `${correctAnswers}/${totalQuestions} correct (${score}%)`
      }
    });

  } catch (error) {
    console.error('❌ Error submitting homework:', error);
    res.status(500).json({ 
      error: '❌ Server error',
      message: '❌ Failed to submit homework',
      details: error.message 
    });
  }
};