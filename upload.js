const { execSync } = require('child_process');
const fs = require('fs');

const SRC = 'C:/Users/zirku/Desktop/fränschine';
const DST = '/var/www/html/paert';
const TMP = 'C:/Users/zirku/Desktop/fränschine/_tmp_b64.txt';

['index.html', 'style.css', 'game.js'].forEach(f => {
  const data = fs.readFileSync(`${SRC}/${f}`);
  const b64 = data.toString('base64');
  fs.writeFileSync(TMP, b64);
  execSync(`type "${TMP}" | ssh htown "base64 -d > ${DST}/${f}"`, { shell: 'cmd.exe', timeout: 30000 });
  console.log(`Uploaded: ${f}`);
});
if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
console.log('Upload OK');
