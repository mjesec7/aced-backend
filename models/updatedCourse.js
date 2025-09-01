// models/updatedCourse.js - ENHANCED WITH STRUCTURED JSON SUPPORT
const mongoose = require('mongoose');

// Define the enhanced schema with structured JSON support
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

  // ✅ NEW: Enhanced Course Metadata Structure
  courseMetadata: {
    lastUpdated: {
      type: String,
      default: () => new Date().toISOString()
    },
    author: {
      type: String,
      required: true
    },
    totalLessons: {
      type: Number,
      default: 0
    },
    totalDuration: {
      type: String,
      default: '10 hours'
    },
    difficulty: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      default: 'Beginner'
    },
    courseDescription: {
      type: String,
      maxlength: 2000
    },
    language: {
      type: String,
      default: 'ru'
    },
    prerequisites: {
      type: String,
      maxlength: 1000
    }
  },

  // ✅ NEW: Enhanced Lessons Structure with Theory, Practical Examples, and Homework
  lessons: [{
    lessonNumber: {
      type: Number,
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    duration: {
      type: String,
      default: '30 min'
    },
    content: {
      theory: {
        // Flexible structure for theory content
        type: mongoose.Schema.Types.Mixed
      },
      practical_examples: {
        // Flexible structure for practical examples
        type: mongoose.Schema.Types.Mixed
      },
      homework: {
        theory_questions: [{
          type: String,
          trim: true
        }],
        practical_tasks: [{
          type: String,
          trim: true
        }]
      }
    },
    // Keep backward compatibility with existing step-based structure
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
      data: {
        type: mongoose.Schema.Types.Mixed
      }
    }]
  }],

  // ✅ NEW: Final Project Structure
  finalProject: {
    title: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    requirements: [{
      type: String,
      trim: true
    }],
    technical_specifications: [{
      type: String,
      trim: true
    }],
    deliverables: [{
      type: String,
      trim: true
    }],
    evaluation_criteria: [{
      type: String,
      trim: true
    }]
  },

  // ✅ NEW: Certification Structure
  certification: {
    title: {
      type: String,
      trim: true
    },
    requirements: [{
      type: String,
      trim: true
    }],
    validity: {
      type: String,
      trim: true
    },
    recognition: {
      type: String,
      trim: true
    },
    continuing_education: {
      type: String,
      trim: true
    }
  },

  // ✅ NEW: Career Advancement Structure
  career_advancement: [{
    role: {
      type: String,
      trim: true
    },
    salary_range: {
      type: String,
      trim: true
    },
    key_skills: [{
      type: String,
      trim: true
    }],
    companies: [{
      type: String,
      trim: true
    }],
    work_type: {
      type: String,
      trim: true
    }
  }],

  // ✅ NEW: Next Steps Structure
  nextSteps: [{
    track: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    technologies: [{
      type: String,
      trim: true
    }],
    focus_areas: [{
      type: String,
      trim: true
    }],
    duration: {
      type: String,
      trim: true
    }
  }],

  // ✅ NEW: Community Resources
  community_resources: [{
    type: String,
    trim: true
  }],

  // Keep existing curriculum for backward compatibility
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
      data: {
        type: mongoose.Schema.Types.Mixed
      }
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
  isGuide: {
    type: Boolean,
    default: false
  },
  guidePdfUrl: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ✅ NEW: Virtual to generate structured JSON format
updatedCourseSchema.virtual('structuredFormat').get(function() {
  return {
    courseTitle: this.title,
    courseMetadata: {
      lastUpdated: this.courseMetadata?.lastUpdated || this.updatedAt?.toISOString(),
      author: this.courseMetadata?.author || this.instructor?.name,
      totalLessons: this.lessons?.length || this.curriculum?.length || 0,
      totalDuration: this.courseMetadata?.totalDuration || this.duration,
      difficulty: this.courseMetadata?.difficulty || this.difficulty,
      courseDescription: this.courseMetadata?.courseDescription || this.description,
      language: this.courseMetadata?.language || this.language || 'ru',
      prerequisites: this.courseMetadata?.prerequisites || this.requirements?.join(', ') || ''
    },
    lessons: this.lessons?.map(lesson => ({
      lessonNumber: lesson.lessonNumber,
      title: lesson.title,
      duration: lesson.duration,
      content: {
        theory: lesson.content?.theory || {},
        practical_examples: lesson.content?.practical_examples || {},
        homework: {
          theory_questions: lesson.content?.homework?.theory_questions || [],
          practical_tasks: lesson.content?.homework?.practical_tasks || []
        }
      }
    })) || [],
    finalProject: this.finalProject || {},
    certification: this.certification || {},
    career_advancement: this.career_advancement || [],
    nextSteps: this.nextSteps || [],
    community_resources: this.community_resources || []
  };
});

// ✅ NEW: Method to convert from legacy curriculum to structured format
updatedCourseSchema.methods.convertToStructuredFormat = function() {
  if (this.lessons && this.lessons.length > 0) {
    return this.structuredFormat;
  }

  // Convert from curriculum if lessons don't exist
  if (this.curriculum && this.curriculum.length > 0) {
    const convertedLessons = this.curriculum.map((curriculumItem, index) => {
      // Extract theory content from explanation/reading steps
      const theorySteps = curriculumItem.steps?.filter(step => 
        ['explanation', 'reading', 'example'].includes(step.type)
      ) || [];
      
      const practicalSteps = curriculumItem.steps?.filter(step => 
        ['practice', 'image'].includes(step.type)
      ) || [];

      const quizSteps = curriculumItem.steps?.filter(step => 
        step.type === 'quiz'
      ) || [];

      return {
        lessonNumber: index + 1,
        title: curriculumItem.title,
        duration: curriculumItem.duration || '30 min',
        content: {
          theory: {
            concepts: theorySteps.map(step => ({
              title: step.title,
              content: step.content || step.data?.content,
              images: step.images || []
            }))
          },
          practical_examples: {
            exercises: practicalSteps.map(step => ({
              title: step.title,
              instructions: step.content || step.data?.instructions,
              images: step.images || []
            }))
          },
          homework: {
            theory_questions: quizSteps.map(step => step.content || step.data?.question || ''),
            practical_tasks: practicalSteps.map(step => 
              `Complete the exercise: ${step.title || 'Practice task'}`
            )
          }
        }
      };
    });

    // Update the lessons field
    this.lessons = convertedLessons;
    
    // Update metadata
    if (!this.courseMetadata) {
      this.courseMetadata = {};
    }
    this.courseMetadata.totalLessons = convertedLessons.length;
    this.courseMetadata.author = this.instructor?.name || 'Unknown';
    this.courseMetadata.courseDescription = this.description;

    return this.structuredFormat;
  }

  return this.structuredFormat;
};

// Indexes for better performance
updatedCourseSchema.index({ category: 1, difficulty: 1 });
updatedCourseSchema.index({ isActive: 1, isPremium: 1 });
updatedCourseSchema.index({ createdAt: -1 });
updatedCourseSchema.index({ 'instructor.name': 1 });
updatedCourseSchema.index({ tools: 1 });
updatedCourseSchema.index({ tags: 1 });

// Generate slug from title before saving
updatedCourseSchema.pre('save', function(next) {
  if (this.title && (!this.seo?.slug || this.isModified('title'))) {
    if (!this.seo) this.seo = {};
    this.seo.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }

  // Auto-update courseMetadata
  if (!this.courseMetadata) {
    this.courseMetadata = {};
  }
  this.courseMetadata.lastUpdated = new Date().toISOString();
  if (!this.courseMetadata.author && this.instructor?.name) {
    this.courseMetadata.author = this.instructor.name;
  }
  if (this.lessons?.length) {
    this.courseMetadata.totalLessons = this.lessons.length;
  } else if (this.curriculum?.length) {
    this.courseMetadata.totalLessons = this.curriculum.length;
  }

  next();
});

// Virtual for course URL
updatedCourseSchema.virtual('url').get(function() {
  return `/courses/${this.seo?.slug || this._id}`;
});

// Virtual for formatted price
updatedCourseSchema.virtual('formattedPrice').get(function() {
  if (this.price === 0) return 'Бесплатно';
  return `${this.price.toLocaleString()} UZS`;
});

// Static methods
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

// Instance method to increment views
updatedCourseSchema.methods.incrementViews = function() {
  if (!this.metadata) this.metadata = {};
  this.metadata.views = (this.metadata.views || 0) + 1;
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