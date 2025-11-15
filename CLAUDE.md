# CLAUDE.md - AI Assistant Guide for ACED Backend

> **Last Updated:** 2025-11-15
> **Purpose:** Comprehensive guide for AI assistants working with the ACED backend codebase

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Directory Structure](#directory-structure)
4. [Key Patterns & Conventions](#key-patterns--conventions)
5. [Development Workflow](#development-workflow)
6. [Important Files Reference](#important-files-reference)
7. [Common Tasks & Operations](#common-tasks--operations)
8. [Testing & Deployment](#testing--deployment)
9. [Security Considerations](#security-considerations)
10. [Best Practices for AI Assistants](#best-practices-for-ai-assistants)

---

## Project Overview

**ACED Backend** is a comprehensive educational platform backend built with Node.js and Express. It features:

- **Dual-Mode Learning System**: Study Centre (self-paced) and School (structured curriculum) modes
- **Adaptive Placement Testing**: AI-powered level assessment across 10 subjects
- **AI Integration**: OpenAI GPT-4o for contextual learning assistance
- **Multi-Payment Gateway**: PayMe and Multicard (Uzbekistan) integration
- **Gamification**: Points, badges, achievements, and progress tracking
- **Subscription Management**: 4-tier system (free, start, pro, premium)

### Core Features

1. **Adaptive Learning**: 20+ step types, difficulty variants, personalized paths
2. **Progress Tracking**: Detailed analytics, medals, streaks, achievements
3. **AI Chat**: Context-aware lesson help with usage tracking
4. **Payment Processing**: Complete integration with PayMe (JSON-RPC) and Multicard (REST)
5. **Content Management**: Subjects, topics, lessons, homework, tests, vocabulary

---

## Technology Stack

### Core Technologies

```json
{
  "runtime": "Node.js >=18",
  "framework": "Express.js 4.21.2",
  "database": "MongoDB 4.0 + Mongoose 8.12.1",
  "authentication": "Firebase Admin SDK 13.2.0",
  "ai": "OpenAI API 5.13.1"
}
```

### Key Dependencies

- **Security**: helmet, cors, express-basic-auth
- **Payments**: Custom PayMe/Multicard integrations
- **Email**: nodemailer
- **Web Scraping**: puppeteer, cheerio
- **File Processing**: multer, pdfkit, html-pdf
- **Utilities**: axios, dotenv, compression

### Architecture Pattern

**MVC with Service Layer**
```
Request → Middleware → Route → Controller → Service → Model → Database
         ↑                                               ↓
         Authentication                            Response
```

---

## Directory Structure

```
aced-backend/
├── config/                    # Configuration files
│   ├── firebase.js           # Firebase Admin SDK setup with validation
│   ├── platformSettings.js   # Dual-mode learning configuration
│   ├── database.js           # MongoDB connection config
│   ├── cors.js              # CORS policy configuration
│   ├── middlewares.js       # Global middleware setup
│   ├── errorHandlers.js     # Centralized error handling
│   └── staticFiles.js       # Static file serving config
│
├── constants/                 # Application constants
│   └── learningModes.js      # Learning mode definitions & settings
│
├── controllers/              # Business logic layer
│   ├── authController.js    # Authentication operations
│   ├── chatController.js    # AI chat with usage tracking
│   ├── homeworkController.js
│   ├── lessonController.js
│   ├── multicardController.js  # Multicard payment processing
│   ├── paymentController.js    # PayMe payment processing
│   ├── recommendationController.js
│   ├── testController.js
│   └── userProgressController.js
│
├── middlewares/              # Request processors
│   ├── authMiddleware.js    # Firebase token verification (CRITICAL)
│   ├── loopPrevention.js    # Infinite loop prevention
│   └── requestLogger.js     # Request logging
│
├── models/                   # Database schemas (Mongoose)
│   ├── user.js              # 764 lines - Comprehensive user model
│   ├── lesson.js            # 866 lines - Enhanced lesson model
│   ├── userProgress.js      # 659 lines - Progress tracking
│   ├── paymeTransaction.js  # 658 lines - PayMe integration
│   ├── promoCode.js         # 465 lines - Promocode management
│   ├── placementTest.js     # 332 lines - Adaptive testing
│   ├── topic.js             # 259 lines - Multilingual topics
│   ├── MulticardTransaction.js  # 158 lines - Multicard tracking
│   ├── subject.js
│   ├── question.js
│   ├── homework.js
│   ├── Test.js
│   ├── TestResult.js
│   ├── vocabulary.js
│   ├── aiUsage.js
│   └── UserActivity.js
│
├── routes/                   # API route definitions
│   └── (Feature-based route files)
│
├── scripts/                  # Utility scripts
│   ├── seedQuestions.js     # Seed placement test questions
│   ├── testPlacementTest.js # Test placement functionality
│   ├── fetchHarvardWithPuppeteer.js  # Content scraping
│   └── migrate-to-dual-mode.js  # Database migration
│
├── seedData/                 # Seed data files
│   └── (JSON files for seeding)
│
├── services/                 # Business logic services
│   └── (Service layer implementations)
│
├── utils/                    # Utility functions
│   └── (Helper functions)
│
├── uploads/                  # User-uploaded files (CDN-served)
│
├── dist/                     # Frontend build (if exists)
│
├── server.js                 # Main entry point (337 lines)
├── models.js                 # Model exports
└── package.json             # Dependencies & scripts
```

### Important Documentation Files

- **DUAL_MODE_SYSTEM.md** - Complete dual-mode learning guide
- **PLACEMENT_TEST_README.md** - Placement test documentation
- **QUICKSTART.md** - 2-minute deployment guide
- **FRONTEND_GUIDE.md** - Frontend integration guide
- **DEPLOYMENT.md** - Deployment instructions
- **WEB_SEED_README.md** - Web-based seeding guide

---

## Key Patterns & Conventions

### Coding Standards

#### Naming Conventions
```javascript
// Variables and functions: camelCase
const userId = req.params.userId;
async function getUserProfile() {}

// Models and classes: PascalCase
const User = require('./models/user');
class PaymeAPI {}

// Routes: kebab-case
router.get('/api/learning-mode/:userId', ...);

// Constants: UPPER_SNAKE_CASE
const PLACEMENT_TEST_QUESTIONS = 50;
```

#### Error Handling Pattern
```javascript
// Controller pattern
try {
  const result = await someOperation();
  res.json({ success: true, data: result });
} catch (error) {
  console.error('Operation failed:', error);
  res.status(500).json({
    success: false,
    error: error.message
  });
}
```

#### HTTP Status Codes
- **200** - Success
- **400** - Bad request (validation errors)
- **401** - Unauthorized (missing/invalid token)
- **403** - Forbidden (valid token but insufficient permissions)
- **404** - Not found
- **429** - Rate limit exceeded
- **500** - Server error

### Database Patterns

#### Model Structure
```javascript
// Schema definition
const schema = new mongoose.Schema({
  field: { type: String, required: true },
  // ... fields
}, { timestamps: true });

// Virtual fields (computed properties)
schema.virtual('displayName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Instance methods (operations on single document)
schema.methods.updateProgress = async function(data) {
  // this refers to the document
};

// Static methods (queries and operations on collection)
schema.statics.findByEmail = async function(email) {
  return this.findOne({ email });
};

// Pre/post hooks
schema.pre('save', async function(next) {
  // Validation or transformation before save
  next();
});
```

#### Query Patterns
```javascript
// Always use async/await
const user = await User.findById(userId);

// Populate related documents
const lesson = await Lesson.findById(lessonId)
  .populate('subject')
  .populate('topic');

// Lean queries for read-only operations (faster)
const users = await User.find({ active: true }).lean();

// Pagination
const results = await Model.find(query)
  .skip((page - 1) * limit)
  .limit(limit)
  .sort({ createdAt: -1 });
```

### Authentication Pattern

```javascript
// Routes requiring authentication
router.get('/protected', authMiddleware, async (req, res) => {
  // req.user contains decoded Firebase token
  const userId = req.user.uid;
  // ... operation
});

// Public routes (add to authMiddleware.js public paths)
const publicPaths = [
  '/api/payments/multicard/webhook',
  '/api/payments/payme',
  '/health'
];
```

### Response Format

```javascript
// Success response
{
  "success": true,
  "data": { /* result */ }
}

// Error response
{
  "success": false,
  "error": "Error message"
}

// List response with pagination
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

---

## Development Workflow

### Environment Setup

1. **Clone and Install**
```bash
git clone <repository-url>
cd aced-backend
npm install
```

2. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with required values
```

**Required Environment Variables:**
```bash
# Database
MONGO_URI=mongodb://localhost:27017/aced

# Firebase (CRITICAL - must match exactly)
FIREBASE_PROJECT_ID=aced-9cf72
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY="<private-key>"

# OpenAI
OPENAI_API_KEY=sk-...

# PayMe
PAYME_MERCHANT_ID=<merchant-id>
PAYME_MERCHANT_KEY=<secret-key>

# Multicard
MULTICARD_MERCHANT_ID=<merchant-id>
MULTICARD_SECRET_KEY=<secret-key>
MULTICARD_SERVICE_ID=<service-id>

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

3. **Start Development Server**
```bash
npm run dev  # Uses nodemon for auto-reload
```

### Available Scripts

```bash
npm run dev              # Development with auto-reload
npm start               # Production server
npm run fetch:harvard   # Scrape Harvard content
npm run seed:questions  # Seed placement test questions
npm run test:placement  # Test placement test functionality
npm run deploy:placement # Seed and test (for deployment)
```

### Git Workflow

1. **Create Feature Branch**
```bash
git checkout -b claude/<feature-name>-<session-id>
```

2. **Make Changes**
```bash
# Edit files
git add .
git commit -m "Clear, descriptive message"
```

3. **Push Changes**
```bash
git push -u origin claude/<feature-name>-<session-id>
```

4. **Create Pull Request**
```bash
# Use GitHub UI or gh CLI
gh pr create --title "Feature: Description" --body "Details"
```

### Common Development Tasks

#### Adding a New Route

1. Create route file in `/routes/`
```javascript
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    // Implementation
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

2. Mount route in `server.js`
```javascript
const newRoutes = require('./routes/newRoutes');
app.use('/api/new-feature', newRoutes);
```

#### Adding a New Model

1. Create model file in `/models/`
```javascript
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  // Fields
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add indexes for performance
schema.index({ userId: 1, createdAt: -1 });

// Add methods
schema.methods.instanceMethod = async function() {};
schema.statics.staticMethod = async function() {};

module.exports = mongoose.model('ModelName', schema);
```

2. Export in `models.js` if needed

#### Adding a New Controller

1. Create controller file in `/controllers/`
```javascript
const Model = require('../models/Model');

exports.getItems = async (req, res) => {
  try {
    const items = await Model.find({ userId: req.user.uid });
    res.json({ success: true, data: items });
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createItem = async (req, res) => {
  try {
    const item = new Model({ ...req.body, userId: req.user.uid });
    await item.save();
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
```

---

## Important Files Reference

### server.js (337 lines) - Main Entry Point

**Structure:**
```javascript
// Lines 1-21: Dependencies and initialization
// Lines 22-35: Security middleware (Helmet, Compression)
// Lines 37-75: CORS configuration
// Lines 78-96: MongoDB connection with auto-reconnect
// Lines 99-115: Health check endpoints
// Lines 118-147: File upload configuration (Multer)
// Lines 150-288: Route mounting (organized by feature)
// Lines 291-309: Error handlers (404 and global)
// Lines 312-323: Frontend serving (/dist folder)
// Lines 325-337: Server startup
```

**Key Sections:**
- **CORS Setup**: Dynamic origins from env variable
- **Database**: Connection pooling, auto-reconnect
- **Routes**: Mounted in specific order (auth first, then payments)
- **Error Handling**: API 404s and global error handler
- **Frontend**: SPA fallback for client-side routing

### models/user.js (764 lines) - User Model

**Critical Fields:**
```javascript
{
  firebaseUid: String,          // Firebase auth ID
  email: String,                // User email
  subscriptionType: String,     // free|start|pro|premium
  subscriptionExpiry: Date,     // Subscription end date
  learningMode: String,         // study_centre|school|hybrid
  aiUsageByMonth: [{            // AI usage tracking
    month: String,              // YYYY-MM format
    messagesSent: Number,
    imagesGenerated: Number
  }],
  schoolProfile: {              // School mode data
    hasCompletedPlacementTest: Boolean,
    assignedLevel: Number,      // 1-20
    currentLevel: Number,
    gradeLevel: String,         // A1-Master
    completedLevels: [Number]
  },
  studyCentreProfile: {         // Study centre data
    bookmarkedCourses: [ObjectId],
    personalLearningPaths: [Object],
    explorationHistory: [Object]
  },
  savedCards: [{                // Payment cards
    cardToken: String,
    cardNumber: String,
    expiryDate: String
  }]
}
```

**Key Methods:**
```javascript
// Instance methods (40+)
user.updateSubscription(type, months, currency)
user.checkCanSendAIMessage()
user.incrementAIUsage(type)
user.switchLearningMode(newMode)
user.completeSchoolLevel(level)
user.addBookmark(courseId)
user.addPersonalLearningPath(path)
```

### models/lesson.js (866 lines) - Lesson Model

**Step Types (20 total):**
```javascript
[
  'introduction', 'explanation', 'example', 'exercise',
  'quiz', 'interactive', 'video', 'audio', 'reading',
  'writing', 'speaking', 'listening', 'grammar',
  'vocabulary', 'pronunciation', 'culture', 'game',
  'project', 'assessment', 'review'
]
```

**Key Features:**
- Adaptive learning configuration per student
- Difficulty variants (simplified, standard, advanced)
- Gamification (points, badges, achievements)
- Mode-specific restrictions
- Analytics per step type
- Multilingual support

### models/userProgress.js (659 lines) - Progress Tracking

**Progress Calculation:**
```javascript
// Medal assignment based on performance
calculateMedal(accuracyPercentage) {
  if (accuracyPercentage >= 95) return 'gold';
  if (accuracyPercentage >= 85) return 'silver';
  if (accuracyPercentage >= 70) return 'bronze';
  return 'none';
}

// Static methods for aggregation
UserProgress.getTopicStats(userId, topicId)
UserProgress.getUserOverallStats(userId)
```

### middlewares/authMiddleware.js - Authentication

**CRITICAL: Firebase Project ID Validation**
```javascript
// Must match exactly: aced-9cf72
if (decodedToken.firebase.sign_in_provider &&
    decodedToken.firebase.tenant !== 'aced-9cf72') {
  return res.status(403).json({
    error: 'Invalid Firebase project'
  });
}
```

**Public Paths** (no auth required):
```javascript
const publicPaths = [
  '/api/payments/multicard/webhook',
  '/api/payments/payme',
  '/health',
  '/api/health'
];
```

### config/platformSettings.js - Platform Configuration

```javascript
module.exports = {
  dualMode: {
    enabled: true,
    defaultMode: 'study_centre',
    allowModeSwitch: true
  },
  placementTest: {
    totalQuestions: 50,
    timeLimit: 45,
    adaptive: true,
    passingScore: 60
  },
  schoolMode: {
    minPassingScore: 70,
    maxRetakes: 2,
    requiredCoursesPerLevel: 5,
    certificateThreshold: 80
  },
  levelGradeMapping: {
    '1-3': 'A1',
    '4-6': 'A2',
    '7-9': 'B1',
    '10-12': 'B2',
    '13-15': 'C1',
    '16-18': 'C2',
    '19': 'Expert',
    '20': 'Master'
  }
};
```

---

## Common Tasks & Operations

### Working with Users

#### Get User by Firebase UID
```javascript
const user = await User.findOne({ firebaseUid: req.user.uid });
if (!user) {
  return res.status(404).json({
    success: false,
    error: 'User not found'
  });
}
```

#### Update Subscription
```javascript
await user.updateSubscription('pro', 1, 'UZS');
await user.save();
```

#### Check AI Usage
```javascript
const canSend = await user.checkCanSendAIMessage('text');
if (!canSend.allowed) {
  return res.status(429).json({
    success: false,
    error: canSend.reason
  });
}
```

### Working with Lessons

#### Get Lesson with Progress
```javascript
const lesson = await Lesson.findById(lessonId)
  .populate('subject')
  .populate('topic');

const progress = await UserProgress.findOne({
  userId: user._id,
  lessonId: lesson._id
});

res.json({
  success: true,
  data: { lesson, progress }
});
```

#### Track Step Completion
```javascript
progress.completedSteps.push({
  stepId: stepId,
  stepType: 'exercise',
  timeSpent: 120,
  attemptsCount: 2,
  isCorrect: true,
  accuracyPercentage: 95
});

progress.overallAccuracy = calculateOverallAccuracy(progress);
progress.medal = progress.calculateMedal(progress.overallAccuracy);
await progress.save();
```

### Working with Placement Tests

#### Start Placement Test
```javascript
const test = new PlacementTest({
  userId: user._id,
  subjectId: subjectId,
  status: 'in_progress',
  startedAt: new Date()
});
await test.save();

// Get first adaptive question
const question = await test.getNextQuestion();
```

#### Submit Answer
```javascript
await test.submitAnswer(questionId, selectedAnswer);
// Automatically adjusts difficulty for next question
```

#### Complete Test
```javascript
await test.complete();
const results = await test.generateResults();
// Returns level assignment, strengths, weaknesses
```

### Working with Payments

#### PayMe Flow
```javascript
// 1. Initiate payment
const transaction = new PaymeTransaction({
  userId: user._id,
  amount: planPrice,
  state: PaymeTransaction.STATES.CREATED
});
await transaction.save();

// 2. Generate checkout URL
const checkoutUrl = transaction.generatePaymeCheckoutUrl();

// 3. Webhook handles state transitions
// CheckPerformTransaction → CreateTransaction →
// PerformTransaction (completes payment)

// 4. On success, update subscription
await user.updateSubscription(planType, months, 'UZS');
```

#### Multicard Flow
```javascript
// 1. Initiate payment
const response = await axios.post(
  'https://api.multicard.uz/v1/payment/create',
  {
    amount: amount * 100, // in tyiyn
    order_id: orderId,
    return_url: returnUrl
  },
  { headers: { Authorization: `Bearer ${token}` } }
);

// 2. Redirect user to checkout_url
// 3. Webhook receives payment status
// 4. Update subscription on success
```

### Working with AI Chat

#### Send AI Message
```javascript
// 1. Check usage limits
const canSend = await user.checkCanSendAIMessage('text');
if (!canSend.allowed) {
  return res.status(429).json({ error: canSend.reason });
}

// 2. Call OpenAI
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: conversationHistory,
  temperature: 0.7
});

// 3. Track usage
await user.incrementAIUsage('message');

// 4. Return response
res.json({
  success: true,
  data: { message: completion.choices[0].message.content }
});
```

---

## Testing & Deployment

### Local Testing

#### Manual API Testing
```bash
# Health check
curl http://localhost:5000/health

# Protected endpoint (requires Firebase token)
curl -H "Authorization: Bearer <firebase-token>" \
     http://localhost:5000/api/user/profile
```

#### Database Operations
```bash
# Connect to MongoDB
mongosh <MONGO_URI>

# Useful queries
db.users.find({ subscriptionType: 'pro' })
db.lessons.countDocuments({ subject: ObjectId('...') })
db.userprogresses.aggregate([...])
```

#### Seed Data
```bash
# Seed placement test questions (200 questions)
npm run seed:questions

# Test placement test functionality
npm run test:placement

# Combined (deployment prep)
npm run deploy:placement
```

### Deployment

#### Pre-Deployment Checklist
- [ ] All environment variables set in production
- [ ] MongoDB Atlas connection string configured
- [ ] Firebase service account credentials added
- [ ] OpenAI API key configured
- [ ] Payment gateway credentials verified
- [ ] ALLOWED_ORIGINS includes production domain
- [ ] Port configuration (uses process.env.PORT)
- [ ] Database indexes created
- [ ] Placement test questions seeded

#### Environment-Specific Settings

**Development:**
```bash
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/aced
ALLOWED_ORIGINS=http://localhost:3000
```

**Production:**
```bash
NODE_ENV=production
MONGO_URI=mongodb+srv://...  # MongoDB Atlas
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

#### Heroku Deployment
```bash
# Create Heroku app
heroku create aced-backend

# Set config vars
heroku config:set MONGO_URI=<value>
heroku config:set FIREBASE_PROJECT_ID=aced-9cf72
# ... set all env vars

# Deploy
git push heroku main

# View logs
heroku logs --tail

# Run migrations
heroku run npm run seed:questions
```

#### Health Monitoring
```bash
# Check health endpoint
curl https://yourdomain.com/health

# Response should be:
{
  "status": "OK",
  "database": "Connected",
  "timestamp": "2025-11-15T..."
}
```

---

## Security Considerations

### Critical Security Points

#### 1. Firebase Authentication
```javascript
// CRITICAL: Always validate Firebase project ID
if (decodedToken.firebase.tenant !== 'aced-9cf72') {
  throw new Error('Invalid Firebase project');
}
```

#### 2. Environment Variables
```bash
# NEVER commit these to git
FIREBASE_PRIVATE_KEY="..."
PAYME_MERCHANT_KEY="..."
MULTICARD_SECRET_KEY="..."
OPENAI_API_KEY="..."
```

#### 3. Input Validation
```javascript
// Always validate and sanitize user input
const { error, value } = schema.validate(req.body);
if (error) {
  return res.status(400).json({ error: error.details[0].message });
}
```

#### 4. Rate Limiting
```javascript
// AI usage limits enforced at model level
const limits = {
  free: { messages: 50, images: 5 },
  start: { messages: Infinity, images: 20 },
  pro: { messages: Infinity, images: Infinity }
};
```

#### 5. Payment Security
```javascript
// PayMe: Verify merchant key in all requests
// Multicard: Validate webhook signatures
// Always use HTTPS for payment callbacks
```

### Common Vulnerabilities to Avoid

❌ **DON'T:**
- Store sensitive data in logs
- Return detailed error messages to clients in production
- Trust user input without validation
- Use eval() or similar dynamic code execution
- Expose internal IDs in public APIs
- Skip authentication checks on "internal" routes

✅ **DO:**
- Use parameterized queries (Mongoose does this automatically)
- Implement rate limiting on expensive operations
- Validate all input on both client and server
- Use HTTPS in production
- Keep dependencies updated
- Use environment variables for secrets
- Implement proper CORS policies

---

## Best Practices for AI Assistants

### Code Modification Guidelines

#### 1. Always Read Before Writing
```javascript
// ❌ DON'T create files blindly
Write({ file_path: './new-feature.js', content: '...' })

// ✅ DO read existing code first
Read({ file_path: './existing-feature.js' })
// Then make informed changes
Edit({ file_path: './existing-feature.js', ... })
```

#### 2. Maintain Existing Patterns
```javascript
// If existing controllers use this pattern:
exports.getItems = async (req, res) => {
  try {
    // ...
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Follow the same pattern in new controllers
```

#### 3. Preserve Error Handling
```javascript
// Existing pattern in codebase:
try {
  const result = await operation();
  res.json({ success: true, data: result });
} catch (error) {
  console.error('Operation failed:', error);
  res.status(500).json({ success: false, error: error.message });
}

// Always include success/error flags and proper status codes
```

#### 4. Follow Model Conventions
```javascript
// When adding to models, follow existing structure:

// Schema definition
const schema = new mongoose.Schema({
  // Fields with proper types and validation
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
schema.index({ userId: 1, createdAt: -1 });

// Instance methods for document operations
schema.methods.operation = async function() {};

// Static methods for collection operations
schema.statics.query = async function() {};
```

### Task Planning Approach

#### For New Features:
1. **Understand Requirements**: Read related documentation
2. **Explore Existing Code**: Use Grep/Glob to find similar implementations
3. **Plan Architecture**: Identify models, routes, controllers needed
4. **Create Todo List**: Use TodoWrite to track tasks
5. **Implement Incrementally**: One component at a time
6. **Test Each Component**: Verify before moving to next
7. **Update Documentation**: Keep CLAUDE.md current

#### For Bug Fixes:
1. **Reproduce the Issue**: Understand the problem
2. **Locate the Code**: Use Grep to find relevant files
3. **Analyze Root Cause**: Read surrounding context
4. **Implement Fix**: Minimal changes to address root cause
5. **Verify Fix**: Test the specific scenario
6. **Check Side Effects**: Ensure no regressions

#### For Refactoring:
1. **Read Current Implementation**: Understand existing logic
2. **Identify Patterns**: Look for code duplication
3. **Plan Refactoring**: Define new structure
4. **Refactor Incrementally**: Small, testable changes
5. **Maintain Backwards Compatibility**: Don't break existing APIs
6. **Update Tests**: Ensure coverage

### Common Mistakes to Avoid

#### ❌ Mistake: Creating unnecessary files
```javascript
// Don't create README.md, GUIDE.md, etc. unless explicitly requested
Write({ file_path: './NEW_FEATURE_GUIDE.md', ... })
```

#### ✅ Better: Update existing documentation
```javascript
// Update this CLAUDE.md file instead
Edit({ file_path: './CLAUDE.md', ... })
```

#### ❌ Mistake: Breaking existing patterns
```javascript
// Don't introduce new response formats
res.json({ result: data }); // Inconsistent with codebase
```

#### ✅ Better: Follow established patterns
```javascript
// Use existing response format
res.json({ success: true, data: result });
```

#### ❌ Mistake: Ignoring authentication
```javascript
// Don't create unprotected routes for sensitive operations
router.post('/delete-user', async (req, res) => { ... });
```

#### ✅ Better: Always add authentication
```javascript
router.post('/delete-user', authMiddleware, async (req, res) => { ... });
```

#### ❌ Mistake: Committing without being asked
```javascript
// Don't auto-commit changes
Bash({ command: 'git add . && git commit -m "..." && git push' })
```

#### ✅ Better: Only commit when explicitly requested
```javascript
// Wait for user to say "commit these changes"
// Then follow the proper git workflow
```

### Integration Points to Remember

#### 1. Adding New Routes
- Mount in `server.js` in appropriate section
- Add authentication middleware if needed
- Follow existing route patterns
- Test with Postman/curl before committing

#### 2. Adding New Models
- Create in `/models/` directory
- Export in `models.js` if needed by multiple files
- Add indexes for frequently queried fields
- Include timestamps: `{ timestamps: true }`

#### 3. Adding New Controllers
- Create in `/controllers/` directory
- Import required models
- Use async/await consistently
- Include proper error handling

#### 4. Modifying Authentication
- Update `middlewares/authMiddleware.js`
- Test public paths still work
- Verify Firebase project ID validation
- Don't break existing auth flow

#### 5. Adding New Dependencies
- Install with `npm install <package>`
- Update package.json (npm does this automatically)
- Document usage in this file if significant
- Consider security implications

### File Organization Best Practices

```
When creating new functionality:

1. Model first (/models/feature.js)
   ↓
2. Controller next (/controllers/featureController.js)
   ↓
3. Routes last (/routes/featureRoutes.js)
   ↓
4. Mount in server.js
   ↓
5. Test and verify
```

### Documentation Updates

When making significant changes, update:
- [ ] This CLAUDE.md file (especially if patterns change)
- [ ] Relevant markdown docs (DUAL_MODE_SYSTEM.md, etc.)
- [ ] Code comments for complex logic
- [ ] API endpoint documentation if applicable

---

## Quick Reference

### Important File Locations

| Purpose | Location | Lines | Key Info |
|---------|----------|-------|----------|
| Main entry | `server.js` | 337 | Route mounting, middleware setup |
| User model | `models/user.js` | 764 | 40+ methods, subscription logic |
| Lesson model | `models/lesson.js` | 866 | 20 step types, adaptive learning |
| Progress tracking | `models/userProgress.js` | 659 | Medal calculation, statistics |
| PayMe integration | `models/paymeTransaction.js` | 658 | JSON-RPC implementation |
| Placement testing | `models/placementTest.js` | 332 | Adaptive algorithm |
| Promocodes | `models/promoCode.js` | 465 | Usage tracking, analytics |
| Authentication | `middlewares/authMiddleware.js` | ~150 | Firebase validation |
| Platform config | `config/platformSettings.js` | ~100 | Dual-mode settings |
| Learning modes | `constants/learningModes.js` | ~200 | Mode definitions |

### Environment Variables Quick Reference

```bash
# Core
MONGO_URI=                    # MongoDB connection string
NODE_ENV=                     # development|production
PORT=                         # Server port (default: 5000)

# Firebase (CRITICAL)
FIREBASE_PROJECT_ID=aced-9cf72        # Must match exactly
FIREBASE_CLIENT_EMAIL=                # Service account email
FIREBASE_PRIVATE_KEY=                 # Service account key

# AI
OPENAI_API_KEY=               # OpenAI API key

# Payments
PAYME_MERCHANT_ID=            # PayMe merchant ID
PAYME_MERCHANT_KEY=           # PayMe secret key
MULTICARD_MERCHANT_ID=        # Multicard merchant ID
MULTICARD_SECRET_KEY=         # Multicard secret
MULTICARD_SERVICE_ID=         # Multicard service ID

# Security
ALLOWED_ORIGINS=              # Comma-separated origins
```

### Common Commands

```bash
# Development
npm run dev                   # Start with nodemon
npm start                     # Start production

# Database
npm run seed:questions        # Seed 200 questions
npm run test:placement        # Test placement system
npm run deploy:placement      # Seed + test

# Content
npm run fetch:harvard         # Scrape Harvard content

# Git (for AI assistants)
git status                    # Check status
git add .                     # Stage changes
git commit -m "message"       # Commit with message
git push -u origin <branch>   # Push to branch
```

### Key Constants

```javascript
// Subscription Types
['free', 'start', 'pro', 'premium']

// Learning Modes
['study_centre', 'school', 'hybrid']

// Grade Levels
['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Expert', 'Master']

// Medal Types
['none', 'bronze', 'silver', 'gold']

// Lesson Step Types (20 total)
['introduction', 'explanation', 'example', 'exercise', 'quiz', ...]

// PayMe Transaction States
['created', 'waiting', 'completed', 'cancelled', 'cancelled_after_complete']
```

---

## Version History

| Date | Changes | Updated By |
|------|---------|------------|
| 2025-11-15 | Initial comprehensive documentation | Claude (Sonnet 4.5) |

---

## Additional Resources

- **Official Docs**: See `/` directory for feature-specific guides
- **API Documentation**: Available in respective route files
- **Model Schemas**: Check `/models/` for detailed field definitions
- **Example Implementations**: Review controllers for usage patterns

---

**Note to AI Assistants**: This document should be updated whenever significant architectural changes are made to the codebase. When in doubt, read the existing code to understand current patterns before implementing new features.
