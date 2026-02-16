// controllers/exchangeRateController.js
const axios = require('axios');

// In-memory cache for exchange rate
let cachedRate = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in ms

/**
 * Fetch USD/UZS exchange rate from a free public API.
 * Caches the result for 1 hour to avoid excessive external calls.
 */
const getExchangeRate = async (req, res) => {
    try {
        const now = Date.now();

        // Return cached rate if still fresh
        if (cachedRate && (now - cacheTimestamp) < CACHE_DURATION) {
            return res.json({
                success: true,
                rate: cachedRate.rate,
                source: cachedRate.source,
                updatedAt: cachedRate.updatedAt,
                cached: true
            });
        }

        // Try primary source: open.er-api.com (free, no key required)
        let rate = null;
        let source = '';

        try {
            const response = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 });
            if (response.data && response.data.rates && response.data.rates.UZS) {
                rate = response.data.rates.UZS;
                source = 'open.er-api.com';
            }
        } catch (primaryError) {
            console.warn('[ExchangeRate] Primary API failed:', primaryError.message);
        }

        // Fallback source: exchangerate-api.com
        if (!rate) {
            try {
                const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 5000 });
                if (response.data && response.data.rates && response.data.rates.UZS) {
                    rate = response.data.rates.UZS;
                    source = 'exchangerate-api.com';
                }
            } catch (fallbackError) {
                console.warn('[ExchangeRate] Fallback API failed:', fallbackError.message);
            }
        }

        if (!rate) {
            // If all APIs fail, use last cached value or a reasonable default
            if (cachedRate) {
                return res.json({
                    success: true,
                    rate: cachedRate.rate,
                    source: cachedRate.source,
                    updatedAt: cachedRate.updatedAt,
                    cached: true,
                    stale: true
                });
            }

            return res.status(503).json({
                success: false,
                error: 'Unable to fetch exchange rate from any source'
            });
        }

        // Update cache
        cachedRate = {
            rate: Math.round(rate),
            source,
            updatedAt: new Date().toISOString()
        };
        cacheTimestamp = now;

        res.json({
            success: true,
            rate: cachedRate.rate,
            source: cachedRate.source,
            updatedAt: cachedRate.updatedAt,
            cached: false
        });

    } catch (error) {
        console.error('[ExchangeRate] Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch exchange rate'
        });
    }
};

module.exports = { getExchangeRate };
