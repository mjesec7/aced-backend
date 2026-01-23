const axios = require('axios');
const OpenAI = require('openai');
const Lesson = require('../models/lesson');
const User = require('../models/user');
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
const { extractExerciseContent, buildVoiceAssistantContext } = require('../utils/exerciseContentExtractor');
require('dotenv').config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize ElevenLabs Client
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// ============================================
// STREAM AUDIO - Low Latency TTS Streaming
// ============================================

// This endpoint streams audio directly from ElevenLabs to the client
// Used after analyzeLessonForSpeech returns the explanation text
exports.streamAudio = async (req, res) => {
  try {
    const { text, voiceId } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Текст для озвучки отсутствует'
      });
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key не настроен'
      });
    }

    // Use environment variable or fallback to a default voice (Rachel)
    const VOICE_ID = voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    const API_KEY = process.env.ELEVENLABS_API_KEY;

    // ==========================================
    // 🇺🇿 UZBEK VOICE HANDLING
    // ==========================================
    if (req.body.language === 'uz') {
      const UZBEK_API_KEY = process.env.UZBEK_VOICE_API_KEY;

      console.log('[VoiceController] Uzbek Request:', {
        textLength: text.length,
        hasKey: !!UZBEK_API_KEY,
        keyLength: UZBEK_API_KEY ? UZBEK_API_KEY.length : 0
      });

      if (!UZBEK_API_KEY) {
        console.warn('⚠️ Uzbek Voice API key missing in process.env');
        return res.status(500).json({
          success: false,
          error: 'Uzbek Voice API key not configured on server',
          envKeys: Object.keys(process.env).filter(k => k.includes('API_KEY')) // Debug: list available keys
        });
      }

      // UzbekVoice.ai API Implementation
      const response = await axios({
        method: 'post',
        url: 'https://uzbekvoice.ai/api/v1/tts',
        data: {
          text: text,
          model: 'lola', // Female voice
          blocking: 'true', // Wait for audio
          // webhook_notification_url: '...' // Not needed for blocking
        },
        headers: {
          'Authorization': UZBEK_API_KEY, // User provided format: 'Authorization: [API_KEY]'
          'Content-Type': 'application/json',
        },
        responseType: 'stream'
      });

      // Check if response is JSON (error or url) or Audio
      // Assuming blocking=true returns audio stream directly based on standard TTS behavior
      // If it returns JSON with a URL, we might need to fetch it. 
      // For now, we pipe the response.

      res.set({
        'Content-Type': 'audio/mpeg', // Assuming MP3/WAV
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache'
      });

      response.data.pipe(res);
      return;
    }

    // ==========================================
    // 🇺🇸/🇷🇺 ELEVENLABS HANDLING (Default)
    // ==========================================

    // Call ElevenLabs streaming API
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
      data: {
        text: text,
        model_id: 'eleven_turbo_v2_5', // Turbo v2.5 is faster and supports better multilingual emotion
        voice_settings: {
          stability: 0.4,           // Lower stability = more emotion/variability (less robotic)
          similarity_boost: 0.6,    // Slightly lower similarity to allow more natural intonation
          style: 0.5,               // Increase style for more expressiveness
          use_speaker_boost: true   // Enhanced speaker clarity
        }
      },
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      responseType: 'stream' // CRITICAL: This enables streaming
    });

    // Set headers so the browser knows it's an audio stream
    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache'
    });

    // Pipe the audio stream directly to the client (no buffering delay)
    response.data.pipe(res);

  } catch (error) {
    let errorMessage = error.message;
    let errorDetails = null;

    // Handle Axios stream error response
    if (error.response && error.response.data) {
      try {
        if (typeof error.response.data.read === 'function' || error.response.data instanceof require('stream').Stream) {
          // It's a stream, read it to get the error message
          const chunks = [];
          for await (const chunk of error.response.data) {
            chunks.push(chunk);
          }
          const errorBody = Buffer.concat(chunks).toString('utf8');
          try {
            const jsonError = JSON.parse(errorBody);
            errorMessage = jsonError.detail?.message || jsonError.message || errorBody;
            errorDetails = jsonError;
          } catch (e) {
            errorMessage = errorBody;
          }
        } else {
          errorMessage = JSON.stringify(error.response.data);
        }
      } catch (readError) {
        console.error('Error reading error stream:', readError);
      }
    }

    console.error('❌ Voice Stream Error:', errorMessage);

    // Don't try to send JSON if headers already sent (streaming started)
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Не удалось синтезировать речь',
        details: errorMessage, // Exposed for debugging
        fullError: errorDetails,
        apiKeyConfigured: !!process.env.ELEVENLABS_API_KEY
      });
    }
  }
};

// ============================================
// INIT VOICE SESSION - Conversational AI Widget
// ============================================

exports.initVoiceSession = async (req, res) => {
  try {
    const { lessonId, currentStepId, currentStepIndex, language = 'en' } = req.body;

    // 1. Fetch the lesson content with .lean() for plain JS objects
    const lesson = await Lesson.findById(lessonId).lean();
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    // 2. Find the current step by ID or index
    let currentStep = null;
    if (currentStepId) {
      currentStep = lesson.steps.find(s => s._id?.toString() === currentStepId || s.id === currentStepId);
    }
    if (!currentStep && currentStepIndex !== undefined) {
      currentStep = lesson.steps[currentStepIndex];
    }

    // 3. Extract exercise content using the new extractor
    const lessonTitle = typeof lesson.lessonName === 'string'
      ? lesson.lessonName
      : (lesson.lessonName?.[language] || lesson.lessonName?.en || lesson.lessonName?.ru || lesson.title);

    const exerciseContext = buildVoiceAssistantContext({
      step: currentStep,
      lessonTitle,
      language,
      userProgress: {
        currentStepIndex: currentStepIndex || lesson.steps.indexOf(currentStep),
        totalSteps: lesson.steps.length
      }
    });

    console.log('🎤 [Voice Session] Exercise Context Built:', {
      lessonId,
      stepType: currentStep?.type,
      contextLength: exerciseContext.length
    });

    // 4. Build language-specific names for the AI instruction
    const languageNames = {
      en: 'English',
      ru: 'Russian',
      uz: 'Uzbek',
      es: 'Spanish'
    };
    const targetLanguage = languageNames[language] || 'English';

    // 5. Generate a context-aware "Speech Script" via OpenAI
    const systemPrompt = `You are an AI tutor voice assistant helping a student with their lesson.
You have access to the current exercise the student is viewing.
Based on this context, create a brief, engaging introduction or hint (under 100 words).
Do NOT give away the answer directly - guide the student to discover it themselves.

CRITICAL INSTRUCTION:
The user is currently speaking in **${targetLanguage}**.
You MUST reply in **${targetLanguage}**, even if the user's code or content contains other languages.

${exerciseContext}`;

    // Call OpenAI using official package
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Introduce this exercise to me or give me a helpful hint to get started." }
      ],
      max_tokens: 200
    });

    const aiText = aiResponse.choices[0].message.content;

    // 5. Create a Signed Session with ElevenLabs Conversational AI
    // This allows the frontend to connect without exposing your API Key
    const sessionResponse = await axios.post(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${process.env.ELEVENLABS_AGENT_ID}`,
      {},
      { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } }
    );

    res.json({
      signedUrl: sessionResponse.data.signed_url,
      script: aiText,
      exerciseContext: exerciseContext // Include context for frontend debugging/display
    });

  } catch (error) {
    console.error("Voice Init Error:", error);
    res.status(500).json({ error: "Failed to initialize Elya" });
  }
};

// ============================================
// GET EXERCISE CONTEXT - Extract context for current step
// ============================================

/**
 * Returns the extracted exercise context for a given step.
 * Useful for frontend to display what the AI "sees" or for debugging.
 * Does not initialize a voice session or call external APIs.
 */
exports.getExerciseContext = async (req, res) => {
  try {
    const { lessonId, currentStepId, currentStepIndex, language = 'en' } = req.body;

    // 1. Fetch the lesson content with .lean() for plain JS objects
    const lesson = await Lesson.findById(lessonId).lean();
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    // 2. Find the current step by ID or index
    let currentStep = null;
    if (currentStepId) {
      currentStep = lesson.steps.find(s => s._id?.toString() === currentStepId || s.id === currentStepId);
    }
    if (!currentStep && currentStepIndex !== undefined) {
      currentStep = lesson.steps[currentStepIndex];
    }

    if (!currentStep) {
      return res.status(404).json({ message: "Step not found" });
    }

    // 3. Get localized lesson title
    const lessonTitle = typeof lesson.lessonName === 'string'
      ? lesson.lessonName
      : (lesson.lessonName?.[language] || lesson.lessonName?.en || lesson.lessonName?.ru || lesson.title);

    // 4. Extract exercise content using the new extractor
    const exerciseContent = extractExerciseContent(currentStep, language);
    const fullContext = buildVoiceAssistantContext({
      step: currentStep,
      lessonTitle,
      language,
      userProgress: {
        currentStepIndex: currentStepIndex ?? lesson.steps.indexOf(currentStep),
        totalSteps: lesson.steps.length
      }
    });

    console.log('📝 [Exercise Context] Extracted:', {
      lessonId,
      stepType: currentStep?.type,
      contentLength: exerciseContent.length
    });

    res.json({
      success: true,
      exerciseContent,
      fullContext,
      stepType: currentStep.type,
      stepTitle: typeof currentStep.title === 'string'
        ? currentStep.title
        : (currentStep.title?.[language] || currentStep.title?.en || ''),
      lessonTitle
    });

  } catch (error) {
    console.error("Get Exercise Context Error:", error);
    res.status(500).json({ error: "Failed to extract exercise context", details: error.message });
  }
};

// ============================================
// PROCESS VOICE QUERY - Handle voice queries with exercise context
// ============================================

/**
 * Processes a voice/text query from the user with full exercise context.
 * Returns AI response that can be converted to speech.
 */
exports.processVoiceQuery = async (req, res) => {
  try {
    const {
      lessonId,
      currentStepId,
      currentStepIndex,
      query,
      language = 'en',
      conversationHistory = []
    } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: "Query is required" });
    }

    // 1. Fetch the lesson content with .lean() for plain JS objects
    const lesson = await Lesson.findById(lessonId).lean();
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    // 2. Find the current step
    let currentStep = null;
    if (currentStepId) {
      currentStep = lesson.steps.find(s => s._id?.toString() === currentStepId || s.id === currentStepId);
    }
    if (!currentStep && currentStepIndex !== undefined) {
      currentStep = lesson.steps[currentStepIndex];
    }

    // 3. Get localized lesson title
    const lessonTitle = typeof lesson.lessonName === 'string'
      ? lesson.lessonName
      : (lesson.lessonName?.[language] || lesson.lessonName?.en || lesson.lessonName?.ru || lesson.title);

    // 4. Build full exercise context
    const exerciseContext = buildVoiceAssistantContext({
      step: currentStep,
      lessonTitle,
      language,
      userProgress: {
        currentStepIndex: currentStepIndex ?? (currentStep ? lesson.steps.indexOf(currentStep) : 0),
        totalSteps: lesson.steps.length
      }
    });

    console.log('🎙️ [Voice Query] Processing:', {
      lessonId,
      stepType: currentStep?.type,
      queryLength: query.length,
      historyLength: conversationHistory.length
    });

    // 5. Build system prompt with exercise context
    const languageNames = {
      en: 'English',
      ru: 'Russian',
      uz: 'Uzbek',
      es: 'Spanish'
    };
    const targetLanguage = languageNames[language] || 'English';

    const systemPrompt = `You are Elya, a friendly and helpful AI tutor voice assistant.
You are helping a student with their lesson.

CRITICAL INSTRUCTION:
The user is currently speaking in **${targetLanguage}**.
You MUST reply in **${targetLanguage}**, even if the user's code or content contains other languages.

${exerciseContext}

IMPORTANT GUIDELINES:
- If the user asks for help, guide them toward the answer without giving it away directly.
- If the user is stuck, provide hints based on the exercise content above.
- If the user asks "what do I need to do?", explain the task clearly using the exercise details.
- Keep responses concise and suitable for voice (under 150 words).
- Be encouraging and supportive.
- If the user seems frustrated, offer a bigger hint or break down the problem.`;

    // 6. Build messages array with conversation history
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: "user", content: query }
    ];

    // 7. Call OpenAI
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 300,
      temperature: 0.7
    });

    const responseText = aiResponse.choices[0].message.content;

    res.json({
      success: true,
      response: responseText,
      exerciseContext, // Include for debugging/display
      stepType: currentStep?.type
    });

  } catch (error) {
    console.error("Voice Query Error:", error);
    res.status(500).json({ error: "Failed to process voice query", details: error.message });
  }
};