// test-multicard-auth.js
// Run this file directly: node test-multicard-auth.js

const axios = require('axios');
require('dotenv').config();

async function testMulticardAuth() {
  console.log('\n========================================');
  console.log('🧪 Testing Multicard Authentication');
  console.log('========================================\n');

  const API_URL = process.env.MULTICARD_API_URL;
  const APPLICATION_ID = process.env.MULTICARD_APPLICATION_ID;
  const SECRET = process.env.MULTICARD_SECRET;

  console.log('Configuration:');
  console.log('   API URL:', API_URL);
  console.log('   Application ID:', APPLICATION_ID);
  console.log('   Secret:', SECRET ? '***' + SECRET.slice(-4) : 'MISSING');
  console.log('');

  // Test 1: Try the exact endpoint from documentation
  console.log('📤 Test 1: POST /auth');
  console.log('   Endpoint:', `${API_URL}/auth`);

  const payload = {
    application_id: APPLICATION_ID,
    secret: SECRET
  };

  console.log('   Payload:', {
    application_id: payload.application_id,
    secret: '***' + payload.secret.slice(-4)
  });
  console.log('');

  try {
    const response = await axios.post(
      `${API_URL}/auth`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000,
        validateStatus: () => true // Don't throw on any status
      }
    );

    console.log('📥 Response received:');
    console.log('   Status:', response.status);
    console.log('   Headers:', JSON.stringify(response.headers, null, 2));
    console.log('   Data:', JSON.stringify(response.data, null, 2));
    console.log('');

    if (response.status === 200 && response.data.token) {
      console.log('✅ SUCCESS: Authentication worked!');
      console.log('   Token (first 20 chars):', response.data.token.substring(0, 20) + '...');
      console.log('   Role:', response.data.role);
      console.log('   Expiry:', response.data.expiry);
      return true;
    } else {
      console.log('❌ FAILED: Authentication did not return a token');
      return false;
    }

  } catch (error) {
    console.error('❌ Request failed:');
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
      console.error('   Headers:', JSON.stringify(error.response.headers, null, 2));
    } else if (error.request) {
      console.error('   No response received');
      console.error('   Error:', error.message);
    } else {
      console.error('   Error:', error.message);
    }
    
    return false;
  }
}

// Alternative tests with different configurations
async function testAlternativeEndpoints() {
  console.log('\n========================================');
  console.log('🔍 Testing Alternative Configurations');
  console.log('========================================\n');

  const alternatives = [
    {
      name: 'With /api prefix',
      url: 'https://dev-mesh.multicard.uz/api/auth'
    },
    {
      name: 'With /api/v1 prefix',
      url: 'https://dev-mesh.multicard.uz/api/v1/auth'
    }
  ];

  for (const alt of alternatives) {
    console.log(`\n📤 Testing: ${alt.name}`);
    console.log(`   URL: ${alt.url}`);

    try {
      const response = await axios.post(
        alt.url,
        {
          application_id: process.env.MULTICARD_APPLICATION_ID,
          secret: process.env.MULTICARD_SECRET
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 15000,
          validateStatus: () => true
        }
      );

      console.log('   Status:', response.status);
      console.log('   Success:', !!response.data.token);
      
      if (response.data.token) {
        console.log('   ✅ This endpoint works!');
      } else {
        console.log('   ❌ No token returned');
      }

    } catch (error) {
      console.log('   ❌ Request failed:', error.message);
    }
  }
}

// Run all tests
async function runAllTests() {
  console.clear();
  
  const mainTestPassed = await testMulticardAuth();
  
  if (!mainTestPassed) {
    await testAlternativeEndpoints();
  }

  console.log('\n========================================');
  console.log('🏁 Testing Complete');
  console.log('========================================\n');

  if (mainTestPassed) {
    console.log('✅ Your Multicard configuration is working correctly!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Your credentials are valid');
    console.log('2. The authentication endpoint is working');
    console.log('3. You can proceed with payment integration');
  } else {
    console.log('❌ Authentication is failing. Possible issues:');
    console.log('');
    console.log('1. Invalid credentials:');
    console.log('   - Double-check your MULTICARD_APPLICATION_ID');
    console.log('   - Double-check your MULTICARD_SECRET');
    console.log('   - Ensure there are no extra spaces or quotes');
    console.log('');
    console.log('2. Wrong environment:');
    console.log('   - Are you using sandbox/test credentials?');
    console.log('   - Are you connecting to the right API URL?');
    console.log('');
    console.log('3. Account issues:');
    console.log('   - Contact Multicard support to verify your account is active');
    console.log('   - Ask them to verify your application_id and secret');
    console.log('');
    console.log('4. Network/Firewall:');
    console.log('   - Check if your server can reach dev-mesh.multicard.uz');
    console.log('   - Try: curl -I https://dev-mesh.multicard.uz');
  }

  console.log('\n');
}

runAllTests().catch(console.error);