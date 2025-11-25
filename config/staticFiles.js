// config/staticFiles.js
// ========================================
// 📂 STATIC FILES CONFIGURATION
// ========================================

const express = require('express');
const path = require('path');
const fs = require('fs');

const serveStaticFiles = (app) => {
  console.log('📁 Configuring static file serving...');

  // Serve uploads directory
  app.use('/uploads', express.static('uploads'));
  console.log('✅ Uploads directory configured');

  // Serve frontend dist directory if exists
  const distPath = path.join(__dirname, '..', 'dist');

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, {
      maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
      etag: true,
      lastModified: true
    }));

    // SPA catch-all route
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');

      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath, (err) => {
          if (err) {
            console.error('❌ Failed to serve index.html:', err.message);
            res.status(500).json({
              error: 'Frontend loading error',
              message: 'Unable to serve the application',
              server: 'api.aced.live'
            });
          }
        });
      }
    });

    console.log('✅ Frontend dist directory configured');
  } else {
    console.warn('⚠️  No /dist directory found. Static file serving is inactive.');
  }
};

module.exports = { serveStaticFiles };