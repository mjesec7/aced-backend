// models/aiMemory.js - Global AI Memory for cross-lesson context
const mongoose = require('mongoose');

// Schema for storing important facts AI should remember about the user
const memoryItemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'learning_preference',    // How user likes to learn
      'struggle_topic',         // Topic user struggles with
      'strength_topic',         // Topic user excels at
      'misconception',          // Common mistake user makes
      'interest',               // User's interests (for examples)
      'question_asked',         // Important question user asked
      'breakthrough',           // When user understood something
      'goal',                   // User's learning goals
      'context'                 // General context info
    ],
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 500
  },
  subject: String,           // Related subject (Math, English, etc.)
  topic: String,             // Related topic
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson'
  },
  importance: {
    type: Number,
    default: 5,              // 1-10 scale
    min: 1,
    max: 10
  },
  expiresAt: Date,           // Optional expiration
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const aiMemorySchema = new mongoose.Schema({
  userId: {
    type: String,            // Firebase UID
    required: true,
    unique: true,
    index: true
  },

  // Important facts AI should remember
  memories: {
    type: [memoryItemSchema],
    default: []
  },

  // User's learning profile summary (AI-generated)
  learnerProfile: {
    preferredExplanationStyle: {
      type: String,
      enum: ['visual', 'verbal', 'examples', 'step-by-step', 'conceptual'],
      default: 'step-by-step'
    },
    pacePreference: {
      type: String,
      enum: ['slow', 'moderate', 'fast'],
      default: 'moderate'
    },
    encouragementLevel: {
      type: String,
      enum: ['minimal', 'moderate', 'high'],
      default: 'moderate'
    },
    commonMistakePatterns: [String],
    strongAreas: [String],
    weakAreas: [String],
    interests: [String]          // For relevant examples
  },

  // Subjects user is actively studying
  activeSubjects: [{
    subject: String,
    lastAccessedAt: Date,
    currentTopicId: mongoose.Schema.Types.ObjectId,
    currentLessonId: mongoose.Schema.Types.ObjectId,
    progressPercent: Number
  }],

  // Quick context for AI (updated periodically)
  contextSummary: {
    type: String,
    maxlength: 2000          // AI-generated summary of user's learning journey
  },

  lastUpdatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Get or create AI memory for user
aiMemorySchema.statics.getOrCreate = async function(userId) {
  let memory = await this.findOne({ userId });

  if (!memory) {
    memory = new this({
      userId,
      memories: [],
      learnerProfile: {},
      activeSubjects: []
    });
    await memory.save();
  }

  return memory;
};

// Add a memory item
aiMemorySchema.methods.addMemory = async function(type, content, options = {}) {
  // Check for duplicates
  const existing = this.memories.find(m =>
    m.type === type &&
    m.content.toLowerCase() === content.toLowerCase()
  );

  if (existing) {
    // Update importance if it's higher
    if (options.importance && options.importance > existing.importance) {
      existing.importance = options.importance;
    }
    existing.createdAt = new Date();
    return this.save();
  }

  // Add new memory
  this.memories.push({
    type,
    content,
    subject: options.subject,
    topic: options.topic,
    lessonId: options.lessonId,
    importance: options.importance || 5,
    expiresAt: options.expiresAt
  });

  // Keep only top 50 memories by importance
  if (this.memories.length > 50) {
    this.memories.sort((a, b) => b.importance - a.importance);
    this.memories = this.memories.slice(0, 50);
  }

  this.lastUpdatedAt = new Date();
  return this.save();
};

// Get relevant memories for a context
aiMemorySchema.methods.getRelevantMemories = function(subject = null, topic = null, limit = 10) {
  let relevant = this.memories;

  // Filter by subject/topic if provided
  if (subject) {
    relevant = relevant.filter(m => !m.subject || m.subject === subject);
  }
  if (topic) {
    relevant = relevant.filter(m => !m.topic || m.topic === topic);
  }

  // Remove expired memories
  const now = new Date();
  relevant = relevant.filter(m => !m.expiresAt || m.expiresAt > now);

  // Sort by importance and recency
  relevant.sort((a, b) => {
    const importanceDiff = b.importance - a.importance;
    if (importanceDiff !== 0) return importanceDiff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return relevant.slice(0, limit);
};

// Update active subject
aiMemorySchema.methods.updateActiveSubject = async function(subject, lessonId, topicId, progressPercent) {
  const existing = this.activeSubjects.find(s => s.subject === subject);

  if (existing) {
    existing.lastAccessedAt = new Date();
    existing.currentLessonId = lessonId;
    existing.currentTopicId = topicId;
    existing.progressPercent = progressPercent;
  } else {
    this.activeSubjects.push({
      subject,
      lastAccessedAt: new Date(),
      currentLessonId: lessonId,
      currentTopicId: topicId,
      progressPercent
    });
  }

  // Keep only 10 most recent subjects
  this.activeSubjects.sort((a, b) =>
    new Date(b.lastAccessedAt) - new Date(a.lastAccessedAt)
  );
  this.activeSubjects = this.activeSubjects.slice(0, 10);

  this.lastUpdatedAt = new Date();
  return this.save();
};

// Build context string for AI
aiMemorySchema.methods.buildContextForAI = function(subject = null, topic = null) {
  const memories = this.getRelevantMemories(subject, topic, 8);

  if (memories.length === 0 && !this.learnerProfile) {
    return '';
  }

  let context = '\n📝 ПАМЯТЬ О СТУДЕНТЕ:\n';

  // Add learner profile
  if (this.learnerProfile) {
    if (this.learnerProfile.preferredExplanationStyle) {
      context += `- Предпочитает ${this.learnerProfile.preferredExplanationStyle === 'visual' ? 'визуальные объяснения' :
                                  this.learnerProfile.preferredExplanationStyle === 'examples' ? 'примеры из жизни' :
                                  this.learnerProfile.preferredExplanationStyle === 'step-by-step' ? 'пошаговые объяснения' :
                                  'концептуальные объяснения'}\n`;
    }
    if (this.learnerProfile.strongAreas?.length > 0) {
      context += `- Сильные стороны: ${this.learnerProfile.strongAreas.slice(0, 3).join(', ')}\n`;
    }
    if (this.learnerProfile.weakAreas?.length > 0) {
      context += `- Требует внимания: ${this.learnerProfile.weakAreas.slice(0, 3).join(', ')}\n`;
    }
    if (this.learnerProfile.interests?.length > 0) {
      context += `- Интересы (для примеров): ${this.learnerProfile.interests.slice(0, 3).join(', ')}\n`;
    }
  }

  // Add relevant memories
  if (memories.length > 0) {
    context += '\nВАЖНЫЕ ФАКТЫ:\n';
    memories.forEach(m => {
      const typeLabel = {
        'learning_preference': '💡',
        'struggle_topic': '⚠️',
        'strength_topic': '✨',
        'misconception': '❗',
        'interest': '🎯',
        'breakthrough': '🎉',
        'goal': '🎯',
        'context': '📌'
      }[m.type] || '•';
      context += `${typeLabel} ${m.content}\n`;
    });
  }

  return context;
};

const AIMemory = mongoose.model('AIMemory', aiMemorySchema);
module.exports = AIMemory;
