// models/promocode.js - COMPLETE PROMOCODE MODEL
const mongoose = require('mongoose');

const promocodeSchema = new mongoose.Schema({
  // Basic promocode info
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    minlength: 4,
    maxlength: 20,
    index: true
  },

  // What plan this promocode grants (only 'pro' exists)
  grantsPlan: {
    type: String,
    enum: ['start', 'pro', 'premium', null],
    default: 'pro'
  },

  // Discount percentage (0-100) - for payment discounts
  discountPercent: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },

  // Discount amount in tiyin (UZS * 100) - for fixed amount discounts
  discountAmount: {
    type: Number,
    default: null,
    min: 0
  },

  // Type of promo code for easier categorization
  promoType: {
    type: String,
    enum: ['subscription', 'discount_percent', 'discount_amount'],
    default: 'subscription'
  },

  // Promocode settings
  description: {
    type: String,
    default: '',
    maxlength: 500
  },

  // Usage limits
  maxUses: {
    type: Number,
    default: null, // null = unlimited
    min: 0
  },

  currentUses: {
    type: Number,
    default: 0,
    min: 0
  },

  // Time limits
  expiresAt: {
    type: Date,
    default: null, // null = never expires
    index: true
  },

  // Status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  // Duration of subscription granted (in days)
  subscriptionDays: {
    type: Number,
    default: 30,
    min: 1,
    max: 365
  },

  // Admin info
  createdBy: {
    type: String, // Admin user ID
    required: true
  },

  createdByName: {
    type: String,
    default: 'Admin'
  },

  createdByEmail: {
    type: String,
    default: ''
  },

  // Usage tracking
  usedBy: [{
    userId: {
      type: String,
      required: true
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    userEmail: {
      type: String,
      default: ''
    },
    userName: {
      type: String,
      default: 'User'
    },
    userIP: {
      type: String,
      default: ''
    }
  }],

  // Optional: Restrict to specific users
  restrictedToUsers: [{
    type: String // User IDs
  }],

  // Optional: Require minimum current plan
  requiresMinimumPlan: {
    type: String,
    enum: ['free', 'pro'],
    default: 'free'
  },

  // Tags for organization
  tags: [{
    type: String,
    trim: true
  }],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now
  },

  // Last used timestamp
  lastUsedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // This will automatically manage createdAt and updatedAt
});

// ============================================
// INDEXES FOR PERFORMANCE
// ============================================
promocodeSchema.index({ code: 1 });
promocodeSchema.index({ isActive: 1 });
promocodeSchema.index({ expiresAt: 1 });
promocodeSchema.index({ createdBy: 1 });
promocodeSchema.index({ grantsPlan: 1 });
promocodeSchema.index({ 'usedBy.userId': 1 });
promocodeSchema.index({ createdAt: -1 });

// ============================================
// PRE-SAVE MIDDLEWARE
// ============================================
promocodeSchema.pre('save', function (next) {
  // Ensure code is uppercase
  if (this.code) {
    this.code = this.code.toUpperCase();
  }

  // Update lastUsedAt if currentUses changed
  if (this.isModified('currentUses') && this.currentUses > 0) {
    this.lastUsedAt = new Date();
  }

  next();
});

// ============================================
// INSTANCE METHODS
// ============================================

// Check if promocode is valid
promocodeSchema.methods.isValid = function () {
  // Check if active
  if (!this.isActive) {
    return {
      valid: false,
      reason: 'Promocode is inactive',
      code: 'INACTIVE'
    };
  }

  // Check expiry
  if (this.expiresAt && new Date() > this.expiresAt) {
    return {
      valid: false,
      reason: 'Promocode has expired',
      code: 'EXPIRED'
    };
  }

  // Check usage limit
  if (this.maxUses && this.currentUses >= this.maxUses) {
    return {
      valid: false,
      reason: 'Promocode usage limit reached',
      code: 'EXHAUSTED'
    };
  }

  return {
    valid: true,
    code: 'VALID'
  };
};

// Check if specific user can use this code
promocodeSchema.methods.canUserUse = function (userId, userCurrentPlan = 'free') {
  // Check general validity first
  const validity = this.isValid();
  if (!validity.valid) {
    return {
      canUse: false,
      reason: validity.reason,
      code: validity.code
    };
  }

  // Check if user already used this code
  const alreadyUsed = this.usedBy.some(usage => usage.userId === userId);
  if (alreadyUsed) {
    return {
      canUse: false,
      reason: 'You have already used this promocode',
      code: 'ALREADY_USED'
    };
  }

  // Check if restricted to specific users
  if (this.restrictedToUsers && this.restrictedToUsers.length > 0) {
    if (!this.restrictedToUsers.includes(userId)) {
      return {
        canUse: false,
        reason: 'This promocode is not available for your account',
        code: 'RESTRICTED'
      };
    }
  }

  // Check minimum plan requirement
  const planHierarchy = { free: 0, start: 1, pro: 2, premium: 3 };
  const userPlanLevel = planHierarchy[userCurrentPlan] || 0;
  const requiredPlanLevel = planHierarchy[this.requiresMinimumPlan] || 0;

  if (userPlanLevel < requiredPlanLevel) {
    return {
      canUse: false,
      reason: `This promocode requires ${this.requiresMinimumPlan.toUpperCase()} plan or higher`,
      code: 'INSUFFICIENT_PLAN'
    };
  }

  return {
    canUse: true,
    code: 'CAN_USE'
  };
};

// Use the promocode
promocodeSchema.methods.useCode = function (userId, userEmail = '', userName = 'User', userIP = '') {
  // Add to usage tracking
  this.usedBy.push({
    userId: userId,
    usedAt: new Date(),
    userEmail: userEmail,
    userName: userName,
    userIP: userIP
  });

  // Increment usage counter
  this.currentUses += 1;
  this.lastUsedAt = new Date();

  return this.save();
};

// Get usage statistics
promocodeSchema.methods.getUsageStats = function () {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recentUsage30Days = this.usedBy.filter(usage => usage.usedAt >= thirtyDaysAgo).length;
  const recentUsage7Days = this.usedBy.filter(usage => usage.usedAt >= sevenDaysAgo).length;

  return {
    totalUses: this.currentUses,
    maxUses: this.maxUses,
    remainingUses: this.maxUses ? Math.max(0, this.maxUses - this.currentUses) : null,
    usagePercentage: this.maxUses ? Math.round((this.currentUses / this.maxUses) * 100) : 0,
    recentUsage30Days,
    recentUsage7Days,
    isExhausted: this.maxUses ? this.currentUses >= this.maxUses : false,
    isExpired: this.expiresAt ? now > this.expiresAt : false,
    lastUsedAt: this.lastUsedAt
  };
};

// ============================================
// STATIC METHODS
// ============================================

// Generate random promocode
promocodeSchema.statics.generateCode = function (prefix = '', length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = prefix.toUpperCase();

  const remainingLength = Math.max(4, length - prefix.length);

  for (let i = 0; i < remainingLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
};

// Find valid promocode by code
promocodeSchema.statics.findValidCode = function (code) {
  return this.findOne({
    code: code.toUpperCase(),
    isActive: true
  });
};

// Find expired promocodes
promocodeSchema.statics.findExpired = function () {
  return this.find({
    expiresAt: { $lt: new Date() },
    isActive: true
  });
};

// Find exhausted promocodes
promocodeSchema.statics.findExhausted = function () {
  return this.find({
    $expr: { $gte: ['$currentUses', '$maxUses'] },
    maxUses: { $ne: null },
    isActive: true
  });
};

// Get promocodes by plan
promocodeSchema.statics.findByPlan = function (plan) {
  return this.find({
    grantsPlan: plan,
    isActive: true
  });
};

// Cleanup expired promocodes (mark as inactive)
promocodeSchema.statics.cleanupExpired = async function () {
  const result = await this.updateMany(
    {
      expiresAt: { $lt: new Date() },
      isActive: true
    },
    {
      $set: { isActive: false }
    }
  );

  return result;
};

// Get usage analytics
promocodeSchema.statics.getUsageAnalytics = async function (days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const analytics = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          plan: '$grantsPlan',
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          }
        },
        totalCodes: { $sum: 1 },
        totalUses: { $sum: '$currentUses' },
        activeCodes: {
          $sum: {
            $cond: [{ $eq: ['$isActive', true] }, 1, 0]
          }
        }
      }
    },
    {
      $sort: { '_id.date': 1 }
    }
  ]);

  return analytics;
};

// ============================================
// VIRTUAL FIELDS
// ============================================

// Check if promocode is expired
promocodeSchema.virtual('isExpired').get(function () {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Check if promocode is exhausted
promocodeSchema.virtual('isExhausted').get(function () {
  return this.maxUses && this.currentUses >= this.maxUses;
});

// Get remaining uses
promocodeSchema.virtual('remainingUses').get(function () {
  return this.maxUses ? Math.max(0, this.maxUses - this.currentUses) : null;
});

// Get usage percentage
promocodeSchema.virtual('usagePercentage').get(function () {
  return this.maxUses ? Math.round((this.currentUses / this.maxUses) * 100) : 0;
});

// Get status
promocodeSchema.virtual('status').get(function () {
  if (!this.isActive) return 'inactive';
  if (this.isExpired) return 'expired';
  if (this.isExhausted) return 'exhausted';
  return 'active';
});

// ============================================
// JSON TRANSFORM
// ============================================
promocodeSchema.set('toJSON', {
  virtuals: true,
  transform: function (doc, ret) {
    // Remove sensitive data
    delete ret.__v;

    // Add computed fields
    ret.isExpired = doc.isExpired;
    ret.isExhausted = doc.isExhausted;
    ret.remainingUses = doc.remainingUses;
    ret.usagePercentage = doc.usagePercentage;
    ret.status = doc.status;

    return ret;
  }
});

// ============================================
// EXPORT MODEL
// ============================================
module.exports = mongoose.model('Promocode', promocodeSchema);