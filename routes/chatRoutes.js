// routes/chatRoutes.js - Complete Chat Routes with AI Usage Tracking & Voice Integration
const express = require('express');
const router = express.Router();
const {
  getAIResponse,
  getLessonContextAIResponse,
  analyzeLessonForSpeech,
  getUserAIUsageStats,
  checkCanSendAIMessage,
  updateUserAIPlan,
  getLessonChatHistory,
  clearLessonChatHistory,
  getUserLearningStats
} = require('../controllers/chatController');

// НОВОЕ: Импорт контроллера для голоса
const voiceController = require('../controllers/voiceController');

const verifyToken = require('../middlewares/authMiddleware');
const createRateLimiter = require('../middlewares/rateLimiter');

// Rate limiters - Increased for production use (100+ concurrent users)
const chatLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 60, // 60 requests per minute per user (1 per second avg)
  message: { success: false, error: 'Too many chat requests, please try again later.' }
});

// Separate rate limiter for analyze-speech (can be called frequently during lessons)
const analyzeSpeechLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 30, // 30 analyze requests per minute per user
  message: { success: false, error: 'Too many speech analysis requests, please slow down.' }
});

// ============================================
// MIDDLEWARE
// ============================================

// Logging middleware for chat routes
router.use((req, res, next) => {
  next();
});

// ============================================
// CORE AI CHAT ENDPOINTS
// ============================================

// Standard AI Chat with enhanced lesson context
router.post('/', verifyToken, chatLimiter, getAIResponse);

// Enhanced lesson-specific AI chat
router.post('/lesson-context', verifyToken, chatLimiter, getLessonContextAIResponse);

// Analyze lesson content for speech & highlights (Perfect Harmony endpoint)
router.post('/analyze-speech', verifyToken, analyzeSpeechLimiter, analyzeLessonForSpeech);

// GET handler for endpoints that require POST - return proper error
router.get('/analyze-speech', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Method Not Allowed. This endpoint requires a POST request.',
    method: req.method,
    endpoint: '/api/chat/analyze-speech',
    requiredBody: {
      lessonContent: 'string (required)',
      stepContext: 'string (optional)',
      stepType: 'string (optional)'
    }
  });
});

router.get('/lesson-context', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Method Not Allowed. This endpoint requires a POST request.',
    method: req.method,
    endpoint: '/api/chat/lesson-context',
    requiredBody: {
      userInput: 'string (required)',
      lessonContext: 'object (required)'
    }
  });
});

// ============================================
// VOICE AI ENDPOINTS (ELEVENLABS)
// ============================================

// НОВОЕ: Инициализация голосовой сессии (получение Signed URL и скрипта)
router.post('/init-voice-session', verifyToken, voiceController.initVoiceSession);

// Get exercise context for voice assistant (without initializing session)
router.post('/exercise-context', verifyToken, voiceController.getExerciseContext);

// Process voice/text query with exercise context
router.post('/voice-query', verifyToken, voiceController.processVoiceQuery);

// ============================================
// CHAT HISTORY ENDPOINTS (Memory Feature)
// ============================================

// Get chat history for a lesson
router.get('/history/:lessonId', verifyToken, getLessonChatHistory);

// Clear chat history for a lesson (e.g., when restarting)
router.delete('/history/:lessonId', verifyToken, clearLessonChatHistory);

// Get user's learning statistics (for AI personalization)
router.get('/learning-stats', verifyToken, getUserLearningStats);

// ============================================
// AI USAGE TRACKING ENDPOINTS
// ============================================

// Get user AI usage statistics
router.get('/usage', verifyToken, getUserAIUsageStats);

// Check if user can send AI message
router.get('/can-send', verifyToken, checkCanSendAIMessage);

// Update user AI plan (for subscription changes)
router.post('/update-plan', verifyToken, updateUserAIPlan);

// ============================================
// SPECIALIZED AI ENDPOINTS
// ============================================

// Generate smart hints for exercises
router.post('/smart-hint', verifyToken, async (req, res) => {
  try {
    const { exercise, mistakeCount, lessonContext } = req.body;
    const userId = req.user?.uid || req.user?.firebaseId;

    if (!exercise || mistakeCount < 2) {
      return res.status(400).json({
        success: false,
        error: 'Подсказки доступны после 2 ошибок'
      });
    }

    // Build hint prompt
    const hintPrompt = `Студент испытывает трудности с упражнением:

Вопрос: ${exercise.question}
Количество ошибок: ${mistakeCount}

Сгенерируй ободряющую подсказку, которая:
1. Направляет к правильному процессу мышления
2. Не даёт ответ напрямую
3. Укрепляет уверенность
4. Связана с этим конкретным вопросом

Ограничься 1-2 предложениями и будь поддерживающим.`;

    // Use lesson context AI
    const contextRequest = {
      userInput: hintPrompt,
      lessonContext: lessonContext || {},
      userProgress: { mistakes: mistakeCount },
      stepContext: { type: 'exercise' }
    };

    req.body = contextRequest;
    await getLessonContextAIResponse(req, res);

  } catch (error) {
    console.error('❌ Smart hint error:', error);
    res.status(500).json({
      success: false,
      error: 'Не удалось сгенерировать подсказку'
    });
  }
});

// Generate progress insights
router.post('/progress-insight', verifyToken, async (req, res) => {
  try {
    const { userProgress, lessonContext } = req.body;

    if (!userProgress || !lessonContext) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствует информация о прогрессе или уроке'
      });
    }

    const completionPercent = Math.round((userProgress.completedSteps.length / lessonContext.totalSteps) * 100);
    const accuracy = userProgress.mistakes === 0 ? 100 : Math.max(0, 100 - (userProgress.mistakes * 10));

    const insightPrompt = `Обновление прогресса студента:

Урок: ${lessonContext.lessonName}
Завершено: ${completionPercent}%
Шагов выполнено: ${userProgress.completedSteps.length}/${lessonContext.totalSteps}
Точность: ${accuracy}%
Звёзд заработано: ${userProgress.stars}
Время: ${Math.round(userProgress.elapsedSeconds / 60)} минут

Сгенерируй краткое, ободряющее сообщение о прогрессе, которое:
1. Отмечает их достижения
2. Упоминает, что у них хорошо получается
3. Мягко поощряет продолжать
4. Позитивно и мотивирующе

Максимум 2-3 предложения.`;

    const contextRequest = {
      userInput: insightPrompt,
      lessonContext,
      userProgress,
      stepContext: { type: 'progress' }
    };

    req.body = contextRequest;
    await getLessonContextAIResponse(req, res);

  } catch (error) {
    console.error('❌ Progress insight error:', error);
    res.status(500).json({
      success: false,
      error: 'Не удалось сгенерировать анализ прогресса'
    });
  }
});

// Get help understanding explanations
router.post('/explanation-help', verifyToken, async (req, res) => {
  try {
    const { explanationText, userQuestion, lessonContext } = req.body;

    if (!explanationText || !userQuestion) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствует текст объяснения или вопрос'
      });
    }

    const helpPrompt = `Студент читает объяснение и нуждается в помощи:

Объяснение из урока:
"${explanationText}"

Вопрос студента: ${userQuestion}

Помоги студенту понять это объяснение:
1. Дай более простое объяснение, если нужно
2. Приведи практический пример
3. Ответь на конкретный вопрос студента
4. Свяжи с общей темой урока

Будь ясным и ободряющим.`;

    const contextRequest = {
      userInput: helpPrompt,
      lessonContext: lessonContext || {},
      userProgress: {},
      stepContext: { type: 'explanation' }
    };

    req.body = contextRequest;
    await getLessonContextAIResponse(req, res);

  } catch (error) {
    console.error('❌ Explanation help error:', error);
    res.status(500).json({
      success: false,
      error: 'Не удалось получить помощь с объяснением'
    });
  }
});

// ============================================
// UTILITY ENDPOINTS
// ============================================

// Generate contextual suggestions
router.post('/suggestions', verifyToken, (req, res) => {
  try {
    const { currentStep, userProgress } = req.body;

    const suggestions = generateLessonSuggestions(currentStep, userProgress);

    res.json({
      success: true,
      suggestions
    });

  } catch (error) {
    console.error('❌ Suggestions error:', error);
    res.status(500).json({
      success: false,
      error: 'Не удалось сгенерировать предложения'
    });
  }
});

// Get current AI usage limits for user's plan
router.get('/limits', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.firebaseId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не авторизован'
      });
    }

    // Get user's plan from database
    const User = require('../models/user');
    let userPlan = 'free';

    try {
      const user = await User.findOne({ firebaseId: userId });
      if (user) {
        userPlan = user.subscriptionPlan || 'free';
      }
    } catch (userError) {
    }

    // Get limits from AI usage service
    const { AIUsage } = require('../models/aiUsage');
    const limits = AIUsage.getUsageLimits(userPlan);

    res.json({
      success: true,
      plan: userPlan,
      limits: limits,
      unlimited: limits.aiMessages === -1
    });

  } catch (error) {
    console.error('❌ Error getting AI limits:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения лимитов AI'
    });
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Reset user's monthly usage (admin only)
router.post('/reset-usage', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.firebaseId;
    const { targetUserId } = req.body;

    // Basic admin check (you can enhance this)
    if (!userId || !req.user?.email?.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const userToReset = targetUserId || userId;

    // Reset usage by deleting current month record
    const { AIUsage } = require('../models/aiUsage');
    const currentMonth = AIUsage.getCurrentMonth();

    const result = await AIUsage.deleteOne({
      userId: userToReset,
      currentMonth: currentMonth
    });

    res.json({
      success: true,
      message: `AI usage reset for user ${userToReset}`,
      deletedRecords: result.deletedCount
    });

  } catch (error) {
    console.error('❌ Error resetting AI usage:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сброса использования AI'
    });
  }
});

// Get AI usage analytics (admin only)
router.get('/analytics', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.firebaseId;

    // Basic admin check
    if (!userId || !req.user?.email?.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { AIUsage } = require('../models/aiUsage');
    const currentMonth = AIUsage.getCurrentMonth();

    // Get analytics data
    const [
      totalUsers,
      activeUsers,
      totalMessages,
      planDistribution,
      topUsers
    ] = await Promise.all([
      AIUsage.countDocuments({ currentMonth }),
      AIUsage.countDocuments({
        currentMonth,
        'usage.aiMessages': { $gt: 0 }
      }),
      AIUsage.aggregate([
        { $match: { currentMonth } },
        { $group: { _id: null, total: { $sum: '$usage.aiMessages' } } }
      ]),
      AIUsage.aggregate([
        { $match: { currentMonth } },
        { $group: { _id: '$subscriptionPlan', count: { $sum: 1 }, messages: { $sum: '$usage.aiMessages' } } }
      ]),
      AIUsage.find({ currentMonth })
        .sort({ 'usage.aiMessages': -1 })
        .limit(10)
        .select('userId email usage.aiMessages subscriptionPlan')
    ]);

    res.json({
      success: true,
      analytics: {
        month: currentMonth,
        totalUsers,
        activeUsers,
        totalMessages: totalMessages[0]?.total || 0,
        planDistribution,
        topUsers: topUsers.map(user => ({
          userId: user.userId.substring(0, 8) + '...',
          email: user.email,
          messages: user.usage.aiMessages,
          plan: user.subscriptionPlan
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error getting AI analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения аналитики AI'
    });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate contextual suggestions based on lesson step
function generateLessonSuggestions(currentStep, userProgress) {
  const suggestions = [];

  if (!currentStep) return suggestions;

  switch (currentStep.type) {
    case 'explanation':
      suggestions.push(
        "Можешь объяснить это проще?",
        "Какие ключевые моменты я должен запомнить?",
        "Можешь привести пример из реальной жизни?"
      );
      break;

    case 'exercise':
      if (userProgress?.mistakes > 0) {
        suggestions.push(
          "У меня проблемы с этим, можешь дать подсказку?",
          "Какой подход мне использовать для решения?",
          "Помоги понять, что я делаю неправильно?"
        );
      } else {
        suggestions.push(
          "Правильно ли мой подход?",
          "На чём мне сосредоточиться в этом упражнении?",
          "Можешь проверить моё понимание?"
        );
      }
      break;

    case 'quiz':
    case 'tryout':
      suggestions.push(
        "Я не уверен в этом вопросе, поможешь?",
        "О чём мне думать при ответе на этот вопрос?",
        "Можешь провести меня через это пошагово?"
      );
      break;

    case 'vocabulary':
      suggestions.push(
        "Поможешь запомнить это слово?",
        "Как лучше использовать это слово?",
        "Можешь дать больше примеров?"
      );
      break;

    default:
      suggestions.push(
        "Можешь помочь мне лучше понять это?",
        "На чём мне здесь сосредоточиться?",
        "Есть ли что-то важное, что я должен запомнить?"
      );
  }

  return suggestions;
}

module.exports = router;