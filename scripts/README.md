# Placement Test Question Seeding

This directory contains scripts for seeding the question bank used in placement tests.

## Files

- **seedQuestions.js**: Main seeding script that populates the database with questions
- **../seedData/questions.js**: Question bank data (150+ questions across 5 subjects)

## Question Bank Overview

The question bank contains **150+ questions** covering:

- **English**: Grammar, vocabulary, sentence structure (30+ questions)
- **Mathematics**: Arithmetic, algebra, calculus (30+ questions)
- **Science**: Biology, physics, chemistry (30+ questions)
- **History**: Ancient, medieval, modern history (30+ questions)
- **Geography**: Physical, political geography (30+ questions)

Each question has:
- Subject classification
- Difficulty level (1-10 scale)
- Level mapping (1-20 for grade levels)
- Multiple choice options (4 options)
- Correct answer index (0-3)
- Category tags

## How to Run the Seed Script

### Prerequisites

1. MongoDB must be running and accessible
2. Environment variable `MONGODB_URI` should be set (or defaults to `mongodb://localhost:27017/aced-learning`)

### Run the Script

```bash
# From the project root
node scripts/seedQuestions.js

# Or using npm (if added to package.json)
npm run seed:questions
```

### What the Script Does

1. **Connects** to MongoDB
2. **Checks** if questions already exist
3. **Seeds** questions intelligently:
   - If questions exist: Only adds new ones (no duplicates)
   - If empty: Adds all questions
4. **Displays** statistics:
   - Questions per subject
   - Questions per difficulty level
   - Total question count

### Expected Output

```
🔌 Connecting to MongoDB...
✅ Connected to MongoDB
📝 Seeding 150 questions...
✅ Successfully seeded 150 questions!

📊 Question Bank Statistics:
═══════════════════════════════════════

English: 30 questions
  - Easy (1-3):   6 questions
  - Medium (4-6): 6 questions
  - Hard (7-10):  6 questions

Mathematics: 30 questions
  - Easy (1-3):   6 questions
  - Medium (4-6): 6 questions
  - Hard (7-10):  6 questions

...

═══════════════════════════════════════
📚 Total Questions: 150
═══════════════════════════════════════

✨ Seeding complete!
🔌 Database connection closed
```

## Production Deployment

When deploying to production:

1. **Set MongoDB URI**: Ensure `MONGODB_URI` environment variable points to production database
2. **Run Seed Script**: SSH into production server and run:
   ```bash
   cd /path/to/aced-backend
   node scripts/seedQuestions.js
   ```
3. **Verify**: Check the output statistics to confirm all questions were seeded
4. **Test**: Try starting a placement test via API to verify questions are returned

## Adding More Questions

To add more questions to the bank:

1. Edit `seedData/questions.js`
2. Follow the existing format:
   ```javascript
   {
       subject: "English",
       difficulty: 5,
       level: 7,
       questionText: "Your question here?",
       options: ["Option A", "Option B", "Option C", "Option D"],
       correctAnswer: 1, // Index of correct answer (0-3)
       category: "grammar"
   }
   ```
3. Run the seed script - it will automatically add only new questions

## Troubleshooting

### Error: Cannot connect to MongoDB
- Check if MongoDB is running
- Verify `MONGODB_URI` environment variable
- Check network connectivity

### Error: Module not found
- Run `npm install` to install dependencies

### Questions not appearing in tests
- Verify questions have `isActive: true` (default)
- Check that `subject` names match exactly
- Confirm difficulty levels are between 1-10

## Question Bank Expansion

To expand the question bank in the future:

1. **Maintain Balance**: Keep roughly equal questions across:
   - All 5 subjects
   - All difficulty levels (1-10)
   - Easy/Medium/Hard ranges

2. **Quality Control**:
   - Clear, unambiguous questions
   - One definitively correct answer
   - Appropriate difficulty for level
   - No spelling/grammar errors

3. **Categories**: Use consistent category tags for filtering:
   - English: grammar, vocabulary, punctuation, etc.
   - Mathematics: algebra, geometry, calculus, etc.
   - Science: biology, physics, chemistry, etc.
   - History: ancient, medieval, modern, etc.
   - Geography: physical, political, etc.

## Database Schema

Questions are stored with this structure:

```javascript
{
    subject: String (required, enum),
    difficulty: Number (1-10, required),
    level: Number (1-20, required),
    questionText: String (required),
    options: [String] (4 options required),
    correctAnswer: Number (0-3, required),
    category: String,
    tags: [String],
    isActive: Boolean (default: true),
    analytics: {
        timesAsked: Number,
        correctAnswers: Number,
        averageTimeSpent: Number
    }
}
```

## Notes

- The seed script is **idempotent**: Safe to run multiple times
- Questions are identified by `questionText` to avoid duplicates
- The script preserves existing questions and analytics data
