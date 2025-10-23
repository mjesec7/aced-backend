// config/routes.js
// ========================================
// 📁 ROUTES MOUNTING CONFIGURATION
// ========================================

const express = require('express');

// Import emergency/direct route handlers
const { mountEmergencyRoutes } = require('../routes/emergency');
const { mountPaymentRoutes } = require('../routes/emergency/payments');
const { mountProgressRoutes } = require('../routes/emergency/progress');
const { mountUserRoutes } = require('../routes/emergency/users');
const { mountAdminRoutes } = require('../routes/emergency/admin');
const { mountCoursesRoutes } = require('../routes/emergency/courses');

const mountRoute = (app, path, routeFile, description) => {
  try {
    const route = require(routeFile);
    
    // Add error handling middleware for each route
    app.use(path, (req, res, next) => {
      next();
    }, route);

    console.log(`✅ Mounted: ${path} (${description})`);
    return { path, description, status: 'success' };
  } catch (error) {
    console.error(`❌ Failed to mount ${path}:`, error.message);
    return { path, description, status: 'failed', error: error.message };
  }
};

const mountRoutes = async (app) => {
  console.log('📚 Mounting routes...\n');

  const mountedRoutes = [];
  const failedRoutes = [];

  // 1. Mount emergency routes first (these are critical)
  console.log('🚨 Mounting emergency routes...');
  mountEmergencyRoutes(app);
  mountPaymentRoutes(app);
  mountProgressRoutes(app);
  mountUserRoutes(app);
  mountAdminRoutes(app);
  mountCoursesRoutes(app);

  // 2. Mount file routes that exist
  const routesToMount = [
    // Payment routes
    ['/api/payments/multicard', '../routes/multicardRoutes', 'Multicard payment integration'],
    ['/api/payments', '../routes/payments', 'Main payment routes'],
    ['/api/payments', '../routes/paymeRoutes', 'PayMe payment routes (legacy)'],
    ['/api/promocodes', '../routes/promocodeRoutes', 'Promocode management'],

    // User routes
    ['/api/users', '../routes/userRoutes', 'User management routes'],
    ['/api/user', '../routes/userRoutes', 'User management routes (legacy)'],

    // Content routes
    ['/api/progress', '../routes/userProgressRoutes', 'Progress tracking routes'],
    ['/api/lessons', '../routes/lessonRoutes', 'Lesson management routes'],
    ['/api/subjects', '../routes/subjectRoutes', 'Subject management routes'],
    ['/api/topics', '../routes/topicRoutes', 'Topic management routes'],
    ['/api/chat', '../routes/chatRoutes', 'Chat/AI routes'],
    ['/api/homeworks', '../routes/homeworkRoutes', 'Homework routes'],
    ['/api/tests', '../routes/testRoutes', 'Test/quiz routes'],
    ['/api/analytics', '../routes/userAnalytics', 'User analytics routes'],
    
    // New content routes
    ['/api/guides', '../routes/guides', 'Guides routes'],
    ['/api/books', '../routes/books', 'Books routes'],
    ['/api/updated-courses', '../routes/updatedCourses', 'Updated Courses routes'],
  ];

  routesToMount.forEach(([path, file, description]) => {
    const result = mountRoute(app, path, file, description);
    if (result.status === 'success') {
      mountedRoutes.push(result);
    } else {
      failedRoutes.push(result);
    }
  });

  // 3. Mount route debugging endpoint
  const { routeDebugHandler } = require('../utils/routeDebugger');
  app.get('/api/routes', routeDebugHandler(mountedRoutes, failedRoutes));
  app.get('/api/debug/routes', routeDebugHandler(mountedRoutes, failedRoutes));

  console.log(`\n✅ Routes mounted: ${mountedRoutes.length} successful`);
  if (failedRoutes.length > 0) {
    console.warn(`⚠️  Routes failed: ${failedRoutes.length}`);
    failedRoutes.forEach(route => {
      console.warn(`   - ${route.path}: ${route.error}`);
    });
  }

  return { mountedRoutes, failedRoutes };
};

module.exports = { mountRoutes };