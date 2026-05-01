const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC = 'C:/Users/zirku/Desktop/fränschine/assets';
const DST = '/var/www/html/paert/assets';
const TMP = 'C:/Users/zirku/Desktop/fränschine/_tmp_b64.txt';

// Upload a single binary file via base64
function uploadBinary(localPath, remotePath) {
  const data = fs.readFileSync(localPath);
  const b64 = data.toString('base64');
  fs.writeFileSync(TMP, b64);
  const cmd = `type "${TMP}" | ssh htown "base64 -d > ${remotePath}"`;
  execSync(cmd, { shell: 'cmd.exe', timeout: 120000 });
  console.log(`  OK: ${path.basename(localPath)} (${Math.round(data.length/1024)}KB)`);
}

// 1) Upload horse frames + arena + rodeo.mp3
console.log('=== Uploading assets ===');
uploadBinary(SRC + '/arena.jpeg', DST + '/arena.jpeg');
uploadBinary(SRC + '/rodeo.mp3', DST + '/rodeo.mp3');
for (let i = 1; i <= 15; i++) {
  uploadBinary(SRC + '/' + i + '.png', DST + '/' + i + '.png');
}

// 2) Upload guy sheets
const guys = ['ahrensfront', 'ahrensback', 'juliusfront', 'juliusback', 'kevinfront', 'kevinback'];
guys.forEach(g => {
  console.log(`=== Uploading ${g} (30 frames) ===`);
  for (let i = 1; i <= 30; i++) {
    const num = i.toString().padStart(2, '0');
    const localFile = `${SRC}/sheets/${g}/images/${g}_${num}.png`;
    const remoteFile = `${DST}/sheets/${g}/images/${g}_${num}.png`;
    if (fs.existsSync(localFile)) {
      uploadBinary(localFile, remoteFile);
    } else {
      console.log(`  SKIP: ${g}_${num}.png (not found)`);
    }
  }
});

// Cleanup
if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
console.log('\n=== ALL UPLOADS COMPLETE ===');
