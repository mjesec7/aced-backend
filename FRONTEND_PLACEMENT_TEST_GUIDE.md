# Frontend Placement Test Implementation Guide

## Overview
The backend now supports **4 different question types** with **30 questions per subject**. You need to update your frontend to handle these different types.

## Question Types Supported

1. **Multiple Choice** - Select one answer from options (existing)
2. **True/False** - Two options only
3. **Fill in the Blank** - Text input field
4. **Matching** - Match pairs of items

---

## Backend API Changes

### Question Object Structure

The backend now returns questions with this structure:

```javascript
{
  _id: "...",
  subject: "English",
  questionType: "multiple-choice" | "fill-in-blank" | "true-false" | "matching",
  difficulty: 1-10,
  level: 1-20,
  questionText: "What is a noun?",

  // For multiple-choice and true-false
  options: ["Option 1", "Option 2", "Option 3", "Option 4"],
  correct Answer: 2, // Index of correct option

  // For fill-in-blank
  acceptedAnswers: ["clause", "sentence clause"],
  hints: ["It starts with 'c'", "It's a grammatical term"],

  // For matching
  matchingPairs: [
    { left: "Noun", right: "Person, place, or thing" },
    { left: "Verb", right: "Action word" }
  ],

  // Optional fields
  explanation: "A noun is a person, place, or thing.",
  category: "grammar"
}
```

---

## Frontend Changes Required

### 1. Update Subject Card Display

**Change**: Update question count from "10 Questions" to "30 Questions"

```vue
<!-- In your template -->
<div class="subject-count">30 Questions</div>
```

### 2. Add Question Type Detection

**Add to your `setup()` or `data()`**:

```javascript
const currentQuestionType = computed(() => {
  return currentQuestion.value?.questionType || 'multiple-choice';
});
```

### 3. Create Components for Each Question Type

#### A. Multiple Choice Component (existing - keep as is)

```vue
<!-- This is your current implementation -->
<div v-if="currentQuestionType === 'multiple-choice'" class="options-list">
  <button
    v-for="(option, index) in currentQuestion.options"
    :key="index"
    class="option-item"
    :class="{ selected: selectedAnswer === index }"
    @click="selectAnswer(index)"
  >
    <span class="option-radio">
      <span class="radio-dot" v-if="selectedAnswer === index"></span>
    </span>
    <span class="option-label">{{ option }}</span>
  </button>
</div>
```

#### B. True/False Component (NEW)

```vue
<div v-else-if="currentQuestionType === 'true-false'" class="true-false-container">
  <button
    v-for="(option, index) in currentQuestion.options"
    :key="index"
    class="tf-button"
    :class="{ selected: selectedAnswer === index, true: index === 0, false: index === 1 }"
    @click="selectAnswer(index)"
  >
    <svg v-if="index === 0" class="tf-icon" viewBox="0 0 24 24" fill="none">
      <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2"/>
    </svg>
    <svg v-else class="tf-icon" viewBox="0 0 24 24" fill="none">
      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2"/>
    </svg>
    <span class="tf-label">{{ option }}</span>
  </button>
</div>
```

#### C. Fill in the Blank Component (NEW)

```vue
<div v-else-if="currentQuestionType === 'fill-in-blank'" class="fill-blank-container">
  <input
    v-model="fillInAnswer"
    type="text"
    class="fill-input"
    placeholder="Type your answer here..."
    @input="onFillInInput"
  />

  <!-- Optional: Show hints -->
  <div v-if="currentQuestion.hints && currentQuestion.hints.length" class="hints-section">
    <button
      v-if="!showHints"
      @click="showHints = true"
      class="hint-button"
    >
      💡 Show Hints
    </button>
    <div v-else class="hints-list">
      <div v-for="(hint, i) in currentQuestion.hints" :key="i" class="hint-item">
        {{ hint }}
      </div>
    </div>
  </div>
</div>
```

#### D. Matching Component (NEW)

```vue
<div v-else-if="currentQuestionType === 'matching'" class="matching-container">
  <div class="matching-instructions">
    Match each item on the left with the correct item on the right
  </div>

  <div class="matching-grid">
    <div
      v-for="(pair, leftIndex) in currentQuestion.matchingPairs"
      :key="leftIndex"
      class="matching-row"
    >
      <div class="matching-left">
        {{ pair.left }}
      </div>

      <div class="matching-connector">
        <svg viewBox="0 0 24 24" class="arrow-icon">
          <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2"/>
        </svg>
      </div>

      <select
        v-model="matchingAnswers[leftIndex]"
        class="matching-select"
        @change="onMatchingChange"
      >
        <option value="">Select...</option>
        <option
          v-for="(rightPair, rightIndex) in currentQuestion.matchingPairs"
          :key="rightIndex"
          :value="rightIndex"
        >
          {{ rightPair.right }}
        </option>
      </select>
    </div>
  </div>
</div>
```

### 4. Update Data Variables

```javascript
data() {
  return {
    // Existing variables
    selectedAnswer: null, // For multiple-choice and true-false

    // NEW variables for other question types
    fillInAnswer: '', // For fill-in-blank
    matchingAnswers: [], // For matching (array of indices)
    showHints: false // For hint toggle
  };
}
```

### 5. Update Answer Selection Logic

```javascript
methods: {
  selectAnswer(index) {
    // For multiple-choice and true-false
    if (['multiple-choice', 'true-false'].includes(currentQuestionType.value)) {
      this.selectedAnswer = index;
    }
  },

  onFillInInput() {
    // Automatically enable next button when text is entered
    this.selectedAnswer = this.fillInAnswer.trim() !== '' ? this.fillInAnswer : null;
  },

  onMatchingChange() {
    // Check if all matches are selected
    const allSelected = this.matchingAnswers.every(a => a !== '' && a !== undefined);
    this.selectedAnswer = allSelected ? this.matchingAnswers : null;
  },

  nextQuestion() {
    if (this.selectedAnswer === null) return;

    // Prepare answer based on question type
    let answer;
    const questionType = this.currentQuestion.questionType;

    if (questionType === 'multiple-choice' || questionType === 'true-false') {
      answer = this.selectedAnswer; // Index
    } else if (questionType === 'fill-in-blank') {
      answer = this.fillInAnswer; // String
    } else if (questionType === 'matching') {
      answer = this.matchingAnswers; // Array of indices
    }

    // Determine if answer is correct (for local tracking)
    let isCorrect = false;
    if (questionType === 'multiple-choice' || questionType === 'true-false') {
      isCorrect = this.selectedAnswer === this.currentQuestion.correctAnswer;
    } else if (questionType === 'fill-in-blank') {
      // Case-insensitive matching
      const normalizedAnswer = this.fillInAnswer.trim().toLowerCase();
      isCorrect = this.currentQuestion.acceptedAnswers?.some(
        accepted => accepted.toLowerCase() === normalizedAnswer
      );
    } else if (questionType === 'matching') {
      // Check if all pairs match correctly
      isCorrect = this.matchingAnswers.every((rightIndex, leftIndex) =>
        this.currentQuestion.matchingPairs[leftIndex].right ===
        this.currentQuestion.matchingPairs[rightIndex].right
      );
    }

    this.answers.value.push({
      questionIndex: this.currentQuestionIndex,
      questionType: questionType,
      userAnswer: answer,
      correctAnswer: this.currentQuestion.correctAnswer || this.currentQuestion.acceptedAnswers,
      correct: isCorrect
    });

    if (this.currentQuestionIndex < this.totalQuestions - 1) {
      this.currentQuestionIndex++;
      this.resetAnswerFields();
    } else {
      this.finishTest();
    }
  },

  resetAnswerFields() {
    // Reset all answer fields
    this.selectedAnswer = null;
    this.fillInAnswer = '';
    this.matchingAnswers = [];
    this.showHints = false;
  }
}
```

### 6. Update Question Bank

**Replace the questionBank object with this structure:**

```javascript
const questionBank = {
  English: [
    // Multiple Choice Questions (20)
    {
      questionType: "multiple-choice",
      question: "What is a noun?",
      options: ["A person, place, or thing", "An action word", "A describing word", "A connecting word"],
      correctAnswer: 0,
      difficulty: 1,
      category: "grammar",
      explanation: "A noun is a person, place, or thing."
    },
    // ... add 19 more multiple choice

    // True/False Questions (5)
    {
      questionType: "true-false",
      question: "A pronoun is a word that replaces a noun.",
      options: ["True", "False"],
      correctAnswer: 0,
      difficulty: 2,
      category: "parts-of-speech",
      explanation: "True. Pronouns like 'he', 'she', 'it' replace nouns."
    },
    // ... add 4 more true/false

    // Fill in the Blank Questions (3)
    {
      questionType: "fill-in-blank",
      question: "The past tense of 'run' is ___.",
      acceptedAnswers: ["ran"],
      hints: ["It's an irregular verb", "It has 3 letters"],
      difficulty: 3,
      category: "grammar",
      explanation: "'Ran' is the simple past tense of 'run'."
    },
    // ... add 2 more fill-in-blank

    // Matching Questions (2)
    {
      questionType: "matching",
      question: "Match each literary term with its definition:",
      matchingPairs: [
        { left: "Metaphor", right: "Comparison without like/as" },
        { left: "Simile", right: "Comparison using like/as" },
        { left: "Hyperbole", right: "Extreme exaggeration" },
        { left: "Onomatopoeia", right: "Words that imitate sounds" }
      ],
      correctAnswer: [0, 1, 2, 3],
      difficulty: 4,
      category: "literary-devices"
    }
    // ... add 1 more matching
  ],
  // Repeat for other subjects: Mathematics, Science, etc.
  Mathematics: [ /* 30 questions */ ],
  Science: [ /* 30 questions */ ],
  Literature: [ /* 30 questions */ ],
  Physics: [ /* 30 questions */ ],
  Chemistry: [ /* 30 questions */ ],
  Biology: [ /* 30 questions */ ]
};
```

### 7. Add CSS Styles for New Question Types

```css
/* True/False Buttons */
.true-false-container {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  margin-bottom: 2.5rem;
}

.tf-button {
  flex: 1;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem 1.5rem;
  background: white;
  border: 3px solid #E5E7EB;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tf-button.true {
  border-color: #D1FAE5;
}

.tf-button.false {
  border-color: #FEE2E2;
}

.tf-button.selected.true {
  border-color: #10B981;
  background: #D1FAE5;
}

.tf-button.selected.false {
  border-color: #EF4444;
  background: #FEE2E2;
}

.tf-icon {
  width: 48px;
  height: 48px;
  color: #6B7280;
}

.tf-button.selected .tf-icon {
  color: inherit;
}

.tf-button.true .tf-icon {
  color: #10B981;
}

.tf-button.false .tf-icon {
  color: #EF4444;
}

.tf-label {
  font-size: 1.25rem;
  font-weight: 600;
  color: #374151;
}

/* Fill in the Blank */
.fill-blank-container {
  margin-bottom: 2.5rem;
}

.fill-input {
  width: 100%;
  padding: 1.25rem 1.5rem;
  font-size: 1.125rem;
  border: 2px solid #E5E7EB;
  border-radius: 10px;
  transition: all 0.2s ease;
  font-family: inherit;
}

.fill-input:focus {
  outline: none;
  border-color: #3B82F6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.hints-section {
  margin-top: 1.5rem;
}

.hint-button {
  padding: 0.75rem 1.5rem;
  background: #F3F4F6;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
}

.hint-button:hover {
  background: #E5E7EB;
}

.hints-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.hint-item {
  padding: 0.75rem 1rem;
  background: #FEF3C7;
  border-left: 3px solid #F59E0B;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #92400E;
}

/* Matching Questions */
.matching-container {
  margin-bottom: 2.5rem;
}

.matching-instructions {
  padding: 1rem 1.5rem;
  background: #EFF6FF;
  border-left: 3px solid #3B82F6;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  font-size: 0.9375rem;
  color: #1E40AF;
}

.matching-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.matching-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1rem;
  align-items: center;
}

.matching-left {
  padding: 1rem 1.25rem;
  background: #F9FAFB;
  border: 2px solid #E5E7EB;
  border-radius: 8px;
  font-weight: 500;
  color: #374151;
}

.matching-connector {
  width: 40px;
  display: flex;
  justify-content: center;
}

.arrow-icon {
  width: 24px;
  height: 24px;
  color: #9CA3AF;
}

.matching-select {
  padding: 1rem 1.25rem;
  font-size: 1rem;
  border: 2px solid #E5E7EB;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}

.matching-select:focus {
  outline: none;
  border-color: #3B82F6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

@media (max-width: 768px) {
  .matching-row {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .matching-connector {
    transform: rotate(90deg);
  }

  .tf-button {
    max-width: none;
  }
}
```

---

## Summary of Changes

### Backend Changes (Already Done ✅)
1. Updated Question model to support 4 question types
2. Added question validation methods
3. Created 30-question sample for English (template for other subjects)
4. Added completion endpoint `/api/learning-mode/placement-test/:userId/complete`

### Frontend Changes (You Need to Do)
1. ✅ Change "10 Questions" to "30 Questions" in subject cards
2. ✅ Add `currentQuestionType` computed property
3. ✅ Add conditional rendering for 4 question types
4. ✅ Add new data variables (`fillInAnswer`, `matchingAnswers`, `showHints`)
5. ✅ Update `selectAnswer`, `nextQuestion`, and add `resetAnswerFields` methods
6. ✅ Add CSS styles for new question types
7. ✅ Update questionBank with 30 questions per subject using mixed types

---

## Testing Checklist

- [ ] Multiple choice questions work (existing functionality)
- [ ] True/False questions display and work correctly
- [ ] Fill-in-blank accepts correct answers (case-insensitive)
- [ ] Hints show/hide for fill-in-blank
- [ ] Matching questions allow selecting pairs
- [ ] All question types calculate correct/wrong properly
- [ ] Progress bar updates correctly
- [ ] Results screen shows accurate scores
- [ ] Backend receives and stores results correctly

---

## Question Distribution Recommendation

For a balanced 30-question test per subject:
- **20 Multiple Choice** (66%) - Main assessment method
- **5 True/False** (17%) - Quick knowledge checks
- **3 Fill-in-Blank** (10%) - Recall testing
- **2 Matching** (7%) - Relationship understanding

This ensures variety while keeping the test manageable!
