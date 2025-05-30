const express = require('express');
const router = express.Router();
const UserActivity = require('../models/UserActivity');
const SubjectProgress = require('../models/SubjectProgress');
const verifyToken = require('../middlewares/authMiddleware');
const nodemailer = require('nodemailer');

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
      activityLogs = await UserActivity.find({ userId }).lean() || [];
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
        lesson: log.lessonName || 'Урок',
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

// ✅ POST send email (optional 🔒)
router.post('/send-email', verifyToken, async (req, res) => {
  const { to, subject, content } = req.body;

  if (!to || !subject || !content) {
    return res.status(400).json({ 
      success: false,
      error: 'Missing required fields: to, subject, content' 
    });
  }

  // Email validation
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

// ✅ Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Analytics service is healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;