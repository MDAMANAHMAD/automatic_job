import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getProfile, saveProfile, parseResume } from './profile_manager.js';
import { getJobs, clearDatabase, getStats, getLogs, addLog } from './jobs_store.js';
import {
  launchSessionHelper,
  closeSessionHelper,
  isSessionHelperActive,
  checkSessionExists
} from './session_manager.js';
import { startRunner, stopRunner, getRunnerState } from './automation_engine.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Set up Multer for resume upload (saving it directly as resume_temp.pdf in backend root)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './');
  },
  filename: function (req, file, cb) {
    cb(null, 'resume_temp.pdf');
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported.'));
    }
  }
});

// Profile endpoints
app.get('/api/profile', (req, res) => {
  res.json(getProfile());
});

app.post('/api/profile', (req, res) => {
  try {
    const updated = saveProfile(req.body);
    res.json({ success: true, profile: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/profile/upload-resume', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded.' });
  }

  try {
    const filePath = './resume_temp.pdf';
    const buffer = fs.readFileSync(filePath);
    const result = await parseResume(buffer);

    // Update profile with parsed text
    const profile = getProfile();
    const updatedPersonalInfo = { ...profile.personalInfo, ...result.parsedInfo };
    saveProfile({
      ...profile,
      personalInfo: updatedPersonalInfo,
      resumeText: result.text
    });

    addLog('CV uploaded and parsed successfully.', 'success');
    res.json({
      success: true,
      text: result.text,
      parsedInfo: result.parsedInfo
    });
  } catch (err) {
    console.error('Error handling resume upload:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Jobs list and stats endpoints
app.get('/api/jobs', (req, res) => {
  res.json(getJobs());
});

app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

app.post('/api/jobs/clear', (req, res) => {
  clearDatabase();
  addLog('Database cleared.', 'info');
  res.json({ success: true });
});

app.get('/api/logs', (req, res) => {
  res.json(getLogs());
});

// Runner endpoints
app.get('/api/runner/state', (req, res) => {
  res.json(getRunnerState());
});

app.post('/api/runner/start', async (req, res) => {
  const { platforms } = req.body;
  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({ success: false, error: 'Please specify at least one platform to run.' });
  }

  try {
    const state = await startRunner(platforms);
    res.json({ success: true, state });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/runner/stop', (req, res) => {
  stopRunner();
  res.json({ success: true });
});

// Session endpoints
app.get('/api/sessions/status', (req, res) => {
  const platforms = ['linkedin', 'indeed', 'instahyre', 'naukri', 'wellfound', 'foundit', 'cuvette', 'unstop', 'hackerearth', 'hackerrank'];
  const status = {};
  platforms.forEach(p => {
    status[p] = {
      sessionExists: checkSessionExists(p),
      helperActive: isSessionHelperActive(p)
    };
  });
  res.json(status);
});

app.post('/api/sessions/helper/launch', async (req, res) => {
  const { platform } = req.body;
  if (!platform) {
    return res.status(400).json({ success: false, error: 'Platform not specified.' });
  }

  try {
    await launchSessionHelper(platform, (statusData) => {
      addLog(`Session Helper for ${platform}: ${statusData.message}`, statusData.status === 'error' ? 'error' : 'info');
    });
    res.json({ success: true, message: `Helper launched for ${platform}.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sessions/helper/close', async (req, res) => {
  const { platform } = req.body;
  if (!platform) {
    return res.status(400).json({ success: false, error: 'Platform not specified.' });
  }

  try {
    const closed = await closeSessionHelper(platform);
    res.json({ success: true, closed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start backend server
app.listen(PORT, () => {
  console.log(`Auto Apply Backend listening on http://localhost:${PORT}`);
  addLog(`Backend Server started on port ${PORT}`, 'info');
});
