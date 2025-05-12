const mongoose = require('mongoose');

// ✅ Multilingual string schema
const localizedString = {
  en: { type: String, default: '' },
  ru: { type: String, default: '' },
  uz: { type: String, default: '' }
};

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
    type: localizedString,
    required: [true, '❌ Topic name is required']
  },
  description: {
    type: localizedString,
    default: () => ({})
  }
}, {
  timestamps: true
});

// ✅ Composite index to avoid duplicates by subject+level+name.en
topicSchema.index({ subject: 1, level: 1, 'name.en': 1 }, { unique: true });

// ✅ Log lifecycle
topicSchema.post('save', (doc) => {
  console.log(`✅ [Topic Saved] "${doc.name.en}" under "${doc.subject}" (Level ${doc.level})`);
});

topicSchema.post('findOneAndUpdate', (doc) => {
  if (doc) {
    console.log(`🔄 [Topic Updated] "${doc.name.en}"`);
  }
});

topicSchema.post('findOneAndDelete', (doc) => {
  if (doc) {
    console.log(`🗑️ [Topic Deleted] "${doc.name.en}"`);
  }
});

const Topic = mongoose.model('Topic', topicSchema);
module.exports = Topic;
