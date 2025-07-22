// routes/promocodeRoutes.js - COMPLETE PROMOCODE ROUTES
const express = require('express');
const router = express.Router();
const Promocode = require('../models/promocode');
const User = require('../models/user');

// Try to import auth middleware (adjust path as needed)
let authenticateUser;
try {
  authenticateUser = require('../middlewares/authMiddleware');
} catch (err) {
  console.warn('⚠️ Auth middleware not found, using basic auth check');
  authenticateUser = (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    // Basic token validation - adjust as needed
    req.user = { uid: 'admin', email: 'admin@aced.live', name: 'Admin' };
    next();
  };
}

// ============================================
// 🛡️ ADMIN MIDDLEWARE (Optional - customize as needed)
// ============================================
const requireAdmin = (req, res, next) => {
  // Customize this based on your admin role system
  // For now, we'll allow any authenticated user to manage promocodes
  // You can add role checking here:
  // if (req.user.role !== 'admin') {
  //   return res.status(403).json({ success: false, error: 'Admin access required' });
  // }
  next();
};

// ============================================
// 📋 ADMIN ROUTES (for admin panel)
// ============================================

// GET /api/promocodes - Get all promocodes (Admin only)
router.get('/', authenticateUser, requireAdmin, async (req, res) => {
  try {
    console.log('📋 Admin: Fetching all promocodes');
    
    const { 
      page = 1, 
      limit = 20, 
      search, 
      status, 
      plan,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build filter
    const filter = {};
    
    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { createdByName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status === 'active') {
      filter.isActive = true;
      filter.$and = [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }
      ];
    } else if (status === 'inactive') {
      filter.isActive = false;
    } else if (status === 'expired') {
      filter.expiresAt = { $lt: new Date() };
    } else if (status === 'exhausted') {
      filter.$expr = { $gte: ['$currentUses', '$maxUses'] };
      filter.maxUses = { $ne: null };
    }
    
    if (plan) {
      filter.grantsPlan = plan;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const [promocodes, total] = await Promise.all([
      Promocode.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Promocode.countDocuments(filter)
    ]);
    
    // Add computed fields
    const now = new Date();
    const enrichedPromocodes = promocodes.map(promo => {
      const isExpired = promo.expiresAt && now > promo.expiresAt;
      const isExhausted = promo.maxUses && promo.currentUses >= promo.maxUses;
      const remainingUses = promo.maxUses ? Math.max(0, promo.maxUses - promo.currentUses) : null;
      const usagePercentage = promo.maxUses ? Math.round((promo.currentUses / promo.maxUses) * 100) : 0;
      
      let status = 'active';
      if (!promo.isActive) status = 'inactive';
      else if (isExpired) status = 'expired';
      else if (isExhausted) status = 'exhausted';
      
      return {
        ...promo,
        isExpired,
        isExhausted,
        remainingUses,
        usagePercentage,
        status
      };
    });
    
    res.json({
      success: true,
      data: enrichedPromocodes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching promocodes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch promocodes',
      details: error.message
    });
  }
});

// POST /api/promocodes - Create promocode (Admin only)
router.post('/', authenticateUser, requireAdmin, async (req, res) => {
  try {
    console.log('➕ Admin: Creating new promocode');
    
    const {
      code,
      grantsPlan,
      description,
      maxUses,
      expiresAt,
      subscriptionDays,
      generateRandom,
      restrictedToUsers,
      requiresMinimumPlan,
      tags
    } = req.body;
    
    // Validation
    if (!grantsPlan || !['start', 'pro', 'premium'].includes(grantsPlan)) {
      return res.status(400).json({
        success: false,
        error: 'Valid grantsPlan is required (start, pro, premium)'
      });
    }
    
    let finalCode = code?.trim()?.toUpperCase();
    
    // Generate random code if requested
    if (generateRandom || !finalCode) {
      const prefix = grantsPlan.toUpperCase().substring(0, 3);
      finalCode = Promocode.generateCode(prefix, 10);
      
      // Ensure uniqueness
      let attempts = 0;
      while (await Promocode.findOne({ code: finalCode }) && attempts < 10) {
        finalCode = Promocode.generateCode(prefix, 10);
        attempts++;
      }
      
      if (attempts >= 10) {
        return res.status(500).json({
          success: false,
          error: 'Failed to generate unique code, please try again'
        });
      }
    }
    
    if (!finalCode || finalCode.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'Code must be at least 4 characters long'
      });
    }
    
    // Check if code already exists
    const existingCode = await Promocode.findOne({ code: finalCode });
    if (existingCode) {
      return res.status(400).json({
        success: false,
        error: 'Promocode already exists'
      });
    }
    
    // Validate dates
    let parsedExpiresAt = null;
    if (expiresAt) {
      parsedExpiresAt = new Date(expiresAt);
      if (parsedExpiresAt <= new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Expiry date must be in the future'
        });
      }
    }
    
    // Validate subscription days
    const days = parseInt(subscriptionDays) || 30;
    if (days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        error: 'Subscription days must be between 1 and 365'
      });
    }
    
    // Create promocode
    const promocode = new Promocode({
      code: finalCode,
      grantsPlan,
      description: description?.trim() || `${grantsPlan.toUpperCase()} plan access`,
      maxUses: maxUses && maxUses > 0 ? parseInt(maxUses) : null,
      expiresAt: parsedExpiresAt,
      subscriptionDays: days,
      restrictedToUsers: Array.isArray(restrictedToUsers) ? restrictedToUsers : [],
      requiresMinimumPlan: requiresMinimumPlan || 'free',
      tags: Array.isArray(tags) ? tags.map(tag => tag.trim()).filter(Boolean) : [],
      createdBy: req.user.uid,
      createdByName: req.user.name || req.user.email || 'Admin',
      createdByEmail: req.user.email || ''
    });
    
    await promocode.save();
    
    console.log('✅ Promocode created:', finalCode);
    
    res.status(201).json({
      success: true,
      data: promocode,
      message: `Promocode ${finalCode} created successfully`
    });
    
  } catch (error) {
    console.error('❌ Error creating promocode:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Promocode already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create promocode',
      details: error.message
    });
  }
});

// PUT /api/promocodes/:id - Update promocode (Admin only)
router.put('/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    console.log('🔄 Admin: Updating promocode:', req.params.id);
    
    const {
      description,
      maxUses,
      expiresAt,
      subscriptionDays,
      isActive,
      restrictedToUsers,
      requiresMinimumPlan,
      tags
    } = req.body;
    
    const promocode = await Promocode.findById(req.params.id);
    if (!promocode) {
      return res.status(404).json({
        success: false,
        error: 'Promocode not found'
      });
    }
    
    // Update fields
    if (description !== undefined) {
      promocode.description = description?.trim() || '';
    }
    
    if (maxUses !== undefined) {
      promocode.maxUses = maxUses && maxUses > 0 ? parseInt(maxUses) : null;
    }
    
    if (expiresAt !== undefined) {
      if (expiresAt) {
        const parsedDate = new Date(expiresAt);
        if (parsedDate <= new Date()) {
          return res.status(400).json({
            success: false,
            error: 'Expiry date must be in the future'
          });
        }
        promocode.expiresAt = parsedDate;
      } else {
        promocode.expiresAt = null;
      }
    }
    
    if (subscriptionDays !== undefined) {
      const days = parseInt(subscriptionDays);
      if (days < 1 || days > 365) {
        return res.status(400).json({
          success: false,
          error: 'Subscription days must be between 1 and 365'
        });
      }
      promocode.subscriptionDays = days;
    }
    
    if (isActive !== undefined) {
      promocode.isActive = Boolean(isActive);
    }
    
    if (restrictedToUsers !== undefined) {
      promocode.restrictedToUsers = Array.isArray(restrictedToUsers) ? restrictedToUsers : [];
    }
    
    if (requiresMinimumPlan !== undefined) {
      if (!['free', 'start', 'pro', 'premium'].includes(requiresMinimumPlan)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid minimum plan requirement'
        });
      }
      promocode.requiresMinimumPlan = requiresMinimumPlan;
    }
    
    if (tags !== undefined) {
      promocode.tags = Array.isArray(tags) ? tags.map(tag => tag.trim()).filter(Boolean) : [];
    }
    
    await promocode.save();
    
    console.log('✅ Promocode updated:', promocode.code);
    
    res.json({
      success: true,
      data: promocode,
      message: `Promocode ${promocode.code} updated successfully`
    });
    
  } catch (error) {
    console.error('❌ Error updating promocode:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update promocode',
      details: error.message
    });
  }
});

// DELETE /api/promocodes/:id - Delete promocode (Admin only)
router.delete('/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    console.log('🗑️ Admin: Deleting promocode:', req.params.id);
    
    const promocode = await Promocode.findById(req.params.id);
    if (!promocode) {
      return res.status(404).json({
        success: false,
        error: 'Promocode not found'
      });
    }
    
    // Check if promocode has been used
    if (promocode.currentUses > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete promocode that has been used. Deactivate it instead.',
        usageCount: promocode.currentUses
      });
    }
    
    await promocode.deleteOne();
    
    console.log('✅ Promocode deleted:', promocode.code);
    
    res.json({
      success: true,
      message: `Promocode ${promocode.code} deleted successfully`
    });
    
  } catch (error) {
    console.error('❌ Error deleting promocode:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete promocode',
      details: error.message
    });
  }
});

// GET /api/promocodes/stats - Get promocode statistics (Admin only)
router.get('/stats', authenticateUser, requireAdmin, async (req, res) => {
  try {
    console.log('📊 Admin: Fetching promocode stats');
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const [
      total,
      active,
      expired,
      exhausted,
      inactive,
      recentUsage,
      planDistribution,
      topCodes
    ] = await Promise.all([
      Promocode.countDocuments(),
      Promocode.countDocuments({ 
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: now } }
        ]
      }),
      Promocode.countDocuments({ 
        expiresAt: { $lt: now }
      }),
      Promocode.countDocuments({
        $expr: { $gte: ['$currentUses', '$maxUses'] },
        maxUses: { $ne: null }
      }),
      Promocode.countDocuments({ isActive: false }),
      Promocode.aggregate([
        { $unwind: '$usedBy' },
        { $match: { 'usedBy.usedAt': { $gte: thirtyDaysAgo } } },
        { $count: 'recentUsage' }
      ]),
      Promocode.aggregate([
        { $group: { _id: '$grantsPlan', count: { $sum: 1 } } }
      ]),
      Promocode.find({}, 'code currentUses grantsPlan')
        .sort({ currentUses: -1 })
        .limit(5)
        .lean()
    ]);
    
    res.json({
      success: true,
      stats: {
        total,
        active,
        expired,
        exhausted,
        inactive,
        recentUsage: recentUsage[0]?.recentUsage || 0,
        planDistribution: planDistribution.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        topCodes: topCodes.map(code => ({
          code: code.code,
          uses: code.currentUses,
          plan: code.grantsPlan
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching promocode stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats',
      details: error.message
    });
  }
});

// POST /api/promocodes/bulk-create - Bulk create promocodes (Admin only)
router.post('/bulk-create', authenticateUser, requireAdmin, async (req, res) => {
  try {
    console.log('📦 Admin: Bulk creating promocodes');
    
    const {
      count = 10,
      grantsPlan,
      prefix = '',
      maxUses,
      expiresAt,
      subscriptionDays = 30,
      description
    } = req.body;
    
    if (!grantsPlan || !['start', 'pro', 'premium'].includes(grantsPlan)) {
      return res.status(400).json({
        success: false,
        error: 'Valid grantsPlan is required'
      });
    }
    
    if (count < 1 || count > 100) {
      return res.status(400).json({
        success: false,
        error: 'Count must be between 1 and 100'
      });
    }
    
    const promocodes = [];
    const errors = [];
    
    for (let i = 0; i < count; i++) {
      try {
        let code;
        let attempts = 0;
        
        do {
          code = Promocode.generateCode(prefix, 10);
          attempts++;
        } while (await Promocode.findOne({ code }) && attempts < 10);
        
        if (attempts >= 10) {
          errors.push(`Failed to generate unique code for item ${i + 1}`);
          continue;
        }
        
        const promocode = new Promocode({
          code,
          grantsPlan,
          description: description || `Bulk ${grantsPlan.toUpperCase()} plan access`,
          maxUses: maxUses && maxUses > 0 ? parseInt(maxUses) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          subscriptionDays: parseInt(subscriptionDays) || 30,
          createdBy: req.user.uid,
          createdByName: req.user.name || req.user.email || 'Admin',
          createdByEmail: req.user.email || ''
        });
        
        await promocode.save();
        promocodes.push(promocode);
        
      } catch (error) {
        errors.push(`Error creating promocode ${i + 1}: ${error.message}`);
      }
    }
    
    console.log(`✅ Bulk created ${promocodes.length} promocodes`);
    
    res.status(201).json({
      success: true,
      data: promocodes,
      message: `Successfully created ${promocodes.length} promocodes`,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('❌ Error bulk creating promocodes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk create promocodes',
      details: error.message
    });
  }
});

// POST /api/promocodes/cleanup - Cleanup expired/exhausted promocodes (Admin only)
router.post('/cleanup', authenticateUser, requireAdmin, async (req, res) => {
  try {
    console.log('🧹 Admin: Cleaning up promocodes');
    
    const { action = 'deactivate' } = req.body; // 'deactivate' or 'delete'
    
    const now = new Date();
    
    // Find expired and exhausted promocodes
    const expiredCodes = await Promocode.find({
      expiresAt: { $lt: now },
      isActive: true
    });
    
    const exhaustedCodes = await Promocode.find({
      $expr: { $gte: ['$currentUses', '$maxUses'] },
      maxUses: { $ne: null },
      isActive: true
    });
    
    let expiredResult, exhaustedResult;
    
    if (action === 'delete') {
      // Only delete unused codes
      expiredResult = await Promocode.deleteMany({
        expiresAt: { $lt: now },
        currentUses: 0
      });
      
      exhaustedResult = await Promocode.deleteMany({
        $expr: { $gte: ['$currentUses', '$maxUses'] },
        maxUses: { $ne: null },
        currentUses: 0
      });
    } else {
      // Deactivate expired codes
      expiredResult = await Promocode.updateMany(
        {
          expiresAt: { $lt: now },
          isActive: true
        },
        {
          $set: { isActive: false }
        }
      );
      
      // Deactivate exhausted codes
      exhaustedResult = await Promocode.updateMany(
        {
          $expr: { $gte: ['$currentUses', '$maxUses'] },
          maxUses: { $ne: null },
          isActive: true
        },
        {
          $set: { isActive: false }
        }
      );
    }
    
    console.log('✅ Cleanup completed');
    
    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      results: {
        expired: {
          found: expiredCodes.length,
          processed: expiredResult.modifiedCount || expiredResult.deletedCount || 0
        },
        exhausted: {
          found: exhaustedCodes.length,
          processed: exhaustedResult.modifiedCount || exhaustedResult.deletedCount || 0
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error cleaning up promocodes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup promocodes',
      details: error.message
    });
  }
});

// ============================================
// 🎟️ USER ROUTES (for main website)
// ============================================

// POST /api/promocodes/apply - Apply promocode (User)
router.post('/apply', authenticateUser, async (req, res) => {
  try {
    console.log('🎟️ User applying promocode:', req.body.code);
    
    const { code } = req.body;
    
    if (!code || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Promocode is required'
      });
    }
    
    // Find promocode
    const promocode = await Promocode.findValidCode(code.trim());
    if (!promocode) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or inactive promocode'
      });
    }
    
    // Find user
    const user = await User.findOne({ 
      $or: [
        { firebaseId: req.user.uid },
        { _id: req.user.uid }
      ]
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if user can use this code
    const canUse = promocode.canUserUse(req.user.uid, user.subscriptionPlan || 'free');
    if (!canUse.canUse) {
      return res.status(400).json({
        success: false,
        error: canUse.reason,
        code: canUse.code
      });
    }
    
    // Get user IP for tracking
    const userIP = req.ip || req.connection.remoteAddress || '';
    
    // Apply promocode
    await promocode.useCode(
      req.user.uid, 
      req.user.email || user.email, 
      req.user.name || user.name || 'User',
      userIP
    );
    
    // Calculate new expiry date
    const now = new Date();
    const currentExpiry = user.subscriptionExpiryDate ? new Date(user.subscriptionExpiryDate) : now;
    const startDate = currentExpiry > now ? currentExpiry : now;
    
    const newExpiryDate = new Date(startDate);
    newExpiryDate.setDate(newExpiryDate.getDate() + promocode.subscriptionDays);
    
    // Update user subscription
    const previousPlan = user.subscriptionPlan || 'free';
    
    user.subscriptionPlan = promocode.grantsPlan;
    user.subscriptionStartDate = user.subscriptionStartDate || now;
    user.subscriptionExpiryDate = newExpiryDate;
    user.paymentStatus = 'promocode';
    user.lastPaymentDate = now;
    
    // Store promocode usage info
    if (!user.promotionalAccess) {
      user.promotionalAccess = [];
    }
    
    user.promotionalAccess.push({
      code: promocode.code,
      appliedAt: now,
      grantedPlan: promocode.grantsPlan,
      subscriptionDays: promocode.subscriptionDays,
      expiresAt: newExpiryDate,
      previousPlan
    });
    
    await user.save();
    
    console.log('✅ Promocode applied successfully:', {
      code: promocode.code,
      user: req.user.email,
      plan: promocode.grantsPlan,
      previousPlan,
      newExpiry: newExpiryDate
    });
    
    res.json({
      success: true,
      message: `Promocode applied! You now have ${promocode.grantsPlan.toUpperCase()} access for ${promocode.subscriptionDays} days.`,
      data: {
        plan: promocode.grantsPlan,
        previousPlan,
        expiresAt: newExpiryDate,
        subscriptionDays: promocode.subscriptionDays,
        upgrade: previousPlan !== promocode.grantsPlan
      }
    });
    
  } catch (error) {
    console.error('❌ Error applying promocode:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply promocode',
      details: error.message
    });
  }
});

// GET /api/promocodes/validate/:code - Validate promocode without applying (User)
router.get('/validate/:code', async (req, res) => {
  try {
    console.log('🔍 Validating promocode:', req.params.code);
    
    const { code } = req.params;
    
    if (!code || !code.trim()) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: 'Promocode is required'
      });
    }
    
    const promocode = await Promocode.findValidCode(code.trim());
    if (!promocode) {
      return res.status(404).json({
        success: false,
        valid: false,
        error: 'Invalid or inactive promocode'
      });
    }
    
    const validity = promocode.isValid();
    
    if (validity.valid) {
      res.json({
        success: true,
        valid: true,
        data: {
          code: promocode.code,
          grantsPlan: promocode.grantsPlan,
          description: promocode.description,
          subscriptionDays: promocode.subscriptionDays,
          maxUses: promocode.maxUses,
          currentUses: promocode.currentUses,
          remainingUses: promocode.remainingUses,
          expiresAt: promocode.expiresAt
        }
      });
    } else {
      res.json({
        success: false,
        valid: false,
        error: validity.reason,
        code: validity.code
      });
    }
    
  } catch (error) {
    console.error('❌ Error validating promocode:', error);
    res.status(500).json({
      success: false,
      valid: false,
      error: 'Failed to validate promocode',
      details: error.message
    });
  }
});

// GET /api/promocodes/user/history - Get user's promocode usage history (User)
router.get('/user/history', authenticateUser, async (req, res) => {
  try {
    console.log('📋 Fetching user promocode history:', req.user.uid);
    
    // Find user
    const user = await User.findOne({ 
      $or: [
        { firebaseId: req.user.uid },
        { _id: req.user.uid }
      ]
    }).select('promotionalAccess subscriptionPlan subscriptionExpiryDate');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Get promocodes used by this user
    const usedPromocodes = await Promocode.find({
      'usedBy.userId': req.user.uid
    }).select('code grantsPlan description subscriptionDays usedBy');
    
    // Extract usage info for this user
    const history = usedPromocodes.map(promo => {
      const usage = promo.usedBy.find(use => use.userId === req.user.uid);
      return {
        code: promo.code,
        grantsPlan: promo.grantsPlan,
        description: promo.description,
        subscriptionDays: promo.subscriptionDays,
        usedAt: usage.usedAt,
        userEmail: usage.userEmail,
        userName: usage.userName
      };
    }).sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt));
    
    res.json({
      success: true,
      data: {
        history,
        currentPlan: user.subscriptionPlan || 'free',
        subscriptionExpiryDate: user.subscriptionExpiryDate,
        promotionalAccess: user.promotionalAccess || []
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching user promocode history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch promocode history',
      details: error.message
    });
  }
});

// ============================================
// 🛠️ UTILITY ROUTES
// ============================================

// GET /api/promocodes/plans - Get available plans
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    data: {
      plans: [
        {
          id: 'start',
          name: 'Start',
          description: 'Basic premium features',
          features: ['Базовые курсы', 'Домашние задания', 'Основные тесты']
        },
        {
          id: 'pro',
          name: 'Pro',
          description: 'Advanced features',
          features: ['Все курсы Start', 'Продвинутые курсы', 'Персональная аналитика', 'Приоритетная поддержка']
        },
        {
          id: 'premium',
          name: 'Premium',
          description: 'All features',
          features: ['Все функции Pro', 'Персональный преподаватель', 'Безлимитные возможности']
        }
      ]
    }
  });
});

module.exports = router;