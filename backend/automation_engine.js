import { getProfile } from './profile_manager.js';
import { getJobs, saveJobs, updateJobStatus, addLog, getStats } from './jobs_store.js';
import { checkSessionExists } from './session_manager.js';
import { calculateLocalScore, getGeminiMatchScore } from './matching_helper.js';

// Import automation modules
import * as linkedinAutomation from './automations/linkedin.js';
import * as indeedAutomation from './automations/indeed.js';
import * as instahyreAutomation from './automations/instahyre.js';

const automations = {
  linkedin: linkedinAutomation,
  indeed: indeedAutomation,
  instahyre: instahyreAutomation
};

let runnerState = {
  isRunning: false,
  platforms: [],
  currentPlatform: null,
  currentJob: null,
  processedCount: 0,
  error: null
};

let activeTimeout = null;

export function getRunnerState() {
  return runnerState;
}

export async function startRunner(platformsToRun) {
  if (runnerState.isRunning) {
    throw new Error('Automation engine is already running.');
  }

  const profile = getProfile();
  if (!profile.resumeText) {
    throw new Error('Please upload a resume before starting the automation.');
  }

  runnerState = {
    isRunning: true,
    platforms: platformsToRun,
    currentPlatform: null,
    currentJob: null,
    processedCount: 0,
    error: null
  };

  addLog('Starting Job Application Engine...', 'info');
  
  // Run asynchronously in the background
  runLoop(profile).catch(err => {
    console.error('Error in runner loop:', err);
    runnerState.isRunning = false;
    runnerState.error = err.message;
    addLog(`Engine stopped due to error: ${err.message}`, 'error');
  });

  return runnerState;
}

export function stopRunner() {
  if (!runnerState.isRunning) return;
  runnerState.isRunning = false;
  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }
  addLog('Job Application Engine stopped by user.', 'warning');
}

async function runLoop(profile) {
  for (const platform of runnerState.platforms) {
    if (!runnerState.isRunning) break;

    runnerState.currentPlatform = platform;
    addLog(`Processing platform: ${platform.toUpperCase()}`, 'info');

    // 1. Check if session exists
    if (!checkSessionExists(platform)) {
      addLog(`No active session found for ${platform}. Skipping. Please log in first.`, 'warning');
      continue;
    }

    const automation = automations[platform];
    if (!automation) {
      addLog(`No automation module found for ${platform}. Skipping.`, 'warning');
      continue;
    }

    // 2. Search / Scrape jobs
    addLog(`Searching matching jobs on ${platform}...`, 'info');
    try {
      const searchKeywords = profile.preferences.jobKeywords || ['Software Engineer'];
      const location = profile.preferences.locations?.[0] || '';
      
      const foundJobs = await automation.searchJobs(searchKeywords, location, profile);
      addLog(`Found ${foundJobs.length} potential jobs on ${platform}.`, 'info');
      
      // Calculate scores and save jobs
      const evaluatedJobs = [];
      for (const job of foundJobs) {
        let score = calculateLocalScore(profile.resumeText, job.description, searchKeywords);
        
        // Use Gemini API if configured
        if (profile.aiSettings?.geminiApiKey) {
          addLog(`Using Gemini AI to evaluate match for "${job.title}" at ${job.company}...`, 'info');
          const aiResult = await getGeminiMatchScore(
            profile.resumeText,
            job.description,
            job.title,
            job.company,
            profile.aiSettings.geminiApiKey
          );
          if (aiResult && typeof aiResult.score === 'number') {
            score = aiResult.score;
            addLog(`Gemini match score: ${score}% (Reason: ${aiResult.matchReason})`, 'info');
          }
        }
        
        evaluatedJobs.push({ ...job, matchScore: score });
      }

      const newAdded = saveJobs(evaluatedJobs);
      addLog(`Added ${newAdded} new jobs to the database from ${platform}.`, 'success');

    } catch (err) {
      addLog(`Error scraping ${platform}: ${err.message}`, 'error');
      console.error(err);
    }

    // 3. Apply to jobs for this platform
    if (!runnerState.isRunning) break;

    const allJobs = getJobs();
    const pendingJobs = allJobs.filter(j => j.platform === platform && j.status === 'Pending');
    addLog(`Found ${pendingJobs.length} pending jobs to apply on ${platform}.`, 'info');

    for (const job of pendingJobs) {
      if (!runnerState.isRunning) break;

      const minScore = profile.preferences.minScore || 60;
      if (job.matchScore < minScore) {
        addLog(`Skipping "${job.title}" at ${job.company} (Match score ${job.matchScore}% < threshold ${minScore}%)`, 'info');
        updateJobStatus(platform, job.jobId, 'Skipped', 'Match score below threshold');
        continue;
      }

      runnerState.currentJob = job;
      addLog(`Starting application process for "${job.title}" at ${job.company}...`, 'info');

      try {
        // Execute the apply flow
        const result = await automation.applyJob(job, profile);
        if (result.success) {
          updateJobStatus(platform, job.jobId, 'Applied');
          addLog(`Successfully applied to "${job.title}" at ${job.company}!`, 'success');
        } else {
          updateJobStatus(platform, job.jobId, 'Failed', result.message || 'Unknown error');
          addLog(`Failed to apply to "${job.title}" at ${job.company}: ${result.message}`, 'error');
        }
      } catch (err) {
        updateJobStatus(platform, job.jobId, 'Failed', err.message);
        addLog(`Exception while applying to "${job.title}" at ${job.company}: ${err.message}`, 'error');
        console.error(err);
      }

      runnerState.processedCount++;

      // Wait a random time between applications to look human (10-25 seconds)
      if (runnerState.isRunning) {
        const delay = Math.floor(Math.random() * 15000) + 10000;
        addLog(`Waiting ${Math.round(delay / 1000)} seconds before next action...`, 'info');
        await new Promise(resolve => {
          activeTimeout = setTimeout(resolve, delay);
        });
      }
    }
  }

  runnerState.isRunning = false;
  runnerState.currentPlatform = null;
  runnerState.currentJob = null;
  addLog('Automation run completed successfully.', 'success');
}
