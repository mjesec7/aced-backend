// config/subscriptionConfig.js
// ========================================
// 💳 SUBSCRIPTION TIERS CONFIGURATION
// ========================================

/**
 * Centralized subscription tier configuration
 * All pricing, duration, and tier information is defined here
 */

const SUBSCRIPTION_TIERS = {
    ONE_MONTH: {
        id: 'pro-1',
        duration: 30, // days
        durationMonths: 1,
        priceInTiyin: 25000000, // 250,000 UZS
        priceInUZS: 250000,
        displayPrice: '250,000',
        currency: 'UZS',
        savings: null,
        savingsPercentage: 0,
        label: '1 Month',
        description: 'Monthly subscription',
        featured: false
    },
    THREE_MONTHS: {
        id: 'pro-3',
        duration: 90, // days
        durationMonths: 3,
        priceInTiyin: 67500000, // 675,000 UZS (10% discount)
        priceInUZS: 675000,
        displayPrice: '675,000',
        currency: 'UZS',
        savings: '10%',
        savingsPercentage: 10,
        label: '3 Months',
        description: 'Quarterly subscription - Most Popular',
        featured: true, // "Most Popular" badge
        pricePerMonth: 225000 // 675,000 / 3
    },
    SIX_MONTHS: {
        id: 'pro-6',
        duration: 180, // days
        durationMonths: 6,
        priceInTiyin: 120000000, // 1,200,000 UZS (20% discount)
        priceInUZS: 1200000,
        displayPrice: '1,200,000',
        currency: 'UZS',
        savings: '20%',
        savingsPercentage: 20,
        label: '6 Months',
        description: 'Semi-annual subscription - Best Value',
        featured: false,
        pricePerMonth: 200000 // 1,200,000 / 6
    }
};

/**
 * Payment amounts in tiyin (UZS * 100) for PayMe integration
 * @deprecated Use SUBSCRIPTION_TIERS instead
 */
const PAYMENT_AMOUNTS = {
    'pro-1': SUBSCRIPTION_TIERS.ONE_MONTH.priceInTiyin,
    'pro-3': SUBSCRIPTION_TIERS.THREE_MONTHS.priceInTiyin,
    'pro-6': SUBSCRIPTION_TIERS.SIX_MONTHS.priceInTiyin
};

/**
 * Get tier configuration by duration in months
 * @param {number} months - Duration in months (1, 3, or 6)
 * @returns {Object|null} Tier configuration or null if not found
 */
const getTierByDuration = (months) => {
    switch (months) {
        case 1:
            return SUBSCRIPTION_TIERS.ONE_MONTH;
        case 3:
            return SUBSCRIPTION_TIERS.THREE_MONTHS;
        case 6:
            return SUBSCRIPTION_TIERS.SIX_MONTHS;
        default:
            return null;
    }
};

/**
 * Get tier configuration by tier ID
 * @param {string} tierId - Tier ID (pro-1, pro-3, pro-6)
 * @returns {Object|null} Tier configuration or null if not found
 */
const getTierById = (tierId) => {
    switch (tierId) {
        case 'pro-1':
            return SUBSCRIPTION_TIERS.ONE_MONTH;
        case 'pro-3':
            return SUBSCRIPTION_TIERS.THREE_MONTHS;
        case 'pro-6':
            return SUBSCRIPTION_TIERS.SIX_MONTHS;
        default:
            return null;
    }
};

/**
 * Get all tiers as an array
 * @returns {Array} Array of tier configurations
 */
const getAllTiers = () => {
    return [
        SUBSCRIPTION_TIERS.ONE_MONTH,
        SUBSCRIPTION_TIERS.THREE_MONTHS,
        SUBSCRIPTION_TIERS.SIX_MONTHS
    ];
};

/**
 * Calculate price per month for a given tier
 * @param {Object} tier - Tier configuration
 * @returns {number} Price per month in UZS
 */
const calculatePricePerMonth = (tier) => {
    return Math.round(tier.priceInUZS / tier.durationMonths);
};

/**
 * Calculate savings percentage
 * @param {Object} tier - Tier configuration
 * @returns {number} Savings percentage
 */
const calculateSavingsPercentage = (tier) => {
    if (tier.durationMonths === 1) return 0;
    const basePrice = SUBSCRIPTION_TIERS.ONE_MONTH.priceInUZS * tier.durationMonths;
    return Math.round(((basePrice - tier.priceInUZS) / basePrice) * 100);
};

module.exports = {
    SUBSCRIPTION_TIERS,
    PAYMENT_AMOUNTS,
    getTierByDuration,
    getTierById,
    getAllTiers,
    calculatePricePerMonth,
    calculateSavingsPercentage
};
