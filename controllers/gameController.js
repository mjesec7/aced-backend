// controllers/gameController.js - Game Management Controller

const GameGenerator = require('../services/gameGenerator');
const GameAnalytics = require('../models/gameAnalytics');
const Lesson = require('../models/lesson');
const UserProgress = require('../models/userProgress');
const User = require('../models/user');

/**
 * Generate game from exercise/step
 * POST /api/games/generate
 */
exports.generateGame = async (req, res) => {
  try {
    const { lessonId, stepIndex, gameType, difficulty } = req.body;

    console.log('🎮 Generating game:', { lessonId, stepIndex, gameType, difficulty });

    // Validate inputs
    if (!lessonId || stepIndex === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: lessonId and stepIndex'
      });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ success: false, error: 'Lesson not found' });
    }

    const step = lesson.steps[stepIndex];
    if (!step) {
      return res.status(404).json({ success: false, error: 'Step not found' });
    }

    // Determine game type (from request or step configuration)
    const selectedGameType = gameType || step.gameType || 'basket-catch';

    // Generate game data
    const gameData = GameGenerator.generateGameFromExercise(
      step,
      selectedGameType,
      {
        difficulty: difficulty || step.difficulty || lesson.difficulty || 'medium'
      }
    );

    // Add lesson/step context
    gameData.lessonId = lessonId;
    gameData.stepIndex = stepIndex;
    gameData.subject = lesson.subject;
    gameData.lessonName = lesson.lessonName;
    gameData.stepTitle = step.title;

    console.log(`✅ Generated ${selectedGameType} game with ${gameData.items?.length || 0} items`);

    res.json({
      success: true,
      game: gameData
    });

  } catch (error) {
    console.error('❌ Error generating game:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Submit game results and save analytics
 * POST /api/games/submit
 */
exports.submitGameResults = async (req, res) => {
  try {
    const {
      userId,
      lessonId,
      stepIndex,
      gameType,
      score,
      accuracy,
      timeSpent,
      itemsCollected,
      correctItems,
      wrongItems,
      completed,
      actions,
      metadata
    } = req.body;

    console.log('📊 Submitting game results:', { userId, lessonId, gameType, score });

    // Validate inputs
    if (!userId || !lessonId || stepIndex === undefined || !gameType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Calculate stars based on score/accuracy
    let stars = 0;
    const performanceScore = score || accuracy || 0;
    if (performanceScore >= 90) stars = 3;
    else if (performanceScore >= 70) stars = 2;
    else if (performanceScore >= 50) stars = 1;

    // Calculate points based on score and stars
    const points = Math.floor(score * (stars * 0.1 + 1));

    // Save game analytics
    const gameAnalytics = await GameAnalytics.create({
      userId,
      lessonId,
      stepIndex,
      gameType,
      performance: {
        score: score || 0,
        stars,
        accuracy: accuracy || 0,
        timeSpent: timeSpent || 0,
        itemsCollected: itemsCollected || 0,
        correctItems: correctItems || 0,
        wrongItems: wrongItems || 0,
        attempts: 1
      },
      completed,
      actions: actions || [],
      rewards: {
        points,
        stars,
        badges: stars === 3 ? ['perfect-game'] : [],
        unlocks: []
      },
      metadata: metadata || {}
    });

    // Update user progress
    try {
      await UserProgress.findOneAndUpdate(
        { userId, lessonId },
        {
          $inc: {
            totalPoints: points,
            gamesCompleted: completed ? 1 : 0
          },
          $push: {
            gameResults: {
              stepIndex,
              gameType,
              score,
              stars,
              completed,
              timeSpent,
              completedAt: new Date()
            }
          }
        },
        { upsert: true, new: true }
      );
    } catch (progressError) {
      console.error('⚠️ Failed to update user progress:', progressError);
      // Non-critical, continue
    }

    // Generate response message
    let message = '🎮 Game completed!';
    if (stars === 3) message = '🌟 Perfect! You're amazing!';
    else if (stars === 2) message = '🎉 Excellent work!';
    else if (stars === 1) message = '👍 Good job! Keep practicing!';
    else message = '💪 Keep trying! You can do it!';

    console.log(`✅ Game results saved - Score: ${score}, Stars: ${stars}`);

    res.json({
      success: true,
      result: {
        score,
        stars,
        points,
        message,
        accuracy,
        completed
      },
      analytics: {
        id: gameAnalytics._id,
        savedAt: gameAnalytics.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Error submitting game results:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get game leaderboard
 * GET /api/games/leaderboard/:gameType
 */
exports.getLeaderboard = async (req, res) => {
  try {
    const { gameType } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const timeframe = req.query.timeframe || 'all-time'; // all-time, today, week, month

    console.log('🏆 Fetching leaderboard:', { gameType, limit, timeframe });

    // Build query based on timeframe
    let query = { gameType, completed: true };

    if (timeframe !== 'all-time') {
      const now = new Date();
      let startDate;

      switch (timeframe) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
      }

      if (startDate) {
        query.createdAt = { $gte: startDate };
      }
    }

    const leaderboard = await GameAnalytics.aggregate([
      { $match: query },
      { $sort: { 'performance.score': -1, createdAt: 1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: 'firebaseId',
          as: 'user'
        }
      },
      {
        $project: {
          userId: 1,
          'performance.score': 1,
          'performance.stars': 1,
          'performance.accuracy': 1,
          'performance.timeSpent': 1,
          userName: { $arrayElemAt: ['$user.name', 0] },
          userPhotoURL: { $arrayElemAt: ['$user.photoURL', 0]},
          createdAt: 1
        }
      }
    ]);

    console.log(`✅ Found ${leaderboard.length} leaderboard entries`);

    res.json({
      success: true,
      gameType,
      timeframe,
      leaderboard
    });

  } catch (error) {
    console.error('❌ Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get user's game statistics
 * GET /api/games/stats/:userId
 */
exports.getUserGameStats = async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('📈 Fetching user game stats:', userId);

    const stats = await GameAnalytics.getUserStats(userId);

    // Get overall stats
    const totalGamesPlayed = await GameAnalytics.countDocuments({ userId });
    const totalGamesCompleted = await GameAnalytics.countDocuments({ userId, completed: true });

    // Get best scores for each game type
    const bestScores = await GameAnalytics.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$gameType',
          bestScore: { $max: '$performance.score' },
          totalPlayed: { $sum: 1 },
          avgScore: { $avg: '$performance.score' },
          totalStars: { $sum: '$performance.stars' }
        }
      }
    ]);

    // Recent games
    const recentGames = await GameAnalytics.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('gameType performance createdAt completed');

    console.log(`✅ Found stats for ${totalGamesPlayed} games`);

    res.json({
      success: true,
      userId,
      stats: {
        overall: {
          totalGamesPlayed,
          totalGamesCompleted,
          completionRate: totalGamesPlayed > 0
            ? Math.round((totalGamesCompleted / totalGamesPlayed) * 100)
            : 0
        },
        byGameType: stats,
        bestScores,
        recentGames
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user game stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Convert existing exercise to game
 * POST /api/games/convert-exercise
 */
exports.convertExerciseToGame = async (req, res) => {
  try {
    const { lessonId, stepIndex, gameType } = req.body;

    console.log('🔄 Converting exercise to game:', { lessonId, stepIndex, gameType });

    if (!lessonId || stepIndex === undefined || !gameType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: lessonId, stepIndex, gameType'
      });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ success: false, error: 'Lesson not found' });
    }

    const step = lesson.steps[stepIndex];
    if (!step) {
      return res.status(404).json({ success: false, error: 'Step not found' });
    }

    // Validate step type
    if (!['exercise', 'practice', 'quiz', 'game'].includes(step.type)) {
      return res.status(400).json({
        success: false,
        error: 'Step must be an exercise, practice, quiz, or game type'
      });
    }

    // Generate game configuration
    const gameConfig = GameGenerator.generateGameFromExercise(
      step,
      gameType,
      { difficulty: lesson.difficulty || 'medium' }
    );

    // Update the step with game configuration
    lesson.steps[stepIndex].gameType = gameType;
    lesson.steps[stepIndex].gameConfig = gameConfig;

    await lesson.save();

    console.log(`✅ Converted step ${stepIndex} to ${gameType} game`);

    res.json({
      success: true,
      message: 'Exercise converted to game successfully',
      lessonId,
      stepIndex,
      gameType,
      gameConfig
    });

  } catch (error) {
    console.error('❌ Error converting exercise to game:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get available game types
 * GET /api/games/types
 */
exports.getGameTypes = async (req, res) => {
  try {
    const gameTypes = [
      {
        id: 'basket-catch',
        name: 'Basket Catch',
        description: 'Catch falling correct answers in your basket',
        icon: '🧺',
        category: 'throwing',
        difficulty: ['easy', 'medium', 'hard'],
        bestFor: ['vocabulary', 'categorization', 'quick-recognition']
      },
      {
        id: 'memory-cards',
        name: 'Memory Cards',
        description: 'Match pairs of cards',
        icon: '🃏',
        category: 'matching',
        difficulty: ['easy', 'medium', 'hard'],
        bestFor: ['translations', 'definitions', 'pairs']
      },
      {
        id: 'whack-a-mole',
        name: 'Whack-a-Mole',
        description: 'Hit correct answers as they pop up',
        icon: '🔨',
        category: 'reaction',
        difficulty: ['easy', 'medium', 'hard'],
        bestFor: ['quick-recognition', 'true-false', 'error-spotting']
      },
      {
        id: 'tower-builder',
        name: 'Tower Builder',
        description: 'Stack correct answers to build a tower',
        icon: '🏗️',
        category: 'building',
        difficulty: ['easy', 'medium', 'hard'],
        bestFor: ['sequences', 'sentence-building', 'step-by-step']
      },
      {
        id: 'target-practice',
        name: 'Target Practice',
        description: 'Shoot correct answers at targets',
        icon: '🎯',
        category: 'throwing',
        difficulty: ['easy', 'medium', 'hard'],
        bestFor: ['math-operations', 'translations', 'quick-decisions']
      },
      {
        id: 'maze-runner',
        name: 'Maze Runner',
        description: 'Navigate maze by answering questions',
        icon: '🏃',
        category: 'movement',
        difficulty: ['easy', 'medium', 'hard'],
        bestFor: ['sequential-learning', 'multiple-choice', 'progression']
      },
      {
        id: 'bubble-pop',
        name: 'Bubble Pop',
        description: 'Pop matching bubbles together',
        icon: '💭',
        category: 'matching',
        difficulty: ['easy', 'medium', 'hard'],
        bestFor: ['matching', 'same-values', 'synonyms']
      },
      {
        id: 'lightning-round',
        name: 'Lightning Round',
        description: 'Answer questions as fast as you can',
        icon: '⚡',
        category: 'reaction',
        difficulty: ['easy', 'medium', 'hard'],
        bestFor: ['speed-drills', 'quick-facts', 'multiplication']
      },
      {
        id: 'scale-balance',
        name: 'Scale Balance',
        description: 'Balance scales with correct values',
        icon: '⚖️',
        category: 'strategy',
        difficulty: ['easy', 'medium', 'hard'],
        bestFor: ['equations', 'equivalent-values', 'comparisons']
      },
      {
        id: 'pattern-builder',
        name: 'Pattern Builder',
        description: 'Complete the pattern sequence',
        icon: '🔵🔴',
        category: 'strategy',
        difficulty: ['easy', 'medium', 'hard'],
        bestFor: ['sequences', 'logic', 'predictions']
      }
    ];

    res.json({
      success: true,
      gameTypes,
      total: gameTypes.length
    });

  } catch (error) {
    console.error('❌ Error fetching game types:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
