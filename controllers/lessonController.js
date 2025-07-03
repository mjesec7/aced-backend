const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const mongoose = require('mongoose');

// ✅ Enhanced lesson creation with new step types
exports.addLesson = async (req, res) => {
  try {
    console.log('📥 [Добавление урока] Получены данные:', req.body);

    let {
      subject,
      level,
      topicId,
      topic,
      topicDescription,
      lessonName,
      explanation,
      explanations,
      examples,
      content,
      hint,
      steps,
      quizzes,
      abcExercises,
      homeworkABC,
      homeworkQA,
      relatedSubjects,
      type,
      description,
      translations,
      metadata,
      isDraft
    } = req.body;

    // ✅ Enhanced validation
    if (!subject || !level || !lessonName || !description) {
      return res.status(400).json({ 
        error: '❌ Required fields missing: subject, level, lessonName, description' 
      });
    }

    // ✅ Enhanced topic resolution
    let resolvedTopic = null;
    if (topicId && mongoose.Types.ObjectId.isValid(topicId)) {
      resolvedTopic = await Topic.findById(topicId);
      if (!resolvedTopic) {
        return res.status(404).json({ error: '❌ Topic not found with provided ID' });
      }
    } else {
      const topicName = typeof topic === 'string' ? topic.trim() : '';
      const topicDesc = typeof topicDescription === 'string' ? topicDescription.trim() : '';

      if (!topicName) {
        return res.status(400).json({ error: '❌ Topic name is required' });
      }

      resolvedTopic = await Topic.findOne({ subject, level, name: topicName });
      if (!resolvedTopic) {
        resolvedTopic = new Topic({ 
          name: topicName, 
          subject, 
          level, 
          description: topicDesc 
        });
        await resolvedTopic.save();
        console.log(`✅ [Topic Created] "${resolvedTopic.name}" (ID: ${resolvedTopic._id})`);
      } else {
        console.log(`ℹ️ [Existing Topic] ${resolvedTopic.name} (ID: ${resolvedTopic._id})`);
      }
    }

    // ✅ Process enhanced steps
    const processedSteps = processLessonSteps(steps || []);
    
    // ✅ Legacy support: convert old explanations to new step format
    const legacyExplanations = explanations || (explanation ? [explanation] : []);
    legacyExplanations.forEach(exp => {
      if (exp && exp.trim()) {
        processedSteps.unshift({
          type: 'explanation',
          data: { content: exp.trim() }
        });
      }
    });

    // ✅ Ensure at least one step exists
    if (processedSteps.length === 0) {
      processedSteps.push({
        type: 'explanation',
        data: { content: description }
      });
    }

    // ✅ Process homework
    const homework = processHomework(homeworkABC, homeworkQA, abcExercises);

    // ✅ Create enhanced lesson object
    const lessonData = {
      subject: String(subject).trim(),
      level: Number(level),
      topic: resolvedTopic.name,
      topicId: resolvedTopic._id,
      lessonName: String(lessonName).trim(),
      description: String(description).trim(),
      type: type || 'free',
      
      // Content fields
      explanations: legacyExplanations,
      examples: String(examples || '').trim(),
      content: String(content || '').trim(),
      hint: String(hint || '').trim(),
      
      // Enhanced features
      steps: processedSteps,
      homework: homework,
      relatedSubjects: Array.isArray(relatedSubjects) ? relatedSubjects : [],
      translations: typeof translations === 'object' ? translations : {},
      metadata: processMetadata(metadata),
      isDraft: Boolean(isDraft),
      isActive: !Boolean(isDraft)
    };

    console.log('📦 [Processing] Creating lesson with', processedSteps.length, 'steps');

    const newLesson = new Lesson(lessonData);
    await newLesson.save();

    console.log(`✅ [Success] Lesson created: "${newLesson.lessonName}" (ID: ${newLesson._id})`);
    
    // ✅ Return enhanced response
    const response = {
      lesson: newLesson,
      homework: newLesson.extractHomework(),
      stats: {
        totalSteps: newLesson.steps.length,
        homeworkExercises: newLesson.homeworkCount
      }
    };

    res.status(201).json(response);

  } catch (error) {
    console.error('❌ Error creating lesson:', error);
    
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

// ✅ Enhanced lesson update
exports.updateLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    if (!lessonId || !mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ error: '❌ Invalid lesson ID' });
    }

    const updates = req.body;
    
    // ✅ Process steps if provided
    if (updates.steps) {
      updates.steps = processLessonSteps(updates.steps);
    }
    
    // ✅ Process homework if provided
    if (updates.homeworkABC || updates.homeworkQA || updates.abcExercises) {
      updates.homework = processHomework(
        updates.homeworkABC, 
        updates.homeworkQA, 
        updates.abcExercises
      );
    }

    // ✅ Process metadata
    if (updates.metadata) {
      updates.metadata = processMetadata(updates.metadata);
    }

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

    console.log(`✅ [Update] "${updatedLesson.lessonName}" (ID: ${updatedLesson._id})`);
    res.json({
      lesson: updatedLesson,
      homework: updatedLesson.extractHomework(),
      stats: {
        totalSteps: updatedLesson.steps.length,
        homeworkExercises: updatedLesson.homeworkCount
      }
    });

  } catch (error) {
    console.error('❌ Error updating lesson:', error);
    
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

// ✅ Enhanced lesson retrieval with population
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
    
    res.json({
      lesson,
      stats: {
        totalSteps: lesson.steps?.length || 0,
        homeworkExercises: (lesson.homework?.exercises?.length || 0) + 
                          (lesson.homework?.quizzes?.length || 0)
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving lesson:', error);
    res.status(500).json({ 
      error: '❌ Failed to retrieve lesson',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again'
    });
  }
};

// ✅ Enhanced lessons by topic with filtering
exports.getLessonsByTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { type, level, includeStats } = req.query;

    if (!topicId || !mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({ error: '❌ Invalid topic ID' });
    }

    // ✅ Build filter
    const filter = { topicId, isActive: true };
    if (type) filter.type = type;
    if (level) filter.level = parseInt(level);

    const lessons = await Lesson.find(filter)
      .populate('topicId', 'name description')
      .sort({ createdAt: 1 })
      .lean();

    console.log(`📚 [Topic Query] Found ${lessons.length} lessons for topic: ${topicId}`);

    // ✅ Include stats if requested
    const response = {
      lessons,
      total: lessons.length
    };

    if (includeStats === 'true') {
      response.stats = {
        totalLessons: lessons.length,
        freeCount: lessons.filter(l => l.type === 'free').length,
        premiumCount: lessons.filter(l => l.type === 'premium').length,
        avgSteps: lessons.reduce((acc, l) => acc + (l.steps?.length || 0), 0) / lessons.length || 0
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

// ✅ Bulk lesson operations
exports.bulkCreateLessons = async (req, res) => {
  try {
    const { lessons } = req.body;
    
    if (!Array.isArray(lessons) || lessons.length === 0) {
      return res.status(400).json({ error: '❌ Lessons array is required' });
    }

    console.log(`📦 [Bulk Create] Processing ${lessons.length} lessons`);

    const results = [];
    const errors = [];

    for (let i = 0; i < lessons.length; i++) {
      try {
        const lessonData = lessons[i];
        
        // Process each lesson using the same logic as addLesson
        const processed = await processLessonForBulk(lessonData);
        const lesson = new Lesson(processed);
        await lesson.save();
        
        results.push({
          index: i,
          success: true,
          lesson: lesson._id,
          name: lesson.lessonName
        });
        
      } catch (error) {
        errors.push({
          index: i,
          success: false,
          error: error.message,
          lesson: lessons[i].lessonName || `Lesson ${i + 1}`
        });
      }
    }

    console.log(`✅ [Bulk Complete] ${results.length} successful, ${errors.length} failed`);

    res.status(201).json({
      success: true,
      total: lessons.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    });

  } catch (error) {
    console.error('❌ Bulk create error:', error);
    res.status(500).json({ 
      error: '❌ Bulk creation failed',
      message: error.message 
    });
  }
};

// ✅ Delete lesson (keep existing)
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
      message: '✅ Lesson deleted successfully',
      deletedLesson: {
        id: deletedLesson._id,
        name: deletedLesson.lessonName
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
 * Process lesson steps with validation
 */
function processLessonSteps(steps) {
  if (!Array.isArray(steps)) return [];
  
  return steps.map(step => {
    const { type, data } = step;
    
    // Validate step structure
    if (!type || !data) {
      throw new Error(`Invalid step structure: missing type or data`);
    }
    
    // Process data based on step type
    let processedData;
    
    switch (type) {
      case 'explanation':
      case 'example':
      case 'reading':
        processedData = {
          content: typeof data === 'string' ? data : data.content || '',
          questions: data.questions || []
        };
        break;
        
      case 'exercise':
        processedData = Array.isArray(data) ? data : [];
        break;
        
      case 'vocabulary':
        processedData = Array.isArray(data) ? data : [];
        break;
        
      case 'quiz':
        processedData = Array.isArray(data) ? data : [];
        break;
        
      case 'video':
      case 'audio':
        processedData = {
          url: data.url || '',
          description: data.description || ''
        };
        break;
        
      case 'practice':
        processedData = {
          instructions: data.instructions || '',
          type: data.type || 'guided'
        };
        break;
        
      case 'writing':
        processedData = {
          prompt: data.prompt || '',
          wordLimit: data.wordLimit || 100
        };
        break;
        
      default:
        processedData = data;
    }
    
    return { type, data: processedData };
  });
}

/**
 * Process homework from various sources
 */
function processHomework(homeworkABC, homeworkQA, abcExercises) {
  const exercises = [];
  const quizzes = [];
  
  // Process ABC exercises
  if (Array.isArray(homeworkABC)) {
    exercises.push(...homeworkABC);
  }
  if (Array.isArray(abcExercises)) {
    exercises.push(...abcExercises);
  }
  
  // Process QA exercises
  if (Array.isArray(homeworkQA)) {
    exercises.push(...homeworkQA);
  }
  
  return {
    exercises,
    quizzes,
    totalExercises: exercises.length + quizzes.length
  };
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
 * Process lesson for bulk creation
 */
async function processLessonForBulk(lessonData) {
  // Similar processing to addLesson but streamlined for bulk operations
  const {
    subject, level, topic, topicDescription, lessonName, description,
    steps, type, metadata, ...rest
  } = lessonData;
  
  // Find or create topic
  let resolvedTopic = await Topic.findOne({ subject, level, name: topic });
  if (!resolvedTopic) {
    resolvedTopic = new Topic({ 
      name: topic, 
      subject, 
      level, 
      description: topicDescription || '' 
    });
    await resolvedTopic.save();
  }
  
  return {
    subject,
    level: Number(level),
    topic: resolvedTopic.name,
    topicId: resolvedTopic._id,
    lessonName,
    description,
    type: type || 'free',
    steps: processLessonSteps(steps || []),
    metadata: processMetadata(metadata),
    isActive: true,
    isDraft: false,
    ...rest
  };
}

module.exports = {
  addLesson: exports.addLesson,
  updateLesson: exports.updateLesson,
  deleteLesson: exports.deleteLesson,
  getLesson: exports.getLesson,
  getLessonsByTopic: exports.getLessonsByTopic,
  bulkCreateLessons: exports.bulkCreateLessons
};