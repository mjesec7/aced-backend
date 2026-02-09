
const controller = require('./controllers/paymentController');

// Mock Express objects
const req = {
    body: {
        userId: 'aced1770673021993qacat3',
        plan: 'pro',
        amount: 120000000,
        method: 'get'
    }
};

const res = {
    status: function (code) {
        console.log(`Status: ${code}`);
        return this;
    },
    json: function (data) {
        console.log('JSON Output:', JSON.stringify(data, null, 2));

        if (data.paymentUrl) {
            // Check the URL
            const url = data.paymentUrl;
            console.log('Payment URL:', url);

            const base64Part = url.split('/').pop();
            const decoded = Buffer.from(base64Part, 'base64').toString('utf8');
            console.log('Decoded Params:', decoded);

            if (!decoded.startsWith('m=')) {
                console.error('FAIL: m= prefix is missing!');
            } else {
                console.log('PASS: m= prefix is present.');
            }
        }
        return this;
    }
};

// Set env var for test
process.env.PAYME_MERCHANT_ID = 'TEST_MERCHANT_ID_123';

console.log('Running initiatePaymePayment...');
controller.initiatePaymePayment(req, res).catch(err => {
    console.error('Error:', err);
});
