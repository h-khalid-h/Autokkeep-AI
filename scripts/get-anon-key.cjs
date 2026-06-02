// Extract the anon key from the deployed app's browser runtime
const puppeteer = require('puppeteer');

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Navigate to the app
  await page.goto('https://autokkeep.com/auth/login', { waitUntil: 'networkidle2', timeout: 30000 });
  
  // Extract NEXT_PUBLIC_SUPABASE_ANON_KEY from the window
  const anonKey = await page.evaluate(() => {
    // Next.js injects env vars into the runtime config
    // Try various approaches to find it
    
    // Method 1: Check __NEXT_DATA__
    const nextData = window.__NEXT_DATA__;
    if (nextData?.runtimeConfig?.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return nextData.runtimeConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
    
    // Method 2: Look in the process.env polyfill
    if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
    
    return null;
  });
  
  if (anonKey) {
    console.log('Anon key from runtime:', anonKey);
  } else {
    console.log('Anon key not found in runtime, trying to intercept network requests...');
    
    // Method 3: Intercept requests and look for the apikey header
    const page2 = await browser.newPage();
    
    let foundKey = null;
    await page2.setRequestInterception(true);
    page2.on('request', request => {
      const headers = request.headers();
      if (headers['apikey'] && headers['apikey'].startsWith('eyJ')) {
        foundKey = headers['apikey'];
      }
      request.continue();
    });
    
    await page2.goto('https://autokkeep.com/auth/login', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Type something to trigger a Supabase call
    const emailInput = await page2.$('input[type="email"]');
    if (emailInput) {
      await emailInput.type('test@test.com');
      const pwInput = await page2.$('input[type="password"]');
      if (pwInput) {
        await pwInput.type('test');
        // Find and click login button
        const btn = await page2.$('button[type="submit"]');
        if (btn) await btn.click();
      }
    }
    
    await new Promise(r => setTimeout(r, 3000));
    
    if (foundKey) {
      console.log('Anon key from network:', foundKey);
    } else {
      console.log('Could not find anon key');
    }
  }
  
  await browser.close();
}
main().catch(e => console.error(e));
