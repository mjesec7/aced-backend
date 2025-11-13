# 🚀 Placement Test Deployment Guide

## What Needs To Be Done

The placement test backend is **fully implemented and ready**, but the question database is empty. You need to populate it with questions.

---

## Prerequisites

✅ MongoDB database is running
✅ Backend server is deployed
✅ You have SSH access to the server

---

## Step-by-Step Instructions

### Step 1: Connect to Your Server

Open your terminal and connect via SSH:

```bash
ssh your-username@your-server-ip
```

Replace with your actual server credentials.

---

### Step 2: Navigate to Backend Directory

```bash
cd /var/www/aced-backend
```

Or wherever your backend is located. If you're not sure, ask your DevOps team.

---

### Step 3: Verify MongoDB Connection

Check if MongoDB connection string is configured:

```bash
cat .env | grep MONGODB_URI
```

**Expected output:**
```
MONGODB_URI=mongodb+srv://...
```

If nothing shows up, you need to add it:

```bash
nano .env
```

Add this line (get the actual connection string from your MongoDB Atlas dashboard):
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/aced-learning?retryWrites=true&w=majority
```

Save and exit (Ctrl + X, then Y, then Enter).

---

### Step 4: Install Dependencies (if needed)

```bash
npm install
```

This ensures all required packages are installed.

---

### Step 5: Seed the Question Database

Run this single command:

```bash
npm run seed:questions
```

**Alternative (if npm script doesn't work):**
```bash
node scripts/seedQuestions.js
```

---

### Step 6: Verify Success

You should see output like this:

```
🔌 Connecting to MongoDB...
✅ Connected to MongoDB
📝 Seeding 150 questions...
✅ Successfully seeded 150 questions!

📊 Question Bank Statistics:
═══════════════════════════════════════

English: 18 questions
Mathematics: 18 questions
Science: 18 questions
History: 18 questions
Geography: 18 questions

═══════════════════════════════════════
📚 Total Questions: 150
═══════════════════════════════════════

✨ Seeding complete!
```

---

### Step 7: Test the System

Run the test script to verify everything works:

```bash
npm run test:placement
```

**Alternative:**
```bash
node scripts/testPlacementTest.js
```

**Expected output:**
```
✅ Questions database looks good!
✅ Question selection works!
✅ All tests passed! Backend is ready!
```

---

### Step 8: Restart Backend Server (if needed)

```bash
pm2 restart aced-backend
```

Or if using a different process manager:
```bash
systemctl restart aced-backend
```

---

## Verification

After seeding, test from the frontend:

1. Go to placement test page
2. Click "Let's Begin"
3. You should see the first question appear

**Before seeding:** 503 error "Question bank not initialized"
**After seeding:** ✅ Question appears successfully

---

## Troubleshooting

### Issue 1: "Cannot find module 'mongoose'"

**Fix:**
```bash
npm install
```

### Issue 2: "Connection refused" or "ECONNREFUSED"

**Cause:** Can't connect to MongoDB

**Fix:**
1. Check `.env` file has correct `MONGODB_URI`
2. Verify MongoDB cluster is running (check MongoDB Atlas)
3. Check IP whitelist in MongoDB Atlas (add server IP)

### Issue 3: "Module not found: scripts/seedQuestions.js"

**Cause:** You're in wrong directory

**Fix:**
```bash
cd /var/www/aced-backend  # or your actual path
ls scripts/  # Should show seedQuestions.js
```

### Issue 4: Permission denied

**Fix:**
```bash
sudo node scripts/seedQuestions.js
```

---

## Important Notes

⚠️ **Safe to run multiple times** - The script won't create duplicates
⚠️ **No data loss** - Only adds questions, doesn't modify existing data
⚠️ **Takes ~5 seconds** - Script is very fast

---

## What Gets Created

- **150 questions** across 5 subjects
- **Question analytics** tracking (empty, populated during use)
- **MongoDB collection:** `questions`

---

## Support

If you encounter any errors not covered here:

1. Copy the full error message
2. Note which step failed
3. Contact the development team with this information

---

## Post-Deployment Checklist

- [ ] Seed script ran successfully
- [ ] Test script shows "All tests passed"
- [ ] Frontend placement test works (no 503 error)
- [ ] First question appears when starting test
- [ ] Can submit answers and get next question

---

## Success Criteria

✅ No 503 errors
✅ Questions appear in frontend
✅ Test can be completed
✅ Results are calculated

---

**Estimated Time:** 5 minutes
**Difficulty:** Easy
**Required Access:** SSH + MongoDB connection

---

## Quick Command Summary

```bash
# Full deployment in one go:
cd /var/www/aced-backend
npm install
node scripts/seedQuestions.js
node scripts/testPlacementTest.js
pm2 restart aced-backend  # if using PM2
```

That's it! 🎉
