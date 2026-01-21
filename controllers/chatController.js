// controllers/chatController.js - Complete Chat Controller with AI Usage Tracking
const axios = require('axios');
const OpenAI = require('openai');
const Lesson = require('../models/lesson');
const User = require('../models/user');
const UserProgress = require('../models/userProgress');
const LessonChatHistory = require('../models/lessonChatHistory');
const AIMemory = require('../models/aiMemory');
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

// ============================================
// COMPREHENSIVE AI CONTEXT BUILDER
// ============================================

// Helper function to sanitize step data for AI - removes only answer fields
// This ensures AI sees all exercise data (items, options, pairs) but NOT the answers
const sanitizeStepForAI = (step) => {
  if (!step) return null;

  // Clone the data to ensure it's a pure JS object (handles Mongoose docs)
  const cleanStep = JSON.parse(JSON.stringify(step));

  // Remove sensitive answer fields recursively
  const sensitiveFields = [
    'correctAnswer', 'correct', 'solution', 'answer',
    'validPairs', 'correctBins', 'correctOrder', 'expectedCode',
    'correctCode', 'answers'
  ];

  const removeFields = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    sensitiveFields.forEach(field => delete obj[field]);
    Object.values(obj).forEach(val => {
      if (Array.isArray(val)) {
        val.forEach(item => removeFields(item));
      } else if (typeof val === 'object') {
        removeFields(val);
      }
    });
  };

  removeFields(cleanStep);
  return cleanStep;
};

// Get raw JSON dump of step for AI context (fallback for complex types)
const getRawStepDataForAI = (step) => {
  if (!step) return "No step data available.";
  const sanitized = sanitizeStepForAI(step);
  return JSON.stringify(sanitized, null, 2);
};

// Helper function to extract exercise details from a lesson step
// This solves "explain the exercise without giving the answer"
const extractExerciseDetailsFromStep = (step, exerciseIndex = 0, language = 'en') => {
  if (!step) return null;

  // Ensure we're working with a plain JS object (not a Mongoose document)
  const cleanStep = JSON.parse(JSON.stringify(step));

  const getLocal = (field) => {
    if (!field) return '';
    if (typeof field === 'string') return field;
    return field[language] || field['en'] || field['ru'] || Object.values(field)[0] || '';
  };

  const stepType = cleanStep.type;
  const content = cleanStep.content || {};

  let exerciseDetails = {
    stepType,
    stepTitle: getLocal(cleanStep.title),
    stepInstructions: getLocal(cleanStep.instructions) || getLocal(cleanStep.text) || getLocal(content.text),
    exerciseIndex,
    exercise: null,
    hiddenAnswer: null, // AI can use this to guide but NOT reveal
    rawData: null // Fallback raw JSON for complex types
  };

  // Helper to extract exercise from content.exercises array or directly from step/content
  const getExerciseData = () => {
    // If exercises array exists, get specific exercise
    if (content.exercises && content.exercises[exerciseIndex]) {
      return content.exercises[exerciseIndex];
    }
    // Otherwise, the step itself might be the exercise
    return content;
  };

  const ex = getExerciseData();
  const exType = ex?.type || stepType;

  // DEBUG: Log extraction attempt
  console.log('   🧩 [AI Context] Extracting exercise details:');
  console.log('      - Step Type:', stepType);
  console.log('      - Exercise Type:', exType);
  console.log('      - Has Content:', !!content);
  console.log('      - Has Exercises Array:', !!content.exercises);
  console.log('      - Exercise Index:', exerciseIndex);

  // Universal exercise data extraction based on type
  switch (exType) {
    // ============================================
    // BASKET / SORTING EXERCISES
    // ============================================
    case 'basket':
    case 'sorting':
    case 'categorization':
      exerciseDetails.exercise = {
        type: exType,
        question: getLocal(ex.question) || getLocal(ex.instructions) || 'Sort the items into correct categories',
        items: (ex.items || cleanStep.items || []).map(i =>
          typeof i === 'string' ? i : getLocal(i.text || i.content || i.label)
        ),
        bins: (ex.bins || cleanStep.bins || ex.categories || []).map(b =>
          typeof b === 'string' ? b : getLocal(b.label || b.name || b.title)
        )
      };
      // Hidden answer: correct bin for each item
      exerciseDetails.hiddenAnswer = ex.correctAnswer || ex.solution || ex.correctBins;
      // Include raw data for fallback
      exerciseDetails.rawData = getRawStepDataForAI(cleanStep);
      break;

    // ============================================
    // MATCHING / MEMORY EXERCISES
    // ============================================
    case 'matching':
    case 'memory':
    case 'pairs':
      const pairs = ex.pairs || cleanStep.pairs || content.pairs || [];
      exerciseDetails.exercise = {
        type: exType,
        question: getLocal(ex.question) || 'Match the items correctly',
        pairs: pairs.map(p => ({
          left: getLocal(p.left || p.term || p.name || p.key),
          right: getLocal(p.right || p.definition || p.match || p.value)
        }))
      };
      // Hidden answer: the correct pairings
      exerciseDetails.hiddenAnswer = pairs.map(p => ({
        left: getLocal(p.left || p.term || p.name || p.key),
        right: getLocal(p.right || p.definition || p.match || p.value)
      }));
      break;

    // ============================================
    // MULTIPLE CHOICE / QUIZ
    // ============================================
    case 'quiz':
    case 'multiple_choice':
    case 'single_choice':
    case 'tryout':
      const options = ex.options || ex.choices || cleanStep.options || [];
      exerciseDetails.exercise = {
        type: exType,
        question: getLocal(ex.question) || getLocal(ex.text) || getLocal(ex.prompt) || getLocal(ex.title) || getLocal(cleanStep.title),
        options: options.map((opt, i) => ({
          id: opt.id || String.fromCharCode(65 + i),
          text: typeof opt === 'string' ? opt : getLocal(opt.text || opt.label || opt.content)
        })),
        hint: getLocal(ex.hint)
      };
      exerciseDetails.hiddenAnswer = ex.correctAnswer || ex.correct || ex.answer;
      break;

    // ============================================
    // CODING / CODE FIX EXERCISES
    // ============================================
    case 'coding':
    case 'code_fix':
    case 'code':
    case 'programming':
      exerciseDetails.exercise = {
        type: exType,
        question: getLocal(ex.question) || getLocal(ex.instructions) || 'Fix or write the code',
        initialCode: ex.initialCode || ex.starterCode || ex.code || '',
        language: ex.language || ex.programmingLanguage || 'javascript',
        testCases: ex.testCases || []
      };
      exerciseDetails.hiddenAnswer = ex.solution || ex.correctCode || ex.expectedCode;
      break;

    // ============================================
    // FILL IN THE BLANK
    // ============================================
    case 'fill_blank':
    case 'fill_in_blank':
    case 'text_input':
    case 'cloze':
      exerciseDetails.exercise = {
        type: exType,
        sentence: getLocal(ex.sentence || ex.text || ex.question),
        blanks: ex.blanks || [],
        hint: getLocal(ex.hint)
      };
      exerciseDetails.hiddenAnswer = ex.correctAnswer || ex.answers || ex.solution;
      break;

    // ============================================
    // ORDERING / SEQUENCE EXERCISES
    // ============================================
    case 'order':
    case 'ordering':
    case 'sequence':
    case 'sentence_order':
      exerciseDetails.exercise = {
        type: exType,
        question: getLocal(ex.question) || 'Put the items in correct order',
        items: (ex.items || ex.elements || cleanStep.items || []).map(i =>
          typeof i === 'string' ? i : getLocal(i.text || i.content)
        )
      };
      exerciseDetails.hiddenAnswer = ex.correctOrder || ex.solution || ex.correctAnswer;
      break;

    // ============================================
    // TRUE/FALSE EXERCISES
    // ============================================
    case 'true_false':
    case 'boolean':
      exerciseDetails.exercise = {
        type: exType,
        question: getLocal(ex.question) || getLocal(ex.statement),
        statement: getLocal(ex.statement || ex.text)
      };
      exerciseDetails.hiddenAnswer = ex.correctAnswer || ex.correct || ex.answer;
      break;

    // ============================================
    // DRAG AND DROP
    // ============================================
    case 'drag_drop':
    case 'drag_and_drop':
      exerciseDetails.exercise = {
        type: exType,
        question: getLocal(ex.question) || 'Drag items to correct positions',
        items: (ex.items || ex.draggables || []).map(i =>
          typeof i === 'string' ? i : getLocal(i.text || i.content)
        ),
        dropZones: (ex.dropZones || ex.targets || []).map(z =>
          typeof z === 'string' ? z : getLocal(z.label || z.name)
        )
      };
      exerciseDetails.hiddenAnswer = ex.correctAnswer || ex.solution;
      break;

    // ============================================
    // VOCABULARY STEPS
    // ============================================
    case 'vocabulary':
      const terms = content.terms || ex.terms || [];
      exerciseDetails.exercise = {
        type: 'vocabulary',
        terms: terms.map(t => ({
          term: getLocal(t.term),
          definition: getLocal(t.definition),
          example: getLocal(t.example)
        }))
      };
      break;

    // ============================================
    // EXPLANATION STEPS
    // ============================================
    case 'explanation':
    case 'lesson':
    case 'theory':
      exerciseDetails.exercise = {
        type: 'explanation',
        text: getLocal(content.text || ex.text || cleanStep.text),
        keyPoints: (content.keyPoints || ex.keyPoints || []).map(kp => getLocal(kp))
      };
      break;

    // ============================================
    // GAME STEPS
    // ============================================
    case 'game':
      exerciseDetails.exercise = {
        type: 'game',
        gameType: cleanStep.gameType || ex.gameType,
        targetScore: cleanStep.gameConfig?.targetScore || ex.targetScore,
        instructions: getLocal(cleanStep.instructions || ex.instructions)
      };
      exerciseDetails.hiddenAnswer = cleanStep.gameConfig?.correctAnswers || ex.correctAnswers;
      break;

    // ============================================
    // STANDARD EXERCISE (nested in content.exercises)
    // ============================================
    case 'exercise':
      if (content.exercises && content.exercises[exerciseIndex]) {
        const nestedEx = content.exercises[exerciseIndex];
        // Recursively extract with the nested exercise's type
        return extractExerciseDetailsFromStep({ ...cleanStep, type: nestedEx.type, content: nestedEx }, 0, language);
      }
      exerciseDetails.exercise = {
        type: 'exercise',
        question: getLocal(ex.question) || getLocal(ex.prompt) || getLocal(ex.text),
        options: (ex.options || []).map(opt => typeof opt === 'string' ? opt : getLocal(opt.text || opt.label)),
        items: ex.items || [],
        hint: getLocal(ex.hint)
      };
      exerciseDetails.hiddenAnswer = ex.correctAnswer || ex.correct || ex.answer;
      break;

    // ============================================
    // FALLBACK: GENERIC EXTRACTION
    // ============================================
    default:
      // For unknown types, extract whatever data is available
      exerciseDetails.exercise = {
        type: exType,
        question: getLocal(ex.question) || getLocal(ex.text) || getLocal(ex.prompt) || getLocal(ex.instructions),
        data: {}
      };

      // Try to extract common fields
      if (ex.options) {
        exerciseDetails.exercise.options = ex.options.map(opt =>
          typeof opt === 'string' ? opt : getLocal(opt.text || opt.label)
        );
      }
      if (ex.items) {
        exerciseDetails.exercise.items = ex.items.map(i =>
          typeof i === 'string' ? i : getLocal(i.text || i.content)
        );
      }
      if (ex.pairs) {
        exerciseDetails.exercise.pairs = ex.pairs.map(p => ({
          left: getLocal(p.left || p.term),
          right: getLocal(p.right || p.definition)
        }));
      }

      exerciseDetails.hiddenAnswer = ex.correctAnswer || ex.correct || ex.answer || ex.solution;
      // IMPORTANT: Include raw sanitized JSON for unknown types
      // This ensures the AI sees ALL data even for new exercise types
      exerciseDetails.rawData = getRawStepDataForAI(cleanStep);
      break;
  }

  // Set total exercises count if applicable
  if (content.exercises) {
    exerciseDetails.totalExercises = content.exercises.length;
  } else if (content.questions) {
    exerciseDetails.totalExercises = content.questions.length;
  }

  return exerciseDetails;
};

// Fetch full lesson content for AI context
const getFullLessonContext = async (lessonId, language = 'en') => {
  try {
    if (!lessonId) return null;

    // CRITICAL FIX: Use .lean() to get plain JavaScript objects
    // This ensures nested arrays like 'items', 'options', 'pairs' are visible
    const lesson = await Lesson.findById(lessonId)
      .populate('topicId', 'name description')
      .populate('learningPath.relatedLessons', 'lessonName topic subject')
      .lean(); // Converts Mongoose Document to plain JS object

    if (!lesson) return null;

    // Get localized content
    const getLocal = (field) => {
      if (!field) return '';
      if (typeof field === 'string') return field;
      return field[language] || field['en'] || field['ru'] || Object.values(field)[0] || '';
    };

    // Handle various naming conventions: 'steps', 'slides', or 'content'
    // This brute-force approach ensures we find exercises regardless of schema naming
    const lessonSteps = lesson.steps || lesson.slides || lesson.content || [];

    // Build step summaries
    const stepSummaries = lessonSteps.map((step, index) => {
      const stepContent = {
        index: index + 1,
        type: step.type,
        title: getLocal(step.title),
        instructions: getLocal(step.instructions)
      };

      // Add content summary based on type
      if (step.content) {
        if (step.type === 'explanation' && step.content.text) {
          stepContent.explanation = getLocal(step.content.text).substring(0, 500);
        }
        if (step.type === 'exercise' && step.content.exercises) {
          stepContent.exerciseCount = step.content.exercises.length;
          stepContent.exerciseTypes = [...new Set(step.content.exercises.map(e => e.type))];
        }
        if (step.type === 'vocabulary' && step.content.terms) {
          stepContent.terms = step.content.terms.slice(0, 5).map(t => getLocal(t.term));
        }
      }

      return stepContent;
    });

    return {
      lessonId: lesson._id,
      lessonName: getLocal(lesson.lessonName),
      description: getLocal(lesson.description),
      subject: lesson.subject,
      topic: lesson.topicId?.name || 'Unknown',
      topicId: lesson.topicId?._id,
      topicDescription: lesson.topicId?.description || '',
      level: lesson.level,
      difficulty: lesson.difficulty,
      totalSteps: lessonSteps.length,
      steps: stepSummaries,
      rawSteps: lessonSteps, // Include raw steps for exercise extraction
      relatedLessons: lesson.learningPath?.relatedLessons?.map(l => ({
        name: getLocal(l.lessonName),
        topic: l.topic
      })) || [],
      glossary: lesson.resources?.glossary?.slice(0, 10) || [],
      estimatedDuration: lesson.timing?.estimatedDuration
    };
  } catch (error) {
    console.error('Error fetching full lesson context:', error);
    return null;
  }
};

// Get user's active subjects and recent lessons
const getUserLearningJourney = async (userId) => {
  try {
    // Get recent progress across all subjects
    const recentProgress = await UserProgress.find({ userId })
      .sort({ lastAccessedAt: -1 })
      .limit(15)
      .populate('lessonId', 'lessonName subject topic level');

    // Group by subject
    const subjectProgress = {};
    recentProgress.forEach(p => {
      if (!p.lessonId) return;
      const subject = p.lessonId.subject;
      if (!subjectProgress[subject]) {
        subjectProgress[subject] = {
          subject,
          lessons: [],
          totalMistakes: 0,
          totalStars: 0,
          count: 0
        };
      }
      subjectProgress[subject].lessons.push({
        name: p.lessonId.lessonName,
        topic: p.lessonId.topic,
        progress: p.progressPercent,
        stars: p.stars,
        mistakes: p.mistakes
      });
      subjectProgress[subject].totalMistakes += p.mistakes || 0;
      subjectProgress[subject].totalStars += p.stars || 0;
      subjectProgress[subject].count += 1;
    });

    return Object.values(subjectProgress);
  } catch (error) {
    console.error('Error fetching learning journey:', error);
    return [];
  }
};

// Build comprehensive AI context string
const buildComprehensiveAIContext = async (userId, lessonContext, userProgress, stepContext, language = 'en') => {
  let fullContext = '';
  let extractedExercise = null;

  // DEBUG: Log input parameters
  console.log('🔍 [AI Context] Building context with:');
  console.log('   - lessonContext.lessonId:', lessonContext?.lessonId);
  console.log('   - userProgress.currentStep:', userProgress?.currentStep);
  console.log('   - stepContext?.stepIndex:', stepContext?.stepIndex);

  // 1. Get full lesson content
  const fullLesson = await getFullLessonContext(lessonContext?.lessonId, language);

  // DEBUG: Log lesson fetch result
  console.log('📚 [AI Context] Lesson fetch result:');
  console.log('   - fullLesson exists:', !!fullLesson);
  console.log('   - lessonName:', fullLesson?.lessonName);
  console.log('   - totalSteps:', fullLesson?.totalSteps);
  console.log('   - rawSteps length:', fullLesson?.rawSteps?.length);

  if (fullLesson) {
    fullContext += `\n📚 ПОЛНЫЙ КОНТЕКСТ УРОКА:\n`;
    fullContext += `Урок: "${fullLesson.lessonName}"\n`;
    fullContext += `Описание: ${fullLesson.description}\n`;
    fullContext += `Предмет: ${fullLesson.subject} | Тема: ${fullLesson.topic}\n`;
    fullContext += `Уровень: ${fullLesson.level} | Сложность: ${fullLesson.difficulty}\n`;

    // Current step context
    const currentStepIndex = userProgress?.currentStep || stepContext?.stepIndex || 0;
    const exerciseIndex = stepContext?.exerciseIndex || 0;

    console.log('📍 [AI Context] Current position:');
    console.log('   - currentStepIndex:', currentStepIndex);
    console.log('   - exerciseIndex:', exerciseIndex);

    if (fullLesson.steps[currentStepIndex]) {
      const currentStep = fullLesson.steps[currentStepIndex];
      fullContext += `\n📍 ТЕКУЩИЙ ШАГ (${currentStepIndex + 1}/${fullLesson.totalSteps}):\n`;
      fullContext += `Тип: ${currentStep.type}\n`;
      fullContext += `Заголовок: ${currentStep.title}\n`;
      fullContext += `Инструкции: ${currentStep.instructions}\n`;
      if (currentStep.explanation) {
        fullContext += `Объяснение: ${currentStep.explanation}...\n`;
      }
    }

    // Extract exercise details from raw step if not provided via stepContext.exerciseData
    // This is the key RAG feature: auto-fetch exercise content
    if (fullLesson.rawSteps && fullLesson.rawSteps[currentStepIndex]) {
      extractedExercise = extractExerciseDetailsFromStep(
        fullLesson.rawSteps[currentStepIndex],
        exerciseIndex,
        language
      );

      if (extractedExercise && extractedExercise.exercise) {
        const ex = extractedExercise.exercise;
        fullContext += `\n🎯 ТЕКУЩЕЕ ЗАДАНИЕ:\n`;
        fullContext += `Тип задания: ${ex.type}\n`;

        // Question/Instructions
        if (ex.question) {
          fullContext += `Вопрос/Задание: "${ex.question}"\n`;
        }
        if (ex.sentence) {
          fullContext += `Предложение с пропусками: "${ex.sentence}"\n`;
        }
        if (ex.statement) {
          fullContext += `Утверждение: "${ex.statement}"\n`;
        }

        // Options for multiple choice
        if (ex.options && ex.options.length > 0) {
          const optionsStr = ex.options.map((opt, i) => {
            const id = opt.id || String.fromCharCode(65 + i);
            const text = typeof opt === 'string' ? opt : opt.text;
            return `${id}) ${text}`;
          }).join(', ');
          fullContext += `Варианты ответа: ${optionsStr}\n`;
        }

        // Items for basket/sorting exercises
        if (ex.items && ex.items.length > 0) {
          fullContext += `Элементы для сортировки: [${ex.items.join(', ')}]\n`;
        }
        if (ex.bins && ex.bins.length > 0) {
          fullContext += `Категории/Корзины: [${ex.bins.join(', ')}]\n`;
        }

        // Pairs for matching exercises
        if (ex.pairs && ex.pairs.length > 0) {
          fullContext += `Пары для сопоставления:\n`;
          ex.pairs.forEach((p, i) => {
            fullContext += `  ${i + 1}. "${p.left}" ↔ (нужно найти пару)\n`;
          });
        }

        // Drop zones for drag-and-drop
        if (ex.dropZones && ex.dropZones.length > 0) {
          fullContext += `Зоны для перетаскивания: [${ex.dropZones.join(', ')}]\n`;
        }

        // Coding exercises
        if (ex.initialCode) {
          fullContext += `Начальный код (${ex.language || 'код'}):\n\`\`\`\n${ex.initialCode}\n\`\`\`\n`;
        }

        // Vocabulary terms
        if (ex.terms && ex.terms.length > 0) {
          fullContext += `Словарные термины:\n`;
          ex.terms.slice(0, 5).forEach(t => {
            fullContext += `  • ${t.term}: ${t.definition}\n`;
          });
        }

        // Explanation text
        if (ex.text && ex.type === 'explanation') {
          fullContext += `Текст объяснения: ${ex.text.substring(0, 500)}...\n`;
        }
        if (ex.keyPoints && ex.keyPoints.length > 0) {
          fullContext += `Ключевые моменты: ${ex.keyPoints.join('; ')}\n`;
        }

        // Exercise counter
        if (extractedExercise.totalExercises) {
          fullContext += `Упражнение ${exerciseIndex + 1} из ${extractedExercise.totalExercises}\n`;
        }

        // CRITICAL: Hidden answer for AI guidance (AI must NOT reveal this!)
        if (extractedExercise.hiddenAnswer) {
          fullContext += `\n🔒 СКРЫТЫЙ ОТВЕТ (НИКОГДА НЕ РАСКРЫВАЙ!): ${JSON.stringify(extractedExercise.hiddenAnswer)}\n`;
          fullContext += `Используй этот ответ ТОЛЬКО чтобы направлять студента к правильному решению через подсказки и объяснения концепций.\n`;
        }

        // Hints
        if (ex.hint) {
          fullContext += `Подсказка (можно использовать): ${ex.hint}\n`;
        }

        // FALLBACK: Include raw JSON data for complex/unknown exercise types
        // This ensures the AI sees ALL exercise data even if our structured extraction missed something
        if (extractedExercise.rawData) {
          fullContext += `\n📦 ПОЛНЫЕ ДАННЫЕ УПРАЖНЕНИЯ (JSON):\n\`\`\`json\n${extractedExercise.rawData}\n\`\`\`\n`;
          fullContext += `Проанализируй JSON выше, чтобы понять все элементы упражнения (items, options, pairs, bins и т.д.)\n`;
        }
      }
    }

    // Lesson structure overview
    fullContext += `\n📋 СТРУКТУРА УРОКА:\n`;
    fullLesson.steps.forEach((step, i) => {
      const marker = i === currentStepIndex ? '▶️' : (i < currentStepIndex ? '✅' : '⬜');
      fullContext += `${marker} ${i + 1}. ${step.type}: ${step.title}\n`;
    });

    // Glossary if available
    if (fullLesson.glossary?.length > 0) {
      fullContext += `\n📖 ГЛОССАРИЙ УРОКА:\n`;
      fullLesson.glossary.slice(0, 5).forEach(term => {
        fullContext += `• ${term.term}: ${term.definition}\n`;
      });
    }
  }

  // 2. Get global AI memory
  try {
    const aiMemory = await AIMemory.getOrCreate(userId);
    const memoryContext = aiMemory.buildContextForAI(
      lessonContext?.subject,
      lessonContext?.topic
    );
    if (memoryContext) {
      fullContext += memoryContext;
    }

    // Update active subject tracking
    if (lessonContext?.lessonId && lessonContext?.subject) {
      await aiMemory.updateActiveSubject(
        lessonContext.subject,
        lessonContext.lessonId,
        lessonContext.topicId,
        userProgress?.progressPercent || 0
      );
    }
  } catch (memoryError) {
    console.error('AI Memory error:', memoryError);
  }

  // 3. Get learning journey (other subjects user is studying)
  const journey = await getUserLearningJourney(userId);
  if (journey.length > 0) {
    fullContext += `\n🎓 ПУТЬ ОБУЧЕНИЯ СТУДЕНТА:\n`;
    journey.slice(0, 3).forEach(subj => {
      const avgStars = (subj.totalStars / subj.count).toFixed(1);
      fullContext += `• ${subj.subject}: ${subj.count} уроков, средний балл ${avgStars}⭐\n`;
      if (subj.lessons[0]) {
        fullContext += `  Последний урок: "${subj.lessons[0].name}"\n`;
      }
    });
  }

  // Return both the text context and the structured exercise data
  return {
    context: fullContext,
    extractedExercise: extractedExercise?.exercise || null
  };
};

// Save important information to AI memory (called after AI response)
const extractAndSaveMemories = async (userId, userMessage, aiResponse, lessonContext) => {
  try {
    const aiMemory = await AIMemory.getOrCreate(userId);
    const lowerMessage = userMessage.toLowerCase();

    // Detect learning preferences
    if (lowerMessage.includes('не понимаю') || lowerMessage.includes('объясни проще')) {
      await aiMemory.addMemory('learning_preference', 'Предпочитает простые объяснения с примерами', {
        subject: lessonContext?.subject,
        importance: 7
      });
    }

    // Detect struggles
    if (lowerMessage.includes('сложно') || lowerMessage.includes('трудно') || lowerMessage.includes('не могу')) {
      await aiMemory.addMemory('struggle_topic', `Испытывает трудности с темой: ${lessonContext?.topic || 'текущая тема'}`, {
        subject: lessonContext?.subject,
        topic: lessonContext?.topic,
        importance: 8
      });
    }

    // Detect interests (for better examples)
    const interestPatterns = [
      { pattern: /футбол|спорт|мяч/i, interest: 'спорт' },
      { pattern: /игр|minecraft|roblox/i, interest: 'видеоигры' },
      { pattern: /музык|песн/i, interest: 'музыка' },
      { pattern: /животн|собак|кошк/i, interest: 'животные' },
      { pattern: /космос|планет|звезд/i, interest: 'космос' }
    ];

    for (const { pattern, interest } of interestPatterns) {
      if (pattern.test(lowerMessage)) {
        if (!aiMemory.learnerProfile.interests) {
          aiMemory.learnerProfile.interests = [];
        }
        if (!aiMemory.learnerProfile.interests.includes(interest)) {
          aiMemory.learnerProfile.interests.push(interest);
          await aiMemory.save();
        }
        break;
      }
    }

  } catch (error) {
    console.error('Error extracting memories:', error);
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
    // Use the specified language to extract content, with fallbacks
    let contentToAnalyze = lessonContent;
    if (typeof lessonContent === 'object' && lessonContent !== null) {
      if (language === 'ru') {
        contentToAnalyze = lessonContent.ru || lessonContent.en || lessonContent.uz || JSON.stringify(lessonContent);
      } else if (language === 'uz') {
        contentToAnalyze = lessonContent.uz || lessonContent.en || lessonContent.ru || JSON.stringify(lessonContent);
      } else {
        // Default to English
        contentToAnalyze = lessonContent.en || lessonContent.ru || lessonContent.uz || JSON.stringify(lessonContent);
      }
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
    // Generate language-specific system prompt
    let systemPrompt;

    if (language === 'ru') {
      // Russian system prompt
      systemPrompt = `Ты — Эля, дружелюбный и харизматичный репетитор на платформе ACED. Твоя цель — пообщаться с учеником.

ЗАДАЧА:
Проанализируй контент урока и сгенерируй два элемента:
1. Скрипт разговорного объяснения для озвучки, который ОБЯЗАТЕЛЬНО заканчивается вовлекающим вопросом.
2. Список ключевых фраз для подсветки на экране.

КОНТЕКСТ:
- Тип шага: ${stepType || 'explanation'}
- Контекст: ${stepContext || 'Общее объяснение'}
- Язык ответа: Русский

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
  "highlights": ["точная фраза 1", "точная фраза 2"]
}`;
    } else if (language === 'uz') {
      // Uzbek system prompt
      systemPrompt = `Siz — Elya, ACED platformasidagi do'stona va xarizmatik o'qituvchisiz. Maqsadingiz — o'quvchi bilan muloqot qilish.

VAZIFA:
Dars mazmunini tahlil qiling va ikkita element yarating:
1. Ovozli o'qish uchun suhbatli tushuntirish skripti, u ALBATTA qiziqarli savol bilan tugashi kerak.
2. Ekranda ta'kidlash uchun kalit so'zlar ro'yxati.

KONTEKST:
- Qadam turi: ${stepType || 'explanation'}
- Kontekst: ${stepContext || 'Umumiy tushuntirish'}
- Javob tili: O'zbek

KO'RSATMALAR:
  - ${isFirstStep ? 'Tushuntirishni do\'stona salomlashish bilan BOSHLANG, masalan: "Salom! Bugun biz [mavzu]ni o\'rganamiz..." yoki "Salom! Keling, [mavzu]ni ko\'rib chiqamiz...".' : 'Salomlashishni ishlatMANG (Salom, Assalomu alaykum va h.k.), darhol mavzuni tushuntirishga o\'ting.'}
  - Ekrandagi matnni o'qiMANG.
  - Chuqur va tushunarli tushuntiring, qiziqarli misollar yoki o'xshatishlar keltiring.
  - Jonli, suhbatli tildan foydalaning ("aytgancha", "tasavvur qiling", "qarang").
  - Tushuntirish OXIRIDA mavzu bo'yicha bitta qisqa, qiziqarli savol bering (masalan: "Sizningcha, bu nima uchun muhim?" yoki "Siz bunday holatga duch kelganmisiz?").
  - Agar o'quvchi hamma narsani tushunganini ko'rsangiz, keyingi qadamga o'tishni taklif qiling (masalan: "Agar tayyor bo'lsangiz, davom etamiz!").
  - Butun matn (tushuntirish + savol) 5-7 mazmunli gap ichida bo'lishi kerak. Ma'lumotli bo'ling, lekin cho'zMANG.
- 'highlights': Kontentdan asosiy tushunchalarni ifodalovchi 1-4 qisqa iboralarni (2-5 so'z) ajratib oling. Ular asl matn bilan AYNAN mos kelishi KERAK.

JAVOB FORMATI (FAQAT JSON):
{
  "explanation": "Salom! Qarang, bu juda oddiy... [tushuntirish]. Sizningcha, [savol]?",
  "highlights": ["aniq ibora 1", "aniq ibora 2"]
}`;
    } else {
      // English system prompt (default)
      systemPrompt = `You are Elya, a friendly and charismatic tutor on the ACED platform. Your goal is to engage with the student.

TASK:
Analyze the lesson content and generate two elements:
1. A conversational explanation script for voice-over that MUST end with an engaging question.
2. A list of key phrases for on-screen highlighting.

CONTEXT:
- Step type: ${stepType || 'explanation'}
- Context: ${stepContext || 'General explanation'}
- Response language: English

INSTRUCTIONS:
  - ${isFirstStep ? 'START the explanation with a friendly greeting, for example: "Hi! Today we\'re learning about [topic]..." or "Hey! Let\'s take a look at [topic]...".' : 'Do NOT use a greeting (Hi, Hello, etc.), go directly to explaining the topic.'}
  - Do NOT read the text from the screen.
  - Explain deeply and clearly, provide interesting examples or analogies.
  - Use lively, conversational language ("by the way", "imagine", "look").
  - At the END of the explanation, ALWAYS ask one short, interesting question about the topic (for example: "What do you think, why is this important?" or "Have you ever encountered something like this?").
  - If you see that the student has understood everything or the topic is exhausted, offer to move to the next step (for example: "If you're ready, let's move on!").
  - The entire text (explanation + question) should be within 5-7 meaningful sentences. Be informative, but don't drag on.
- 'highlights': Extract 1-4 short phrases (2-5 words) from the content that represent key concepts. They MUST EXACTLY match the original text.

RESPONSE FORMAT (JSON ONLY):
{
  "explanation": "Hi! Look, this is quite simple... [explanation]. What do you think, [question]?",
  "highlights": ["exact phrase 1", "exact phrase 2"]
}`
    };

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

    // Build comprehensive AI context (full lesson, memory, learning journey)
    const contextResult = await buildComprehensiveAIContext(
      userId,
      lessonContext,
      userProgress,
      stepContext,
      req.body.language || 'en'
    );

    const comprehensiveContext = contextResult.context || contextResult;
    const backendExtractedExercise = contextResult.extractedExercise || null;

    // Build lesson-specific system prompt with user stats AND backend-extracted exercise
    const systemPrompt = buildLessonSystemPrompt(
      lessonContext,
      userProgress,
      stepContext,
      userStats,
      backendExtractedExercise // Pass the reliable backend data
    );

    // Combine base prompt with comprehensive context
    let fullSystemPrompt = systemPrompt + comprehensiveContext;

    // Add chat history summary to system prompt for "What was my first question?" feature
    // This ensures the AI can recall conversation history even if asked in a new message
    if (chatHistory && chatHistory.messages.length > 0) {
      const allMessages = chatHistory.messages;
      fullSystemPrompt += `\n\n💬 ИСТОРИЯ ДИАЛОГА (для справки, если студент спросит о предыдущих вопросах):\n`;
      fullSystemPrompt += `Сессия началась: ${chatHistory.sessionStartedAt?.toLocaleString('ru-RU') || 'неизвестно'}\n`;
      fullSystemPrompt += `Всего сообщений в этой сессии: ${allMessages.length}\n`;

      // Add summary of first few questions for "what was my first question?" queries
      const userQuestions = allMessages.filter(m => m.role === 'user');
      if (userQuestions.length > 0) {
        fullSystemPrompt += `\nВОПРОСЫ СТУДЕНТА (по порядку):\n`;
        userQuestions.slice(0, 5).forEach((q, i) => {
          const truncatedContent = q.content.length > 100 ? q.content.substring(0, 100) + '...' : q.content;
          fullSystemPrompt += `${i + 1}. "${truncatedContent}"\n`;
        });
        if (userQuestions.length > 5) {
          fullSystemPrompt += `... и ещё ${userQuestions.length - 5} вопросов\n`;
        }
      }

      // Track topics discussed
      if (chatHistory.topicsDiscussed?.length > 0) {
        fullSystemPrompt += `\nОбсуждённые темы: ${chatHistory.topicsDiscussed.join(', ')}\n`;
      }
    }

    const messages = [
      {
        role: 'system',
        content: fullSystemPrompt
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

    // Extract and save important memories from conversation (async, non-blocking)
    extractAndSaveMemories(userId, userInput, aiReply, lessonContext).catch(err =>
      console.error('Memory extraction error:', err)
    );

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
// Build lesson-specific system prompt with user stats
function buildLessonSystemPrompt(lessonContext, userProgress, stepContext, userStats = null, backendExtractedExercise = null) {
  const currentStepType = stepContext?.type || 'unknown';
  const lessonName = lessonContext?.lessonName || 'Текущий урок';
  const topic = lessonContext?.topic || 'данной теме';
  const subject = lessonContext?.subject || 'предмет';
  const mistakes = userProgress?.mistakes || 0;
  const stars = userProgress?.stars || 0;
  const completedSteps = userProgress?.completedSteps?.length || 0;
  const totalSteps = lessonContext?.totalSteps || 1;
  const currentStepIndex = userProgress?.currentStep || stepContext?.stepIndex || 0;

  let roleGuidance = '';
  switch (currentStepType) {
    case 'explanation':
      roleGuidance = 'Помоги студенту лучше понять концепцию с помощью понятных объяснений и примеров.';
      break;
    case 'exercise':
      roleGuidance = 'Будь прямым и кратким. Если ты НЕ видишь текст вопроса или задания в контексте, СРАЗУ попроси пользователя прочитать его тебе. Не гадай и не лей воду. Если видишь вопрос, давай полезные подсказки, но не прямой ответ.';
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

  // Build exercise context - PRIORITIZE BACKEND DATA as it's more reliable
  let exerciseContext = '';
  const ex = backendExtractedExercise || stepContext?.exerciseData;

  if (ex) {
    exerciseContext = `
ТЕКУЩЕЕ УПРАЖНЕНИЕ:
- Тип: ${ex.type || 'unknown'}
- Вопрос/Задание: ${ex.question || ex.prompt || 'Не указано'}`;

    // Add options for multiple choice / true-false
    if (ex.options && ex.options.length > 0) {
      const optionsList = ex.options.map((opt, i) => {
        const letter = String.fromCharCode(65 + i); // A, B, C, D...
        const optText = typeof opt === 'string' ? opt : (opt.text || opt.label || opt);
        return `${letter}) ${optText}`;
      }).join(', ');
      exerciseContext += `
- Варианты ответа: ${optionsList}`;
    }

    // Add pairs for matching exercises
    if (ex.pairs && ex.pairs.length > 0) {
      const pairNames = ex.pairs.map(p => {
        const left = p.left || p.term || p.name;
        const right = p.right || p.definition || p.match;
        return `${left} ↔ ${right}`; // Give AI the full pairs so it knows the answers (but won't reveal them)
      }).join(', ');
      exerciseContext += `
- Элементы для сопоставления: ${pairNames}`;
    }

    // Add items for sentence_order exercises
    if (ex.items && ex.items.length > 0) {
      exerciseContext += `
- Элементы для упорядочивания/сортировки: ${ex.items.join(', ')}`;
    }

    // Add bins/categories for sorting
    if (ex.bins && ex.bins.length > 0) {
      exerciseContext += `
- Категории для сортировки: ${ex.bins.join(', ')}`;
    }

    // Exercise step info
    if (stepContext?.exerciseIndex !== undefined && stepContext?.totalExercises) {
      exerciseContext += `
- Упражнение ${stepContext.exerciseIndex + 1} из ${stepContext.totalExercises}`;
    }

    exerciseContext += `

ВАЖНЫЕ ПРАВИЛА ДЛЯ ОБЪЯСНЕНИЯ УПРАЖНЕНИЙ:
1. НИКОГДА не называй правильный ответ напрямую!
2. Объясни концепцию, которая стоит за вопросом
3. Дай подсказки, которые помогут студенту САМОМУ найти ответ
4. Разбей проблему на простые шаги
5. Приведи аналогию или пример из жизни
6. Если студент совсем запутался, дай более конкретную подсказку, но всё равно НЕ ответ`;
  }

  return `Ты — Эля, ободряющий AI-репетитор на платформе ACED.
Текущий урок: "${lessonName}" (Тема: ${topic}, Предмет: ${subject}).

ТЕКУЩИЙ КОНТЕКСТ:
- Прогресс урока: Шаг ${currentStepIndex + 1} из ${totalSteps} (${progressPercentage}% выполнено)
- Тип текущего шага: ${currentStepType}
- Результаты студента: ${mistakes} ошибок, ${stars} звёзд заработано
- Оценка успеваемости: ${encouragementLevel}
${userStatsContext}
${exerciseContext}

ТВОЯ РОЛЬ: ${roleGuidance}

КРИТИЧЕСКИ ВАЖНЫЕ ИНСТРУКЦИИ:

0. **ДОСТУП К ДАННЫМ:** Ты ИМЕЕШЬ ПОЛНЫЙ ДОСТУП к текущему упражнению! Вся информация о вопросе, вариантах ответа, элементах для сортировки, парах для сопоставления и т.д. находится ВЫШЕ в блоках "ТЕКУЩЕЕ УПРАЖНЕНИЕ" и "ТЕКУЩЕЕ ЗАДАНИЕ". Когда студент просит "прочитай задание" или "объясни упражнение" — ты МОЖЕШЬ и ДОЛЖЕН описать его подробно!

1. **Вопросы по теме урока:** Если студент спрашивает о текущем уроке, объясни кратко и понятно. Связывай объяснение с текстом на экране.

2. **Вопросы НЕ по теме урока:** Если студент спрашивает о чём-то не связанном с текущим уроком:
   - Дай КРАТКИЙ общий ответ (1-2 предложения) — это важно для вовлечённости студента
   - Затем мягко направь обратно к уроку: "Кстати, это интересно связано с тем, что мы изучаем..." или "А теперь давай вернёмся к нашему уроку о ${topic}!"
   - НЕ отказывай резко — студенту важно чувствовать, что его вопросы ценны
   - Пример: "Пицца — это итальянское блюдо из теста с начинкой! 🍕 А знаешь, математика помогает поварам рассчитывать пропорции ингредиентов. Но давай вернёмся к нашей теме — ${topic}!"

3. **Объяснение упражнения:** Если студент просит объяснить упражнение или говорит "Помоги", "Не понимаю", "Прочти задание":
   - ПРОЧИТАЙ данные упражнения из контекста выше и перескажи их студенту простыми словами
   - Объясни КОНЦЕПЦИЮ, которая стоит за вопросом
   - Дай пошаговый подход к решению
   - Используй примеры и аналогии
   - НИКОГДА не говори: "Правильный ответ — ...", "Выбери вариант ...", "Ответ: ..."
   - НИКОГДА не говори: "Я не могу видеть экран" или "У меня нет доступа" — ты ВИДИШЬ все данные!

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