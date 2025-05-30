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
    const activityLogs = await UserActivity.find({ userId }).lean() || [];
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

    // Subject progress
    if (subjectData.length > 0) {
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
    }

    // Recent activity
    if (activityLogs.length > 0) {
      const recentLogs = activityLogs
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 15);

      doc.addPage();
      doc.fontSize(16).text('Recent Activity:', 50, 50);
      
      let yPos = 80;
      recentLogs.forEach(log => {
        if (yPos > 720) { // Start new page if needed
          doc.addPage();
          yPos = 50;
        }
        
        const date = new Date(log.date).toLocaleDateString();
        const lesson = log.lessonName || 'Lesson';
        const points = log.points || 0;
        const duration = log.duration || 0;
        
        doc.fontSize(10)
           .text(`${date} - ${lesson}`, 70, yPos)
           .text(`Points: ${points} | Duration: ${duration} min`, 70, yPos + 12);
        yPos += 25;
      });
    }

    // Add footer with generation info
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8)
         .text(`Page ${i + 1} of ${pageCount} | Generated: ${new Date().toLocaleString()}`, 
               50, doc.page.height - 50, { align: 'center' });
    }

    // Finalize PDF
    doc.end();
    console.log('✅ PDF generated successfully');

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to generate PDF report',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
});

// ✅ Generate PDF buffer function for email/save
async function generatePDFBuffer(userId) {
  const activityLogs = await UserActivity.find({ userId }).lean() || [];
  const subjectData = await SubjectProgress.find({ userId }).lean() || [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Add content (simplified version)
    doc.fontSize(20).text('Learning Analytics Report', 50, 50);
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleDateString()}`, 50, 80);
    
    const completedSubjects = subjectData.filter(s => s && s.progress >= 100).length;
    const totalPoints = activityLogs.reduce((sum, log) => sum + (log.points || 0), 0);

    doc.moveDown();
    doc.text(`Total Lessons: ${activityLogs.length}`, 50, 120);
    doc.text(`Completed Subjects: ${completedSubjects}/${subjectData.length}`, 50, 140);
    doc.text(`Total Points: ${totalPoints}`, 50, 160);

    // Add subject progress
    if (subjectData.length > 0) {
      doc.moveDown();
      doc.fontSize(14).text('Subject Progress:', 50, 200);
      
      let yPos = 220;
      subjectData.slice(0, 10).forEach(subject => { // Limit to first 10 subjects
        doc.fontSize(10)
           .text(`${subject.subjectName}: ${subject.progress || 0}%`, 70, yPos);
        yPos += 15;
      });
    }

    doc.end();
  });
}

// ✅ POST send PDF via email (🔒 protected)
router.post('/send-pdf-email', verifyToken, async (req, res) => {
  const { userId, to, subject = 'Your Learning Analytics Report' } = req.body;

  try {
    // Verify user access
    if (req.user?.uid !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied: user mismatch' 
      });
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!to || !emailRegex.test(to)) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid email address is required' 
      });
    }

    // Check email configuration
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
      return res.status(500).json({ 
        success: false,
        error: 'Email service not configured' 
      });
    }

    // Generate PDF buffer
    const pdfBuffer = await generatePDFBuffer(userId);

    // Setup email transporter
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });

    // Email options with PDF attachment
    const mailOptions = {
      from: process.env.MAIL_USER,
      to,
      subject,
      html: `
        <h2>Your Learning Analytics Report</h2>
        <p>Hello!</p>
        <p>Please find your detailed learning analytics report attached to this email.</p>
        <p>The report includes:</p>
        <ul>
          <li>📊 Learning statistics and progress</li>
          <li>📚 Subject completion status</li>
          <li>📈 Recent activity summary</li>
          <li>🏆 Points and achievements</li>
        </ul>
        <p>Keep up the great work with your learning journey!</p>
        <br>
        <p><em>Generated on ${new Date().toLocaleDateString()}</em></p>
      `,
      attachments: [{
        filename: 'learning-analytics-report.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    res.json({ 
      success: true,
      message: 'PDF report sent successfully via email!',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('❌ Email PDF sending error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send PDF via email',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ POST send email (🔒 protected)
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
    timestamp: new Date().toISOString(),
    features: {
      analytics: true,
      pdfGeneration: true,
      emailService: !!(process.env.MAIL_USER && process.env.MAIL_PASS)
    }
  });
});

module.exports = router;