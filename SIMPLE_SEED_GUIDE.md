# 🌐 Simple Web-Based Seeding Guide

## The Easiest Way to Seed Your Database

No SSH, no command line - just click a URL!

---

## 🎯 What You Need

1. ✅ Backend deployed to production
2. ✅ MongoDB connection working
3. ✅ Internet browser

That's it!

---

## 📝 Step 1: Add Seed Routes to server.js

Open your `server.js` file and add this line with your other routes:

```javascript
// Add seed routes (add this line near other route declarations)
app.use('/api/seed', require('./routes/seedRoutes'));
```

**Example placement in server.js:**
```javascript
// Other routes
app.use('/api/lessons', require('./routes/lessonRoutes'));
app.use('/api/learning-mode', require('./routes/learningModeRoutes'));

// ADD THIS LINE:
app.use('/api/seed', require('./routes/seedRoutes'));

// More routes below...
```

---

## 🚀 Step 2: Deploy to Production

Deploy your backend with these new files:
- `routes/seedRoutes.js` (created automatically)
- `models/question.js` (updated with 10 subjects)
- `constants/learningModes.js` (updated with 10 subjects)

---

## 🌐 Step 3: Visit the Seed URL

Once deployed, simply visit this URL in your browser:

```
https://api.aced.live/api/seed/init
```

**That's it!** The questions will be seeded automatically.

---

## ✅ Step 4: Verify

Check the status at:

```
https://api.aced.live/api/seed/status
```

You should see:
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
  ],
  "message": "✅ Database has 200 questions across 10 subjects"
}
```

---

## 📊 What Gets Seeded

### 10 School Subjects (20 questions each = 200 total):

1. **English** - Grammar, vocabulary, literary devices
2. **Mathematics** - Arithmetic to calculus
3. **Science** - General science concepts
4. **History** - World and regional history
5. **Geography** - Physical and political geography
6. **Computer Science** - Programming and IT concepts
7. **Literature** - Literary analysis and theory
8. **Physics** - Mechanics to quantum physics
9. **Chemistry** - Basic to organic chemistry
10. **Biology** - Cell biology to genetics

### Each Question Has:
- ✅ Difficulty: 1-10 (adapts during test)
- ✅ Level: 1-20 (matches school grades A1-C2)
- ✅ Category: Specific topic within subject
- ✅ 4 Options: Multiple choice format
- ✅ Correct Answer: Index 0-3 (never sent to frontend)

---

## 🔒 Security

- ✅ Safe to visit multiple times (checks if questions already exist)
- ✅ Won't create duplicates
- ✅ No authentication required for seeding endpoint
- ✅ Read-only status endpoint available

---

## 🐛 Troubleshooting

### Issue 1: "Cannot GET /api/seed/init"

**Cause:** Routes not added to server.js

**Fix:** Add this line to server.js:
```javascript
app.use('/api/seed', require('./routes/seedRoutes'));
```

Then restart server and redeploy.

---

### Issue 2: "Module not found: seedData/questions200"

**Cause:** The questions200.js file doesn't exist yet

**Solution:** The seedRoutes.js will use inline questions data. This is normal and will work fine.

---

### Issue 3: "Connection refused" or MongoDB error

**Cause:** MongoDB not connected

**Fix:** Check your `.env` file has:
```
MONGODB_URI=mongodb+srv://...
```

---

## 🎓 How the Adaptive Test Works

Once seeded, the placement test will:

1. **Start at medium difficulty** (5/10)
2. **Adapt based on performance:**
   - Correct answer → difficulty +0.5
   - Wrong answer → difficulty -0.5
3. **Cycle through all 10 subjects**
4. **Ask 50 total questions**
5. **Calculate final level (1-20)**
6. **Assign grade (A1-C2)**

---

## 📈 Expected Results

After 50 questions across 10 subjects:

- **Level 1-3** → Grade A1 (Beginner)
- **Level 4-6** → Grade A2 (Elementary)
- **Level 7-9** → Grade B1 (Intermediate)
- **Level 10-12** → Grade B2 (Upper Intermediate)
- **Level 13-15** → Grade C1 (Advanced)
- **Level 16-18** → Grade C2 (Proficient)
- **Level 19** → Expert
- **Level 20** → Master

---

## ✨ Success Criteria

After seeding, your placement test should:

✅ Start without errors
✅ Show questions from all 10 subjects
✅ Adapt difficulty based on answers
✅ Complete after 50 questions
✅ Display comprehensive results with level and grade

---

## 🔄 Re-seeding

If you need to re-seed (e.g., update questions):

1. Delete all questions from MongoDB:
   ```javascript
   // In MongoDB shell or Compass:
   db.questions.deleteMany({})
   ```

2. Visit the seed URL again:
   ```
   https://api.aced.live/api/seed/init
   ```

---

## 📞 Support

If seeding fails:
1. Check `/api/seed/status` for current state
2. Verify MongoDB connection in `.env`
3. Check server logs for errors
4. Ensure server.js has the seed routes added

---

**Estimated Time:** 2 minutes (URL visit + verification)
**Difficulty:** Very Easy
**Required Access:** Just a web browser!

That's it! Your placement test is ready to use. 🎉
