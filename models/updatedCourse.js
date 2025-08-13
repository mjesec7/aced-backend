// models/updatedCourse.js - ENHANCED VERSION WITH BETTER PDF SUPPORT
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
  
  // ✅ ENHANCED: Content structure with both courses and guides
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
    // Steps for interactive content (courses only)
    steps: [{
      type: {
        type: String,
        enum: ['explanation', 'example', 'reading', 'image', 'practice', 'quiz', 'download'],
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
      // ✅ Enhanced images support
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
        },
        thumbnail: {
          type: String
        }
      }],
      // ✅ Enhanced PDF attachments for each step
      attachments: [{
        type: {
          type: String,
          enum: ['pdf', 'document', 'resource'],
          default: 'pdf'
        },
        title: {
          type: String,
          required: true,
          trim: true
        },
        url: {
          type: String,
          required: true
        },
        filename: {
          type: String,
          required: true
        },
        size: {
          type: Number
        },
        description: {
          type: String,
          trim: true
        },
        downloadable: {
          type: Boolean,
          default: true
        },
        premiumOnly: {
          type: Boolean,
          default: false
        }
      }],
      // Data field for structured content
      data: {
        type: mongoose.Schema.Types.Mixed
      },
      // Practice-specific fields
      instructions: {
        type: String,
        trim: true
      },
      // Quiz-specific fields
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
    },
    totalDownloads: {
      type: Number,
      default: 0
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
  
  // ✅ ENHANCED: Guide and resource fields
  isGuide: {
    type: Boolean,
    default: false,
    description: "Flag to indicate if this course is a guide/resource"
  },
  
  // ✅ ENHANCED: Main guide PDF (for guides)
  guidePdf: {
    url: {
      type: String,
      description: "Main PDF URL for guides"
    },
    filename: {
      type: String,
      description: "Original filename of the PDF"
    },
    size: {
      type: Number,
      description: "File size in bytes"
    },
    title: {
      type: String,
      description: "Display title for the PDF"
    },
    description: {
      type: String,
      description: "Description of the PDF content"
    },
    downloadCount: {
      type: Number,
      default: 0
    },
    lastDownloaded: {
      type: Date
    }
  },
  
  // ✅ ENHANCED: Additional resources (PDFs, documents, etc.)
  resources: [{
    type: {
      type: String,
      enum: ['pdf', 'document', 'template', 'worksheet', 'bonus'],
      default: 'pdf'
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    url: {
      type: String,
      required: true
    },
    filename: {
      type: String,
      required: true
    },
    size: {
      type: Number
    },
    downloadable: {
      type: Boolean,
      default: true
    },
    premiumOnly: {
      type: Boolean,
      default: false
    },
    downloadCount: {
      type: Number,
      default: 0
    },
    lastDownloaded: {
      type: Date
    },
    order: {
      type: Number,
      default: 0
    }
  }],
  
  // ✅ NEW: Content type classification
  contentType: {
    type: String,
    enum: ['course', 'guide', 'template', 'resource-pack'],
    default: function() {
      return this.isGuide ? 'guide' : 'course';
    }
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ✅ ENHANCED: Indexes for better performance
updatedCourseSchema.index({ category: 1, difficulty: 1 });
updatedCourseSchema.index({ isActive: 1, isPremium: 1 });
updatedCourseSchema.index({ createdAt: -1 });
updatedCourseSchema.index({ 'instructor.name': 1 });
updatedCourseSchema.index({ tools: 1 });
updatedCourseSchema.index({ tags: 1 });
updatedCourseSchema.index({ isGuide: 1, contentType: 1 });
updatedCourseSchema.index({ 'seo.slug': 1 });

// ✅ ENHANCED: Pre-save middleware
updatedCourseSchema.pre('save', function(next) {
  // Generate slug from title
  if (this.title && (!this.seo.slug || this.isModified('title'))) {
    this.seo.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }
  
  // Set content type based on isGuide flag
  if (this.isModified('isGuide')) {
    this.contentType = this.isGuide ? 'guide' : 'course';
  }
  
  // Ensure guidePdf is properly structured
  if (this.isGuide && this.guidePdf && typeof this.guidePdf === 'string') {
    // Convert legacy string URL to object structure
    this.guidePdf = {
      url: this.guidePdf,
      filename: this.guidePdf.split('/').pop() || 'guide.pdf',
      title: this.title + ' - Guide'
    };
  }
  
  next();
});

// ✅ ENHANCED: Virtual fields
updatedCourseSchema.virtual('url').get(function() {
  return `/courses/${this.seo.slug || this._id}`;
});

updatedCourseSchema.virtual('formattedPrice').get(function() {
  if (this.price === 0) return 'Бесплатно';
  return `${this.price.toLocaleString()} UZS`;
});

updatedCourseSchema.virtual('discountPercentage').get(function() {
  if (!this.discountPrice || this.discountPrice >= this.price) return 0;
  return Math.round(((this.price - this.discountPrice) / this.price) * 100);
});

// ✅ NEW: Virtual for total resources count
updatedCourseSchema.virtual('totalResourcesCount').get(function() {
  let count = 0;
  
  // Count main guide PDF
  if (this.isGuide && this.guidePdf && this.guidePdf.url) {
    count += 1;
  }
  
  // Count additional resources
  if (this.resources && this.resources.length > 0) {
    count += this.resources.length;
  }
  
  // Count step attachments
  if (this.curriculum && this.curriculum.length > 0) {
    this.curriculum.forEach(lesson => {
      if (lesson.steps && lesson.steps.length > 0) {
        lesson.steps.forEach(step => {
          if (step.attachments && step.attachments.length > 0) {
            count += step.attachments.length;
          }
        });
      }
    });
  }
  
  return count;
});

// ✅ ENHANCED: Static methods
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

updatedCourseSchema.statics.getDifficultyLevels = function() {
  return ['Начинающий', 'Средний', 'Продвинутый'];
};

updatedCourseSchema.statics.getContentTypes = function() {
  return ['course', 'guide', 'template', 'resource-pack'];
};

// ✅ NEW: Get courses with PDF resources
updatedCourseSchema.statics.getCoursesWithPDFs = function() {
  return this.find({
    $or: [
      { 'guidePdf.url': { $exists: true, $ne: null } },
      { 'resources.0': { $exists: true } },
      { 'curriculum.steps.attachments.0': { $exists: true } }
    ]
  });
};

// ✅ ENHANCED: Instance methods
updatedCourseSchema.methods.incrementViews = function() {
  this.metadata.views += 1;
  this.metadata.lastViewed = new Date();
  return this.save();
};

updatedCourseSchema.methods.togglePremium = function() {
  this.isPremium = !this.isPremium;
  return this.save();
};

// ✅ NEW: Increment download count for main guide
updatedCourseSchema.methods.incrementGuideDownload = function() {
  if (this.guidePdf) {
    this.guidePdf.downloadCount = (this.guidePdf.downloadCount || 0) + 1;
    this.guidePdf.lastDownloaded = new Date();
    this.metadata.totalDownloads = (this.metadata.totalDownloads || 0) + 1;
  }
  return this.save();
};

// ✅ NEW: Increment download count for specific resource
updatedCourseSchema.methods.incrementResourceDownload = function(resourceId) {
  const resource = this.resources.id(resourceId);
  if (resource) {
    resource.downloadCount = (resource.downloadCount || 0) + 1;
    resource.lastDownloaded = new Date();
    this.metadata.totalDownloads = (this.metadata.totalDownloads || 0) + 1;
  }
  return this.save();
};

// ✅ NEW: Add resource to course
updatedCourseSchema.methods.addResource = function(resourceData) {
  this.resources.push({
    ...resourceData,
    order: this.resources.length
  });
  return this.save();
};

// ✅ NEW: Remove resource from course
updatedCourseSchema.methods.removeResource = function(resourceId) {
  this.resources.id(resourceId).remove();
  return this.save();
};

// ✅ NEW: Get all downloadable files for this course
updatedCourseSchema.methods.getAllDownloadableFiles = function() {
  const files = [];
  
  // Add main guide PDF
  if (this.isGuide && this.guidePdf && this.guidePdf.url) {
    files.push({
      type: 'guide',
      title: this.guidePdf.title || 'Main Guide',
      url: this.guidePdf.url,
      filename: this.guidePdf.filename,
      size: this.guidePdf.size,
      downloadCount: this.guidePdf.downloadCount || 0
    });
  }
  
  // Add additional resources
  this.resources.forEach(resource => {
    if (resource.downloadable) {
      files.push({
        type: 'resource',
        title: resource.title,
        url: resource.url,
        filename: resource.filename,
        size: resource.size,
        downloadCount: resource.downloadCount || 0,
        premiumOnly: resource.premiumOnly
      });
    }
  });
  
  // Add step attachments
  this.curriculum.forEach(lesson => {
    lesson.steps.forEach(step => {
      if (step.attachments) {
        step.attachments.forEach(attachment => {
          if (attachment.downloadable) {
            files.push({
              type: 'attachment',
              title: attachment.title,
              url: attachment.url,
              filename: attachment.filename,
              size: attachment.size,
              lessonTitle: lesson.title,
              stepTitle: step.title,
              premiumOnly: attachment.premiumOnly
            });
          }
        });
      }
    });
  });
  
  return files;
};

// ✅ NEW: Check if user can access premium content
updatedCourseSchema.methods.canUserAccessPremiumContent = function(userPlan) {
  if (!this.isPremium) return true;
  return userPlan && ['start', 'pro', 'premium'].includes(userPlan);
};

const UpdatedCourse = mongoose.model('UpdatedCourse', updatedCourseSchema);

module.exports = UpdatedCourse;