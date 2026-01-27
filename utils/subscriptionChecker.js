// utils/subscriptionChecker.js
// ========================================
// 📅 SUBSCRIPTION EXPIRY CHECKER UTILITY
// ========================================

const checkExpiredSubscriptions = async () => {
    try {
      const User = require('../models/user');
      const now = new Date();
      
      // Find all users with expired subscriptions
      const expiredUsers = await User.find({
        subscriptionPlan: { $ne: 'free' },
        subscriptionExpiryDate: { $lt: now }
      });
  
      console.log(`🔍 Subscription check: Found ${expiredUsers.length} expired subscriptions`);
  
      for (const user of expiredUsers) {
        const oldPlan = user.subscriptionPlan;
        
        // Revert to free
        user.subscriptionPlan = 'free';
        user.userStatus = 'free';
        user.subscriptionExpiredAt = user.subscriptionExpiryDate;
        user.previousPlan = oldPlan;
        
        await user.save();
        
        console.log(`✅ User ${user.email} reverted from ${oldPlan} to free (expired ${user.subscriptionExpiryDate.toLocaleDateString()})`);
      }
  
      return {
        checked: expiredUsers.length,
        expired: expiredUsers.length,
        timestamp: new Date().toISOString()
      };
  
    } catch (error) {
      console.error('❌ Error checking expired subscriptions:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  };
  
  module.exports = { checkExpiredSubscriptions };