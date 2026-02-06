const express = require('express');
const router = express.Router();
const UserProgress = require('../models/userProgress');
const CourseProgress = require('../models/courseProgress');
const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const SubjectProgress = require('../models/SubjectProgress');
const verifyToken = require('../middlewares/authMiddleware');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

// ✅ COMPLETELY FIXED: Get user analytics with proper lesson name resolution
router.get('/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params;

  try {

    // 🔐 Ensure user can only access their own analytics
    if (req.user?.uid !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied: user mismatch' 
      });
    }

    // ✅ STEP 1: Get user progress with proper lesson population
    const userProgress = await UserProgress.find({ userId })
      .populate({
        path: 'lessonId',
        model: 'Lesson',
        select: 'lessonName title topic topicId subject level'
      })
      .lean();

    // ✅ STEP 1b: Get course progress (course system) with course details
    const courseProgressRecords = await CourseProgress.find({ userId })
      .populate('courseId', 'title thumbnail lessons curriculum')
      .lean();

    const courseLessonsCompleted = courseProgressRecords.reduce(
      (sum, cp) => sum + (cp.completedLessons?.length || 0), 0
    );

    // ✅ STEP 2: Get all lessons for topic mapping
    const allLessons = await Lesson.find({}).lean();
    const lessonMap = new Map();
    allLessons.forEach(lesson => {
      lessonMap.set(lesson._id.toString(), lesson);
    });

    // ✅ STEP 3: Get all topics for name resolution
    const allTopics = await Topic.find({}).lean();
    const topicMap = new Map();
    allTopics.forEach(topic => {
      topicMap.set(topic._id.toString(), topic);
    });

    // ✅ STEP 4: Calculate basic metrics with proper data
    
    const completedProgress = userProgress.filter(p => p.completed);
    const completedLessonsCount = completedProgress.length;
    const totalLessonsAttempted = userProgress.length;

    // Calculate unique study days from ALL sources
    const uniqueDays = new Set();
    userProgress.forEach(progress => {
      if (progress.updatedAt) {
        uniqueDays.add(new Date(progress.updatedAt).toDateString());
      }
    });

    // Include course progress dates in study days
    courseProgressRecords.forEach(cp => {
      if (cp.updatedAt) uniqueDays.add(new Date(cp.updatedAt).toDateString());
      if (cp.lastAccessedAt) uniqueDays.add(new Date(cp.lastAccessedAt).toDateString());
      if (cp.startedAt) uniqueDays.add(new Date(cp.startedAt).toDateString());
    });

    // Time-based calculations
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const oneMonthAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    let weeklyLessons = userProgress.filter(p =>
      p.completed && p.updatedAt && new Date(p.updatedAt) > oneWeekAgo
    ).length;

    let monthlyLessons = userProgress.filter(p =>
      p.completed && p.updatedAt && new Date(p.updatedAt) > oneMonthAgo
    ).length;

    // Add course lessons completed recently
    courseProgressRecords.forEach(cp => {
      if (cp.updatedAt && new Date(cp.updatedAt) > oneWeekAgo && cp.completedLessons?.length > 0) {
        weeklyLessons += cp.completedLessons.length;
      }
      if (cp.updatedAt && new Date(cp.updatedAt) > oneMonthAgo && cp.completedLessons?.length > 0) {
        monthlyLessons += cp.completedLessons.length;
      }
    });

    // Calculate streak (simplified but working)
    const sortedDates = Array.from(uniqueDays)
      .map(dateStr => new Date(dateStr))
      .sort((a, b) => b - a);

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < sortedDates.length; i++) {
      const checkDate = new Date(today.getTime() - (i * 24 * 60 * 60 * 1000));
      checkDate.setHours(0, 0, 0, 0);
      
      const hasActivityOnDate = sortedDates.some(date => {
        date.setHours(0, 0, 0, 0);
        return date.getTime() === checkDate.getTime();
      });

      if (hasActivityOnDate) {
        streak++;
      } else {
        break;
      }
    }

    // Calculate totals
    const totalPoints = userProgress.reduce((sum, p) => sum + (p.points || 0), 0);
    const totalStars = userProgress.reduce((sum, p) => sum + (p.stars || 0), 0);
    const hintsUsed = userProgress.reduce((sum, p) => sum + (p.hintsUsed || 0), 0);
    const avgPointsPerDay = uniqueDays.size > 0 ? Math.round(totalPoints / uniqueDays.size) : 0;

    // Calculate average time
    const validDurations = userProgress
      .map(p => p.duration || 0)
      .filter(duration => duration > 0);
    
    const averageTime = validDurations.length > 0
      ? Math.round(validDurations.reduce((a, b) => a + b, 0) / validDurations.length)
      : 0;

    // ✅ STEP 5: Build topic/subject progress with proper names
    const topicProgressMap = new Map();
    
    // Group lessons by topic
    allLessons.forEach(lesson => {
      if (lesson.topicId) {
        const topicIdStr = lesson.topicId.toString();
        const topic = topicMap.get(topicIdStr);
        const topicName = topic?.name || lesson.topic || 'Unknown Topic';
        
        if (!topicProgressMap.has(topicIdStr)) {
          topicProgressMap.set(topicIdStr, {
            name: topicName,
            subject: lesson.subject || 'General',
            totalLessons: 0,
            completedLessons: 0,
            progress: 0
          });
        }
        topicProgressMap.get(topicIdStr).totalLessons++;
      }
    });

    // Count completed lessons per topic
    completedProgress.forEach(progress => {
      const lesson = lessonMap.get(progress.lessonId.toString());
      if (lesson && lesson.topicId) {
        const topicIdStr = lesson.topicId.toString();
        if (topicProgressMap.has(topicIdStr)) {
          topicProgressMap.get(topicIdStr).completedLessons++;
        }
      }
    });

    // Calculate progress percentages
    const topics = Array.from(topicProgressMap.values()).map(topic => ({
      ...topic,
      progress: topic.totalLessons > 0 ? Math.round((topic.completedLessons / topic.totalLessons) * 100) : 0
    }));

    // ✅ STEP 6: Build subject progress (grouped by subject)
    const subjectProgressMap = new Map();
    topics.forEach(topic => {
      if (!subjectProgressMap.has(topic.subject)) {
        subjectProgressMap.set(topic.subject, {
          name: topic.subject,
          totalLessons: 0,
          completedLessons: 0,
          topicsCount: 0
        });
      }
      const subject = subjectProgressMap.get(topic.subject);
      subject.totalLessons += topic.totalLessons;
      subject.completedLessons += topic.completedLessons;
      subject.topicsCount++;
    });

    const subjects = Array.from(subjectProgressMap.values()).map(subject => ({
      name: subject.name,
      progress: subject.totalLessons > 0 ? Math.round((subject.completedLessons / subject.totalLessons) * 100) : 0,
      topicsCount: subject.topicsCount
    }));

    // ✅ STEP 7: Build recent activity from BOTH lesson and course systems
    // Legacy lesson progress activity
    const lessonRecentActivity = userProgress
      .filter(p => p.updatedAt || p.completedAt || p.createdAt)
      .sort((a, b) => {
        const dateA = a.completedAt || a.updatedAt || a.createdAt;
        const dateB = b.completedAt || b.updatedAt || b.createdAt;
        return new Date(dateB) - new Date(dateA);
      })
      .slice(0, 15)
      .map(progress => {
        let lessonName = 'Unknown Lesson';
        let topicName = 'Unknown Topic';

        if (progress.lessonId && typeof progress.lessonId === 'object') {
          lessonName = progress.lessonId.lessonName || progress.lessonId.title || 'Lesson';

          if (progress.lessonId.topicId) {
            const topic = topicMap.get(progress.lessonId.topicId.toString());
            topicName = topic?.name || progress.lessonId.topic || 'Topic';
          } else if (progress.lessonId.topic) {
            topicName = progress.lessonId.topic;
          }
        } else if (progress.lessonId) {
          const lesson = lessonMap.get(progress.lessonId.toString());
          if (lesson) {
            lessonName = lesson.lessonName || lesson.title || 'Lesson';

            if (lesson.topicId) {
              const topic = topicMap.get(lesson.topicId.toString());
              topicName = topic?.name || lesson.topic || 'Topic';
            } else if (lesson.topic) {
              topicName = lesson.topic;
            }
          }
        }

        return {
          date: progress.completedAt || progress.updatedAt || progress.createdAt,
          lesson: lessonName,
          lessonId: progress.lessonId?._id || progress.lessonId,
          topic: topicName,
          points: progress.points || 0,
          duration: progress.duration || 0,
          completed: progress.completed || false,
          stars: progress.stars || 0,
          mistakes: progress.mistakes || 0,
          progressPercent: progress.progressPercent || 0,
          type: 'lesson'
        };
      });

    // Course progress activity
    const courseRecentActivity = [];
    courseProgressRecords.forEach(cp => {
      if (!cp.completedLessons || cp.completedLessons.length === 0) return;
      const courseName = (cp.courseId && typeof cp.courseId === 'object') ? cp.courseId.title : 'Course';
      const courseLessonsList = (cp.courseId && typeof cp.courseId === 'object')
        ? (cp.courseId.lessons || cp.courseId.curriculum || [])
        : [];

      cp.completedLessons.forEach(lessonNum => {
        const lesson = courseLessonsList.find(l => (l.lessonNumber || l.order) === lessonNum);
        const lessonTitle = lesson?.title || `Урок ${lessonNum}`;
        courseRecentActivity.push({
          date: cp.updatedAt || cp.lastAccessedAt,
          lesson: `${lessonTitle} (${courseName})`,
          topic: courseName,
          points: 0,
          duration: cp.totalTimeSpent ? Math.round(cp.totalTimeSpent / Math.max(1, cp.completedLessons.length)) : 0,
          completed: true,
          stars: 0,
          mistakes: 0,
          progressPercent: 100,
          type: 'course'
        });
      });
    });

    // Merge and sort all recent activity by date
    const recentActivity = [...lessonRecentActivity, ...courseRecentActivity]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 15);

    // ✅ STEP 8: Knowledge chart (monthly progress from BOTH systems)
    const chart = Array(12).fill(0);
    const currentMonth = now.getMonth();

    userProgress.forEach(progress => {
      if (progress.updatedAt && progress.completed) {
        const progressDate = new Date(progress.updatedAt);
        const monthsAgo = (currentMonth - progressDate.getMonth() + 12) % 12;
        if (monthsAgo < 12) {
          chart[11 - monthsAgo] += progress.points || 1;
        }
      }
    });

    // Include course progress in the knowledge chart
    courseProgressRecords.forEach(cp => {
      if (cp.updatedAt && cp.completedLessons?.length > 0) {
        const progressDate = new Date(cp.updatedAt);
        const monthsAgo = (currentMonth - progressDate.getMonth() + 12) % 12;
        if (monthsAgo < 12) {
          chart[11 - monthsAgo] += cp.completedLessons.length;
        }
      }
    });

    // ✅ STEP 9: Most active day calculation
    const dayCount = {};
    const dayNames = {
      0: 'Воскресенье', 1: 'Понедельник', 2: 'Вторник', 
      3: 'Среда', 4: 'Четверг', 5: 'Пятница', 6: 'Суббота'
    };
    
    userProgress.forEach(progress => {
      if (progress.updatedAt) {
        try {
          const dayIndex = new Date(progress.updatedAt).getDay();
          const dayName = dayNames[dayIndex];
          dayCount[dayName] = (dayCount[dayName] || 0) + 1;
        } catch (err) {
        }
      }
    });
    // Include course progress in active day calculation
    courseProgressRecords.forEach(cp => {
      if (cp.updatedAt) {
        try {
          const dayIndex = new Date(cp.updatedAt).getDay();
          const dayName = dayNames[dayIndex];
          dayCount[dayName] = (dayCount[dayName] || 0) + (cp.completedLessons?.length || 1);
        } catch (err) {
        }
      }
    });
    const mostActiveDay = Object.entries(dayCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // ✅ CALCULATE TOPIC STATS PROPERLY
    // A topic is "completed" if ALL its lessons are done (100%)
    // A topic is "in progress" if at least one lesson is done but not all
    const fullyCompletedTopics = topics.filter(t => t.progress === 100 && t.totalLessons > 0);
    const inProgressTopics = topics.filter(t => t.progress > 0 && t.progress < 100);
    const startedTopics = topics.filter(t => t.completedLessons > 0);

    // ✅ COURSE PROGRESS: Fetch course analytics for this user
    let courseAnalytics = {
      totalCoursesStarted: 0,
      totalCoursesCompleted: 0,
      averageProgress: 0,
      totalTimeSpent: 0,
      totalLessonsCompleted: 0,
      totalHomeworkCompleted: 0,
      inProgressCourses: [],
      recentlyCompleted: []
    };
    try {
      courseAnalytics = await CourseProgress.getUserCourseAnalytics(userId);
    } catch (err) {
      console.error('Error fetching course analytics:', err.message);
    }

    // ✅ FINAL RESPONSE: Properly structured analytics
    const analyticsData = {
      success: true,
      data: {
        // ✅ BASIC STATS (corrected terminology)
        studyDays: uniqueDays.size,
        totalDays: Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)),

        // ✅ LESSON STATS (includes both legacy lessons AND course lessons)
        totalLessonsDone: completedLessonsCount + courseLessonsCompleted,
        totalLessonsAttempted: totalLessonsAttempted,

        // ✅ TOPIC STATS - FIXED: Show meaningful progress
        completedTopics: fullyCompletedTopics.length, // Topics at 100%
        topicsInProgress: inProgressTopics.length,    // Topics started but not complete
        topicsStarted: startedTopics.length,          // Any topic with completed lessons
        totalTopics: topics.length,

        // ✅ SUBJECT STATS (grouped topics)
        completedSubjects: subjects.filter(s => s.progress === 100).length,
        subjectsInProgress: subjects.filter(s => s.progress > 0 && s.progress < 100).length,
        totalSubjects: subjects.length,

        // ✅ COURSE STATS (from CourseProgress model)
        courseStats: {
          totalCoursesStarted: courseAnalytics.totalCoursesStarted,
          totalCoursesCompleted: courseAnalytics.totalCoursesCompleted,
          averageCourseProgress: Math.round(courseAnalytics.averageProgress || 0),
          courseLessonsCompleted: courseAnalytics.totalLessonsCompleted,
          courseHomeworkCompleted: courseAnalytics.totalHomeworkCompleted,
          courseTotalTimeSpent: courseAnalytics.totalTimeSpent,
          inProgressCourses: courseAnalytics.inProgressCourses,
          recentlyCompletedCourses: courseAnalytics.recentlyCompleted
        },

        // ✅ TIME-BASED METRICS
        weeklyLessons,
        monthlyLessons,
        streakDays: streak,
        averageTime,

        // ✅ PERFORMANCE METRICS
        totalPoints,
        totalStars,
        hintsUsed,
        avgPointsPerDay,

        // ✅ CHARTS AND PROGRESS
        knowledgeChart: chart,
        subjects: subjects,
        topics: topics.map(t => ({
          ...t,
          isCompleted: t.progress === 100,
          isInProgress: t.progress > 0 && t.progress < 100
        })),

        // ✅ ACTIVITY PATTERNS
        mostActiveDay,
        recentActivity,

        // ✅ METADATA
        lastUpdated: new Date().toISOString(),
        dataQuality: {
          hasActivityData: userProgress.length > 0 || courseProgressRecords.length > 0,
          hasSubjectData: subjects.length > 0,
          hasTopicData: topics.length > 0,
          hasCourseData: courseProgressRecords.length > 0,
          validDates: userProgress.filter(p => p.updatedAt || p.completedAt).length,
          totalProgressRecords: userProgress.length + courseProgressRecords.length
        }
      }
    };

    
    res.json(analyticsData);

  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching analytics',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ FIXED: PDF generation with proper lesson names
router.post('/generate-report', verifyToken, async (req, res) => {
  const { userId } = req.body;

  try {
    
    if (req.user?.uid !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied: user mismatch' 
      });
    }

    // ✅ Get progress with proper lesson population
    const userProgress = await UserProgress.find({ userId })
      .populate({
        path: 'lessonId',
        model: 'Lesson',
        select: 'lessonName title topic topicId subject'
      })
      .lean();

    // ✅ Get additional data
    const allLessons = await Lesson.find({}).lean();
    const allTopics = await Topic.find({}).lean();
    
    const lessonMap = new Map();
    allLessons.forEach(lesson => {
      lessonMap.set(lesson._id.toString(), lesson);
    });
    
    const topicMap = new Map();
    allTopics.forEach(topic => {
      topicMap.set(topic._id.toString(), topic);
    });


    // Create PDF document
    const doc = new PDFDocument();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="aced-analytics-report.pdf"');
    doc.pipe(res);

    // Add content to PDF
    doc.fontSize(20).text('ACED Learning Analytics Report', 50, 50);
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleDateString('ru-RU')}`, 50, 80);

    // Basic stats
    const completedLessons = userProgress.filter(p => p.completed).length;
    const totalPoints = userProgress.reduce((sum, p) => sum + (p.points || 0), 0);
    const totalStars = userProgress.reduce((sum, p) => sum + (p.stars || 0), 0);
    
    // Calculate unique study days
    const uniqueDays = new Set();
    userProgress.forEach(progress => {
      if (progress.updatedAt) {
        uniqueDays.add(new Date(progress.updatedAt).toDateString());
      }
    });

    // Calculate average time
    const validDurations = userProgress
      .map(p => p.duration || 0)
      .filter(duration => duration > 0);
    
    const averageTime = validDurations.length > 0
      ? Math.round(validDurations.reduce((a, b) => a + b, 0) / validDurations.length)
      : 0;

    doc.moveDown();
    doc.text(`Total Lessons Completed: ${completedLessons}`, 50, 120);
    doc.text(`Total Lessons Attempted: ${userProgress.length}`, 50, 140);
    doc.text(`Study Days: ${uniqueDays.size}`, 50, 160);
    doc.text(`Total Points Earned: ${totalPoints}`, 50, 180);
    doc.text(`Total Stars Earned: ${totalStars}`, 50, 200);
    doc.text(`Average Session Time: ${averageTime} minutes`, 50, 220);

    // Recent activity with proper lesson names
    if (userProgress.length > 0) {
      const recentProgress = userProgress
        .filter(p => p.completed)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 15);
        
      doc.addPage();
      doc.fontSize(16).text('Recent Completed Lessons:', 50, 50);
      let yPos = 80;
      
      recentProgress.forEach(progress => {
        if (yPos > 750) {
          doc.addPage();
          yPos = 50;
          doc.fontSize(16).text('Recent Activity (continued):', 50, 50);
          yPos = 80;
        }
        
        // ✅ Get proper lesson name
        let lessonName = 'Unknown Lesson';
        let topicName = 'Unknown Topic';
        
        if (progress.lessonId && typeof progress.lessonId === 'object') {
          lessonName = progress.lessonId.lessonName || progress.lessonId.title || 'Lesson';
          topicName = progress.lessonId.topic || 'Topic';
        } else {
          const lesson = lessonMap.get(progress.lessonId.toString());
          if (lesson) {
            lessonName = lesson.lessonName || lesson.title || 'Lesson';
            
            if (lesson.topicId) {
              const topic = topicMap.get(lesson.topicId.toString());
              topicName = topic?.name || lesson.topic || 'Topic';
            } else {
              topicName = lesson.topic || 'Topic';
            }
          }
        }
        
        doc.fontSize(12)
          .text(`${new Date(progress.updatedAt).toLocaleDateString('ru-RU')}: ${lessonName}`, 70, yPos);
        doc.fontSize(10)
          .text(`Topic: ${topicName} | Points: ${progress.points || 0} | Stars: ${progress.stars || 0}`, 70, yPos + 15);
        yPos += 35;
      });
    }

    doc.end();

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error generating PDF report',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Keep other routes unchanged
router.get('/:userId/summary', verifyToken, async (req, res) => {
  const { userId } = req.params;

  try {
    if (req.user?.uid !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied: user mismatch' 
      });
    }

    const completedLessons = await UserProgress.countDocuments({ userId, completed: true });
    const totalProgress = await UserProgress.countDocuments({ userId });
    
    res.json({
      success: true,
      data: {
        totalLessons: completedLessons,
        totalAttempted: totalProgress,
        completionRate: totalProgress > 0 ? Math.round((completedLessons / totalProgress) * 100) : 0
      }
    });

  } catch (error) {
    console.error('❌ Analytics summary error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching analytics summary' 
    });
  }
});

router.post('/send-report', verifyToken, async (req, res) => {
  const { userId, to, subject, content } = req.body;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid email address' 
    });
  }

  try {
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
      return res.status(500).json({ 
        success: false,
        error: 'Email service not configured' 
      });
    }

    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.MAIL_USER,
      to,
      subject,
      html: content
    };

    const info = await transporter.sendMail(mailOptions);
    
    res.status(200).json({ 
      success: true,
      message: 'Email sent successfully!',
      messageId: info.messageId
    });

  } catch (err) {
    console.error('❌ Email sending error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send email',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

router.get('/health', (req, res) => {
  res.json({
    status: 'Analytics API is healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;