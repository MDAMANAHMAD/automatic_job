import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { getSessionDir } from '../session_manager.js';
import { answerCustomQuestion } from '../matching_helper.js';

export async function searchJobs(keywords, location, profile) {
  const sessionDir = getSessionDir('indeed');
  const browser = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    channel: 'chrome',
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const page = await browser.newPage();
  const jobsList = [];

  try {
    for (const kw of keywords) {
      const searchUrl = `https://www.indeed.com/jobs?q=${encodeURIComponent(kw)}&l=${encodeURIComponent(location)}&sc=0kf%3Aattr%28DS5S1%29%3B`; // attr(DS5S1) represents Easily Apply filter
      console.log(`Navigating to Indeed search: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(5000);

      // Dismiss login popups if any
      const closePopup = await page.$('button[aria-label="close"], .icl-CloseButton');
      if (closePopup) {
        await closePopup.click().catch(() => {});
      }

      const jobCardsSelector = '.css-5lfssm, .job_seen_beacon';
      try {
        await page.waitForSelector(jobCardsSelector, { timeout: 15000 });
      } catch (e) {
        console.log(`No jobs found for Indeed keyword: ${kw}`);
        continue;
      }

      const cards = await page.$$(jobCardsSelector);
      console.log(`Found ${cards.length} Indeed cards.`);

      for (let i = 0; i < Math.min(cards.length, 10); i++) {
        try {
          const card = cards[i];
          await card.click();
          await page.waitForTimeout(2000);

          const title = await card.$eval('h2.jobTitle', el => el.innerText.trim()).catch(() => '');
          const company = await card.$eval('.companyName, [data-testid="company-name"]', el => el.innerText.trim()).catch(() => '');
          const loc = await card.$eval('.companyLocation, [data-testid="text-location"]', el => el.innerText.trim()).catch(() => '');
          
          // Get link
          const linkEl = await card.$('h2.jobTitle a');
          const href = linkEl ? await linkEl.getAttribute('href') : '';
          const link = href ? `https://www.indeed.com${href}` : '';
          
          // Match Job ID
          const match = href.match(/jk=([a-f0-9]+)/);
          const jobId = match ? match[1] : `in_${Date.now()}_${i}`;

          // Description
          const descSelector = '#jobDescriptionText, .jobsearch-JobComponent-description';
          let description = '';
          try {
            await page.waitForSelector(descSelector, { timeout: 5000 });
            description = await page.$eval(descSelector, el => el.innerText.trim());
          } catch (e) {
            console.log('Indeed description not loaded');
          }

          if (title && jobId) {
            jobsList.push({
              platform: 'indeed',
              jobId,
              title,
              company,
              location: loc || location,
              link,
              description
            });
          }
        } catch (cardErr) {
          console.error('Error parsing Indeed card:', cardErr);
        }
      }
    }
  } finally {
    await browser.close();
  }

  return jobsList;
}

export async function applyJob(job, profile) {
  const sessionDir = getSessionDir('indeed');
  const browser = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    channel: 'chrome',
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const page = await browser.newPage();
  let result = { success: false, message: '' };

  try {
    console.log(`Navigating to Indeed job: ${job.link}`);
    await page.goto(job.link, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Look for Indeed Apply button
    const applyButtonSelector = '#indeedApplyButton, button.jobsearch-IndeedApplyButton-button';
    const hasApply = await page.$(applyButtonSelector);
    if (!hasApply) {
      return { success: false, message: 'Indeed Quick Apply button not found (might require external site application).' };
    }

    await page.click(applyButtonSelector);
    await page.waitForTimeout(4000);

    // Indeed usually opens a popup modal. We might have an iframe or a new tab.
    // Playwright handles iframes and popup tabs well. Let's see if a popup was opened.
    let targetPage = page;
    const pages = browser.pages();
    if (pages.length > 2) {
      targetPage = pages[pages.length - 1];
    }

    // Modal navigation loop
    let stepCount = 0;
    const maxSteps = 12;
    let completed = false;

    while (stepCount < maxSteps && !completed) {
      stepCount++;
      await targetPage.waitForTimeout(2000);

      // Check for form fields
      await fillIndeedFormFields(targetPage, profile);

      // Check if we have standard Indeed continue/submit buttons
      const continueBtn = await targetPage.$('button.ia-continueButton, button:has-text("Continue"), button:has-text("Next")');
      const submitBtn = await targetPage.$('button:has-text("Submit your application"), button:has-text("Submit Application")');

      if (submitBtn) {
        console.log('Indeed submit button found, clicking...');
        await submitBtn.click();
        await targetPage.waitForTimeout(4000);
        completed = true;
        result = { success: true, message: 'Applied successfully.' };
        break;
      } else if (continueBtn) {
        console.log('Indeed continue button found, moving to next step...');
        await continueBtn.click();
      } else {
        // Stuck or finished without standard buttons
        result = { success: false, message: 'Could not proceed with standard Indeed form navigation.' };
        break;
      }
    }

  } catch (err) {
    result = { success: false, message: err.message };
  } finally {
    await browser.close();
  }

  return result;
}

async function fillIndeedFormFields(page, profile) {
  // Input fields
  const inputs = await page.$$('input[type="text"], input[type="tel"], input[type="number"]');
  for (const input of inputs) {
    try {
      const val = await input.inputValue();
      if (!val) {
        const name = await input.getAttribute('name') || '';
        const id = await input.getAttribute('id') || '';
        // Find label
        let label = '';
        if (id) {
          label = await page.$eval(`label[for="${id}"]`, el => el.innerText.trim()).catch(() => '');
        }
        const labelText = label || name;
        if (labelText) {
          const ans = await answerCustomQuestion(labelText, 'text', profile.resumeText, profile.aiSettings?.geminiApiKey, profile.customAnswers);
          if (ans) {
            await input.fill(ans);
          }
        }
      }
    } catch (e) {}
  }

  // Radio fieldsets
  const fieldsets = await page.$$('fieldset');
  for (const fs of fieldsets) {
    try {
      const legend = await fs.$eval('legend', el => el.innerText.trim()).catch(() => '');
      if (legend) {
        const answer = await answerCustomQuestion(legend, 'radio', profile.resumeText, profile.aiSettings?.geminiApiKey, profile.customAnswers);
        if (answer) {
          const labels = await fs.$$('label');
          for (const lbl of labels) {
            const txt = await lbl.innerText();
            if (txt.toLowerCase().trim() === answer.toLowerCase().trim()) {
              await lbl.click();
              break;
            }
          }
        }
      }
    } catch (e) {}
  }

  // Upload Resume if input is found
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    const localResumePath = path.resolve('resume_temp.pdf');
    if (fs.existsSync(localResumePath)) {
      await fileInput.setInputFiles(localResumePath);
      await page.waitForTimeout(2000);
    }
  }
}
