// controllers/lessonController.js - COMPLETE ENHANCED VERSION WITH AUTO-EXTRACTION
// =============================================

const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const Homework = require('../models/homework');
const Vocabulary = require('../models/vocabulary');
const HomeworkProgress = require('../models/homeworkProgress');
const VocabularyProgress = require('../models/vocabularyProgress');
const UserProgress = require('../models/userProgress');
const mongoose = require('mongoose');

// ✅ Enhanced lesson creation with topic-centric approach
exports.addLesson = async (req, res) => {
  try {


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
    } else {
      // Update description if provided and different
      if (topicDesc && topicDesc !== resolvedTopic.description) {
        resolvedTopic.description = topicDesc;
        await resolvedTopic.save();
      }
    }

    // ✅ Process enhanced steps with validation and defaults
    const processedSteps = await processLessonSteps(steps);

    // ✅ Extract homework exercises if homework creation is enabled
    const homeworkData = processHomeworkFromSteps(steps, createHomework);

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


    const newLesson = new Lesson(lessonData);
    await newLesson.save();

    
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

// ✅ NEW: Complete lesson and extract content
exports.completeLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    const { userId, progress, stars, score, timeSpent } = req.body;
    
    if (!lessonId || !mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Invalid lesson ID' 
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: '❌ User ID is required'
      });
    }

    
    // Get the lesson
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        error: '❌ Lesson not found'
      });
    }

    // Check if lesson was actually completed (not just partial progress)
    const completionThreshold = 80; // 80% completion required
    const currentStep = progress?.currentStep || 0;
    const totalSteps = lesson.steps.length;
    const completionPercentage = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
    
    if (completionPercentage < completionThreshold) {
      return res.status(400).json({
        success: false,
        error: `❌ Lesson not sufficiently completed (${Math.round(completionPercentage)}%). Minimum 80% required.`
      });
    }

    // Process lesson completion and extract content
    const extractionResult = await handleLessonCompletion(userId, lessonId, progress, lesson);
    
    // Update user progress
    const userProgress = await UserProgress.findOneAndUpdate(
      { userId, lessonId },
      {
        completed: true,
        completedAt: new Date(),
        stars: stars || 0,
        score: score || 0,
        timeSpent: timeSpent || 0,
        finalProgress: progress,
        homeworkGenerated: extractionResult.homeworkCreated,
        vocabularyExtracted: extractionResult.vocabularyAdded,
        extractionResults: extractionResult
      },
      { upsert: true, new: true }
    );

    // Update lesson completion stats
    await Lesson.findByIdAndUpdate(lessonId, {
      $inc: { 
        'stats.viewCount': 1,
        'stats.totalRatings': 1 
      },
      $set: {
        'stats.averageRating': stars || 0 // Simplified - you can make this more sophisticated
      }
    });
    
    
    res.json({
      success: true,
      message: '🎉 Lesson completed successfully!',
      data: {
        lessonCompleted: true,
        userProgress: {
          completed: true,
          stars: stars || 0,
          score: score || 0,
          completedAt: userProgress.completedAt
        },
        extraction: extractionResult,
        lesson: {
          id: lesson._id,
          name: lesson.lessonName,
          subject: lesson.subject,
          topic: lesson.topic
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error completing lesson:', error);
    res.status(500).json({
      success: false,
      error: '❌ Failed to complete lesson',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again'
    });
  }
};

// ✅ NEW: Handle lesson completion and extract content
const handleLessonCompletion = async (userId, lessonId, lessonProgress, lesson = null) => {
  try {
    
    // Get the completed lesson if not provided
    if (!lesson) {
      lesson = await Lesson.findById(lessonId);
      if (!lesson) {
        throw new Error('Lesson not found');
      }
    }

    const results = {
      homeworkCreated: false,
      vocabularyAdded: false,
      homeworkId: null,
      vocabularyCount: 0,
      message: ''
    };

    // 🔥 EXTRACT AND CREATE HOMEWORK
    const homeworkExercises = await extractHomeworkFromLesson(lesson);
    
    if (homeworkExercises.length > 0) {
      
      // Check if homework already exists for this lesson
      const existingHomework = await Homework.findOne({
        linkedLessonIds: lessonId,
        title: `Homework: ${lesson.lessonName}`
      });

      let homeworkId;
      
      if (!existingHomework) {
        // Create new standalone homework
        const homework = new Homework({
          title: `Homework: ${lesson.lessonName}`,
          subject: lesson.subject || 'General',
          level: getDifficultyFromLevel(lesson.level),
          description: `Homework exercises extracted from lesson: ${lesson.lessonName}`,
          instructions: `Complete these exercises based on what you learned in "${lesson.lessonName}"`,
          
          // Map lesson exercises to homework format
          exercises: homeworkExercises,
          
          linkedLessonIds: [lessonId],
          
          // Settings
          isActive: true,
          allowRetakes: true,
          showResults: true,
          showCorrectAnswers: true,
          
          // Auto-calculated
          totalPoints: homeworkExercises.reduce((sum, ex) => sum + (ex.points || 1), 0),
          estimatedDuration: Math.max(10, homeworkExercises.length * 2), // 2 min per exercise
          difficulty: lesson.metadata?.difficulty === 'advanced' ? 5 : 
                     lesson.metadata?.difficulty === 'intermediate' ? 3 : 1,
          
          category: lesson.topic || 'General',
          tags: [lesson.subject, lesson.topic, 'auto-generated'].filter(Boolean),
          
          createdBy: 'system',
          createdAt: new Date(),
          updatedAt: new Date()
        });

        await homework.save();
        homeworkId = homework._id;
        results.homeworkCreated = true;
        results.homeworkId = homeworkId;
        
      } else {
        homeworkId = existingHomework._id;
      }

      // Create user's homework progress entry (empty, ready to start)
      await HomeworkProgress.findOneAndUpdate(
        { userId, homeworkId },
        {
          userId,
          homeworkId,
          lessonId: null, // This is a standalone homework, not lesson-based
          answers: [], // Empty - user hasn't started yet
          completed: false,
          metadata: {
            type: 'standalone',
            autoGenerated: true,
            sourceLesson: {
              id: lessonId,
              name: lesson.lessonName,
              completedAt: new Date()
            }
          },
          createdAt: new Date(),
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    }

    // 🔥 EXTRACT AND ADD VOCABULARY
    const vocabularyWords = await extractVocabularyFromLesson(lesson, userId);
    
    if (vocabularyWords.length > 0) {
      
      // Add to user's vocabulary collection
      for (const vocabData of vocabularyWords) {
        // Check if word already exists
        const existingVocab = await Vocabulary.findOne({
          word: vocabData.word.toLowerCase(),
          language: vocabData.language,
          translationLanguage: 'russian'
        });

        let vocabularyId;
        
        if (!existingVocab) {
          // Create new vocabulary word
          const vocabulary = new Vocabulary(vocabData);
          await vocabulary.save();
          vocabularyId = vocabulary._id;
        } else {
          vocabularyId = existingVocab._id;
        }

        // Create/update user's vocabulary progress
        await VocabularyProgress.findOneAndUpdate(
          { userId, vocabularyId },
          {
            userId,
            vocabularyId,
            status: 'new', // User just learned this word
            firstSeen: new Date(),
            metadata: {
              sourceLesson: {
                id: lessonId,
                name: lesson.lessonName,
                completedAt: new Date()
              }
            },
            createdAt: new Date(),
            updatedAt: new Date()
          },
          { upsert: true, new: true }
        );

        results.vocabularyCount++;
      }
      
      results.vocabularyAdded = true;
    }

    // Create success message
    let message = 'Lesson completed successfully!';
    if (results.homeworkCreated) {
      message += ' Homework assignment created.';
    }
    if (results.vocabularyAdded) {
      message += ` ${results.vocabularyCount} words added to vocabulary.`;
    }
    results.message = message;

    
    return results;

  } catch (error) {
    console.error('❌ Error processing lesson completion:', error);
    return {
      success: false,
      error: error.message,
      homeworkCreated: false,
      vocabularyAdded: false,
      homeworkId: null,
      vocabularyCount: 0
    };
  }
};

// ✅ Extract homework exercises from lesson steps
const extractHomeworkFromLesson = async (lesson) => {
  const homeworkExercises = [];
  
  lesson.steps.forEach((step, stepIndex) => {
    if (step.type === 'exercise' && Array.isArray(step.data)) {
      step.data.forEach((exercise, exerciseIndex) => {
        // Only include exercises marked for homework
        if (exercise.includeInHomework) {
          const homeworkExercise = {
            _id: `ex_${lesson._id}_${stepIndex}_${exerciseIndex}_${Date.now()}`,
            type: exercise.type || 'multiple-choice',
            question: exercise.question,
            instruction: exercise.instruction || `From lesson: ${lesson.lessonName}`,
            correctAnswer: exercise.correctAnswer || exercise.answer,
            points: exercise.points || 1,
            difficulty: lesson.metadata?.difficulty === 'advanced' ? 5 : 
                       lesson.metadata?.difficulty === 'intermediate' ? 3 : 1,
            category: lesson.topic || 'General',
            tags: ['auto-generated', lesson.subject, lesson.topic].filter(Boolean),
            explanation: exercise.explanation || `This exercise is from the lesson: ${lesson.lessonName}`,
            
            // Type-specific fields
            options: exercise.options || [],
            template: exercise.template || '',
            blanks: exercise.blanks || [],
            pairs: exercise.pairs || [],
            items: exercise.items || [],
            statement: exercise.statement || exercise.question,
            dragItems: exercise.dragItems || [],
            dropZones: exercise.dropZones || []
          };
          
          homeworkExercises.push(homeworkExercise);
        }
      });
    }
    
    // Also include quiz questions as homework exercises
    if (step.type === 'quiz' && Array.isArray(step.data)) {
      step.data.forEach((quiz, quizIndex) => {
        const homeworkExercise = {
          _id: `quiz_${lesson._id}_${stepIndex}_${quizIndex}_${Date.now()}`,
          type: quiz.type || 'multiple-choice',
          question: quiz.question,
          instruction: `Quiz question from lesson: ${lesson.lessonName}`,
          correctAnswer: quiz.correctAnswer,
          points: 1,
          difficulty: lesson.metadata?.difficulty === 'advanced' ? 5 : 
                     lesson.metadata?.difficulty === 'intermediate' ? 3 : 1,
          category: lesson.topic || 'General',
          tags: ['auto-generated', 'quiz', lesson.subject].filter(Boolean),
          explanation: quiz.explanation || `This quiz question is from: ${lesson.lessonName}`,
          
          options: quiz.options || []
        };
        
        homeworkExercises.push(homeworkExercise);
      });
    }
  });
  
  return homeworkExercises;
};

// ✅ Extract vocabulary words from lesson steps
const extractVocabularyFromLesson = async (lesson, userId) => {
  const vocabularyWords = [];
  
  lesson.steps.forEach((step, stepIndex) => {
    if (step.type === 'vocabulary' && Array.isArray(step.data)) {
      step.data.forEach((vocabItem, vocabIndex) => {
        if (vocabItem.term && vocabItem.definition) {
          const vocabularyWord = {
            word: vocabItem.term.trim(),
            translation: vocabItem.definition.trim(),
            pronunciation: vocabItem.pronunciation || '',
            
            // Language detection (you can enhance this)
            language: detectLanguage(lesson.subject) || 'english',
            translationLanguage: 'russian',
            
            // Organization
            subject: lesson.subject,
            topic: lesson.topic || 'General',
            subtopic: lesson.lessonName,
            
            // Word details
            partOfSpeech: detectPartOfSpeech(vocabItem.term) || 'noun',
            difficulty: lesson.metadata?.difficulty || 'beginner',
            
            // Additional info
            definition: vocabItem.definition,
            examples: vocabItem.example ? [{
              sentence: vocabItem.example,
              translation: `Пример использования: ${vocabItem.term}`
            }] : [],
            
            // Metadata
            frequency: 1,
            importance: lesson.metadata?.difficulty === 'advanced' ? 5 : 
                       lesson.metadata?.difficulty === 'intermediate' ? 3 : 1,
            
            isActive: true,
            createdBy: userId,
            tags: ['auto-generated', lesson.subject, lesson.topic].filter(Boolean),
            
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          vocabularyWords.push(vocabularyWord);
        }
      });
    }
  });
  
  return vocabularyWords;
};

// ✅ NEW: Migrate content from completed lessons
exports.migrateContentFromCompletedLessons = async (req, res) => {
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
    
    let completedLessons;
    
    if (lessonIds && Array.isArray(lessonIds)) {
      // Extract from specific lessons
      completedLessons = await UserProgress.find({
        userId,
        lessonId: { $in: lessonIds },
        completed: true
      }).populate('lessonId');
    } else {
      // Extract from all completed lessons that haven't been processed
      completedLessons = await UserProgress.find({
        userId,
        completed: true,
        $or: [
          { homeworkGenerated: { $ne: true } },
          { vocabularyExtracted: { $ne: true } },
          { extractionResults: { $exists: false } }
        ]
      }).populate('lessonId');
    }
    
    
    const results = {
      processedLessons: 0,
      homeworkCreated: 0,
      vocabularyAdded: 0,
      totalVocabularyWords: 0,
      errors: [],
      processedLessonDetails: []
    };
    
    for (const progress of completedLessons) {
      if (!progress.lessonId) continue;
      
      try {
        const extractionResult = await handleLessonCompletion(
          userId, 
          progress.lessonId._id, 
          progress,
          progress.lessonId
        );
        
        if (extractionResult.homeworkCreated || extractionResult.vocabularyAdded) {
          results.processedLessons++;
          if (extractionResult.homeworkCreated) results.homeworkCreated++;
          if (extractionResult.vocabularyAdded) {
            results.vocabularyAdded++;
            results.totalVocabularyWords += extractionResult.vocabularyCount;
          }
          
          results.processedLessonDetails.push({
            lessonId: progress.lessonId._id,
            lessonName: progress.lessonId.lessonName,
            homeworkCreated: extractionResult.homeworkCreated,
            vocabularyWords: extractionResult.vocabularyCount
          });

          // Update the user progress to mark as processed
          await UserProgress.findByIdAndUpdate(progress._id, {
            homeworkGenerated: extractionResult.homeworkCreated,
            vocabularyExtracted: extractionResult.vocabularyAdded,
            extractionResults: extractionResult
          });
        }
      } catch (error) {
        results.errors.push({
          lessonId: progress.lessonId._id,
          lessonName: progress.lessonId.lessonName,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      data: results,
      message: `✅ Processed ${results.processedLessons} lessons. Created ${results.homeworkCreated} homework assignments and added ${results.totalVocabularyWords} vocabulary words.`
    });
    
  } catch (error) {
    console.error('❌ Error migrating content from completed lessons:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to migrate content from completed lessons',
      details: error.message
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
    
    
    // ✅ Process steps if provided
    if (updates.steps) {
      updates.steps = await processLessonSteps(updates.steps);
    }
    
    // ✅ Process homework if provided
    if (updates.steps) {
      const homeworkData = processHomeworkFromSteps(updates.steps, updates.createHomework);
      updates.homework = {
        exercises: homeworkData.exercises,
        quizzes: homeworkData.quizzes,
        totalExercises: homeworkData.exercises.length + homeworkData.quizzes.length
      };
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

// ✅ HELPER FUNCTIONS
async function processLessonSteps(steps) {
  if (!Array.isArray(steps)) {
    return [];
  }
  
  
  const validStepTypes = [
    'explanation', 'example', 'practice', 'exercise', 
    'vocabulary', 'quiz', 'video', 'audio', 
    'reading', 'writing'
  ];
  
  const processedSteps = [];
  
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    
    try {
      const stepType = step.type || 'explanation';
      
      if (!validStepTypes.includes(stepType)) {
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
          processedData = step.data || step.content || {};
      }
      
      const finalStep = { 
        type: stepType, 
        data: processedData 
      };
      
      processedSteps.push(finalStep);
      
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
  
  return processedSteps;
}

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
  }
  
  return {
    content: content.trim(),
    questions: step.questions || step.data?.questions || []
  };
}

// ✅ REPLACED: A much more robust function to process all exercise types.
async function processExerciseStep(step, index) {
  let exercises = [];

  if (step.exercises && Array.isArray(step.exercises)) {
    exercises = step.exercises;
  } else if (Array.isArray(step.data)) {
    exercises = step.data;
  } else if (step.data && Array.isArray(step.data.exercises)) {
    exercises = step.data.exercises;
  } else if (step.question) {
    exercises = [step];
  }

  const validatedExercises = exercises.map((exercise, exIndex) => {
    if (!exercise.question) return null;

    const validatedExercise = {
      id: exercise.id || `ex_${index}_${exIndex}`,
      type: exercise.type || 'short-answer',
      question: String(exercise.question).trim(),
      answer: String(exercise.answer || exercise.correctAnswer || '').trim(),
      correctAnswer: String(exercise.correctAnswer || exercise.answer || '').trim(),
      points: Number(exercise.points) || 1,
      includeInHomework: Boolean(exercise.includeInHomework),
      instruction: String(exercise.instruction || '').trim(),
      hint: String(exercise.hint || '').trim(),
      explanation: String(exercise.explanation || '').trim(),
      
      // Add all new potential fields
      options: exercise.options || [],
      template: exercise.template || '',
      blanks: exercise.blanks || [],
      pairs: exercise.pairs || [],
      items: exercise.items || [],
      statement: exercise.statement || '',
      dragItems: exercise.dragItems || [],
      dropZones: exercise.dropZones || [],
      correctSentence: exercise.correctSentence || ''
    };
    return validatedExercise;
  }).filter(Boolean); // Remove null entries

  return validatedExercises.length > 0 ? validatedExercises : [];
}

async function processQuizStep(step, index) {
  
  let quizzes = [];
  
  if (step.quizzes && Array.isArray(step.quizzes)) {
    quizzes = step.quizzes;
  } else if (Array.isArray(step.data)) {
    quizzes = step.data;
  } else if (step.data && Array.isArray(step.data.quizzes)) {
    quizzes = step.data.quizzes;
  } else if (step.data && step.data.question) {
    quizzes = [step.data];
  } else if (step.question) {
    quizzes = [step];
  }
  
  const validatedQuizzes = [];
  
  for (let qIndex = 0; qIndex < quizzes.length; qIndex++) {
    const quiz = quizzes[qIndex];
    
    if (!quiz.question || !String(quiz.question).trim()) {
      continue;
    }
    
    if (quiz.correctAnswer === undefined || quiz.correctAnswer === null) {
      continue;
    }
    
    const validatedQuiz = {
      id: quiz.id || `quiz_${index}_${qIndex}`,
      question: String(quiz.question).trim(),
      type: quiz.type || 'multiple-choice',
      correctAnswer: quiz.correctAnswer,
      explanation: String(quiz.explanation || '').trim(),
      points: Number(quiz.points) || 1
    };
    
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
          validatedQuiz.options = [
            { text: 'Option A', value: 'A' },
            { text: 'Option B', value: 'B' },
            { text: 'Option C', value: 'C' }
          ];
        }
      } else {
        validatedQuiz.options = [
          { text: 'Option A', value: 'A' },
          { text: 'Option B', value: 'B' },
          { text: 'Option C', value: 'C' }
        ];
      }
      
      if (typeof validatedQuiz.correctAnswer === 'number') {
        if (validatedQuiz.correctAnswer >= validatedQuiz.options.length || validatedQuiz.correctAnswer < 0) {
          validatedQuiz.correctAnswer = 0;
        }
      } else if (typeof validatedQuiz.correctAnswer === 'string') {
        const answerIndex = validatedQuiz.options.findIndex(opt => 
          opt.text.toLowerCase().trim() === validatedQuiz.correctAnswer.toLowerCase().trim() ||
          opt.value.toLowerCase().trim() === validatedQuiz.correctAnswer.toLowerCase().trim()
        );
        if (answerIndex >= 0) {
          validatedQuiz.correctAnswer = answerIndex;
        } else {
          validatedQuiz.correctAnswer = 0;
        }
      }
    } else if (validatedQuiz.type === 'true-false') {
      validatedQuiz.options = [
        { text: 'True', value: true },
        { text: 'False', value: false }
      ];
      
      if (typeof validatedQuiz.correctAnswer === 'string') {
        validatedQuiz.correctAnswer = validatedQuiz.correctAnswer.toLowerCase() === 'true' ? 0 : 1;
      } else if (typeof validatedQuiz.correctAnswer === 'boolean') {
        validatedQuiz.correctAnswer = validatedQuiz.correctAnswer ? 0 : 1;
      } else if (typeof validatedQuiz.correctAnswer === 'number') {
        validatedQuiz.correctAnswer = validatedQuiz.correctAnswer ? 0 : 1;
      }
    }
    
    validatedQuizzes.push(validatedQuiz);
  }
  
  if (validatedQuizzes.length === 0) {
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
  
  return validatedQuizzes;
}

// ✅ REPLACED: A more robust function to handle different vocabulary structures.
async function processVocabularyStep(step, index) {
  let vocabularyItems = [];

  if (step.data && Array.isArray(step.data.terms)) { // Handles { data: { terms: [] } }
    vocabularyItems = step.data.terms;
  } else if (Array.isArray(step.vocabulary)) {
    vocabularyItems = step.vocabulary;
  } else if (Array.isArray(step.data)) {
    vocabularyItems = step.data;
  }

  const validatedVocabulary = vocabularyItems
    .filter(vocab => !vocab.isHeader && vocab.term && vocab.definition)
    .map(vocab => ({
      term: String(vocab.term).trim(),
      definition: String(vocab.definition).trim(),
      example: vocab.example ? String(vocab.example).trim() : '',
      pronunciation: vocab.pronunciation || ''
    }));

  return validatedVocabulary;
}

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
    instructions = "Practice instructions not provided.";
  }
  
  return {
    instructions: instructions.trim(),
    type: practiceType
  };
}

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
    url = "https://example.com/media-placeholder";
  }
  
  return {
    url: url.trim(),
    description: description.trim()
  };
}

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
    prompt = "Writing prompt not provided.";
  }
  
  return {
    prompt: prompt.trim(),
    wordLimit: Number(wordLimit) || 100
  };
}

function processHomeworkFromSteps(steps, createHomework) {
  const exercises = [];
  const quizzes = [];
  
  if (!createHomework || !Array.isArray(steps)) {
    return { exercises, quizzes };
  }
  
  steps.forEach((step, stepIndex) => {
    try {
      if (step.type === 'exercise') {
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
    }
  });
  
  return { exercises, quizzes };
}

function extractExplanationsFromSteps(steps) {
  return steps
    .filter(step => step.type === 'explanation')
    .map(step => step.data.content || '')
    .filter(content => content.trim() !== '');
}

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

function getStepTypesCount(steps) {
  const counts = {};
  steps.forEach(step => {
    counts[step.type] = (counts[step.type] || 0) + 1;
  });
  return counts;
}

// Helper functions for content extraction
const getDifficultyFromLevel = (level) => {
  if (level <= 4) return 'Beginner';
  if (level <= 8) return 'Intermediate'; 
  return 'Advanced';
};

const detectLanguage = (subject) => {
  const languageMap = {
    'English': 'english',
    'Английский': 'english',
    'Spanish': 'spanish',
    'Испанский': 'spanish',
    'French': 'french',
    'Французский': 'french',
    'German': 'german',
    'Немецкий': 'german'
  };
  
  return languageMap[subject] || 'english';
};

const detectPartOfSpeech = (word) => {
  if (word.endsWith('ing')) return 'verb';
  if (word.endsWith('ly')) return 'adverb';
  if (word.endsWith('tion') || word.endsWith('sion')) return 'noun';
  if (word.endsWith('ed')) return 'verb';
  
  return 'noun';
};

module.exports = {
  addLesson: exports.addLesson,
  updateLesson: exports.updateLesson,
  deleteLesson: exports.deleteLesson,
  getLesson: exports.getLesson,
  getLessonsByTopic: exports.getLessonsByTopic,
  completeLesson: exports.completeLesson,
  migrateContentFromCompletedLessons: exports.migrateContentFromCompletedLessons,
  handleLessonCompletion,
  extractHomeworkFromLesson,
  extractVocabularyFromLesson
};
