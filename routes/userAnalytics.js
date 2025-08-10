const express = require('express');
const router = express.Router();
const UserProgress = require('../models/userProgress');
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

    // Calculate unique study days
    const uniqueDays = new Set();
    userProgress.forEach(progress => {
      if (progress.updatedAt) {
        uniqueDays.add(new Date(progress.updatedAt).toDateString());
      }
    });

    // Time-based calculations
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const oneMonthAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    const weeklyLessons = userProgress.filter(p => 
      p.completed && p.updatedAt && new Date(p.updatedAt) > oneWeekAgo
    ).length;

    const monthlyLessons = userProgress.filter(p => 
      p.completed && p.updatedAt && new Date(p.updatedAt) > oneMonthAgo
    ).length;

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

    // ✅ STEP 7: Build recent activity with PROPER lesson names
    const recentActivity = userProgress
      .filter(p => p.updatedAt && new Date(p.updatedAt) > oneWeekAgo)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 10)
      .map(progress => {
        // Get lesson details
        let lessonName = 'Unknown Lesson';
        let topicName = 'Unknown Topic';
        
        // Try to get from populated lesson first
        if (progress.lessonId && typeof progress.lessonId === 'object') {
          lessonName = progress.lessonId.lessonName || progress.lessonId.title || 'Lesson';
          
          // Get topic name from lesson's topic field or topicId
          if (progress.lessonId.topicId) {
            const topic = topicMap.get(progress.lessonId.topicId.toString());
            topicName = topic?.name || progress.lessonId.topic || 'Topic';
          } else if (progress.lessonId.topic) {
            topicName = progress.lessonId.topic;
          }
        } else {
          // Fallback: get from lesson map
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
          date: progress.updatedAt,
          lesson: lessonName,
          topic: topicName,
          points: progress.points || 0,
          duration: progress.duration || 0,
          completed: progress.completed || false,
          stars: progress.stars || 0
        };
      });

    recentActivity.forEach((activity, i) => {
    });

    // ✅ STEP 8: Knowledge chart (monthly progress)
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

    const mostActiveDay = Object.entries(dayCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // ✅ FINAL RESPONSE: Properly structured analytics
    const analyticsData = {
      success: true,
      data: {
        // ✅ BASIC STATS (corrected terminology)
        studyDays: uniqueDays.size,
        totalDays: Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)),
        
        // ✅ LESSON STATS (clear naming)
        totalLessonsDone: completedLessonsCount,
        totalLessonsAttempted: totalLessonsAttempted,
        
        // ✅ TOPIC STATS (clear distinction)
        completedTopics: topics.filter(t => t.progress === 100).length,
        totalTopics: topics.length,
        
        // ✅ SUBJECT STATS (grouped topics)
        completedSubjects: subjects.filter(s => s.progress === 100).length,
        totalSubjects: subjects.length,
        
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
        topics: topics,
        
        // ✅ ACTIVITY PATTERNS
        mostActiveDay,
        recentActivity,
        
        // ✅ METADATA
        lastUpdated: new Date().toISOString(),
        dataQuality: {
          hasActivityData: userProgress.length > 0,
          hasSubjectData: subjects.length > 0,
          hasTopicData: topics.length > 0,
          validDates: userProgress.filter(p => p.updatedAt).length
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