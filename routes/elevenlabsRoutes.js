// routes/elevenlabsRoutes.js - ElevenLabs Voice AI Integration for Lexi
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const voiceController = require('../controllers/voiceController');

// ========================================
// 🎤 STREAMING AUDIO (Low Latency - Perfect Harmony)
// ========================================

// Stream audio directly from ElevenLabs to client (used after analyze-speech)
router.post('/stream', verifyToken, voiceController.streamAudio);

// GET handler for stream endpoint - return proper error
router.get('/stream', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Method Not Allowed. This endpoint requires a POST request.',
    method: req.method,
    endpoint: '/api/elevenlabs/stream',
    requiredBody: {
      text: 'string (required)',
      voiceId: 'string (optional)'
    }
  });
});

// ========================================
// 🎤 TEXT-TO-SPEECH (Lexi Speaks)
// ========================================

router.post('/text-to-speech', verifyToken, async (req, res) => {
  try {
    const { text, voiceId = 'EXAVITQu4vr4xnSDxMaL' } = req.body; // Default: Sarah voice

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key not configured'
      });
    }

    console.log(`🎤 TTS Request: "${text.substring(0, 50)}..."`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ ElevenLabs TTS error:', response.status, errorText);
      throw new Error(`ElevenLabs error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.byteLength
    });

    res.send(Buffer.from(audioBuffer));
    console.log('✅ TTS audio sent successfully');

  } catch (error) {
    console.error('❌ TTS Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// 🎤 TEXT-TO-SPEECH WITH TIMESTAMPS (For Synced Highlighting)
// ========================================

router.post('/text-to-speech-with-timestamps', verifyToken, async (req, res) => {
  try {
    const { text, voiceId = 'EXAVITQu4vr4xnSDxMaL' } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key not configured'
      });
    }

    console.log(`🎤 TTS+Timestamps Request: "${text.substring(0, 50)}..."`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ ElevenLabs TTS+Timestamps error:', response.status, errorText);
      throw new Error(`ElevenLabs error: ${response.status}`);
    }

    const data = await response.json();

    // data contains: { audio_base64, alignment: { characters, character_start_times_seconds, character_end_times_seconds } }

    res.json({
      success: true,
      audioBase64: data.audio_base64,
      alignment: data.alignment
    });

    console.log('✅ TTS+Timestamps sent successfully');

  } catch (error) {
    console.error('❌ TTS+Timestamps Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// 🎧 SPEECH-TO-TEXT (User Speaks)
// ========================================

router.post('/speech-to-text', verifyToken, async (req, res) => {
  try {
    const { audioBase64 } = req.body;

    if (!audioBase64) {
      return res.status(400).json({
        success: false,
        error: 'Audio data is required'
      });
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key not configured'
      });
    }

    console.log('🎧 STT Request received');

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Create form data
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/webm' });
    formData.append('audio', blob, 'recording.webm');

    const response = await fetch(
      'https://api.elevenlabs.io/v1/speech-to-text',
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        },
        body: formData
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ ElevenLabs STT error:', response.status, errorText);
      throw new Error(`ElevenLabs STT error: ${response.status}`);
    }

    const data = await response.json();

    res.json({
      success: true,
      text: data.text,
      language: data.language_code
    });

    console.log('✅ STT transcription:', data.text?.substring(0, 50));

  } catch (error) {
    console.error('❌ STT Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// 📋 GET AVAILABLE VOICES
// ========================================

router.get('/voices', verifyToken, async (req, res) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key not configured'
      });
    }

    const response = await fetch(
      'https://api.elevenlabs.io/v1/voices',
      {
        method: 'GET',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        }
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs error: ${response.status}`);
    }

    const data = await response.json();

    // Return simplified voice list
    const voices = data.voices.map(voice => ({
      voiceId: voice.voice_id,
      name: voice.name,
      category: voice.category,
      description: voice.description,
      previewUrl: voice.preview_url
    }));

    res.json({
      success: true,
      voices
    });

  } catch (error) {
    console.error('❌ Voices Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// 🔊 TEST ENDPOINT
// ========================================

router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ ElevenLabs routes are working',
    apiKeyConfigured: !!process.env.ELEVENLABS_API_KEY,
    endpoints: [
      'POST /api/elevenlabs/stream (Low Latency Streaming)',
      'POST /api/elevenlabs/text-to-speech',
      'POST /api/elevenlabs/text-to-speech-with-timestamps',
      'POST /api/elevenlabs/speech-to-text',
      'GET /api/elevenlabs/voices',
      'GET /api/elevenlabs/test'
    ]
  });
});

module.exports = router;