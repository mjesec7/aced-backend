const express = require('express');
const router = express.Router();

// Import models
const Homework = require('../models/homework');
const HomeworkProgress = require('../models/homeworkProgress');
const Lesson = require('../models/lesson');
const User = require('../models/user');

// Import middleware
const verifyToken = require('../middlewares/authMiddleware');

// ✅ ADMIN ROUTES - Homework Management from Admin Panel

// GET all homework assignments (for admin panel)
router.get('/', async (req, res) => {
  try {
    const homework = await Homework.find()
      .populate('linkedLessonIds', 'title lessonName subject')
      .sort({ createdAt: -1 });
    
    console.log(`📥 Admin: Retrieved ${homework.length} homework assignments`);
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
router.get('/:id', async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id)
      .populate('linkedLessonIds', 'title lessonName subject');
    
    if (!homework) {
      return res.status(404).json({ 
        success: false,
        error: 'Homework not found' 
      });
    }
    
    console.log('📥 Admin: Retrieved homework:', homework.title);
    console.log('📝 Homework exercises count:', homework.exercises?.length || 0);
    
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

// ✅ FIXED: POST new homework assignment (from admin panel)
router.post('/', verifyToken, async (req, res) => {
  try {
    console.log('📝 Creating new homework with data:', JSON.stringify(req.body, null, 2));
    
    const homeworkData = {
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // ✅ FIXED: Properly handle exercises array from different possible field names
    let exercises = [];
    
    // Check various possible field names for exercises
    if (req.body.exercises && Array.isArray(req.body.exercises)) {
      exercises = req.body.exercises;
    } else if (req.body.questions && Array.isArray(req.body.questions)) {
      exercises = req.body.questions;
    } else if (req.body.exerciseGroups && Array.isArray(req.body.exerciseGroups)) {
      exercises = req.body.exerciseGroups;
    } else if (req.body.quiz && Array.isArray(req.body.quiz)) {
      exercises = req.body.quiz;
    }
    
    console.log('🔍 Processing exercises:', exercises.length, 'exercises found');
    
    // ✅ ENHANCED: Process exercises with proper structure and validation
    if (exercises && exercises.length > 0) {
      homeworkData.exercises = exercises.map((exercise, index) => {
        // Generate unique ID for each exercise
        const exerciseId = exercise._id || exercise.id || `ex_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
        
        // ✅ FIXED: Handle different exercise data structures
        const processedExercise = {
          _id: exerciseId,
          type: exercise.type || exercise.questionType || 'multiple-choice',
          question: exercise.question || exercise.text || exercise.title || '',
          instruction: exercise.instruction || exercise.instructions || exercise.description || '',
          points: parseInt(exercise.points) || 1,
          
          // ✅ FIXED: Handle different answer formats
          correctAnswer: exercise.correctAnswer || exercise.answer || exercise.solution || '',
          
          // ✅ FIXED: Handle options for multiple choice questions
          options: [],
          
          // Additional fields
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
        
        console.log(`✅ Processed exercise ${index + 1}:`, {
          id: processedExercise._id,
          type: processedExercise.type,
          question: processedExercise.question.substring(0, 50) + '...',
          optionsCount: processedExercise.options.length,
          hasCorrectAnswer: !!processedExercise.correctAnswer
        });
        
        return processedExercise;
      });
    } else {
      console.warn('⚠️ No exercises provided or exercises array is empty');
      homeworkData.exercises = [];
    }
    
    console.log(`📊 Final homework data summary:`, {
      title: homeworkData.title,
      subject: homeworkData.subject,
      level: homeworkData.level,
      exerciseCount: homeworkData.exercises.length,
      isActive: homeworkData.isActive
    });

    const homework = new Homework(homeworkData);
    const savedHomework = await homework.save();
    
    console.log('✅ Admin: Created homework successfully:', {
      id: savedHomework._id,
      title: savedHomework.title,
      exerciseCount: savedHomework.exercises.length
    });
    
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

// ✅ FIXED: PUT update homework assignment (from admin panel)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📝 Updating homework:', id, 'with data:', JSON.stringify(req.body, null, 2));
    
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };

    // ✅ FIXED: Handle exercises update with same logic as create
    if (req.body.exercises || req.body.questions || req.body.exerciseGroups || req.body.quiz) {
      let exercises = req.body.exercises || req.body.questions || req.body.exerciseGroups || req.body.quiz || [];
      
      console.log('🔍 Updating exercises:', exercises.length, 'exercises found');
      
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
    
    console.log('✅ Admin: Updated homework successfully:', {
      id: homework._id,
      title: homework.title,
      exerciseCount: homework.exercises.length
    });
    
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
router.delete('/:id', verifyToken, async (req, res) => {
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
    
    console.log('✅ Admin: Deleted homework:', homework.title);
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
router.patch('/:id/status', verifyToken, async (req, res) => {
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
    
    console.log('✅ Admin: Toggled homework status:', homework.title, 'is now', isActive ? 'active' : 'inactive');
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
router.post('/:id/duplicate', verifyToken, async (req, res) => {
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
    
    console.log('✅ Admin: Duplicated homework:', duplicatedHomework.title);
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
      .populate('userId', 'name')
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

// ✅ USER ROUTES - For student homework interaction

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

// GET all homework for a specific user (both standalone and lesson-based)
router.get('/user/:firebaseId', verifyToken, checkUserMatch, async (req, res) => {
  try {
    const { firebaseId } = req.params;
    
    console.log(`📥 Fetching all homework for user ${firebaseId}`);

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

    console.log(`✅ Found ${allHomeworks.length} homework items for user ${firebaseId}`);

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

// GET homework for a specific lesson
router.get('/user/:firebaseId/lesson/:lessonId', verifyToken, checkUserMatch, async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    
    if (!firebaseId || !lessonId) {
      return res.status(400).json({ 
        success: false,
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
    const lesson = await Lesson.findById(lessonId).select('homework lessonName title subject homeworkInstructions');

    if (!lesson) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Lesson not found',
        message: '❌ Lesson not found' 
      });
    }

    console.log(`📥 Homework for user ${firebaseId}, lesson ${lessonId}:`, homework ? 'Found' : 'Not found');

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

// POST save homework answers (draft mode)
router.post('/user/:firebaseId/save', verifyToken, checkUserMatch, async (req, res) => {
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

    console.log(`💾 Homework saved (draft) for user ${firebaseId}, ${lessonId ? 'lesson' : 'homework'} ${lessonId || homeworkId}`);

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

// POST submit and auto-grade homework
router.post('/user/:firebaseId/lesson/:lessonId/submit', verifyToken, checkUserMatch, async (req, res) => {
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

    console.log(`🎯 Homework submitted and graded for user ${firebaseId}, lesson ${lessonId}. Score: ${score}%, Stars: ${stars}`);

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

// ✅ CLEANUP ROUTES

// POST cleanup invalid homework references
router.post('/cleanup', verifyToken, async (req, res) => {
  try {
    console.log('🧹 Starting homework cleanup...');
    
    // Get all homework records
    const allHomework = await HomeworkProgress.find({});
    console.log(`📊 Found ${allHomework.length} total homework records`);
    
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
    
    console.log(`✅ Valid homework records: ${validHomework.length}`);
    console.log(`❌ Invalid homework records: ${invalidHomework.length}`);
    
    // Delete invalid homework records
    let deletedCount = 0;
    if (invalidHomework.length > 0) {
      const idsToDelete = invalidHomework.map(hw => hw.id);
      const deleteResult = await HomeworkProgress.deleteMany({
        _id: { $in: idsToDelete }
      });
      
      deletedCount = deleteResult.deletedCount;
      console.log(`🗑️ Deleted ${deletedCount} invalid homework records`);
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

module.exports = router;