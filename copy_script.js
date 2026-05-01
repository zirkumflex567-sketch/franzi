const fs = require('fs');
const dir = 'C:/Users/zirku/Downloads/download (2) (1)_extracted';
const target = 'C:/Users/zirku/Desktop/fränschine/assets';
const files = fs.readdirSync(dir);
files.forEach(f => {
  if(f.includes('Kopie_von_\u201EKopie_von')) return;
  let numMatch = f.match(/_([0-9]{1,2})\.jpeg$/);
  let num = numMatch ? parseInt(numMatch[1]) : 1;
  fs.copyFileSync(dir + '/' + f, target + '/' + num + '.jpeg');
  console.log(f + ' -> ' + num + '.jpeg');
});
