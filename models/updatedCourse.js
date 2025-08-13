// models/updatedCourse.js - FIXED Updated Course Model (Images & Text Only)
const mongoose = require('mongoose');

const updatedCourseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  fullDescription: {
    type: String,
    trim: true,
    maxlength: 5000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'ИИ и автоматизация',
      'Видеомонтаж', 
      'Графический дизайн',
      'Web-разработка',
      'Мобильная разработка',
      'Машинное обучение',
      'Дизайн',
      'Программирование',
      'Маркетинг'
    ]
  },
  difficulty: {
    type: String,
    required: true,
    enum: ['Начинающий', 'Средний', 'Продвинутый'],
    default: 'Начинающий'
  },
  duration: {
    type: String,
    required: true,
    default: '10 часов'
  },
  thumbnail: {
    type: String,
    default: '/default-course-thumbnail.jpg'
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tools: [{
    type: String,
    trim: true
  }],
  studentsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  instructor: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    avatar: {
      type: String,
      default: '/default-avatar.jpg'
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500
    }
  },
  // ✅ FIXED: Curriculum with only images and text support
  curriculum: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    duration: {
      type: String,
      default: '30 мин'
    },
    order: {
      type: Number,
      default: 0
    },
    // ✅ FIXED: Steps now only support images and text
    steps: [{
      type: {
        type: String,
        enum: ['explanation', 'example', 'reading', 'image', 'practice', 'quiz'],
        required: true
      },
      title: {
        type: String,
        trim: true
      },
      content: {
        type: String,
        trim: true
      },
      description: {
        type: String,
        trim: true
      },
      // ✅ Images support
      images: [{
        url: {
          type: String,
          required: true
        },
        caption: {
          type: String,
          trim: true
        },
        filename: {
          type: String,
          trim: true
        },
        size: {
          type: Number
        }
      }],
      // ✅ Data field for structured content
      data: {
        type: mongoose.Schema.Types.Mixed
      },
      // ✅ Practice-specific fields
      instructions: {
        type: String,
        trim: true
      },
      // ✅ Quiz-specific fields
      question: {
        type: String,
        trim: true
      },
      options: [{
        text: {
          type: String,
          required: true
        }
      }],
      correctAnswer: {
        type: Number
      },
      quizzes: [{
        question: {
          type: String,
          required: true
        },
        type: {
          type: String,
          enum: ['multiple-choice', 'true-false', 'short-answer'],
          default: 'multiple-choice'
        },
        options: [{
          text: String
        }],
        correctAnswer: mongoose.Schema.Types.Mixed,
        explanation: String
      }]
    }]
  }],
  tags: [{
    type: String,
    trim: true
  }],
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  language: {
    type: String,
    default: 'ru'
  },
  price: {
    type: Number,
    default: 0,
    min: 0
  },
  discountPrice: {
    type: Number,
    min: 0
  },
  enrollmentCount: {
    type: Number,
    default: 0,
    min: 0
  },
  completionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  requirements: [{
    type: String,
    trim: true
  }],
  learningOutcomes: [{
    type: String,
    trim: true
  }],
  targetAudience: [{
    type: String,
    trim: true
  }],
  certificateOffered: {
    type: Boolean,
    default: false
  },
  estimatedTime: {
    hours: {
      type: Number,
      default: 10
    },
    weeks: {
      type: Number,
      default: 2
    }
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published'
  },
  metadata: {
    views: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    lastViewed: {
      type: Date
    }
  },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
    slug: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  createdBy: {
    type: String,
    required: true
  },
  updatedBy: {
    type: String
  },
  // ✅ FIXED: Guide fields (removed video, kept PDF)
  isGuide: {
    type: Boolean,
    default: false,
    description: "Flag to indicate if this course is also a downloadable guide"
  },
  guidePdfUrl: {
    type: String,
    description: "A downloadable PDF file for the guide, available to premium users"
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
updatedCourseSchema.index({ category: 1, difficulty: 1 });
updatedCourseSchema.index({ isActive: 1, isPremium: 1 });
updatedCourseSchema.index({ createdAt: -1 });
updatedCourseSchema.index({ 'instructor.name': 1 });
updatedCourseSchema.index({ tools: 1 });
updatedCourseSchema.index({ tags: 1 });

// Generate slug from title before saving
updatedCourseSchema.pre('save', function(next) {
  if (this.title && (!this.seo.slug || this.isModified('title'))) {
    this.seo.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }
  next();
});

// Virtual for course URL
updatedCourseSchema.virtual('url').get(function() {
  return `/courses/${this.seo.slug || this._id}`;
});

// Virtual for formatted price
updatedCourseSchema.virtual('formattedPrice').get(function() {
  if (this.price === 0) return 'Бесплатно';
  return `${this.price.toLocaleString()} UZS`;
});

// Virtual for discount percentage
updatedCourseSchema.virtual('discountPercentage').get(function() {
  if (!this.discountPrice || this.discountPrice >= this.price) return 0;
  return Math.round(((this.price - this.discountPrice) / this.price) * 100);
});

// Static method to get categories
updatedCourseSchema.statics.getCategories = function() {
  return [
    'ИИ и автоматизация',
    'Видеомонтаж', 
    'Графический дизайн',
    'Web-разработка',
    'Мобильная разработка',
    'Машинное обучение',
    'Дизайн',
    'Программирование',
    'Маркетинг'
  ];
};

// Static method to get difficulty levels
updatedCourseSchema.statics.getDifficultyLevels = function() {
  return ['Начинающий', 'Средний', 'Продвинутый'];
};

// Instance method to increment views
updatedCourseSchema.methods.incrementViews = function() {
  this.metadata.views += 1;
  this.metadata.lastViewed = new Date();
  return this.save();
};

// Instance method to toggle premium status
updatedCourseSchema.methods.togglePremium = function() {
  this.isPremium = !this.isPremium;
  return this.save();
};

const UpdatedCourse = mongoose.model('UpdatedCourse', updatedCourseSchema);

module.exports = UpdatedCourse;