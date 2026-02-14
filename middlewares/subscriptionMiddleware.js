// middlewares/subscriptionMiddleware.js
// Validates subscription status on authenticated requests.
// - Expires subscriptions that have passed their expiryDate
// - Reconciles users who paid but never got activated
// - Stacks multiple payments (e.g. 3x 1-day = 3 days total)

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
 * 3. If plan is free but there are completed transactions -> activate & stack all
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
 * Checks ALL completed payment transactions for a free user and activates their
 * subscription by stacking all payment durations.
 *
 * Example: 3 completed 1-day payments on Feb 13 → expiry = Feb 13 + 3 days = Feb 16
 *
 * @param {Object} user - Mongoose User document (must be 'free')
 * @returns {boolean} true if subscription was activated
 */
async function tryActivateFromPayments(user) {
  const firebaseId = user.firebaseId;
  const now = new Date();

  // Collect all completed transactions from both payment providers
  const allTransactions = [];

  // --- PayMe transactions ---
  const paymeCompleted = await PaymeTransaction.find({
    $or: [
      { user_id: firebaseId },
      { Login: firebaseId },
      { 'metadata.account.Login': firebaseId }
    ],
    state: 2 // COMPLETED
  }).sort({ perform_time: 1 }).lean();

  for (const tx of paymeCompleted) {
    const { durationDays } = getDurationFromAmount(tx.amount);
    allTransactions.push({
      id: tx.paycom_transaction_id,
      provider: 'payme',
      paidAt: tx.perform_time || tx.create_time,
      durationDays,
      amount: tx.amount
    });
  }

  // --- Multicard transactions ---
  const multicardCompleted = await MulticardTransaction.find({
    $or: [
      { firebaseUserId: firebaseId },
      { userId: user._id }
    ],
    status: 'paid'
  }).sort({ paidAt: 1 }).lean();

  for (const tx of multicardCompleted) {
    const { durationDays } = getDurationFromAmount(tx.amount);
    allTransactions.push({
      id: tx.invoiceId || tx.multicardUuid,
      provider: 'multicard',
      paidAt: tx.paidAt || tx.createdAt,
      durationDays,
      amount: tx.amount
    });
  }

  if (allTransactions.length === 0) return false;

  // Sort all transactions by payment time (oldest first)
  allTransactions.sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));

  // Stack durations: each payment extends from where the previous one ends
  const firstPayment = new Date(allTransactions[0].paidAt);
  let expiry = firstPayment;

  for (const tx of allTransactions) {
    const txPaidAt = new Date(tx.paidAt);
    // If this payment was made after the current running expiry, start from payment time
    // Otherwise stack on top of the running expiry
    const startFrom = txPaidAt > expiry ? txPaidAt : expiry;
    expiry = new Date(startFrom.getTime() + (tx.durationDays * 24 * 60 * 60 * 1000));
  }

  // Only activate if the stacked expiry is still in the future
  if (expiry <= now) return false;

  // Use the last transaction for metadata
  const lastTx = allTransactions[allTransactions.length - 1];
  const { durationMonths } = getDurationFromAmount(lastTx.amount);

  console.log(`[Subscription] Activating ${firebaseId} from ${allTransactions.length} transactions, expiry: ${expiry.toISOString()}`);

  user.subscriptionPlan = 'pro';
  user.subscriptionExpiryDate = expiry;
  user.subscriptionActivatedAt = firstPayment;
  user.subscriptionSource = 'payment';
  user.subscriptionDuration = durationMonths;
  user.subscriptionAmount = lastTx.amount;
  user.lastPaymentDate = new Date(lastTx.paidAt);
  user.paymentStatus = 'paid';

  return true;
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
