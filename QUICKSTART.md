# ⚡ QUICKSTART - 2 Minutes to Deploy

## 🎯 Backend (2 minutes)

### Step 1: Edit server.js

Add this line with your other routes:

```javascript
app.use('/api/seed', require('./routes/seedRoutes'));
```

### Step 2: Deploy

Deploy to production (files already in repo).

### Step 3: Visit URL

```
https://api.aced.live/api/seed/init
```

**DONE!** ✅ 200 questions seeded.

---

## 🎨 Frontend (30-60 minutes)

### Step 1: Create src/api/placementTest.js

```javascript
import api from './core';

export const startPlacementTest = async (userId) => {
  const { data } = await api.post(`/learning-mode/placement-test/${userId}/start`);
  return data;
};

export const submitPlacementTestAnswer = async (testId, answer, timeSpent) => {
  const { data } = await api.post(`/learning-mode/placement-test/${testId}/answer`, {
    answer,
    timeSpent
  });
  return data;
};

export const getPlacementTestResults = async (userId) => {
  const { data } = await api.get(`/learning-mode/placement-test/${userId}/results`);
  return data;
};
```

### Step 2: Export from main API file

```javascript
// In src/api.js
export { startPlacementTest, submitPlacementTestAnswer, getPlacementTestResults } from './api/placementTest';
```

### Step 3: Use in PlacementTest.vue

```javascript
import { startPlacementTest, submitPlacementTestAnswer } from '@/api';

// Use the functions in your component
```

**DONE!** ✅ Frontend connected.

---

## ✅ Verify

1. Visit: `https://api.aced.live/api/seed/status`
   - Should show 200 questions

2. Start test from frontend
   - Should show first question

3. Complete 50 questions
   - Should show results with level and grade

---

## 📚 Full Docs

- **Backend:** [SIMPLE_SEED_GUIDE.md](./SIMPLE_SEED_GUIDE.md)
- **Frontend:** [FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md)
- **Complete:** [FINAL_DEPLOYMENT_SUMMARY.md](./FINAL_DEPLOYMENT_SUMMARY.md)

---

**Total Time:** 32-62 minutes
**Difficulty:** Easy
**Result:** Working placement test! 🎉
