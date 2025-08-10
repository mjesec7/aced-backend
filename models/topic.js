// models/topic.js - FIXED VERSION to handle your data structure
const mongoose = require('mongoose');

// 📘 Enhanced Topic schema with flexible name structure
const topicSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: [true, '❌ Subject is required'],
    trim: true
  },
  level: {
    type: Number,
    required: [true, '❌ Level is required'],
    min: [1, '❌ Level must be 1 or higher']
  },
  // ✅ CRITICAL FIX: Handle both string and object name formats
  name: {
    type: mongoose.Schema.Types.Mixed, // Allow both string and object
    required: [true, '❌ Topic name is required']
  },
  // ✅ Legacy support for existing data
  topicName: {
    type: String,
    trim: true
  },
  description: {
    type: mongoose.Schema.Types.Mixed, // Allow both string and object
    default: '',
    trim: true
  },
  // ✅ Additional fields for enhanced functionality
  metadata: {
    difficulty: { 
      type: String, 
      enum: ['beginner', 'intermediate', 'advanced'], 
      default: 'beginner' 
    },
    estimatedDuration: { type: Number, default: 30 }, // in minutes
    prerequisites: { type: [String], default: [] },
    learningObjectives: { type: [String], default: [] }
  },
  // ✅ Status fields
  isActive: { type: Boolean, default: true },
  isDraft: { type: Boolean, default: false },
  // ✅ Order for sequencing
  order: { type: Number, default: 0 }
}, {
  timestamps: true,
  // ✅ Add toJSON transform to normalize output
  toJSON: {
    transform: function(doc, ret) {
      // ✅ Ensure consistent name field
      if (!ret.name && ret.topicName) {
        ret.name = ret.topicName;
      }
      
      // ✅ Ensure both name and topicName exist for backward compatibility
      if (typeof ret.name === 'string' && !ret.topicName) {
        ret.topicName = ret.name;
      } else if (typeof ret.name === 'object' && ret.name.en && !ret.topicName) {
        ret.topicName = ret.name.en;
      }
      
      // ✅ Ensure description is accessible
      if (typeof ret.description === 'object' && ret.description.en && typeof ret.description.en === 'string') {
        ret.topicDescription = ret.description.en;
      } else if (typeof ret.description === 'string') {
        ret.topicDescription = ret.description;
      }
      
      return ret;
    }
  }
});

// ✅ CRITICAL FIX: Modified composite index to be more flexible
// Remove the unique constraint temporarily to debug
topicSchema.index({ subject: 1, level: 1, name: 1 }, { 
  unique: false, // Changed from true to false for debugging
  background: true 
});

// ✅ Add additional indexes for better performance
topicSchema.index({ subject: 1, level: 1 });
topicSchema.index({ isActive: 1, isDraft: 1 });
topicSchema.index({ 'name.en': 1 });
topicSchema.index({ topicName: 1 });

// ✅ Virtual for getting display name
topicSchema.virtual('displayName').get(function() {
  if (typeof this.name === 'string') {
    return this.name;
  } else if (typeof this.name === 'object') {
    return this.name.en || this.name.ru || this.name.uz || 'Unnamed Topic';
  } else if (this.topicName) {
    return this.topicName;
  } else {
    return 'Unnamed Topic';
  }
});

// ✅ Virtual for getting display description
topicSchema.virtual('displayDescription').get(function() {
  if (typeof this.description === 'string') {
    return this.description;
  } else if (typeof this.description === 'object') {
    return this.description.en || this.description.ru || this.description.uz || '';
  } else {
    return '';
  }
});

// ✅ Instance method to get lesson count
topicSchema.methods.getLessonCount = async function() {
  const Lesson = mongoose.model('Lesson');
  return await Lesson.countDocuments({ 
    $or: [
      { topicId: this._id },
      { topic: this.displayName }
    ]
  });
};

// ✅ Instance method to check if topic has content
topicSchema.methods.hasContent = async function() {
  const lessonCount = await this.getLessonCount();
  return lessonCount > 0;
};

// ✅ Static method to find by flexible name search
topicSchema.statics.findByName = function(name, options = {}) {
  const query = {
    $or: [
      { name: name },
      { 'name.en': name },
      { 'name.ru': name },
      { 'name.uz': name },
      { topicName: name }
    ]
  };
  
  if (options.subject) {
    query.subject = options.subject;
  }
  
  if (options.level) {
    query.level = options.level;
  }
  
  return this.findOne(query);
};

// ✅ Static method to find topics with lessons
topicSchema.statics.findWithLessons = async function(filter = {}) {
  const Lesson = mongoose.model('Lesson');
  
  // Get all topics
  const topics = await this.find(filter);
  
  // Add lesson count to each topic
  const topicsWithLessons = await Promise.all(
    topics.map(async (topic) => {
      const lessonCount = await Lesson.countDocuments({
        $or: [
          { topicId: topic._id },
          { topic: topic.displayName }
        ]
      });
      
      return {
        ...topic.toObject(),
        lessonCount
      };
    })
  );
  
  return topicsWithLessons;
};

// ✅ Pre-save middleware to ensure data consistency
topicSchema.pre('save', function(next) {
  // ✅ Ensure both name formats exist
  if (typeof this.name === 'string' && !this.topicName) {
    this.topicName = this.name;
  } else if (typeof this.name === 'object' && this.name.en && !this.topicName) {
    this.topicName = this.name.en;
  } else if (!this.name && this.topicName) {
    this.name = this.topicName;
  }
  
  // ✅ Set default order if not specified
  if (this.order === undefined || this.order === null) {
    this.order = 0;
  }
  
  next();
});

// ✅ Enhanced logging hooks
topicSchema.post('save', (doc) => {
  const displayName = doc.displayName;
});

topicSchema.post('findOne', (doc) => {
  if (doc) {
  } else {
  }
});

topicSchema.post('find', (docs) => {
});

topicSchema.post('findOneAndUpdate', (doc) => {
  if (doc) {
  } else {
  }
});

topicSchema.post('findOneAndDelete', (doc) => {
  if (doc) {
  } else {
  }
});

// ✅ Error handling middleware
topicSchema.post('save', function(error, doc, next) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    next(new Error(`Topic with this ${field} already exists`));
  } else {
    next(error);
  }
});

// ✅ Add debugging method to help troubleshoot
topicSchema.statics.debug = async function(topicId) {
  
  const strategies = [
    { name: 'Direct findById', query: () => this.findById(topicId) },
    { name: 'Manual ObjectId', query: () => this.findOne({ _id: new mongoose.Types.ObjectId(topicId) }) },
    { name: 'String search', query: () => this.findOne({ _id: topicId }) },
    { name: 'Name search', query: () => this.findByName(topicId) }
  ];
  
  for (const strategy of strategies) {
    try {
      const result = await strategy.query();
      if (result) {
        return result;
      }
    } catch (error) {
    }
  }
  
  return null;
};

const Topic = mongoose.model('Topic', topicSchema);
module.exports = Topic;