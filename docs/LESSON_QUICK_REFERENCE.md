# ACED Lesson JSON - Quick Reference Card

> A condensed guide for rapid lesson creation

---

## Minimal Valid Lesson

```json
{
  "subject": "Mathematics",
  "level": 1,
  "topic": "Basic Math",
  "lessonName": "Lesson Title",
  "description": "Lesson description here",
  "steps": [
    {
      "type": "explanation",
      "order": 0,
      "title": "Step Title",
      "instructions": "Read below",
      "content": { "text": "Your explanation text here (min 100 chars)..." },
      "difficulty": "beginner",
      "estimatedDuration": 3
    }
  ]
}
```

---

## All Step Types (Cheatsheet)

| Type | Content Structure | Component |
|------|-------------------|-----------|
| `explanation` | `{ text: "..." }` | Text display |
| `exercise` | `{ exercises: [...] }` | Exercise renderer |
| `quiz` | `{ questions: [...] }` | Quiz renderer |
| `vocabulary` | `{ terms: [...] }` | Vocabulary modal |
| `introduction` | `{ text: "..." }` | Text display |
| `summary` | `{ text: "..." }` | Text display |
| `video` | `{ url: "...", title: "..." }` | Video player |

### Special Interactive Types

| Type | Key Content Fields |
|------|-------------------|
| `data_analysis` | `prompt`, `data[]`, `numericKey`, `correctAnswer` |
| `fraction_visual` | `targetNumerator`, `targetDenominator`, `requiredShaded` |
| `geometry_poly` | `prompt`, `shapes[]`, `correctShape` |
| `chem_mixing` | `substances[]`, `tolerance` |
| `chem_matching` | `pairs[]` with `name` + `formula` |
| `english_sentence_fix` | `originalSentence`, `tokens[]`, `errors[]` |
| `english_sentence_order` | `correctOrder[]`, `scrambledOptions[]` |
| `language_noun_bag` | `words[]`, `targetPos`, `bagLabel` |
| `language_tone_transformer` | `originalSentence`, `targetTone`, `correctAnswer` |
| `language_idiom_bridge` | `sourceIdioms[]`, `targetIdioms[]` |
| `language_word_constellation` | `centralWord`, `words[]`, `requiredConnections[]` |
| `language_rhythm_match` | `targetPattern[]`, `options[]`, `correctIndex` |
| `language_false_friends` | `words[]` with `isFalseFriend` |

---

## Exercise Types Quick Reference

### Multiple Choice
```json
{
  "type": "multiple-choice",
  "question": "Question text?",
  "options": ["A", "B", "C", "D"],
  "correctAnswer": 1,
  "explanation": "Why B is correct"
}
```

### True/False
```json
{
  "type": "true-false",
  "question": "Statement here",
  "correctAnswer": true,
  "explanation": "Why true"
}
```

### Short Answer
```json
{
  "type": "short-answer",
  "question": "Question?",
  "correctAnswer": "answer",
  "acceptableAnswers": ["answer", "Answer"]
}
```

### Fill in Blank
```json
{
  "type": "fill-blank",
  "template": "The _____ is correct.",
  "blanks": [{
    "id": "b1",
    "correctAnswer": "answer",
    "placeholder": "..."
  }]
}
```

### Matching
```json
{
  "type": "matching",
  "pairs": [
    { "left": "Term 1", "right": "Definition 1" },
    { "left": "Term 2", "right": "Definition 2" }
  ]
}
```

### Ordering
```json
{
  "type": "ordering",
  "items": ["word1", "word2", "word3"],
  "correctOrder": [0, 1, 2]
}
```

### Drag and Drop
```json
{
  "type": "drag-drop",
  "dragItems": [
    { "id": "i1", "text": "Item", "category": "cat1" }
  ],
  "dropZones": [
    { "id": "z1", "label": "Zone", "accepts": "cat1" }
  ]
}
```

---

## Multi-Language Format

```json
{
  "lessonName": {
    "en": "English Title",
    "ru": "Русское название",
    "uz": "O'zbek nomi"
  }
}
```

**Supports:** `en` (English), `ru` (Russian), `uz` (Uzbek)

---

## Vocabulary Terms Format

```json
{
  "terms": [
    {
      "term": "word",
      "definition": "meaning",
      "example": "The word in a sentence.",
      "pronunciation": "/wɜːd/"
    }
  ]
}
```

---

## Quiz Questions Format

```json
{
  "questions": [
    {
      "id": "q1",
      "question": "Question text?",
      "type": "multiple-choice",
      "options": [
        { "text": "Option A", "value": 0 },
        { "text": "Option B", "value": 1 }
      ],
      "correctAnswer": 1,
      "points": 10
    }
  ]
}
```

---

## Game Step Format

```json
{
  "type": "game",
  "gameType": "memory-cards",
  "gameConfig": {
    "difficulty": "medium",
    "timeLimit": 60,
    "targetScore": 100,
    "items": [
      { "id": "i1", "content": "Text", "isCorrect": true }
    ]
  }
}
```

**Game Types:** `basket-catch`, `memory-cards`, `whack-a-mole`, `tower-builder`, `target-practice`, `maze-runner`, `bubble-pop`, `lightning-round`, `scale-balance`, `pattern-builder`

---

## Difficulty Levels

`beginner` → `elementary` → `intermediate` → `advanced` → `expert`

---

## Required Step Fields

Every step MUST have:
- `type` - Step type
- `order` - Number (0-based)
- `title` - String or multilingual object
- `instructions` - String or multilingual object  
- `content` - Object (varies by type)
- `difficulty` - One of the 5 levels
- `estimatedDuration` - Number (1-120 minutes)

---

## Optional Common Fields

```json
{
  "scoring": {
    "maxPoints": 10,
    "passingScore": 7,
    "weight": 1
  },
  "hints": ["Hint 1", "Hint 2"],
  "includeInHomework": true
}
```

---

## Validation Checklist

- [ ] `subject`, `level`, `topic`, `lessonName`, `description` present
- [ ] `steps` array has at least 1 step
- [ ] Each step has all required fields
- [ ] `explanation` type has `text` (100+ chars)
- [ ] `exercise` type has `exercises` array
- [ ] `quiz` type has `questions` array
- [ ] `vocabulary` type has `terms` array
- [ ] `estimatedDuration` is 1-120
- [ ] `difficulty` is valid level
- [ ] Valid JSON syntax (use validator)

---

## File Locations

- **Full Documentation:** `docs/LESSON_JSON_STRUCTURE.md`
- **Sample Lesson:** `seedData/sample-complete-lesson.json`
- **Test Interactive:** `seedData/test-interactive-lesson.json`
- **English-Geometry Mix:** `public/lessons/english-geometry-mix.json` (frontend)

---

## Tips

1. Always start with `introduction`, end with `summary`
2. Use `explanation` before exercises
3. Include `vocabulary` for new terms
4. Mix exercise types for engagement
5. Mark important exercises with `includeInHomework: true`
6. Test JSON validity before uploading
7. Keep `estimatedDuration` realistic
