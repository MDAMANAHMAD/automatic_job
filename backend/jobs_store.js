import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve('jobs_db.json');

const INITIAL_DB = {
  jobs: [],
  logs: []
};

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(INITIAL_DB, null, 2), 'utf8');
    return INITIAL_DB;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading jobs database, resetting:', err);
    return INITIAL_DB;
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export function getJobs() {
  return readDB().jobs;
}

export function saveJobs(jobsList) {
  const db = readDB();
  const existingKeys = new Set(db.jobs.map(j => `${j.platform}_${j.jobId}`));
  
  let newAddedCount = 0;
  for (const job of jobsList) {
    const key = `${job.platform}_${job.jobId}`;
    if (!existingKeys.has(key)) {
      db.jobs.push({
        platform: job.platform,
        jobId: job.jobId,
        title: job.title,
        company: job.company,
        location: job.location,
        link: job.link,
        salary: job.salary || '',
        description: job.description || '',
        matchScore: job.matchScore || 0,
        status: 'Pending', // Pending, Applied, Failed, Skipped
        errorMsg: '',
        appliedAt: null,
        discoveredAt: new Date().toISOString()
      });
      newAddedCount++;
    }
  }

  if (newAddedCount > 0) {
    writeDB(db);
  }
  return newAddedCount;
}

export function updateJobStatus(platform, jobId, status, errorMsg = '') {
  const db = readDB();
  const job = db.jobs.find(j => j.platform === platform && j.jobId === jobId);
  if (job) {
    job.status = status;
    job.errorMsg = errorMsg;
    if (status === 'Applied') {
      job.appliedAt = new Date().toISOString();
    }
    writeDB(db);
    return true;
  }
  return false;
}

export function addLog(message, type = 'info') {
  const db = readDB();
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    type // info, success, warning, error
  };
  db.logs.push(logEntry);
  // Cap logs at 1000 items
  if (db.logs.length > 1000) {
    db.logs.shift();
  }
  writeDB(db);
  return logEntry;
}

export function getLogs(limit = 100) {
  const db = readDB();
  return db.logs.slice(-limit);
}

export function getStats() {
  const db = readDB();
  const jobs = db.jobs;
  
  const totalDiscovered = jobs.length;
  const applied = jobs.filter(j => j.status === 'Applied').length;
  const failed = jobs.filter(j => j.status === 'Failed').length;
  const skipped = jobs.filter(j => j.status === 'Skipped').length;
  const pending = jobs.filter(j => j.status === 'Pending').length;

  return {
    totalDiscovered,
    applied,
    failed,
    skipped,
    pending,
    successRate: applied > 0 ? Math.round((applied / (applied + failed)) * 100) : 0
  };
}

export function clearDatabase() {
  writeDB(INITIAL_DB);
}
