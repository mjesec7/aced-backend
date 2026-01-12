// config/platformSettings.js - Dual Mode Platform Configuration

module.exports = {
  // Dual Mode Configuration
  dualMode: {
    enabled: true,
    defaultMode: 'study_centre',
    allowModeSwitch: true,
    switchCooldown: 24 // hours between switches
  },

  // Placement Test Settings
  placementTest: {
    questions: 50,
    timeLimit: 45, // minutes
    adaptive: true,
    startingDifficulty: 5,
    difficultyAdjustment: 0.5,
    subjects: ['English', 'Math', 'Science', 'Programming']
  },

  // School Mode Rules
  schoolMode: {
    minPassingScore: 70,
    maxRetakes: 2,
    certificateEnabled: true,
    requirePrerequisites: true,
    lockProgression: true,
    levelsToUnlockAtOnce: 1,
    requiredCoursesPerLevel: 5
  },

  // Study Centre Features
  studyCentre: {
    unlimitedAccess: true,
    allowSkipping: true,
    showAllContent: true,
    enableBookmarks: true,
    personalPaths: true,
    recommendationEngine: true
  },

  // Level to Grade Mapping
  levelGradeMapping: {
    1: 'A1', 2: 'A1', 3: 'A1',
    4: 'A2', 5: 'A2', 6: 'A2',
    7: 'B1', 8: 'B1', 9: 'B1',
    10: 'B2', 11: 'B2', 12: 'B2',
    13: 'C1', 14: 'C1', 15: 'C1',
    16: 'C2', 17: 'C2', 18: 'C2',
    19: 'Expert', 20: 'Master'
  },

  // Grade to Levels Mapping (reverse mapping)
  gradeToLevels: {
    'A1': [1, 2, 3],
    'A2': [4, 5, 6],
    'B1': [7, 8, 9],
    'B2': [10, 11, 12],
    'C1': [13, 14, 15],
    'C2': [16, 17, 18],
    'Expert': [19],
    'Master': [20]
  }
};
