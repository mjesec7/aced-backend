const axios = require('axios');
const Lesson = require('../models/lesson');
require('dotenv').config();

// ✅ POST /api/chat — Handles text & image-based AI queries
const getAIResponse = async (req, res) => {
  try {
    const { userInput, imageUrl, lessonId } = req.body;

    if (!userInput && !imageUrl) {
      return res.status(400).json({ error: '❌ Нет запроса или изображения' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: '❌ Отсутствует API-ключ OpenAI' });
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

    // 🧠 Context from lesson
    let lessonContext = '';
    if (lessonId) {
      try {
        const lesson = await Lesson.findById(lessonId);
        if (lesson) {
          lessonContext = `Урок: ${lesson.lessonName}\nТема: ${lesson.topic}\nОписание: ${lesson.content || ''}\nПодсказка: ${lesson.hint || ''}`;
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

    const messages = [
      {
        role: 'system',
        content: `Ты — образовательный помощник. Объясняй темы подробно, с примерами. 
Вот контекст урока:\n${lessonContext || 'Нет дополнительной информации о теме.'}\n
Не обсуждай политику, религию или чувствительные темы.`,
      },
      {
        role: 'user',
        content: contentArray,
      }
    ];

    console.log("📤 Prompt to OpenAI:", JSON.stringify(messages, null, 2));

    // 🌐 Send to OpenAI
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages,
        max_tokens: 1000,
        temperature: 0.5,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const reply = response?.data?.choices?.[0]?.message?.content?.trim() || "⚠️ AI не смог дать ответ.";
    res.json({ reply });

  } catch (error) {
    console.error("❌ Ошибка от AI:", error.response?.data || error.message);
    res.status(500).json({
      error: '⚠️ Ошибка при получении ответа от AI',
      debug: error.response?.data || error.message
    });
  }
};

module.exports = { getAIResponse };
