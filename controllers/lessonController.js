// Enhanced lesson controller for step-by-step methodology
// Replace or update your existing lessonController.js

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

// ✅ Helper Functions

/**
 * Process lesson steps with enhanced validation and default values.
 */
async function processLessonSteps(steps) {
  if (!Array.isArray(steps)) return [];
  
  const validStepTypes = [
    'explanation', 'example', 'practice', 'exercise', 
    'vocabulary', 'quiz', 'video', 'audio', 
    'reading', 'writing'
  ];
  
  return steps.map((step, index) => {
    const stepType = step.type;
    
    if (!stepType || !validStepTypes.includes(stepType)) {
      console.warn(`⚠️ Invalid or missing step type at position ${index + 1}. Defaulting to 'explanation'.`);
      step.type = 'explanation';
    }
    
    let processedData;
    
    switch (stepType) {
      case 'explanation':
      case 'example':
      case 'reading': {
        // ✅ FIXED: Handle both direct content and nested data structure
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
          content = `No content provided for ${stepType} step at position ${index + 1}.`;
          console.warn(`⚠️ ${content}`);
        }
        
        processedData = {
          content: content,
          questions: step.questions || step.data?.questions || []
        };
        break;
      }
        
      case 'exercise': {
        // ✅ FIXED: Handle multiple possible data structures for exercises
        let exercises = [];
        
        // Check various possible locations for exercise data
        if (step.exercises && Array.isArray(step.exercises)) {
          exercises = step.exercises;
        } else if (step.data && Array.isArray(step.data)) {
          exercises = step.data;
        } else if (step.data && step.data.exercises && Array.isArray(step.data.exercises)) {
          exercises = step.data.exercises;
        } else if (Array.isArray(step)) {
          exercises = step;
        }
        
        // Filter and validate exercises
        exercises = exercises.filter(ex => {
          const hasQuestion = ex.question && ex.question.trim();
          const hasAnswer = (ex.answer || ex.correctAnswer) && 
                           (ex.answer || ex.correctAnswer).toString().trim();
          return hasQuestion && hasAnswer;
        });
        
        if (exercises.length === 0) {
          console.warn(`⚠️ No valid exercises provided for exercise step at position ${index + 1}. Using default exercise.`);
          exercises = [{
            type: 'short-answer',
            question: "Default exercise question",
            answer: "Default answer",
            correctAnswer: "Default answer",
            points: 1,
            includeInHomework: false,
            instruction: '',
            hint: '',
            explanation: ''
          }];
        } else {
          // ✅ FIXED: Process exercises with all possible fields
          exercises = exercises.map(ex => {
            const processedEx = {
              type: ex.type || 'short-answer',
              question: ex.question.trim(),
              answer: ex.answer || ex.correctAnswer,
              correctAnswer: ex.correctAnswer || ex.answer,
              points: ex.points || 1,
              includeInHomework: Boolean(ex.includeInHomework),
              instruction: ex.instruction || '',
              hint: ex.hint || '',
              explanation: ex.explanation || ''
            };
            
            // ✅ Handle different exercise types with their specific fields
            switch (ex.type) {
              case 'abc':
              case 'multiple-choice':
                processedEx.options = ex.options || [];
                break;
              case 'fill-blank':
                processedEx.template = ex.template || '';
                processedEx.blanks = ex.blanks || [];
                break;
              case 'matching':
                processedEx.pairs = ex.pairs || [];
                break;
              case 'ordering':
                processedEx.items = ex.items || [];
                break;
              case 'true-false':
                processedEx.statement = ex.statement || ex.question;
                break;
              case 'drag-drop':
                processedEx.dragItems = ex.dragItems || [];
                processedEx.dropZones = ex.dropZones || [];
                break;
            }
            
            return processedEx;
          });
        }
        
        processedData = exercises;
        break;
      }
        
      case 'practice': {
        // ✅ FIXED: Handle practice step data structure
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
          console.warn(`⚠️ Practice step at position ${index + 1} missing instructions. Using default instructions.`);
          instructions = "No instructions provided.";
        }
        
        processedData = {
          instructions: instructions,
          type: practiceType
        };
        break;
      }
        
      case 'vocabulary': {
        // ✅ FIXED: Handle vocabulary data structure
        let vocabularyItems = [];
        
        // Check various possible locations for vocabulary data
        if (step.vocabulary && Array.isArray(step.vocabulary)) {
          vocabularyItems = step.vocabulary;
        } else if (step.data && Array.isArray(step.data)) {
          vocabularyItems = step.data;
        } else if (step.data && step.data.vocabulary && Array.isArray(step.data.vocabulary)) {
          vocabularyItems = step.data.vocabulary;
        } else if (Array.isArray(step)) {
          vocabularyItems = step;
        }
        
        // Filter and validate vocabulary items
        vocabularyItems = vocabularyItems.filter(vocab => 
          vocab.term && vocab.term.trim() && 
          vocab.definition && vocab.definition.trim()
        );
        
        if (vocabularyItems.length === 0) {
          console.warn(`⚠️ No vocabulary items provided for vocabulary step at position ${index + 1}. Using default vocabulary item.`);
          vocabularyItems = [{
            term: "Default Term",
            definition: "Default Definition",
            example: ""
          }];
        } else {
          vocabularyItems = vocabularyItems.map(vocab => ({
            term: vocab.term.trim(),
            definition: vocab.definition.trim(),
            example: vocab.example ? String(vocab.example).trim() : ''
          }));
        }
        
        processedData = vocabularyItems;
        break;
      }
        
      case 'quiz': {
        // ✅ FIXED: Handle quiz data structure
        let quizzes = [];
        
        // Check various possible locations for quiz data
        if (step.quizzes && Array.isArray(step.quizzes)) {
          quizzes = step.quizzes;
        } else if (step.data && Array.isArray(step.data)) {
          quizzes = step.data;
        } else if (step.data && step.data.quizzes && Array.isArray(step.data.quizzes)) {
          quizzes = step.data.quizzes;
        } else if (Array.isArray(step)) {
          quizzes = step;
        }
        
        // Filter and validate quiz questions
        quizzes = quizzes.filter(quiz => 
          quiz.question && quiz.question.trim() && 
          quiz.correctAnswer !== undefined && quiz.correctAnswer !== null
        );
        
        if (quizzes.length === 0) {
          console.warn(`⚠️ No valid quiz questions provided for quiz step at position ${index + 1}. Using default quiz question.`);
          quizzes = [{
            question: "Default quiz question",
            type: "multiple-choice",
            options: [{ text: "Option 1" }, { text: "Option 2" }],
            correctAnswer: 0,
            explanation: "Default explanation"
          }];
        } else {
          quizzes = quizzes.map(quiz => ({
            question: quiz.question.trim(),
            type: quiz.type || 'multiple-choice',
            options: quiz.options || [],
            correctAnswer: quiz.correctAnswer,
            explanation: quiz.explanation || ''
          }));
        }
        
        processedData = quizzes;
        break;
      }
        
      case 'video':
      case 'audio': {
        // ✅ FIXED: Handle media step data structure
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
          console.warn(`⚠️ ${stepType} step at position ${index + 1} missing URL. Using default URL.`);
          url = "https://example.com/default-media";
        }
        
        processedData = {
          url: url,
          description: description
        };
        break;
      }
        
      case 'writing': {
        // ✅ FIXED: Handle writing step data structure
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
          console.warn(`⚠️ Writing step at position ${index + 1} missing prompt. Using default prompt.`);
          prompt = "No writing prompt provided.";
        }
        
        processedData = {
          prompt: prompt,
          wordLimit: wordLimit
        };
        break;
      }
        
      default:
        // ✅ Handle unknown step types
        console.warn(`⚠️ Unknown step type: ${stepType}. Using raw data.`);
        processedData = step.data || step.content || step || {};
    }
    
    // ✅ FIXED: Always return proper structure
    return { 
      type: stepType, 
      data: processedData 
    };
  });
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
 * ✅ FIXED: Enhanced validation with better error messages
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

  // ✅ FIXED: Enhanced step validation
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

    // ✅ FIXED: Type-specific validation with multiple data structure support
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
  getLessonsByTopic: exports.getLessonsByTopic
};