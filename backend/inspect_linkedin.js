import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const sessionDir = './sessions_data/linkedin';
  const browser = await chromium.launchPersistentContext(sessionDir, {
    headless: true, // Run headless in the background
    viewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();
  try {
    const jobUrl = 'https://www.linkedin.com/jobs/view/4429656597/';
    console.log('Navigating to:', jobUrl);
    await page.goto(jobUrl, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(5000);

    const elements = await page.evaluate(() => {
      // Find all elements that contain "Apply"
      const elList = [];
      const allElements = document.querySelectorAll('button, a, div, span');
      for (const el of allElements) {
        const text = el.innerText || '';
        const className = el.className || '';
        if (text.includes('Apply')) {
          elList.push({
            tagName: el.tagName,
            id: el.id,
            className: className,
            text: text.slice(0, 50),
            outerHTML: el.outerHTML.slice(0, 200)
          });
        }
      }
      return elList;
    });

    console.log('--- FOUND APPLY ELEMENTS ---');
    console.log(JSON.stringify(elements, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
