// lessonController.js - COMPLETE FIXED VERSION
// =============================================

const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const mongoose = require('mongoose');

// ✅ Enhanced lesson creation with topic-centric approach
exports.addLesson = async (req, res) => {
  try {
    console.log('📥 [Enhanced Lesson] Received data:', {
      subject: req.body.subject,
      level: req.body.level,
      topic: req.body.topic,
      lessonName: req.body.lessonName,
      stepsCount: req.body.steps?.length || 0
    });

    let {
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
      homeworkDueDate,
      relatedSubjects,
      translations,
      metadata,
      isDraft
    } = req.body;

    // ✅ Enhanced validation
    if (!subject || !level || !topic || !lessonName || !description) {
      return res.status(400).json({ 
        error: '❌ Required fields missing: subject, level, topic, lessonName, description' 
      });
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ 
        error: '❌ At least one lesson step is required' 
      });
    }

    // ✅ Enhanced topic resolution with better handling
    let resolvedTopic = null;
    const topicName = typeof topic === 'string' ? topic.trim() : '';
    const topicDesc = typeof topicDescription === 'string' ? topicDescription.trim() : '';

    if (!topicName) {
      return res.status(400).json({ error: '❌ Topic name is required' });
    }

    // Find existing topic or create new one
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
      console.log(`✅ [Topic Created] "${resolvedTopic.name}" (ID: ${resolvedTopic._id})`);
    } else {
      // Update description if provided and different
      if (topicDesc && topicDesc !== resolvedTopic.description) {
        resolvedTopic.description = topicDesc;
        await resolvedTopic.save();
        console.log(`🔄 [Topic Updated] Description for "${resolvedTopic.name}"`);
      }
      console.log(`ℹ️ [Existing Topic] ${resolvedTopic.name} (ID: ${resolvedTopic._id})`);
    }

    // ✅ Process enhanced steps with validation and defaults
    const processedSteps = await processLessonSteps(steps);
    console.log(`📝 [Steps Processed] ${processedSteps.length} steps validated and processed`);

    // ✅ Extract homework exercises if homework creation is enabled
    const homeworkData = processHomeworkFromSteps(steps, createHomework);
    console.log(`📝 [Homework] ${homeworkData.exercises.length} exercises extracted for homework`);

    // ✅ Create enhanced lesson object
    const lessonData = {
      subject: String(subject).trim(),
      level: Number(level),
      topic: resolvedTopic.name,
      topicId: resolvedTopic._id,
      lessonName: String(lessonName).trim(),
      description: String(description).trim(),
      type: type || 'free',
      
      // Enhanced step structure
      steps: processedSteps,
      
      // Legacy support for explanations
      explanations: extractExplanationsFromSteps(processedSteps),
      
      // Homework configuration
      homework: {
        exercises: homeworkData.exercises,
        quizzes: homeworkData.quizzes,
        totalExercises: homeworkData.exercises.length + homeworkData.quizzes.length
      },
      
      // Additional fields
      relatedSubjects: Array.isArray(relatedSubjects) ? relatedSubjects : [],
      translations: typeof translations === 'object' ? translations : {},
      metadata: processMetadata(metadata),
      
      // Status
      isDraft: Boolean(isDraft),
      isActive: !Boolean(isDraft),
      
      // Stats initialization
      stats: {
        viewCount: 0,
        completionRate: 0,
        averageRating: 0,
        totalRatings: 0
      }
    };

    console.log('📦 [Creating Lesson] Processing lesson with enhanced structure');

    const newLesson = new Lesson(lessonData);
    await newLesson.save();

    console.log(`✅ [Success] Enhanced lesson created: "${newLesson.lessonName}" (ID: ${newLesson._id})`);
    
    // ✅ Return enhanced response with homework info
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
        description: resolvedTopic.description,
        isNew: resolvedTopic.isNew || false
      },
      stats: {
        totalSteps: newLesson.steps.length,
        stepTypes: getStepTypesCount(newLesson.steps),
        homeworkExercises: homeworkData.exercises.length + homeworkData.quizzes.length,
        explanationSteps: newLesson.steps.filter(s => s.type === 'explanation').length,
        exerciseSteps: newLesson.steps.filter(s => s.type === 'exercise').length,
        vocabularySteps: newLesson.steps.filter(s => s.type === 'vocabulary').length,
        quizSteps: newLesson.steps.filter(s => s.type === 'quiz').length
      }
    };

    res.status(201).json(response);

  } catch (error) {
    console.error('❌ Enhanced lesson creation error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: '❌ Validation failed',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    
    if (error.code === 11000) {
      return res.status(409).json({ 
        error: '❌ Duplicate lesson: similar lesson already exists' 
      });
    }
    
    res.status(500).json({ 
      error: '❌ Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again'
    });
  }
};

// ✅ Enhanced lesson update with step validation
exports.updateLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    if (!lessonId || !mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ error: '❌ Invalid lesson ID' });
    }

    const updates = req.body;
    
    console.log('🔄 [Update] Processing lesson update for ID:', lessonId);
    
    // ✅ Process steps if provided
    if (updates.steps) {
      updates.steps = await processLessonSteps(updates.steps);
      console.log(`📝 [Steps Updated] ${updates.steps.length} steps processed`);
    }
    
    // ✅ Process homework if provided
    if (updates.steps) {
      const homeworkData = processHomeworkFromSteps(updates.steps, updates.createHomework);
      updates.homework = {
        exercises: homeworkData.exercises,
        quizzes: homeworkData.quizzes,
        totalExercises: homeworkData.exercises.length + homeworkData.quizzes.length
      };
      console.log(`📝 [Homework Updated] ${updates.homework.totalExercises} exercises processed`);
    }

    // ✅ Process metadata
    if (updates.metadata) {
      updates.metadata = processMetadata(updates.metadata);
    }

    // ✅ Update topic if needed
    if (updates.topic && updates.subject && updates.level) {
      let resolvedTopic = await Topic.findOne({ 
        subject: updates.subject, 
        level: updates.level, 
        name: updates.topic 
      });
      
      if (!resolvedTopic) {
        resolvedTopic = new Topic({ 
          name: updates.topic, 
          subject: updates.subject, 
          level: updates.level, 
          description: updates.topicDescription || '' 
        });
        await resolvedTopic.save();
        console.log(`✅ [Topic Created] "${resolvedTopic.name}" during lesson update`);
      }
      
      updates.topicId = resolvedTopic._id;
    }

    // ✅ Update timestamps
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
      return res.status(404).json({ error: '❌ Lesson not found' });
    }

    console.log(`✅ [Update Success] "${updatedLesson.lessonName}" (ID: ${updatedLesson._id})`);
    
    const response = {
      success: true,
      lesson: updatedLesson,
      homework: updatedLesson.homework,
      stats: {
        totalSteps: updatedLesson.steps.length,
        stepTypes: getStepTypesCount(updatedLesson.steps),
        homeworkExercises: updatedLesson.homework?.totalExercises || 0
      }
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Error updating enhanced lesson:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: '❌ Validation failed',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    
    res.status(500).json({ 
      error: '❌ Update failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again'
    });
  }
};

// ✅ Enhanced lesson retrieval with detailed stats
exports.getLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    if (!lessonId || !mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ error: '❌ Invalid lesson ID' });
    }

    const lesson = await Lesson.findById(lessonId)
      .populate('topicId', 'name description subject level')
      .lean();

    if (!lesson) {
      return res.status(404).json({ error: '❌ Lesson not found' });
    }

    // ✅ Increment view count
    await Lesson.findByIdAndUpdate(lessonId, { 
      $inc: { 'stats.viewCount': 1 } 
    });

    console.log(`📘 [Retrieved] "${lesson.lessonName}" (ID: ${lesson._id})`);
    
    const response = {
      success: true,
      lesson,
      topic: lesson.topicId,
      stats: {
        totalSteps: lesson.steps?.length || 0,
        stepTypes: getStepTypesCount(lesson.steps || []),
        homeworkExercises: lesson.homework?.totalExercises || 0,
        viewCount: lesson.stats?.viewCount || 0,
        completionRate: lesson.stats?.completionRate || 0,
        averageRating: lesson.stats?.averageRating || 0
      }
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Error retrieving enhanced lesson:', error);
    res.status(500).json({ 
      error: '❌ Failed to retrieve lesson',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again'
    });
  }
};

// ✅ Enhanced lessons by topic with detailed filtering
exports.getLessonsByTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { type, level, includeStats, sortBy, order } = req.query;

    if (!topicId || !mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ error: '❌ Invalid topic ID' });
    }

    // ✅ Build filter
    const filter = { topicId, isActive: true };
    if (type) filter.type = type;
    if (level) filter.level = parseInt(level);

    // ✅ Build sort options
    let sortOptions = { createdAt: 1 };
    if (sortBy) {
      const sortOrder = order === 'desc' ? -1 : 1;
      sortOptions = { [sortBy]: sortOrder };
    }

    const lessons = await Lesson.find(filter)
      .populate('topicId', 'name description')
      .sort(sortOptions)
      .lean();

    console.log(`📚 [Topic Query] Found ${lessons.length} lessons for topic: ${topicId}`);

    // ✅ Calculate detailed stats if requested
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
    console.error('❌ Error fetching lessons by topic:', error);
    res.status(500).json({ 
      error: '❌ Failed to fetch lessons',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again'
    });
  }
};

// ✅ Keep existing delete function
exports.deleteLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    if (!lessonId || !mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ error: '❌ Invalid lesson ID' });
    }

    const deletedLesson = await Lesson.findByIdAndDelete(lessonId);
    if (!deletedLesson) {
      return res.status(404).json({ error: '❌ Lesson not found' });
    }

    console.log(`🗑️ [Delete] "${deletedLesson.lessonName}" (ID: ${deletedLesson._id})`);
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
    console.error('❌ Error deleting lesson:', error);
    res.status(500).json({ 
      error: '❌ Failed to delete lesson',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again'
    });
  }
};

// ✅ CRITICAL FIXES for processLessonSteps - COMPLETE REWRITE

/**
 * ✅ ENHANCED: Process lesson steps with comprehensive validation and debugging
 */
async function processLessonSteps(steps) {
  if (!Array.isArray(steps)) {
    console.warn('⚠️ processLessonSteps: Steps is not an array:', typeof steps);
    return [];
  }
  
  console.log(`🔍 Processing ${steps.length} lesson steps...`);
  
  const validStepTypes = [
    'explanation', 'example', 'practice', 'exercise', 
    'vocabulary', 'quiz', 'video', 'audio', 
    'reading', 'writing'
  ];
  
  const processedSteps = [];
  
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    
    console.log(`\n📝 Processing step ${index + 1}/${steps.length}:`, {
      type: step.type,
      hasData: !!step.data,
      dataType: typeof step.data,
      isDataArray: Array.isArray(step.data),
      dataKeys: step.data ? Object.keys(step.data) : []
    });
    
    try {
      const stepType = step.type || 'explanation';
      
      if (!validStepTypes.includes(stepType)) {
        console.warn(`⚠️ Invalid step type: ${stepType}, defaulting to explanation`);
        step.type = 'explanation';
      }
      
      let processedData;
      
      switch (stepType) {
        case 'explanation':
        case 'example':
        case 'reading': {
          processedData = await processContentStep(step, index);
          break;
        }
          
        case 'exercise': {
          processedData = await processExerciseStep(step, index);
          break;
        }
          
        case 'practice': {
          processedData = await processPracticeStep(step, index);
          break;
        }
          
        case 'vocabulary': {
          processedData = await processVocabularyStep(step, index);
          break;
        }
          
        case 'quiz': {
          processedData = await processQuizStep(step, index);
          break;
        }
          
        case 'video':
        case 'audio': {
          processedData = await processMediaStep(step, index);
          break;
        }
          
        case 'writing': {
          processedData = await processWritingStep(step, index);
          break;
        }
          
        default:
          console.warn(`⚠️ Unknown step type: ${stepType}, using raw data`);
          processedData = step.data || step.content || {};
      }
      
      const finalStep = { 
        type: stepType, 
        data: processedData 
      };
      
      processedSteps.push(finalStep);
      
      console.log(`✅ Step ${index + 1} processed successfully:`, {
        type: finalStep.type,
        dataType: typeof finalStep.data,
        isArray: Array.isArray(finalStep.data),
        arrayLength: Array.isArray(finalStep.data) ? finalStep.data.length : 'N/A',
        hasRequiredFields: validateStepOutput(finalStep)
      });
      
    } catch (stepError) {
      console.error(`❌ Error processing step ${index + 1}:`, stepError);
      
      // Add error step instead of failing
      processedSteps.push({
        type: 'explanation',
        data: {
          content: `Error processing step ${index + 1}: ${stepError.message}`,
          error: true,
          originalType: step.type
        }
      });
    }
  }
  
  console.log(`✅ Completed processing ${processedSteps.length} steps`);
  return processedSteps;
}

/**
 * ✅ Process content steps (explanation, example, reading)
 */
async function processContentStep(step, index) {
  let content = '';
  
  if (typeof step.content === 'string') {
    content = step.content;
  } else if (step.data && typeof step.data.content === 'string') {
    content = step.data.content;
  } else if (step.data && typeof step.data === 'string') {
    content = step.data;
  } else if (typeof step === 'string') {
    content = step;
  }
  
  if (!content.trim()) {
    content = `Content for ${step.type} step ${index + 1} is not available.`;
    console.warn(`⚠️ Step ${index + 1}: No content found, using default`);
  }
  
  return {
    content: content.trim(),
    questions: step.questions || step.data?.questions || []
  };
}

/**
 * ✅ CRITICAL: Process exercise steps with comprehensive validation
 */
/**
 * ✅ CRITICAL: Process exercise steps with flexible, type-aware validation
 */
async function processExerciseStep(step, index) {
  console.log(`📝 Processing exercise step ${index + 1}...`);

  let exercises = [];

  if (step.exercises && Array.isArray(step.exercises)) {
    exercises = step.exercises;
    console.log(`  Found exercises in step.exercises: ${exercises.length}`);
  } else if (Array.isArray(step.data)) {
    exercises = step.data;
    console.log(`  Found exercises in step.data array: ${exercises.length}`);
  } else if (step.data && Array.isArray(step.data.exercises)) {
    exercises = step.data.exercises;
    console.log(`  Found exercises in step.data.exercises: ${exercises.length}`);
  } else if (step.data && step.data.question) {
    exercises = [step.data];
    console.log(`  Found single exercise in step.data`);
  } else if (step.question) {
    exercises = [step];
    console.log(`  Found single exercise directly on step`);
  } else {
    console.warn(`⚠️ No exercise data found in step ${index + 1}`);
  }

  const validatedExercises = [];

  for (let exIndex = 0; exIndex < exercises.length; exIndex++) {
    const exercise = exercises[exIndex];
    const exType = exercise.type || 'short-answer';
    const hasQuestion = exercise.question && String(exercise.question).trim();
    const hasAnswer = exercise.answer || exercise.correctAnswer;

    // ✅ Type-aware field validation
    const validByType = (() => {
      switch (exType) {
        case 'drag-drop':
          return Array.isArray(exercise.dragItems) && exercise.dragItems.length > 0 &&
                 Array.isArray(exercise.dropZones) && exercise.dropZones.length > 0;
        case 'matching':
          return Array.isArray(exercise.pairs) && exercise.pairs.length >= 2;
        case 'abc':
        case 'multiple-choice':
          return Array.isArray(exercise.options) && exercise.options.length >= 2 && hasAnswer;
        default:
          return hasAnswer;
      }
    })();

    if (!hasQuestion) {
      console.error(`❌ Exercise ${exIndex + 1} in step ${index + 1}: Missing question`);
      continue;
    }

    if (!validByType) {
      console.error(`❌ Exercise ${exIndex + 1} in step ${index + 1}: Required fields missing for type "${exType}"`);
      continue;
    }

    const validatedExercise = {
      id: exercise.id || `ex_${index}_${exIndex}`,
      type: exType,
      question: String(exercise.question).trim(),
      answer: String(exercise.answer || exercise.correctAnswer || '').trim(),
      correctAnswer: String(exercise.correctAnswer || exercise.answer || '').trim(),
      points: Number(exercise.points) || 1,
      includeInHomework: Boolean(exercise.includeInHomework),
      instruction: String(exercise.instruction || '').trim(),
      hint: String(exercise.hint || '').trim(),
      explanation: String(exercise.explanation || '').trim()
    };

    // ✅ Add type-specific fields
    switch (exType) {
      case 'abc':
      case 'multiple-choice':
        validatedExercise.options = Array.isArray(exercise.options)
          ? exercise.options.filter(opt => opt && String(opt).trim())
          : [];
        break;

      case 'fill-blank':
        validatedExercise.template = exercise.template || validatedExercise.question;
        validatedExercise.blanks = Array.isArray(exercise.blanks) ? exercise.blanks : [];
        break;

      case 'matching':
        validatedExercise.pairs = Array.isArray(exercise.pairs) ? exercise.pairs : [];
        break;

      case 'ordering':
        validatedExercise.items = Array.isArray(exercise.items) ? exercise.items : [];
        break;

      case 'true-false':
        validatedExercise.statement = exercise.statement || validatedExercise.question;
        validatedExercise.options = ['True', 'False'];
        validatedExercise.correctAnswer = typeof exercise.correctAnswer === 'boolean'
          ? (exercise.correctAnswer ? 0 : 1)
          : (String(exercise.correctAnswer).toLowerCase() === 'true' ? 0 : 1);
        break;

      case 'drag-drop':
        validatedExercise.dragItems = Array.isArray(exercise.dragItems) ? exercise.dragItems : [];
        validatedExercise.dropZones = Array.isArray(exercise.dropZones) ? exercise.dropZones : [];
        break;
    }

    validatedExercises.push(validatedExercise);
    console.log(`  ✅ Exercise ${exIndex + 1} validated successfully`);
  }

  // Fallback default if no valid exercises
  if (validatedExercises.length === 0) {
    console.warn(`⚠️ No valid exercises found in step ${index + 1}, adding default placeholder`);
    validatedExercises.push({
      id: `default_ex_${index}`,
      type: 'short-answer',
      question: "Placeholder question",
      answer: "Placeholder answer",
      correctAnswer: "Placeholder answer",
      points: 1,
      includeInHomework: false,
      instruction: '',
      hint: '',
      explanation: ''
    });
  }

  console.log(`✅ Exercise step ${index + 1} processed: ${validatedExercises.length} exercises`);
  return validatedExercises;
}


/**
 * ✅ CRITICAL: Process quiz steps with comprehensive validation
 */
async function processQuizStep(step, index) {
  console.log(`🧩 Processing quiz step ${index + 1}...`);
  console.log(`📊 Step data structure:`, {
    hasData: !!step.data,
    dataType: typeof step.data,
    isArray: Array.isArray(step.data),
    dataKeys: step.data ? Object.keys(step.data) : [],
    hasQuizzes: !!(step.quizzes),
    hasQuestion: !!(step.question)
  });
  
  let quizzes = [];
  
  // ✅ CRITICAL: Handle multiple data structures
  if (step.quizzes && Array.isArray(step.quizzes)) {
    quizzes = step.quizzes;
    console.log(`  Found quizzes in step.quizzes: ${quizzes.length}`);
  } else if (Array.isArray(step.data)) {
    quizzes = step.data;
    console.log(`  Found quizzes in step.data array: ${quizzes.length}`);
  } else if (step.data && Array.isArray(step.data.quizzes)) {
    quizzes = step.data.quizzes;
    console.log(`  Found quizzes in step.data.quizzes: ${quizzes.length}`);
  } else if (step.data && step.data.question) {
    // Single quiz object
    quizzes = [step.data];
    console.log(`  Found single quiz in step.data`);
  } else if (step.question) {
    // Quiz directly on step
    quizzes = [step];
    console.log(`  Found single quiz directly on step`);
  } else {
    console.warn(`⚠️ No quiz data found in step ${index + 1}`);
  }
  
  // ✅ CRITICAL: Validate and process each quiz
  const validatedQuizzes = [];
  
  for (let qIndex = 0; qIndex < quizzes.length; qIndex++) {
    const quiz = quizzes[qIndex];
    
    console.log(`  🔍 Validating quiz ${qIndex + 1}:`, {
      hasQuestion: !!quiz.question,
      questionType: typeof quiz.question,
      hasCorrectAnswer: quiz.correctAnswer !== undefined,
      correctAnswerType: typeof quiz.correctAnswer,
      type: quiz.type || 'multiple-choice',
      hasOptions: !!(quiz.options),
      optionsCount: Array.isArray(quiz.options) ? quiz.options.length : 0
    });
    
    // ✅ CRITICAL: Validate required fields
    if (!quiz.question || !String(quiz.question).trim()) {
      console.error(`❌ Quiz ${qIndex + 1} in step ${index + 1}: Missing or empty question`);
      console.error(`   Quiz object:`, quiz);
      continue;
    }
    
    if (quiz.correctAnswer === undefined || quiz.correctAnswer === null) {
      console.error(`❌ Quiz ${qIndex + 1} in step ${index + 1}: Missing correct answer`);
      console.error(`   Quiz object:`, quiz);
      continue;
    }
    
    // ✅ Create validated quiz object with all required fields
    const validatedQuiz = {
      id: quiz.id || `quiz_${index}_${qIndex}`,
      question: String(quiz.question).trim(),
      type: quiz.type || 'multiple-choice',
      correctAnswer: quiz.correctAnswer,
      explanation: String(quiz.explanation || '').trim(),
      points: Number(quiz.points) || 1
    };
    
    // ✅ CRITICAL: Process options based on quiz type
    if (validatedQuiz.type === 'multiple-choice') {
      if (Array.isArray(quiz.options) && quiz.options.length > 0) {
        validatedQuiz.options = quiz.options.map(opt => {
          if (typeof opt === 'string') {
            return { text: opt, value: opt };
          } else if (opt && opt.text) {
            return { text: opt.text, value: opt.value || opt.text };
          } else {
            return { text: String(opt), value: String(opt) };
          }
        }).filter(opt => opt.text && opt.text.trim());
        
        if (validatedQuiz.options.length === 0) {
          console.warn(`⚠️ Multiple choice quiz has no valid options, adding defaults`);
          validatedQuiz.options = [
            { text: 'Option A', value: 'A' },
            { text: 'Option B', value: 'B' },
            { text: 'Option C', value: 'C' }
          ];
        }
      } else {
        console.warn(`⚠️ Multiple choice quiz missing options, adding defaults`);
        validatedQuiz.options = [
          { text: 'Option A', value: 'A' },
          { text: 'Option B', value: 'B' },
          { text: 'Option C', value: 'C' }
        ];
      }
      
      // ✅ CRITICAL: Validate correct answer index
      if (typeof validatedQuiz.correctAnswer === 'number') {
        if (validatedQuiz.correctAnswer >= validatedQuiz.options.length || validatedQuiz.correctAnswer < 0) {
          console.warn(`⚠️ Correct answer index ${validatedQuiz.correctAnswer} out of bounds, defaulting to 0`);
          validatedQuiz.correctAnswer = 0;
        }
      } else if (typeof validatedQuiz.correctAnswer === 'string') {
        // Find the index of the correct answer in options
        const answerIndex = validatedQuiz.options.findIndex(opt => 
          opt.text.toLowerCase().trim() === validatedQuiz.correctAnswer.toLowerCase().trim() ||
          opt.value.toLowerCase().trim() === validatedQuiz.correctAnswer.toLowerCase().trim()
        );
        if (answerIndex >= 0) {
          validatedQuiz.correctAnswer = answerIndex;
        } else {
          console.warn(`⚠️ Correct answer "${validatedQuiz.correctAnswer}" not found in options`);
          validatedQuiz.correctAnswer = 0;
        }
      }
    } else if (validatedQuiz.type === 'true-false') {
      validatedQuiz.options = [
        { text: 'True', value: true },
        { text: 'False', value: false }
      ];
      
      // ✅ CRITICAL: Ensure correct answer is boolean or 0/1
      if (typeof validatedQuiz.correctAnswer === 'string') {
        validatedQuiz.correctAnswer = validatedQuiz.correctAnswer.toLowerCase() === 'true' ? 0 : 1;
      } else if (typeof validatedQuiz.correctAnswer === 'boolean') {
        validatedQuiz.correctAnswer = validatedQuiz.correctAnswer ? 0 : 1;
      } else if (typeof validatedQuiz.correctAnswer === 'number') {
        // Keep as is but ensure it's 0 or 1
        validatedQuiz.correctAnswer = validatedQuiz.correctAnswer ? 0 : 1;
      }
    }
    
    validatedQuizzes.push(validatedQuiz);
    console.log(`  ✅ Quiz ${qIndex + 1} validated successfully`);
  }
  
  // ✅ CRITICAL: Ensure we have at least one quiz
  if (validatedQuizzes.length === 0) {
    console.error(`❌ No valid quiz questions in step ${index + 1}, creating default quiz`);
    validatedQuizzes.push({
      id: `default_quiz_${index}`,
      question: "Sample quiz question - please update this content?",
      type: 'multiple-choice',
      options: [
        { text: 'Option A', value: 'A' },
        { text: 'Option B', value: 'B' },
        { text: 'Option C', value: 'C' }
      ],
      correctAnswer: 0,
      explanation: 'This is a placeholder quiz question. Please update with actual content.',
      points: 1
    });
  }
  
  console.log(`✅ Quiz step ${index + 1} processed: ${validatedQuizzes.length} quiz questions`);
  console.log(`📋 Final quiz structure:`, validatedQuizzes.map(quiz => ({
    question: quiz.question.substring(0, 50) + '...',
    type: quiz.type,
    correctAnswer: quiz.correctAnswer,
    optionsCount: quiz.options ? quiz.options.length : 0
  })));
  
  return validatedQuizzes;
}

/**
 * ✅ Process vocabulary steps
 */
async function processVocabularyStep(step, index) {
  console.log(`📚 Processing vocabulary step ${index + 1}...`);
  
  let vocabularyItems = [];
  
  if (step.vocabulary && Array.isArray(step.vocabulary)) {
    vocabularyItems = step.vocabulary;
  } else if (Array.isArray(step.data)) {
    vocabularyItems = step.data;
  } else if (step.data && Array.isArray(step.data.vocabulary)) {
    vocabularyItems = step.data.vocabulary;
  }
  
  const validatedVocabulary = vocabularyItems.filter(vocab => 
    vocab.term && vocab.term.trim() && 
    vocab.definition && vocab.definition.trim()
  ).map(vocab => ({
    term: String(vocab.term).trim(),
    definition: String(vocab.definition).trim(),
    example: vocab.example ? String(vocab.example).trim() : '',
    pronunciation: vocab.pronunciation || ''
  }));
  
  if (validatedVocabulary.length === 0) {
    console.warn(`⚠️ No vocabulary items in step ${index + 1}, creating default`);
    validatedVocabulary.push({
      term: "Sample Term",
      definition: "Sample definition for this term",
      example: "Example usage of the term in context",
      pronunciation: ""
    });
  }
  
  console.log(`✅ Vocabulary step ${index + 1} processed: ${validatedVocabulary.length} items`);
  
  return validatedVocabulary;
}

/**
 * ✅ Process practice steps
 */
async function processPracticeStep(step, index) {
  let instructions = '';
  let practiceType = 'guided';
  
  if (step.instructions) {
    instructions = step.instructions;
    practiceType = step.practiceType || 'guided';
  } else if (step.data) {
    if (typeof step.data === 'string') {
      instructions = step.data;
    } else if (step.data.instructions) {
      instructions = step.data.instructions;
      practiceType = step.data.type || step.data.practiceType || 'guided';
    }
  }
  
  if (!instructions.trim()) {
    console.warn(`⚠️ Practice step ${index + 1} missing instructions, using default`);
    instructions = "Practice instructions not provided.";
  }
  
  return {
    instructions: instructions.trim(),
    type: practiceType
  };
}

/**
 * ✅ Process media steps (video, audio)
 */
async function processMediaStep(step, index) {
  let url = '';
  let description = '';
  
  if (step.url) {
    url = step.url;
    description = step.description || '';
  } else if (step.data) {
    if (typeof step.data === 'string') {
      url = step.data;
    } else if (step.data.url) {
      url = step.data.url;
      description = step.data.description || '';
    }
  }
  
  if (!url.trim()) {
    console.warn(`⚠️ ${step.type} step ${index + 1} missing URL, using placeholder`);
    url = "https://example.com/media-placeholder";
  }
  
  return {
    url: url.trim(),
    description: description.trim()
  };
}

/**
 * ✅ Process writing steps
 */
async function processWritingStep(step, index) {
  let prompt = '';
  let wordLimit = 100;
  
  if (step.prompt) {
    prompt = step.prompt;
    wordLimit = step.wordLimit || 100;
  } else if (step.data) {
    if (typeof step.data === 'string') {
      prompt = step.data;
    } else if (step.data.prompt) {
      prompt = step.data.prompt;
      wordLimit = step.data.wordLimit || 100;
    }
  }
  
  if (!prompt.trim()) {
    console.warn(`⚠️ Writing step ${index + 1} missing prompt, using default`);
    prompt = "Writing prompt not provided.";
  }
  
  return {
    prompt: prompt.trim(),
    wordLimit: Number(wordLimit) || 100
  };
}

/**
 * ✅ Validate step output
 */
function validateStepOutput(step) {
  if (!step || !step.type || !step.data) {
    return false;
  }
  
  switch (step.type) {
    case 'exercise':
      return Array.isArray(step.data) && step.data.length > 0 && 
             step.data.every(ex => ex.question && ex.correctAnswer);
             
    case 'quiz':
      return Array.isArray(step.data) && step.data.length > 0 && 
             step.data.every(quiz => quiz.question && quiz.correctAnswer !== undefined);
             
    case 'vocabulary':
      return Array.isArray(step.data) && step.data.length > 0 && 
             step.data.every(vocab => vocab.term && vocab.definition);
             
    default:
      return true;
  }
}

/**
 * Process homework from lesson steps
 */
function processHomeworkFromSteps(steps, createHomework) {
  const exercises = [];
  const quizzes = [];
  
  if (!createHomework || !Array.isArray(steps)) {
    return { exercises, quizzes };
  }
  
  steps.forEach((step, stepIndex) => {
    try {
      if (step.type === 'exercise') {
        // ✅ Handle multiple possible data structures
        let exerciseData = [];
        
        if (step.exercises && Array.isArray(step.exercises)) {
          exerciseData = step.exercises;
        } else if (step.data && Array.isArray(step.data)) {
          exerciseData = step.data;
        } else if (step.data && step.data.exercises && Array.isArray(step.data.exercises)) {
          exerciseData = step.data.exercises;
        }
        
        exerciseData.forEach((exercise, exerciseIndex) => {
          if (exercise.includeInHomework && 
              exercise.question && 
              (exercise.answer || exercise.correctAnswer)) {
            
            const homeworkExercise = {
              question: exercise.question,
              answer: exercise.answer || exercise.correctAnswer,
              correctAnswer: exercise.correctAnswer || exercise.answer,
              points: exercise.points || 1,
              type: exercise.type || 'short-answer',
              instruction: exercise.instruction || '',
              hint: exercise.hint || '',
              explanation: exercise.explanation || ''
            };
            
            // ✅ Add type-specific fields for homework
            switch (exercise.type) {
              case 'abc':
              case 'multiple-choice':
                homeworkExercise.options = exercise.options || [];
                break;
              case 'fill-blank':
                homeworkExercise.template = exercise.template || '';
                homeworkExercise.blanks = exercise.blanks || [];
                break;
              case 'matching':
                homeworkExercise.pairs = exercise.pairs || [];
                break;
              case 'ordering':
                homeworkExercise.items = exercise.items || [];
                break;
              case 'true-false':
                homeworkExercise.statement = exercise.statement || exercise.question;
                break;
              case 'drag-drop':
                homeworkExercise.dragItems = exercise.dragItems || [];
                homeworkExercise.dropZones = exercise.dropZones || [];
                break;
            }
            
            exercises.push(homeworkExercise);
          }
        });
      }
      
      if (step.type === 'quiz') {
        // ✅ Handle quiz data for homework
        let quizData = [];
        
        if (step.quizzes && Array.isArray(step.quizzes)) {
          quizData = step.quizzes;
        } else if (step.data && Array.isArray(step.data)) {
          quizData = step.data;
        } else if (step.data && step.data.quizzes && Array.isArray(step.data.quizzes)) {
          quizData = step.data.quizzes;
        }
        
        quizData.forEach((quiz, quizIndex) => {
          if (quiz.question && quiz.correctAnswer !== undefined) {
            quizzes.push({
              question: quiz.question,
              type: quiz.type || 'multiple-choice',
              options: quiz.options || [],
              correctAnswer: quiz.correctAnswer,
              explanation: quiz.explanation || '',
              points: 1
            });
          }
        });
      }
    } catch (stepError) {
      console.warn(`⚠️ Error processing step ${stepIndex + 1} for homework:`, stepError.message);
    }
  });
  
  return { exercises, quizzes };
}

/**
 * ✅ ENHANCED: Enhanced validation with better error messages
 */
exports.validateLessonData = (lessonData) => {
  const errors = [];

  // Basic required fields
  if (!lessonData.subject || !lessonData.subject.trim()) {
    errors.push('Subject is required');
  }

  if (!lessonData.level || lessonData.level < 1 || lessonData.level > 12) {
    errors.push('Level must be between 1 and 12');
  }

  if (!lessonData.topic || !lessonData.topic.trim()) {
    errors.push('Topic name is required');
  }

  if (!lessonData.lessonName || !lessonData.lessonName.trim()) {
    errors.push('Lesson name is required');
  }

  if (!lessonData.description || !lessonData.description.trim()) {
    errors.push('Lesson description is required');
  }

  // Validate steps
  if (!lessonData.steps || lessonData.steps.length === 0) {
    errors.push('At least one lesson step is required');
  }

  // ✅ ENHANCED: Enhanced step validation
  lessonData.steps?.forEach((step, index) => {
    const stepNumber = index + 1;

    if (!step.type) {
      errors.push(`Step ${stepNumber}: Step type is required`);
      return;
    }

    const validTypes = ['explanation', 'example', 'practice', 'exercise', 'vocabulary', 'quiz', 'video', 'audio', 'reading', 'writing'];
    if (!validTypes.includes(step.type)) {
      errors.push(`Step ${stepNumber}: Invalid step type "${step.type}"`);
      return;
    }

    // ✅ ENHANCED: Type-specific validation with multiple data structure support
    try {
      switch (step.type) {
        case 'explanation':
        case 'example':
        case 'reading':
          const hasContent = step.content || 
                            (step.data && step.data.content) || 
                            (step.data && typeof step.data === 'string');
          if (!hasContent) {
            errors.push(`Step ${stepNumber}: Content is required for ${step.type} steps`);
          }
          break;

        case 'practice':
          const hasInstructions = step.instructions || 
                                 (step.data && step.data.instructions) ||
                                 (step.data && typeof step.data === 'string');
          if (!hasInstructions) {
            errors.push(`Step ${stepNumber}: Instructions are required for practice steps`);
          }
          break;

        case 'exercise':
          const exercises = step.exercises || 
                           (step.data && Array.isArray(step.data) ? step.data : null) ||
                           (step.data && step.data.exercises);
          
          if (!exercises || exercises.length === 0) {
            errors.push(`Step ${stepNumber}: At least one exercise is required for exercise steps`);
          } else {
            exercises.forEach((exercise, exIndex) => {
              if (!exercise.question || !exercise.question.trim()) {
                errors.push(`Step ${stepNumber}, Exercise ${exIndex + 1}: Question is required`);
              }
              if (!exercise.answer && !exercise.correctAnswer) {
                errors.push(`Step ${stepNumber}, Exercise ${exIndex + 1}: Answer is required`);
              }
            });
          }
          break;

        case 'vocabulary':
          const vocabulary = step.vocabulary || 
                            (step.data && Array.isArray(step.data) ? step.data : null) ||
                            (step.data && step.data.vocabulary);
          
          if (!vocabulary || vocabulary.length === 0) {
            errors.push(`Step ${stepNumber}: At least one vocabulary item is required for vocabulary steps`);
          } else {
            vocabulary.forEach((vocab, vocabIndex) => {
              if (!vocab.term || !vocab.term.trim()) {
                errors.push(`Step ${stepNumber}, Vocabulary ${vocabIndex + 1}: Term is required`);
              }
              if (!vocab.definition || !vocab.definition.trim()) {
                errors.push(`Step ${stepNumber}, Vocabulary ${vocabIndex + 1}: Definition is required`);
              }
            });
          }
          break;

        case 'quiz':
          const quizzes = step.quizzes || 
                         (step.data && Array.isArray(step.data) ? step.data : null) ||
                         (step.data && step.data.quizzes);
          
          if (!quizzes || quizzes.length === 0) {
            errors.push(`Step ${stepNumber}: At least one quiz question is required for quiz steps`);
          } else {
            quizzes.forEach((quiz, quizIndex) => {
              if (!quiz.question || !quiz.question.trim()) {
                errors.push(`Step ${stepNumber}, Quiz ${quizIndex + 1}: Question is required`);
              }
              if (quiz.correctAnswer === undefined || quiz.correctAnswer === null) {
                errors.push(`Step ${stepNumber}, Quiz ${quizIndex + 1}: Correct answer is required`);
              }
              if (quiz.type === 'multiple-choice' && (!quiz.options || quiz.options.length < 2)) {
                errors.push(`Step ${stepNumber}, Quiz ${quizIndex + 1}: Multiple choice questions need at least 2 options`);
              }
            });
          }
          break;

        case 'video':
        case 'audio':
          const hasUrl = step.url || 
                        (step.data && step.data.url) ||
                        (step.data && typeof step.data === 'string');
          if (!hasUrl) {
            errors.push(`Step ${stepNumber}: URL is required for ${step.type} steps`);
          }
          break;

        case 'writing':
          const hasPrompt = step.prompt || 
                           (step.data && step.data.prompt) ||
                           (step.data && typeof step.data === 'string');
          if (!hasPrompt) {
            errors.push(`Step ${stepNumber}: Writing prompt is required for writing steps`);
          }
          break;
      }
    } catch (validationError) {
      errors.push(`Step ${stepNumber}: Validation error - ${validationError.message}`);
    }
  });

  return errors;
};

/**
 * Extract explanations for legacy support
 */
function extractExplanationsFromSteps(steps) {
  return steps
    .filter(step => step.type === 'explanation')
    .map(step => step.data.content || '')
    .filter(content => content.trim() !== '');
}

/**
 * Process metadata with defaults
 */
function processMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {
      difficulty: 'beginner',
      estimatedDuration: 30,
      prerequisites: [],
      learningObjectives: []
    };
  }
  
  return {
    difficulty: metadata.difficulty || 'beginner',
    estimatedDuration: metadata.estimatedDuration || 30,
    prerequisites: Array.isArray(metadata.prerequisites) ? metadata.prerequisites : [],
    learningObjectives: Array.isArray(metadata.learningObjectives) ? metadata.learningObjectives : []
  };
}

/**
 * Get count of each step type
 */
function getStepTypesCount(steps) {
  const counts = {};
  steps.forEach(step => {
    counts[step.type] = (counts[step.type] || 0) + 1;
  });
  return counts;
}

module.exports = {
  addLesson: exports.addLesson,
  updateLesson: exports.updateLesson,
  deleteLesson: exports.deleteLesson,
  getLesson: exports.getLesson,
  getLessonsByTopic: exports.getLessonsByTopic,
  processLessonSteps,
  processContentStep,
  processExerciseStep,
  processQuizStep,
  processVocabularyStep,
  processPracticeStep,
  processMediaStep,
  processWritingStep,
  validateStepOutput
};