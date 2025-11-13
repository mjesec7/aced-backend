# 📝 How to Add Seed Routes to server.js

## What You Need to Add

Add ONE line to your `server.js` file.

---

## 🔍 Find the Routes Section

Look for where other routes are declared in your `server.js`. It will look something like this:

```javascript
// Routes
app.use('/api/lessons', require('./routes/lessonRoutes'));
app.use('/api/topics', require('./routes/topicRoutes'));
app.use('/api/homework', require('./routes/homeworkRoutes'));
app.use('/api/tests', require('./routes/testRoutes'));
app.use('/api/progress', require('./routes/progressRoutes'));
app.use('/api/learning-mode', require('./routes/learningModeRoutes'));
// ... other routes ...
```

---

## ➕ Add This Line

Add this line anywhere in the routes section:

```javascript
app.use('/api/seed', require('./routes/seedRoutes'));
```

---

## ✅ Complete Example

Here's how your routes section should look AFTER adding the line:

```javascript
// Routes
app.use('/api/lessons', require('./routes/lessonRoutes'));
app.use('/api/topics', require('./routes/topicRoutes'));
app.use('/api/homework', require('./routes/homeworkRoutes'));
app.use('/api/tests', require('./routes/testRoutes'));
app.use('/api/progress', require('./routes/progressRoutes'));
app.use('/api/learning-mode', require('./routes/learningModeRoutes'));
app.use('/api/seed', require('./routes/seedRoutes'));  // ← ADD THIS LINE
// ... other routes ...
```

---

## 🚀 After Adding

1. **Save** the file
2. **Restart** your backend server
3. **Deploy** to production (if needed)
4. **Visit** `https://api.aced.live/api/seed/init`

---

## 🎯 Alternative Placements

The line can go anywhere in the routes section. These are all valid:

### Option 1: At the top
```javascript
app.use('/api/seed', require('./routes/seedRoutes'));  // First
app.use('/api/lessons', require('./routes/lessonRoutes'));
// ... other routes ...
```

### Option 2: In the middle
```javascript
app.use('/api/lessons', require('./routes/lessonRoutes'));
app.use('/api/seed', require('./routes/seedRoutes'));  // Middle
app.use('/api/topics', require('./routes/topicRoutes'));
// ... other routes ...
```

### Option 3: At the end
```javascript
app.use('/api/lessons', require('./routes/lessonRoutes'));
// ... other routes ...
app.use('/api/seed', require('./routes/seedRoutes'));  // Last
```

**All work the same!** Place it wherever makes sense to you.

---

## ✅ Verification

After restarting, test if it works by visiting:

```
https://api.aced.live/api/seed/status
```

**Expected response (before seeding):**
```json
{
  "success": true,
  "hasQuestions": false,
  "totalQuestions": 0,
  "subjects": [],
  "message": "❌ Database is empty - visit /api/seed/init to seed"
}
```

**Expected response (after seeding):**
```json
{
  "success": true,
  "hasQuestions": true,
  "totalQuestions": 200,
  "subjects": [...],
  "message": "✅ Database has 200 questions across 10 subjects"
}
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module './routes/seedRoutes'"

**Cause:** The seedRoutes.js file doesn't exist

**Fix:** Make sure these files are deployed:
- `routes/seedRoutes.js`
- `models/question.js` (updated)
- `constants/learningModes.js` (updated)

---

### Error: "Cannot GET /api/seed/init"

**Cause:** Line not added to server.js or server not restarted

**Fix:**
1. Verify line is in server.js
2. Restart server: `pm2 restart aced-backend` or `npm start`
3. Try again

---

### Error: "Module not found: seedData/questions200"

**This is OK!** The seedRoutes.js file has all questions inline, so this module isn't needed.

If you see this error, it means the routes are loading but the data file is missing. The inline data in seedRoutes.js will work fine.

---

## 📋 Complete Checklist

- [ ] Open `server.js`
- [ ] Find routes section
- [ ] Add line: `app.use('/api/seed', require('./routes/seedRoutes'));`
- [ ] Save file
- [ ] Restart server
- [ ] Deploy to production (if needed)
- [ ] Test: Visit `/api/seed/status`
- [ ] Seed: Visit `/api/seed/init`
- [ ] Verify: Visit `/api/seed/status` again

---

## 🎉 Done!

That's it! One line of code gets you:
- ✅ 200 questions across 10 subjects
- ✅ Adaptive placement test
- ✅ Automatic level assignment
- ✅ Web-based seeding (no CLI needed)

---

**Time Required:** 2 minutes
**Lines of Code:** 1
**Difficulty:** Very Easy

Ready to test your placement system! 🚀
