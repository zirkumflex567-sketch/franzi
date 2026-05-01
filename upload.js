const { execSync } = require('child_process');
const fs = require('fs');

const SRC = 'C:/Users/zirku/Desktop/fränschine';
const DST = '/var/www/html/paert';
const TMP = 'C:/Users/zirku/Desktop/fränschine/_tmp_b64.txt';

// Create dir just in case
try { execSync(`ssh htown "mkdir -p ${DST}/2"`); } catch(e){}

['index.html', 'style.css', 'game.js'].forEach(f => {
  const data = fs.readFileSync(`${SRC}/${f}`);
  const b64 = data.toString('base64');
  fs.writeFileSync(TMP, b64);
  execSync(`type "${TMP}" | ssh htown "base64 -d > ${DST}/${f}"`, { shell: 'cmd.exe', timeout: 30000 });
  console.log(`Uploaded: ${f}`);
});

// Upload slider file as index.html in /paert/2
const dataSlider = fs.readFileSync(`${SRC}/slider.html`);
fs.writeFileSync(TMP, dataSlider.toString('base64'));
execSync(`type "${TMP}" | ssh htown "base64 -d > ${DST}/2/index.html"`, { shell: 'cmd.exe', timeout: 30000 });
console.log(`Uploaded: 2/index.html`);

// Upload win video
try { execSync(`ssh htown "mkdir -p ${DST}/assets"`); } catch(e){}
const dataVideo = fs.readFileSync(`${SRC}/assets/win.mp4`);
fs.writeFileSync(TMP, dataVideo.toString('base64'));
console.log('Uploading win.mp4 (this might take a minute)...');
execSync(`type "${TMP}" | ssh htown "base64 -d > ${DST}/assets/win.mp4"`, { shell: 'cmd.exe', timeout: 120000 });
console.log(`Uploaded: assets/win.mp4`);

if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
console.log('Upload OK');
