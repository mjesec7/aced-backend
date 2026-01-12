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

    // Call ElevenLabs streaming API
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
      data: {
        text: text,
        model_id: 'eleven_multilingual_v2', // V2 supports better emotion and Russian language
        voice_settings: {
          stability: 0.5,           // Balance between emotion and consistency
          similarity_boost: 0.75,   // Voice similarity
          style: 0.0,               // Style exaggeration
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
    console.error('❌ Voice Stream Error:', error.response?.data || error.message);

    // Don't try to send JSON if headers already sent (streaming started)
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Не удалось синтезировать речь',
        debug: process.env.NODE_ENV === 'development' ? error.message : undefined
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