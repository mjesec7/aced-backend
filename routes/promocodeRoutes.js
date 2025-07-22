// routes/promocodeRoutes.js - COMPLETE PROMOCODE ROUTES FOR ADMIN PANEL
const express = require('express');
const router = express.Router();

// Try to import the promocode model - note your model file is promoCode.js
let Promocode;
try {
  Promocode = require('../models/promoCode'); // Your model file name
  console.log('✅ Promocode model loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Promocode model:', error.message);
  console.error('💡 Make sure models/promoCode.js exists and is properly formatted');
}

// Basic auth middleware - customize based on your existing auth system
const requireAuth = async (req, res, next) => {
  try {
    // Check for authorization header
    if (!req.headers.authorization) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }
    
    // You can add your Firebase Auth verification here
    // For now, we'll use a simple token check
    const token = req.headers.authorization.replace('Bearer ', '');
    
    // Add your token verification logic here
    // Example with Firebase Admin:
    // const decodedToken = await admin.auth().verifyIdToken(token);
    // req.user = { uid: decodedToken.uid, email: decodedToken.email };
    
    // For now, assume authenticated admin user (customize this!)
    req.user = { 
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
// 📋 ADMIN PROMOCODE ROUTES
// ============================================

// GET /api/promocodes - Get all promocodes with pagination and filtering
router.get('/', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({
        success: false,
        error: 'Promocode model not available'
      });
    }
    
    console.log('📋 Admin: Fetching all promocodes with filters:', req.query);
    
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
    
    if (plan) {
      filter.grantsPlan = plan;
    }
    
    // Status filtering
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
    
    // Add computed fields for frontend compatibility
    const enrichedPromocodes = promocodes.map(promo => {
      const isExpired = promo.expiresAt && now > promo.expiresAt;
      const isExhausted = promo.maxUses && promo.currentUses >= promo.maxUses;
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
    
    console.log(`✅ Returned ${enrichedPromocodes.length} promocodes (${total} total)`);
    
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
      return res.status(503).json({
        success: false,
        error: 'Promocode model not available'
      });
    }
    
    console.log('📊 Admin: Fetching promocode stats');
    
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
      topCodes: topCodes.map(code => ({
        code: code.code,
        uses: code.currentUses,
        plan: code.grantsPlan
      }))
    };
    
    res.json({
      success: true,
      stats: stats
    });
    
    console.log('✅ Promocode stats returned:', stats);
    
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
      return res.status(503).json({
        success: false,
        error: 'Promocode model not available'
      });
    }
    
    console.log('➕ Admin: Creating new promocode');
    
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
    
    // Validation
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
      isActive: Boolean(isActive),
      restrictedToUsers: Array.isArray(restrictedToUsers) ? restrictedToUsers : [],
      requiresMinimumPlan: requiresMinimumPlan || 'free',
      tags: Array.isArray(tags) ? tags.map(tag => tag.trim()).filter(Boolean) : [],
      createdBy: req.user.uid,
      createdByName: req.user.name || req.user.email || 'Admin',
      createdByEmail: req.user.email || ''
    });
    
    await promocode.save();
    
    console.log('✅ Promocode created successfully:', finalCode);
    
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

// PUT /api/promocodes/:id - Update promocode
router.put('/:id', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({
        success: false,
        error: 'Promocode model not available'
      });
    }
    
    console.log('🔄 Admin: Updating promocode:', req.params.id);
    
    const promocode = await Promocode.findById(req.params.id);
    if (!promocode) {
      return res.status(404).json({
        success: false,
        error: 'Promocode not found'
      });
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
    
    console.log('✅ Promocode updated successfully:', promocode.code);
    
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
      return res.status(503).json({
        success: false,
        error: 'Promocode model not available'
      });
    }
    
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
    
    console.log('✅ Promocode deleted successfully:', promocode.code);
    
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
      return res.status(503).json({
        success: false,
        error: 'Promocode model not available'
      });
    }
    
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

// POST /api/promocodes/cleanup - Cleanup expired/exhausted promocodes
router.post('/cleanup', requireAuth, async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({
        success: false,
        error: 'Promocode model not available'
      });
    }
    
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

// GET /api/promocodes/validate/:code - Validate promocode without applying
router.get('/validate/:code', async (req, res) => {
  try {
    if (!Promocode) {
      return res.status(503).json({
        success: false,
        valid: false,
        error: 'Promocode system not available'
      });
    }
    
    console.log('🔍 Validating promocode:', req.params.code);
    
    const { code } = req.params;
    
    if (!code || !code.trim()) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: 'Promocode is required'
      });
    }
    
    const promocode = await Promocode.findOne({ 
      code: code.trim().toUpperCase(),
      isActive: true 
    });
    
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

// ============================================
// 🛠️ UTILITY FUNCTIONS
// ============================================

function generateRandomCode(prefix = '', length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = prefix.toUpperCase();
  const remainingLength = Math.max(4, length - prefix.length);
  
  for (let i = 0; i < remainingLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

// Error handler for this router
router.use((error, req, res, next) => {
  console.error('❌ Promocode route error:', error);
  
  const statusCode = error.status || error.statusCode || 500;
  const message = error.message || 'Internal server error in promocode routes';
  
  res.status(statusCode).json({
    success: false,
    error: message,
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

console.log('✅ Promocode routes module loaded successfully');

module.exports = router