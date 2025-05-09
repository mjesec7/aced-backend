const mongoose = require('mongoose');

// 📘 Topic schema: belongs to a subject and level, has a name and optional description
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
  name: {
    type: String,
    required: [true, '❌ Topic name is required'],
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  }
}, {
  timestamps: true
});

// ✅ Composite index to avoid duplicates by subject+level+name
topicSchema.index({ subject: 1, level: 1, name: 1 }, { unique: true });

// ✅ Log lifecycle
topicSchema.post('save', (doc) => {
  console.log(`✅ [Topic Saved] "${doc.name}" under "${doc.subject}" (Level ${doc.level})`);
});

topicSchema.post('findOneAndUpdate', (doc) => {
  if (doc) {
    console.log(`🔄 [Topic Updated] "${doc.name}"`);
  }
});

topicSchema.post('findOneAndDelete', (doc) => {
  if (doc) {
    console.log(`🗑️ [Topic Deleted] "${doc.name}"`);
  }
});

const Topic = mongoose.model('Topic', topicSchema);
module.exports = Topic;
