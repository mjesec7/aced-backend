const express = require('express');
const router = express.Router();
const UserActivity = require('../models/UserActivity');
const SubjectProgress = require('../models/SubjectProgress');
const verifyToken = require('../middlewares/authMiddleware');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// ✅ GET user analytics (🔒 protected)
router.get('/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params;

  try {
    console.log('📊 Analytics request for user:', userId);
    console.log('🔐 Token user:', req.user?.uid);

    // 🔐 Ensure user can only access their own analytics
    if (req.user?.uid !== userId) {
      console.log('❌ Access denied: user mismatch');
      return res.status(403).json({ 
        success: false,
        error: 'Access denied: user mismatch' 
      });
    }

    // Fetch data with error handling
    let activityLogs = [];
    let subjectData = [];

    try {
      // FIX: Populate lessonId to get lesson name
      activityLogs = await UserActivity.find({ userId })
        .populate('lessonId', 'title lessonName') // Populate with title and lessonName
        .lean() || [];
      console.log('📈 Activity logs found:', activityLogs.length);
    } catch (err) {
      console.warn('⚠️ Error fetching activity logs:', err.message);
    }

    try {
      subjectData = await SubjectProgress.find({ userId }).lean() || [];
      console.log('📚 Subject data found:', subjectData.length);
    } catch (err) {
      console.warn('⚠️ Error fetching subject progress:', err.message);
    }

    // Calculate analytics with safety checks
    const uniqueDays = new Set();
    activityLogs.forEach(log => {
      if (log.date) {
        uniqueDays.add(new Date(log.date).toDateString());
      }
    });

    const completedSubjects = subjectData.filter(s => s && s.progress >= 100).length;
    const totalSubjects = subjectData.length;

    // Date calculations with null checks
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const oneMonthAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    const lessonsThisWeek = activityLogs.filter(log => 
      log.date && new Date(log.date) > oneWeekAgo
    ).length;

    const lessonsThisMonth = activityLogs.filter(log => 
      log.date && new Date(log.date) > oneMonthAgo
    ).length;

    // Calculate streak more safely
    const sortedDates = Array.from(uniqueDays)
      .map(dateStr => new Date(dateStr))
      .sort((a, b) => b - a); // Most recent first

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

    // Average time calculation with safety
    const validDurations = activityLogs
      .map(log => log.duration || 0)
      .filter(duration => duration > 0);
    
    const averageTime = validDurations.length > 0
      ? Math.round(validDurations.reduce((a, b) => a + b, 0) / validDurations.length)
      : 0;

    // Knowledge chart for past 12 months
    const chart = Array(12).fill(0);
    const currentMonth = now.getMonth();
    
    activityLogs.forEach(log => {
      if (log.date) {
        const logDate = new Date(log.date);
        const monthsAgo = (currentMonth - logDate.getMonth() + 12) % 12;
        if (monthsAgo < 12) {
          chart[11 - monthsAgo] += log.points || 1;
        }
      }
    });

    // Subject progress mapping
    const subjects = subjectData
      .filter(s => s && s.subjectName)
      .map(s => ({
        name: s.subjectName,
        progress: Math.min(100, Math.max(0, s.progress || 0))
      }));

    // Most active day calculation
    const dayCount = {};
    activityLogs.forEach(log => {
      if (log.date) {
        try {
          const weekday = new Date(log.date).toLocaleDateString('ru-RU', { weekday: 'long' });
          dayCount[weekday] = (dayCount[weekday] || 0) + 1;
        } catch (err) {
          console.warn('⚠️ Date parsing error:', err.message);
        }
      }
    });

    const mostActiveDay = Object.entries(dayCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Понедельник';

    // Calculate additional metrics
    const totalPoints = activityLogs.reduce((sum, log) => sum + (log.points || 0), 0);
    const avgPointsPerDay = uniqueDays.size > 0 ? Math.round(totalPoints / uniqueDays.size) : 0;

    // Recent activity (last 7 days)
    const recentActivity = activityLogs
      .filter(log => log.date && new Date(log.date) > oneWeekAgo)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10)
      .map(log => ({
        date: log.date,
        // FIX: Use populated lesson name (title or lessonName)
        lesson: log.lessonId ? (log.lessonId.title || log.lessonId.lessonName || 'Урок') : (log.lessonName || 'Урок'),
        points: log.points || 0,
        duration: log.duration || 0
      }));

    const analyticsData = {
      success: true,
      data: {
        // Basic stats
        studyDays: uniqueDays.size,
        totalDays: Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)),
        completedSubjects,
        totalSubjects,
        totalLessonsDone: activityLogs.length,
        
        // Time-based metrics
        weeklyLessons: lessonsThisWeek,
        monthlyLessons: lessonsThisMonth,
        streakDays: streak,
        averageTime: `${averageTime} мин`,
        
        // Points and performance
        totalPoints,
        avgPointsPerDay,
        
        // Charts and progress
        knowledgeChart: chart,
        subjects,
        
        // Activity patterns
        mostActiveDay,
        recentActivity,
        
        // Metadata
        lastUpdated: new Date().toISOString(),
        dataQuality: {
          hasActivityData: activityLogs.length > 0,
          hasSubjectData: subjectData.length > 0,
          validDates: activityLogs.filter(log => log.date).length
        }
      }
    };

    console.log('✅ Analytics data prepared successfully');
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

// ✅ GET analytics summary (lighter version)
router.get('/:userId/summary', verifyToken, async (req, res) => {
  const { userId } = req.params;

  try {
    if (req.user?.uid !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied: user mismatch' 
      });
    }

    // Quick summary without heavy calculations
    const activityCount = await UserActivity.countDocuments({ userId });
    const subjectCount = await SubjectProgress.countDocuments({ userId });
    const completedSubjects = await SubjectProgress.countDocuments({ 
      userId, 
      progress: { $gte: 100 } 
    });

    res.json({
      success: true,
      data: {
        totalLessons: activityCount,
        totalSubjects: subjectCount,
        completedSubjects,
        completionRate: subjectCount > 0 ? Math.round((completedSubjects / subjectCount) * 100) : 0
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

// ✅ POST generate PDF report (🔒 protected)
router.post('/generate-report', verifyToken, async (req, res) => {
  const { userId } = req.body;

  try {
    console.log('📄 PDF generation request for user:', userId);
    
    // Verify user access
    if (req.user?.uid !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied: user mismatch' 
      });
    }

    // Get analytics data (reuse existing logic)
    // FIX: Populate lessonId to get lesson name for PDF report
    const activityLogs = await UserActivity.find({ userId })
      .populate('lessonId', 'title lessonName')
      .lean() || [];
    const subjectData = await SubjectProgress.find({ userId }).lean() || [];

    console.log('📊 Data fetched - Activities:', activityLogs.length, 'Subjects:', subjectData.length);

    // Create PDF document
    const doc = new PDFDocument();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics-report.pdf"');
    
    // Pipe PDF to response
    doc.pipe(res);

    // Add content to PDF
    doc.fontSize(20).text('Learning Analytics Report', 50, 50);
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleDateString()}`, 50, 80);

    // Basic stats
    const completedSubjects = subjectData.filter(s => s && s.progress >= 100).length;
    const totalLessons = activityLogs.length;
    
    // Calculate unique study days
    const uniqueDays = new Set();
    activityLogs.forEach(log => {
      if (log.date) {
        uniqueDays.add(new Date(log.date).toDateString());
      }
    });

    // Calculate total points
    const totalPoints = activityLogs.reduce((sum, log) => sum + (log.points || 0), 0);

    // Calculate average time
    const validDurations = activityLogs
      .map(log => log.duration || 0)
      .filter(duration => duration > 0);
    
    const averageTime = validDurations.length > 0
      ? Math.round(validDurations.reduce((a, b) => a + b, 0) / validDurations.length)
      : 0;

    doc.moveDown();
    doc.text(`Total Lessons Completed: ${totalLessons}`, 50, 120);
    doc.text(`Subjects Completed: ${completedSubjects}`, 50, 140);
    doc.text(`Total Subjects: ${subjectData.length}`, 50, 160);
    doc.text(`Study Days: ${uniqueDays.size}`, 50, 180);
    doc.text(`Total Points Earned: ${totalPoints}`, 50, 200);
    doc.text(`Average Session Time: ${averageTime} minutes`, 50, 220);

    // Subject progress if (subjectData.length > 0) {
    doc.moveDown();
    doc.fontSize(16).text('Subject Progress:', 50, 260);
    let yPosition = 290;
    subjectData.forEach((subject, index) => {
      if (yPosition > 700) { // Start new page if needed
        doc.addPage();
        yPosition = 50;
      }
      const progress = subject.progress || 0;
      const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
      doc.fontSize(12)
        .text(`${subject.subjectName}: ${progress}%`, 70, yPosition);
      doc.fontSize(10)
        .text(`[${progressBar}]`, 70, yPosition + 15);
      yPosition += 35;
    });
    // Recent activity if (activityLogs.length > 0) {
    const recentLogs = activityLogs
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 15);
    doc.addPage();
    doc.fontSize(16).text('Recent Activity:', 50, 50);
    let yPos = 80;
    recentLogs.forEach(log => {
      if (yPos > 750) { // New page if content exceeds
        doc.addPage();
        yPos = 50;
        doc.fontSize(16).text('Recent Activity (continued):', 50, 50);
      }
      // FIX: Use populated lesson name for PDF report
      const lessonName = log.lessonId ? (log.lessonId.title || log.lessonId.lessonName || 'Урок') : (log.lessonName || 'Урок');
      doc.fontSize(12)
        .text(`${new Date(log.date).toLocaleDateString('ru-RU')}: ${lessonName} - ${log.points || 0} points, ${log.duration || 0} min`, 70, yPos);
      yPos += 20;
    });
    // Finalize PDF
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

// ✅ POST send analytics report via email (🔒 protected)
router.post('/send-report', verifyToken, async (req, res) => {
  const { userId, to, subject, content } = req.body;

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid email address' 
    });
  }

  try {
    // Check if email configuration exists
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
      return res.status(500).json({ 
        success: false,
        error: 'Email service not configured' 
      });
    }

    const transporter = nodemailer.createTransport({
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

// ✅ Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'Analytics API is healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
