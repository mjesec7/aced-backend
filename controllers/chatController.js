// controllers/chatController.js - Complete Chat Controller with AI Usage Tracking
const axios = require('axios');
const OpenAI = require('openai');
const Lesson = require('../models/lesson');
const User = require('../models/user');
const UserProgress = require('../models/userProgress');
const LessonChatHistory = require('../models/lessonChatHistory');
const { AIUsageService } = require('../models/aiUsage');
require('dotenv').config();

// ============================================
// USER STATS HELPER FUNCTION
// ============================================

// Fetch comprehensive user statistics for AI context
const getUserStatsForAI = async (userId) => {
  try {
    const stats = {
      overallStats: null,
      recentMistakes: [],
      strongTopics: [],
      weakTopics: [],
      studyStreak: 0,
      totalLessonsCompleted: 0,
      averageAccuracy: 0
    };

    // Get overall user stats
    const overallStats = await UserProgress.getUserStats(userId);
    if (overallStats) {
      stats.overallStats = overallStats;
      stats.totalLessonsCompleted = overallStats.completedLessons || 0;
      stats.averageAccuracy = overallStats.accuracy || 0;
    }

    // Get recent progress to identify patterns
    const recentProgress = await UserProgress.find({ userId })
      .sort({ lastAccessedAt: -1 })
      .limit(10)
      .populate('lessonId', 'lessonName topic subject');

    // Identify topics where user struggles (high mistake ratio)
    const topicMistakes = {};
    const topicSuccesses = {};

    recentProgress.forEach(progress => {
      const topic = progress.lessonId?.topic || 'Unknown';
      if (!topicMistakes[topic]) {
        topicMistakes[topic] = { mistakes: 0, total: 0 };
        topicSuccesses[topic] = { stars: 0, count: 0 };
      }
      topicMistakes[topic].mistakes += progress.mistakes || 0;
      topicMistakes[topic].total += 1;
      topicSuccesses[topic].stars += progress.stars || 0;
      topicSuccesses[topic].count += 1;

      // Track recent mistakes for specific feedback
      if (progress.mistakes > 0 && progress.lessonId) {
        stats.recentMistakes.push({
          lesson: progress.lessonId.lessonName,
          topic: progress.lessonId.topic,
          mistakes: progress.mistakes,
          accuracy: progress.accuracy
        });
      }
    });

    // Determine strong and weak topics
    Object.keys(topicMistakes).forEach(topic => {
      const avgMistakes = topicMistakes[topic].mistakes / topicMistakes[topic].total;
      const avgStars = topicSuccesses[topic].stars / topicSuccesses[topic].count;

      if (avgStars >= 2.5 && avgMistakes < 1) {
        stats.strongTopics.push(topic);
      } else if (avgMistakes >= 2 || avgStars < 1.5) {
        stats.weakTopics.push(topic);
      }
    });

    return stats;
  } catch (error) {
    console.error('Error fetching user stats for AI:', error);
    return null;
  }
};

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper to safely parse JSON from AI response (handles markdown blocks)
const safeJsonParse = (content) => {
  if (!content) return null;
  try {
    // Try direct parse first
    return JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```json\s?([\s\S]*?)\s?```/) || content.match(/```\s?([\s\S]*?)\s?```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (innerError) {
        console.error('❌ Failed to parse JSON from markdown block:', innerError.message);
      }
    }

    // Last resort: find first { and last }
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(content.substring(firstBrace, lastBrace + 1));
      } catch (braceError) {
        console.error('❌ Failed to parse JSON between braces:', braceError.message);
      }
    }

    throw e; // Re-throw if all attempts fail
  }
};

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
    }

    // Track with our global service
    const trackingResult = await AIUsageService.trackMessage(userId, userPlan, metadata);

    if (trackingResult.success) {
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
// LESSON ANALYSIS FOR SPEECH & HIGHLIGHTS
// ============================================

// Analyzes lesson content and generates spoken explanation + highlight phrases
const analyzeLessonForSpeech = async (req, res) => {
  const startTime = Date.now();
  try {
    const { lessonContent, stepContext, stepType, language, isFirstStep } = req.body;
    const userId = req.user?.uid || req.user?.firebaseId;

    // Validation
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не авторизован'
      });
    }

    // Handle if lessonContent is an object (localization)
    let contentToAnalyze = lessonContent;
    if (typeof lessonContent === 'object' && lessonContent !== null) {
      contentToAnalyze = lessonContent.en || lessonContent.ru || lessonContent.uz || JSON.stringify(lessonContent);
    }

    if (!contentToAnalyze || String(contentToAnalyze).trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Контент урока отсутствует'
      });
    }

    // Check AI usage limits
    const usageCheck = await checkAIUsageLimits(userId);
    if (!usageCheck.allowed) {
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

    // Determine target language instructions
    // Determine target language instructions
    let targetLang = 'English';
    let langInstruction = 'Answer in ENGLISH. The explanation must be in English.';
    let exampleExplanation = "Hello! Let's look at...";
    let exampleQuestion = "Why do you think...?";

    if (language === 'ru') {
      targetLang = 'Russian';
      langInstruction = 'Отвечай на РУССКОМ языке. Объяснение должно быть на русском.';
      exampleExplanation = 'Привет! Давай посмотрим на...';
      exampleQuestion = 'Как ты думаешь, почему...?';
    } else if (language === 'uz') {
      targetLang = 'Uzbek';
      langInstruction = 'Javobni O\'ZBEK tilida ber. Tushuntirish o\'zbek tilida bo\'lishi shart.';
      exampleExplanation = 'Salom! Keling, ko\'rib chiqamiz...';
      exampleQuestion = 'Sizningcha, nima uchun...?';
    }

    // System prompt for generating JSON with explanation and highlights
    // System prompt for generating JSON with explanation and highlights
    const systemPrompt = `Ты — Эля, дружелюбный и харизматичный репетитор на платформе ACED. Твоя цель — пообщаться с учеником.

ЗАДАЧА:
Проанализируй контент урока и сгенерируй два элемента:
1. Скрипт разговорного объяснения для озвучки, который ОБЯЗАТЕЛЬНО заканчивается вовлекающим вопросом.
2. Список ключевых фраз для подсветки на экране.

КОНТЕКСТ:
- Тип шага: ${stepType || 'explanation'}
- Контекст: ${stepContext || 'Общее объяснение'}
- Язык ответа: ${targetLang}

ИНСТРУКЦИИ:
  - ${isFirstStep ? 'НАЧИНАЙ объяснение с дружелюбного приветствия, например: "Привет! Сегодня мы изучаем [тема]..." или "Привет! Давай разберем [тема]...".' : 'НЕ используй приветствие (Привет, Здравствуйте и т.д.), сразу переходи к объяснению темы.'}
  - НЕ читай текст с экрана.
  - Объясняй глубоко и понятно, приводи интересные примеры или аналогии.
  - Используй живой, разговорный язык ("кстати", "представь", "смотри").
  - В КОНЦЕ объяснения ОБЯЗАТЕЛЬНО задай один короткий, интересный вопрос по теме (например: "Как думаешь, почему это важно?" или "Ты когда-нибудь сталкивался с таким?").
  - Если ты видишь, что студент всё понял или тема исчерпана, предложи перейти к следующему шагу (например: "Если ты готов, давай двигаться дальше!").
  - Весь текст (объяснение + вопрос) должен быть в пределах 5-7 содержательных предложений. Будь информативным, но не затягивай.
- 'highlights': Извлеки 1-4 короткие фразы (2-5 слов) из контента, которые представляют ключевые понятия. Они ДОЛЖНЫ ТОЧНО совпадать с исходным текстом.

ФОРМАТ ОТВЕТА (ТОЛЬКО JSON):
{
  "explanation": "Привет! Смотри, тут все просто... [объяснение]. А как ты думаешь, [вопрос]?",
  "highlights": ["точная фраза 1", "exact phrase 2"]
}`;

    // Call OpenAI using official package
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentToAnalyze }
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000
    });

    const rawContent = response.choices[0].message.content;
    console.log('✅ OpenAI response received. Content length:', rawContent?.length);
    if (!rawContent) {
      console.error('❌ OpenAI returned empty content!');
      throw new Error('Empty response from AI');
    }

    // Parse the JSON response safely
    const result = safeJsonParse(rawContent);
    const responseTime = Date.now() - startTime;

    // Track AI usage
    await trackAIUsage(userId, {
      type: 'analysis',
      responseTime: responseTime,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    // Get updated usage stats
    const updatedUsageCheck = await checkAIUsageLimits(userId);

    res.json({
      success: true,
      data: {
        explanation: result.explanation || '',
        highlights: result.highlights || []
      },
      usage: {
        remaining: updatedUsageCheck.remaining,
        percentage: updatedUsageCheck.percentage,
        plan: updatedUsageCheck.plan,
        unlimited: updatedUsageCheck.unlimited
      },
      responseTime
    });

  } catch (error) {
    console.error('❌ Lesson analysis error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method
    });

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
      error: 'Не удалось проанализировать урок',
      debug: error.response?.data || error.message
    });
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
    const usageCheck = await checkAIUsageLimits(userId);

    if (!usageCheck.allowed) {

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


    // Send to OpenAI using official package
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 1000
    });

    const reply = response.choices[0].message.content?.trim() || "⚠️ AI не смог дать ответ.";
    const responseTime = Date.now() - startTime;


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

// Enhanced lesson-context chat endpoint with memory and user stats
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
    const usageCheck = await checkAIUsageLimits(userId);

    if (!usageCheck.allowed) {
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

    // Get or create chat history for this lesson
    let chatHistory = null;
    const lessonId = lessonContext.lessonId;
    if (lessonId) {
      try {
        chatHistory = await LessonChatHistory.getOrCreate(userId, lessonId);
        // Update current step
        chatHistory.currentStepIndex = userProgress?.currentStep || 0;
      } catch (historyError) {
        console.error('Chat history error:', historyError);
      }
    }

    // Fetch user's overall learning statistics
    const userStats = await getUserStatsForAI(userId);

    // Build lesson-specific system prompt with user stats
    const systemPrompt = buildLessonSystemPrompt(lessonContext, userProgress, stepContext, userStats);

    const messages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    // Add stored chat history from database (persistent memory)
    if (chatHistory && chatHistory.messages.length > 0) {
      const recentMessages = chatHistory.getRecentMessages(10);
      recentMessages.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
    }
    // Fallback to request chat history if no DB history
    else if (req.body.chatHistory && Array.isArray(req.body.chatHistory)) {
      req.body.chatHistory.forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }

    // Add current user input
    messages.push({
      role: 'user',
      content: userInput
    });

    // Call OpenAI using official package
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 1000
    });

    const rawReply = response.choices[0].message.content;
    const aiReply = rawReply?.trim() ||
      'Извините, не смог сформулировать ответ. Попробуйте переформулировать вопрос.';

    const responseTime = Date.now() - startTime;

    // Store messages in chat history (persistent memory)
    if (chatHistory) {
      try {
        await chatHistory.addMessage('user', userInput);
        await chatHistory.addMessage('assistant', aiReply);

        // Track topics discussed for context
        if (lessonContext.topic && !chatHistory.topicsDiscussed.includes(lessonContext.topic)) {
          chatHistory.topicsDiscussed.push(lessonContext.topic);
          await chatHistory.save();
        }
      } catch (saveError) {
        console.error('Error saving chat history:', saveError);
      }
    }

    // Track usage globally after successful response
    await trackAIUsage(userId, {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      responseTime: responseTime,
      lessonId: lessonContext.lessonId,
      context: 'lesson',
      stepType: stepContext?.type
    });

    // Get updated usage stats
    const updatedUsageCheck = await checkAIUsageLimits(userId);

    res.json({
      success: true,
      reply: aiReply,
      context: 'lesson-integrated',
      hasMemory: !!chatHistory,
      messageCount: chatHistory?.messages?.length || 0,
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

// Build lesson-specific system prompt with user stats
function buildLessonSystemPrompt(lessonContext, userProgress, stepContext, userStats = null) {
  const currentStepType = stepContext?.type || 'unknown';
  const lessonName = lessonContext?.lessonName || 'Текущий урок';
  const topic = lessonContext?.topic || 'данной теме';
  const subject = lessonContext?.subject || 'предмет';
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

  // Build user statistics context
  let userStatsContext = '';
  if (userStats) {
    userStatsContext = `
СТАТИСТИКА СТУДЕНТА (используй для персонализации):
- Всего пройдено уроков: ${userStats.totalLessonsCompleted || 0}
- Средняя точность: ${userStats.averageAccuracy || 0}%`;

    if (userStats.strongTopics && userStats.strongTopics.length > 0) {
      userStatsContext += `
- Сильные темы: ${userStats.strongTopics.slice(0, 3).join(', ')}`;
    }

    if (userStats.weakTopics && userStats.weakTopics.length > 0) {
      userStatsContext += `
- Темы для улучшения: ${userStats.weakTopics.slice(0, 3).join(', ')}`;
    }

    if (userStats.recentMistakes && userStats.recentMistakes.length > 0) {
      const recentMistake = userStats.recentMistakes[0];
      userStatsContext += `
- Недавние трудности: "${recentMistake.lesson}" (${recentMistake.mistakes} ошибок)`;
    }

    userStatsContext += `
Используй эту статистику чтобы давать персонализированные советы и поддержку.`;
  }

  return `Ты — Эля, ободряющий AI-репетитор на платформе ACED.
Текущий урок: "${lessonName}" (Тема: ${topic}, Предмет: ${subject}).

ТЕКУЩИЙ КОНТЕКСТ:
- Прогресс урока: Шаг ${currentStepIndex + 1} из ${totalSteps} (${progressPercentage}% выполнено)
- Тип текущего шага: ${currentStepType}
- Результаты студента: ${mistakes} ошибок, ${stars} звёзд заработано
- Оценка успеваемости: ${encouragementLevel}
${userStatsContext}

ТВОЯ РОЛЬ: ${roleGuidance}

КРИТИЧЕСКИ ВАЖНЫЕ ИНСТРУКЦИИ:

1. **Вопросы по теме урока:** Если студент спрашивает о текущем уроке, объясни кратко и понятно. Связывай объяснение с текстом на экране.

2. **Вопросы НЕ по теме урока:** Если студент спрашивает о чём-то не связанном с текущим уроком:
   - Дай КРАТКИЙ общий ответ (1-2 предложения) — это важно для вовлечённости студента
   - Затем мягко направь обратно к уроку: "Кстати, это интересно связано с тем, что мы изучаем..." или "А теперь давай вернёмся к нашему уроку о ${topic}!"
   - НЕ отказывай резко — студенту важно чувствовать, что его вопросы ценны
   - Пример: "Пицца — это итальянское блюдо из теста с начинкой! 🍕 А знаешь, математика помогает поварам рассчитывать пропорции ингредиентов. Но давай вернёмся к нашей теме — ${topic}!"

3. **Общее объяснение:** Если студент просто говорит "Объясни это" или "Я не понимаю" — объясни текущий шаг простым языком.

4. **Персонализация:** Используй статистику студента для персонализированных советов:
   - Если студент силён в теме — предлагай более сложные примеры
   - Если студент испытывает трудности — разбивай на простые шаги, ссылайся на его прошлые успехи для мотивации

ПРАВИЛА ОТВЕТОВ:
- Приветствуй пользователя ТОЛЬКО если это самое начало диалога. Если диалог уже идет, продолжай общение естественно без повторных приветствий.
- Ты ПОМНИШЬ весь предыдущий диалог. Если студент ссылается на то, что вы обсуждали ранее, учитывай это!
- Будь тёплым, ободряющим и поддерживающим, как лучший друг-репетитор.
- Используй простой, понятный язык.
- Отвечай содержательно (4-6 предложений). Если студент просит подробностей — давай их.
- Если студент готов идти дальше, предложи перейти к следующему заданию.
- Для упражнений/тестов: Давай подсказки и направления, НЕ прямые ответы.
- Для объяснений: Предоставляй ясность и примеры.
- Если студент испытывает трудности: Разбивай концепции на более мелкие части, напоминай о его прошлых успехах.
- Всегда заканчивай на позитивной ноте.
- КРИТИЧЕСКИ ВАЖНО: Никогда не давай прямых ответов на упражнения или вопросы тестов.`;
}

// ============================================
// CHAT HISTORY MANAGEMENT ENDPOINTS
// ============================================

// Get chat history for a lesson
const getLessonChatHistory = async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.firebaseId;
    const { lessonId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не авторизован'
      });
    }

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        error: 'ID урока не указан'
      });
    }

    const chatHistory = await LessonChatHistory.findOne({ userId, lessonId });

    res.json({
      success: true,
      hasHistory: !!chatHistory,
      messages: chatHistory?.messages || [],
      messageCount: chatHistory?.messages?.length || 0,
      topicsDiscussed: chatHistory?.topicsDiscussed || [],
      sessionStartedAt: chatHistory?.sessionStartedAt
    });

  } catch (error) {
    console.error('❌ Error getting chat history:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения истории чата'
    });
  }
};

// Clear chat history for a lesson (e.g., when restarting)
const clearLessonChatHistory = async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.firebaseId;
    const { lessonId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не авторизован'
      });
    }

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        error: 'ID урока не указан'
      });
    }

    await LessonChatHistory.clearHistory(userId, lessonId);

    res.json({
      success: true,
      message: 'История чата очищена'
    });

  } catch (error) {
    console.error('❌ Error clearing chat history:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка очистки истории чата'
    });
  }
};

// Get user learning stats for AI context (useful for debugging/display)
const getUserLearningStats = async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.firebaseId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не авторизован'
      });
    }

    const stats = await getUserStatsForAI(userId);

    res.json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('❌ Error getting learning stats:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения статистики обучения'
    });
  }
};

module.exports = {
  getAIResponse,
  getLessonContextAIResponse,
  analyzeLessonForSpeech,
  getUserAIUsageStats,
  checkCanSendAIMessage,
  updateUserAIPlan,
  getLessonChatHistory,
  clearLessonChatHistory,
  getUserLearningStats
};