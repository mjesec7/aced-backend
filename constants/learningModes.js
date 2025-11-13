// constants/learningModes.js - Learning Mode Constants

const LEARNING_MODES = {
  STUDY_CENTRE: 'study_centre',
  SCHOOL: 'school',
  HYBRID: 'hybrid'
};

const MODE_LABELS = {
  study_centre: {
    label: 'Study Centre',
    icon: '🌟',
    description: 'Learn anything at your own pace - unlimited access to all levels',
    color: '#4CAF50',
    features: [
      'Access all levels instantly',
      'Learn at your own pace',
      'No deadlines or restrictions',
      'Unlimited retakes',
      'Create custom learning paths'
    ]
  },
  school: {
    label: 'School Mode',
    icon: '🎓',
    description: 'Structured curriculum with certificates and guided progression',
    color: '#2196F3',
    features: [
      'Structured learning path',
      'Graded assignments',
      'Official certificates',
      'Progress tracking',
      'Mandatory courses'
    ]
  },
  hybrid: {
    label: 'Hybrid Mode',
    icon: '🔄',
    description: 'Mix of structured learning with exploration freedom',
    color: '#FF9800',
    features: [
      'Structured core curriculum',
      'Free exploration time',
      'Flexible deadlines',
      'Optional certifications'
    ]
  }
};

const SCHOOL_SETTINGS = {
  MIN_PASS: 70,
  MAX_RETAKES: 2,
  LOCK_PROGRESSION: true,
  CERTIFICATE_THRESHOLD: 85,
  REQUIRED_COURSES_PER_LEVEL: 5
};

const PLACEMENT_TEST_CONFIG = {
  TOTAL_QUESTIONS: 50,
  TIME_LIMIT: 45, // minutes
  STARTING_DIFFICULTY: 5,
  DIFFICULTY_RANGE: { MIN: 1, MAX: 10 },
  SUBJECTS: ['English', 'Mathematics', 'Science', 'History', 'Geography'],
  QUESTION_TYPES: ['multiple-choice', 'true-false', 'fill-blank']
};

const GRADE_LEVELS = {
  A1: { min: 1, max: 3, label: 'Beginner' },
  A2: { min: 4, max: 6, label: 'Elementary' },
  B1: { min: 7, max: 9, label: 'Intermediate' },
  B2: { min: 10, max: 12, label: 'Upper Intermediate' },
  C1: { min: 13, max: 15, label: 'Advanced' },
  C2: { min: 16, max: 18, label: 'Proficient' },
  Expert: { min: 19, max: 19, label: 'Expert' },
  Master: { min: 20, max: 20, label: 'Master' }
};

const ACHIEVEMENT_TYPES = {
  LEVEL_COMPLETION: 'level_completion',
  PERFECT_SCORE: 'perfect_score',
  STREAK: 'streak',
  SPEED_RUN: 'speed_run',
  FIRST_CERTIFICATE: 'first_certificate'
};

module.exports = {
  LEARNING_MODES,
  MODE_LABELS,
  SCHOOL_SETTINGS,
  PLACEMENT_TEST_CONFIG,
  GRADE_LEVELS,
  ACHIEVEMENT_TYPES
};
