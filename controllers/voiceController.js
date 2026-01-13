const axios = require('axios');
const Lesson = require('../models/lesson');
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
require('dotenv').config();

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
    const { lessonId, currentStepId } = req.body;

    // 1. Fetch the lesson content
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    // 2. Extract the specific text for the current step
    const stepContent = lesson.steps.find(s => s.id === currentStepId)?.explanation || lesson.title;

    // 3. Generate a "Speech Script" via OpenAI
    // We use your existing AI infrastructure to summarize the text
    const aiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are Elya, a friendly teacher. Summarize the following lesson content in 2 engaging sentences. Then ask: 'Does that make sense?'"
        },
        { role: "user", content: stepContent }
      ]
    }, {
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
    });

    const speechScript = aiResponse.data.choices[0].message.content;

    // 4. Create a Signed Session with ElevenLabs Conversational AI
    // This allows the frontend to connect without exposing your API Key
    const sessionResponse = await axios.post(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${process.env.ELEVENLABS_AGENT_ID}`,
      {},
      { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } }
    );

    res.json({
      signedUrl: sessionResponse.data.signed_url,
      script: speechScript
    });

  } catch (error) {
    console.error("Voice Init Error:", error);
    res.status(500).json({ error: "Failed to initialize Elya" });
  }
};