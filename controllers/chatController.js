// controllers/chatController.js - Complete Chat Controller with AI Usage Tracking
const axios = require('axios');
const Lesson = require('../models/lesson');
const User = require('../models/user');
const { AIUsageService } = require('../models/aiUsage');
require('dotenv').config();

// ============================================
// AI USAGE HELPER FUNCTIONS
// ============================================

const checkAIUsageLimits = async (userId) => {
  try {
    // Get user's current plan
    let userPlan = 'free';
    try {
      const user = await User.findOne({ firebaseId: userId });
      if (user) {
        userPlan = user.subscriptionPlan || 'free';
      }
    } catch (userError) {
      console.warn('⚠️ Could not fetch user plan, defaulting to free:', userError.message);
    }

    // Check usage with our global service
    const usageCheck = await AIUsageService.checkUsageLimit(userId, userPlan);
    
    return {
      allowed: usageCheck.allowed,
      reason: usageCheck.reason || 'unknown',
      message: usageCheck.message || 'Usage check failed',
      remaining: usageCheck.remaining || 0,
      percentage: usageCheck.percentage || 0,
      plan: userPlan,
      unlimited: usageCheck.remaining === -1
    };

  } catch (error) {
    console.error('❌ Error checking AI usage limits:', error);
    return {
      allowed: false,
      reason: 'error',
      message: 'Unable to verify usage limits',
      remaining: 0,
      percentage: 100,
      plan: 'free',
      unlimited: false
    };
  }
};

const trackAIUsage = async (userId, metadata = {}) => {
  try {
    // Get user's current plan
    let userPlan = 'free';
    try {
      const user = await User.findOne({ firebaseId: userId });
      if (user) {
        userPlan = user.subscriptionPlan || 'free';
      }
    } catch (userError) {
      console.warn('⚠️ Could not fetch user plan for tracking:', userError.message);
    }

    // Track with our global service
    const trackingResult = await AIUsageService.trackMessage(userId, userPlan, metadata);
    
    if (trackingResult.success) {
      console.log(`📊 AI usage tracked: User ${userId} (${userPlan}) - ${trackingResult.usage} messages`);
    } else {
      console.error('❌ Failed to track AI usage:', trackingResult.error);
    }

    return trackingResult;

  } catch (error) {
    console.error('❌ Error tracking AI usage:', error);
    return { success: false, error: error.message };
  }
};

// ============================================
// MAIN AI CHAT ENDPOINTS
// ============================================

// Standard AI chat with global usage tracking
const getAIResponse = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { userInput, imageUrl, lessonId } = req.body;
    const userId = req.user?.uid || req.user?.firebaseId;

    // Input validation
    if (!userInput && !imageUrl) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Нет запроса или изображения' 
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        success: false,
        error: '❌ Отсутствует API-ключ OpenAI' 
      });
    }

    if (!userId) {
      return res.status(401).json({ 
        success: false,
        error: '❌ Пользователь не авторизован' 
      });
    }

    // Check AI usage limits with global tracking
    console.log(`🤖 Checking AI usage for user: ${userId}`);
    const usageCheck = await checkAIUsageLimits(userId);
    
    if (!usageCheck.allowed) {
      console.log(`🚫 AI usage limit exceeded for user ${userId}: ${usageCheck.message}`);
      
      return res.status(429).json({ 
        success: false,
        error: usageCheck.message,
        usage: {
          remaining: usageCheck.remaining,
          percentage: usageCheck.percentage,
          plan: usageCheck.plan,
          unlimited: usageCheck.unlimited
        },
        limitExceeded: true
      });
    }

    console.log(`✅ AI usage check passed for user ${userId} (${usageCheck.plan}): ${usageCheck.remaining} remaining`);

    // Content filtering
    const bannedWords = [
      'суицид', 'секс', 'порно', 'насилие', 'терроризм', 'убийство', 'оружие',
      'наркотики', 'алкоголь', 'расизм', 'гомофобия', 'сект', 'религия',
      'ислам', 'христианство', 'иудаизм', 'церковь', 'коран', 'библия', 'талмуд',
      'пророк', 'бог', 'сатана', 'луцифер', 'атеизм',
      'политика', 'путин', 'зеленский', 'байден', 'трамп', 'нацизм', 'гитлер',
      'власть', 'правительство', 'парламент', 'вакцина', 'covid', 'беженцы'
    ];
    
    const safeWords = ['кто', 'что', 'где', 'когда', 'какой', 'какая', 'какие', 'каков'];
    const lowerText = (userInput || '').toLowerCase();

    const isHighlySensitive = bannedWords.some(word =>
      lowerText.includes(word) && !safeWords.some(safe => lowerText.includes(safe))
    );

    if (isHighlySensitive) {
      return res.status(403).json({
        success: false,
        error: '🚫 Ваш вопрос содержит чувствительные или запрещённые темы. Попробуйте переформулировать.'
      });
    }

    // Get lesson context if provided
    let lessonContext = '';
    let lessonData = null;
    if (lessonId) {
      try {
        lessonData = await Lesson.findById(lessonId);
        if (lessonData) {
          lessonContext = `
КОНТЕКСТ УРОКА:
- Название: ${lessonData.lessonName}
- Тема: ${lessonData.topic}
- Предмет: ${lessonData.subject}
- Уровень: ${lessonData.level}
- Описание: ${lessonData.description}
- Количество шагов: ${lessonData.steps?.length || 'неизвестно'}
${lessonData.content ? `- Содержание: ${lessonData.content}` : ''}
${lessonData.hint ? `- Подсказки: ${lessonData.hint}` : ''}`;
        }
      } catch (err) {
        console.warn('⚠️ Ошибка при получении урока:', err.message);
      }
    }

    // Prepare OpenAI message
    const contentArray = [];
    if (imageUrl) {
      contentArray.push({
        type: 'image_url',
        image_url: { url: imageUrl, detail: 'auto' },
      });
    }
    if (userInput) {
      contentArray.push({
        type: 'text',
        text: userInput,
      });
    }

    const systemPrompt = `Ты — опытный и дружелюбный преподаватель-помощник на образовательной платформе ACED.

${lessonContext || 'ОБЩИЙ РЕЖИМ: Помоги студенту с его вопросом.'}

ТВОЯ РОЛЬ:
- Объясняй сложные концепции простым языком
- Давай практические примеры и аналогии
- Поощряй обучение и мотивируй студента
- Будь терпеливым и поддерживающим
- Адаптируй объяснения под уровень студента

ПРАВИЛА ОТВЕТОВ:
- Используй ясный, понятный русский язык
- Структурируй ответы с заголовками и списками
- Давай пошаговые объяснения для сложных тем
- Включай примеры из реальной жизни
- Поощряй дальнейшие вопросы
- Ограничь ответ 500 словами
- НЕ обсуждай политику, религию или чувствительные темы

${lessonData ? `
ОСОБЫЕ УКАЗАНИЯ ДЛЯ УРОКА:
- Связывай ответы с темой урока: "${lessonData.topic}"
- Учитывай уровень: ${lessonData.level} класс
- Предмет: ${lessonData.subject}
- Если студент испытывает трудности, предложи разбить задачу на более простые шаги
` : ''}`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: contentArray,
      }
    ];

    console.log(`🌐 Sending request to OpenAI for user ${userId}`);

    // Send to OpenAI
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages,
        max_tokens: 1000,
        temperature: 0.7,
        presence_penalty: 0.3,
        frequency_penalty: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const reply = response?.data?.choices?.[0]?.message?.content?.trim() || "⚠️ AI не смог дать ответ.";
    const responseTime = Date.now() - startTime;

    console.log(`✅ OpenAI response received in ${responseTime}ms`);

    // Track usage globally after successful response
    const trackingResult = await trackAIUsage(userId, {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      responseTime: responseTime,
      lessonId: lessonId,
      hasImage: !!imageUrl
    });

    // Get updated usage stats
    const updatedUsageCheck = await checkAIUsageLimits(userId);

    console.log(`📊 AI usage tracked for user ${userId}. Remaining: ${updatedUsageCheck.remaining}`);

    res.json({ 
      success: true,
      reply: reply,
      usage: {
        current: updatedUsageCheck.remaining === -1 ? 0 : (updatedUsageCheck.percentage / 100) * (updatedUsageCheck.remaining + 1),
        remaining: updatedUsageCheck.remaining,
        percentage: updatedUsageCheck.percentage,
        plan: updatedUsageCheck.plan,
        unlimited: updatedUsageCheck.unlimited,
        limit: updatedUsageCheck.remaining === -1 ? -1 : updatedUsageCheck.remaining + Math.floor(updatedUsageCheck.percentage / 100 * 50)
      },
      lessonContext: !!lessonData,
      responseTime: responseTime
    });

  } catch (error) {
    console.error("❌ Ошибка от AI:", error.response?.data || error.message);
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        error: '⏱️ Запрос занял слишком много времени. Попробуйте снова.'
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        success: false,
        error: '⏳ Слишком много запросов к AI. Подождите немного и попробуйте снова.'
      });
    }

    res.status(500).json({
      success: false,
      error: '⚠️ Ошибка при получении ответа от AI',
      debug: process.env.NODE_ENV === 'development' ? (error.response?.data || error.message) : undefined
    });
  }
};

// Enhanced lesson-context chat endpoint
const getLessonContextAIResponse = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { userInput, lessonContext, userProgress, stepContext } = req.body;
    const userId = req.user?.uid || req.user?.firebaseId;

    if (!userInput || !lessonContext) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствует вопрос или контекст урока'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не авторизован'
      });
    }

    // Check AI usage limits
    console.log(`🤖 Checking lesson AI usage for user: ${userId}`);
    const usageCheck = await checkAIUsageLimits(userId);
    
    if (!usageCheck.allowed) {
      console.log(`🚫 AI usage limit exceeded for lesson chat user ${userId}: ${usageCheck.message}`);
      
      return res.status(429).json({
        success: false,
        error: usageCheck.message,
        usage: {
          remaining: usageCheck.remaining,
          percentage: usageCheck.percentage,
          plan: usageCheck.plan,
          unlimited: usageCheck.unlimited
        },
        limitExceeded: true
      });
    }

    // Build lesson-specific system prompt
    const systemPrompt = buildLessonSystemPrompt(lessonContext, userProgress, stepContext);

    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userInput
      }
    ];

    console.log(`🌐 Sending lesson context request to OpenAI for user ${userId}`);

    // Call OpenAI
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages,
        max_tokens: 600,
        temperature: 0.7,
        presence_penalty: 0.4,
        frequency_penalty: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const aiReply = response?.data?.choices?.[0]?.message?.content?.trim() || 
      'Извините, не смог сформулировать ответ. Попробуйте переформулировать вопрос.';

    const responseTime = Date.now() - startTime;
    console.log(`✅ Lesson context response received in ${responseTime}ms`);

    // Track usage globally after successful response
    const trackingResult = await trackAIUsage(userId, {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      responseTime: responseTime,
      lessonId: lessonContext.lessonId,
      context: 'lesson',
      stepType: stepContext?.type
    });

    // Get updated usage stats
    const updatedUsageCheck = await checkAIUsageLimits(userId);

    console.log(`📊 Lesson AI usage tracked for user ${userId}. Remaining: ${updatedUsageCheck.remaining}`);

    res.json({
      success: true,
      reply: aiReply,
      context: 'lesson-integrated',
      usage: {
        current: updatedUsageCheck.remaining === -1 ? 0 : (updatedUsageCheck.percentage / 100) * (updatedUsageCheck.remaining + 1),
        remaining: updatedUsageCheck.remaining,
        percentage: updatedUsageCheck.percentage,
        plan: updatedUsageCheck.plan,
        unlimited: updatedUsageCheck.unlimited,
        limit: updatedUsageCheck.remaining === -1 ? -1 : updatedUsageCheck.remaining + Math.floor(updatedUsageCheck.percentage / 100 * 50)
      },
      responseTime: responseTime
    });

  } catch (error) {
    console.error('❌ Lesson context AI error:', error);
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        error: 'Запрос занял слишком много времени. Попробуйте снова.'
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Превышен лимит запросов к AI. Подождите и попробуйте снова.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Ошибка AI сервиса'
    });
  }
};

// ============================================
// AI USAGE MANAGEMENT ENDPOINTS
// ============================================

// Get user AI usage statistics
const getUserAIUsageStats = async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.firebaseId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не авторизован'
      });
    }

    console.log(`📊 Getting AI usage stats for user: ${userId}`);

    const usageStats = await AIUsageService.getUserUsageStats(userId);
    
    if (!usageStats.success) {
      return res.status(500).json({
        success: false,
        error: usageStats.error || 'Не удалось получить статистику использования'
      });
    }

    res.json({
      success: true,
      usage: {
        messages: usageStats.data.current,
        current: usageStats.data.current,
        limit: usageStats.data.limit,
        remaining: usageStats.data.remaining,
        percentage: usageStats.data.percentage,
        unlimited: usageStats.data.unlimited,
        plan: usageStats.data.plan
      },
      message: 'Статистика использования AI получена успешно'
    });

  } catch (error) {
    console.error('❌ Error getting AI usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения статистики использования AI'
    });
  }
};

// Check if user can send AI message
const checkCanSendAIMessage = async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.firebaseId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не авторизован'
      });
    }

    const usageCheck = await checkAIUsageLimits(userId);

    res.json({
      success: true,
      canSend: usageCheck.allowed,
      usage: {
        remaining: usageCheck.remaining,
        percentage: usageCheck.percentage,
        plan: usageCheck.plan,
        unlimited: usageCheck.unlimited
      },
      reason: usageCheck.reason,
      message: usageCheck.message
    });

  } catch (error) {
    console.error('❌ Error checking can send message:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка проверки лимитов сообщений'
    });
  }
};

// Update user AI plan (when subscription changes)
const updateUserAIPlan = async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.firebaseId;
    const { newPlan } = req.body;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не авторизован'
      });
    }

    if (!['free', 'start', 'pro', 'premium'].includes(newPlan)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный план подписки'
      });
    }

    console.log(`🔄 Updating AI plan for user ${userId}: ${newPlan}`);

    const updateResult = await AIUsageService.updateUserPlan(userId, newPlan);
    
    if (!updateResult.success) {
      return res.status(500).json({
        success: false,
        error: updateResult.error || 'Не удалось обновить план'
      });
    }

    // Get updated usage stats
    const updatedUsageCheck = await checkAIUsageLimits(userId);

    res.json({
      success: true,
      message: `План AI обновлён на: ${newPlan}`,
      usage: {
        remaining: updatedUsageCheck.remaining,
        percentage: updatedUsageCheck.percentage,
        plan: updatedUsageCheck.plan,
        unlimited: updatedUsageCheck.unlimited
      }
    });

  } catch (error) {
    console.error('❌ Error updating AI plan:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка обновления плана AI'
    });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Build lesson-specific system prompt
function buildLessonSystemPrompt(lessonContext, userProgress, stepContext) {
  const currentStepType = stepContext?.type || 'unknown';
  const lessonName = lessonContext?.lessonName || 'Текущий урок';
  const topic = lessonContext?.topic || 'данной теме';
  const mistakes = userProgress?.mistakes || 0;
  const stars = userProgress?.stars || 0;
  const completedSteps = userProgress?.completedSteps?.length || 0;
  const totalSteps = lessonContext?.totalSteps || 1;
  const currentStepIndex = userProgress?.currentStep || 0;
  
  let roleGuidance = '';
  switch (currentStepType) {
    case 'explanation':
      roleGuidance = 'Помоги студенту лучше понять концепцию с помощью понятных объяснений и примеров.';
      break;
    case 'exercise':
      roleGuidance = 'Давай полезные подсказки и направляй мышление, но НЕ давай прямых ответов на упражнения.';
      break;
    case 'quiz':
    case 'tryout':
      roleGuidance = 'Помоги проанализировать вопрос и обдумать его пошагово, но НЕ давай прямых ответов.';
      break;
    case 'vocabulary':
      roleGuidance = 'Помоги с значениями слов, использованием и техниками запоминания.';
      break;
    default:
      roleGuidance = 'Предоставь полезные рекомендации для текущего этапа обучения.';
  }

  // Adjust tone based on performance
  let encouragementLevel = '';
  if (mistakes > 3) {
    encouragementLevel = 'Студент испытывает трудности, будь особенно ободряющим и терпеливым. Разбивай материал на более простые шаги.';
  } else if (mistakes === 0 && stars > 2) {
    encouragementLevel = 'Студент очень хорошо справляется! Можешь быть более детальным и предлагать дополнительные задачи.';
  } else {
    encouragementLevel = 'Студент делает нормальный прогресс. Будь поддерживающим и полезным.';
  }

  const progressPercentage = Math.round((completedSteps / totalSteps) * 100);

  return `Ты — ободряющий AI-репетитор, помогающий студенту с уроком "${lessonName}" (Тема: ${topic}).

ТЕКУЩИЙ КОНТЕКСТ:
- Прогресс урока: Шаг ${currentStepIndex + 1} из ${totalSteps} (${progressPercentage}% выполнено)
- Тип текущего шага: ${currentStepType}
- Результаты студента: ${mistakes} ошибок, ${stars} звёзд заработано
- Оценка успеваемости: ${encouragementLevel}

ТВОЯ РОЛЬ: ${roleGuidance}

ПРАВИЛА ОТВЕТОВ:
- Будь тёплым, ободряющим и поддерживающим
- Используй простой, понятный язык, подходящий для обучения
- Отвечай кратко (2-4 предложения максимум)
- Для упражнений/тестов: Давай подсказки и направления, НЕ прямые ответы
- Для объяснений: Предоставляй ясность и примеры
- Если студент испытывает трудности: Разбивай концепции на более мелкие, управляемые части
- Всегда заканчивай на позитивной, ободряющей ноте
- Используй эмодзи умеренно (максимум 1-2) для дружелюбности, но сохраняй профессионализм

КРИТИЧЕСКИ ВАЖНО: Никогда не давай прямых ответов на упражнения или вопросы тестов. Всегда направляй процесс мышления студента.

ОСОБЫЕ УКАЗАНИЯ:
- Если студент задаёт вопрос типа "что такое..." - давай чёткое определение с примером
- Если просит помощь с упражнением - давай наводящие вопросы и подсказки
- Если не понимает концепцию - предложи аналогию или простое объяснение
- Всегда связывай ответы с контекстом текущего урока`;
}

module.exports = { 
  getAIResponse, 
  getLessonContextAIResponse,
  getUserAIUsageStats,
  checkCanSendAIMessage,
  updateUserAIPlan
};