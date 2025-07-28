const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Models with error handling
let Lesson, Topic, UserProgress, Homework, HomeworkProgress, VocabularyProgress, Vocabulary;
try {
  Lesson = require('../models/lesson');
  Topic = require('../models/topic');
  UserProgress = require('../models/userProgress');
  Homework = require('../models/homework');
  HomeworkProgress = require('../models/homeworkProgress');
  VocabularyProgress = require('../models/vocabularyProgress');
  Vocabulary = require('../models/vocabulary');
} catch (modelError) {
  console.error('❌ Failed to load lesson models:', modelError.message);
}

// Middleware with error handling
let verifyToken;
try {
  verifyToken = require('../middlewares/authMiddleware');
} catch (authError) {
  console.error('❌ Failed to load auth middleware:', authError.message);
  // Fallback middleware that skips auth in development
  verifyToken = (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
      next();
    } else {
      res.status(500).json({ error: 'Auth middleware not available' });
    }
  };
}

// Import services with error handling
let handleLessonCompletion, extractContentFromCompletedLessons;
try {
  const lessonCompletionService = require('../services/lessonCompletionService');
  handleLessonCompletion = lessonCompletionService.handleLessonCompletion;
  extractContentFromCompletedLessons = lessonCompletionService.extractContentFromCompletedLessons;
} catch (serviceError) {
  console.error('❌ Failed to load lesson completion service:', serviceError.message);
}

// Import controller functions with error handling
let addLesson, updateLesson, deleteLesson, getLesson, getLessonsByTopic, bulkCreateLessons;

try {
  const lessonController = require('../controllers/lessonController');
  addLesson = lessonController.addLesson;
  updateLesson = lessonController.updateLesson;
  deleteLesson = lessonController.deleteLesson;
  getLesson = lessonController.getLesson;
  getLessonsByTopic = lessonController.getLessonsByTopic;
  bulkCreateLessons = lessonController.bulkCreateLessons;
} catch (error) {
  console.error('❌ Failed to load lesson controller:', error.message);
}

// ─── Middleware: Logging ─────────────────────────────
router.use((req, res, next) => {
  next();
});

// ─── Middleware: Validate ObjectId ──────────────────
function validateObjectId(req, res, next) {
  const { id, topicId } = req.params;
  const idToValidate = id || topicId;
  
  if (idToValidate && !mongoose.Types.ObjectId.isValid(idToValidate)) {
    console.warn(`⚠️ Invalid ObjectId: ${idToValidate}`);
    return res.status(400).json({ 
      success: false,
      message: '❌ Invalid ID format' 
    });
  }
  next();
}

// ─── Helper Functions ────────────────────────────────
function getStepTypesCount(steps) {
  const counts = {};
  if (Array.isArray(steps)) {
    steps.forEach(step => {
      if (step && step.type) {
        counts[step.type] = (counts[step.type] || 0) + 1;
      }
    });
  }
  return counts;
}

// Helper function to validate vocabulary items
function isValidVocabularyItem(vocab) {
  if (!vocab || typeof vocab !== 'object') return false;
  
  const hasTermDefinition = vocab.term && vocab.definition;
  const hasWordTranslation = vocab.word && vocab.translation;
  const hasFrontBack = vocab.front && vocab.back;
  const hasQuestionAnswer = vocab.question && vocab.answer;
  
  return hasTermDefinition || hasWordTranslation || hasFrontBack || hasQuestionAnswer;
}

// Helper function to standardize vocabulary format
function standardizeVocabularyItem(vocab) {
  return {
    term: vocab.term || vocab.word || vocab.front || vocab.question,
    definition: vocab.definition || vocab.translation || vocab.back || vocab.answer,
    example: vocab.example || vocab.hint || '',
    pronunciation: vocab.pronunciation || '',
    partOfSpeech: vocab.partOfSpeech || vocab.type || 'noun'
  };
}

// ✅ ENHANCED: Fallback lesson creation with detailed error handling
const enhancedFallbackAddLesson = async (req, res) => {
  
  try {
    // Step 1: Check database connection
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ ENHANCED: Database not connected, state:', mongoose.connection.readyState);
      return res.status(503).json({
        success: false,
        error: 'Database connection unavailable',
        step: 'database_check'
      });
    }

    // Step 2: Check if models are available
    if (!Lesson || !Topic) {
      console.error('❌ ENHANCED: Models not available');
      return res.status(500).json({
        success: false,
        error: 'Database models not available',
        step: 'models_check'
      });
    }

    // Step 3: Extract and validate data
    const {
      subject,
      level,
      topic,
      topicDescription,
      lessonName,
      description,
      type,
      steps,
      createHomework,
      homeworkTitle,
      homeworkInstructions,
      relatedSubjects,
      translations,
      isDraft
    } = req.body;

   

    // Enhanced validation
    const missingFields = [];
    if (!subject?.trim()) missingFields.push('subject');
    if (!level || isNaN(parseInt(level))) missingFields.push('level');
    if (!topic?.trim()) missingFields.push('topic');
    if (!lessonName?.trim()) missingFields.push('lessonName');
    if (!description?.trim()) missingFields.push('description');
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      missingFields.push('steps');
    }

    if (missingFields.length > 0) {
      console.error('❌ ENHANCED: Missing required fields:', missingFields);
      return res.status(400).json({ 
        success: false,
        error: 'Required fields missing',
        missingFields: missingFields,
        step: 'validation'
      });
    }

    // Step 4: Topic resolution
    let resolvedTopic = null;
    const topicName = topic.trim();
    const topicDesc = topicDescription?.trim() || '';

    try {
      resolvedTopic = await Topic.findOne({ 
        subject: subject.trim(), 
        level: parseInt(level), 
        name: topicName 
      });

      if (!resolvedTopic) {
        resolvedTopic = new Topic({ 
          name: topicName, 
          subject: subject.trim(), 
          level: parseInt(level), 
          description: topicDesc 
        });
        await resolvedTopic.save();
      } else {
      }
    } catch (topicError) {
      console.error('❌ ENHANCED: Topic resolution failed:', topicError);
      return res.status(500).json({
        success: false,
        error: 'Topic creation failed',
        details: topicError.message,
        step: 'topic_resolution'
      });
    }

    // Step 5: Process steps with enhanced data handling
    const processedSteps = steps.map((step, index) => {
      
      const validTypes = [
        'explanation', 'example', 'practice', 'exercise', 
        'vocabulary', 'quiz', 'video', 'audio', 
        'reading', 'writing'
      ];
      
      const stepType = step.type || 'explanation';
      
      if (!validTypes.includes(stepType)) {
        console.warn(`⚠️ Invalid step type: ${stepType}, defaulting to explanation`);
        step.type = 'explanation';
      }
      
      let processedData;
      
      try {
        switch (stepType) {
          case 'explanation':
          case 'example':
          case 'reading':
            processedData = {
              content: step.content || '',
              questions: step.questions || []
            };
            break;
            
          case 'practice':
            processedData = {
              instructions: step.instructions || '',
              type: step.practiceType || 'guided'
            };
            break;
            
          case 'exercise':
            // ✅ FIXED: Handle exercises from multiple possible sources
            let exercises = [];
            if (Array.isArray(step.exercises)) {
              exercises = step.exercises;
            } else if (Array.isArray(step.data)) {
              exercises = step.data;
            } else if (step.data && Array.isArray(step.data.exercises)) {
              exercises = step.data.exercises;
            }
            
            // Filter valid exercises
            const validExercises = exercises.filter(ex => 
              ex.question && ex.question.trim() && 
              (ex.answer || ex.correctAnswer)
            );
            
            processedData = validExercises.map(ex => ({
              type: ex.type || 'short-answer',
              question: ex.question.trim(),
              answer: ex.answer || ex.correctAnswer,
              correctAnswer: ex.correctAnswer || ex.answer,
              points: ex.points || 1,
              includeInHomework: Boolean(ex.includeInHomework),
              instruction: ex.instruction || '',
              hint: ex.hint || '',
              explanation: ex.explanation || '',
              // Type-specific fields
              options: ex.options || [],
              template: ex.template || '',
              blanks: ex.blanks || [],
              pairs: ex.pairs || [],
              items: ex.items || [],
              statement: ex.statement || '',
              dragItems: ex.dragItems || [],
              dropZones: ex.dropZones || []
            }));
            
            break;
            
          case 'vocabulary':
            let vocabulary = [];
            if (Array.isArray(step.vocabulary)) {
              vocabulary = step.vocabulary;
            } else if (Array.isArray(step.data)) {
              vocabulary = step.data;
            } else if (step.data && Array.isArray(step.data.vocabulary)) {
              vocabulary = step.data.vocabulary;
            }
            
            processedData = vocabulary.filter(vocab => 
              vocab.term && vocab.term.trim() && 
              vocab.definition && vocab.definition.trim()
            ).map(vocab => ({
              term: vocab.term.trim(),
              definition: vocab.definition.trim(),
              example: vocab.example?.trim() || ''
            }));
            
            break;
            
          case 'quiz':
            let quizzes = [];
            if (Array.isArray(step.quizzes)) {
              quizzes = step.quizzes;
            } else if (Array.isArray(step.data)) {
              quizzes = step.data;
            } else if (step.data && Array.isArray(step.data.quizzes)) {
              quizzes = step.data.quizzes;
            }
            
            processedData = quizzes.filter(quiz => 
              quiz.question && quiz.question.trim() && 
              quiz.correctAnswer !== undefined
            ).map(quiz => ({
              question: quiz.question.trim(),
              type: quiz.type || 'multiple-choice',
              options: quiz.options || [],
              correctAnswer: quiz.correctAnswer,
              explanation: quiz.explanation || ''
            }));
            
            break;
            
          case 'video':
          case 'audio':
            processedData = {
              url: step.url || '',
              description: step.description || ''
            };
            break;
            
          case 'writing':
            processedData = {
              prompt: step.prompt || '',
              wordLimit: step.wordLimit || 100
            };
            break;
            
          default:
            processedData = step.content || step.data || {};
        }
      } catch (stepError) {
        console.error(`❌ Error processing step ${index + 1}:`, stepError);
        // Fallback to basic structure
        processedData = step.content || step.data || {};
      }
      
      return { 
        type: stepType, 
        data: processedData 
      };
    });


    // Step 6: Process homework if enabled
    const homeworkData = { exercises: [], quizzes: [] };
    
    if (createHomework) {
      
      processedSteps.forEach((step, stepIndex) => {
        try {
          if (step.type === 'exercise' && Array.isArray(step.data)) {
            step.data.forEach(exercise => {
              if (exercise.includeInHomework) {
                homeworkData.exercises.push({
                  question: exercise.question,
                  correctAnswer: exercise.correctAnswer || exercise.answer,
                  points: exercise.points || 1,
                  type: exercise.type || 'short-answer',
                  instruction: exercise.instruction || '',
                  options: exercise.options || [],
                  hint: exercise.hint || '',
                  explanation: exercise.explanation || ''
                });
              }
            });
          }
          
          if (step.type === 'quiz' && Array.isArray(step.data)) {
            step.data.forEach(quiz => {
              homeworkData.quizzes.push({
                question: quiz.question,
                type: quiz.type || 'multiple-choice',
                options: quiz.options || [],
                correctAnswer: quiz.correctAnswer,
                explanation: quiz.explanation || '',
                points: 1
              });
            });
          }
        } catch (homeworkError) {
          console.warn(`⚠️ Error processing homework for step ${stepIndex + 1}:`, homeworkError.message);
        }
      });
      
    }

    // Step 7: Create lesson object
    const lessonData = {
      subject: String(subject).trim(),
      level: Number(level),
      topic: resolvedTopic.name,
      topicId: resolvedTopic._id,
      lessonName: String(lessonName).trim(),
      description: String(description).trim(),
      type: type || 'free',
      
      steps: processedSteps,
      
      explanations: processedSteps
        .filter(s => s.type === 'explanation')
        .map(s => {
          if (typeof s.data === 'string') return s.data;
          if (s.data && s.data.content) return s.data.content;
          return '';
        })
        .filter(content => content.trim() !== ''),
      
      homework: {
        exercises: homeworkData.exercises,
        quizzes: homeworkData.quizzes,
        totalExercises: homeworkData.exercises.length + homeworkData.quizzes.length
      },
      
      relatedSubjects: Array.isArray(relatedSubjects) ? relatedSubjects : [],
      translations: typeof translations === 'object' && translations !== null ? translations : {},
      
      isDraft: Boolean(isDraft),
      isActive: !Boolean(isDraft),
      
      stats: {
        viewCount: 0,
        completionRate: 0,
        averageRating: 0,
        totalRatings: 0
      }
    };

    // Step 8: Save lesson
    let newLesson;
    try {
      newLesson = new Lesson(lessonData);
      await newLesson.save();
    } catch (saveError) {
      console.error('❌ ENHANCED: Lesson save failed:', saveError);
      
      if (saveError.name === 'ValidationError') {
        const validationDetails = Object.values(saveError.errors).map(err => ({
          field: err.path,
          message: err.message
        }));
        
        return res.status(400).json({
          success: false,
          error: 'Lesson validation failed',
          validationErrors: validationDetails,
          step: 'lesson_save'
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Database save failed',
        details: saveError.message,
        step: 'lesson_save'
      });
    }

    // Step 9: Build comprehensive response
    const response = {
      success: true,
      lesson: newLesson,
      homework: {
        exercises: homeworkData.exercises,
        quizzes: homeworkData.quizzes,
        total: homeworkData.exercises.length + homeworkData.quizzes.length,
        createSeparate: createHomework && (homeworkData.exercises.length > 0 || homeworkData.quizzes.length > 0),
        title: homeworkTitle || `Homework: ${newLesson.lessonName}`,
        instructions: homeworkInstructions || `Complete exercises based on: ${newLesson.topic}`
      },
      topic: {
        id: resolvedTopic._id,
        name: resolvedTopic.name,
        description: resolvedTopic.description
      },
      stats: {
        totalSteps: newLesson.steps.length,
        stepTypes: newLesson.steps.reduce((acc, step) => {
          acc[step.type] = (acc[step.type] || 0) + 1;
          return acc;
        }, {}),
        homeworkExercises: homeworkData.exercises.length + homeworkData.quizzes.length,
        explanationSteps: newLesson.steps.filter(s => s.type === 'explanation').length,
        exerciseSteps: newLesson.steps.filter(s => s.type === 'exercise').length,
        practiceSteps: newLesson.steps.filter(s => s.type === 'practice').length,
        vocabularySteps: newLesson.steps.filter(s => s.type === 'vocabulary').length,
        quizSteps: newLesson.steps.filter(s => s.type === 'quiz').length
      },
      source: 'enhanced_fallback_v2'
    };

x    
    res.status(201).json(response);

  } catch (error) {
    console.error('\n❌ ENHANCED: Unexpected error:', error);
    console.error('❌ ENHANCED: Error stack:', error.stack);
    
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again',
      step: 'unexpected_error',
      details: process.env.NODE_ENV === 'development' ? {
        name: error.name,
        message: error.message
      } : undefined
    });
  }
};

// ✅ CRITICAL FIX: Fallback function for topic lessons
const fallbackGetLessonsByTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { type, level, includeStats, sortBy, order } = req.query;
    
    
    if (!topicId || !mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Invalid topic ID format' 
      });
    }
    
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }
    
    // Build filter
    const filter = { topicId, isActive: true };
    if (type) filter.type = type;
    if (level) filter.level = parseInt(level);
    
    // Build sort options
    let sortOptions = { createdAt: 1 };
    if (sortBy) {
      const sortOrder = order === 'desc' ? -1 : 1;
      sortOptions = { [sortBy]: sortOrder };
    }
    
    // Find lessons with population
    const lessons = await Lesson.find(filter)
      .populate('topicId', 'name description')
      .sort(sortOptions)
      .lean();
    
    
    // Calculate detailed stats if requested
    const response = {
      success: true,
      lessons,
      total: lessons.length,
      filter: { topicId, type, level }
    };
    
    if (includeStats === 'true') {
      response.stats = {
        totalLessons: lessons.length,
        byType: {
          free: lessons.filter(l => l.type === 'free').length,
          premium: lessons.filter(l => l.type === 'premium').length
        },
        byLevel: lessons.reduce((acc, lesson) => {
          acc[lesson.level] = (acc[lesson.level] || 0) + 1;
          return acc;
        }, {}),
        steps: {
          avgStepsPerLesson: lessons.reduce((acc, l) => acc + (l.steps?.length || 0), 0) / lessons.length || 0,
          totalSteps: lessons.reduce((acc, l) => acc + (l.steps?.length || 0), 0),
          stepTypes: lessons.reduce((acc, lesson) => {
            const stepCounts = getStepTypesCount(lesson.steps || []);
            Object.keys(stepCounts).forEach(type => {
              acc[type] = (acc[type] || 0) + stepCounts[type];
            });
            return acc;
          }, {})
        },
        homework: {
          lessonsWithHomework: lessons.filter(l => l.homework?.totalExercises > 0).length,
          totalHomeworkExercises: lessons.reduce((acc, l) => acc + (l.homework?.totalExercises || 0), 0)
        }
      };
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ [FALLBACK] Error fetching lessons by topic:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Failed to fetch lessons',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again'
    });
  }
};

// ==========================================
// 🧪 TEST & DEBUG ROUTES (FIRST)
// ==========================================

// ✅ Test endpoint (must be first)
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ Lesson routes are working!',
    timestamp: new Date().toISOString(),
    dbState: mongoose.connection.readyState,
    modelsAvailable: { Lesson: !!Lesson, Topic: !!Topic },
    controllerAvailable: !!addLesson,
    endpoints: [
      'GET /api/lessons/test - This test endpoint',
      'POST /api/lessons/debug - Debug endpoint', 
      'GET /api/lessons - Get all lessons',
      'POST /api/lessons - Create lesson',
      'POST /api/lessons/:id/complete - Complete lesson and extract content',
      'POST /api/lessons/:id/complete-and-extract - Complete lesson with enhanced extraction',
      'POST /api/lessons/migrate-content/:userId - Migrate content from completed lessons',
      'GET /api/lessons/:id - Get specific lesson',
      'PUT /api/lessons/:id - Update lesson',
      'DELETE /api/lessons/:id - Delete lesson'
    ]
  });
});

// ✅ Debug endpoint
router.post('/debug', async (req, res) => {
  try {
x
    
    // Test basic database query
    if (Lesson && mongoose.connection.readyState === 1) {
      const count = await Lesson.countDocuments();
    }
    
    res.json({
      success: true,
      message: 'Debug endpoint working',
      dbState: mongoose.connection.readyState,
      modelsAvailable: { Lesson: !!Lesson, Topic: !!Topic },
      requestBodyKeys: Object.keys(req.body),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ DEBUG: Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// ==========================================
// 📚 LESSON COMPLETION ROUTES 
// ==========================================

// ✅ POST /api/lessons/:id/complete - Complete lesson and extract content
router.post('/:id/complete', verifyToken, validateObjectId, async (req, res) => {
  try {
    const lessonId = req.params.id;
    const { userId, progress, stars, score } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    // Check if lesson completion service is available
    if (!handleLessonCompletion) {
      console.warn('⚠️ Lesson completion service not available, saving basic progress only');
      
      // Fallback: just save basic user progress
      if (UserProgress) {
        await UserProgress.findOneAndUpdate(
          { userId, lessonId },
          {
            completed: true,
            completedAt: new Date(),
            stars: stars || 0,
            score: score || 0,
            finalProgress: progress
          },
          { upsert: true, new: true }
        );
      }
      
      return res.json({
        success: true,
        message: '🎉 Lesson completed successfully! (Basic mode)',
        data: {
          lessonCompleted: true,
          userProgress: {
            completed: true,
            stars: stars || 0,
            score: score || 0
          },
          extraction: {
            vocabularyAdded: 0,
            homeworkCreated: false,
            message: 'Content extraction service not available'
          }
        }
      });
    }
    
    // Process lesson completion and extract content
    const extractionResult = await handleLessonCompletion(userId, lessonId, progress);
    
    // Update user progress
    if (UserProgress) {
      await UserProgress.findOneAndUpdate(
        { userId, lessonId },
        {
          completed: true,
          completedAt: new Date(),
          stars: stars || 0,
          score: score || 0,
          finalProgress: progress,
          homeworkGenerated: extractionResult.homeworkCreated,
          vocabularyExtracted: extractionResult.vocabularyAdded
        },
        { upsert: true, new: true }
      );
    }
    
    res.json({
      success: true,
      message: '🎉 Lesson completed successfully!',
      data: {
        lessonCompleted: true,
        userProgress: {
          completed: true,
          stars: stars || 0,
          score: score || 0
        },
        extraction: extractionResult
      }
    });
    
  } catch (error) {
    console.error('❌ Error completing lesson:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete lesson',
      details: error.message
    });
  }
});

// ✅ NEW: POST /api/lessons/:id/complete-and-extract - Enhanced lesson completion with content extraction
router.post('/:id/complete-and-extract', verifyToken, validateObjectId, async (req, res) => {
  try {
    const lessonId = req.params.id;
    const { userId, progress, stars, score } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    
    // Step 1: Mark lesson as completed in user progress
    if (UserProgress) {
      await UserProgress.findOneAndUpdate(
        { userId, lessonId },
        {
          completed: true,
          completedAt: new Date(),
          stars: stars || 0,
          score: score || 0,
          finalProgress: progress,
          extractionProcessed: true
        },
        { upsert: true, new: true }
      );
    }
    
    // Step 2: Get the lesson for content extraction
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      throw new Error('Lesson not found');
    }
    
    let extractionResult = {
      vocabularyAdded: 0,
      vocabularyCount: 0,
      homeworkCreated: false,
      homeworkId: null,
      message: 'Lesson completed successfully'
    };
    
    // Step 3: Extract vocabulary from lesson steps
    const vocabularyItems = [];
    
    if (lesson.steps && Array.isArray(lesson.steps)) {
      lesson.steps.forEach((step, stepIndex) => {
        if (step.type === 'vocabulary' && step.data) {
          let vocabData = [];
          
          // Handle different vocabulary data structures
          if (Array.isArray(step.data)) {
            vocabData = step.data;
          } else if (step.data.vocabulary && Array.isArray(step.data.vocabulary)) {
            vocabData = step.data.vocabulary;
          } else if (step.vocabulary && Array.isArray(step.vocabulary)) {
            vocabData = step.vocabulary;
          }
          
          vocabData.forEach((vocab, vocabIndex) => {
            if (isValidVocabularyItem(vocab)) {
              const standardVocab = standardizeVocabularyItem(vocab);
              const vocabularyItem = {
                userId,
                lessonId,
                lessonName: lesson.lessonName,
                term: standardVocab.term,
                definition: standardVocab.definition,
                example: standardVocab.example,
                pronunciation: standardVocab.pronunciation,
                partOfSpeech: standardVocab.partOfSpeech,
                language: getLanguageFromLesson(lesson),
                difficulty: getDifficultyFromLevel(lesson.level),
                learned: false,
                extractedAt: new Date(),
                source: 'lesson_completion',
                metadata: {
                  stepIndex,
                  vocabIndex,
                  lessonLevel: lesson.level,
                  lessonSubject: lesson.subject
                }
              };
              
              vocabularyItems.push(vocabularyItem);
            }
          });
        }
      });
    }
    
    // Step 4: Save vocabulary to database
    if (vocabularyItems.length > 0) {
      try {
        if (Vocabulary) {
          // Check for existing vocabulary to avoid duplicates
          const existingVocab = await Vocabulary.find({
            userId,
            lessonId,
            term: { $in: vocabularyItems.map(v => v.term) }
          });
          
          const existingTerms = new Set(existingVocab.map(v => v.term));
          const newVocabularyItems = vocabularyItems.filter(v => !existingTerms.has(v.term));
          
          if (newVocabularyItems.length > 0) {
            await Vocabulary.insertMany(newVocabularyItems);
            extractionResult.vocabularyAdded = newVocabularyItems.length;
            extractionResult.vocabularyCount = newVocabularyItems.length;
            
          }
        } else {
          // Fallback: Store in user progress as metadata
          await UserProgress.findOneAndUpdate(
            { userId, lessonId },
            {
              $set: {
                extractedVocabulary: vocabularyItems,
                vocabularyExtracted: vocabularyItems.length
              }
            }
          );
          
          extractionResult.vocabularyAdded = vocabularyItems.length;
          extractionResult.vocabularyCount = vocabularyItems.length;
          
        }
      } catch (vocabError) {
        console.warn('⚠️ Failed to save vocabulary:', vocabError.message);
      }
    }
    
    // Step 5: Create homework from lesson exercises
    const homeworkExercises = [];
    const homeworkQuizzes = [];
    
    if (lesson.steps && Array.isArray(lesson.steps)) {
      lesson.steps.forEach((step, stepIndex) => {
        if (step.type === 'exercise' && step.data && Array.isArray(step.data)) {
          step.data.forEach((exercise, exerciseIndex) => {
            if (exercise.includeInHomework || step.data.length <= 3) { // Auto-include if few exercises
              homeworkExercises.push({
                question: exercise.question,
                type: exercise.type || 'short-answer',
                options: exercise.options || [],
                correctAnswer: exercise.correctAnswer || exercise.answer,
                points: exercise.points || 1,
                instruction: exercise.instruction || '',
                hint: exercise.hint || '',
                explanation: exercise.explanation || '',
                source: 'lesson_extraction',
                lessonStep: stepIndex,
                exerciseIndex
              });
            }
          });
        }
        
        if (step.type === 'quiz' && step.data && Array.isArray(step.data)) {
          step.data.forEach((quiz, quizIndex) => {
            homeworkQuizzes.push({
              question: quiz.question,
              type: quiz.type || 'multiple-choice',
              options: quiz.options || [],
              correctAnswer: quiz.correctAnswer,
              explanation: quiz.explanation || '',
              points: 1,
              source: 'lesson_extraction',
              lessonStep: stepIndex,
              quizIndex
            });
          });
        }
      });
    }
    
    // Step 6: Save homework if we have content
    if ((homeworkExercises.length > 0 || homeworkQuizzes.length > 0) && Homework) {
      try {
        const homeworkData = {
          userId,
          lessonId,
          title: `Домашнее задание: ${lesson.lessonName}`,
          description: `Упражнения по уроку "${lesson.lessonName}"`,
          subject: lesson.subject,
          level: lesson.level,
          exercises: [...homeworkExercises, ...homeworkQuizzes],
          totalQuestions: homeworkExercises.length + homeworkQuizzes.length,
          isActive: true,
          createdAt: new Date(),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          source: 'lesson_completion',
          metadata: {
            originalLessonName: lesson.lessonName,
            extractedAt: new Date(),
            exerciseCount: homeworkExercises.length,
            quizCount: homeworkQuizzes.length
          }
        };
        
        const homework = new Homework(homeworkData);
        await homework.save();
        
        extractionResult.homeworkCreated = true;
        extractionResult.homeworkId = homework._id;
        
      } catch (homeworkError) {
        console.warn('⚠️ Failed to create homework:', homeworkError.message);
      }
    }
    
    // Step 7: Update lesson completion statistics
    try {
      await Lesson.findByIdAndUpdate(lessonId, {
        $inc: { 
          'stats.completions': 1,
          'stats.vocabularyExtractions': vocabularyItems.length > 0 ? 1 : 0,
          'stats.homeworkGenerations': extractionResult.homeworkCreated ? 1 : 0
        }
      });
    } catch (statsError) {
      console.warn('⚠️ Failed to update lesson stats:', statsError.message);
    }
    
    // Step 8: Build response
    if (vocabularyItems.length > 0) {
      extractionResult.message += ` Добавлено ${vocabularyItems.length} слов в словарь.`;
    }
    
    if (extractionResult.homeworkCreated) {
      extractionResult.message += ` Создано домашнее задание с ${homeworkExercises.length + homeworkQuizzes.length} вопросами.`;
    }
    
    
    res.json({
      success: true,
      message: '🎉 Lesson completed and content extracted successfully!',
      data: {
        lessonCompleted: true,
        userProgress: {
          completed: true,
          stars: stars || 0,
          score: score || 0
        },
        extraction: extractionResult
      }
    });
    
  } catch (error) {
    console.error('❌ Error in enhanced lesson completion:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete lesson with extraction',
      details: error.message
    });
  }
});

// Helper function to determine language from lesson
function getLanguageFromLesson(lesson) {
  const subject = (lesson.subject || '').toLowerCase();
  const title = (lesson.lessonName || lesson.title || '').toLowerCase();
  
  const languageMap = {
    'english': ['english', 'английский', 'англ', 'eng'],
    'russian': ['russian', 'русский', 'рус', 'rus'],
    'spanish': ['spanish', 'испанский', 'español', 'esp'],
    'french': ['french', 'французский', 'français', 'fra'],
    'german': ['german', 'немецкий', 'deutsch', 'deu'],
    'uzbek': ['uzbek', 'узбекский', 'o\'zbek', 'uzb']
  };
  
  const searchText = `${subject} ${title}`;
  
  for (const [language, keywords] of Object.entries(languageMap)) {
    if (keywords.some(keyword => searchText.includes(keyword))) {
      return language;
    }
  }
  
  return 'english'; // Default
}

// Helper function to convert lesson level to difficulty
function getDifficultyFromLevel(level) {
  if (level <= 2) return 'beginner';
  if (level <= 4) return 'intermediate';
  return 'advanced';
}

// POST /api/lessons/migrate-content/:userId - Migrate content from completed lessons
router.post('/migrate-content/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { lessonIds } = req.body; // Optional: specific lessons
    
    // Verify user access
    if (req.user?.uid !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: user mismatch'
      });
    }
    
    
    // Check if extraction service is available
    if (!extractContentFromCompletedLessons) {
      return res.status(503).json({
        success: false,
        error: 'Content extraction service not available'
      });
    }
    
    // Call the extraction service
    const mockReq = { params: { userId }, body: { lessonIds } };
    const mockRes = {
      json: (data) => data,
      status: (code) => ({ json: (data) => ({ ...data, statusCode: code }) })
    };
    
    const result = await extractContentFromCompletedLessons(mockReq, mockRes);
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Error migrating lesson content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to migrate lesson content',
      details: error.message
    });
  }
});

// ==========================================
// 📊 STATISTICS & ANALYTICS ROUTES
// ==========================================

// ✅ Get Lesson Statistics
router.get('/stats', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { subject, level, type } = req.query;
    
    // Build match filter
    const matchFilter = { isActive: true };
    if (subject) matchFilter.subject = subject;
    if (level) matchFilter.level = parseInt(level);
    if (type) matchFilter.type = type;

    const stats = await Lesson.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalLessons: { $sum: 1 },
          freeCount: { 
            $sum: { $cond: [{ $eq: ['$type', 'free'] }, 1, 0] } 
          },
          premiumCount: { 
            $sum: { $cond: [{ $eq: ['$type', 'premium'] }, 1, 0] } 
          },
          avgSteps: { $avg: { $size: '$steps' } },
          totalViews: { $sum: '$stats.viewCount' },
          avgRating: { $avg: '$stats.averageRating' }
        }
      }
    ]);

    const levelStats = await Lesson.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$level',
          count: { $sum: 1 },
          avgRating: { $avg: '$stats.averageRating' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const subjectStats = await Lesson.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$subject',
          count: { $sum: 1 },
          avgSteps: { $avg: { $size: '$steps' } }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      overall: stats[0] || {
        totalLessons: 0,
        freeCount: 0,
        premiumCount: 0,
        avgSteps: 0,
        totalViews: 0,
        avgRating: 0
      },
      byLevel: levelStats,
      bySubject: subjectStats
    });

  } catch (error) {
    console.error('❌ Error getting lesson stats:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Error getting statistics', 
      error: error.message 
    });
  }
});

// ✅ Get lesson summary statistics
router.get('/summary', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const [
      totalLessons,
      activeLessons,
      draftLessons,
      subjectCounts,
      levelCounts,
      typeCounts,
      recentLessons
    ] = await Promise.all([
      Lesson.countDocuments(),
      Lesson.countDocuments({ isActive: true }),
      Lesson.countDocuments({ isDraft: true }),
      Lesson.aggregate([
        { $group: { _id: '$subject', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Lesson.aggregate([
        { $group: { _id: '$level', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Lesson.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      Lesson.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('lessonName subject level createdAt')
        .lean()
    ]);

    res.json({
      success: true,
      summary: {
        total: totalLessons,
        active: activeLessons,
        draft: draftLessons,
        published: activeLessons - draftLessons
      },
      distribution: {
        bySubject: subjectCounts,
        byLevel: levelCounts,
        byType: typeCounts
      },
      recent: recentLessons
    });

  } catch (error) {
    console.error('❌ Error getting lesson summary:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ Lessons Count by Topic
router.get('/count/by-topic', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const counts = await Lesson.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$topicId',
          count: { $sum: 1 },
          topic: { $first: '$topic' },
          subject: { $first: '$subject' },
          level: { $first: '$level' }
        }
      },
      { $sort: { subject: 1, level: 1 } }
    ]);
    
    res.status(200).json({
      success: true,
      counts
    });
  } catch (error) {
    console.error('❌ Error counting lessons by topic:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error counting lessons', 
      error: error.message 
    });
  }
});

// ==========================================
// 🔍 SEARCH & FILTER ROUTES
// ==========================================

// ✅ Search Lessons
router.get('/search', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { 
      q, 
      subject, 
      level, 
      type, 
      difficulty,
      hasHomework,
      stepType,
      page = 1, 
      limit = 20 
    } = req.query;

    // Build search query
    const query = { isActive: true };
    
    if (q) {
      query.$or = [
        { lessonName: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { topic: { $regex: q, $options: 'i' } }
      ];
    }
    
    if (subject) query.subject = subject;
    if (level) query.level = parseInt(level);
    if (type) query.type = type;
    if (difficulty) query['metadata.difficulty'] = difficulty;
    
    if (hasHomework === 'true') {
      query.$or = [
        { 'homework.exercises.0': { $exists: true } },
        { 'homework.quizzes.0': { $exists: true } }
      ];
    }
    
    if (stepType) {
      query['steps.type'] = stepType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [lessons, totalCount] = await Promise.all([
      Lesson.find(query)
        .populate('topicId', 'name description')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Lesson.countDocuments(query)
    ]);

    res.json({
      success: true,
      lessons,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      },
      filters: { q, subject, level, type, difficulty, hasHomework, stepType }
    });

  } catch (error) {
    console.error('❌ Error searching lessons:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Search failed', 
      error: error.message 
    });
  }
});

// ✅ Filter lessons with complex criteria
router.post('/filter', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { filters, sort, limit, skip } = req.body;
    
    let query = Lesson.find(filters || {});
    
    if (sort) {
      query = query.sort(sort);
    }
    
    if (skip) {
      query = query.skip(skip);
    }
    
    if (limit) {
      query = query.limit(limit);
    }

    const lessons = await query.populate('topicId', 'name description').lean();
    const totalCount = await Lesson.countDocuments(filters || {});
    
    res.json({
      success: true,
      lessons,
      totalCount,
      hasMore: totalCount > (skip || 0) + lessons.length
    });

  } catch (error) {
    console.error('❌ Error filtering lessons:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ==========================================
// 📍 SPECIFIC RETRIEVAL ROUTES
// ==========================================

// ✅ Get Lessons by Topic ID (CRITICAL: Must come before /:id)
router.get('/topic/:topicId', validateObjectId, async (req, res) => {
  
  try {
    if (getLessonsByTopic && typeof getLessonsByTopic === 'function') {
      await getLessonsByTopic(req, res);
    } else {
      await fallbackGetLessonsByTopic(req, res);
    }
  } catch (error) {
    console.error('❌ Error in topic lessons route:', error);
    try {
      await fallbackGetLessonsByTopic(req, res);
    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch lessons for topic',
        details: process.env.NODE_ENV === 'development' ? fallbackError.message : 'Please try again'
      });
    }
  }
});

// ✅ Get Lesson by Subject & Name
router.get('/by-name', async (req, res) => {
  const { subject, name } = req.query;
  if (!subject || !name) {
    return res.status(400).json({ 
      success: false,
      message: '❌ Missing subject or lesson name' 
    });
  }

  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const lessons = await Lesson.find({ 
      subject, 
      lessonName: name,
      isActive: true 
    }).populate('topicId', 'name description');
    
    if (!lessons.length) {
      return res.status(404).json({ 
        success: false,
        message: '❌ Lesson not found' 
      });
    }
    
    res.status(200).json({
      success: true,
      lesson: lessons[0]
    });
  } catch (error) {
    console.error('❌ Error fetching lesson by name:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error fetching lesson', 
      error: error.message 
    });
  }
});

// ✅ Get Lessons by Subject
router.get('/subject/:subject', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { subject } = req.params;
    const { level, type, includeStats } = req.query;
    
    
    const filter = { subject, isActive: true };
    if (level) filter.level = parseInt(level);
    if (type) filter.type = type;

    const lessons = await Lesson.find(filter)
      .populate('topicId', 'name description')
      .sort({ level: 1, createdAt: 1 });
    
    
    const response = { 
      success: true,
      lessons 
    };
    
    if (includeStats === 'true') {
      response.stats = {
        total: lessons.length,
        byLevel: lessons.reduce((acc, lesson) => {
          acc[lesson.level] = (acc[lesson.level] || 0) + 1;
          return acc;
        }, {}),
        byType: lessons.reduce((acc, lesson) => {
          acc[lesson.type] = (acc[lesson.type] || 0) + 1;
          return acc;
        }, {})
      };
    }
    
    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Error fetching lessons by subject:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error fetching lessons by subject', 
      error: error.message 
    });
  }
});

// ==========================================
// 🛠️ LESSON MANAGEMENT ROUTES
// ==========================================

// ✅ Duplicate Lesson
router.post('/:id/duplicate', verifyToken, validateObjectId, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const originalLesson = await Lesson.findById(req.params.id);
    if (!originalLesson) {
      return res.status(404).json({ 
        success: false,
        message: '❌ Lesson not found' 
      });
    }

    const duplicatedLesson = new Lesson({
      ...originalLesson.toObject(),
      _id: undefined,
      lessonName: `${originalLesson.lessonName} (Copy)`,
      isDraft: true,
      isActive: false,
      createdAt: undefined,
      updatedAt: undefined,
      stats: {
        viewCount: 0,
        completionRate: 0,
        averageRating: 0,
        totalRatings: 0
      }
    });

    await duplicatedLesson.save();
    
    (`📋 Duplicated lesson: ${originalLesson.lessonName}`);
    res.status(201).json({
      success: true,
      lesson: duplicatedLesson
    });

  } catch (error) {
    console.error('❌ Error duplicating lesson:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Failed to duplicate lesson', 
      error: error.message 
    });
  }
});

// ✅ Toggle Lesson Status
router.patch('/:id/status', verifyToken, validateObjectId, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { isActive, isDraft } = req.body;
    
    const updateData = {};
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (typeof isDraft === 'boolean') updateData.isDraft = isDraft;
    
    // If publishing (not draft and active), set published date
    if (isDraft === false && isActive !== false) {
      updateData.publishedAt = new Date();
    }

    const lesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!lesson) {
      return res.status(404).json({ 
        success: false,
        message: '❌ Lesson not found' 
      });
    }

    res.json({
      success: true,
      lesson
    });

  } catch (error) {
    console.error('❌ Error updating lesson status:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Failed to update status', 
      error: error.message 
    });
  }
});

// ✅ Validate lesson data
router.post('/validate', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const lessonData = req.body;
    
    // Create a new lesson instance for validation without saving
    const lesson = new Lesson(lessonData);
    
    try {
      await lesson.validate();
      res.json({
        success: true,
        message: '✅ Lesson data is valid',
        isValid: true
      });
    } catch (validationError) {
      const errors = Object.values(validationError.errors).map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      
      res.status(400).json({
        success: false,
        message: '❌ Validation failed',
        isValid: false,
        errors: errors
      });
    }

  } catch (error) {
    console.error('❌ Error validating lesson:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ Batch update lessons
router.patch('/batch', verifyToken, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { lessonIds, updates } = req.body;
    
    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'lessonIds array is required'
      });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'updates object is required'
      });
    }

    // Add updated timestamp
    updates.updatedAt = new Date();

    const result = await Lesson.updateMany(
      { _id: { $in: lessonIds } },
      updates
    );


    res.json({
      success: true,
      message: `✅ Updated ${result.modifiedCount} lessons`,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });

  } catch (error) {
    console.error('❌ Error batch updating lessons:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ==========================================
// 📤 IMPORT/EXPORT ROUTES
// ==========================================

// ✅ Bulk Create Lessons
router.post('/bulk', verifyToken, (req, res) => {
  if (bulkCreateLessons) {
    bulkCreateLessons(req, res);
  } else {
    res.status(501).json({
      success: false,
      message: 'Bulk create not available - controller not loaded'
    });
  }
});

// ✅ Export Lessons (for backup/migration)
router.get('/export/json', verifyToken, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { subject, level, type } = req.query;
    
    const filter = {};
    if (subject) filter.subject = subject;
    if (level) filter.level = parseInt(level);
    if (type) filter.type = type;

    const lessons = await Lesson.find(filter)
      .populate('topicId', 'name description')
      .lean();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=lessons-export.json');
    res.json({
      success: true,
      exportDate: new Date().toISOString(),
      totalLessons: lessons.length,
      filters: filter,
      lessons
    });

  } catch (error) {
    console.error('❌ Error exporting lessons:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Export failed', 
      error: error.message 
    });
  }
});

// ==========================================
// 📝 MAIN CRUD ROUTES (Order is critical!)
// ==========================================

// ✅ GET: All Lessons (Enhanced)
router.get('/', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { 
      type, 
      subject, 
      level, 
      isActive, 
      isDraft,
      populate = 'false',
      sort = 'createdAt',
      order = 'desc'
    } = req.query;
    
    // Build filter
    const filter = {};
    if (type) filter.type = type;
    if (subject) filter.subject = subject;
    if (level) filter.level = parseInt(level);
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (isDraft !== undefined) filter.isDraft = isDraft === 'true';

    let query = Lesson.find(filter);
    
    // Add population if requested
    if (populate === 'true' && Topic) {
      query = query.populate('topicId', 'name description');
    }
    
    // Add sorting
    const sortOrder = order === 'desc' ? -1 : 1;
    query = query.sort({ [sort]: sortOrder });

    const lessons = await query.lean();
    
    res.status(200).json(lessons);

  } catch (error) {
    console.error('❌ Failed to fetch all lessons:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error fetching lessons', 
      error: error.message 
    });
  }
});

// ✅ POST: New Lesson (Enhanced with fallback)
router.post('/', verifyToken, (req, res) => {
  
  if (addLesson) {
    try {
      addLesson(req, res);
    } catch (controllerError) {
      console.error('❌ Main controller failed:', controllerError);
      enhancedFallbackAddLesson(req, res);
    }
  } else {
    enhancedFallbackAddLesson(req, res);
  }
});

// ✅ GET: Lesson by ID (Enhanced with fallback) - MUST come after specific routes
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const lessonId = req.params.id;
    const lesson = await Lesson.findById(lessonId)
      .populate('topicId', 'name description subject level')
      .lean();

    if (!lesson) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Lesson not found' 
      });
    }

    // Increment view count
    await Lesson.findByIdAndUpdate(lessonId, { 
      $inc: { 'stats.viewCount': 1 } 
    });

    
    res.json({
      success: true,
      lesson,
      topic: lesson.topicId,
      stats: {
        totalSteps: lesson.steps?.length || 0,
        homeworkExercises: lesson.homework?.totalExercises || 0,
        viewCount: lesson.stats?.viewCount || 0
      }
    });

  } catch (error) {
    console.error('❌ Failed to retrieve lesson:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Failed to retrieve lesson',
      message: error.message
    });
  }
});

// ✅ PUT: Update Lesson (Enhanced with fallback)
router.put('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const lessonId = req.params.id;
    const updates = req.body;
    updates.updatedAt = new Date();

    const updatedLesson = await Lesson.findByIdAndUpdate(
      lessonId, 
      updates, 
      { 
        new: true, 
        runValidators: true,
        context: 'query'
      }
    ).populate('topicId', 'name description');

    if (!updatedLesson) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Lesson not found' 
      });
    }

    
    res.json({
      success: true,
      lesson: updatedLesson
    });

  } catch (error) {
    console.error('❌ Failed to update lesson:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        error: '❌ Validation failed',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: '❌ Update failed',
      message: error.message
    });
  }
});

// ✅ DELETE: One Lesson (Enhanced with fallback)
router.delete('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const lessonId = req.params.id;
    const deletedLesson = await Lesson.findByIdAndDelete(lessonId);
    
    if (!deletedLesson) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Lesson not found' 
      });
    }

    res.json({ 
      success: true,
      message: '✅ Lesson deleted successfully',
      deletedLesson: {
        id: deletedLesson._id,
        name: deletedLesson.lessonName,
        topic: deletedLesson.topic
      }
    });

  } catch (error) {
    console.error('❌ Failed to delete lesson:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Failed to delete lesson',
      message: error.message
    });
  }
});

// ✅ DELETE: All Lessons (Destructive operation - must come BEFORE /:id)
router.delete('/all', verifyToken, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const result = await Lesson.deleteMany({});
    res.status(200).json({ 
      success: true,
      message: `✅ Deleted ${result.deletedCount} lessons`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Error deleting all lessons:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error clearing lessons', 
      error: error.message 
    });
  }
});

// ✅ ENHANCED: Update lesson completion status after user completes
router.patch('/:id/mark-completed', verifyToken, validateObjectId, async (req, res) => {
  try {
    const lessonId = req.params.id;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    // Update lesson completion statistics
    await Lesson.findByIdAndUpdate(lessonId, {
      $inc: { 
        'stats.completions': 1,
        'stats.totalCompletions': 1
      },
      $set: {
        'stats.lastCompletedAt': new Date()
      }
    });
    
    
    res.json({
      success: true,
      message: 'Lesson completion recorded'
    });
    
  } catch (error) {
    console.error('❌ Error marking lesson as completed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record lesson completion',
      details: error.message
    });
  }
});

// ✅ NEW: Get user's lesson progress
router.get('/:id/progress/:userId', verifyToken, validateObjectId, async (req, res) => {
  try {
    const { id: lessonId, userId } = req.params;
    
    if (!UserProgress) {
      return res.status(500).json({
        success: false,
        error: 'UserProgress model not available'
      });
    }
    
    const progress = await UserProgress.findOne({ userId, lessonId });
    
    if (!progress) {
      return res.json({
        success: true,
        progress: null,
        message: 'No progress found for this lesson'
      });
    }
    
    res.json({
      success: true,
      progress: {
        completed: progress.completed,
        completedAt: progress.completedAt,
        stars: progress.stars,
        score: progress.score,
        currentStep: progress.currentStep || 0,
        totalSteps: progress.totalSteps || 0,
        progressPercent: progress.progressPercent || 0,
        timeSpent: progress.timeSpent || 0,
        mistakes: progress.mistakes || 0,
        lastAccessed: progress.updatedAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching lesson progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lesson progress',
      details: error.message
    });
  }
});

// ✅ CRITICAL: Ensure proper module export
module.exports = router;