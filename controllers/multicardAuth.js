import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.MULTICARD_API_URL;
let authToken = null;
let tokenExpiry = 0;

/**
 * Validates environment variables
 */
const validateEnvVars = () => {
    const required = [
        'MULTICARD_API_URL',
        'MULTICARD_APPLICATION_ID',
        'MULTICARD_SECRET'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
    
    console.log('✅ Environment variables validated');
    console.log('   API URL:', process.env.MULTICARD_API_URL);
    console.log('   Application ID:', process.env.MULTICARD_APPLICATION_ID);
    console.log('   Secret:', process.env.MULTICARD_SECRET ? '***' + process.env.MULTICARD_SECRET.slice(-4) : 'MISSING');
};

/**
 * Gets a valid auth token from Multicard
 */
const getAuthToken = async () => {
    // Check if token is still valid
    if (authToken && Date.now() < tokenExpiry) {
        console.log('🔑 Using cached token');
        console.log('   Expires in:', Math.round((tokenExpiry - Date.now()) / 1000 / 60), 'minutes');
        return authToken;
    }
    
    try {
        validateEnvVars();
        
        console.log('🔑 Requesting new Multicard auth token...');
        console.log('   URL:', `${API_URL}/auth`);
        
        const payload = {
            application_id: process.env.MULTICARD_APPLICATION_ID,
            secret: process.env.MULTICARD_SECRET,
        };
        
        console.log('   Payload:', {
            application_id: payload.application_id,
            secret: '***' + payload.secret.slice(-4)
        });

        const response = await axios.post(
            `${API_URL}/auth`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 10000 // 10 second timeout
            }
        );

        console.log('📥 Response status:', response.status);
        console.log('📥 Response data:', JSON.stringify(response.data, null, 2));

        // Check response structure
        if (!response.data) {
            throw new Error('Empty response from Multicard API');
        }

        if (response.data.token) {
            authToken = response.data.token;
            
            // Parse expiry time - it's in GMT+5 format: "2023-03-18 16:40:31"
            const expiryStr = response.data.expiry;
            let expiryDate;
            
            try {
                // Try parsing as-is first
                expiryDate = new Date(expiryStr);
                
                // If invalid, try with timezone adjustment
                if (isNaN(expiryDate.getTime())) {
                    // Convert "2023-03-18 16:40:31" to ISO format
                    const isoStr = expiryStr.replace(' ', 'T') + '+05:00';
                    expiryDate = new Date(isoStr);
                }
                
                if (isNaN(expiryDate.getTime())) {
                    throw new Error('Invalid date format');
                }
            } catch (err) {
                console.warn('⚠️ Could not parse expiry date:', expiryStr);
                // Default to 23 hours from now
                expiryDate = new Date(Date.now() + 23 * 60 * 60 * 1000);
            }
            
            // Set expiry with 1 hour safety margin
            tokenExpiry = expiryDate.getTime() - (60 * 60 * 1000);
            
            console.log('✅ Token obtained successfully');
            console.log('   Token (first 20 chars):', authToken.substring(0, 20) + '...');
            console.log('   Role:', response.data.role);
            console.log('   Expires at:', response.data.expiry);
            console.log('   Cache until:', new Date(tokenExpiry).toISOString());
            console.log('   Valid for:', Math.round((tokenExpiry - Date.now()) / 1000 / 60), 'minutes');
            
            return authToken;
        }
        
        // If we got here, response structure is unexpected
        throw new Error(`Unexpected response structure: ${JSON.stringify(response.data)}`);
        
    } catch (error) {
        console.error('❌ Error fetching Multicard token');
        
        if (error.response) {
            // The request was made and server responded with error status
            console.error('   Status:', error.response.status);
            console.error('   Headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
            
            // Check for specific error messages
            if (error.response.data?.errors) {
                const errorMessages = error.response.data.errors
                    .map(e => e.message)
                    .flat()
                    .map(m => m.message || m)
                    .join(', ');
                console.error('   Error messages:', errorMessages);
            }
        } else if (error.request) {
            // The request was made but no response received
            console.error('   No response received');
            console.error('   Request config:', {
                url: error.config?.url,
                method: error.config?.method,
                headers: error.config?.headers
            });
        } else {
            // Something else happened
            console.error('   Error:', error.message);
        }
        
        // Clear cached token
        authToken = null;
        tokenExpiry = 0;
        
        throw new Error(`Multicard authentication failed: ${error.response?.data?.errors?.[0]?.message?.[0]?.message || error.message}`);
    }
};

/**
 * Test authentication endpoint
 */
const testAuth = async (req, res) => {
    try {
        console.log('\n========================================');
        console.log('🧪 Testing Multicard Authentication');
        console.log('========================================\n');
        
        const token = await getAuthToken();
        
        res.json({
            success: true,
            message: 'Authentication successful',
            data: {
                tokenPreview: token.substring(0, 30) + '...',
                tokenLength: token.length,
                expiresAt: new Date(tokenExpiry).toISOString(),
                validForMinutes: Math.round((tokenExpiry - Date.now()) / 1000 / 60)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'AUTH_FAILED',
                message: error.message,
                details: 'Check server logs for more information'
            }
        });
    }
};

/**
 * Force token refresh
 */
const forceRefreshToken = async (req, res) => {
    console.log('🔄 Forcing token refresh...');
    authToken = null;
    tokenExpiry = 0;
    
    try {
        const token = await getAuthToken();
        res.json({
            success: true,
            message: 'Token refreshed successfully',
            data: {
                tokenPreview: token.substring(0, 30) + '...'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'REFRESH_FAILED',
                message: error.message
            }
        });
    }
};

export { getAuthToken, testAuth, forceRefreshToken };