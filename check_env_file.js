
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

try {
    const content = fs.readFileSync(envPath, 'utf8');
    console.log('--- .env content (partial) ---');

    const lines = content.split('\n');
    lines.forEach(line => {
        if (line.trim().startsWith('PAYME_MERCHANT_ID')) {
            console.log(`Line length: ${line.length}`);
            console.log(`Raw line: ${JSON.stringify(line)}`);
            const parts = line.split('=');
            if (parts.length > 1) {
                const val = parts[1].trim();
                console.log(`Value starts with: ${val.substring(0, 5)}`);
                console.log(`Value first char code: ${val.charCodeAt(0)}`);
            }
        }
    });

} catch (e) {
    console.error('Error reading .env:', e.message);
}
