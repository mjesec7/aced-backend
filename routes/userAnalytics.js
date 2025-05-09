const express = require('express');
const router = express.Router();
const UserActivity = require('../models/UserActivity');
const SubjectProgress = require('../models/SubjectProgress');
const verifyToken = require('../middlewares/authMiddleware'); // ✅ Secure analytics
const nodemailer = require('nodemailer');

// ✅ GET user analytics (🔒 protected)
router.get('/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params;

  // 🔐 Ensure user can only access their own analytics
  if (req.user?.uid !== userId) {
    return res.status(403).json({ error: '❌ Access denied: user mismatch' });
  }

  try {
    const activityLogs = await UserActivity.find({ userId }) || [];
    const subjectData = await SubjectProgress.find({ userId }) || [];

    const uniqueDays = new Set(activityLogs.map(log => new Date(log.date).toDateString()));
    const completedSubjects = subjectData.filter(s => s.progress >= 100).length;
    const totalSubjects = subjectData.length;

    const now = new Date();
    const oneWeekAgo = new Date(now); oneWeekAgo.setDate(now.getDate() - 7);
    const oneMonthAgo = new Date(now); oneMonthAgo.setMonth(now.getMonth() - 1);

    const lessonsThisWeek = activityLogs.filter(log => new Date(log.date) > oneWeekAgo).length;
    const lessonsThisMonth = activityLogs.filter(log => new Date(log.date) > oneMonthAgo).length;

    const sortedDates = [...uniqueDays].sort((a, b) => new Date(b) - new Date(a));
    let streak = 0;
    for (let i = 0; i < sortedDates.length; i++) {
      const expectedDate = new Date(); expectedDate.setDate(expectedDate.getDate() - i);
      if (new Date(sortedDates[i]).toDateString() === expectedDate.toDateString()) {
        streak++;
      } else break;
    }

    const durations = activityLogs.map(log => log.duration || 0);
    const averageTime = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    const chart = Array(12).fill(0);
    activityLogs.forEach(log => {
      const month = new Date(log.date).getMonth();
      chart[month] += log.points || 1;
    });

    const subjects = subjectData.map(s => ({
      name: s.subjectName,
      progress: s.progress
    }));

    const dayCount = {};
    activityLogs.forEach(log => {
      const weekday = new Date(log.date).toLocaleDateString('ru-RU', { weekday: 'long' });
      dayCount[weekday] = (dayCount[weekday] || 0) + 1;
    });
    const mostActiveDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    res.json({
      studyDays: uniqueDays.size,
      totalDays: 365,
      completedSubjects,
      totalSubjects,
      totalLessonsDone: activityLogs.length,
      weeklyLessons: lessonsThisWeek,
      monthlyLessons: lessonsThisMonth,
      streakDays: streak,
      averageTime: `${averageTime} мин`,
      knowledgeChart: chart.slice(0, 6),
      mostActiveDay,
      subjects
    });

  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ error: '❌ Server error fetching analytics' });
  }
});

// ✅ POST send email (optional 🔒)
router.post('/send-email', async (req, res) => {
  const { to, subject, content } = req.body;

  if (!to || !subject || !content) {
    return res.status(400).json({ error: '❌ Missing email fields' });
  }

  try {
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

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: '📧 Email sent successfully!' });
  } catch (err) {
    console.error('❌ Email sending error:', err);
    res.status(500).json({ error: '❌ Failed to send email.' });
  }
});

module.exports = router;
