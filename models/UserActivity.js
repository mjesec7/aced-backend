const mongoose = require('mongoose');

const UserActivitySchema = new mongoose.Schema({
  userId: {
    type: String, // Firebase UID
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'login', 'logout',
      'view_lesson', 'complete_lesson',
      'start_test', 'submit_test',
      'view_profile', 'update_profile',
      'purchase_subscription', 'cancel_subscription',
      'use_promocode',
      'error', 'system_event',
      'page_view', 'click'
    ]
  },
  category: {
    type: String,
    required: true,
    enum: ['auth', 'learning', 'payment', 'system', 'navigation', 'engagement']
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  deviceType: {
    type: String,
    enum: ['mobile', 'tablet', 'desktop', 'unknown'],
    default: 'unknown'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Indexes for analytics queries
UserActivitySchema.index({ userId: 1, timestamp: -1 });
UserActivitySchema.index({ action: 1, timestamp: -1 });
UserActivitySchema.index({ category: 1 });

module.exports = mongoose.model('UserActivity', UserActivitySchema);
