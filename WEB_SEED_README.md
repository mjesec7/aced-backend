# 🌐 Web-Based Question Seeding - Complete Guide

## Overview

This system provides **TWO ways** to seed the question database:

1. **Web-Based (Easiest)** - Visit a URL, no CLI needed
2. **Command-Line** - SSH and run scripts

---

## 🎯 Method 1: Web-Based Seeding (Recommended)

### Prerequisites
- Backend deployed to production
- MongoDB connected
- Internet browser

### Steps

#### 1. Add Routes to server.js

Add this line to your `server.js` file:

```javascript
app.use('/api/seed', require('./routes/seedRoutes'));
```

**Where to add it:** With other route declarations. Example:

```javascript
// Routes
app.use('/api/lessons', require('./routes/lessonRoutes'));
app.use('/api/learning-mode', require('./routes/learningModeRoutes'));
app.use('/api/seed', require('./routes/seedRoutes'));  // ADD THIS
```

#### 2. Deploy Files

Make sure these files are deployed:
- `routes/seedRoutes.js` ✅
- `models/question.js` ✅ (updated with 10 subjects)
- `constants/learningModes.js` ✅ (updated with 10 subjects)

#### 3. Seed the Database

Visit this URL in your browser:

```
https://api.aced.live/api/seed/init
```

Done! Questions are seeded.

#### 4. Verify

Check status at:

```
https://api.aced.live/api/seed/status
```

---

## 🖥️ Method 2: Command-Line Seeding

### Prerequisites
- SSH access to server
- Backend directory access

### Steps

```bash
# SSH into production server
ssh your-server

# Navigate to backend directory
cd /path/to/aced-backend

# Run seed script
npm run seed:questions

# Or directly:
node scripts/seedQuestions.js

# Verify
npm run test:placement
```

---

## 📊 What Gets Seeded

### 200 Questions Across 10 Subjects

| Subject | Questions | Coverage |
|---------|-----------|----------|
| English | 20 | Grammar to rhetoric |
| Mathematics | 20 | Arithmetic to calculus |
| Science | 20 | General science |
| History | 20 | Ancient to modern |
| Geography | 20 | Physical to political |
| Computer Science | 20 | Programming to theory |
| Literature | 20 | Analysis to theory |
| Physics | 20 | Mechanics to quantum |
| Chemistry | 20 | Basic to organic |
| Biology | 20 | Cell to genetics |

### Question Structure

Each question includes:
- **Difficulty:** 1-10 (adaptive)
- **Level:** 1-20 (grade mapping)
- **Category:** Specific topic
- **Options:** 4 multiple choice
- **Correct Answer:** Index 0-3 (server-only)

---

## 🎓 How It Works

### Adaptive Testing Algorithm

1. **Starts** at difficulty 5 (medium)
2. **Correct answer** → difficulty +0.5 (up to 10)
3. **Wrong answer** → difficulty -0.5 (down to 1)
4. **Cycles** through all 10 subjects
5. **50 questions** total
6. **Calculates** final level based on performance
7. **Assigns** grade (A1-C2)

### Level to Grade Mapping

- **Level 1-3** → A1 (Beginner)
- **Level 4-6** → A2 (Elementary)
- **Level 7-9** → B1 (Intermediate)
- **Level 10-12** → B2 (Upper Intermediate)
- **Level 13-15** → C1 (Advanced)
- **Level 16-18** → C2 (Proficient)
- **Level 19** → Expert
- **Level 20** → Master

---

## 🔒 Security Features

✅ **Correct answers never sent to frontend**
- Stored server-side in test session
- Validation happens on backend
- Frontend only receives questionText and options

✅ **No duplicate questions**
- Tracks asked questions
- Excludes from future selection
- Uses `excludeIds` array

✅ **Server-side difficulty**
- Calculated based on performance
- Frontend can't manipulate

---

## ✅ Verification

### Web Method

Visit: `https://api.aced.live/api/seed/status`

**Expected response:**
```json
{
  "success": true,
  "hasQuestions": true,
  "totalQuestions": 200,
  "subjects": [
    { "_id": "Biology", "count": 20 },
    { "_id": "Chemistry", "count": 20 },
    { "_id": "Computer Science", "count": 20 },
    { "_id": "English", "count": 20 },
    { "_id": "Geography", "count": 20 },
    { "_id": "History", "count": 20 },
    { "_id": "Literature", "count": 20 },
    { "_id": "Mathematics", "count": 20 },
    { "_id": "Physics", "count": 20 },
    { "_id": "Science", "count": 20 }
  ]
}
```

### CLI Method

```bash
node scripts/testPlacementTest.js
```

**Expected output:**
```
✅ Questions database looks good!
✅ Question selection works!
✅ All tests passed!
```

---

## 🐛 Troubleshooting

### Web Method Issues

**Issue:** "Cannot GET /api/seed/init"

**Fix:**
1. Add routes to server.js
2. Restart server
3. Redeploy if needed

---

**Issue:** "Module not found: seedData/questions200"

**Fix:** This is expected. The seedRoutes.js has questions inline, not in external file.

---

**Issue:** MongoDB connection error

**Fix:** Check `.env` has `MONGODB_URI=mongodb+srv://...`

---

### CLI Method Issues

**Issue:** "Cannot find module 'mongoose'"

**Fix:** Run `npm install`

---

**Issue:** "Connection refused"

**Fix:** Check MongoDB URI in `.env`

---

## 🔄 Re-seeding

To update questions or re-seed:

### Web Method

1. Delete questions from MongoDB:
   ```javascript
   db.questions.deleteMany({})
   ```

2. Visit: `https://api.aced.live/api/seed/init`

### CLI Method

1. Questions automatically skipped if exist
2. Or delete manually and re-run script

---

## 📋 Deployment Checklist

### For Web-Based Seeding

- [ ] Add `app.use('/api/seed', require('./routes/seedRoutes'));` to server.js
- [ ] Deploy `routes/seedRoutes.js`
- [ ] Deploy updated `models/question.js`
- [ ] Deploy updated `constants/learningModes.js`
- [ ] Restart backend server
- [ ] Visit `/api/seed/init`
- [ ] Verify at `/api/seed/status`
- [ ] Test placement test from frontend

### For CLI Seeding

- [ ] SSH into production server
- [ ] cd to backend directory
- [ ] Run `npm install` if needed
- [ ] Run `npm run seed:questions`
- [ ] Run `npm run test:placement`
- [ ] Test placement test from frontend

---

## 🎉 Success Criteria

After seeding (either method):

✅ 200 questions in database
✅ 10 subjects with 20 questions each
✅ Placement test starts without errors
✅ Questions from all subjects appear
✅ Difficulty adapts based on answers
✅ Test completes after 50 questions
✅ Results show level and grade

---

## 📞 Support

**Web Method:**
- Check browser console for errors
- Verify routes added to server.js
- Check server logs

**CLI Method:**
- Check SSH connection
- Verify file paths
- Check MongoDB connection

---

## 🚀 Recommended Approach

**For quick deployment:** Use Web Method
- No CLI needed
- No SSH required
- Just visit URL
- 2 minutes total

**For automated setup:** Use CLI Method
- Part of deployment scripts
- Can be automated
- Better for CI/CD

---

**Both methods seed the exact same 200 questions!**

Choose whichever fits your workflow best. 🎯
