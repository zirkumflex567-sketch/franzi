const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    }
  });
  
  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message);
  });

  await page.goto('file:///' + __dirname.replace(/\\/g, '/') + '/index.html');
  await page.waitForTimeout(500);
  
  console.log('Clicking start...');
  await page.click('#btn-start');
  
  await page.waitForTimeout(1000);
  console.log('Done testing.');
  await browser.close();
})();
