const axios = require('axios');
const Lesson = require('../models/lesson');
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");

// Initialize ElevenLabs Client
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

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