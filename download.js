const { execSync } = require('child_process');
const fs = require('fs');
const b64 = execSync('ssh htown "base64 -w 0 /var/www/html/paert/assets/intro_merged.mp4"', { maxBuffer: 100 * 1024 * 1024 }).toString().trim().split('\n').pop();
fs.writeFileSync('assets/intro_merged.mp4', Buffer.from(b64, 'base64'));
console.log('Downloaded and saved assets/intro_merged.mp4');
