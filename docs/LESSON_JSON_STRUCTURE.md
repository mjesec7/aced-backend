# ACED Lesson JSON Structure - Complete Reference Guide

> **Version:** 1.0  
> **Last Updated:** February 2026  
> **Compatible with:** ACED Backend & Frontend

This document describes the complete JSON structure for lessons in the ACED platform. Follow this guide to create properly formatted lesson JSON files that will work correctly with both the backend and frontend systems.

---

## Table of Contents

1. [Quick Start - Minimal Example](#quick-start)
2. [Complete Lesson Structure](#complete-lesson-structure)
3. [Step Types](#step-types)
4. [Exercise Types](#exercise-types)
5. [Interactive Exercise Types](#interactive-exercise-types)
6. [Game Types](#game-types)
7. [Multi-Language Support](#multi-language-support)
8. [Vocabulary Structure](#vocabulary-structure)
9. [Quiz Structure](#quiz-structure)
10. [Complete Example](#complete-example)

---

## Quick Start

### Minimal Lesson Example

```json
{
  "subject": "Mathematics",
  "level": 1,
  "topic": "Basic Addition",
  "topicDescription": "Learn the basics of addition",
  "lessonName": "Introduction to Addition",
  "description": "Learn how to add single-digit numbers",
  "type": "free",
  "steps": [
    {
      "type": "explanation",
      "order": 0,
      "title": "What is Addition?",
      "instructions": "Read the explanation below.",
      "content": {
        "text": "Addition is the process of combining two or more numbers to get a total."
      },
      "difficulty": "beginner",
      "estimatedDuration": 3
    },
    {
      "type": "exercise",
      "order": 1,
      "title": "Try It!",
      "instructions": "Solve the addition problem.",
      "content": {
        "exercises": [
          {
            "type": "multiple-choice",
            "question": "What is 2 + 3?",
            "options": ["4", "5", "6", "7"],
            "correctAnswer": 1
          }
        ]
      },
      "difficulty": "beginner",
      "estimatedDuration": 2
    }
  ]
}
```

---

## Complete Lesson Structure

```json
{
  // ========== REQUIRED FIELDS ==========
  "subject": "string",           // Subject name (e.g., "Mathematics", "English", "Science")
  "level": "number",             // Difficulty level (1-20)
  "topic": "string",             // Topic name
  "lessonName": "string | object", // Lesson name (can be multilingual)
  "description": "string | object", // Lesson description (can be multilingual)
  "steps": [],                   // Array of lesson steps (REQUIRED, minimum 1)

  // ========== OPTIONAL FIELDS ==========
  "topicId": "ObjectId",         // MongoDB ObjectId reference to Topic collection
  "topicDescription": "string",  // Description for creating new topic if doesn't exist
  "type": "free | premium | trial",  // Lesson access type (default: "free")
  "difficulty": "beginner | elementary | intermediate | advanced | expert",
  "status": "draft | review | approved | published | archived",
  "visibility": "public | private | restricted",
  "isActive": "boolean",         // Whether lesson is active (default: true)

  // ========== TIMING CONFIGURATION ==========
  "timing": {
    "estimatedDuration": "number",    // Total minutes to complete (REQUIRED)
    "minDuration": "number",          // Minimum completion time
    "maxDuration": "number",          // Maximum completion time
    "timeLimit": "number",            // Optional hard time limit
    "schedule": {
      "recommendedTime": "morning | afternoon | evening",
      "recommendedDays": "number",
      "deadline": "Date"
    }
  },

  // ========== STEP REQUIREMENTS ==========
  "stepRequirements": {
    "explanation": {
      "required": true,
      "minCount": 1,
      "maxCount": 3
    },
    "exercise": {
      "required": true,
      "minCount": 7,
      "maxCount": 20
    },
    "quiz": {
      "required": false,
      "minCount": 3,
      "maxCount": 10
    },
    "practice": {
      "required": false,
      "minCount": 2,
      "maxCount": 5
    }
  },

  // ========== ASSESSMENT CONFIGURATION ==========
  "assessment": {
    "enabled": true,
    "passingScore": 70,
    "certificateEligible": false,
    "grading": {
      "exercises": 40,
      "quizzes": 30,
      "participation": 20,
      "homework": 10
    }
  },

  // ========== GAMIFICATION ==========
  "gamification": {
    "enabled": true,
    "points": 100,
    "badges": [
      {
        "id": "badge-id",
        "name": "Badge Name",
        "icon": "🏆",
        "condition": "Complete all exercises"
      }
    ],
    "achievements": [
      {
        "id": "achievement-id",
        "name": "Achievement Name",
        "description": "Achievement description",
        "points": 50
      }
    ]
  },

  // ========== ADAPTIVE LEARNING ==========
  "adaptive": {
    "enabled": true,
    "personalizedPaths": true,
    "difficultyAdjustment": true,
    "paceAdjustment": true,
    "rules": [
      {
        "condition": "score < 70",
        "action": "add_practice",
        "parameters": {}
      }
    ]
  },

  // ========== MODE RESTRICTIONS ==========
  "modeRestrictions": {
    "schoolOnly": false,
    "studyCentreOnly": false,
    "availableInBothModes": true,
    "schoolRequirements": {
      "prerequisiteLessons": [],
      "minimumGrade": "A1 | A2 | B1 | B2 | C1 | C2 | Expert | Master",
      "mustCompleteInOrder": true,
      "isMandatory": false,
      "allowedRetakes": 2
    },
    "studyCentreFeatures": {
      "allowSkipping": true,
      "showHints": true,
      "unlimitedAttempts": true,
      "selfPaced": true
    }
  },

  // ========== AI CONFIGURATION ==========
  "ai": {
    "enabled": true,
    "chatbot": true,
    "voiceAssistant": false,
    "autoGrading": true,
    "contentGeneration": false,
    "personalizedHints": true,
    "adaptiveQuestions": true,
    "learningAnalytics": true
  },

  // ========== RESOURCES ==========
  "resources": {
    "materials": [
      {
        "type": "pdf | video | link",
        "title": "string",
        "url": "string",
        "size": "number",
        "required": false
      }
    ],
    "references": [
      {
        "title": "string",
        "author": "string",
        "url": "string",
        "type": "book | article | website"
      }
    ],
    "glossary": [
      {
        "term": "string",
        "definition": "string",
        "pronunciation": "string"
      }
    ]
  },

  // ========== METADATA ==========
  "metadata": {
    "version": 1,
    "language": "en | ru | uz",
    "targetAudience": ["elementary", "beginner"],
    "keywords": ["keyword1", "keyword2"],
    "seoTitle": "string",
    "seoDescription": "string",
    "qualityScore": "number",
    "reviewedBy": "string",
    "reviewedAt": "Date",
    "source": "string",
    "license": "string",
    "attribution": "string"
  },

  // ========== LEARNING PATH ==========
  "learningPath": {
    "prerequisites": ["lessonId1", "lessonId2"],
    "nextLessons": ["lessonId3", "lessonId4"],
    "relatedLessons": ["lessonId5"]
  },

  // ========== ACCESSIBILITY ==========
  "accessibility": {
    "wcagLevel": "AA",
    "screenReader": true,
    "captions": true,
    "transcripts": true,
    "signLanguage": false,
    "simplifiedVersion": false
  },

  // ========== SYSTEM FIELDS (Auto-generated) ==========
  "createdBy": "ObjectId",
  "updatedBy": "ObjectId",
  "createdAt": "Date",
  "updatedAt": "Date",
  "deletedAt": "Date"
}
```

---

## Step Types

Each step in the `steps` array must have a `type` field. Here are all supported step types:

### Content Steps (Non-Interactive)

| Type | Description | Use Case |
|------|-------------|----------|
| `introduction` | Lesson introduction | Welcome message, objectives |
| `explanation` | Core concept explanation | Teaching main concepts |
| `example` | Detailed examples | Showing how concepts apply |
| `demonstration` | Visual demonstration | Step-by-step walkthrough |
| `reading` | Reading comprehension | Text passages |
| `video` | Video content | Instructional videos |
| `summary` | Lesson summary | Key takeaways |
| `review` | Review section | Recap of material |

### Interactive Steps

| Type | Description | Use Case |
|------|-------------|----------|
| `exercise` | Interactive exercises | Questions, problems |
| `quiz` | Knowledge check | Multiple choice questions |
| `practice` | Guided practice | Hands-on activities |
| `vocabulary` | Terms and definitions | Word learning |
| `listening` | Audio exercises | Language learning |
| `writing` | Writing practice | Essay, paragraph |
| `speaking` | Speaking practice | Pronunciation |
| `game` | Gamified learning | Interactive games |
| `project` | Mini-projects | Applied learning |
| `assessment` | Formal assessment | Graded evaluation |
| `homework` | Take-home work | Additional practice |

### Special Interactive Types (Frontend Components)

| Type | Description | Component |
|------|-------------|-----------|
| `data_analysis` | Data tables with calculations | `DataAnalysisStep.vue` |
| `fraction_visual` | Interactive fraction grids | `FractionVisualStep.vue` |
| `geometry_poly` | Polygon angle visualizations | `GeometryPolyStep.vue` |
| `chem_mixing` | Chemical mixing simulator | `ChemMixingStep.vue` |
| `chem_matching` | Formula/name matching | `ChemMatchingStep.vue` |
| `english_sentence_fix` | Grammar correction | `EnglishSentenceFixStep.vue` |
| `english_sentence_order` | Sentence ordering | `EnglishSentenceOrderStep.vue` |
| `language_noun_bag` | Word categorization | `LanguageNounBagStep.vue` |
| `language_tone_transformer` | Emotional register transformation | `LanguageToneTransformer.vue` |
| `language_idiom_bridge` | Cross-language idiom matching | `LanguageIdiomBridge.vue` |
| `language_word_constellation` | Semantic word relationship maps | `LanguageWordConstellation.vue` |
| `language_rhythm_match` | Sentence stress/prosody patterns | `LanguageRhythmMatch.vue` |
| `language_false_friends` | False cognate identification | `LanguageFalseFriends.vue` |
| `histogram` | Interactive histogram/chart | `ModernHistogram.vue` |
| `map` | Interactive map with markers | `ModernMap.vue` |
| `block-coding` | Block-based coding | `ModernBlockCoding.vue` |
| `geometry` | Geometry exercises | `GeometryExercise.vue` |

---

## Step Structure

### Base Step Fields

```json
{
  "type": "string",               // REQUIRED - Step type
  "order": "number",              // REQUIRED - Step order (0-based)
  "title": "string | object",     // REQUIRED - Step title (can be multilingual)
  "instructions": "string | object", // REQUIRED - Step instructions
  "content": "object",            // REQUIRED - Step content (varies by type)
  "difficulty": "beginner | elementary | intermediate | advanced | expert",
  "estimatedDuration": "number",  // Minutes (REQUIRED, 1-120)
  
  // Scoring Configuration
  "scoring": {
    "maxPoints": 10,
    "passingScore": 7,
    "weight": 1,
    "allowRetry": true,
    "maxRetries": 3
  },
  
  // Adaptive Configuration
  "adaptive": {
    "skipIfMastered": false,
    "requiredForNext": true,
    "prerequisites": [],
    "unlocks": []
  },
  
  // Media
  "media": {
    "images": [
      { "url": "string", "caption": "string", "alt": "string" }
    ],
    "videos": [
      { "url": "string", "duration": "number", "transcript": "string" }
    ],
    "audio": [
      { "url": "string", "duration": "number", "transcript": "string" }
    ]
  },
  
  // Interactivity
  "interactive": {
    "enabled": true,
    "features": ["drag-drop", "highlighting", "annotation"],
    "collaborative": false
  },
  
  // AI Enhancement
  "ai": {
    "enabled": true,
    "hints": true,
    "explanations": true,
    "personalization": true
  },
  
  // Metadata
  "metadata": {
    "version": 1,
    "lastUpdated": "Date",
    "author": "string",
    "tags": [],
    "isOptional": false,
    "isHidden": false
  },
  
  // Game Configuration (for game steps)
  "gameType": "basket-catch | memory-cards | whack-a-mole | etc.",
  "gameConfig": {
    "difficulty": "easy | medium | hard",
    "timeLimit": 60,
    "targetScore": 100,
    "lives": 3,
    "speed": 5
  },
  
  // Rewards
  "rewards": {
    "stars": 1,
    "points": 10,
    "badges": [],
    "unlocks": []
  }
}
```

---

## Exercise Types

### 1. Multiple Choice (ABC)

```json
{
  "type": "exercise",
  "order": 1,
  "title": "Multiple Choice Question",
  "instructions": "Select the correct answer.",
  "content": {
    "exercises": [
      {
        "type": "multiple-choice",
        "question": "What is the capital of France?",
        "options": ["London", "Paris", "Berlin", "Madrid"],
        "correctAnswer": 1,
        "explanation": "Paris is the capital and largest city of France.",
        "hint": "Think about the Eiffel Tower...",
        "points": 1,
        "includeInHomework": true
      }
    ]
  },
  "difficulty": "beginner",
  "estimatedDuration": 2
}
```

### 2. True/False

```json
{
  "type": "exercise",
  "content": {
    "exercises": [
      {
        "type": "true-false",
        "question": "The Earth is flat.",
        "statement": "The Earth is flat.",
        "correctAnswer": false,
        "explanation": "The Earth is actually a sphere (oblate spheroid)."
      }
    ]
  }
}
```

### 3. Short Answer

```json
{
  "type": "exercise",
  "content": {
    "exercises": [
      {
        "type": "short-answer",
        "question": "What is the chemical symbol for water?",
        "correctAnswer": "H2O",
        "acceptableAnswers": ["H2O", "h2o", "H₂O"],
        "caseSensitive": false,
        "explanation": "Water molecule consists of 2 hydrogen atoms and 1 oxygen atom."
      }
    ]
  }
}
```

### 4. Fill in the Blanks

```json
{
  "type": "exercise",
  "content": {
    "exercises": [
      {
        "type": "fill-blank",
        "question": "Complete the sentence.",
        "template": "The _____ is half the length of the diameter.",
        "blanks": [
          {
            "id": "b1",
            "correctAnswer": "radius",
            "placeholder": "r...",
            "acceptableAnswers": ["radius", "Radius"]
          }
        ]
      }
    ]
  }
}
```

### 5. Matching

```json
{
  "type": "exercise",
  "content": {
    "exercises": [
      {
        "type": "matching",
        "question": "Match the countries with their capitals.",
        "pairs": [
          { "left": "France", "right": "Paris" },
          { "left": "Germany", "right": "Berlin" },
          { "left": "Spain", "right": "Madrid" },
          { "left": "Italy", "right": "Rome" }
        ]
      }
    ]
  }
}
```

### 6. Ordering / Sentence Order

```json
{
  "type": "exercise",
  "content": {
    "exercises": [
      {
        "type": "ordering",
        "question": "Arrange the words to form a correct sentence.",
        "items": ["The", "cat", "sat", "on", "the", "mat"],
        "correctOrder": [0, 1, 2, 3, 4, 5],
        "correctSentence": "The cat sat on the mat"
      }
    ]
  }
}
```

### 7. Drag and Drop

```json
{
  "type": "exercise",
  "content": {
    "exercises": [
      {
        "type": "drag-drop",
        "question": "Sort the items into the correct categories.",
        "dragItems": [
          { "id": "item1", "text": "Apple", "category": "fruit" },
          { "id": "item2", "text": "Carrot", "category": "vegetable" },
          { "id": "item3", "text": "Banana", "category": "fruit" }
        ],
        "dropZones": [
          { "id": "zone1", "label": "Fruits", "accepts": "fruit" },
          { "id": "zone2", "label": "Vegetables", "accepts": "vegetable" }
        ]
      }
    ]
  }
}
```

### 8. Voice Answer / Speaking

```json
{
  "type": "exercise",
  "content": {
    "exercises": [
      {
        "type": "voice_answer",
        "prompt": "Say the following word: 'Beautiful'",
        "question": "Pronounce this word correctly.",
        "correctAnswer": "beautiful",
        "language": "en",
        "similarityThreshold": 0.85
      }
    ]
  }
}
```

---

## Interactive Exercise Types

### 1. Data Analysis

```json
{
  "type": "data_analysis",
  "order": 1,
  "title": "Analyze Student Scores",
  "instructions": "Calculate the mean score.",
  "content": {
    "type": "data_analysis",
    "prompt": "Analyze the student test scores below. Calculate the mean (average) score.",
    "numericKey": "score",
    "numericLabel": "Score",
    "data": [
      { "label": "Student A", "score": 65 },
      { "label": "Student B", "score": 72 },
      { "label": "Student C", "score": 85 },
      { "label": "Student D", "score": 90 },
      { "label": "Student E", "score": 48 }
    ],
    "correctAnswer": 72,
    "tolerance": 1
  },
  "difficulty": "intermediate",
  "estimatedDuration": 5
}
```

### 2. Fraction Visual

```json
{
  "type": "fraction_visual",
  "order": 2,
  "title": "Equivalent Fractions",
  "instructions": "Create an equivalent fraction.",
  "content": {
    "type": "fraction_visual",
    "prompt": "The left grid shows 1/2. Click cells on the right grid to create an equivalent fraction using 8 blocks.",
    "targetNumerator": 1,
    "targetDenominator": 2,
    "userTotalBlocks": 8,
    "requiredShaded": 4
  },
  "difficulty": "beginner",
  "estimatedDuration": 3
}
```

### 3. Geometry Polygon

```json
{
  "type": "geometry_poly",
  "order": 3,
  "title": "Identify the Shape",
  "instructions": "Select the correct shape name.",
  "content": {
    "type": "geometry_poly",
    "prompt": "Look at the shape below. What type of shape is this?",
    "shapes": ["Circle", "Square", "Triangle", "Pentagon", "Hexagon"],
    "correctShape": "Pentagon"
  },
  "difficulty": "beginner",
  "estimatedDuration": 2
}
```

### 4. Chemical Mixing

```json
{
  "type": "chem_mixing",
  "order": 4,
  "title": "Neutralization Reaction",
  "instructions": "Mix the correct proportions.",
  "content": {
    "type": "chem_mixing",
    "prompt": "Mix the correct proportions of acid and base to create a stable neutral solution. Target: 30ml acid + 70ml base.",
    "substances": [
      {
        "id": "A",
        "name": "Acid (HCl)",
        "color": "#38bdf8",
        "maxVolume": 100,
        "targetVolume": 30
      },
      {
        "id": "B",
        "name": "Base (NaOH)",
        "color": "#a855f7",
        "maxVolume": 100,
        "targetVolume": 70
      }
    ],
    "tolerance": 5,
    "successColor": "#22c55e",
    "failColor": "#ef4444"
  },
  "difficulty": "intermediate",
  "estimatedDuration": 4
}
```

### 5. Chemical Matching (Formula Matching)

```json
{
  "type": "chem_matching",
  "order": 5,
  "title": "Chemical Formulas",
  "instructions": "Match compounds with formulas.",
  "content": {
    "type": "chem_matching",
    "prompt": "Match each chemical compound name with its correct formula.",
    "pairs": [
      { "id": "1", "name": "Water", "formula": "H₂O" },
      { "id": "2", "name": "Carbon Dioxide", "formula": "CO₂" },
      { "id": "3", "name": "Sodium Chloride", "formula": "NaCl" },
      { "id": "4", "name": "Glucose", "formula": "C₆H₁₂O₆" }
    ]
  },
  "difficulty": "intermediate",
  "estimatedDuration": 3
}
```

### 6. English Sentence Fix (Grammar Correction)

```json
{
  "type": "english_sentence_fix",
  "order": 6,
  "title": "Fix the Grammar",
  "instructions": "Correct the grammar errors.",
  "content": {
    "type": "english_sentence_fix",
    "prompt": "Fix the grammar errors in this sentence. Tap the highlighted words to choose the correct form.",
    "originalSentence": "She go to school every day.",
    "tokens": ["She", "go", "to", "school", "every", "day."],
    "errors": [
      {
        "index": 1,
        "correct": "goes",
        "options": ["go", "goes", "went", "going"],
        "explanation": "With she/he/it, use the -s/-es form in Present Simple tense."
      }
    ]
  },
  "difficulty": "beginner",
  "estimatedDuration": 2
}
```

### 7. English Sentence Order (Word Arrangement)

```json
{
  "type": "english_sentence_order",
  "order": 7,
  "title": "Build the Sentence",
  "instructions": "Arrange words correctly.",
  "content": {
    "type": "english_sentence_order",
    "prompt": "Drag and drop the words to form a grammatically correct sentence.",
    "correctOrder": ["She", "usually", "eats", "breakfast", "at", "8", "o'clock."],
    "scrambledOptions": ["eats", "She", "at", "usually", "8", "breakfast", "o'clock."]
  },
  "difficulty": "beginner",
  "estimatedDuration": 2
}
```

### 8. Language Noun Bag (Word Categorization)

```json
{
  "type": "language_noun_bag",
  "order": 8,
  "title": "Sort the Nouns",
  "instructions": "Drag nouns into the bag.",
  "content": {
    "type": "language_noun_bag",
    "prompt": "Drag all the NOUNS into the suitcase. Leave verbs and adjectives outside.",
    "words": [
      { "text": "house", "pos": "noun" },
      { "text": "run", "pos": "verb" },
      { "text": "beautiful", "pos": "adj" },
      { "text": "book", "pos": "noun" },
      { "text": "eat", "pos": "verb" },
      { "text": "big", "pos": "adj" },
      { "text": "teacher", "pos": "noun" },
      { "text": "write", "pos": "verb" }
    ],
    "targetPos": "noun",
    "bagLabel": "Noun Bag",
    "availableLabel": "Available Words"
  },
  "difficulty": "beginner",
  "estimatedDuration": 3
}
```

### 9. Language Tone Transformer

```json
{
  "type": "language_tone_transformer",
  "order": 9,
  "title": "Change the Tone",
  "instructions": "Transform the sentence tone.",
  "content": {
    "type": "language_tone_transformer",
    "originalSentence": "Give me the report.",
    "originalTone": "demanding",
    "targetTone": "polite",
    "correctAnswer": "Could you please give me the report?",
    "acceptableAnswers": [
      "Could you please give me the report?",
      "Would you mind giving me the report?",
      "May I have the report, please?"
    ],
    "toneOptions": ["demanding", "polite", "formal", "casual"]
  },
  "difficulty": "intermediate",
  "estimatedDuration": 3
}
```

### 10. Language Idiom Bridge

```json
{
  "type": "language_idiom_bridge",
  "order": 10,
  "title": "Match Idioms",
  "instructions": "Match idioms with same meaning.",
  "content": {
    "type": "language_idiom_bridge",
    "sourceIdioms": [
      { "text": "It's raining cats and dogs", "matchId": 1, "meaning": "Heavy rain" },
      { "text": "Break a leg", "matchId": 2, "meaning": "Good luck" },
      { "text": "Piece of cake", "matchId": 3, "meaning": "Very easy" }
    ],
    "targetIdioms": [
      { "text": "Льёт как из ведра", "matchId": 1, "language": "ru" },
      { "text": "Ни пуха, ни пера", "matchId": 2, "language": "ru" },
      { "text": "Проще пареной репы", "matchId": 3, "language": "ru" }
    ],
    "sourceLanguage": "en",
    "targetLanguage": "ru"
  },
  "difficulty": "advanced",
  "estimatedDuration": 4
}
```

### 11. Language Word Constellation

```json
{
  "type": "language_word_constellation",
  "order": 11,
  "title": "Build Word Map",
  "instructions": "Connect related words.",
  "content": {
    "type": "language_word_constellation",
    "centralWord": "happy",
    "words": [
      { "id": "w1", "text": "joyful", "relation": "synonym" },
      { "id": "w2", "text": "sad", "relation": "antonym" },
      { "id": "w3", "text": "happiness", "relation": "noun-form" },
      { "id": "w4", "text": "happily", "relation": "adverb-form" },
      { "id": "w5", "text": "content", "relation": "synonym" },
      { "id": "w6", "text": "angry", "relation": "unrelated" }
    ],
    "requiredConnections": [
      { "from": "center", "to": "w1", "type": "synonym" },
      { "from": "center", "to": "w2", "type": "antonym" },
      { "from": "center", "to": "w3", "type": "noun-form" }
    ]
  },
  "difficulty": "intermediate",
  "estimatedDuration": 5
}
```

### 12. Language Rhythm Match

```json
{
  "type": "language_rhythm_match",
  "order": 12,
  "title": "Match the Rhythm",
  "instructions": "Find sentence with same stress pattern.",
  "content": {
    "type": "language_rhythm_match",
    "targetPattern": ["strong", "weak", "strong", "weak"],
    "targetSentence": "LOVE is GOOD",
    "options": [
      { "text": "BOOKS are GREAT", "pattern": ["strong", "weak", "strong"] },
      { "text": "I want to GO", "pattern": ["weak", "strong", "weak", "strong"] },
      { "text": "TIME flies FAST", "pattern": ["strong", "weak", "strong"] },
      { "text": "LIFE is SHORT", "pattern": ["strong", "weak", "strong"] }
    ],
    "correctIndex": 3
  },
  "difficulty": "advanced",
  "estimatedDuration": 4
}
```

### 13. Language False Friends

```json
{
  "type": "language_false_friends",
  "order": 13,
  "title": "Spot False Friends",
  "instructions": "Identify false cognates.",
  "content": {
    "type": "language_false_friends",
    "language1": "English",
    "language2": "Russian",
    "words": [
      { "word1": "magazine", "word2": "магазин", "isFalseFriend": true, "explanation": "Magazine (EN) = журнал, Магазин (RU) = shop" },
      { "word1": "phone", "word2": "телефон", "isFalseFriend": false },
      { "word1": "sympathetic", "word2": "симпатичный", "isFalseFriend": true, "explanation": "Sympathetic = сочувствующий, Симпатичный = attractive" },
      { "word1": "computer", "word2": "компьютер", "isFalseFriend": false }
    ]
  },
  "difficulty": "intermediate",
  "estimatedDuration": 4
}
```

### 14. Histogram / Chart Analysis

```json
{
  "type": "exercise",
  "order": 14,
  "title": "Analyze the Chart",
  "instructions": "Study the histogram and answer.",
  "content": {
    "type": "histogram",
    "title": "Population by City",
    "description": "Study the population data and find the city with highest population.",
    "data": [
      { "label": "New York", "value": 8400000 },
      { "label": "Los Angeles", "value": 4000000 },
      { "label": "Chicago", "value": 2700000 },
      { "label": "Houston", "value": 2300000 }
    ],
    "correctValue": 8400000,
    "min": 0,
    "max": 10000000,
    "step": 100000
  },
  "difficulty": "intermediate",
  "estimatedDuration": 4
}
```

### 15. Interactive Map

```json
{
  "type": "exercise",
  "order": 15,
  "title": "Find on the Map",
  "instructions": "Click on the correct location.",
  "content": {
    "type": "map",
    "title": "European Capitals",
    "description": "Click on Paris on the map.",
    "image": "/images/maps/europe.png",
    "markers": [
      { "id": "paris", "x": 48.5, "y": 35.2, "label": "Paris", "isCorrect": true },
      { "id": "london", "x": 45.2, "y": 28.8, "label": "London", "isCorrect": false },
      { "id": "berlin", "x": 55.1, "y": 30.5, "label": "Berlin", "isCorrect": false }
    ]
  },
  "difficulty": "beginner",
  "estimatedDuration": 2
}
```

### 16. Block Coding

```json
{
  "type": "exercise",
  "order": 16,
  "title": "Code the Solution",
  "instructions": "Arrange the blocks to solve the puzzle.",
  "content": {
    "type": "block-coding",
    "subtype": "maze",
    "title": "Navigate the Maze",
    "description": "Help the character reach the goal.",
    "availableBlocks": [
      { "type": "move_forward", "label": "Move Forward", "count": 5 },
      { "type": "turn_left", "label": "Turn Left", "count": 2 },
      { "type": "turn_right", "label": "Turn Right", "count": 2 }
    ],
    "config": {
      "grid": [[0, 0, 1], [0, 0, 0], [1, 0, 2]],
      "startPosition": { "x": 0, "y": 0, "direction": "right" },
      "goalPosition": { "x": 2, "y": 2 }
    }
  },
  "difficulty": "intermediate",
  "estimatedDuration": 5
}
```

### 17. Geometry Exercise

```json
{
  "type": "exercise",
  "order": 17,
  "title": "Calculate the Missing Side",
  "exerciseType": "geometry",
  "content": {
    "type": "geometry",
    "mode": "calculate",
    "shape": "square",
    "title": "Square Properties",
    "given": {
      "side_a": 5,
      "angle": 90,
      "perimeter": 20
    },
    "correctAnswer": {
      "side_b": 5,
      "formulaId": "1"
    },
    "formulas": [
      { "id": "1", "name": "Square Property", "formula": "a = b (all sides equal)", "isCorrect": true },
      { "id": "2", "name": "Pythagorean Theorem", "formula": "a² + b² = c²", "isCorrect": false }
    ],
    "hint": "In a square, all four sides have equal length."
  },
  "difficulty": "intermediate",
  "estimatedDuration": 4
}
```

---

## Game Types

Games are special interactive steps that provide gamified learning experiences.

### Supported Game Types

| Game Type | Description |
|-----------|-------------|
| `basket-catch` | Catch falling items in baskets |
| `memory-cards` | Memory matching game |
| `whack-a-mole` | Tap correct answers quickly |
| `tower-builder` | Build towers by answering correctly |
| `target-practice` | Hit targets with correct answers |
| `maze-runner` | Navigate maze to solve problems |
| `bubble-pop` | Pop bubbles with correct answers |
| `lightning-round` | Speed quiz challenge |
| `scale-balance` | Balance equations |
| `pattern-builder` | Complete patterns |

### Game Step Structure

```json
{
  "type": "game",
  "order": 18,
  "title": "Catch the Correct Answers!",
  "instructions": "Catch items that match the category.",
  "gameType": "basket-catch",
  "gameConfig": {
    "difficulty": "medium",
    "timeLimit": 60,
    "targetScore": 100,
    "lives": 3,
    "speed": 5,
    "items": [
      { "id": "i1", "content": "Apple", "isCorrect": true, "points": 10 },
      { "id": "i2", "content": "Banana", "isCorrect": true, "points": 10 },
      { "id": "i3", "content": "Car", "isCorrect": false, "points": -5 },
      { "id": "i4", "content": "Orange", "isCorrect": true, "points": 10 }
    ],
    "correctAnswers": ["Apple", "Banana", "Orange"],
    "wrongAnswers": ["Car", "House", "Book"],
    "gameplayData": {
      "category": "Fruits",
      "instructions": "Catch only the fruits!"
    }
  },
  "rewards": {
    "stars": 2,
    "points": 50,
    "badges": ["fruit-master"],
    "unlocks": []
  },
  "difficulty": "beginner",
  "estimatedDuration": 5
}
```

---

## Multi-Language Support

The system supports multi-language content. Any text field can be either a string or an object with language keys.

### Supported Languages

| Code | Language |
|------|----------|
| `en` | English |
| `ru` | Russian |
| `uz` | Uzbek |

### Single Language (String)

```json
{
  "lessonName": "Introduction to Algebra",
  "description": "Learn the basics of algebraic expressions."
}
```

### Multi-Language (Object)

```json
{
  "lessonName": {
    "en": "Introduction to Algebra",
    "ru": "Введение в алгебру",
    "uz": "Algebraga kirish"
  },
  "description": {
    "en": "Learn the basics of algebraic expressions.",
    "ru": "Изучите основы алгебраических выражений.",
    "uz": "Algebraik ifodalar asoslarini o'rganing."
  }
}
```

### Multi-Language in Steps

```json
{
  "type": "explanation",
  "order": 0,
  "title": {
    "en": "What is a Variable?",
    "ru": "Что такое переменная?",
    "uz": "O'zgaruvchi nima?"
  },
  "instructions": {
    "en": "Read the explanation below.",
    "ru": "Прочитайте объяснение ниже.",
    "uz": "Quyidagi tushuntirishni o'qing."
  },
  "content": {
    "text": {
      "en": "A variable is a symbol that represents an unknown value.",
      "ru": "Переменная - это символ, представляющий неизвестное значение.",
      "uz": "O'zgaruvchi - noma'lum qiymatni ifodalovchi belgi."
    }
  },
  "difficulty": "beginner",
  "estimatedDuration": 3
}
```

### Multi-Language in Exercises

```json
{
  "type": "exercise",
  "content": {
    "exercises": [
      {
        "type": "multiple-choice",
        "question": {
          "en": "What is x if x + 5 = 10?",
          "ru": "Чему равен x, если x + 5 = 10?",
          "uz": "Agar x + 5 = 10 bo'lsa, x nimaga teng?"
        },
        "options": [
          { "en": "3", "ru": "3", "uz": "3" },
          { "en": "5", "ru": "5", "uz": "5" },
          { "en": "7", "ru": "7", "uz": "7" },
          { "en": "10", "ru": "10", "uz": "10" }
        ],
        "correctAnswer": 1,
        "explanation": {
          "en": "x + 5 = 10, so x = 10 - 5 = 5",
          "ru": "x + 5 = 10, значит x = 10 - 5 = 5",
          "uz": "x + 5 = 10, demak x = 10 - 5 = 5"
        }
      }
    ]
  }
}
```

---

## Vocabulary Structure

Vocabulary steps allow students to learn new terms and definitions.

```json
{
  "type": "vocabulary",
  "order": 2,
  "title": {
    "en": "Key Terms",
    "ru": "Ключевые термины"
  },
  "instructions": {
    "en": "Learn these important terms.",
    "ru": "Выучите эти важные термины."
  },
  "content": {
    "terms": [
      {
        "term": {
          "en": "Variable",
          "ru": "Переменная"
        },
        "definition": {
          "en": "A symbol representing an unknown value",
          "ru": "Символ, представляющий неизвестное значение"
        },
        "example": {
          "en": "In the equation x + 5 = 10, x is a variable",
          "ru": "В уравнении x + 5 = 10, x - переменная"
        },
        "pronunciation": "/ˈveəriəbl/"
      },
      {
        "term": {
          "en": "Coefficient",
          "ru": "Коэффициент"
        },
        "definition": {
          "en": "A number multiplied by a variable",
          "ru": "Число, умноженное на переменную"
        },
        "example": {
          "en": "In 3x, 3 is the coefficient",
          "ru": "В 3x, 3 - коэффициент"
        },
        "pronunciation": "/ˌkoʊ.ɪˈfɪʃ.ənt/"
      },
      {
        "term": {
          "en": "Expression",
          "ru": "Выражение"
        },
        "definition": {
          "en": "A combination of numbers, variables, and operations",
          "ru": "Комбинация чисел, переменных и операций"
        },
        "example": {
          "en": "2x + 5 is an algebraic expression",
          "ru": "2x + 5 - алгебраическое выражение"
        }
      }
    ]
  },
  "difficulty": "beginner",
  "estimatedDuration": 5
}
```

---

## Quiz Structure

Quiz steps contain knowledge check questions.

```json
{
  "type": "quiz",
  "order": 5,
  "title": "Knowledge Check",
  "instructions": "Test your understanding.",
  "content": {
    "questions": [
      {
        "id": "q1",
        "question": "What is the solution to x + 7 = 12?",
        "type": "multiple-choice",
        "options": [
          { "text": "x = 3", "value": 0 },
          { "text": "x = 5", "value": 1 },
          { "text": "x = 7", "value": 2 },
          { "text": "x = 19", "value": 3 }
        ],
        "correctAnswer": 1,
        "explanation": "Subtract 7 from both sides: x = 12 - 7 = 5",
        "points": 10
      },
      {
        "id": "q2",
        "question": "Is 2x + 3 = 2x + 5 a valid equation?",
        "type": "true-false",
        "correctAnswer": false,
        "explanation": "This equation has no solution because 3 ≠ 5",
        "points": 5
      },
      {
        "id": "q3",
        "question": "What is the coefficient in 5y?",
        "type": "short-answer",
        "correctAnswer": "5",
        "acceptableAnswers": ["5", "five"],
        "points": 5
      }
    ]
  },
  "scoring": {
    "maxPoints": 20,
    "passingScore": 15,
    "weight": 2
  },
  "difficulty": "intermediate",
  "estimatedDuration": 8
}
```

---

## Complete Example

Here's a complete, production-ready lesson JSON:

```json
{
  "subject": "Mathematics",
  "level": 3,
  "topic": "Introduction to Algebra",
  "topicDescription": "Learn the fundamentals of algebraic thinking",
  "lessonName": {
    "en": "Variables and Expressions",
    "ru": "Переменные и выражения",
    "uz": "O'zgaruvchilar va ifodalar"
  },
  "description": {
    "en": "Master the basics of algebraic variables and expressions",
    "ru": "Освойте основы алгебраических переменных и выражений",
    "uz": "Algebraik o'zgaruvchilar va ifodalar asoslarini o'rganing"
  },
  "type": "free",
  "difficulty": "beginner",
  "status": "published",
  "visibility": "public",
  "isActive": true,
  
  "timing": {
    "estimatedDuration": 25
  },
  
  "stepRequirements": {
    "explanation": { "required": true, "minCount": 1, "maxCount": 3 },
    "exercise": { "required": true, "minCount": 7, "maxCount": 15 }
  },
  
  "steps": [
    {
      "type": "introduction",
      "order": 0,
      "title": {
        "en": "Welcome to Algebra!",
        "ru": "Добро пожаловать в алгебру!",
        "uz": "Algebraga xush kelibsiz!"
      },
      "instructions": {
        "en": "Let's begin our journey into the world of algebra.",
        "ru": "Давайте начнём наше путешествие в мир алгебры.",
        "uz": "Algebra dunyosiga sayohatimizni boshlaymiz."
      },
      "content": {
        "text": {
          "en": "In this lesson, you will learn what variables are and how to work with algebraic expressions. By the end, you'll be able to solve simple equations!",
          "ru": "В этом уроке вы узнаете, что такое переменные и как работать с алгебраическими выражениями. К концу урока вы сможете решать простые уравнения!",
          "uz": "Bu darsda siz o'zgaruvchilar nima ekanligini va algebraik ifodalar bilan qanday ishlashni o'rganasiz. Dars oxirida oddiy tenglamalarni yecha olasiz!"
        }
      },
      "difficulty": "beginner",
      "estimatedDuration": 2,
      "scoring": { "maxPoints": 0 }
    },
    
    {
      "type": "explanation",
      "order": 1,
      "title": {
        "en": "What is a Variable?",
        "ru": "Что такое переменная?",
        "uz": "O'zgaruvchi nima?"
      },
      "instructions": {
        "en": "Read and understand the concept of variables.",
        "ru": "Прочитайте и поймите концепцию переменных.",
        "uz": "O'zgaruvchilar tushunchasini o'qing va tushuning."
      },
      "content": {
        "text": {
          "en": "A **variable** is a letter or symbol that represents an unknown value. We use variables when we don't know the exact number yet.\n\nFor example:\n- In the expression **x + 5**, the letter 'x' is a variable.\n- We can use any letter: a, b, n, y, etc.\n\nVariables allow us to write general rules that work for many different numbers!",
          "ru": "**Переменная** - это буква или символ, представляющий неизвестное значение. Мы используем переменные, когда ещё не знаем точное число.\n\nНапример:\n- В выражении **x + 5** буква 'x' - переменная.\n- Мы можем использовать любую букву: a, b, n, y и т.д.\n\nПеременные позволяют писать общие правила для разных чисел!",
          "uz": "**O'zgaruvchi** - noma'lum qiymatni ifodalovchi harf yoki belgi. Biz aniq sonni bilmaganimizda o'zgaruvchilardan foydalanamiz.\n\nMasalan:\n- **x + 5** ifodasida 'x' harfi o'zgaruvchi.\n- Biz istalgan harfdan foydalanishimiz mumkin: a, b, n, y va boshqalar.\n\nO'zgaruvchilar turli sonlar uchun umumiy qoidalar yozishga imkon beradi!"
        }
      },
      "difficulty": "beginner",
      "estimatedDuration": 4,
      "scoring": { "maxPoints": 0 }
    },
    
    {
      "type": "vocabulary",
      "order": 2,
      "title": {
        "en": "Key Algebra Terms",
        "ru": "Ключевые термины алгебры",
        "uz": "Algebra asosiy atamalari"
      },
      "instructions": {
        "en": "Learn these important terms before continuing.",
        "ru": "Выучите эти важные термины перед продолжением.",
        "uz": "Davom etishdan oldin bu muhim atamalarni o'rganing."
      },
      "content": {
        "terms": [
          {
            "term": { "en": "Variable", "ru": "Переменная", "uz": "O'zgaruvchi" },
            "definition": { "en": "A letter representing an unknown value", "ru": "Буква, представляющая неизвестное значение", "uz": "Noma'lum qiymatni ifodalovchi harf" },
            "example": { "en": "x in the equation x + 2 = 5", "ru": "x в уравнении x + 2 = 5", "uz": "x + 2 = 5 tenglamasidagi x" }
          },
          {
            "term": { "en": "Coefficient", "ru": "Коэффициент", "uz": "Koeffitsient" },
            "definition": { "en": "A number multiplied by a variable", "ru": "Число, умноженное на переменную", "uz": "O'zgaruvchiga ko'paytirilgan son" },
            "example": { "en": "3 in 3x", "ru": "3 в 3x", "uz": "3x dagi 3" }
          },
          {
            "term": { "en": "Expression", "ru": "Выражение", "uz": "Ifoda" },
            "definition": { "en": "A combination of numbers, variables, and operations", "ru": "Комбинация чисел, переменных и операций", "uz": "Sonlar, o'zgaruvchilar va amallar kombinatsiyasi" },
            "example": { "en": "2x + 5", "ru": "2x + 5", "uz": "2x + 5" }
          }
        ]
      },
      "difficulty": "beginner",
      "estimatedDuration": 3,
      "scoring": { "maxPoints": 0 }
    },
    
    {
      "type": "exercise",
      "order": 3,
      "title": {
        "en": "Identify Variables",
        "ru": "Определите переменные",
        "uz": "O'zgaruvchilarni aniqlang"
      },
      "instructions": {
        "en": "Select the variable in each expression.",
        "ru": "Выберите переменную в каждом выражении.",
        "uz": "Har bir ifodadagi o'zgaruvchini tanlang."
      },
      "content": {
        "exercises": [
          {
            "type": "multiple-choice",
            "question": { "en": "What is the variable in 'y + 8'?", "ru": "Какая переменная в 'y + 8'?", "uz": "'y + 8' dagi o'zgaruvchi qaysi?" },
            "options": ["y", "8", "+", "y + 8"],
            "correctAnswer": 0,
            "explanation": { "en": "y is the variable (letter), 8 is a constant (number).", "ru": "y - переменная (буква), 8 - константа (число).", "uz": "y - o'zgaruvchi (harf), 8 - o'zgarmas (son)." },
            "points": 5,
            "includeInHomework": true
          },
          {
            "type": "multiple-choice",
            "question": { "en": "In '5n - 3', which is the coefficient?", "ru": "В '5n - 3', какой коэффициент?", "uz": "'5n - 3' dagi koeffitsient qaysi?" },
            "options": ["5", "n", "3", "-"],
            "correctAnswer": 0,
            "explanation": { "en": "5 is multiplied by n, making it the coefficient.", "ru": "5 умножается на n, поэтому это коэффициент.", "uz": "5 n ga ko'paytirilgan, shuning uchun bu koeffitsient." },
            "points": 5,
            "includeInHomework": true
          }
        ]
      },
      "difficulty": "beginner",
      "estimatedDuration": 3,
      "scoring": { "maxPoints": 10, "passingScore": 5 }
    },
    
    {
      "type": "exercise",
      "order": 4,
      "title": {
        "en": "Evaluate Expressions",
        "ru": "Вычислите выражения",
        "uz": "Ifodalarni hisoblang"
      },
      "instructions": {
        "en": "Calculate the value of each expression.",
        "ru": "Вычислите значение каждого выражения.",
        "uz": "Har bir ifodaning qiymatini hisoblang."
      },
      "content": {
        "exercises": [
          {
            "type": "short-answer",
            "question": { "en": "If x = 4, what is x + 3?", "ru": "Если x = 4, чему равно x + 3?", "uz": "Agar x = 4 bo'lsa, x + 3 nechaga teng?" },
            "correctAnswer": "7",
            "acceptableAnswers": ["7", "seven"],
            "hint": { "en": "Replace x with 4 and add.", "ru": "Замените x на 4 и сложите.", "uz": "x ni 4 ga almashtiring va qo'shing." },
            "points": 5,
            "includeInHomework": true
          },
          {
            "type": "short-answer",
            "question": { "en": "If y = 2, what is 3y?", "ru": "Если y = 2, чему равно 3y?", "uz": "Agar y = 2 bo'lsa, 3y nechaga teng?" },
            "correctAnswer": "6",
            "acceptableAnswers": ["6", "six"],
            "hint": { "en": "Multiply 3 by the value of y.", "ru": "Умножьте 3 на значение y.", "uz": "3 ni y qiymatiga ko'paytiring." },
            "points": 5,
            "includeInHomework": true
          }
        ]
      },
      "difficulty": "beginner",
      "estimatedDuration": 4,
      "scoring": { "maxPoints": 10, "passingScore": 5 }
    },
    
    {
      "type": "english_sentence_order",
      "order": 5,
      "title": {
        "en": "Math Vocabulary Practice",
        "ru": "Практика математической лексики",
        "uz": "Matematik lug'at mashqi"
      },
      "instructions": {
        "en": "Arrange the words to form a correct math definition.",
        "ru": "Расставьте слова, чтобы получить правильное определение.",
        "uz": "So'zlarni to'g'ri matematik ta'rif hosil qilish uchun joylashtiring."
      },
      "content": {
        "type": "english_sentence_order",
        "prompt": {
          "en": "Arrange the words to define a variable:",
          "ru": "Расставьте слова для определения переменной:",
          "uz": "O'zgaruvchini ta'riflash uchun so'zlarni joylashtiring:"
        },
        "correctOrder": ["A", "variable", "represents", "an", "unknown", "value"],
        "scrambledOptions": ["unknown", "A", "value", "variable", "an", "represents"]
      },
      "difficulty": "beginner",
      "estimatedDuration": 2,
      "scoring": { "maxPoints": 10 }
    },
    
    {
      "type": "data_analysis",
      "order": 6,
      "title": {
        "en": "Analyze Variable Values",
        "ru": "Анализ значений переменных",
        "uz": "O'zgaruvchi qiymatlarini tahlil qilish"
      },
      "instructions": {
        "en": "Study the table and calculate the mean.",
        "ru": "Изучите таблицу и вычислите среднее.",
        "uz": "Jadvalni o'rganing va o'rtachani hisoblang."
      },
      "content": {
        "type": "data_analysis",
        "prompt": {
          "en": "These are the values of x in different equations. Find the mean (average).",
          "ru": "Это значения x в разных уравнениях. Найдите среднее.",
          "uz": "Bular turli tenglamalardagi x qiymatlari. O'rtachani toping."
        },
        "numericKey": "value",
        "numericLabel": "x value",
        "data": [
          { "label": "Equation 1", "value": 3 },
          { "label": "Equation 2", "value": 7 },
          { "label": "Equation 3", "value": 5 },
          { "label": "Equation 4", "value": 9 },
          { "label": "Equation 5", "value": 6 }
        ],
        "correctAnswer": 6,
        "tolerance": 0.5
      },
      "difficulty": "intermediate",
      "estimatedDuration": 4,
      "scoring": { "maxPoints": 15 }
    },
    
    {
      "type": "quiz",
      "order": 7,
      "title": {
        "en": "Algebra Quiz",
        "ru": "Тест по алгебре",
        "uz": "Algebra testi"
      },
      "instructions": {
        "en": "Test your knowledge of variables and expressions.",
        "ru": "Проверьте свои знания переменных и выражений.",
        "uz": "O'zgaruvchilar va ifodalar bo'yicha bilimingizni tekshiring."
      },
      "content": {
        "questions": [
          {
            "id": "q1",
            "question": { "en": "What is x if x - 4 = 6?", "ru": "Чему равен x, если x - 4 = 6?", "uz": "Agar x - 4 = 6 bo'lsa, x nimaga teng?" },
            "type": "multiple-choice",
            "options": [
              { "text": "2", "value": 0 },
              { "text": "10", "value": 1 },
              { "text": "6", "value": 2 },
              { "text": "-2", "value": 3 }
            ],
            "correctAnswer": 1,
            "explanation": { "en": "x - 4 = 6, so x = 6 + 4 = 10", "ru": "x - 4 = 6, значит x = 6 + 4 = 10", "uz": "x - 4 = 6, demak x = 6 + 4 = 10" },
            "points": 10
          },
          {
            "id": "q2",
            "question": { "en": "2x means '2 times x'", "ru": "2x означает '2 умножить на x'", "uz": "2x '2 marta x' degan ma'noni bildiradi" },
            "type": "true-false",
            "correctAnswer": true,
            "explanation": { "en": "In algebra, when a number is next to a variable, it means multiplication.", "ru": "В алгебре, когда число стоит рядом с переменной, это означает умножение.", "uz": "Algebrada son o'zgaruvchi yonida turganda, bu ko'paytirishni bildiradi." },
            "points": 5
          }
        ]
      },
      "difficulty": "beginner",
      "estimatedDuration": 5,
      "scoring": { "maxPoints": 15, "passingScore": 10 }
    },
    
    {
      "type": "summary",
      "order": 8,
      "title": {
        "en": "Lesson Summary",
        "ru": "Итоги урока",
        "uz": "Dars xulosasi"
      },
      "instructions": {
        "en": "Review what you've learned.",
        "ru": "Повторите то, что вы узнали.",
        "uz": "O'rganganlaringizni takrorlang."
      },
      "content": {
        "text": {
          "en": "**Great job!** You've completed this lesson on Variables and Expressions.\n\n**Key Takeaways:**\n- A **variable** is a letter that represents an unknown value\n- A **coefficient** is a number multiplied by a variable\n- An **expression** combines numbers, variables, and operations\n\nPractice these concepts and you'll be ready for equations!",
          "ru": "**Отличная работа!** Вы завершили урок о переменных и выражениях.\n\n**Ключевые моменты:**\n- **Переменная** - буква, представляющая неизвестное значение\n- **Коэффициент** - число, умноженное на переменную\n- **Выражение** объединяет числа, переменные и операции\n\nПрактикуйте эти концепции, и вы будете готовы к уравнениям!",
          "uz": "**Ajoyib ish!** Siz o'zgaruvchilar va ifodalar bo'yicha darsni yakunladingiz.\n\n**Asosiy xulosalar:**\n- **O'zgaruvchi** - noma'lum qiymatni ifodalovchi harf\n- **Koeffitsient** - o'zgaruvchiga ko'paytirilgan son\n- **Ifoda** sonlar, o'zgaruvchilar va amallarni birlashtiradi\n\nBu tushunchalarni mashq qiling va tenglamalarga tayyor bo'lasiz!"
        }
      },
      "difficulty": "beginner",
      "estimatedDuration": 2,
      "scoring": { "maxPoints": 0 }
    }
  ],
  
  "assessment": {
    "enabled": true,
    "passingScore": 70,
    "certificateEligible": false
  },
  
  "gamification": {
    "enabled": true,
    "points": 65,
    "badges": [
      {
        "id": "algebra-beginner",
        "name": "Algebra Beginner",
        "icon": "🎓",
        "condition": "Complete the lesson"
      },
      {
        "id": "variable-master",
        "name": "Variable Master",
        "icon": "⭐",
        "condition": "Score 100% on all exercises"
      }
    ]
  },
  
  "ai": {
    "enabled": true,
    "chatbot": true,
    "personalizedHints": true,
    "autoGrading": true
  },
  
  "modeRestrictions": {
    "schoolOnly": false,
    "studyCentreOnly": false,
    "availableInBothModes": true
  },
  
  "metadata": {
    "version": 1,
    "language": "en",
    "targetAudience": ["middle-school", "beginner"],
    "keywords": ["algebra", "variables", "expressions", "mathematics", "beginner"]
  }
}
```

---

## Validation Rules

### Required Fields

1. **Lesson Level:**
   - `subject` - Must be a non-empty string
   - `level` - Must be a number between 1-20
   - `topic` - Must be a non-empty string
   - `lessonName` - Must be a non-empty string or valid multilingual object
   - `description` - Must be a non-empty string or valid multilingual object
   - `steps` - Must be an array with at least 1 step

2. **Step Level:**
   - `type` - Must be one of the valid step types
   - `order` - Must be a non-negative number
   - `title` - Must be a non-empty string or valid multilingual object
   - `instructions` - Must be a non-empty string or valid multilingual object
   - `content` - Must be an object (structure varies by type)
   - `difficulty` - Must be one of: beginner, elementary, intermediate, advanced, expert
   - `estimatedDuration` - Must be a number between 1-120 (minutes)

### Content Validation by Type

| Type | Required Content Fields |
|------|------------------------|
| `explanation` | `text` with minimum 100 characters |
| `exercise` | `exercises` array with at least 1 exercise |
| `quiz` | `questions` array with at least 1 question |
| `vocabulary` | `terms` array with at least 1 term |
| `language_tone_transformer` | `originalSentence`, `originalTone`, `targetTone`, `correctAnswer` |
| `language_idiom_bridge` | `sourceIdioms` and `targetIdioms` arrays with `text` and `matchId` |
| `language_word_constellation` | `centralWord`, `words` array, `requiredConnections` array |
| `language_rhythm_match` | `targetPattern`, `targetSentence`, `options`, `correctIndex` |
| `language_false_friends` | `language1`, `language2`, `words` array with `isFalseFriend` boolean |

---

## Tips for Creating Good Lessons

1. **Start Simple:** Begin with an introduction that sets expectations.

2. **Explain Before Practice:** Always include explanation steps before exercises.

3. **Use Variety:** Mix different exercise types to keep students engaged.

4. **Include Vocabulary:** Define key terms before using them in exercises.

5. **Progressive Difficulty:** Start with easier exercises and gradually increase difficulty.

6. **Provide Feedback:** Include explanations for why answers are correct/incorrect.

7. **Multi-language Support:** If targeting multiple regions, provide translations.

8. **Test Your JSON:** Validate your JSON before uploading to ensure it's properly formatted.

9. **Reasonable Time Estimates:** Be realistic with `estimatedDuration` values.

10. **Include Homework:** Mark important exercises with `includeInHomework: true`.

---

## Troubleshooting

### Common Issues

1. **"Step type is not valid"**
   - Check that `type` matches one of the supported step types exactly.

2. **"Content validation failed"**
   - Ensure the `content` object has all required fields for that step type.

3. **"Lesson does not meet minimum step requirements"**
   - Check that you have at least the minimum required number of each step type.

4. **"Invalid exercise type"**
   - Ensure exercise `type` is one of: multiple-choice, true-false, short-answer, fill-blank, matching, ordering, drag-drop, voice_answer.

5. **Multilingual content not displaying**
   - Ensure the object has at least one of: `en`, `ru`, or `uz` keys.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2026 | Initial comprehensive documentation |

---

**For questions or issues, contact the ACED development team.**
