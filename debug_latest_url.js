
const url = "https://checkout.paycom.uz/bT02ODAxNmNjMWE1ZTA0NjE0MjQ3ZjcxNzQ7YT0xMDAwMDAwO2FjLkxvZ2luPWFjZWQxNzcwNjc1MDQxNzk5OGY4dmZhO2w9ZW47Yz1odHRwcyUzQSUyRiUyRmFwaS5hY2VkLmxpdmUlMkZhcGklMkZwYXltZW50cyUyRnBheW1lJTJGcmV0dXJuJTJGc3VjY2VzcyUzRnRyYW5zYWN0aW9uJTNEYWNlZDE3NzA2NzUwNDE3OTg1Z2QwdDV1NHIlMjZ1c2VySWQlM0RJV0ttc0gxWWZnY3ExQ2I0cWtCMkpxQWw2NFEyO2N0PTE1MDAw";

try {
    const base64Part = url.split('checkout.paycom.uz/')[1];
    const decoded = Buffer.from(base64Part, 'base64').toString('utf8');

    console.log('--- Decoded Latest URL ---');
    console.log(decoded);

    const parts = decoded.split(';');
    const mPart = parts.find(p => p.startsWith('m='));

    if (mPart) {
        const mVal = mPart.substring(2);
        console.log(`Merchant ID: "${mVal}"`);
        console.log(`Length: ${mVal.length}`);

        const isHex = /^[0-9a-fA-F]+$/.test(mVal);
        console.log(`Is Hex? ${isHex}`);

        if (isHex && mVal.length === 24) {
            console.log('SUCCESS: Merchant ID is now valid!');
        } else {
            console.log('WARNING: Merchant ID still suspicious.');
        }
    }

} catch (e) {
    console.error('Error:', e);
}
