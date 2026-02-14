// middlewares/subscriptionMiddleware.js
// Validates subscription status on authenticated requests.
// - Expires subscriptions that have passed their expiryDate
// - Reconciles users who paid but never got activated

const User = require('../models/user');
const PaymeTransaction = require('../models/paymeTransaction');
const MulticardTransaction = require('../models/MulticardTransaction');
const { getDurationFromAmount } = require('../config/subscriptionConfig');

/**
 * Middleware that checks and corrects subscription status for the current user.
 * Attach AFTER authMiddleware so that req.user.uid is available.
 */
const validateSubscription = async (req, res, next) => {
  try {
    if (!req.user || !req.user.uid) return next();

    const user = await User.findOne({ firebaseId: req.user.uid });
    if (!user) return next();

    await ensureSubscriptionStatus(user);

    // Attach subscription info to request for downstream use
    const now = new Date();
    req.subscription = {
      plan: user.subscriptionPlan,
      expiryDate: user.subscriptionExpiryDate,
      isActive: user.subscriptionPlan !== 'free' &&
        user.subscriptionExpiryDate &&
        now < new Date(user.subscriptionExpiryDate),
      activatedAt: user.subscriptionActivatedAt,
      source: user.subscriptionSource,
      duration: user.subscriptionDuration
    };

    next();
  } catch (error) {
    console.error('[SubscriptionMW] Error:', error.message);
    next();
  }
};

/**
 * Core logic: ensure a user's subscriptionPlan matches their actual payment state.
 * Can be called from middleware, endpoints, or cron jobs.
 *
 * Rules:
 * 1. If plan is non-free and expiryDate has passed -> revert to free
 * 2. If plan is non-free but no expiryDate -> revert to free
 * 3. If plan is free but there's a completed transaction that was never activated -> activate
 *
 * @param {Object} user - Mongoose User document
 * @returns {boolean} true if any changes were made and saved
 */
async function ensureSubscriptionStatus(user) {
  const now = new Date();
  let changed = false;

  // --- CASE 1: Active subscription has expired ---
  if (user.subscriptionPlan !== 'free' && user.subscriptionExpiryDate) {
    if (now >= new Date(user.subscriptionExpiryDate)) {
      console.log(`[Subscription] Expired for ${user.firebaseId}, reverting to free`);
      user.subscriptionPlan = 'free';
      user.paymentStatus = 'unpaid';
      changed = true;
    }
  }

  // --- CASE 2: Non-free plan but no expiry date (data inconsistency) ---
  if (user.subscriptionPlan !== 'free' && !user.subscriptionExpiryDate) {
    console.log(`[Subscription] ${user.firebaseId} has '${user.subscriptionPlan}' but no expiry, reverting to free`);
    user.subscriptionPlan = 'free';
    user.paymentStatus = 'unpaid';
    changed = true;
  }

  // --- CASE 3: User is free - check for unactivated completed payments ---
  if (user.subscriptionPlan === 'free') {
    const activated = await tryActivateFromPayments(user);
    if (activated) changed = true;
  }

  if (changed) {
    await user.save();
  }

  return changed;
}

/**
 * Checks completed payment transactions for a free user and activates their
 * subscription if a valid, unused payment is found.
 *
 * @param {Object} user - Mongoose User document (must be 'free')
 * @returns {boolean} true if subscription was activated
 */
async function tryActivateFromPayments(user) {
  const firebaseId = user.firebaseId;
  const now = new Date();

  // --- Check PayMe transactions ---
  const paymeCompleted = await PaymeTransaction.find({
    $or: [
      { user_id: firebaseId },
      { Login: firebaseId },
      { 'metadata.account.Login': firebaseId }
    ],
    state: 2 // COMPLETED
  }).sort({ perform_time: -1 }).limit(1).lean();

  if (paymeCompleted.length > 0) {
    const tx = paymeCompleted[0];
    const { durationDays, durationMonths } = getDurationFromAmount(tx.amount);
    const performTime = tx.perform_time || tx.create_time;

    // Calculate what the expiry would be from this payment
    const expiry = new Date(new Date(performTime).getTime() + (durationDays * 24 * 60 * 60 * 1000));

    // Only activate if the subscription period hasn't passed yet
    if (expiry > now) {
      console.log(`[Subscription] Activating from PayMe tx ${tx.paycom_transaction_id} for ${firebaseId}`);
      user.subscriptionPlan = 'pro';
      user.subscriptionExpiryDate = expiry;
      user.subscriptionActivatedAt = new Date(performTime);
      user.subscriptionSource = 'payment';
      user.subscriptionDuration = durationMonths;
      user.subscriptionAmount = tx.amount;
      user.lastPaymentDate = new Date(performTime);
      user.paymentStatus = 'paid';
      return true;
    }
  }

  // --- Check Multicard transactions ---
  // MulticardTransaction uses userId (ObjectId) and firebaseUserId (string)
  const multicardCompleted = await MulticardTransaction.find({
    $or: [
      { firebaseUserId: firebaseId },
      { userId: user._id }
    ],
    status: 'paid'
  }).sort({ paidAt: -1 }).limit(1).lean();

  if (multicardCompleted.length > 0) {
    const tx = multicardCompleted[0];
    const { durationDays, durationMonths } = getDurationFromAmount(tx.amount);
    const paidTime = tx.paidAt || tx.createdAt;

    const expiry = new Date(new Date(paidTime).getTime() + (durationDays * 24 * 60 * 60 * 1000));

    if (expiry > now) {
      console.log(`[Subscription] Activating from Multicard tx ${tx.invoiceId} for ${firebaseId}`);
      user.subscriptionPlan = tx.plan || 'pro';
      user.subscriptionExpiryDate = expiry;
      user.subscriptionActivatedAt = new Date(paidTime);
      user.subscriptionSource = 'payment';
      user.subscriptionDuration = durationMonths;
      user.subscriptionAmount = tx.amount;
      user.lastPaymentDate = new Date(paidTime);
      user.paymentStatus = 'paid';
      return true;
    }
  }

  return false;
}

/**
 * Reconcile ALL users in the database.
 * Finds users with inconsistent subscription state and fixes them.
 * Intended for admin use or periodic cron.
 *
 * @returns {{ fixed: number, expired: number, activated: number, errors: number }}
 */
async function reconcileAllSubscriptions() {
  const stats = { fixed: 0, expired: 0, activated: 0, errors: 0, checked: 0 };
  const now = new Date();

  // 1. Fix users with expired subscriptions still marked as non-free
  try {
    const expiredUsers = await User.find({
      subscriptionPlan: { $ne: 'free' },
      subscriptionExpiryDate: { $lt: now }
    });

    for (const user of expiredUsers) {
      try {
        user.subscriptionPlan = 'free';
        user.paymentStatus = 'unpaid';
        await user.save();
        stats.expired++;
        stats.fixed++;
      } catch (e) {
        stats.errors++;
      }
    }
  } catch (e) {
    console.error('[Reconcile] Error finding expired users:', e.message);
  }

  // 2. Fix users with non-free plan but no expiry
  try {
    const noExpiryUsers = await User.find({
      subscriptionPlan: { $ne: 'free' },
      subscriptionExpiryDate: null
    });

    for (const user of noExpiryUsers) {
      try {
        user.subscriptionPlan = 'free';
        user.paymentStatus = 'unpaid';
        await user.save();
        stats.expired++;
        stats.fixed++;
      } catch (e) {
        stats.errors++;
      }
    }
  } catch (e) {
    console.error('[Reconcile] Error finding no-expiry users:', e.message);
  }

  // 3. Find free users who have completed payments that should still be active
  try {
    const freeUsers = await User.find({ subscriptionPlan: 'free' });
    stats.checked = freeUsers.length;

    for (const user of freeUsers) {
      try {
        const activated = await tryActivateFromPayments(user);
        if (activated) {
          await user.save();
          stats.activated++;
          stats.fixed++;
        }
      } catch (e) {
        stats.errors++;
      }
    }
  } catch (e) {
    console.error('[Reconcile] Error checking free users:', e.message);
  }

  return stats;
}

module.exports = validateSubscription;
module.exports.validateSubscription = validateSubscription;
module.exports.ensureSubscriptionStatus = ensureSubscriptionStatus;
module.exports.tryActivateFromPayments = tryActivateFromPayments;
module.exports.reconcileAllSubscriptions = reconcileAllSubscriptions;
