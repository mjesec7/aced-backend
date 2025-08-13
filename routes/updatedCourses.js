// routes/updatedCourses.js - ENHANCED VERSION WITH COMPREHENSIVE PDF SUPPORT
const express = require('express');
const router = express.Router();
const UpdatedCourse = require('../models/updatedCourse');
const authenticateUser = require('../middlewares/authMiddleware');

// ========================================
// 📚 PUBLIC ROUTES (for main frontend)
// ========================================

// GET /api/updated-courses - Get all updated courses (public, for main website)
router.get('/', async (req, res) => {
  try {
    console.log('📥 Fetching updated courses for main website...');
    
    const {
      category,
      difficulty,
      search,
      limit = 50,
      page = 1,
      sort = 'newest',
      type = 'all' // Filter by course or guide
    } = req.query;

    // Build filter
    const filter = { 
      isActive: true,
      status: 'published'
    };

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (difficulty && difficulty !== 'all') {
      filter.difficulty = difficulty;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tools: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Apply type filter
    if (type === 'courses') {
      filter.isGuide = { $ne: true };
    } else if (type === 'guides') {
      filter.isGuide = true;
    }

    // Build sort
    let sortQuery = {};
    switch (sort) {
      case 'popular':
        sortQuery = { studentsCount: -1 };
        break;
      case 'rating':
        sortQuery = { rating: -1 };
        break;
      case 'duration':
        sortQuery = { 'estimatedTime.hours': 1 };
        break;
      case 'newest':
      default:
        sortQuery = { createdAt: -1 };
    }

    // Execute query
    const courses = await UpdatedCourse.find(filter)
      .sort(sortQuery)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-seo -metadata.views -createdBy -updatedBy')
      .lean();

    // ✅ ENHANCED: Ensure proper course data structure for frontend with PDF support
    const coursesWithBookmarks = courses.map(course => ({
      ...course,
      id: course._id.toString(),
      _id: course._id.toString(),
      isBookmarked: false,
      
      // ✅ Enhanced curriculum structure
      curriculum: course.curriculum || [],
      
      // ✅ Enhanced instructor structure
      instructor: {
        name: course.instructor?.name || 'Unknown Instructor',
        avatar: course.instructor?.avatar || '/default-avatar.jpg',
        bio: course.instructor?.bio || ''
      },

      // ✅ NEW: PDF and resources information for frontend
      hasMainPdf: !!(course.isGuide && course.guidePdf?.url),
      mainPdf: course.isGuide && course.guidePdf ? {
        title: course.guidePdf.title || course.title + ' - Guide',
        url: course.guidePdf.url,
        filename: course.guidePdf.filename,
        size: course.guidePdf.size,
        downloadCount: course.guidePdf.downloadCount || 0
      } : null,

      // ✅ NEW: Additional resources for frontend
      resources: (course.resources || []).map(resource => ({
        id: resource._id?.toString() || `resource_${Math.random()}`,
        type: resource.type,
        title: resource.title,
        description: resource.description,
        url: resource.url,
        filename: resource.filename,
        size: resource.size,
        downloadable: resource.downloadable,
        premiumOnly: resource.premiumOnly,
        downloadCount: resource.downloadCount || 0
      })),

      // ✅ NEW: Resource counts for frontend display
      resourceCounts: {
        total: (course.resources?.length || 0) + (course.isGuide && course.guidePdf?.url ? 1 : 0),
        pdfs: (course.resources?.filter(r => r.type === 'pdf').length || 0) + (course.isGuide && course.guidePdf?.url ? 1 : 0),
        documents: course.resources?.filter(r => ['document', 'template', 'worksheet'].includes(r.type)).length || 0,
        free: course.resources?.filter(r => !r.premiumOnly).length || 0,
        premium: course.resources?.filter(r => r.premiumOnly).length || 0
      },

      // ✅ Content type information
      contentType: course.isGuide ? 'guide' : 'course',
      totalDownloads: course.metadata?.totalDownloads || 0
    }));

    const total = await UpdatedCourse.countDocuments(filter);

    console.log(`✅ Found ${courses.length} updated courses for frontend`);

    res.json({
      success: true,
      courses: coursesWithBookmarks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      categories: await UpdatedCourse.getCategories(),
      difficulties: await UpdatedCourse.getDifficultyLevels()
    });

  } catch (error) {
    console.error('❌ Error fetching updated courses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch updated courses',
      details: error.message
    });
  }
});

// ✅ ENHANCED: Get single course by ID with comprehensive PDF data
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const course = await UpdatedCourse.findOne({
      $or: [
        { _id: id },
        { 'seo.slug': id }
      ],
      isActive: true,
      status: 'published'
    }).select('-createdBy -updatedBy');

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    // Increment views
    await course.incrementViews();

    // ✅ ENHANCED: Structure the response properly for frontend consumption with PDF support
    const courseData = {
      ...course.toObject(),
      id: course._id.toString(),
      _id: course._id.toString(),
      isBookmarked: false,

      // ✅ Enhanced main PDF information
      hasMainPdf: !!(course.isGuide && course.guidePdf?.url),
      mainPdf: course.isGuide && course.guidePdf ? {
        title: course.guidePdf.title || course.title + ' - Guide',
        description: course.guidePdf.description || '',
        url: course.guidePdf.url,
        filename: course.guidePdf.filename,
        size: course.guidePdf.size,
        downloadCount: course.guidePdf.downloadCount || 0,
        viewerUrl: course.guidePdf.url + '#view=FitH',
        downloadUrl: `/api/files/pdf/${encodeURIComponent(course.guidePdf.filename)}/download`
      } : null,

      // ✅ Enhanced resources with download information
      resources: (course.resources || []).map(resource => ({
        id: resource._id?.toString() || `resource_${Math.random()}`,
        type: resource.type,
        title: resource.title,
        description: resource.description,
        url: resource.url,
        filename: resource.filename,
        size: resource.size,
        downloadable: resource.downloadable,
        premiumOnly: resource.premiumOnly,
        downloadCount: resource.downloadCount || 0,
        order: resource.order || 0,
        icon: getFileIcon(resource.filename),
        formattedSize: formatFileSize(resource.size)
      })).sort((a, b) => a.order - b.order),

      // ✅ Convert curriculum to lessons format with enhanced PDF support
      lessons: course.curriculum.map((lesson, index) => ({
        id: lesson._id?.toString() || `lesson_${index}`,
        _id: lesson._id?.toString() || `lesson_${index}`,
        title: lesson.title,
        lessonName: lesson.title,
        description: lesson.description,
        duration: lesson.duration || '30 min',
        order: lesson.order || index,
        
        // ✅ Enhanced steps with PDF attachments
        steps: (lesson.steps || []).map((step, stepIndex) => {
          const processedStep = {
            id: `step_${index}_${stepIndex}`,
            type: step.type,
            data: step.data || {},
            content: step.content,
            title: step.title,
            description: step.description,
            
            // ✅ Enhanced images
            images: (step.images || []).map(image => ({
              url: image.url,
              caption: image.caption,
              filename: image.filename,
              size: image.size,
              thumbnail: image.thumbnail || image.url
            })),

            // ✅ NEW: PDF attachments for frontend
            attachments: (step.attachments || []).map(attachment => ({
              id: attachment._id?.toString() || `attachment_${Math.random()}`,
              type: attachment.type,
              title: attachment.title,
              description: attachment.description,
              url: attachment.url,
              filename: attachment.filename,
              size: attachment.size,
              downloadable: attachment.downloadable,
              premiumOnly: attachment.premiumOnly,
              icon: getFileIcon(attachment.filename),
              formattedSize: formatFileSize(attachment.size),
              downloadUrl: attachment.downloadable ? attachment.url : null
            }))
          };

          // ✅ Handle step-specific data
          switch (step.type) {
            case 'explanation':
            case 'example':
            case 'reading':
              processedStep.data = {
                content: step.data?.content || step.content || '',
                images: processedStep.images
              };
              break;

            case 'practice':
              processedStep.data = {
                instructions: step.data?.instructions || step.instructions || '',
                type: step.data?.type || 'guided'
              };
              break;

            case 'quiz':
              processedStep.data = step.data?.quizzes || step.quizzes || [];
              break;

            case 'download':
              processedStep.data = {
                attachments: processedStep.attachments,
                description: step.description || 'Download the attached resources'
              };
              break;

            default:
              processedStep.data = step.data || {};
          }

          return processedStep;
        })
      })),

      // ✅ NEW: Enhanced metadata
      downloadableFiles: course.getAllDownloadableFiles ? course.getAllDownloadableFiles() : [],
      totalResourcesCount: course.totalResourcesCount || 0,
      contentType: course.isGuide ? 'guide' : 'course',
      totalDownloads: course.metadata?.totalDownloads || 0
    };

    res.json({
      success: true,
      course: courseData
    });

  } catch (error) {
    console.error('❌ Error fetching course:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch course'
    });
  }
});

// ✅ NEW: Download tracking endpoint
router.post('/:id/track-download', async (req, res) => {
  try {
    const { id } = req.params;
    const { resourceType, resourceId } = req.body;

    const course = await UpdatedCourse.findById(id);
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    // Track download based on resource type
    switch (resourceType) {
      case 'guide':
        await course.incrementGuideDownload();
        break;
      case 'resource':
        await course.incrementResourceDownload(resourceId);
        break;
      default:
        // General download tracking
        course.metadata.totalDownloads = (course.metadata.totalDownloads || 0) + 1;
        await course.save();
    }

    res.json({
      success: true,
      message: 'Download tracked successfully'
    });

  } catch (error) {
    console.error('❌ Error tracking download:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track download'
    });
  }
});

// ========================================
// 🛡️ ADMIN ROUTES (require authentication)
// ========================================

// ✅ ENHANCED: Create new course with PDF support
router.post('/admin', authenticateUser, async (req, res) => {
  try {
    console.log('📤 Admin: Creating new updated course with PDF support...');
    
    const courseData = {
      ...req.body,
      createdBy: req.user.uid || req.user.email || 'admin',
      updatedBy: req.user.uid || req.user.email || 'admin'
    };

    // ✅ Enhanced validation for PDF fields
    const requiredFields = ['title', 'description', 'category', 'instructor'];
    const missingFields = requiredFields.filter(field => {
      if (field === 'instructor') {
        return !courseData.instructor || !courseData.instructor.name;
      }
      return !courseData[field];
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        missingFields
      });
    }

    // ✅ Guide-specific validation
    if (courseData.isGuide && (!courseData.guidePdf || !courseData.guidePdf.url)) {
      return res.status(400).json({
        success: false,
        error: 'Main PDF is required for guides'
      });
    }

    // ✅ Course-specific validation
    if (!courseData.isGuide && (!courseData.curriculum || courseData.curriculum.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'At least one lesson is required for courses'
      });
    }

    // ✅ ENHANCED: Process curriculum with PDF attachments
    if (courseData.curriculum && Array.isArray(courseData.curriculum)) {
      courseData.curriculum = courseData.curriculum.map(lesson => ({
        ...lesson,
        steps: (lesson.steps || []).map(step => {
          const processedStep = { ...step };
          
          // ✅ Process step attachments
          if (step.attachments && Array.isArray(step.attachments)) {
            processedStep.attachments = step.attachments
              .filter(attachment => attachment.url && attachment.title)
              .map(attachment => ({
                type: attachment.type || 'pdf',
                title: attachment.title.trim(),
                url: attachment.url,
                filename: attachment.filename || attachment.url.split('/').pop(),
                size: attachment.size || 0,
                description: attachment.description?.trim() || '',
                downloadable: Boolean(attachment.downloadable !== false),
                premiumOnly: Boolean(attachment.premiumOnly)
              }));
          }
          
          // ✅ Process step images
          if (step.images && Array.isArray(step.images)) {
            processedStep.images = step.images.map(image => ({
              url: image.url,
              caption: image.caption || '',
              filename: image.filename || 'image',
              size: image.size || 0,
              thumbnail: image.thumbnail || image.url
            }));
          }
          
          return processedStep;
        })
      }));
    }

    // ✅ ENHANCED: Process additional resources
    if (courseData.resources && Array.isArray(courseData.resources)) {
      courseData.resources = courseData.resources
        .filter(resource => resource.url && resource.title)
        .map((resource, index) => ({
          type: resource.type || 'pdf',
          title: resource.title.trim(),
          description: resource.description?.trim() || '',
          url: resource.url,
          filename: resource.filename || resource.url.split('/').pop(),
          size: resource.size || 0,
          downloadable: Boolean(resource.downloadable !== false),
          premiumOnly: Boolean(resource.premiumOnly),
          order: resource.order || index,
          downloadCount: 0
        }));
    }

    // ✅ ENHANCED: Process main guide PDF
    if (courseData.isGuide && courseData.guidePdf) {
      courseData.guidePdf = {
        url: courseData.guidePdf.url,
        filename: courseData.guidePdf.filename || 'guide.pdf',
        size: courseData.guidePdf.size || 0,
        title: courseData.guidePdf.title || courseData.title + ' - Guide',
        description: courseData.guidePdf.description || '',
        downloadCount: 0
      };
    }

    const course = new UpdatedCourse(courseData);
    await course.save();

    console.log('✅ Admin: Enhanced updated course created:', course.title);

    res.status(201).json({
      success: true,
      course: course,
      message: 'Course created successfully'
    });

  } catch (error) {
    console.error('❌ Admin: Error creating updated course:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Duplicate course slug. Please choose a different title.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create course',
      details: error.message
    });
  }
});

// ✅ ENHANCED: Update course with PDF support
router.put('/admin/:id', authenticateUser, async (req, res) => {
  try {
    console.log('📝 Admin: Updating updated course with PDF support:', req.params.id);
    
    const updateData = {
      ...req.body,
      updatedBy: req.user.uid || req.user.email || 'admin'
    };

    // ✅ ENHANCED: Process curriculum with PDF attachments on update
    if (updateData.curriculum && Array.isArray(updateData.curriculum)) {
      updateData.curriculum = updateData.curriculum.map(lesson => ({
        ...lesson,
        steps: (lesson.steps || []).map(step => {
          const processedStep = { ...step };
          
          // Process attachments
          if (step.attachments && Array.isArray(step.attachments)) {
            processedStep.attachments = step.attachments
              .filter(attachment => attachment.url && attachment.title);
          }
          
          // Process images
          if (step.images && Array.isArray(step.images)) {
            processedStep.images = step.images
              .filter(image => image.url);
          }
          
          return processedStep;
        })
      }));
    }

    // ✅ ENHANCED: Process resources on update
    if (updateData.resources && Array.isArray(updateData.resources)) {
      updateData.resources = updateData.resources
        .filter(resource => resource.url && resource.title);
    }

    const course = await UpdatedCourse.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    console.log('✅ Admin: Enhanced updated course updated:', course.title);

    res.json({
      success: true,
      course: course,
      message: 'Course updated successfully'
    });

  } catch (error) {
    console.error('❌ Admin: Error updating updated course:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update course',
      details: error.message
    });
  }
});

// ✅ NEW: Get course analytics including PDF metrics
router.get('/admin/:id/analytics', authenticateUser, async (req, res) => {
  try {
    const course = await UpdatedCourse.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    // Calculate analytics
    const analytics = {
      basic: {
        views: course.metadata?.views || 0,
        studentsCount: course.studentsCount || 0,
        rating: course.rating || 0,
        totalDownloads: course.metadata?.totalDownloads || 0
      },
      downloads: {
        guidePdf: course.isGuide && course.guidePdf ? {
          title: course.guidePdf.title,
          downloadCount: course.guidePdf.downloadCount || 0,
          lastDownloaded: course.guidePdf.lastDownloaded
        } : null,
        resources: (course.resources || []).map(resource => ({
          title: resource.title,
          type: resource.type,
          downloadCount: resource.downloadCount || 0,
          lastDownloaded: resource.lastDownloaded
        })),
        totalResourceDownloads: (course.resources || []).reduce((sum, r) => sum + (r.downloadCount || 0), 0)
      },
      content: {
        type: course.isGuide ? 'guide' : 'course',
        lessonsCount: course.curriculum?.length || 0,
        resourcesCount: course.resources?.length || 0,
        totalResourcesCount: course.totalResourcesCount || 0,
        hasMainPdf: !!(course.isGuide && course.guidePdf?.url)
      },
      engagement: {
        viewsToDownloadRatio: course.metadata?.views > 0 ? 
          ((course.metadata?.totalDownloads || 0) / course.metadata.views * 100).toFixed(2) + '%' : '0%',
        averageDownloadsPerResource: course.resources?.length > 0 ? 
          Math.round((course.metadata?.totalDownloads || 0) / course.resources.length) : 0
      }
    };

    res.json({
      success: true,
      analytics: analytics
    });

  } catch (error) {
    console.error('❌ Admin: Error fetching course analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch course analytics'
    });
  }
});

// ✅ Enhanced statistics with PDF metrics
router.get('/admin/stats', authenticateUser, async (req, res) => {
  try {
    const stats = {
      overview: {
        total: await UpdatedCourse.countDocuments(),
        published: await UpdatedCourse.countDocuments({ status: 'published' }),
        draft: await UpdatedCourse.countDocuments({ status: 'draft' }),
        archived: await UpdatedCourse.countDocuments({ status: 'archived' })
      },
      contentTypes: {
        courses: await UpdatedCourse.countDocuments({ isGuide: { $ne: true } }),
        guides: await UpdatedCourse.countDocuments({ isGuide: true })
      },
      byCategory: {},
      byDifficulty: {},
      premium: {
        total: await UpdatedCourse.countDocuments({ isPremium: true }),
        free: await UpdatedCourse.countDocuments({ isPremium: false })
      },
      // ✅ NEW: PDF and resource statistics
      resources: {
        coursesWithPdfs: await UpdatedCourse.countDocuments({
          $or: [
            { 'guidePdf.url': { $exists: true, $ne: null } },
            { 'resources.0': { $exists: true } }
          ]
        }),
        totalPdfDownloads: await UpdatedCourse.aggregate([
          { $group: { _id: null, total: { $sum: '$metadata.totalDownloads' } } }
        ]),
        averageResourcesPerCourse: await UpdatedCourse.aggregate([
          { $group: { _id: null, avg: { $avg: { $size: { $ifNull: ['$resources', []] } } } } }
        ])
      },
      engagement: {
        totalViews: await UpdatedCourse.aggregate([
          { $group: { _id: null, total: { $sum: '$metadata.views' } } }
        ]),
        averageRating: await UpdatedCourse.aggregate([
          { $group: { _id: null, avg: { $avg: '$rating' } } }
        ]),
        totalStudents: await UpdatedCourse.aggregate([
          { $group: { _id: null, total: { $sum: '$studentsCount' } } }
        ])
      }
    };

    // Category breakdown
    const categories = await UpdatedCourse.getCategories();
    for (const category of categories) {
      stats.byCategory[category] = await UpdatedCourse.countDocuments({ 
        category, 
        status: 'published' 
      });
    }

    // Difficulty breakdown
    const difficulties = await UpdatedCourse.getDifficultyLevels();
    for (const difficulty of difficulties) {
      stats.byDifficulty[difficulty] = await UpdatedCourse.countDocuments({ 
        difficulty, 
        status: 'published' 
      });
    }

    res.json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('❌ Admin: Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// ========================================
// 🔧 UTILITY FUNCTIONS
// ========================================

function getFileIcon(filename) {
  if (!filename) return '📄';
  
  const ext = filename.split('.').pop()?.toLowerCase();
  const icons = {
    'pdf': '📄',
    'doc': '📝',
    'docx': '📝',
    'txt': '📋',
    'zip': '📦',
    'rar': '📦',
    'xlsx': '📊',
    'xls': '📊'
  };
  
  return icons[ext] || '📄';
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;