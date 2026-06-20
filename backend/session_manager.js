import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SESSIONS_DIR = path.resolve('sessions_data');

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const LOGIN_URLS = {
  linkedin: 'https://www.linkedin.com/login',
  indeed: 'https://www.indeed.com/',
  naukri: 'https://www.naukri.com/nlogin/login',
  wellfound: 'https://wellfound.com/login',
  instahyre: 'https://www.instahyre.com/login/',
  foundit: 'https://www.foundit.in/login',
  cuvette: 'https://cuvette.tech/app/student/login',
  unstop: 'https://unstop.com/login',
  hackerearth: 'https://www.hackerearth.com/login/',
  hackerrank: 'https://www.hackerrank.com/auth/login'
};

// Keep track of active helper browser contexts
const activeHelpers = {};

export async function launchSessionHelper(platform, onStatusChange) {
  if (activeHelpers[platform]) {
    throw new Error(`A login session helper is already open for ${platform}`);
  }

  const userDir = path.join(SESSIONS_DIR, platform);
  
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  onStatusChange({ status: 'opening', message: 'Launching browser...' });

  try {
    const context = await chromium.launchPersistentContext(userDir, {
      headless: false,
      viewport: null,
      args: ['--start-maximized'],
      slowMo: 50
    });

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    
    activeHelpers[platform] = { context, page };

    const loginUrl = LOGIN_URLS[platform] || 'https://google.com';
    await page.goto(loginUrl);

    onStatusChange({ status: 'running', message: 'Please log in, solve any captchas/MFA, then close this browser or click Finish.' });

    // Listen to browser close
    context.on('close', () => {
      delete activeHelpers[platform];
      onStatusChange({ status: 'closed', message: `Login helper browser closed for ${platform}.` });
    });

  } catch (err) {
    delete activeHelpers[platform];
    console.error(`Error launching helper for ${platform}:`, err);
    onStatusChange({ status: 'error', message: err.message });
    throw err;
  }
}

export async function closeSessionHelper(platform) {
  const helper = activeHelpers[platform];
  if (helper) {
    await helper.context.close();
    delete activeHelpers[platform];
    return true;
  }
  return false;
}

export function isSessionHelperActive(platform) {
  return !!activeHelpers[platform];
}

export function getSessionDir(platform) {
  return path.join(SESSIONS_DIR, platform);
}

export function checkSessionExists(platform) {
  const userDir = path.join(SESSIONS_DIR, platform);
  // If the folder exists and has some files in it, we assume a session might exist
  if (fs.existsSync(userDir)) {
    const files = fs.readdirSync(userDir);
    return files.length > 0;
  }
  return false;
}
