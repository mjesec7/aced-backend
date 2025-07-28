// routes/chatRoutes.js - ENHANCED VERSION
const express = require('express');
const router = express.Router();
const { 
  getAIResponse, 
  getLessonContextAIResponse,
  getUserUsageStats 
} = require('../controllers/chatController');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ Middleware: Logging for chat routes
router.use((req, res, next) => {

  next();
});

// ✅ POST /api/chat — Standard AI Chat with enhanced lesson context
router.post('/', verifyToken, getAIResponse);

// ✅ NEW: POST /api/chat/lesson-context — Enhanced lesson-specific AI chat
router.post('/lesson-context', verifyToken, getLessonContextAIResponse);

// ✅ NEW: GET /api/chat/usage — Get user AI usage statistics
router.get('/usage', verifyToken, getUserUsageStats);

// ✅ NEW: POST /api/chat/smart-hint — Generate smart hints for exercises
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

// ✅ NEW: POST /api/chat/progress-insight — Generate progress insights
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

// ✅ NEW: POST /api/chat/explanation-help — Get help understanding explanations
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

// ✅ NEW: GET /api/chat/suggestions — Generate contextual suggestions
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

// Helper function to generate contextual suggestions
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