const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import models
const Homework = require('../models/homework');
const HomeworkProgress = require('../models/homeworkProgress');
const Lesson = require('../models/lesson');
const User = require('../models/user');
const UserProgress = require('../models/userProgress');

// Import middleware
const verifyToken = require('../middlewares/authMiddleware');

// ========================================
// 🔧 MIDDLEWARE FUNCTIONS
// ========================================

function validateFirebaseId(req, res, next) {
  if (!req.params.firebaseId) {
    return res.status(400).json({ 
      success: false,
      error: '❌ Missing firebaseId' 
    });
  }
  next();
}

function verifyOwnership(req, res, next) {
  if (!req.user || req.user.uid !== req.params.firebaseId) {
    return res.status(403).json({ 
      success: false,
      error: '❌ Access denied: user mismatch' 
    });
  }
  next();
}

function validateObjectId(req, res, next) {
  const { id, homeworkId, lessonId } = req.params;
  const idToCheck = id || homeworkId || lessonId;
  
  if (idToCheck && !mongoose.Types.ObjectId.isValid(idToCheck)) {
    return res.status(400).json({ 
      success: false,
      error: '❌ Invalid ObjectId format' 
    });
  }
  next();
}

// ========================================
// 🔧 ADMIN ROUTES - Homework Management
// ========================================

// GET all homework assignments (for admin panel)
router.get('/', async (req, res) => {
  try {
    const homework = await Homework.find()
      .populate('linkedLessonIds', 'title lessonName subject')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: homework,
      message: '✅ Homework assignments retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching homework for admin:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch homework assignments',
      details: error.message 
    });
  }
});

// GET specific homework by ID (for admin panel)
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id)
      .populate('linkedLessonIds', 'title lessonName subject');
    
    if (!homework) {
      return res.status(404).json({ 
        success: false,
        error: 'Homework not found' 
      });
    }
    
   
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

// POST new homework assignment (from admin panel)
router.post('/', verifyToken, async (req, res) => {
  try {
    
    const homeworkData = {
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Handle exercises array from different possible field names
    let exercises = [];
    
    if (req.body.exercises && Array.isArray(req.body.exercises)) {
      exercises = req.body.exercises;
    } else if (req.body.questions && Array.isArray(req.body.questions)) {
      exercises = req.body.questions;
    } else if (req.body.exerciseGroups && Array.isArray(req.body.exerciseGroups)) {
      exercises = req.body.exerciseGroups;
    } else if (req.body.quiz && Array.isArray(req.body.quiz)) {
      exercises = req.body.quiz;
    }
    
    
    // Process exercises with proper structure and validation
    if (exercises && exercises.length > 0) {
      homeworkData.exercises = exercises.map((exercise, index) => {
        // Generate unique ID for each exercise
        const exerciseId = exercise._id || exercise.id || `ex_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
        
        const processedExercise = {
          _id: exerciseId,
          type: exercise.type || exercise.questionType || 'multiple-choice',
          question: exercise.question || exercise.text || exercise.title || '',
          instruction: exercise.instruction || exercise.instructions || exercise.description || '',
          points: parseInt(exercise.points) || 1,
          correctAnswer: exercise.correctAnswer || exercise.answer || exercise.solution || '',
          options: [],
          difficulty: exercise.difficulty || 1,
          category: exercise.category || '',
          tags: exercise.tags || []
        };
        
        // Process options for multiple choice questions
        if (exercise.options && Array.isArray(exercise.options)) {
          processedExercise.options = exercise.options.map((option, optIndex) => {
            if (typeof option === 'string') {
              return { text: option, value: option };
            } else if (typeof option === 'object') {
              return {
                text: option.text || option.label || option.value || `Option ${optIndex + 1}`,
                value: option.value || option.text || option.label || `option_${optIndex}`
              };
            }
            return { text: `Option ${optIndex + 1}`, value: `option_${optIndex}` };
          });
        } else if (exercise.choices && Array.isArray(exercise.choices)) {
          processedExercise.options = exercise.choices.map((choice, optIndex) => ({
            text: choice.text || choice || `Choice ${optIndex + 1}`,
            value: choice.value || choice || `choice_${optIndex}`
          }));
        }
        
       
        return processedExercise;
      });
    } else {
      homeworkData.exercises = [];
    }
    
   

    const homework = new Homework(homeworkData);
    const savedHomework = await homework.save();
    
  
    
    res.status(201).json({
      success: true,
      data: savedHomework,
      message: '✅ Homework created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating homework:', error);
    console.error('❌ Request body:', JSON.stringify(req.body, null, 2));
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        error: 'Validation error',
        details: validationErrors 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to create homework',
      details: error.message 
    });
  }
});

// PUT update homework assignment (from admin panel)
router.put('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };

    // Handle exercises update with same logic as create
    if (req.body.exercises || req.body.questions || req.body.exerciseGroups || req.body.quiz) {
      let exercises = req.body.exercises || req.body.questions || req.body.exerciseGroups || req.body.quiz || [];
      
      
      if (Array.isArray(exercises) && exercises.length > 0) {
        updateData.exercises = exercises.map((exercise, index) => {
          const exerciseId = exercise._id || exercise.id || `ex_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
          
          const processedExercise = {
            _id: exerciseId,
            type: exercise.type || exercise.questionType || 'multiple-choice',
            question: exercise.question || exercise.text || exercise.title || '',
            instruction: exercise.instruction || exercise.instructions || exercise.description || '',
            points: parseInt(exercise.points) || 1,
            correctAnswer: exercise.correctAnswer || exercise.answer || exercise.solution || '',
            options: [],
            difficulty: exercise.difficulty || 1,
            category: exercise.category || '',
            tags: exercise.tags || []
          };
          
          // Process options
          if (exercise.options && Array.isArray(exercise.options)) {
            processedExercise.options = exercise.options.map((option, optIndex) => {
              if (typeof option === 'string') {
                return { text: option, value: option };
              } else if (typeof option === 'object') {
                return {
                  text: option.text || option.label || option.value || `Option ${optIndex + 1}`,
                  value: option.value || option.text || option.label || `option_${optIndex}`
                };
              }
              return { text: `Option ${optIndex + 1}`, value: `option_${optIndex}` };
            });
          } else if (exercise.choices && Array.isArray(exercise.choices)) {
            processedExercise.options = exercise.choices.map((choice, optIndex) => ({
              text: choice.text || choice || `Choice ${optIndex + 1}`,
              value: choice.value || choice || `choice_${optIndex}`
            }));
          }
          
          return processedExercise;
        });
      } else {
        updateData.exercises = [];
      }
    }

    const homework = await Homework.findByIdAndUpdate(id, updateData, { 
      new: true,
      runValidators: true 
    });
    
    if (!homework) {
      return res.status(404).json({ 
        success: false,
        error: 'Homework not found' 
      });
    }
    
   
    
    res.json({
      success: true,
      data: homework,
      message: '✅ Homework updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating homework:', error);
    console.error('❌ Request body:', JSON.stringify(req.body, null, 2));
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        error: 'Validation error',
        details: validationErrors 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to update homework',
      details: error.message 
    });
  }
});

// DELETE homework assignment (from admin panel)
router.delete('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const homework = await Homework.findByIdAndDelete(id);
    
    if (!homework) {
      return res.status(404).json({ 
        success: false,
        error: 'Homework not found' 
      });
    }
    
    // Also delete any user progress related to this homework
    await HomeworkProgress.deleteMany({ homeworkId: id });
    
    res.json({
      success: true,
      message: '✅ Homework deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting homework:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete homework',
      details: error.message 
    });
  }
});

// PATCH toggle homework status (from admin panel)
router.patch('/:id/status', verifyToken, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    const homework = await Homework.findByIdAndUpdate(
      id, 
      { isActive, updatedAt: new Date() }, 
      { new: true }
    );
    
    if (!homework) {
      return res.status(404).json({ 
        success: false,
        error: 'Homework not found' 
      });
    }
    
    res.json({
      success: true,
      data: homework,
      message: `✅ Homework ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('❌ Error toggling homework status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to toggle homework status',
      details: error.message 
    });
  }
});

// POST duplicate homework (from admin panel)
router.post('/:id/duplicate', verifyToken, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const originalHomework = await Homework.findById(id);
    
    if (!originalHomework) {
      return res.status(404).json({ 
        success: false,
        error: 'Homework not found' 
      });
    }
    
    const duplicatedHomework = new Homework({
      ...originalHomework.toObject(),
      _id: undefined,
      title: `${originalHomework.title} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date(),
      // Generate new IDs for exercises
      exercises: originalHomework.exercises.map((exercise, index) => ({
        ...exercise,
        _id: `ex_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`
      }))
    });
    
    await duplicatedHomework.save();
    
    res.status(201).json({
      success: true,
      data: duplicatedHomework,
      message: '✅ Homework duplicated successfully'
    });
  } catch (error) {
    console.error('❌ Error duplicating homework:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to duplicate homework',
      details: error.message 
    });
  }
});

// GET homework statistics (for admin panel dashboard)
router.get('/stats/overview', async (req, res) => {
  try {
    const totalHomework = await Homework.countDocuments();
    const activeHomework = await Homework.countDocuments({ isActive: true });
    const totalSubmissions = await HomeworkProgress.countDocuments({ completed: true });
    
    // Get subject distribution
    const subjectStats = await Homework.aggregate([
      { $group: { _id: '$subject', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get difficulty distribution
    const difficultyStats = await Homework.aggregate([
      { $group: { _id: '$difficulty', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    // Get recent activity
    const recentSubmissions = await HomeworkProgress.find({ completed: true })
      .populate('homeworkId', 'title')
      .sort({ submittedAt: -1 })
      .limit(10);
    
    res.json({
      success: true,
      data: {
        overview: {
          totalHomework,
          activeHomework,
          totalSubmissions,
          completionRate: totalHomework > 0 ? Math.round((totalSubmissions / totalHomework) * 100) : 0
        },
        distribution: {
          bySubject: subjectStats,
          byDifficulty: difficultyStats
        },
        recentActivity: recentSubmissions
      },
      message: '✅ Homework statistics retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching homework stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch homework statistics',
      details: error.message 
    });
  }
});

// ========================================
// 👥 USER ROUTES - Student Homework Interaction
// ========================================

// GET all homework for a specific user (both standalone and lesson-based)
router.get('/user/:firebaseId', verifyToken, validateFirebaseId, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId } = req.params;
    

    // Get user's homework progress
    const userProgress = await HomeworkProgress.find({ userId: firebaseId })
      .populate('lessonId', 'title lessonName subject homework')
      .populate('homeworkId', 'title subject exercises dueDate difficulty')
      .sort({ updatedAt: -1 });

    // Get all active standalone homework
    const standaloneHomework = await Homework.find({ isActive: true });

    // Get lessons with homework
    const lessonsWithHomework = await Lesson.find({ 
      homework: { $exists: true, $ne: [], $not: { $size: 0 } } 
    });

    const allHomeworks = [];

    // Process standalone homework
    for (const hw of standaloneHomework) {
      const userHwProgress = userProgress.find(up => 
        up.homeworkId && up.homeworkId._id.toString() === hw._id.toString()
      );

      allHomeworks.push({
        _id: hw._id,
        type: 'standalone',
        title: hw.title,
        subject: hw.subject,
        level: hw.level,
        instructions: hw.instructions,
        dueDate: hw.dueDate,
        difficulty: hw.difficulty,
        exercises: hw.exercises || [],
        
        // User progress
        completed: userHwProgress?.completed || false,
        score: userHwProgress?.score || 0,
        answers: userHwProgress?.answers || [],
        submittedAt: userHwProgress?.submittedAt,
        updatedAt: userHwProgress?.updatedAt || hw.updatedAt,
        hasProgress: !!userHwProgress
      });
    }

    // Process lesson-based homework
    for (const lesson of lessonsWithHomework) {
      const userHwProgress = userProgress.find(up => 
        up.lessonId && up.lessonId._id.toString() === lesson._id.toString()
      );

      allHomeworks.push({
        lessonId: lesson._id,
        type: 'lesson',
        title: `Домашнее задание: ${lesson.lessonName || lesson.title}`,
        lessonName: lesson.lessonName || lesson.title,
        subject: lesson.subject,
        level: lesson.level,
        instructions: lesson.homeworkInstructions || '',
        exercises: lesson.homework || [],
        
        // User progress
        completed: userHwProgress?.completed || false,
        score: userHwProgress?.score || 0,
        answers: userHwProgress?.answers || [],
        submittedAt: userHwProgress?.submittedAt,
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


    res.json({
      success: true,
      data: allHomeworks,
      message: '✅ Homework records retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error getting user homework:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Server error',
      message: '❌ Failed to retrieve homework records',
      details: error.message 
    });
  }
});

// GET standalone homework for user
router.get('/user/:firebaseId/homework/:homeworkId', verifyToken, validateFirebaseId, validateObjectId, verifyOwnership, async (req, res) => {
  
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
    
    // Get user's progress on this homework
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

// GET homework for a specific lesson
router.get('/user/:firebaseId/lesson/:lessonId', verifyToken, validateFirebaseId, validateObjectId, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;

    // Find existing homework progress
    const homework = await HomeworkProgress.findOne({ 
      userId: firebaseId, 
      lessonId 
    }).populate('lessonId', 'title description homework');

    // Get lesson details for homework questions
    const lesson = await Lesson.findById(lessonId).select('homework lessonName title subject homeworkInstructions');

    if (!lesson) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Lesson not found',
        message: '❌ Lesson not found' 
      });
    }


    res.json({
      success: true,
      message: '✅ Homework data retrieved successfully',
      data: {
        homework: homework || null,
        questions: lesson.homework || [],
        lessonName: lesson.lessonName || lesson.title,
        subject: lesson.subject,
        instructions: lesson.homeworkInstructions || ''
      }
    });

  } catch (error) {
    console.error('❌ Error getting homework by lesson:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Server error',
      message: '❌ Failed to retrieve homework',
      details: error.message 
    });
  }
});

// POST save standalone homework progress
router.post('/user/:firebaseId/homework/:homeworkId/save', verifyToken, validateFirebaseId, validateObjectId, verifyOwnership, async (req, res) => {
  
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

    const progressData = {
      userId: firebaseId,
      homeworkId: homeworkId,
      lessonId: null,
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

// POST submit standalone homework with grading
router.post('/user/:firebaseId/homework/:homeworkId/submit', verifyToken, validateFirebaseId, validateObjectId, verifyOwnership, async (req, res) => {
  
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

    ('📝 Grading homework with', homework.exercises.length, 'exercises');

    // Auto-grade the homework
    const gradedAnswers = answers.map((answer, index) => {
      const exercise = homework.exercises[index];
      
      if (!exercise) {
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

  

    // Update progress
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

// POST save homework answers (draft mode) - Generic for both lesson and standalone
router.post('/user/:firebaseId/save', verifyToken, validateFirebaseId, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId } = req.params;
    const { lessonId, homeworkId, answers } = req.body;
    
    if (!firebaseId) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Firebase ID is required',
        message: '❌ Firebase ID is required' 
      });
    }

    if (!lessonId && !homeworkId) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Either Lesson ID or Homework ID is required',
        message: '❌ Either Lesson ID or Homework ID is required' 
      });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Answers must be an array',
        message: '❌ Answers must be an array' 
      });
    }

    // Determine the type of homework and create appropriate query
    const query = lessonId ? { userId: firebaseId, lessonId } : { userId: firebaseId, homeworkId };
    const updateData = { 
      ...query,
      answers,
      completed: false,
      updatedAt: new Date()
    };

    // Update or create homework progress
    const homework = await HomeworkProgress.findOneAndUpdate(
      query,
      updateData,
      { 
        upsert: true, 
        new: true,
        runValidators: true 
      }
    ).populate('lessonId', 'title description').populate('homeworkId', 'title');


    res.json({
      success: true,
      message: '✅ Homework saved as draft',
      data: homework
    });

  } catch (error) {
    console.error('❌ Error saving homework:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Server error',
      message: '❌ Failed to save homework',
      details: error.message 
    });
  }
});

// POST submit and auto-grade lesson homework
router.post('/user/:firebaseId/lesson/:lessonId/submit', verifyToken, validateFirebaseId, validateObjectId, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    const { answers } = req.body;
    
    if (!firebaseId || !lessonId) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Firebase ID and Lesson ID are required',
        message: '❌ Firebase ID and Lesson ID are required' 
      });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Answers must be an array',
        message: '❌ Answers must be an array' 
      });
    }

    // Get lesson with homework questions
    const lesson = await Lesson.findById(lessonId).select('homework lessonName title');
    if (!lesson || !lesson.homework) {
      return res.status(404).json({ 
        success: false,
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


    res.json({
      success: true,
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
      success: false,
      error: '❌ Server error',
      message: '❌ Failed to submit homework',
      details: error.message 
    });
  }
});

// ========================================
// 🧹 CLEANUP & UTILITY ROUTES
// ========================================

// POST cleanup invalid homework references
router.post('/cleanup', verifyToken, async (req, res) => {
  try {
    
    // Get all homework records
    const allHomework = await HomeworkProgress.find({});
    
    const invalidHomework = [];
    const validHomework = [];
    
    // Check each homework record
    for (const hw of allHomework) {
      try {
        let isValid = false;
        
        // Check lesson-based homework
        if (hw.lessonId) {
          const lessonExists = await Lesson.exists({ _id: hw.lessonId });
          isValid = !!lessonExists;
        }
        
        // Check standalone homework
        if (hw.homeworkId) {
          const homeworkExists = await Homework.exists({ _id: hw.homeworkId });
          isValid = !!homeworkExists;
        }
        
        if (isValid) {
          validHomework.push(hw._id);
        } else {
          invalidHomework.push({
            id: hw._id,
            lessonId: hw.lessonId,
            homeworkId: hw.homeworkId,
            userId: hw.userId
          });
        }
      } catch (error) {
        invalidHomework.push({
          id: hw._id,
          lessonId: hw.lessonId,
          homeworkId: hw.homeworkId,
          userId: hw.userId,
          error: error.message
        });
      }
    }
    
   
    // Delete invalid homework records
    let deletedCount = 0;
    if (invalidHomework.length > 0) {
      const idsToDelete = invalidHomework.map(hw => hw.id);
      const deleteResult = await HomeworkProgress.deleteMany({
        _id: { $in: idsToDelete }
      });
      
      deletedCount = deleteResult.deletedCount;
    }
    
    res.json({
      success: true,
      message: '✅ Homework cleanup completed',
      data: {
        totalRecords: allHomework.length,
        validRecords: validHomework.length,
        invalidRecords: invalidHomework.length,
        deletedRecords: deletedCount,
        invalidDetails: invalidHomework
      }
    });
    
  } catch (error) {
    console.error('❌ Error during homework cleanup:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Server error during cleanup',
      message: error.message 
    });
  }
});

// ========================================
// 🔄 LEGACY ROUTES FOR BACKWARD COMPATIBILITY
// ========================================

// Legacy routes that might be used by existing frontend code
router.get('/:firebaseId/homeworks', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  // Redirect to the new user route
  req.url = `/user/${req.params.firebaseId}`;
  return router.handle(req, res);
});

router.get('/:firebaseId/homeworks/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  // Redirect to the new user lesson route
  req.url = `/user/${req.params.firebaseId}/lesson/${req.params.lessonId}`;
  return router.handle(req, res);
});

router.post('/:firebaseId/homeworks/save', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  // Redirect to the new user save route
  req.url = `/user/${req.params.firebaseId}/save`;
  req.method = 'POST';
  return router.handle(req, res);
});

router.post('/:firebaseId/homeworks/lesson/:lessonId/submit', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  // Redirect to the new user lesson submit route
  req.url = `/user/${req.params.firebaseId}/lesson/${req.params.lessonId}/submit`;
  req.method = 'POST';
  return router.handle(req, res);
});

// ========================================
// 📊 HOMEWORK ANALYTICS ROUTES
// ========================================

// GET homework analytics for admin
router.get('/analytics/overview', verifyToken, async (req, res) => {
  try {
    // Get homework completion stats
    const totalHomeworkAssigned = await Homework.countDocuments({ isActive: true });
    const totalSubmissions = await HomeworkProgress.countDocuments({ completed: true });
    const uniqueUsers = await HomeworkProgress.distinct('userId').length;
    
    // Get average scores
    const avgScoreResult = await HomeworkProgress.aggregate([
      { $match: { completed: true, score: { $gt: 0 } } },
      { $group: { _id: null, avgScore: { $avg: '$score' } } }
    ]);
    const avgScore = avgScoreResult.length > 0 ? Math.round(avgScoreResult[0].avgScore) : 0;
    
    // Get completion rate by subject
    const subjectStats = await Homework.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: 'homeworkprogresses',
          localField: '_id',
          foreignField: 'homeworkId',
          as: 'submissions'
        }
      },
      {
        $project: {
          subject: 1,
          title: 1,
          totalSubmissions: { $size: '$submissions' },
          completedSubmissions: {
            $size: {
              $filter: {
                input: '$submissions',
                cond: { $eq: ['$this.completed', true] }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: '$subject',
          totalHomework: { $sum: 1 },
          totalSubmissions: { $sum: '$totalSubmissions' },
          completedSubmissions: { $sum: '$completedSubmissions' }
        }
      }
    ]);
    
    // Get recent activity
    const recentActivity = await HomeworkProgress.find({ completed: true })
      .populate('homeworkId', 'title subject')
      .populate('lessonId', 'lessonName title')
      .sort({ submittedAt: -1 })
      .limit(20)
      .select('userId score submittedAt homeworkId lessonId');
    
    res.json({
      success: true,
      data: {
        overview: {
          totalHomeworkAssigned,
          totalSubmissions,
          uniqueUsers,
          avgScore,
          completionRate: totalHomeworkAssigned > 0 ? Math.round((totalSubmissions / totalHomeworkAssigned) * 100) : 0
        },
        subjectStats,
        recentActivity
      },
      message: '✅ Homework analytics retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching homework analytics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch homework analytics',
      details: error.message 
    });
  }
});

// GET user-specific homework analytics
router.get('/analytics/user/:firebaseId', verifyToken, validateFirebaseId, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId } = req.params;
    
    // Get user's homework progress
    const userProgress = await HomeworkProgress.find({ userId: firebaseId })
      .populate('homeworkId', 'title subject difficulty')
      .populate('lessonId', 'lessonName title topic')
      .sort({ updatedAt: -1 });
    
    const completed = userProgress.filter(p => p.completed);
    const inProgress = userProgress.filter(p => !p.completed);
    
    // Calculate stats
    const totalHomework = userProgress.length;
    const completedHomework = completed.length;
    const avgScore = completed.length > 0 ? 
      Math.round(completed.reduce((sum, p) => sum + (p.score || 0), 0) / completed.length) : 0;
    const totalStars = completed.reduce((sum, p) => sum + (p.stars || 0), 0);
    
    // Subject breakdown
    const subjectBreakdown = {};
    completed.forEach(p => {
      const subject = p.homeworkId?.subject || p.lessonId?.topic || 'Unknown';
      if (!subjectBreakdown[subject]) {
        subjectBreakdown[subject] = { completed: 0, totalScore: 0, count: 0 };
      }
      subjectBreakdown[subject].completed++;
      subjectBreakdown[subject].totalScore += (p.score || 0);
      subjectBreakdown[subject].count++;
    });
    
    // Calculate average scores per subject
    Object.keys(subjectBreakdown).forEach(subject => {
      const stats = subjectBreakdown[subject];
      stats.avgScore = stats.count > 0 ? Math.round(stats.totalScore / stats.count) : 0;
    });
    
    // Recent performance trend (last 10 submissions)
    const recentSubmissions = completed
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .slice(0, 10)
      .map(p => ({
        date: p.submittedAt,
        score: p.score,
        title: p.homeworkId?.title || `${p.lessonId?.lessonName} Homework`,
        subject: p.homeworkId?.subject || p.lessonId?.topic
      }));
    
    res.json({
      success: true,
      data: {
        overview: {
          totalHomework,
          completedHomework,
          inProgressHomework: inProgress.length,
          completionRate: totalHomework > 0 ? Math.round((completedHomework / totalHomework) * 100) : 0,
          avgScore,
          totalStars
        },
        subjectBreakdown,
        recentSubmissions,
        progressList: userProgress.map(p => ({
          _id: p._id,
          title: p.homeworkId?.title || `${p.lessonId?.lessonName} Homework`,
          subject: p.homeworkId?.subject || p.lessonId?.topic,
          completed: p.completed,
          score: p.score,
          stars: p.stars,
          submittedAt: p.submittedAt,
          updatedAt: p.updatedAt
        }))
      },
      message: '✅ User homework analytics retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching user homework analytics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user homework analytics',
      details: error.message 
    });
  }
});

module.exports = router;