// routes/vocabularyRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Vocabulary = require('../models/vocabulary');
const { VocabularyCategory, VocabularyProgress, VocabularyDialogue } = require('../models/vocabulary');
const verifyToken = require('../middlewares/authMiddleware');

console.log('✅ vocabularyRoutes.js loaded');

// ========================================
// 🌐 PUBLIC ROUTES (Frontend)
// ========================================

// GET /api/vocabulary/languages - Get all available languages
router.get('/languages', async (req, res) => {
  try {
    const languages = await Vocabulary.distinct('language', { isActive: true });
    
    // Map to user-friendly names
    const languageMap = {
      'english': { code: 'english', name: 'English', nameRu: 'Английский' },
      'spanish': { code: 'spanish', name: 'Spanish', nameRu: 'Испанский' },
      'french': { code: 'french', name: 'French', nameRu: 'Французский' },
      'german': { code: 'german', name: 'German', nameRu: 'Немецкий' },
      'chinese': { code: 'chinese', name: 'Chinese', nameRu: 'Китайский' },
      'arabic': { code: 'arabic', name: 'Arabic', nameRu: 'Арабский' },
      'japanese': { code: 'japanese', name: 'Japanese', nameRu: 'Японский' },
      'korean': { code: 'korean', name: 'Korean', nameRu: 'Корейский' },
      'uzbek': { code: 'uzbek', name: 'Uzbek', nameRu: 'Узбекский' },
      'russian': { code: 'russian', name: 'Russian', nameRu: 'Русский' }
    };
    
    const formattedLanguages = languages.map(lang => 
      languageMap[lang] || { code: lang, name: lang, nameRu: lang }
    );
    
    res.json({
      success: true,
      data: formattedLanguages,
      message: '✅ Languages retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching languages:', error);
    res.status(500).json({ error: '❌ Error fetching languages' });
  }
});

// GET /api/vocabulary/topics/:language - Get all topics for a language
router.get('/topics/:language', async (req, res) => {
  try {
    const { language } = req.params;
    
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
    res.status(500).json({ error: '❌ Error fetching topics' });
  }
});

// GET /api/vocabulary/subtopics/:language/:topic - Get subtopics for a language/topic
router.get('/subtopics/:language/:topic', async (req, res) => {
  try {
    const { language, topic } = req.params;
    
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
    res.status(500).json({ error: '❌ Error fetching subtopics' });
  }
});

// GET /api/vocabulary/words/:language/:topic/:subtopic - Get words for a specific subtopic
router.get('/words/:language/:topic/:subtopic', async (req, res) => {
  try {
    const { language, topic, subtopic } = req.params;
    const { page = 1, limit = 50, difficulty, search } = req.query;
    
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
    res.status(500).json({ error: '❌ Error fetching words' });
  }
});

// GET /api/vocabulary/dialogues/:language/:topic/:subtopic - Get dialogues for context
router.get('/dialogues/:language/:topic/:subtopic', async (req, res) => {
  try {
    const { language, topic, subtopic } = req.params;
    
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
    res.status(500).json({ error: '❌ Error fetching dialogues' });
  }
});

// ========================================
// 🔐 USER PROGRESS ROUTES (Authenticated)
// ========================================

// GET /api/vocabulary/progress/:userId - Get user's vocabulary progress
router.get('/progress/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { language, status } = req.query;
    
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
    res.status(500).json({ error: '❌ Error fetching vocabulary progress' });
  }
});

// POST /api/vocabulary/progress/:userId/update - Update word learning progress
router.post('/progress/:userId/update', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { vocabularyId, correct, timeSpent } = req.body;
    
    let progress = await VocabularyProgress.findOne({ userId, vocabularyId });
    
    if (!progress) {
      progress = new VocabularyProgress({
        userId,
        vocabularyId,
        status: 'learning',
        firstSeen: new Date()
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
    res.status(500).json({ error: '❌ Error updating vocabulary progress' });
  }
});

// GET /api/vocabulary/review/:userId - Get words due for review
router.get('/review/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, language } = req.query;
    
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
    res.status(500).json({ error: '❌ Error fetching review words' });
  }
});

// ========================================
// 🛠️ ADMIN ROUTES (Create/Update/Delete)
// ========================================

// GET /api/vocabulary/admin/all - Get all vocabulary (admin)
router.get('/admin/all', verifyToken, async (req, res) => {
  try {
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
    res.status(500).json({ error: '❌ Error fetching admin vocabulary' });
  }
});

// POST /api/vocabulary/admin/create - Create new vocabulary word
router.post('/admin/create', verifyToken, async (req, res) => {
  try {
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
        error: '❌ Validation error',
        details: validationErrors
      });
    }
    
    res.status(500).json({ error: '❌ Error creating vocabulary word' });
  }
});

// PUT /api/vocabulary/admin/:id - Update vocabulary word
router.put('/admin/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
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
      return res.status(404).json({ error: '❌ Vocabulary word not found' });
    }
    
    console.log('✅ Vocabulary word updated:', vocabulary.word);
    
    res.json({
      success: true,
      data: vocabulary,
      message: '✅ Vocabulary word updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating vocabulary word:', error);
    res.status(500).json({ error: '❌ Error updating vocabulary word' });
  }
});

// DELETE /api/vocabulary/admin/:id - Delete vocabulary word
router.delete('/admin/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const vocabulary = await Vocabulary.findByIdAndDelete(id);
    
    if (!vocabulary) {
      return res.status(404).json({ error: '❌ Vocabulary word not found' });
    }
    
    // Also delete any progress records for this word
    await VocabularyProgress.deleteMany({ vocabularyId: id });
    
    console.log('✅ Vocabulary word deleted:', vocabulary.word);
    
    res.json({
      success: true,
      message: '✅ Vocabulary word deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting vocabulary word:', error);
    res.status(500).json({ error: '❌ Error deleting vocabulary word' });
  }
});

// POST /api/vocabulary/admin/bulk-create - Bulk create vocabulary words
router.post('/admin/bulk-create', verifyToken, async (req, res) => {
  try {
    const { words } = req.body;
    
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: '❌ Words array is required' });
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
    
    res.status(500).json({ error: '❌ Error bulk creating vocabulary' });
  }
});
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
      error: '❌ Error fetching vocabulary analytics' 
    });
  }
});

// GET /api/vocabulary/stats/language/:language - Language-specific stats
router.get('/stats/language/:language', async (req, res) => {
  try {
    const { language } = req.params;
    
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
      error: '❌ Error fetching language stats' 
    });
  }
});

// POST /api/vocabulary/user/submit - User word submission
router.post('/user/submit', verifyToken, async (req, res) => {
  try {
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
        error: '❌ Validation error',
        details: validationErrors
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: '❌ Error submitting word' 
    });
  }
});

// ========================================
// 📊 STATISTICS ROUTES
// ========================================

// GET /api/vocabulary/stats/overview - Get vocabulary statistics
router.get('/stats/overview', async (req, res) => {
  try {
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
    res.status(500).json({ error: '❌ Error fetching vocabulary statistics' });
  }
});

// ========================================
// 🔍 SEARCH ROUTES
// ========================================

// GET /api/vocabulary/search - Search vocabulary words
router.get('/search', async (req, res) => {
  try {
    const { q, language, difficulty, limit = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: '❌ Search query must be at least 2 characters' });
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
    res.status(500).json({ error: '❌ Error searching vocabulary' });
  }
});

// ========================================
// 🎮 VOCABULARY GAME ROUTES
// ========================================

// GET /api/vocabulary/game/quiz/:userId - Generate quiz for user
router.get('/game/quiz/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { language, topic, difficulty, count = 10 } = req.query;
    
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
    res.status(500).json({ error: '❌ Error generating quiz' });
  }
});

// POST /api/vocabulary/game/submit/:userId - Submit quiz results
router.post('/game/submit/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { answers, timeSpent } = req.body;
    
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: '❌ Answers must be an array' });
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
    res.status(500).json({ error: '❌ Error submitting quiz' });
  }
});

// ========================================
// 📱 DIALOGUE MANAGEMENT ROUTES
// ========================================

// POST /api/vocabulary/admin/dialogue/create - Create new dialogue
router.post('/admin/dialogue/create', verifyToken, async (req, res) => {
  try {
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
    res.status(500).json({ error: '❌ Error creating dialogue' });
  }
});

// GET /api/vocabulary/admin/dialogues - Get all dialogues (admin)
router.get('/admin/dialogues', verifyToken, async (req, res) => {
  try {
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
    res.status(500).json({ error: '❌ Error fetching dialogues' });
  }
});

// PUT /api/vocabulary/admin/dialogue/:id - Update dialogue
router.put('/admin/dialogue/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
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
      return res.status(404).json({ error: '❌ Dialogue not found' });
    }
    
    console.log('✅ Dialogue updated:', dialogue.title);
    
    res.json({
      success: true,
      data: dialogue,
      message: '✅ Dialogue updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating dialogue:', error);
    res.status(500).json({ error: '❌ Error updating dialogue' });
  }
});

// DELETE /api/vocabulary/admin/dialogue/:id - Delete dialogue
router.delete('/admin/dialogue/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const dialogue = await VocabularyDialogue.findByIdAndDelete(id);
    
    if (!dialogue) {
      return res.status(404).json({ error: '❌ Dialogue not found' });
    }
    
    console.log('✅ Dialogue deleted:', dialogue.title);
    
    res.json({
      success: true,
      message: '✅ Dialogue deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting dialogue:', error);
    res.status(500).json({ error: '❌ Error deleting dialogue' });
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
      return res.status(400).json({ error: '❌ CSV data is required as array' });
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
      error: '❌ Error importing CSV', 
      details: error.message 
    });
  }
});

// DELETE /api/vocabulary/admin/cleanup - Cleanup/delete operations
router.delete('/admin/cleanup', verifyToken, async (req, res) => {
  try {
    const { action, language, topic } = req.body;
    
    let result;
    
    switch (action) {
      case 'delete-language':
        if (!language) {
          return res.status(400).json({ error: '❌ Language is required' });
        }
        result = await Vocabulary.deleteMany({ language });
        await VocabularyProgress.deleteMany({
          vocabularyId: { $in: await Vocabulary.find({ language }).select('_id') }
        });
        break;
        
      case 'delete-topic':
        if (!language || !topic) {
          return res.status(400).json({ error: '❌ Language and topic are required' });
        }
        result = await Vocabulary.deleteMany({ language, topic });
        break;
        
      case 'delete-inactive':
        result = await Vocabulary.deleteMany({ isActive: false });
        break;
        
      case 'cleanup-orphaned':
        // Delete progress records for non-existent vocabulary
        const vocabularyIds = await Vocabulary.find().distinct('_id');
        result = await VocabularyProgress.deleteMany({
          vocabularyId: { $nin: vocabularyIds }
        });
        break;
        
      default:
        return res.status(400).json({ error: '❌ Invalid cleanup action' });
    }
    
    console.log(`✅ Cleanup completed: ${action}`, result);
    
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `✅ Cleanup completed: ${result.deletedCount} items processed`
    });
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    res.status(500).json({ error: '❌ Error during cleanup' });
  }
});

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
      error: '❌ Invalid ID format',
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
      error: '❌ Validation error',
      details: validationErrors
    });
  }

  res.status(500).json({
    error: '❌ Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router;