// backend/routes/emailRoutes.js
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const htmlPdf = require('html-pdf');
const User = require('../models/user'); // Assuming you need email/uid verification

// PDF content generator (simplified)
function generateHtmlContent({ period, selectedStats, analytics }) {
  const labelMap = {
    studyDays: 'Дней в обучении',
    completedSubjects: 'Завершено предметов',
    weeklyLessons: 'Уроков за неделю',
    monthlyLessons: 'Уроков за месяц',
    streakDays: 'Учебный стрик',
    mostActiveDay: 'Наиболее активный день',
    totalLessonsDone: 'Всего уроков'
  };
  
  let html = `<h2 style="text-align:center;">📊 Your Results in Aced</h2>`;
  selectedStats.forEach(key => {
    const label = labelMap[key] || key;
    const value = analytics[key] ?? '—';
    html += `<div style="margin:10px 0;"><strong>${label}:</strong> ${value}</div>`;
  });
  html += `<div><strong>Период:</strong> Последние ${period} дней</div>`;
  return html;
}

router.post('/send-analytics', async (req, res) => {
  const { uid, email, period, selectedStats, analytics } = req.body;
  if (!uid || !email || !period || !selectedStats || !analytics) {
    return res.status(400).json({ error: '❌ Missing required data' });
  }

  const htmlContent = generateHtmlContent({ period, selectedStats, analytics });

  htmlPdf.create(htmlContent).toBuffer(async (err, buffer) => {
    if (err) {
      console.error('❌ PDF generation failed:', err);
      return res.status(500).json({ error: 'PDF generation error' });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_SENDER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    const mailOptions = {
      from: `ACED <${process.env.EMAIL_SENDER}>`,
      to: email,
      subject: '🎓 Твоя аналитика в ACED',
      text: 'Во вложении — твоя PDF аналитика',
      attachments: [
        {
          filename: 'aced-analytics.pdf',
          content: buffer
        }
      ]
    };

    try {
      await transporter.sendMail(mailOptions);
      res.status(200).json({ message: '📧 PDF sent successfully' });
    } catch (mailErr) {
      console.error('❌ Failed to send email:', mailErr);
      res.status(500).json({ error: 'Failed to send email' });
    }
  });
});

module.exports = router;
