// models/aiUsage.js - Complete AI Usage Tracking Model
const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  firebaseUserId: {
    type: String,
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true
  },
  
  // Current usage for the month
  currentMonth: {
    type: String, // YYYY-MM format
    required: true,
    index: true
  },
  
  // Usage counters
  usage: {
    aiMessages: {
      type: Number,
      default: 0,
      min: 0
    },
    lastMessageAt: {
      type: Date,
      default: null
    },
    dailyUsage: [{
      date: {
        type: String, // YYYY-MM-DD format
        required: true
      },
      count: {
        type: Number,
        default: 0,
        min: 0
      }
    }]
  },
  
  // User subscription info (cached for quick access)
  subscriptionPlan: {
    type: String,
    enum: ['free', 'start', 'pro', 'premium'],
    default: 'free',
    index: true
  },
  
  // Usage limits based on plan
  limits: {
    aiMessages: {
      type: Number,
      default: 50 // Free tier limit
    }
  },
  
  // Tracking info
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Monthly reset tracking
  lastResetAt: {
    type: Date,
    default: Date.now
  },
  
  // Abuse prevention
  suspendedUntil: {
    type: Date,
    default: null
  },
  
  // Request metadata
  metadata: {
    lastIP: String,
    lastUserAgent: String,
    requestCount: {
      type: Number,
      default: 0
    },
    averageResponseTime: Number
  }
});

// Compound indexes for better performance
aiUsageSchema.index({ userId: 1, currentMonth: 1 }, { unique: true });
aiUsageSchema.index({ firebaseUserId: 1, currentMonth: 1 });
aiUsageSchema.index({ subscriptionPlan: 1, currentMonth: 1 });

// Static methods for the model
aiUsageSchema.statics.getCurrentMonth = function() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

aiUsageSchema.statics.getCurrentDay = function() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

aiUsageSchema.statics.getUsageLimits = function(plan) {
  const limits = {
    free: { aiMessages: 50 },
    start: { aiMessages: -1 }, // Unlimited
    pro: { aiMessages: -1 },   // Unlimited
    premium: { aiMessages: -1 } // Unlimited
  };
  return limits[plan] || limits.free;
};

// Instance methods
aiUsageSchema.methods.incrementUsage = async function(messageCount = 1) {
  const currentDay = this.constructor.getCurrentDay();
  
  // Update total usage
  this.usage.aiMessages += messageCount;
  this.usage.lastMessageAt = new Date();
  
  // Update daily usage
  let dailyRecord = this.usage.dailyUsage.find(d => d.date === currentDay);
  if (!dailyRecord) {
    dailyRecord = { date: currentDay, count: 0 };
    this.usage.dailyUsage.push(dailyRecord);
  }
  dailyRecord.count += messageCount;
  
  // Keep only last 31 days
  if (this.usage.dailyUsage.length > 31) {
    this.usage.dailyUsage = this.usage.dailyUsage
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 31);
  }
  
  // Update metadata
  this.metadata.requestCount += messageCount;
  this.updatedAt = new Date();
  
  return await this.save();
};

aiUsageSchema.methods.canSendMessage = function() {
  if (this.suspendedUntil && this.suspendedUntil > new Date()) {
    return {
      allowed: false,
      reason: 'suspended',
      message: 'Account temporarily suspended'
    };
  }
  
  const limits = this.constructor.getUsageLimits(this.subscriptionPlan);
  
  if (limits.aiMessages === -1) {
    return {
      allowed: true,
      remaining: -1, // Unlimited
      percentage: 0
    };
  }
  
  if (this.usage.aiMessages >= limits.aiMessages) {
    return {
      allowed: false,
      reason: 'limit_exceeded',
      message: `Monthly AI message limit (${limits.aiMessages}) exceeded. Upgrade your plan for unlimited messages.`,
      remaining: 0,
      percentage: 100
    };
  }
  
  const remaining = limits.aiMessages - this.usage.aiMessages;
  const percentage = Math.round((this.usage.aiMessages / limits.aiMessages) * 100);
  
  return {
    allowed: true,
    remaining,
    percentage,
    total: limits.aiMessages
  };
};

const AIUsage = mongoose.model('AIUsage', aiUsageSchema);

// ============================================
// AI USAGE SERVICE CLASS
// ============================================

class AIUsageService {
  static async getOrCreateUsage(userId, userPlan = 'free') {
    const currentMonth = AIUsage.getCurrentMonth();
    
    let usage = await AIUsage.findOne({
      userId: userId,
      currentMonth: currentMonth
    });
    
    if (!usage) {
      // Try to find user's email from User model
      let userEmail = `${userId}@example.com`;
      try {
        const User = require('./user');
        const user = await User.findOne({ firebaseId: userId });
        if (user) {
          userEmail = user.email;
          userPlan = user.subscriptionPlan || 'free';
        }
      } catch (error) {
      }
      
      const limits = AIUsage.getUsageLimits(userPlan);
      
      usage = new AIUsage({
        userId: userId,
        firebaseUserId: userId,
        email: userEmail,
        currentMonth: currentMonth,
        subscriptionPlan: userPlan,
        limits: limits,
        usage: {
          aiMessages: 0,
          lastMessageAt: null,
          dailyUsage: []
        },
        metadata: {
          requestCount: 0
        }
      });
      
      await usage.save();
    }
    
    return usage;
  }
  
  static async trackMessage(userId, userPlan = 'free', metadata = {}) {
    try {
      const usage = await this.getOrCreateUsage(userId, userPlan);
      
      // Update metadata if provided
      if (metadata.ip) usage.metadata.lastIP = metadata.ip;
      if (metadata.userAgent) usage.metadata.lastUserAgent = metadata.userAgent;
      if (metadata.responseTime) {
        const avgTime = usage.metadata.averageResponseTime || 0;
        usage.metadata.averageResponseTime = Math.round((avgTime + metadata.responseTime) / 2);
      }
      
      await usage.incrementUsage(1);
      
      return {
        success: true,
        usage: usage.usage.aiMessages,
        canSend: usage.canSendMessage()
      };
      
    } catch (error) {
      console.error('❌ Error tracking AI message:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  static async checkUsageLimit(userId, userPlan = 'free') {
    try {
      const usage = await this.getOrCreateUsage(userId, userPlan);
      return usage.canSendMessage();
      
    } catch (error) {
      console.error('❌ Error checking usage limit:', error);
      return {
        allowed: false,
        reason: 'error',
        message: 'Unable to check usage limits'
      };
    }
  }
  
  static async getUserUsageStats(userId) {
    try {
      // Use getOrCreateUsage to ensure a record always exists (fixes "limit reached" for new users)
      const usage = await this.getOrCreateUsage(userId);

      const canSend = usage.canSendMessage();
      const limits = AIUsage.getUsageLimits(usage.subscriptionPlan);
      
      return {
        success: true,
        data: {
          current: usage.usage.aiMessages,
          limit: limits.aiMessages,
          remaining: canSend.remaining,
          percentage: canSend.percentage,
          plan: usage.subscriptionPlan,
          unlimited: limits.aiMessages === -1,
          lastMessageAt: usage.usage.lastMessageAt,
          dailyUsage: usage.usage.dailyUsage,
          canSend: canSend.allowed
        }
      };
      
    } catch (error) {
      console.error('❌ Error getting usage stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  static async updateUserPlan(userId, newPlan) {
    try {
      const currentMonth = AIUsage.getCurrentMonth();
      const limits = AIUsage.getUsageLimits(newPlan);
      
      const usage = await AIUsage.findOneAndUpdate(
        { userId: userId, currentMonth: currentMonth },
        { 
          subscriptionPlan: newPlan,
          limits: limits,
          updatedAt: new Date()
        },
        { new: true, upsert: true }
      );
      
      return { success: true, usage };
      
    } catch (error) {
      console.error('❌ Error updating user plan:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = { AIUsage, AIUsageService };