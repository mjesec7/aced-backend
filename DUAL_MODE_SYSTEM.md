# 🎓 Dual-Mode Learning Platform - Backend Implementation

## Overview

The ACED platform now supports **two distinct learning modes**, allowing users to choose between structured, certificate-oriented learning (School Mode) and free-form exploration (Study Centre Mode).

## 🌟 Learning Modes

### Study Centre Mode (Default)
- **Freedom**: Access all levels and content instantly
- **Flexibility**: Learn at your own pace, skip lessons, unlimited retakes
- **Features**:
  - Bookmark favorite courses
  - Create custom learning paths
  - Explore any topic without restrictions
  - No deadlines or prerequisites

### School Mode
- **Structure**: Guided curriculum with progressive unlocking
- **Certification**: Official certificates upon level completion
- **Features**:
  - Placement test for optimal starting level
  - Structured progression (unlock levels by completing previous ones)
  - Graded assignments and mandatory courses
  - Limited retakes per lesson
  - Academic tracking and progress reports

### Hybrid Mode
- **Best of Both**: Combines structured core curriculum with exploration freedom
- Allows flexibility while maintaining some structure

---

## 📁 Files Added/Modified

### New Files Created:

1. **Config & Constants**
   - `/config/platformSettings.js` - Platform-wide configuration
   - `/constants/learningModes.js` - Learning mode constants and labels

2. **Models**
   - `/models/placementTest.js` - Placement test model with adaptive algorithm

3. **Routes**
   - `/routes/learningModeRoutes.js` - All dual-mode endpoints
   - `/routes/dashboardRoutes.js` - Mode-specific dashboards

4. **Scripts**
   - `/scripts/migrate-to-dual-mode.js` - Migration script for existing users

### Modified Files:

1. **Models**
   - `/models/user.js` - Added dual-mode fields and methods
   - `/models/lesson.js` - Added mode-specific configurations

2. **Server**
   - `/server.js` - Registered new routes

---

## 🔧 API Endpoints

### Learning Mode Management

#### Get Current Mode
```http
GET /api/learning-mode/:userId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "currentMode": "study_centre",
  "modeInfo": {
    "label": "Study Centre",
    "icon": "🌟",
    "description": "Learn anything at your own pace"
  },
  "schoolProfile": { ... },
  "studyCentreProfile": { ... },
  "canSwitchMode": true
}
```

#### Switch Mode
```http
POST /api/learning-mode/:userId/switch
Authorization: Bearer <token>
Content-Type: application/json

{
  "newMode": "school",
  "reason": "Want structured learning with certificates"
}
```

---

### Placement Test

#### Start Placement Test
```http
POST /api/learning-mode/placement-test/:userId/start
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "testId": "60d5ec49f1b2c72b8c8e4f3a",
  "question": {
    "text": "Sample question",
    "options": ["A", "B", "C", "D"]
  },
  "questionNumber": 1,
  "totalQuestions": 50
}
```

#### Submit Answer
```http
POST /api/learning-mode/placement-test/:testId/answer
Authorization: Bearer <token>
Content-Type: application/json

{
  "answer": "Option A",
  "timeSpent": 25
}
```

#### Get Results
```http
GET /api/learning-mode/placement-test/:userId/results
Authorization: Bearer <token>
```

---

### School Mode Endpoints

#### Get Curriculum
```http
GET /api/learning-mode/school/:userId/curriculum
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "curriculum": [
    {
      "level": 1,
      "grade": "A1",
      "lessons": [ ... ]
    }
  ],
  "currentLevel": 3,
  "currentGrade": "A2"
}
```

#### Complete Level
```http
POST /api/learning-mode/school/:userId/complete-level
Authorization: Bearer <token>
Content-Type: application/json

{
  "level": 3,
  "score": 85,
  "certificate": "https://..."
}
```

#### Get Progress
```http
GET /api/learning-mode/school/:userId/progress
Authorization: Bearer <token>
```

---

### Study Centre Endpoints

#### Bookmark Course
```http
POST /api/learning-mode/study-centre/:userId/bookmark
Authorization: Bearer <token>
Content-Type: application/json

{
  "courseId": "60d5ec49f1b2c72b8c8e4f3a",
  "notes": "Great course on grammar"
}
```

#### Create Learning Path
```http
POST /api/learning-mode/study-centre/:userId/create-path
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My English Journey",
  "description": "Custom path for English learning",
  "courses": ["courseId1", "courseId2"]
}
```

#### Get Exploration History
```http
GET /api/learning-mode/study-centre/:userId/exploration
Authorization: Bearer <token>
```

---

### Dashboard

#### Get Dashboard
```http
GET /api/dashboard/:userId
Authorization: Bearer <token>
```

Returns different dashboard data based on user's mode:
- **School Mode**: Shows current level, grades, mandatory courses, deadlines
- **Study Centre**: Shows bookmarks, exploration history, recommendations
- **Hybrid**: Shows both dashboards

#### Get Statistics
```http
GET /api/dashboard/:userId/stats
Authorization: Bearer <token>
```

---

## 💾 Database Schema Updates

### User Model Extensions

```javascript
{
  // Dual-Mode Fields
  learningMode: String, // 'study_centre', 'school', 'hybrid'

  // School Profile
  schoolProfile: {
    placementTestTaken: Boolean,
    placementTestDate: Date,
    placementTestResults: Object,
    currentGrade: String, // 'A1', 'A2', 'B1', etc.
    currentLevelCap: Number,
    accessibleLevels: [Number],
    completedLevels: [Object],
    mandatoryCourses: [Object]
  },

  // Study Centre Profile
  studyCentreProfile: {
    explorationHistory: [Object],
    bookmarkedCourses: [Object],
    personalPaths: [Object],
    preferences: Object
  },

  // History
  modeHistory: [Object],
  achievements: [Object]
}
```

### Lesson Model Extensions

```javascript
{
  // Mode Restrictions
  modeRestrictions: {
    schoolOnly: Boolean,
    studyCentreOnly: Boolean,
    schoolRequirements: {
      prerequisiteLessons: [ObjectId],
      minimumGrade: String,
      mustCompleteInOrder: Boolean
    },
    studyCentreFeatures: {
      allowSkipping: Boolean,
      showHints: Boolean,
      unlimitedAttempts: Boolean
    }
  },

  // Difficulty Variants
  difficultyVariants: {
    simplified: { content: Mixed },
    standard: { content: Mixed },
    advanced: { content: Mixed }
  }
}
```

---

## 🔄 Migration

### Running the Migration

To migrate existing users to the dual-mode system:

```bash
# Run migration
node scripts/migrate-to-dual-mode.js

# Rollback if needed
node scripts/migrate-to-dual-mode.js rollback
```

### Migration Logic

1. **Default Mode**: Sets users to 'study_centre' by default
2. **School Mode Assignment**: Users with active subscriptions AND progress are set to 'school' mode
3. **Level Calculation**: Determines user's current level based on completed lessons
4. **Profile Initialization**: Creates appropriate profiles for each mode

---

## 🎯 User Model Methods

### Mode Management

```javascript
// Switch learning mode
await user.switchMode('school', 'Want structured learning');

// Check level access
user.canAccessLevel(5); // Returns true/false

// Complete a level (school mode)
await user.completeLevel(3, 85, 'certificate-url');

// Record placement test
await user.recordPlacementTest(testResults);
```

### Study Centre Methods

```javascript
// Add bookmark
await user.addBookmark(courseId, 'Great course!');

// Create personal path
await user.createPersonalPath('My Path', 'Description', [courseIds]);
```

---

## 🎓 Lesson Model Methods

### Content Delivery

```javascript
// Get appropriate content for user
const content = lesson.getContentForUser(user);
// Returns different content based on user's mode and grade

// Check access
const accessCheck = lesson.canUserAccess(user);
// Returns { canAccess: true/false, reason: '...' }
```

---

## 📊 Level to Grade Mapping

```javascript
const levelGradeMapping = {
  1-3: 'A1',    // Beginner
  4-6: 'A2',    // Elementary
  7-9: 'B1',    // Intermediate
  10-12: 'B2',  // Upper Intermediate
  13-15: 'C1',  // Advanced
  16-18: 'C2',  // Proficient
  19: 'Expert',
  20: 'Master'
}
```

---

## 🛡️ Access Control

### Lesson Access Middleware

The `checkLessonAccess` middleware is available for routes that need access control:

```javascript
const { checkLessonAccess } = require('./routes/learningModeRoutes');

router.get('/api/lessons/:lessonId/user/:userId',
  checkLessonAccess,
  getLessonController
);
```

This middleware:
- Checks user's learning mode
- Verifies level access
- Validates prerequisites
- Returns appropriate error messages

---

## 🎨 Frontend Integration

### Mode Detection

```javascript
// Get user's current mode
const response = await fetch('/api/learning-mode/:userId');
const { currentMode } = await response.json();

// Render appropriate UI based on mode
if (currentMode === 'school') {
  // Show structured curriculum, progress bars, deadlines
} else {
  // Show exploration interface, all levels accessible
}
```

### Dashboard Integration

```javascript
const dashboard = await fetch('/api/dashboard/:userId');
const data = await dashboard.json();

// Data structure varies by mode
if (data.mode === 'school') {
  // Use data.dashboard.currentLevel, .progress, .achievements
} else {
  // Use data.dashboard.exploration, .bookmarks, .recommendations
}
```

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] User can switch between modes
- [ ] Placement test works and assigns correct level
- [ ] School mode locks higher levels
- [ ] Study centre allows access to all content
- [ ] Dashboard shows appropriate data for each mode
- [ ] Bookmarks work in study centre mode
- [ ] Level completion unlocks next level in school mode
- [ ] Migration script works without errors

---

## 📝 Configuration

### Platform Settings

Edit `/config/platformSettings.js` to customize:

```javascript
{
  dualMode: {
    enabled: true,
    defaultMode: 'study_centre',
    allowModeSwitch: true
  },

  schoolMode: {
    minPassingScore: 70,
    maxRetakes: 2,
    requiredCoursesPerLevel: 5
  },

  placementTest: {
    questions: 50,
    timeLimit: 45,
    adaptive: true
  }
}
```

---

## 🚀 Deployment Notes

1. **Database Migration**: Run migration script before deploying
2. **Existing Users**: Will default to 'study_centre' mode
3. **Backward Compatibility**: All existing APIs remain functional
4. **New Routes**: New endpoints under `/api/learning-mode` and `/api/dashboard`

---

## 📚 Additional Resources

- Platform Settings: `/config/platformSettings.js`
- Learning Mode Constants: `/constants/learningModes.js`
- Migration Script: `/scripts/migrate-to-dual-mode.js`

---

## 🤝 Support

For questions or issues with the dual-mode system, please refer to:
- API documentation above
- Model method documentation in code
- Migration script logs

---

**Last Updated**: 2025-11-13
**Version**: 1.0.0
