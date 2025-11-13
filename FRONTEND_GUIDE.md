# 🎨 Frontend Integration Guide - Placement Test

## What You Need To Know

The backend is **fully ready**. You just need to add API functions to your frontend to connect to it.

---

## API Endpoints Overview

The backend provides 3 endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/learning-mode/placement-test/:userId/start` | POST | Start test, get first question |
| `/api/learning-mode/placement-test/:testId/answer` | POST | Submit answer, get next question |
| `/api/learning-mode/placement-test/:userId/results` | GET | Get completed test results |

---

## What You Need To Add

Create a new file in your frontend: `src/api/placementTest.js`

This file should export 3 functions:

### 1. `startPlacementTest(userId)`

**Purpose:** Start a new placement test

**Input:**
- `userId` (string) - Firebase user ID

**Output:**
```javascript
{
  success: true,
  data: {
    testId: "abc123...",
    question: {
      questionText: "Choose the correct verb form: 'She ___ to school every day.'",
      options: ["go", "goes", "going", "gone"],
      difficulty: 5
    },
    questionNumber: 1,
    totalQuestions: 50,
    timeLimit: 45
  }
}
```

**Important:**
- Must use **POST** request (not GET)
- Correct answer is NOT included (security feature)

---

### 2. `submitPlacementTestAnswer(testId, answer, timeSpent)`

**Purpose:** Submit answer and get next question (or results if finished)

**Input:**
- `testId` (string) - Test session ID from start response
- `answer` (number) - Selected option index: 0, 1, 2, or 3
- `timeSpent` (number) - Seconds spent on question

**Output (Next Question):**
```javascript
{
  success: true,
  data: {
    testComplete: false,
    question: {
      questionText: "What is 7 × 6?",
      options: ["36", "42", "48", "54"],
      difficulty: 5.5
    },
    questionNumber: 2,
    totalQuestions: 50,
    progress: 4  // Percentage
  }
}
```

**Output (Test Complete):**
```javascript
{
  success: true,
  data: {
    testComplete: true,
    results: {
      overallScore: 78,
      percentile: 65,
      recommendedLevel: 7,
      confidence: "high",
      subjectScores: [
        {
          subject: "English",
          score: 80,
          level: 8,
          questionsAnswered: 10,
          correctAnswers: 8
        }
        // ... 4 more subjects
      ]
    }
  }
}
```

**Important:**
- Must use **POST** request
- Answer must be index (0-3), not the text
- Backend validates answer server-side

---

### 3. `getPlacementTestResults(userId)`

**Purpose:** Get results of previously completed test

**Input:**
- `userId` (string) - Firebase user ID

**Output:**
```javascript
{
  success: true,
  data: {
    results: { /* same as completion results */ },
    currentLevel: 7,
    currentGrade: "B1",
    testDate: "2025-11-13T12:00:00.000Z"
  }
}
```

---

## Implementation Template

Create `src/api/placementTest.js`:

```javascript
import api from './core';  // Your axios instance

export const startPlacementTest = async (userId) => {
  try {
    const { data } = await api.post(
      `/learning-mode/placement-test/${userId}/start`
    );

    if (data.success) {
      return { success: true, data };
    }
    throw new Error(data.message || 'Failed to start test');
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.response?.status
    };
  }
};

export const submitPlacementTestAnswer = async (testId, answer, timeSpent) => {
  try {
    const { data } = await api.post(
      `/learning-mode/placement-test/${testId}/answer`,
      { answer, timeSpent }
    );

    if (data.success) {
      return { success: true, data };
    }
    throw new Error(data.message || 'Failed to submit answer');
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.response?.status
    };
  }
};

export const getPlacementTestResults = async (userId) => {
  try {
    const { data } = await api.get(
      `/learning-mode/placement-test/${userId}/results`
    );

    if (data.success) {
      return { success: true, data };
    }
    throw new Error(data.message || 'Failed to get results');
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.response?.status
    };
  }
};
```

---

## Where To Export These Functions

Add to your main API file (usually `src/api.js` or `src/api/index.js`):

```javascript
// In src/api.js
export {
  startPlacementTest,
  submitPlacementTestAnswer,
  getPlacementTestResults
} from './api/placementTest';
```

---

## How To Use In PlacementTest.vue

```javascript
import { startPlacementTest, submitPlacementTestAnswer } from '@/api';

// In your component:
const startTest = async () => {
  const userId = store.state.firebaseUserId;
  const response = await startPlacementTest(userId);

  if (response.success) {
    // Show first question
    currentQuestion.value = response.data.question;
    testId.value = response.data.testId;
  } else {
    // Show error
    error.value = response.error;
  }
};

const submitAnswer = async () => {
  const response = await submitPlacementTestAnswer(
    testId.value,
    selectedAnswer.value,  // 0, 1, 2, or 3
    timeSpent.value
  );

  if (response.success) {
    if (response.data.testComplete) {
      // Show results
      results.value = response.data.results;
    } else {
      // Show next question
      currentQuestion.value = response.data.question;
    }
  }
};
```

---

## Error Handling

Handle these error codes:

| Code | Meaning | User Message |
|------|---------|--------------|
| 400 | Already took test | "You have already completed this test" |
| 401 | Not authenticated | "Please log in to take the test" |
| 404 | Test not found | "Test session expired. Please start again" |
| 503 | Database not ready | "Test temporarily unavailable. Try again later" |

Example:

```javascript
if (!response.success) {
  if (response.code === 503) {
    error.value = "Test is temporarily unavailable. Please try again in a few minutes.";
  } else if (response.code === 400) {
    error.value = "You have already taken this test.";
  } else {
    error.value = response.error || "Something went wrong";
  }
}
```

---

## Testing Your Integration

### Test 1: Start Test
1. Open browser DevTools console
2. Click "Let's Begin"
3. Should see: `✅ Test started: { testId: "...", question: {...} }`

### Test 2: Submit Answer
1. Select an answer
2. Click "Continue"
3. Should see: `✅ Answer submitted: { testComplete: false, question: {...} }`

### Test 3: Complete Test
1. Complete all 50 questions
2. Should see results screen with:
   - Level number (1-20)
   - Grade (A1-C2)
   - Overall score (%)
   - Subject breakdown

---

## Important Notes

✅ **Backend is ready** - No backend changes needed
✅ **Secure** - Correct answers never sent to frontend
✅ **Fast** - Adaptive difficulty adjusts in real-time
✅ **Comprehensive** - 150+ questions across 5 subjects

⚠️ **Answer format** - Must send index (0-3), not text
⚠️ **HTTP method** - Must use POST for start and submit
⚠️ **Test ID** - Save it from start response, needed for all submits

---

## Common Mistakes To Avoid

❌ **Wrong:** Using GET instead of POST
```javascript
await api.get(`/placement-test/${userId}/start`)  // WRONG
```

✅ **Correct:** Using POST
```javascript
await api.post(`/placement-test/${userId}/start`)  // CORRECT
```

---

❌ **Wrong:** Sending answer text
```javascript
{ answer: "goes" }  // WRONG
```

✅ **Correct:** Sending answer index
```javascript
{ answer: 1 }  // CORRECT (0-3)
```

---

❌ **Wrong:** Including correctAnswer in UI
```javascript
// Backend never sends this, but if it did:
<div>Correct answer: {{ question.correctAnswer }}</div>  // WRONG
```

✅ **Correct:** Only showing question and options
```javascript
<div>{{ question.questionText }}</div>
<div v-for="(option, index) in question.options">
  {{ option }}
</div>
```

---

## Checklist

Before testing:

- [ ] Created `src/api/placementTest.js`
- [ ] Exported functions from main api file
- [ ] Updated imports in `PlacementTest.vue`
- [ ] Using POST for start and submit
- [ ] Sending answer as number (0-3)
- [ ] Handling error codes (400, 401, 404, 503)
- [ ] Not displaying correctAnswer anywhere

---

## Support

If you see these errors:

**503 - Question bank not initialized**
- Contact backend team to run database seeding
- They need to run: `npm run seed:questions`

**404 - Endpoint not found**
- Check API base URL in `src/api/core.js`
- Should be: `https://api.aced.live/api`

**401 - Unauthorized**
- Check Firebase token is being sent in Authorization header
- Verify user is logged in

---

## Summary

**What backend provides:**
- ✅ 3 REST API endpoints
- ✅ 150+ questions database
- ✅ Adaptive difficulty system
- ✅ Automatic level calculation
- ✅ Security (no answer exposure)

**What you need to add:**
- 📝 3 API functions in frontend
- 📝 Import them in PlacementTest.vue
- 📝 Handle responses and errors

**Time estimate:** 30-60 minutes

That's it! The backend is ready and waiting for your frontend to connect. 🚀
