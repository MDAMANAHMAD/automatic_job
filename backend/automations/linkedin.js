import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { getSessionDir } from '../session_manager.js';
import { answerCustomQuestion } from '../matching_helper.js';

export async function searchJobs(keywords, location, profile) {
  const sessionDir = getSessionDir('linkedin');
  const browser = await chromium.launchPersistentContext(sessionDir, {
    headless: false, // Running headful is safer to prevent blocks and let users see
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const page = await browser.newPage();
  const jobsList = [];

  try {
    for (const kw of keywords) {
      const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(kw)}&location=${encodeURIComponent(location)}&f_AL=true`;
      console.log(`Navigating to LinkedIn search: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'load', timeout: 60000 });

      // Wait a moment for page to stabilize
      await page.waitForTimeout(5000);

      // Check if jobs exist
      const jobCardsSelector = '.jobs-search-results__list-item, .job-card-container';
      try {
        await page.waitForSelector(jobCardsSelector, { timeout: 15000 });
      } catch (e) {
        console.log(`No jobs found for keyword: ${kw}`);
        continue;
      }

      // Scroll to load all jobs in the left panel
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => {
          const container = document.querySelector('.jobs-search-results-list');
          if (container) container.scrollTop = container.scrollHeight;
        });
        await page.waitForTimeout(1000);
      }

      // Extract job items
      const cards = await page.$$(jobCardsSelector);
      console.log(`Found ${cards.length} cards on page.`);

      for (let i = 0; i < Math.min(cards.length, 10); i++) { // Limit to top 10 per keyword
        try {
          const card = cards[i];
          
          // Click the card to open description in the right panel
          await card.click();
          await page.waitForTimeout(2000);

          // Extract job details
          const title = await card.$eval('.job-card-list__title, .job-card-container__link', el => el.innerText.trim()).catch(() => '');
          const company = await card.$eval('.job-card-container__company-name, .job-card-container__primary-description', el => el.innerText.trim()).catch(() => '');
          const loc = await card.$eval('.job-card-container__metadata-item', el => el.innerText.trim()).catch(() => '');
          const link = await card.$eval('a.job-card-container__link, a.job-card-list__title', el => el.href).catch(() => '');
          
          // Extract job ID from link
          const match = link.match(/\/view\/(\d+)/);
          const jobId = match ? match[1] : `li_${Date.now()}_${i}`;

          // Extract job description
          const descSelector = '.jobs-description__content, .jobs-box__html-content, #job-details';
          let description = '';
          try {
            await page.waitForSelector(descSelector, { timeout: 5000 });
            description = await page.$eval(descSelector, el => el.innerText.trim());
          } catch (err) {
            console.log('Could not load description for card', i);
          }

          if (title && jobId) {
            jobsList.push({
              platform: 'linkedin',
              jobId,
              title,
              company,
              location: loc || location,
              link,
              description
            });
          }
        } catch (cardErr) {
          console.error('Error parsing card:', cardErr);
        }
      }
    }
  } finally {
    await browser.close();
  }

  return jobsList;
}

export async function applyJob(job, profile) {
  const sessionDir = getSessionDir('linkedin');
  const browser = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const page = await browser.newPage();
  let result = { success: false, message: '' };

  try {
    console.log(`Navigating to LinkedIn job page: ${job.link}`);
    await page.goto(job.link, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Check if we are prompted to sign in
    const signInPrompt = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Sign in to apply') || text.includes('Sign in to LinkedIn') || document.querySelector('form.login__form') !== null;
    });
    
    if (signInPrompt) {
      await page.screenshot({ path: 'error_linkedin.png' });
      return { success: false, message: 'Session expired or not logged in. Please reconnect your LinkedIn account in the Accounts tab.' };
    }

    // Check if already applied first
    const alreadyApplied = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Applied ') || text.includes('Applied\n') || text.includes('Application sent');
    });
    
    if (alreadyApplied) {
      return { success: true, message: 'Already applied' };
    }

    // Look for Easy Apply button with waiting
    const easyApplySelector = 'button.jobs-apply-button, .jobs-apply-button, .jobs-s-apply button';
    try {
      await page.waitForSelector(easyApplySelector, { timeout: 8000 });
    } catch (e) {
      // Double check already applied text in case it loaded slowly
      const reCheck = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('Applied ') || text.includes('Applied\n') || text.includes('Application sent');
      });
      if (reCheck) {
        return { success: true, message: 'Already applied' };
      }
      await page.screenshot({ path: 'error_linkedin.png' });
      return { success: false, message: 'Easy Apply button not found (might require external application).' };
    }

    await page.click(easyApplySelector);
    await page.waitForTimeout(3000);

    // Multi-step form handler loop
    let stepCount = 0;
    const maxSteps = 10;
    let completed = false;

    while (stepCount < maxSteps && !completed) {
      stepCount++;
      await page.waitForTimeout(1500);

      // Check if we are at the end: Submit application button
      const submitBtn = await page.$('button[aria-label="Submit application"]');
      
      // Look for Next / Review buttons
      const nextBtn = await page.$('button[aria-label="Continue to next step"], button.artdeco-button--primary');

      // Attempt to fill form fields on current step
      await fillLinkedInFormFields(page, profile);

      if (submitBtn) {
        console.log('Submit button found! Submitting application.');
        await submitBtn.click();
        await page.waitForTimeout(5000);
        completed = true;
        result = { success: true, message: 'Application submitted successfully.' };
        break;
      } else if (nextBtn) {
        console.log('Next/Review button found, moving to next step...');
        await nextBtn.click();
      } else {
        // No submit or next button found, we might be stuck or complete
        const dismissBtn = await page.$('button[aria-label="Dismiss"]');
        if (dismissBtn) {
          result = { success: false, message: 'Form filling blocked or manual submission required.' };
        } else {
          result = { success: true, message: 'Assumed applied or completed.' };
        }
        break;
      }
    }

    if (!completed && stepCount >= maxSteps) {
      result = { success: false, message: 'Exceeded maximum form steps.' };
    }

  } catch (err) {
    try {
      await page.screenshot({ path: 'error_linkedin.png' });
      console.log('Saved error screenshot to error_linkedin.png');
    } catch (screenshotErr) {
      console.error('Could not take screenshot:', screenshotErr);
    }
    result = { success: false, message: err.message };
  } finally {
    // If the application was successful, we close the page, else keep open for a second
    await page.waitForTimeout(2000);
    await browser.close();
  }

  return result;
}

async function fillLinkedInFormFields(page, profile) {
  // 1. Text inputs
  const textInputs = await page.$$('input[type="text"]');
  for (const input of textInputs) {
    try {
      const id = await input.getAttribute('id');
      const label = id ? await page.$eval(`label[for="${id}"]`, el => el.innerText.trim()).catch(() => '') : '';
      const val = await input.inputValue();
      
      if (!val && label) {
        const answer = await answerCustomQuestion(label, 'text', profile.resumeText, profile.aiSettings?.geminiApiKey, profile.customAnswers);
        if (answer) {
          await input.fill(answer);
        }
      }
    } catch (e) {
      // Ignored
    }
  }

  // 2. Textareas
  const textareas = await page.$$('textarea');
  for (const ta of textareas) {
    try {
      const id = await ta.getAttribute('id');
      const label = id ? await page.$eval(`label[for="${id}"]`, el => el.innerText.trim()).catch(() => '') : '';
      const val = await ta.inputValue();

      if (!val && label) {
        const answer = await answerCustomQuestion(label, 'textarea', profile.resumeText, profile.aiSettings?.geminiApiKey, profile.customAnswers);
        if (answer) {
          await ta.fill(answer);
        }
      }
    } catch (e) {
      // Ignored
    }
  }

  // 3. Dropdowns (select elements)
  const selects = await page.$$('select');
  for (const select of selects) {
    try {
      const val = await select.inputValue();
      if (!val || val === 'Select an option' || val === '-') {
        const id = await select.getAttribute('id');
        const label = id ? await page.$eval(`label[for="${id}"]`, el => el.innerText.trim()).catch(() => '') : '';
        if (label) {
          const answer = await answerCustomQuestion(label, 'select', profile.resumeText, profile.aiSettings?.geminiApiKey, profile.customAnswers);
          if (answer) {
            // Match the best option
            const options = await select.$$eval('option', opts => opts.map(o => o.value));
            const bestOption = options.find(opt => opt.toLowerCase().includes(answer.toLowerCase()) || answer.toLowerCase().includes(opt.toLowerCase())) || options[1];
            if (bestOption) {
              await select.selectOption(bestOption);
            }
          }
        }
      }
    } catch (e) {
      // Ignored
    }
  }

  // 4. Checkboxes / Radio buttons
  const fieldsets = await page.$$('fieldset');
  for (const fs of fieldsets) {
    try {
      const legend = await fs.$eval('legend', el => el.innerText.trim()).catch(() => '');
      if (legend) {
        const answer = await answerCustomQuestion(legend, 'radio', profile.resumeText, profile.aiSettings?.geminiApiKey, profile.customAnswers);
        if (answer) {
          // If answer is Yes/No, select appropriate radio button
          const labelElements = await fs.$$('label');
          for (const lbl of labelElements) {
            const txt = await lbl.innerText();
            if (txt.toLowerCase().trim() === answer.toLowerCase().trim()) {
              await lbl.click();
              break;
            }
          }
        }
      }
    } catch (e) {
      // Ignored
    }
  }

  // 5. Resume upload
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    // If a resume path is saved in personalInfo, upload it
    const localResumePath = path.resolve('resume_temp.pdf');
    if (fs.existsSync(localResumePath)) {
      await fileInput.setInputFiles(localResumePath);
      await page.waitForTimeout(2000);
    }
  }
}
