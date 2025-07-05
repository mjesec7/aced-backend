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

    // ✅ Process enhanced steps with validation
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
 * Process lesson steps with enhanced validation and structure.
 */
async function processLessonSteps(steps) {
  if (!Array.isArray(steps)) return [];
  
  const validStepTypes = [
    'explanation', 'example', 'practice', 'exercise', 
    'vocabulary', 'quiz', 'video', 'audio', 
    'reading', 'writing'
  ];
  
  return steps.map((step, index) => {
    // If step.data exists, use it as the payload; otherwise use step directly.
    const stepPayload = step.data ? step.data : step;
    const { type, ...rest } = step;
    
    if (!type || !validStepTypes.includes(type)) {
      throw new Error(`Invalid step type at position ${index + 1}: ${type}`);
    }
    
    let processedData;
    
    switch (type) {
      case 'explanation':
      case 'example':
      case 'reading': {
        // Check for content under "content", "explanation", or "text" from the payload.
        const rawContent = stepPayload.content || stepPayload.explanation || stepPayload.text || '';
        const content = rawContent != null ? String(rawContent) : '';
        processedData = {
          content: content,
          questions: stepPayload.questions || []
        };
        if (!processedData.content.trim()) {
          throw new Error(`${type} step at position ${index + 1} requires content`);
        }
        break;
      }
        
      case 'exercise':
        processedData = (stepPayload.exercises || []).filter(ex => 
          ex.question && ex.question.trim() && 
          (ex.answer || ex.correctAnswer) && (ex.answer || ex.correctAnswer).toString().trim()
        ).map(ex => ({
          question: ex.question.trim(),
          answer: ex.answer || ex.correctAnswer,
          correctAnswer: ex.correctAnswer || ex.answer,
          points: ex.points || 1,
          includeInHomework: Boolean(ex.includeInHomework)
        }));
        
        if (processedData.length === 0) {
          throw new Error(`Exercise step at position ${index + 1} requires at least one valid exercise`);
        }
        break;
        
      case 'vocabulary':
        processedData = (stepPayload.vocabulary || []).filter(vocab => 
          vocab.term && vocab.term.trim() && 
          vocab.definition && vocab.definition.trim()
        ).map(vocab => ({
          term: vocab.term.trim(),
          definition: vocab.definition.trim(),
          example: vocab.example?.trim() || ''
        }));
        
        if (processedData.length === 0) {
          throw new Error(`Vocabulary step at position ${index + 1} requires at least one vocabulary item`);
        }
        break;
        
      case 'quiz':
        processedData = (stepPayload.quizzes || []).filter(quiz => 
          quiz.question && quiz.question.trim() && 
          quiz.correctAnswer !== undefined && quiz.correctAnswer !== null
        ).map(quiz => ({
          question: quiz.question.trim(),
          type: quiz.type || 'multiple-choice',
          options: quiz.options || [],
          correctAnswer: quiz.correctAnswer,
          explanation: quiz.explanation || ''
        }));
        
        if (processedData.length === 0) {
          throw new Error(`Quiz step at position ${index + 1} requires at least one valid question`);
        }
        break;
        
      case 'video':
      case 'audio':
        processedData = {
          url: stepPayload.url || '',
          description: stepPayload.description || ''
        };
        if (!processedData.url.trim()) {
          throw new Error(`${type} step at position ${index + 1} requires a URL`);
        }
        break;
        
      case 'practice':
        processedData = {
          instructions: stepPayload.instructions || '',
          type: stepPayload.practiceType || 'guided'
        };
        if (!processedData.instructions.trim()) {
          throw new Error(`Practice step at position ${index + 1} requires instructions`);
        }
        break;
        
      case 'writing':
        processedData = {
          prompt: stepPayload.prompt || '',
          wordLimit: stepPayload.wordLimit || 100
        };
        if (!processedData.prompt.trim()) {
          throw new Error(`Writing step at position ${index + 1} requires a prompt`);
        }
        break;
        
      default:
        processedData = stepPayload;
    }
    
    return { type, data: processedData };
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
  
  steps.forEach(step => {
    if (step.type === 'exercise' && step.exercises) {
      step.exercises.forEach(exercise => {
        if (exercise.includeInHomework && exercise.question && (exercise.answer || exercise.correctAnswer)) {
          exercises.push({
            question: exercise.question,
            correctAnswer: exercise.answer || exercise.correctAnswer,
            points: exercise.points || 1,
            type: 'short-answer'
          });
        }
      });
    }
    
    if (step.type === 'quiz' && step.quizzes) {
      step.quizzes.forEach(quiz => {
        quizzes.push({
          question: quiz.question,
          type: quiz.type || 'multiple-choice',
          options: quiz.options || [],
          correctAnswer: quiz.correctAnswer,
          points: 1
        });
      });
    }
  });
  
  return { exercises, quizzes };
}

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