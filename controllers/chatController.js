// controllers/chatController.js - ENHANCED VERSION WITH LESSON CONTEXT
const axios = require('axios');
const Lesson = require('../models/lesson');
const User = require('../models/user');
require('dotenv').config();

// Helper function to get current month key for usage tracking
const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
};

// Helper function to check usage limits
const checkUsageLimits = (plan, currentUsage, hasImage = false) => {
  const limits = {
    free: { messages: 50, images: 5 },
    start: { messages: -1, images: 20 }, // -1 means unlimited
    pro: { messages: -1, images: -1 }
  };

  const planLimits = limits[plan] || limits.free;
  
  // Check message limit
  if (planLimits.messages !== -1 && currentUsage.messages >= planLimits.messages) {
    return {
      allowed: false,
      reason: 'message_limit_exceeded',
      message: `Достигнут лимит сообщений (${planLimits.messages}) для плана "${plan}". Обновите план для продолжения.`
    };
  }
  
  // Check image limit if image is attached
  if (hasImage && planLimits.images !== -1 && currentUsage.images >= planLimits.images) {
    return {
      allowed: false,
      reason: 'image_limit_exceeded',
      message: `Достигнут лимит изображений (${planLimits.images}) для плана "${plan}". Обновите план для продолжения.`
    };
  }
  
  return {
    allowed: true,
    remaining: {
      messages: planLimits.messages === -1 ? '∞' : Math.max(0, planLimits.messages - currentUsage.messages),
      images: planLimits.images === -1 ? '∞' : Math.max(0, planLimits.images - currentUsage.images)
    }
  };
};

// Helper function to track AI usage
const trackAIUsage = async (userId, usageData) => {
  try {
    const monthKey = getCurrentMonthKey();
    
    // Find user and update usage
    const user = await User.findOne({ firebaseId: userId });
    if (!user) {
      console.warn('⚠️ User not found for usage tracking:', userId);
      return;
    }

    // Initialize usage tracking if not exists
    if (!user.aiUsage) {
      user.aiUsage = {};
    }
    
    if (!user.aiUsage[monthKey]) {
      user.aiUsage[monthKey] = { messages: 0, images: 0 };
    }

    // Update usage
    user.aiUsage[monthKey].messages += usageData.messages || 0;
    user.aiUsage[monthKey].images += usageData.images || 0;
    
    // Add metadata
    if (usageData.lessonId) {
      if (!user.aiUsage[monthKey].lessons) {
        user.aiUsage[monthKey].lessons = {};
      }
      user.aiUsage[monthKey].lessons[usageData.lessonId] = 
        (user.aiUsage[monthKey].lessons[usageData.lessonId] || 0) + 1;
    }

    await user.save();
    console.log('✅ AI usage tracked successfully:', {
      userId,
      monthKey,
      newUsage: user.aiUsage[monthKey]
    });

  } catch (error) {
    console.error('❌ Failed to track AI usage:', error);
  }
};

// Helper function to get user usage
const getUserUsage = async (userId) => {
  try {
    const user = await User.findOne({ firebaseId: userId });
    if (!user) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    const monthKey = getCurrentMonthKey();
    const usage = user.aiUsage?.[monthKey] || { messages: 0, images: 0 };
    const plan = user.subscriptionPlan || 'free';

    return {
      success: true,
      usage,
      plan,
      monthKey
    };
  } catch (error) {
    console.error('❌ Failed to get user usage:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// ✅ ENHANCED: Standard AI chat with lesson context support
const getAIResponse = async (req, res) => {
  try {
    const { userInput, imageUrl, lessonId } = req.body;
    const userId = req.user?.uid || req.user?.firebaseId;

    if (!userInput && !imageUrl) {
      return res.status(400).json({ error: '❌ Нет запроса или изображения' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: '❌ Отсутствует API-ключ OpenAI' });
    }

    if (!userId) {
      return res.status(401).json({ error: '❌ Пользователь не авторизован' });
    }

    // Check usage limits
    const usageInfo = await getUserUsage(userId);
    if (!usageInfo.success) {
      return res.status(500).json({ error: 'Не удалось проверить лимиты использования' });
    }

    const limitCheck = checkUsageLimits(usageInfo.plan, usageInfo.usage, !!imageUrl);
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: limitCheck.message });
    }

    // 🔒 Filter sensitive topics
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
        reply: '🚫 Ваш вопрос содержит чувствительные или запрещённые темы. Попробуйте переформулировать.'
      });
    }

    // 🧠 Enhanced context from lesson
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

    // 🔤 Message structure for OpenAI
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

    console.log("📤 Enhanced prompt to OpenAI for lesson:", lessonId || 'general');

    // 🌐 Send to OpenAI
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

    // Track usage
    await trackAIUsage(userId, {
      messages: 1,
      images: imageUrl ? 1 : 0,
      lessonId: lessonId
    });

    res.json({ 
      reply,
      usage: limitCheck.remaining,
      lessonContext: !!lessonData
    });

  } catch (error) {
    console.error("❌ Ошибка от AI:", error.response?.data || error.message);
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return res.status(504).json({
        error: '⏱️ Запрос занял слишком много времени. Попробуйте снова.'
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: '⏳ Слишком много запросов к AI. Подождите немного и попробуйте снова.'
      });
    }

    res.status(500).json({
      error: '⚠️ Ошибка при получении ответа от AI',
      debug: process.env.NODE_ENV === 'development' ? (error.response?.data || error.message) : undefined
    });
  }
};

// ✅ NEW: Enhanced lesson-context chat endpoint
const getLessonContextAIResponse = async (req, res) => {
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

    // Check usage limits
    const usageInfo = await getUserUsage(userId);
    if (!usageInfo.success) {
      return res.status(500).json({
        success: false,
        error: 'Не удалось проверить лимиты использования'
      });
    }

    const limitCheck = checkUsageLimits(usageInfo.plan, usageInfo.usage, false);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: limitCheck.message
      });
    }

    // Build enhanced system prompt for lesson context
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

    console.log('🎓 Lesson-context AI request:', {
      userId,
      lessonId: lessonContext.lessonId,
      currentStep: userProgress?.currentStep,
      stepType: stepContext?.type
    });

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

    // Track usage
    await trackAIUsage(userId, {
      messages: 1,
      images: 0,
      lessonId: lessonContext.lessonId,
      context: 'lesson'
    });

    console.log('✅ Lesson AI response generated successfully');

    res.json({
      success: true,
      reply: aiReply,
      context: 'lesson-integrated',
      usage: limitCheck.remaining
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

// Helper function to build lesson-specific system prompt
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

// ✅ NEW: Get user usage statistics
const getUserUsageStats = async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.firebaseId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не авторизован'
      });
    }

    const usageInfo = await getUserUsage(userId);
    if (!usageInfo.success) {
      return res.status(500).json(usageInfo);
    }

    const limitCheck = checkUsageLimits(usageInfo.plan, usageInfo.usage, false);

    res.json({
      success: true,
      usage: usageInfo.usage,
      plan: usageInfo.plan,
      limits: limitCheck.remaining,
      monthKey: usageInfo.monthKey
    });

  } catch (error) {
    console.error('❌ Error getting usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Не удалось получить статистику использования'
    });
  }
};

module.exports = { 
  getAIResponse, 
  getLessonContextAIResponse,
  getUserUsageStats 
};