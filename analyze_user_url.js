
const url = "https://checkout.paycom.uz/bT0mMHo3bllwNTM/WUp6VGd4WjI4NEBAM0EldjhyUXNmd1pkdjA7YT0xMDAwMDAwO2FjLkxvZ2luPWFjZWQxNzcwNjczODM2ODkwd2h4ajhzO2w9ZW47Yz1odHRwcyUzQSUyRiUyRmFwaS5hY2VkLmxpdmUlMkZhcGklMkZwYXltZW50cyUyRnBheW1lJTJGcmV0dXJuJTJGc3VjY2VzcyUzRnRyYW5zYWN0aW9uJTNEYWNlZDE3NzA2NzM4MzY4OTAycmcyeGc5M3ElMjZ1c2VySWQlM0RJV0ttc0gxWWZnY3ExQ2I0cWtCMkpxQWw2NFEyO2N0PTE1MDAw";

const base64Part = url.split('checkout.paycom.uz/')[1];
console.log('Base64 Part:', base64Part);

try {
    const decoded = Buffer.from(base64Part, 'base64').toString('utf8');
    console.log('--- Decoded ---');
    console.log(decoded);
    console.log('--- Parts ---');
    const parts = decoded.split(';');
    parts.forEach((p, i) => console.log(`[${i}] ${p}`));

    // Check first param
    if (parts[0].startsWith('m=')) {
        const mVal = parts[0].substring(2);
        console.log('Merchant ID value:', mVal);
        console.log('Merchant ID length:', mVal.length);

        // Check for suspicious chars
        for (let i = 0; i < mVal.length; i++) {
            if (mVal.charCodeAt(i) < 32 || mVal.charCodeAt(i) > 126) {
                console.log(`Suspicious char at ${i}: code ${mVal.charCodeAt(i)}`);
            }
        }
    }

} catch (e) {
    console.error('Error decoding:', e);
}
