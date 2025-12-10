// routes/promocodeRoutes.js
const express = require('express');
const router = express.Router();

// --- Model Imports ---
// Try to import the promocode model with error handling
let Promocode;
try {
  Promocode = require('../models/promoCode');
} catch (error) {
  console.error('❌ Failed to load Promocode model:', error.message);
  console.error('💡 Make sure models/promoCode.js exists and is properly formatted');
}

const User = require('../models/user');

// --- Middleware ---
// Enhanced auth middleware with better error handling
const authMiddleware = require('../middlewares/authMiddleware');

// Basic auth middleware for admin routes
const requireAuth = async (req, res, next) => {
  try {
    // Check for authorization header
    if (!req.headers.authorization) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const token = req.headers.authorization.replace('Bearer ', '');

    // For now, assume authenticated admin user (customize this based on your auth system!)
    req.user = {
      id: token.substring(0, 10) || 'admin',
      uid: token.substring(0, 10) || 'admin',
      email: 'admin@aced.live',
      name: 'Admin User'
    };

    next();
  } catch (error) {
    console.error('❌ Auth error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid authentication token'
    });
  }
};

// ============================================
// 🎟️ USER-FACING ROUTES
// ============================================

/**
 * @route   POST /api/promocodes/apply
 * @desc    Apply a promocode to the current user's account
 * @access  Private
 * ✅ FIXED: Now correctly looks up user by firebaseId
 */
router.post('/apply', authMiddleware, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, message: 'Promocode system not available.' });
    }

    const { code } = req.body;
    
    // ✅ FIXED: Get firebaseId from auth middleware (it sets req.user.uid)
    const firebaseId = req.user.uid || req.user.id || req.user.firebaseId;
    
    console.log('🎟️ [promocodeRoutes] Apply request received');
    console.log('🎟️ [promocodeRoutes] Code:', code);
    console.log('🎟️ [promocodeRoutes] Firebase ID:', firebaseId);

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Promocode is required.' });
    }

    if (!firebaseId) {
      console.error('❌ [promocodeRoutes] No firebaseId in request');
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const promoCode = await Promocode.findOne({ code: code.trim().toUpperCase(), isActive: true });

    if (!promoCode) {
      console.log('❌ [promocodeRoutes] Promo code not found or inactive:', code);
      return res.status(404).json({ success: false, message: 'Promo code not found or is inactive.' });
    }

    // ✅ FIXED: Look up user by firebaseId, not by MongoDB _id
    const user = await User.findOne({ firebaseId: firebaseId });
    
    if (!user) {
      console.error('❌ [promocodeRoutes] User not found with firebaseId:', firebaseId);
      
      // Try to find by _id as fallback (in case firebaseId is actually a MongoDB ObjectId)
      const userById = await User.findById(firebaseId).catch(() => null);
      if (userById) {
        console.log('✅ [promocodeRoutes] Found user by _id instead');
        return processPromoApplication(userById, promoCode, res);
      }
      
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    console.log('✅ [promocodeRoutes] User found:', user.email);
    
    return processPromoApplication(user, promoCode, res);

  } catch (error) {
    console.error('❌ Error applying promo code:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while applying promo code.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/promocodes/validate/:code
 * @desc    Validate a promocode without applying it
 * @access  Public
 */
router.get('/validate/:code', async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, valid: false, error: 'Promocode system not available' });
    }

    const { code } = req.params;
    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, valid: false, error: 'Promocode is required' });
    }

    const promocode = await Promocode.findOne({
      code: code.trim().toUpperCase(),
      isActive: true
    });

    if (!promocode) {
      return res.status(404).json({ success: false, valid: false, error: 'Invalid or inactive promocode' });
    }

    // Enhanced validation using model method if available
    const validity = promocode.isValid ? promocode.isValid() : {
      valid: true,
      reason: null
    };

    if (validity.valid) {
      const remainingUses = promocode.maxUses ? Math.max(0, promocode.maxUses - promocode.currentUses) : null;

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
          remainingUses: remainingUses,
          expiresAt: promocode.expiresAt,
          tags: promocode.tags || []
        }
      });
    } else {
      res.status(400).json({
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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/promocodes/user/:userId/history
 * @desc    Get all promocodes used by a specific user (for admin panel)
 * @access  Admin
 */
router.get('/user/:userId/history', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, error: 'Promocode system not available' });
    }

    const { userId } = req.params;

    // Find all promocodes where this user is in the usedBy array
    const promocodes = await Promocode.find({
      'usedBy.userId': userId
    }).lean();

    // Extract usage info for this specific user
    const userPromocodeHistory = promocodes.map(promo => {
      const userUsage = promo.usedBy.find(u => u.userId === userId || u.userId?.toString() === userId);
      return {
        code: promo.code,
        grantsPlan: promo.grantsPlan,
        subscriptionDays: promo.subscriptionDays,
        description: promo.description,
        usedAt: userUsage?.usedAt || null,
        promocodeId: promo._id
      };
    });

    // Sort by usage date descending
    userPromocodeHistory.sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt));

    res.json({
      success: true,
      data: userPromocodeHistory,
      count: userPromocodeHistory.length
    });

  } catch (error) {
    console.error('❌ Error fetching user promocode history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user promocode history',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// 📋 ADMIN PROMOCODE ROUTES
// ============================================

// GET /api/promocodes - Get all promocodes with pagination and filtering
router.get('/', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, error: 'Promocode model not available' });
    }

    const {
      page = 1,
      limit = 20,
      search = '',
      status = '',
      plan = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};

    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { createdByName: { $regex: search, $options: 'i' } }
      ];
    }

    if (plan) filter.grantsPlan = plan;

    // Enhanced status filtering
    const now = new Date();
    if (status === 'active') {
      filter.isActive = true;
      filter.$and = [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
      ];
    } else if (status === 'inactive') {
      filter.isActive = false;
    } else if (status === 'expired') {
      filter.expiresAt = { $lt: now };
    } else if (status === 'exhausted') {
      filter.$expr = { $gte: ['$currentUses', '$maxUses'] };
      filter.maxUses = { $ne: null };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [promocodes, total] = await Promise.all([
      Promocode.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Promocode.countDocuments(filter)
    ]);

    // Add computed fields for frontend compatibility
    const enrichedPromocodes = promocodes.map(promo => {
      const isExpired = promo.expiresAt && now > promo.expiresAt;
      const isExhausted = promo.maxUses != null && promo.currentUses >= promo.maxUses;
      const remainingUses = promo.maxUses ? Math.max(0, promo.maxUses - promo.currentUses) : null;
      const usagePercentage = promo.maxUses ? Math.round((promo.currentUses / promo.maxUses) * 100) : 0;

      let computedStatus = 'active';
      if (!promo.isActive) computedStatus = 'inactive';
      else if (isExpired) computedStatus = 'expired';
      else if (isExhausted) computedStatus = 'exhausted';

      return {
        ...promo,
        isExpired,
        isExhausted,
        remainingUses,
        usagePercentage,
        status: computedStatus
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

// GET /api/promocodes/stats - Get promocode statistics
router.get('/stats', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, error: 'Promocode model not available' });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      total,
      active,
      expired,
      exhausted,
      inactive,
      recentUsageResult,
      planDistribution,
      topCodes
    ] = await Promise.all([
      Promocode.countDocuments(),
      Promocode.countDocuments({
        isActive: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
      }),
      Promocode.countDocuments({ expiresAt: { $lt: now } }),
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

    const stats = {
      total: total || 0,
      active: active || 0,
      expired: expired || 0,
      exhausted: exhausted || 0,
      inactive: inactive || 0,
      recentUsage: recentUsageResult[0]?.recentUsage || 0,
      planDistribution: planDistribution.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      topCodes: topCodes.map(c => ({
        code: c.code,
        uses: c.currentUses,
        plan: c.grantsPlan
      }))
    };

    res.json({ success: true, stats });

  } catch (error) {
    console.error('❌ Error fetching promocode stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch promocode stats',
      details: error.message
    });
  }
});

// POST /api/promocodes - Create new promocode
router.post('/', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, error: 'Promocode model not available' });
    }

    const {
      code,
      grantsPlan,
      description,
      maxUses,
      expiresAt,
      subscriptionDays,
      generateRandom,
      isActive = true,
      restrictedToUsers,
      requiresMinimumPlan,
      tags
    } = req.body;

    // Enhanced validation
    if (!grantsPlan || !['start', 'pro', 'premium'].includes(grantsPlan)) {
      return res.status(400).json({
        success: false,
        error: 'Valid grantsPlan is required (start, pro, premium)'
      });
    }

    let finalCode = code?.trim()?.toUpperCase();

    // Generate random code if requested or no code provided
    if (generateRandom || !finalCode) {
      const prefix = grantsPlan.toUpperCase().substring(0, 3);
      finalCode = generateRandomCode(prefix, 10);

      // Ensure uniqueness
      let attempts = 0;
      while (await Promocode.findOne({ code: finalCode }) && attempts < 10) {
        finalCode = generateRandomCode(prefix, 10);
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
    if (await Promocode.findOne({ code: finalCode })) {
      return res.status(400).json({ success: false, error: 'Promocode already exists' });
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

    const promocode = new Promocode({
      code: finalCode,
      grantsPlan,
      description: description?.trim() || `${grantsPlan.toUpperCase()} plan access`,
      maxUses: maxUses && maxUses > 0 ? parseInt(maxUses) : null,
      expiresAt: parsedExpiresAt,
      subscriptionDays: days,
      isActive: Boolean(isActive),
      restrictedToUsers: Array.isArray(restrictedToUsers) ? restrictedToUsers : [],
      requiresMinimumPlan: requiresMinimumPlan || 'free',
      tags: Array.isArray(tags) ? tags.map(tag => tag.trim()).filter(Boolean) : [],
      createdBy: req.user.uid || req.user.id,
      createdByName: req.user.name || req.user.email || 'Admin',
      createdByEmail: req.user.email || ''
    });

    await promocode.save();

    res.status(201).json({
      success: true,
      data: promocode,
      message: `Promocode ${finalCode} created successfully`
    });

  } catch (error) {
    console.error('❌ Error creating promocode:', error);

    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Promocode already exists' });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create promocode',
      details: error.message
    });
  }
});

// PUT /api/promocodes/:id - Update promocode
router.put('/:id', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, error: 'Promocode model not available' });
    }

    const promocode = await Promocode.findById(req.params.id);
    if (!promocode) {
      return res.status(404).json({ success: false, error: 'Promocode not found' });
    }

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

    // Update fields with enhanced validation
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

    if (isActive !== undefined) promocode.isActive = Boolean(isActive);

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

// DELETE /api/promocodes/:id - Delete promocode
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, error: 'Promocode model not available' });
    }

    const promocode = await Promocode.findById(req.params.id);
    if (!promocode) {
      return res.status(404).json({ success: false, error: 'Promocode not found' });
    }

    // Enhanced deletion logic
    if (promocode.currentUses > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete promocode that has been used. Deactivate it instead.',
        usageCount: promocode.currentUses
      });
    }

    await promocode.deleteOne();

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

// POST /api/promocodes/bulk-create - Bulk create promocodes
router.post('/bulk-create', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, error: 'Promocode model not available' });
    }

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
      return res.status(400).json({ success: false, error: 'Valid grantsPlan is required' });
    }

    if (count < 1 || count > 100) {
      return res.status(400).json({ success: false, error: 'Count must be between 1 and 100' });
    }

    const promocodes = [];
    const errors = [];

    for (let i = 0; i < count; i++) {
      try {
        let code;
        let attempts = 0;

        do {
          code = generateRandomCode(prefix, 10);
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
          createdBy: req.user.uid || req.user.id,
          createdByName: req.user.name || req.user.email || 'Admin',
          createdByEmail: req.user.email || ''
        });

        await promocode.save();
        promocodes.push(promocode);

      } catch (error) {
        errors.push(`Error creating promocode ${i + 1}: ${error.message}`);
      }
    }

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

// POST /api/promocodes/cleanup - Cleanup expired/exhausted promocodes
router.post('/cleanup', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, error: 'Promocode model not available' });
    }

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

// GET /api/promocodes/:id/usage - Get detailed usage information for a promocode
router.get('/:id/usage', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, error: 'Promocode model not available' });
    }

    const promocode = await Promocode.findById(req.params.id)
      .populate('usedBy.userId', 'name email')
      .lean();

    if (!promocode) {
      return res.status(404).json({ success: false, error: 'Promocode not found' });
    }

    // Enhanced usage analytics
    const usageData = promocode.usedBy || [];
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const analytics = {
      totalUses: usageData.length,
      uniqueUsers: new Set(usageData.map(u => u.userId?.toString())).size,
      recentUses: {
        last7Days: usageData.filter(u => u.usedAt >= last7Days).length,
        last30Days: usageData.filter(u => u.usedAt >= last30Days).length
      },
      usageByDate: usageData.reduce((acc, usage) => {
        const date = usage.usedAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {}),
      topUsers: usageData
        .reduce((acc, usage) => {
          const userId = usage.userId?.toString();
          if (userId) {
            acc[userId] = (acc[userId] || 0) + 1;
          }
          return acc;
        }, {})
    };

    res.json({
      success: true,
      data: {
        promocode: {
          code: promocode.code,
          grantsPlan: promocode.grantsPlan,
          description: promocode.description,
          maxUses: promocode.maxUses,
          currentUses: promocode.currentUses,
          isActive: promocode.isActive,
          expiresAt: promocode.expiresAt,
          createdAt: promocode.createdAt
        },
        usage: usageData,
        analytics
      }
    });

  } catch (error) {
    console.error('❌ Error fetching promocode usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch promocode usage',
      details: error.message
    });
  }
});

// POST /api/promocodes/:id/duplicate - Duplicate a promocode with new code
router.post('/:id/duplicate', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, error: 'Promocode model not available' });
    }

    const originalPromocode = await Promocode.findById(req.params.id);
    if (!originalPromocode) {
      return res.status(404).json({ success: false, error: 'Promocode not found' });
    }

    const { newCode, generateRandom } = req.body;

    let finalCode = newCode?.trim()?.toUpperCase();

    // Generate random code if requested or no code provided
    if (generateRandom || !finalCode) {
      const prefix = originalPromocode.grantsPlan.toUpperCase().substring(0, 3);
      finalCode = generateRandomCode(prefix, 10);

      // Ensure uniqueness
      let attempts = 0;
      while (await Promocode.findOne({ code: finalCode }) && attempts < 10) {
        finalCode = generateRandomCode(prefix, 10);
        attempts++;
      }

      if (attempts >= 10) {
        return res.status(500).json({
          success: false,
          error: 'Failed to generate unique code'
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
    if (await Promocode.findOne({ code: finalCode })) {
      return res.status(400).json({ success: false, error: 'Promocode already exists' });
    }

    // Create duplicate with fresh usage stats
    const duplicatePromocode = new Promocode({
      code: finalCode,
      grantsPlan: originalPromocode.grantsPlan,
      description: originalPromocode.description,
      maxUses: originalPromocode.maxUses,
      expiresAt: originalPromocode.expiresAt,
      subscriptionDays: originalPromocode.subscriptionDays,
      isActive: originalPromocode.isActive,
      restrictedToUsers: [...(originalPromocode.restrictedToUsers || [])],
      requiresMinimumPlan: originalPromocode.requiresMinimumPlan,
      tags: [...(originalPromocode.tags || [])],
      createdBy: req.user.uid || req.user.id,
      createdByName: req.user.name || req.user.email || 'Admin',
      createdByEmail: req.user.email || '',
      currentUses: 0,
      usedBy: []
    });

    await duplicatePromocode.save();

    res.status(201).json({
      success: true,
      data: duplicatePromocode,
      message: `Promocode duplicated as ${finalCode}`
    });

  } catch (error) {
    console.error('❌ Error duplicating promocode:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to duplicate promocode',
      details: error.message
    });
  }
});

// GET /api/promocodes/export - Export promocodes to CSV
router.get('/export', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({ success: false, error: 'Promocode model not available' });
    }

    const { format = 'json', status = '', plan = '' } = req.query;

    // Build filter
    const filter = {};
    if (plan) filter.grantsPlan = plan;
    if (status === 'active') filter.isActive = true;
    else if (status === 'inactive') filter.isActive = false;

    const promocodes = await Promocode.find(filter)
      .select('-usedBy -__v')
      .sort({ createdAt: -1 })
      .lean();

    // Add computed fields
    const now = new Date();
    const exportData = promocodes.map(promo => ({
      code: promo.code,
      grantsPlan: promo.grantsPlan,
      description: promo.description,
      maxUses: promo.maxUses || 'Unlimited',
      currentUses: promo.currentUses || 0,
      remainingUses: promo.maxUses ? Math.max(0, promo.maxUses - (promo.currentUses || 0)) : 'Unlimited',
      subscriptionDays: promo.subscriptionDays,
      isActive: promo.isActive,
      expiresAt: promo.expiresAt || 'Never',
      status: !promo.isActive ? 'Inactive' :
        (promo.expiresAt && promo.expiresAt < now) ? 'Expired' :
          (promo.maxUses && promo.currentUses >= promo.maxUses) ? 'Exhausted' : 'Active',
      createdAt: promo.createdAt,
      createdByName: promo.createdByName,
      tags: promo.tags?.join(', ') || ''
    }));

    if (format === 'csv') {
      // Convert to CSV format
      const headers = Object.keys(exportData[0] || {});
      const csvContent = [
        headers.join(','),
        ...exportData.map(row =>
          headers.map(header =>
            typeof row[header] === 'string' && row[header].includes(',')
              ? `"${row[header]}"`
              : row[header]
          ).join(',')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=promocodes.csv');
      res.send(csvContent);
    } else {
      res.json({
        success: true,
        data: exportData,
        count: exportData.length
      });
    }

  } catch (error) {
    console.error('❌ Error exporting promocodes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export promocodes',
      details: error.message
    });
  }
});

// ============================================
// 🛠️ UTILITY FUNCTIONS
// ============================================

/**
 * Helper function to process promocode application
 */
async function processPromoApplication(user, promoCode, res) {
  try {
    // --- Enhanced Validation Checks ---
    const validity = promoCode.isValid ? promoCode.isValid() : { valid: true };
    if (!validity.valid) {
      return res.status(400).json({ success: false, message: validity.reason || 'Promocode is not valid.' });
    }

    if (promoCode.expiresAt && promoCode.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'This promo code has expired.' });
    }

    if (promoCode.maxUses && promoCode.currentUses >= promoCode.maxUses) {
      return res.status(400).json({ success: false, message: 'This promo code has reached its usage limit.' });
    }

    if (user.usedPromoCodes && user.usedPromoCodes.includes(promoCode._id.toString())) {
      return res.status(400).json({ success: false, message: 'You have already used this promo code.' });
    }

    // Check restricted users if applicable
    if (promoCode.restrictedToUsers && promoCode.restrictedToUsers.length > 0) {
      const isRestricted = promoCode.restrictedToUsers.includes(user.email) ||
        promoCode.restrictedToUsers.includes(user._id.toString());
      if (!isRestricted) {
        return res.status(403).json({ success: false, message: 'This promo code is not available for your account.' });
      }
    }

    // Check minimum plan requirement if applicable
    if (promoCode.requiresMinimumPlan && promoCode.requiresMinimumPlan !== 'free') {
      const planHierarchy = { free: 0, start: 1, pro: 2, premium: 3 };
      const userPlanLevel = planHierarchy[user.subscriptionPlan] || 0;
      const requiredLevel = planHierarchy[promoCode.requiresMinimumPlan] || 0;

      if (userPlanLevel < requiredLevel) {
        return res.status(403).json({
          success: false,
          message: `This promo code requires a minimum ${promoCode.requiresMinimumPlan} plan.`
        });
      }
    }

    // --- Apply the promo code benefits ---
    console.log('🎟️ [promocodeRoutes] Applying promo benefits:', {
      plan: promoCode.grantsPlan,
      days: promoCode.subscriptionDays
    });

    // Use the centralized grantSubscription method if available
    if (typeof user.grantSubscription === 'function') {
      await user.grantSubscription(
        promoCode.grantsPlan,
        promoCode.subscriptionDays,
        'promocode',
        null
      );
    } else {
      // Fallback: manually update subscription fields
      const now = new Date();
      const expiryDate = new Date(now.getTime() + (promoCode.subscriptionDays * 24 * 60 * 60 * 1000));
      
      user.subscriptionPlan = promoCode.grantsPlan;
      user.userStatus = promoCode.grantsPlan;
      user.plan = promoCode.grantsPlan;
      user.subscriptionExpiryDate = expiryDate;
      user.subscriptionActivatedAt = now;
      user.subscriptionSource = 'promocode';
      user.lastStatusUpdate = now;
    }

    // --- Update records ---
    if (!user.usedPromoCodes) user.usedPromoCodes = [];
    user.usedPromoCodes.push(promoCode._id);

    promoCode.currentUses = (promoCode.currentUses || 0) + 1;
    if (!promoCode.usedBy) promoCode.usedBy = [];
    promoCode.usedBy.push({
      userId: user._id,
      email: user.email,
      usedAt: new Date(),
      userName: user.name || user.email
    });

    await user.save();
    await promoCode.save();

    console.log('✅ [promocodeRoutes] Promo code applied successfully');
    console.log('✅ [promocodeRoutes] New plan:', user.subscriptionPlan);
    console.log('✅ [promocodeRoutes] Expiry:', user.subscriptionExpiryDate);

    // --- Send Notification ---
    try {
      const Message = require('../models/message');
      if (Message && typeof Message.createPromoMessage === 'function') {
        await Message.createPromoMessage(user._id, user.firebaseId, {
          code: promoCode.code,
          grantsPlan: promoCode.grantsPlan,
          subscriptionDays: promoCode.subscriptionDays
        });
      }
    } catch (msgError) {
      console.error('⚠️ Failed to send promo notification:', msgError);
    }

    // ✅ Return comprehensive response with all needed data
    res.json({
      success: true,
      message: 'Promo code applied successfully!',
      user: {
        _id: user._id,
        firebaseId: user.firebaseId,
        email: user.email,
        name: user.name,
        subscriptionPlan: user.subscriptionPlan,
        userStatus: user.subscriptionPlan,
        plan: user.subscriptionPlan,
        subscriptionExpiryDate: user.subscriptionExpiryDate,
        subscriptionActivatedAt: user.subscriptionActivatedAt
      },
      promocode: {
        code: promoCode.code,
        grantsPlan: promoCode.grantsPlan,
        subscriptionDays: promoCode.subscriptionDays
      }
    });
    
  } catch (error) {
    console.error('❌ Error in processPromoApplication:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while applying promo code.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

function generateRandomCode(prefix = '', length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = prefix.toUpperCase();
  const remainingLength = Math.max(4, length - prefix.length);

  for (let i = 0; i < remainingLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

// Enhanced error handler for this router
router.use((error, req, res, next) => {
  console.error('❌ Promocode route error:', error);

  const statusCode = error.status || error.statusCode || 500;
  const message = error.message || 'Internal server error in promocode routes';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: Object.values(error.errors).map(err => err.message)
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format'
    });
  }

  if (error.code === 11000) {
    return res.status(400).json({
      success: false,
      error: 'Duplicate entry found'
    });
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

module.exports = router;