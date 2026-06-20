import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { getSessionDir } from '../session_manager.js';
import { answerCustomQuestion } from '../matching_helper.js';

export async function searchJobs(keywords, location, profile) {
  const sessionDir = getSessionDir('instahyre');
  const browser = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const page = await browser.newPage();
  const jobsList = [];

  try {
    const oppUrl = 'https://www.instahyre.com/candidate/opportunities/';
    console.log(`Navigating to Instahyre Opportunities: ${oppUrl}`);
    await page.goto(oppUrl, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000);

    // Check if we are logged in. Instahyre redirect page if not.
    if (page.url().includes('/login')) {
      console.log('Not logged in to Instahyre. Skipping.');
      return [];
    }

    // Instahyre has job items in cards
    const jobCardsSelector = '.opportunity-card, .job-card, [id^="job-"]';
    try {
      await page.waitForSelector(jobCardsSelector, { timeout: 15000 });
    } catch (e) {
      console.log('No job cards found on Instahyre opportunities page.');
      return [];
    }

    const cards = await page.$$(jobCardsSelector);
    console.log(`Found ${cards.length} Instahyre job cards.`);

    for (let i = 0; i < Math.min(cards.length, 15); i++) {
      try {
        const card = cards[i];
        
        const title = await card.$eval('.job-title, .title', el => el.innerText.trim()).catch(() => '');
        const company = await card.$eval('.company-name, .company', el => el.innerText.trim()).catch(() => '');
        const loc = await card.$eval('.location', el => el.innerText.trim()).catch(() => '');
        
        // Retrieve internal job ID
        const jobId = await card.getAttribute('id') || `insta_${Date.now()}_${i}`;

        // Get description (often inside a details toggle or hover)
        let description = '';
        const descEl = await card.$('.job-description, .skills, .description');
        if (descEl) {
          description = await descEl.innerText();
        } else {
          description = `${title} job at ${company}.`;
        }

        // Link on Instahyre is usually a details page or internal hash
        const link = `https://www.instahyre.com/candidate/opportunities/?job_id=${jobId}`;

        if (title && company) {
          jobsList.push({
            platform: 'instahyre',
            jobId,
            title,
            company,
            location: loc || 'Remote/India',
            link,
            description
          });
        }
      } catch (err) {
        console.error('Error parsing Instahyre card:', err);
      }
    }
  } finally {
    await browser.close();
  }

  return jobsList;
}

export async function applyJob(job, profile) {
  const sessionDir = getSessionDir('instahyre');
  const browser = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const page = await browser.newPage();
  let result = { success: false, message: '' };

  try {
    const oppUrl = 'https://www.instahyre.com/candidate/opportunities/';
    await page.goto(oppUrl, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(4000);

    // Search for the specific job card by ID
    const cardSelector = `#${job.jobId}, [id="${job.jobId}"]`;
    const card = await page.$(cardSelector);
    if (!card) {
      return { success: false, message: 'Job card not found on active opportunities list.' };
    }

    // Look for apply/show interest button inside this card
    const applyButton = await card.$('button:has-text("Apply"), button:has-text("Show Interest"), .btn-apply');
    if (!applyButton) {
      return { success: false, message: 'Apply or Show Interest button not found.' };
    }

    const btnText = await applyButton.innerText();
    if (btnText.includes('Applied') || btnText.includes('Interested')) {
      return { success: true, message: 'Already applied to this job.' };
    }

    await applyButton.click();
    await page.waitForTimeout(3000);

    // Instahyre sometimes displays a modal asking "Why do you want to join?" or a note.
    const noteTextarea = await page.$('textarea[name="note"], textarea.note-input');
    if (noteTextarea) {
      console.log('Writing short cover note on Instahyre...');
      const answer = await answerCustomQuestion('Why are you interested in this job?', 'textarea', profile.resumeText, profile.aiSettings?.geminiApiKey, profile.customAnswers);
      await noteTextarea.fill(answer);
      await page.waitForTimeout(1000);
      
      const submitNoteBtn = await page.$('button:has-text("Submit"), button:has-text("Send"), button.btn-submit');
      if (submitNoteBtn) {
        await submitNoteBtn.click();
        await page.waitForTimeout(3000);
      }
    }

    result = { success: true, message: 'Showed interest successfully.' };

  } catch (err) {
    result = { success: false, message: err.message };
  } finally {
    await browser.close();
  }

  return result;
}
