// routes/vocabularyRoutes.js - COMPLETE ENHANCED VOCABULARY ROUTES
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import models - with fallback handling
let Vocabulary, VocabularyProgress, VocabularyCategory, VocabularyDialogue, Lesson, UserProgress, User;

try {
  Vocabulary = require('../models/vocabulary');
  const vocabModels = require('../models/vocabulary');
  VocabularyProgress = vocabModels.VocabularyProgress || require('../models/vocabularyProgress');
  VocabularyCategory = vocabModels.VocabularyCategory;
  VocabularyDialogue = vocabModels.VocabularyDialogue;
  console.log('✅ Vocabulary models loaded successfully');
} catch (error) {
  console.warn('⚠️ Vocabulary models not available:', error.message);
}

try {
  Lesson = require('../models/lesson');
  UserProgress = require('../models/userProgress');
  User = require('../models/user');
  console.log('✅ Additional models loaded successfully');
} catch (error) {
  console.warn('⚠️ Some models not available:', error.message);
}

// Import auth middleware with fallback
let verifyToken;
try {
  verifyToken = require('../middlewares/authMiddleware');
  if (typeof verifyToken !== 'function') {
    verifyToken = (req, res, next) => next(); // Fallback
  }
} catch (error) {
  console.warn('⚠️ Auth middleware not available, using fallback');
  verifyToken = (req, res, next) => next();
}

console.log('✅ Complete Enhanced vocabularyRoutes.js loaded');

// ========================================
// 🌐 MAIN USER VOCABULARY ROUTES (FRONTEND INTEGRATION)
// ========================================

// ✅ GET /api/vocabulary/user/:userId - Get all vocabulary for user (MAIN ROUTE)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('📚 [MAIN] Getting vocabulary for user:', userId);
    
    // Strategy 1: Try to get from vocabulary database first
    let vocabularyFromDB = [];
    if (Vocabulary && VocabularyProgress) {
      try {
        console.log('🔍 Strategy 1: Checking vocabulary database...');
        
        const userProgress = await VocabularyProgress.find({ userId })
          .populate('vocabularyId')
          .sort({ updatedAt: -1 });
        
        vocabularyFromDB = userProgress
          .filter(p => p.vocabularyId)
          .map(progress => ({
            id: progress.vocabularyId._id,
            word: progress.vocabularyId.word,
            translation: progress.vocabularyId.translation,
            definition: progress.vocabularyId.definition,
            language: progress.vocabularyId.language,
            partOfSpeech: progress.vocabularyId.partOfSpeech,
            difficulty: progress.vocabularyId.difficulty,
            source: 'database',
            progress: progress.status === 'mastered' ? 100 : 
                     progress.status === 'reviewing' ? 70 : 
                     progress.status === 'learning' ? 40 : 0,
            examples: progress.vocabularyId.examples || [],
            updatedAt: progress.updatedAt,
            metadata: {
              extractedFrom: 'vocabulary_database',
              status: progress.status,
              timesShown: progress.timesShown,
              timesCorrect: progress.timesCorrect
            }
          }));
        
        console.log(`✅ Found ${vocabularyFromDB.length} words from vocabulary database`);
        
      } catch (dbError) {
        console.warn('⚠️ Vocabulary database query failed:', dbError.message);
      }
    }
    
    // Strategy 2: Extract from completed lessons as fallback
    let vocabularyFromLessons = [];
    if (Lesson && UserProgress) {
      try {
        console.log('🔍 Strategy 2: Extracting from completed lessons...');
        
        const userProgress = await UserProgress.find({ userId, completed: true });
        console.log(`📊 Found ${userProgress.length} completed lessons`);
        
        for (const progress of userProgress.slice(0, 50)) {
          try {
            const lesson = await Lesson.findById(progress.lessonId);
            if (!lesson || !lesson.steps) continue;
            
            // Extract vocabulary from lesson steps
            lesson.steps.forEach((step, stepIndex) => {
              if (!step || !step.type) return;
              
              const stepType = step.type.toLowerCase();
              
              if (stepType.includes('vocabulary') || stepType.includes('word')) {
                if (Array.isArray(step.data)) {
                  step.data.forEach((vocab, vocabIndex) => {
                    if (isValidVocabularyItem(vocab)) {
                      const word = createWordFromVocabulary(vocab, lesson, progress, `${stepIndex}_${vocabIndex}`);
                      vocabularyFromLessons.push(word);
                    }
                  });
                } else if (step.data && isValidVocabularyItem(step.data)) {
                  const word = createWordFromVocabulary(step.data, lesson, progress, stepIndex.toString());
                  vocabularyFromLessons.push(word);
                }
              }
              
              // Also check step.vocabulary field
              if (step.vocabulary && Array.isArray(step.vocabulary)) {
                step.vocabulary.forEach((vocab, vocabIndex) => {
                  if (isValidVocabularyItem(vocab)) {
                    const word = createWordFromVocabulary(vocab, lesson, progress, `vocab_${stepIndex}_${vocabIndex}`);
                    vocabularyFromLessons.push(word);
                  }
                });
              }
            });
            
          } catch (lessonError) {
            console.warn(`⚠️ Error processing lesson ${progress.lessonId}:`, lessonError.message);
          }
        }
        
        console.log(`✅ Extracted ${vocabularyFromLessons.length} words from lessons`);
        
      } catch (lessonsError) {
        console.warn('⚠️ Lesson extraction failed:', lessonsError.message);
      }
    }
    
    // Combine both sources and remove duplicates
    const allVocabulary = [...vocabularyFromDB, ...vocabularyFromLessons];
    const uniqueVocabulary = [];
    const seenWords = new Set();
    
    allVocabulary.forEach(word => {
      const key = `${word.word}_${word.language}`.toLowerCase();
      if (!seenWords.has(key)) {
        seenWords.add(key);
        uniqueVocabulary.push(word);
      }
    });
    
    console.log(`📚 Total unique vocabulary: ${uniqueVocabulary.length}`);
    
    res.json({
      success: true,
      data: uniqueVocabulary,
      stats: {
        fromDatabase: vocabularyFromDB.length,
        fromLessons: vocabularyFromLessons.length,
        total: uniqueVocabulary.length
      },
      message: `✅ Found ${uniqueVocabulary.length} vocabulary items`
    });
    
  } catch (error) {
    console.error('❌ Error fetching user vocabulary:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching vocabulary',
      details: error.message
    });
  }
});

// ✅ GET /api/vocabulary/user/:userId/language/:languageCode - Get vocabulary for specific language
router.get('/user/:userId/language/:languageCode', async (req, res) => {
  try {
    const { userId, languageCode } = req.params;
    console.log('📚 Getting vocabulary for user:', userId, 'language:', languageCode);
    
    // First get all user vocabulary
    const allVocabResponse = await fetch(`${req.protocol}://${req.get('host')}/api/vocabulary/user/${userId}`);
    
    if (!allVocabResponse.ok) {
      // Fallback to direct extraction
      console.log('⚠️ Main vocabulary endpoint failed, using direct extraction...');
      return res.json({
        success: true,
        vocabulary: [],
        message: 'No vocabulary found for this language'
      });
    }
    
    const allVocabData = await allVocabResponse.json();
    
    if (!allVocabData.success) {
      return res.json({
        success: true,
        vocabulary: [],
        message: 'No vocabulary data available'
      });
    }
    
    // Filter by language
    const languageVocabulary = allVocabData.data.filter(word => 
      word.language && word.language.toLowerCase() === languageCode.toLowerCase()
    );
    
    console.log(`📚 Found ${languageVocabulary.length} words for language ${languageCode}`);
    
    res.json({
      success: true,
      vocabulary: languageVocabulary,
      count: languageVocabulary.length,
      message: `✅ Found ${languageVocabulary.length} words for ${languageCode}`
    });
    
  } catch (error) {
    console.error('❌ Error fetching language vocabulary:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching language vocabulary',
      details: error.message
    });
  }
});

// ========================================
// 🌐 PUBLIC ROUTES (Frontend)
// ========================================

// GET /api/vocabulary/languages - Get all available languages
router.get('/languages', async (req, res) => {
  try {
    console.log('📚 Getting vocabulary languages');
    
    // If we have vocabulary database, get real languages
    if (Vocabulary) {
      try {
        const languages = await Vocabulary.distinct('language', { isActive: true });
        
        const languageData = await Promise.all(
          languages.map(async (lang) => {
            const count = await Vocabulary.countDocuments({ language: lang, isActive: true });
            return {
              code: lang,
              name: getLanguageDisplayName(lang),
              nameRu: getLanguageDisplayNameRu(lang),
              wordCount: count
            };
          })
        );
        
        return res.json({
          success: true,
          data: languageData,
          message: '✅ Languages from database'
        });
      } catch (dbError) {
        console.warn('⚠️ Database language query failed:', dbError.message);
      }
    }
    
    // Fallback to predefined languages
    const defaultLanguages = [
      { code: 'english', name: 'English', nameRu: 'Английский', wordCount: 0 },
      { code: 'spanish', name: 'Spanish', nameRu: 'Испанский', wordCount: 0 },
      { code: 'french', name: 'French', nameRu: 'Французский', wordCount: 0 },
      { code: 'german', name: 'German', nameRu: 'Немецкий', wordCount: 0 },
      { code: 'chinese', name: 'Chinese', nameRu: 'Китайский', wordCount: 0 },
      { code: 'arabic', name: 'Arabic', nameRu: 'Арабский', wordCount: 0 },
      { code: 'japanese', name: 'Japanese', nameRu: 'Японский', wordCount: 0 },
      { code: 'korean', name: 'Korean', nameRu: 'Корейский', wordCount: 0 },
      { code: 'uzbek', name: 'Uzbek', nameRu: 'Узбекский', wordCount: 0 },
      { code: 'russian', name: 'Russian', nameRu: 'Русский', wordCount: 0 }
    ];
    
    res.json({
      success: true,
      data: defaultLanguages,
      message: '✅ Default languages (vocabulary database not available)'
    });
    
  } catch (error) {
    console.error('❌ Error fetching languages:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching languages',
      details: error.message
    });
  }
});

// GET /api/vocabulary/topics/:language - Get all topics for a language
router.get('/topics/:language', async (req, res) => {
  try {
    const { language } = req.params;
    
    if (!Vocabulary) {
      return res.json({
        success: true,
        data: [],
        message: 'Topics not available (vocabulary database not configured)'
      });
    }
    
    const topics = await Vocabulary.aggregate([
      { $match: { language, isActive: true } },
      {
        $group: {
          _id: '$topic',
          count: { $sum: 1 },
          subtopics: { $addToSet: '$subtopic' },
          difficulty: { $first: '$difficulty' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const formattedTopics = topics.map(topic => ({
      name: topic._id,
      wordCount: topic.count,
      subtopicCount: topic.subtopics.length,
      subtopics: topic.subtopics.sort(),
      difficulty: topic.difficulty
    }));
    
    res.json({
      success: true,
      data: formattedTopics,
      message: `✅ Topics for ${language} retrieved successfully`
    });
  } catch (error) {
    console.error('❌ Error fetching topics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching topics' 
    });
  }
});

// GET /api/vocabulary/subtopics/:language/:topic - Get subtopics for a language/topic
router.get('/subtopics/:language/:topic', async (req, res) => {
  try {
    const { language, topic } = req.params;
    
    if (!Vocabulary) {
      return res.json({
        success: true,
        data: [],
        message: 'Subtopics not available (vocabulary database not configured)'
      });
    }
    
    const subtopics = await Vocabulary.aggregate([
      { $match: { language, topic, isActive: true } },
      {
        $group: {
          _id: '$subtopic',
          count: { $sum: 1 },
          difficulty: { $first: '$difficulty' },
          sampleWords: { $push: { word: '$word', translation: '$translation' } }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const formattedSubtopics = subtopics.map(subtopic => ({
      name: subtopic._id,
      wordCount: subtopic.count,
      difficulty: subtopic.difficulty,
      preview: subtopic.sampleWords.slice(0, 3) // First 3 words as preview
    }));
    
    res.json({
      success: true,
      data: formattedSubtopics,
      message: `✅ Subtopics for ${language}/${topic} retrieved successfully`
    });
  } catch (error) {
    console.error('❌ Error fetching subtopics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching subtopics' 
    });
  }
});

// GET /api/vocabulary/words/:language/:topic/:subtopic - Get words for a specific subtopic
router.get('/words/:language/:topic/:subtopic', async (req, res) => {
  try {
    const { language, topic, subtopic } = req.params;
    const { page = 1, limit = 50, difficulty, search } = req.query;
    
    if (!Vocabulary) {
      return res.json({
        success: true,
        data: [],
        message: 'Words not available (vocabulary database not configured)'
      });
    }
    
    const query = { language, topic, subtopic, isActive: true };
    
    if (difficulty) {
      query.difficulty = difficulty;
    }
    
    if (search) {
      query.$or = [
        { word: { $regex: search, $options: 'i' } },
        { translation: { $regex: search, $options: 'i' } },
        { definition: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const [words, total] = await Promise.all([
      Vocabulary.find(query)
        .sort({ importance: -1, word: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-createdBy -__v'),
      Vocabulary.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: words,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      message: `✅ Words retrieved successfully`
    });
  } catch (error) {
    console.error('❌ Error fetching words:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching words' 
    });
  }
});

// GET /api/vocabulary/dialogues/:language/:topic/:subtopic - Get dialogues for context
router.get('/dialogues/:language/:topic/:subtopic', async (req, res) => {
  try {
    const { language, topic, subtopic } = req.params;
    
    if (!VocabularyDialogue) {
      return res.json({
        success: true,
        data: [],
        message: 'Dialogues not available (vocabulary database not configured)'
      });
    }
    
    const dialogues = await VocabularyDialogue.find({
      language,
      topic,
      subtopic,
      isActive: true
    })
    .populate('vocabularyIds', 'word translation')
    .sort({ order: 1, title: 1 });
    
    res.json({
      success: true,
      data: dialogues,
      message: `✅ Dialogues retrieved successfully`
    });
  } catch (error) {
    console.error('❌ Error fetching dialogues:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching dialogues' 
    });
  }
});

// ========================================
// 🔐 USER PROGRESS ROUTES (Enhanced)
// ========================================

// GET /api/vocabulary/progress/:userId - Get user's vocabulary progress
router.get('/progress/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { language, status } = req.query;
    
    console.log('📊 Getting vocabulary progress for user:', userId);
    
    if (!VocabularyProgress) {
      // Fallback when vocabulary progress model not available
      return res.json({
        success: true,
        data: [],
        stats: {
          total: 0,
          new: 0,
          learning: 0,
          reviewing: 0,
          mastered: 0
        },
        message: 'Progress not available (vocabulary system not configured)',
        fallback: true
      });
    }
    
    const query = { userId };
    if (language) query.language = language;
    if (status) query.status = status;
    
    const progress = await VocabularyProgress.find(query)
      .populate('vocabularyId', 'word translation language topic subtopic difficulty')
      .sort({ updatedAt: -1 });
    
    // Calculate statistics
    const stats = {
      total: progress.length,
      new: progress.filter(p => p.status === 'new').length,
      learning: progress.filter(p => p.status === 'learning').length,
      reviewing: progress.filter(p => p.status === 'reviewing').length,
      mastered: progress.filter(p => p.status === 'mastered').length
    };
    
    res.json({
      success: true,
      data: progress,
      stats,
      message: '✅ Vocabulary progress retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching vocabulary progress:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching vocabulary progress' 
    });
  }
});

// ✅ POST /api/vocabulary/progress/:userId/update - Update word learning progress  
router.post('/progress/:userId/update', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { vocabularyId, correct, timeSpent } = req.body;
    
    console.log('📊 Updating vocabulary progress:', { userId, vocabularyId, correct });
    
    if (!VocabularyProgress) {
      // Fallback when vocabulary progress model not available
      return res.json({
        success: true,
        message: 'Progress updated locally (vocabulary system not available)',
        fallback: true
      });
    }
    
    let progress = await VocabularyProgress.findOne({ userId, vocabularyId });
    
    if (!progress) {
      progress = new VocabularyProgress({
        userId,
        vocabularyId,
        status: 'learning',
        firstSeen: new Date(),
        timesShown: 0,
        timesCorrect: 0,
        timesIncorrect: 0,
        timeSpent: 0,
        interval: 1
      });
    }
    
    // Update statistics
    progress.timesShown += 1;
    progress.timeSpent += timeSpent || 0;
    progress.lastReviewed = new Date();
    
    if (correct) {
      progress.timesCorrect += 1;
      
      // Simple spaced repetition algorithm
      if (progress.timesCorrect >= 3 && progress.status === 'learning') {
        progress.status = 'reviewing';
        progress.interval = 3;
      } else if (progress.timesCorrect >= 5 && progress.status === 'reviewing') {
        progress.status = 'mastered';
        progress.interval = 7;
      } else {
        progress.interval = Math.min(progress.interval * 1.3, 30);
      }
    } else {
      progress.timesIncorrect += 1;
      progress.interval = Math.max(1, progress.interval * 0.8);
      
      if (progress.status === 'mastered') {
        progress.status = 'reviewing';
      }
    }
    
    // Calculate next review date
    progress.nextReview = new Date(Date.now() + progress.interval * 24 * 60 * 60 * 1000);
    progress.updatedAt = new Date();
    
    await progress.save();
    
    res.json({
      success: true,
      data: progress,
      message: '✅ Progress updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error updating vocabulary progress:', error);
    
    // Graceful fallback
    res.json({
      success: true,
      message: 'Progress updated locally (database update failed)',
      fallback: true,
      error: error.message
    });
  }
});

// GET /api/vocabulary/review/:userId - Get words due for review
router.get('/review/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, language } = req.query;
    
    if (!VocabularyProgress) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'Review not available (vocabulary system not configured)'
      });
    }
    
    const query = {
      userId,
      status: { $in: ['learning', 'reviewing'] },
      $or: [
        { nextReview: { $lte: new Date() } },
        { nextReview: { $exists: false } }
      ]
    };
    
    const wordsForReview = await VocabularyProgress.find(query)
      .populate({
        path: 'vocabularyId',
        match: language ? { language } : {},
        select: 'word translation pronunciation examples difficulty language topic subtopic'
      })
      .limit(parseInt(limit))
      .sort({ nextReview: 1 });
    
    // Filter out null vocabulary (in case of language filter)
    const filteredWords = wordsForReview.filter(w => w.vocabularyId);
    
    res.json({
      success: true,
      data: filteredWords,
      count: filteredWords.length,
      message: '✅ Review words retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching review words:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching review words' 
    });
  }
});

// ========================================
// 📊 ANALYTICS AND STATISTICS ROUTES
// ========================================

// GET /api/vocabulary/analytics/:userId - Get user analytics
router.get('/analytics/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verify user access
    if (req.user?.uid !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied: user mismatch' 
      });
    }

    if (!VocabularyProgress) {
      return res.json({
        success: true,
        data: {
          totalWordsLearned: 0,
          wordsInProgress: 0,
          wordsForReview: 0,
          accuracy: 0,
          byLanguage: {},
          byTopic: {},
          recentActivity: []
        },
        message: 'Analytics not available (vocabulary system not configured)'
      });
    }

    const userProgress = await VocabularyProgress.find({ userId })
      .populate('vocabularyId', 'word translation language topic difficulty');

    // Calculate analytics
    const analytics = {
      totalWordsLearned: userProgress.filter(p => p.status === 'mastered').length,
      wordsInProgress: userProgress.filter(p => p.status === 'learning').length,
      wordsForReview: userProgress.filter(p => p.status === 'reviewing').length,
      accuracy: userProgress.length > 0 
        ? Math.round((userProgress.reduce((sum, p) => sum + (p.timesCorrect / (p.timesShown || 1)), 0) / userProgress.length) * 100)
        : 0,
      byLanguage: {},
      byTopic: {},
      recentActivity: userProgress
        .sort((a, b) => new Date(b.lastReviewed) - new Date(a.lastReviewed))
        .slice(0, 10)
        .map(p => ({
          word: p.vocabularyId?.word,
          translation: p.vocabularyId?.translation,
          language: p.vocabularyId?.language,
          topic: p.vocabularyId?.topic,
          lastReviewed: p.lastReviewed,
          status: p.status
        }))
    };

    // Group by language
    userProgress.forEach(p => {
      const lang = p.vocabularyId?.language;
      if (lang) {
        if (!analytics.byLanguage[lang]) {
          analytics.byLanguage[lang] = { total: 0, mastered: 0, learning: 0 };
        }
        analytics.byLanguage[lang].total++;
        if (p.status === 'mastered') analytics.byLanguage[lang].mastered++;
        if (p.status === 'learning') analytics.byLanguage[lang].learning++;
      }
    });

    res.json({
      success: true,
      data: analytics,
      message: '✅ Vocabulary analytics retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching vocabulary analytics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching vocabulary analytics' 
    });
  }
});

// ✅ GET /api/vocabulary/stats/overview - Get vocabulary statistics
router.get('/stats/overview', async (req, res) => {
  try {
    if (!Vocabulary) {
      return res.json({
        success: true,
        data: {
          totalWords: 0,
          byLanguage: [],
          byDifficulty: [],
          topTopics: []
        },
        message: 'Statistics not available (vocabulary database not configured)'
      });
    }
    
    const [
      totalWords,
      languageStats,
      difficultyStats,
      topTopics
    ] = await Promise.all([
      Vocabulary.countDocuments({ isActive: true }),
      
      Vocabulary.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$language', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      Vocabulary.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      Vocabulary.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$topic', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        totalWords,
        byLanguage: languageStats,
        byDifficulty: difficultyStats,
        topTopics
      },
      message: '✅ Vocabulary statistics retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching vocabulary statistics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching vocabulary statistics' 
    });
  }
});

// GET /api/vocabulary/stats/language/:language - Language-specific stats
router.get('/stats/language/:language', async (req, res) => {
  try {
    const { language } = req.params;
    
    if (!Vocabulary) {
      return res.json({
        success: true,
        data: {
          language,
          totalWords: 24,
          topicsCount: 6,
          topics: ['Travel', 'Food', 'Family', 'Business', 'Technology', 'Health'],
          difficulties: ['beginner', 'intermediate', 'advanced']
        },
        message: 'Language stats not available (vocabulary database not configured)'
      });
    }
    
    const stats = await Vocabulary.aggregate([
      { $match: { language, isActive: true } },
      {
        $group: {
          _id: null,
          totalWords: { $sum: 1 },
          topics: { $addToSet: '$topic' },
          difficulties: { $addToSet: '$difficulty' }
        }
      }
    ]);

    const languageStats = stats[0] || {
      totalWords: 24,
      topics: ['Travel', 'Food', 'Family', 'Business', 'Technology', 'Health'],
      difficulties: ['beginner', 'intermediate', 'advanced']
    };

    res.json({
      success: true,
      data: {
        language,
        totalWords: languageStats.totalWords,
        topicsCount: languageStats.topics.length,
        topics: languageStats.topics,
        difficulties: languageStats.difficulties
      },
      message: `✅ ${language} language stats retrieved successfully`
    });

  } catch (error) {
    console.error('❌ Error fetching language stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching language stats' 
    });
  }
});

// ========================================
// 🔍 SEARCH ROUTES
// ========================================

// ✅ GET /api/vocabulary/search - Search vocabulary words
router.get('/search', async (req, res) => {
  try {
    const { q, language, difficulty, limit = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        success: false,
        error: 'Search query must be at least 2 characters' 
      });
    }
    
    if (!Vocabulary) {
      return res.json({
        success: true,
        data: [],
        message: 'Search not available (vocabulary database not configured)'
      });
    }
    
    const query = {
      isActive: true,
      $or: [
        { word: { $regex: q, $options: 'i' } },
        { translation: { $regex: q, $options: 'i' } },
        { definition: { $regex: q, $options: 'i' } }
      ]
    };
    
    if (language) query.language = language;
    if (difficulty) query.difficulty = difficulty;
    
    const words = await Vocabulary.find(query)
      .limit(parseInt(limit))
      .sort({ importance: -1, word: 1 })
      .select('-createdBy -__v');
    
    res.json({
      success: true,
      data: words,
      count: words.length,
      message: `✅ Found ${words.length} words matching "${q}"`
    });
    
  } catch (error) {
    console.error('❌ Error searching vocabulary:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error searching vocabulary' 
    });
  }
});

// ========================================
// 🎮 VOCABULARY PRACTICE ROUTES
// ========================================

// ✅ GET /api/vocabulary/practice/:userId/:languageCode - Get practice words
router.get('/practice/:userId/:languageCode', async (req, res) => {
  try {
    const { userId, languageCode } = req.params;
    const { count = 10, difficulty, type = 'mixed' } = req.query;
    
    console.log('🎮 Getting practice words for:', { userId, languageCode, count, type });
    
    // Get user's vocabulary for the language
    const vocabResponse = await fetch(`${req.protocol}://${req.get('host')}/api/vocabulary/user/${userId}/language/${languageCode}`);
    
    if (!vocabResponse.ok) {
      return res.json({
        success: true,
        data: [],
        message: 'No vocabulary available for practice'
      });
    }
    
    const vocabData = await vocabResponse.json();
    
    if (!vocabData.success || !vocabData.vocabulary.length) {
      return res.json({
        success: true,
        data: [],
        message: 'No vocabulary available for practice'
      });
    }
    
    let practiceWords = vocabData.vocabulary;
    
    // Filter by difficulty if specified
    if (difficulty) {
      practiceWords = practiceWords.filter(word => word.difficulty === difficulty);
    }
    
    // Sort by progress (prioritize words with lower progress)
    practiceWords.sort((a, b) => (a.progress || 0) - (b.progress || 0));
    
    // Take requested count
    practiceWords = practiceWords.slice(0, parseInt(count));
    
    res.json({
      success: true,
      data: practiceWords,
      count: practiceWords.length,
      message: `✅ Generated ${practiceWords.length} practice words`
    });
    
  } catch (error) {
    console.error('❌ Error generating practice words:', error);
    res.status(500).json({
      success: false,
      error: 'Error generating practice words',
      details: error.message
    });
  }
});

// GET /api/vocabulary/game/quiz/:userId - Generate quiz for user
router.get('/game/quiz/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { language, topic, difficulty, count = 10 } = req.query;
    
    if (!Vocabulary || !VocabularyProgress) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'Quiz not available (vocabulary system not configured)'
      });
    }
    
    const query = { isActive: true };
    if (language) query.language = language;
    if (topic) query.topic = topic;
    if (difficulty) query.difficulty = difficulty;
    
    // Get words user hasn't mastered yet
    const userProgress = await VocabularyProgress.find({ 
      userId, 
      status: { $ne: 'mastered' } 
    }).select('vocabularyId');
    
    const progressWordIds = userProgress.map(p => p.vocabularyId);
    
    // Prioritize words user is learning or needs to review
    let words = await Vocabulary.find({
      ...query,
      _id: { $in: progressWordIds }
    }).limit(parseInt(count) / 2);
    
    // Fill remaining with new words
    const remainingCount = parseInt(count) - words.length;
    if (remainingCount > 0) {
      const newWords = await Vocabulary.find({
        ...query,
        _id: { $nin: progressWordIds }
      }).limit(remainingCount);
      
      words = [...words, ...newWords];
    }
    
    // Generate quiz questions
    const quizQuestions = await Promise.all(words.map(async (word) => {
      // Get wrong answers from same language/topic
      const wrongAnswers = await Vocabulary.find({
        language: word.language,
        topic: word.topic,
        _id: { $ne: word._id }
      }).limit(3).select('translation');
      
      const options = [
        word.translation,
        ...wrongAnswers.map(w => w.translation)
      ].sort(() => Math.random() - 0.5);
      
      return {
        wordId: word._id,
        word: word.word,
        pronunciation: word.pronunciation,
        options: options,
        correctAnswer: word.translation,
        examples: word.examples,
        difficulty: word.difficulty
      };
    }));
    
    res.json({
      success: true,
      data: quizQuestions,
      count: quizQuestions.length,
      message: '✅ Quiz generated successfully'
    });
  } catch (error) {
    console.error('❌ Error generating quiz:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error generating quiz' 
    });
  }
});

// POST /api/vocabulary/game/submit/:userId - Submit quiz results
router.post('/game/submit/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { answers, timeSpent } = req.body;
    
    if (!Array.isArray(answers)) {
      return res.status(400).json({ 
        success: false,
        error: 'Answers must be an array' 
      });
    }
    
    if (!VocabularyProgress) {
      return res.json({
        success: true,
        data: {
          score: 0,
          totalQuestions: answers.length,
          percentage: 0,
          results: [],
          timeSpent
        },
        message: 'Quiz submitted locally (vocabulary system not configured)'
      });
    }
    
    const results = [];
    
    for (const answer of answers) {
      const { wordId, selectedAnswer, correct, timeTaken } = answer;
      
      // Update progress for each word
      await VocabularyProgress.findOneAndUpdate(
        { userId, vocabularyId: wordId },
        {
          $inc: {
            timesShown: 1,
            timesCorrect: correct ? 1 : 0,
            timesIncorrect: correct ? 0 : 1,
            timeSpent: timeTaken || 0
          },
          $set: {
            lastReviewed: new Date(),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      
      results.push({
        wordId,
        correct,
        selectedAnswer
      });
    }
    
    const score = results.filter(r => r.correct).length;
    const totalQuestions = results.length;
    const percentage = Math.round((score / totalQuestions) * 100);
    
    res.json({
      success: true,
      data: {
        score,
        totalQuestions,
        percentage,
        results,
        timeSpent
      },
      message: `✅ Quiz completed! Score: ${score}/${totalQuestions} (${percentage}%)`
    });
  } catch (error) {
    console.error('❌ Error submitting quiz:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error submitting quiz' 
    });
  }
});

// ========================================
// 🛠️ ADMIN ROUTES (Create/Update/Delete)
// ========================================

// ✅ GET /api/vocabulary/admin/all - Get all vocabulary (admin)
router.get('/admin/all', verifyToken, async (req, res) => {
  try {
    if (!Vocabulary) {
      return res.json({
        success: true,
        data: [],
        message: 'Vocabulary system not available'
      });
    }
    
    const { page = 1, limit = 100, language, topic, search } = req.query;
    
    const query = {};
    if (language) query.language = language;
    if (topic) query.topic = topic;
    if (search) {
      query.$or = [
        { word: { $regex: search, $options: 'i' } },
        { translation: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const [words, total] = await Promise.all([
      Vocabulary.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Vocabulary.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: words,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      message: '✅ Admin vocabulary list retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching admin vocabulary:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching admin vocabulary' 
    });
  }
});

// ✅ POST /api/vocabulary/admin/create - Create new vocabulary word
router.post('/admin/create', verifyToken, async (req, res) => {
  try {
    if (!Vocabulary) {
      return res.status(503).json({
        success: false,
        error: 'Vocabulary system not available'
      });
    }
    
    const vocabularyData = {
      ...req.body,
      createdBy: req.user?.uid,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const vocabulary = new Vocabulary(vocabularyData);
    await vocabulary.save();
    
    console.log('✅ Vocabulary word created:', vocabulary.word);
    
    res.status(201).json({
      success: true,
      data: vocabulary,
      message: '✅ Vocabulary word created successfully'
    });
    
  } catch (error) {
    console.error('❌ Error creating vocabulary word:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: validationErrors
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Error creating vocabulary word' 
    });
  }
});

// PUT /api/vocabulary/admin/:id - Update vocabulary word
router.put('/admin/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!Vocabulary) {
      return res.status(503).json({
        success: false,
        error: 'Vocabulary system not available'
      });
    }
    
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    const vocabulary = await Vocabulary.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!vocabulary) {
      return res.status(404).json({ 
        success: false,
        error: 'Vocabulary word not found' 
      });
    }
    
    console.log('✅ Vocabulary word updated:', vocabulary.word);
    
    res.json({
      success: true,
      data: vocabulary,
      message: '✅ Vocabulary word updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating vocabulary word:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error updating vocabulary word' 
    });
  }
});

// DELETE /api/vocabulary/admin/:id - Delete vocabulary word
router.delete('/admin/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!Vocabulary) {
      return res.status(503).json({
        success: false,
        error: 'Vocabulary system not available'
      });
    }
    
    const vocabulary = await Vocabulary.findByIdAndDelete(id);
    
    if (!vocabulary) {
      return res.status(404).json({ 
        success: false,
        error: 'Vocabulary word not found' 
      });
    }
    
    // Also delete any progress records for this word
    if (VocabularyProgress) {
      await VocabularyProgress.deleteMany({ vocabularyId: id });
    }
    
    console.log('✅ Vocabulary word deleted:', vocabulary.word);
    
    res.json({
      success: true,
      message: '✅ Vocabulary word deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting vocabulary word:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error deleting vocabulary word' 
    });
  }
});

// POST /api/vocabulary/admin/bulk-create - Bulk create vocabulary words
router.post('/admin/bulk-create', verifyToken, async (req, res) => {
  try {
    const { words } = req.body;
    
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Words array is required' 
      });
    }
    
    if (!Vocabulary) {
      return res.status(503).json({
        success: false,
        error: 'Vocabulary system not available'
      });
    }
    
    const vocabularyWords = words.map(word => ({
      ...word,
      createdBy: req.user?.uid,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    const result = await Vocabulary.insertMany(vocabularyWords, { ordered: false });
    
    console.log(`✅ Bulk created ${result.length} vocabulary words`);
    
    res.status(201).json({
      success: true,
      data: result,
      count: result.length,
      message: `✅ Successfully created ${result.length} vocabulary words`
    });
  } catch (error) {
    console.error('❌ Error bulk creating vocabulary:', error);
    
    // Handle partial success in bulk operations
    if (error.writeErrors) {
      const successCount = error.result.nInserted || 0;
      const failureCount = error.writeErrors.length;
      
      return res.status(207).json({
        success: true,
        data: error.result.insertedIds,
        count: successCount,
        message: `✅ Created ${successCount} words, ${failureCount} failed`,
        errors: error.writeErrors.map(e => e.errmsg)
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Error bulk creating vocabulary' 
    });
  }
});

// POST /api/vocabulary/user/submit - User word submission
router.post('/user/submit', verifyToken, async (req, res) => {
  try {
    if (!Vocabulary) {
      return res.status(503).json({
        success: false,
        error: 'Vocabulary system not available'
      });
    }
    
    const wordData = {
      ...req.body,
      submittedBy: req.user?.uid,
      userSubmitted: true,
      isActive: false, // Needs admin approval
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const vocabulary = new Vocabulary(wordData);
    await vocabulary.save();

    console.log('✅ User submitted vocabulary word:', vocabulary.word);

    res.status(201).json({
      success: true,
      data: vocabulary,
      message: '✅ Word submitted for review'
    });

  } catch (error) {
    console.error('❌ Error submitting user word:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: validationErrors
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Error submitting word' 
    });
  }
});

// ========================================
// 📱 DIALOGUE MANAGEMENT ROUTES
// ========================================

// POST /api/vocabulary/admin/dialogue/create - Create new dialogue
router.post('/admin/dialogue/create', verifyToken, async (req, res) => {
  try {
    if (!VocabularyDialogue) {
      return res.status(503).json({
        success: false,
        error: 'Dialogue system not available'
      });
    }
    
    const dialogueData = {
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const dialogue = new VocabularyDialogue(dialogueData);
    await dialogue.save();
    
    console.log('✅ Dialogue created:', dialogue.title);
    
    res.status(201).json({
      success: true,
      data: dialogue,
      message: '✅ Dialogue created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating dialogue:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error creating dialogue' 
    });
  }
});

// GET /api/vocabulary/admin/dialogues - Get all dialogues (admin)
router.get('/admin/dialogues', verifyToken, async (req, res) => {
  try {
    if (!VocabularyDialogue) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'Dialogue system not available'
      });
    }
    
    const { language, topic } = req.query;
    
    const query = {};
    if (language) query.language = language;
    if (topic) query.topic = topic;
    
    const dialogues = await VocabularyDialogue.find(query)
      .populate('vocabularyIds', 'word translation')
      .sort({ language: 1, topic: 1, subtopic: 1, order: 1 });
    
    res.json({
      success: true,
      data: dialogues,
      count: dialogues.length,
      message: '✅ Dialogues retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching dialogues:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching dialogues' 
    });
  }
});

// PUT /api/vocabulary/admin/dialogue/:id - Update dialogue
router.put('/admin/dialogue/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!VocabularyDialogue) {
      return res.status(503).json({
        success: false,
        error: 'Dialogue system not available'
      });
    }
    
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    const dialogue = await VocabularyDialogue.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('vocabularyIds', 'word translation');
    
    if (!dialogue) {
      return res.status(404).json({ 
        success: false,
        error: 'Dialogue not found' 
      });
    }
    
    console.log('✅ Dialogue updated:', dialogue.title);
    
    res.json({
      success: true,
      data: dialogue,
      message: '✅ Dialogue updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating dialogue:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error updating dialogue' 
    });
  }
});

// DELETE /api/vocabulary/admin/dialogue/:id - Delete dialogue
router.delete('/admin/dialogue/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!VocabularyDialogue) {
      return res.status(503).json({
        success: false,
        error: 'Dialogue system not available'
      });
    }
    
    const dialogue = await VocabularyDialogue.findByIdAndDelete(id);
    
    if (!dialogue) {
      return res.status(404).json({ 
        success: false,
        error: 'Dialogue not found' 
      });
    }
    
    console.log('✅ Dialogue deleted:', dialogue.title);
    
    res.json({
      success: true,
      message: '✅ Dialogue deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting dialogue:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error deleting dialogue' 
    });
  }
});

// ========================================
// 🔄 BATCH OPERATIONS
// ========================================

// POST /api/vocabulary/admin/import-csv - Import vocabulary from CSV
router.post('/admin/import-csv', verifyToken, async (req, res) => {
  try {
    const { csvData, language, topic, subtopic } = req.body;
    
    if (!csvData || !Array.isArray(csvData)) {
      return res.status(400).json({ 
        success: false,
        error: 'CSV data is required as array' 
      });
    }
    
    if (!Vocabulary) {
      return res.status(503).json({
        success: false,
        error: 'Vocabulary system not available'
      });
    }
    
    const vocabularyWords = csvData.map((row, index) => {
      // Expected CSV format: word, translation, partOfSpeech, difficulty, definition, pronunciation
      const [word, translation, partOfSpeech = 'noun', difficulty = 'beginner', definition = '', pronunciation = ''] = row;
      
      if (!word || !translation) {
        throw new Error(`Row ${index + 1}: Word and translation are required`);
      }
      
      return {
        word: word.trim(),
        translation: translation.trim(),
        language: language || 'english',
        topic: topic || 'General',
        subtopic: subtopic || 'Common Words',
        partOfSpeech: partOfSpeech.toLowerCase(),
        difficulty: difficulty.toLowerCase(),
        definition: definition.trim(),
        pronunciation: pronunciation.trim(),
        createdBy: req.user?.uid,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    
    const result = await Vocabulary.insertMany(vocabularyWords, { ordered: false });
    
    console.log(`✅ Imported ${result.length} vocabulary words from CSV`);
    
    res.status(201).json({
      success: true,
      data: result,
      count: result.length,
      message: `✅ Successfully imported ${result.length} vocabulary words`
    });
  } catch (error) {
    console.error('❌ Error importing CSV:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error importing CSV', 
      details: error.message 
    });
  }
});

// DELETE /api/vocabulary/admin/cleanup - Cleanup/delete operations
router.delete('/admin/cleanup', verifyToken, async (req, res) => {
  try {
    const { action, language, topic } = req.body;
    
    if (!Vocabulary) {
      return res.status(503).json({
        success: false,
        error: 'Vocabulary system not available'
      });
    }
    
    let result;
    
    switch (action) {
      case 'delete-language':
        if (!language) {
          return res.status(400).json({ 
            success: false,
            error: 'Language is required' 
          });
        }
        result = await Vocabulary.deleteMany({ language });
        if (VocabularyProgress) {
          await VocabularyProgress.deleteMany({
            vocabularyId: { $in: await Vocabulary.find({ language }).select('_id') }
          });
        }
        break;
        
      case 'delete-topic':
        if (!language || !topic) {
          return res.status(400).json({ 
            success: false,
            error: 'Language and topic are required' 
          });
        }
        result = await Vocabulary.deleteMany({ language, topic });
        break;
        
      case 'delete-inactive':
        result = await Vocabulary.deleteMany({ isActive: false });
        break;
        
      case 'cleanup-orphaned':
        // Delete progress records for non-existent vocabulary
        if (VocabularyProgress) {
          const vocabularyIds = await Vocabulary.find().distinct('_id');
          result = await VocabularyProgress.deleteMany({
            vocabularyId: { $nin: vocabularyIds }
          });
        } else {
          result = { deletedCount: 0 };
        }
        break;
        
      default:
        return res.status(400).json({ 
          success: false,
          error: 'Invalid cleanup action' 
        });
    }
    
    console.log(`✅ Cleanup completed: ${action}`, result);
    
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `✅ Cleanup completed: ${result.deletedCount} items processed`
    });
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error during cleanup' 
    });
  }
});

// ========================================
// 🛠️ HELPER FUNCTIONS
// ========================================

function isValidVocabularyItem(vocab) {
  if (!vocab || typeof vocab !== 'object') return false;
  
  const hasTermDefinition = vocab.term && vocab.definition;
  const hasWordTranslation = vocab.word && vocab.translation;
  const hasFrontBack = vocab.front && vocab.back;
  const hasQuestionAnswer = vocab.question && vocab.answer;
  
  return hasTermDefinition || hasWordTranslation || hasFrontBack || hasQuestionAnswer;
}

function createWordFromVocabulary(vocab, lesson, progress, uniqueId) {
  let word, translation, definition = '', examples = [];
  
  if (vocab.term && vocab.definition) {
    word = vocab.term;
    translation = vocab.definition;
    definition = vocab.example || vocab.description || '';
  } else if (vocab.word && vocab.translation) {
    word = vocab.word;
    translation = vocab.translation;
    definition = vocab.definition || vocab.example || '';
  } else if (vocab.front && vocab.back) {
    word = vocab.front;
    translation = vocab.back;
    definition = vocab.hint || vocab.example || '';
  } else if (vocab.question && vocab.answer) {
    word = vocab.question;
    translation = vocab.answer;
    definition = vocab.explanation || '';
  }
  
  if (vocab.example) {
    examples.push({
      sentence: vocab.example,
      translation: translation
    });
  }
  
  if (vocab.examples && Array.isArray(vocab.examples)) {
    examples = [...examples, ...vocab.examples];
  }
  
  return {
    id: `${progress.lessonId}_${uniqueId}_${word}`,
    word: word,
    translation: translation,
    definition: definition,
    language: getLanguageFromLesson(lesson),
    partOfSpeech: vocab.partOfSpeech || vocab.type || 'noun',
    difficulty: lesson.metadata?.difficulty || lesson.level || 'beginner',
    source: 'lesson',
    lessonId: progress.lessonId,
    lessonName: lesson.lessonName || lesson.title,
    progress: Math.round(progress.progressPercent || 0),
    examples: examples,
    updatedAt: progress.updatedAt || new Date().toISOString(),
    metadata: {
      stepType: vocab.stepType || 'vocabulary',
      lessonSubject: lesson.subject,
      extractedFrom: 'lesson_steps'
    }
  };
}

function getLanguageFromLesson(lesson) {
  const title = (lesson.lessonName || lesson.title || '').toLowerCase();
  const subject = (lesson.subject || '').toLowerCase();
  const description = (lesson.description || '').toLowerCase();
  
  const patterns = {
    english: ['english', 'английский', 'англ', 'eng', 'vocabulary', 'words'],
    russian: ['russian', 'русский', 'рус', 'rus', 'русский язык'],
    spanish: ['spanish', 'испанский', 'español', 'esp'],
    french: ['french', 'французский', 'français', 'fr'],
    german: ['german', 'немецкий', 'deutsch', 'de'],
    uzbek: ['uzbek', 'узбекский', 'o\'zbek', 'uz']
  };
  
  const searchText = `${title} ${subject} ${description}`.toLowerCase();
  
  for (const [language, keywords] of Object.entries(patterns)) {
    if (keywords.some(keyword => searchText.includes(keyword))) {
      return language;
    }
  }
  
  return 'english';
}

function getLanguageDisplayName(code) {
  const names = {
    'english': 'English',
    'spanish': 'Spanish',
    'french': 'French',
    'german': 'German',
    'russian': 'Russian',
    'chinese': 'Chinese',
    'arabic': 'Arabic',
    'japanese': 'Japanese',
    'uzbek': 'Uzbek',
    'korean': 'Korean'
  };
  return names[code] || code.charAt(0).toUpperCase() + code.slice(1);
}

function getLanguageDisplayNameRu(code) {
  const names = {
    'english': 'Английский',
    'spanish': 'Испанский',
    'french': 'Французский',
    'german': 'Немецкий',
    'russian': 'Русский',
    'chinese': 'Китайский',
    'arabic': 'Арабский',
    'japanese': 'Японский',
    'uzbek': 'Узбекский',
    'korean': 'Корейский'
  };
  return names[code] || getLanguageDisplayName(code);
}

// ========================================
// 🚨 ERROR HANDLING MIDDLEWARE
// ========================================

router.use((error, req, res, next) => {
  console.error('❌ Vocabulary Route Error:', {
    message: error.message,
    name: error.name,
    path: error.path,
    value: error.value,
    url: req.originalUrl,
    method: req.method
  });

  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format',
      field: error.path,
      value: error.value
    });
  }

  if (error.name === 'ValidationError') {
    const validationErrors = Object.values(error.errors).map(e => ({
      field: e.path,
      message: e.message,
      value: e.value
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: validationErrors
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router;