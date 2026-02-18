// ========================================
// 🧠 AI TEST GENERATION ROUTES (DeepSeek)
// ========================================

const express = require('express');
const router = express.Router();
const authenticateUser = require('../middlewares/authMiddleware');

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

/**
 * Call DeepSeek API and return parsed JSON.
 */
const callDeepSeek = async (systemPrompt, userPrompt) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

    const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.8,
            max_tokens: 4096
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`DeepSeek API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('No response from DeepSeek');

    return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
};

// ========================================
// POST /api/ai-tests/quiz
// ========================================
router.post('/quiz', authenticateUser, async (req, res) => {
    try {
        const { mode, targetId, targetName, difficulty, specificTopic, language = 'en' } = req.body;
        const langName = language === 'uz' ? 'Uzbek' : language === 'ru' ? 'Russian' : 'English';

        const systemPrompt = `You are an expert educational AI that generates quiz questions. You MUST respond with valid JSON only, no markdown or extra text.`;

        let contextPrompt = '';
        if (mode === 'EXAM_SIMULATION') {
            contextPrompt = `You are an expert exam proctor for the ${targetName}.
Create a single, realistic multiple-choice practice question that mimics the format, difficulty, and style of the ${targetName}.
Use the standard difficulty expected for the ${targetName} exam.
${specificTopic ? `Focus on this specific topic: "${specificTopic}".` : ''}
For language exams (IELTS/TOEFL): Focus on Vocabulary, Reading Comprehension, or Grammar.
For Math exams (SAT/GRE): Provide a word problem using plain text (e.g. x^2, sqrt()).`;
        } else {
            contextPrompt = `You are a fun, engaging tutor for ${targetName}.
${specificTopic ? `Test the user specifically on: "${specificTopic}".` : ''}
Create an interesting trivia or concept-check question about ${targetName}.
Difficulty Level: ${difficulty || 'Intermediate'}.
- Beginner: Fundamental concepts, basic definitions.
- Intermediate: Application of concepts, standard problems.
- Advanced: Complex analysis, edge cases, deep theory.
- Expert: Highly specialized knowledge or multi-step reasoning.`;
        }

        const userPrompt = `${contextPrompt}

ALL text content (question, context, options, explanation, tip) MUST be in ${langName} language.

Return a JSON object with exactly these fields:
{
  "context": "Short setup, reading passage, or problem statement",
  "question": "The actual question to answer",
  "tag": "Specific sub-topic tag",
  "options": [
    {"id": "a", "text": "Option text", "isCorrect": false},
    {"id": "b", "text": "Option text", "isCorrect": true},
    {"id": "c", "text": "Option text", "isCorrect": false},
    {"id": "d", "text": "Option text", "isCorrect": false}
  ],
  "explanation": "Clear reasoning why the answer is correct",
  "tip": "A Pro Tip, Exam Strategy, or Fun Fact"
}

Exactly one option must have isCorrect: true. Provide exactly 4 options.`;

        const result = await callDeepSeek(systemPrompt, userPrompt);
        res.json({ success: true, data: result });

    } catch (error) {
        console.error('❌ AI quiz generation error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// POST /api/ai-tests/mock-test
// ========================================
router.post('/mock-test', authenticateUser, async (req, res) => {
    try {
        const { subject, level, topic, count = 5, language = 'en' } = req.body;
        const langName = language === 'uz' ? 'Uzbek' : language === 'ru' ? 'Russian' : 'English';

        const systemPrompt = `You are an expert educational AI that generates mock tests. You MUST respond with valid JSON only — a JSON object containing a "questions" array.`;

        const userPrompt = `Create a mock test with ${count} multiple-choice questions.
Subject: ${subject}
Difficulty: ${level}
Topic: ${topic || 'General ' + subject}

ALL text content MUST be in ${langName} language.

Return a JSON object like this:
{
  "questions": [
    {
      "context": "Problem setup",
      "question": "The question",
      "tag": "Sub-topic",
      "options": [
        {"id": "a", "text": "...", "isCorrect": false},
        {"id": "b", "text": "...", "isCorrect": true},
        {"id": "c", "text": "...", "isCorrect": false},
        {"id": "d", "text": "...", "isCorrect": false}
      ],
      "explanation": "Why the answer is correct",
      "tip": "Exam strategy or fun fact"
    }
  ]
}

Each question must have exactly 4 options with exactly one correct. Make questions diverse.`;

        const result = await callDeepSeek(systemPrompt, userPrompt);
        res.json({ success: true, data: result.questions || [result] });

    } catch (error) {
        console.error('❌ AI mock test generation error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// POST /api/ai-tests/study-plan
// ========================================
router.post('/study-plan', authenticateUser, async (req, res) => {
    try {
        const { subject, level, targetDate, topics, language = 'en' } = req.body;
        const langName = language === 'uz' ? 'Uzbek' : language === 'ru' ? 'Russian' : 'English';

        const systemPrompt = `You are an expert educational AI that creates structured study plans. You MUST respond with valid JSON only.`;

        const userPrompt = `Create a structured exam preparation pathway for a student.
Subject: ${subject}
Target Level: ${level}
Exam Date: ${targetDate}
Topics to Cover: ${topics}

Text content (examTitle, milestone titles and descriptions) MUST be in ${langName}.

Return a JSON object:
{
  "examTitle": "A title for this exam plan",
  "milestones": [
    {
      "title": "Milestone name",
      "description": "What this milestone covers",
      "type": "Practice"
    }
  ]
}

Generate 3 to 5 milestones. Type must be one of: "Practice", "Mock Exam", "Review".
Milestones should logically progress from topic review to full mock exam.`;

        const result = await callDeepSeek(systemPrompt, userPrompt);

        const pathway = {
            id: require('crypto').randomUUID(),
            subject,
            level,
            targetDate,
            topics,
            examTitle: result.examTitle,
            milestones: (result.milestones || []).map((m) => ({
                ...m,
                id: require('crypto').randomUUID(),
                status: 'Pending'
            }))
        };

        res.json({ success: true, data: pathway });

    } catch (error) {
        console.error('❌ AI study plan generation error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
