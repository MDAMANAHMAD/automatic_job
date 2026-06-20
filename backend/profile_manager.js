import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

const PROFILE_PATH = path.resolve('profile.json');

const DEFAULT_PROFILE = {
  personalInfo: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    github: '',
    portfolio: '',
    workAuthorization: 'Authorized to work without sponsorship',
    yearsOfExperience: 0,
    currentRole: '',
    expectedSalary: ''
  },
  preferences: {
    jobKeywords: ['Software Engineer', 'Full Stack Developer', 'React Developer'],
    locations: ['Remote', 'Hybrid', 'United States', 'India'],
    jobTypes: ['Full-time', 'Contract'],
    minScore: 60
  },
  aiSettings: {
    geminiApiKey: ''
  },
  customAnswers: {
    noticePeriod: 'Immediate',
    sponsorshipRequired: 'No',
    whyJoin: 'I am excited about this role because it aligns perfectly with my technical skills and my passion for building scalable web applications.'
  },
  resumeText: ''
};

export function getProfile() {
  if (!fs.existsSync(PROFILE_PATH)) {
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(DEFAULT_PROFILE, null, 2), 'utf8');
    return DEFAULT_PROFILE;
  }
  try {
    const raw = fs.readFileSync(PROFILE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading profile, resetting to default:', err);
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(data) {
  const current = getProfile();
  const updated = {
    personalInfo: { ...current.personalInfo, ...data.personalInfo },
    preferences: { ...current.preferences, ...data.preferences },
    aiSettings: { ...current.aiSettings, ...data.aiSettings },
    customAnswers: { ...current.customAnswers, ...data.customAnswers },
    resumeText: data.resumeText !== undefined ? data.resumeText : current.resumeText
  };
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

export async function parseResume(buffer) {
  try {
    const data = await pdfParse(buffer);
    const text = data.text || '';
    
    // Perform simple heuristic extraction for profile fields
    const parsedInfo = {};
    
    // Match Email
    const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    if (emailMatch) parsedInfo.email = emailMatch[1];
    
    // Match Phone
    const phoneMatch = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch) parsedInfo.phone = phoneMatch[0];
    
    // Match LinkedIn
    const liMatch = text.match(/(linkedin\.com\/in\/[a-zA-Z0-9-_]+)/i);
    if (liMatch) parsedInfo.linkedin = 'https://' + liMatch[1];

    // Match GitHub
    const ghMatch = text.match(/(github\.com\/[a-zA-Z0-9-_]+)/i);
    if (ghMatch) parsedInfo.github = 'https://' + ghMatch[1];

    return { text, parsedInfo };
  } catch (err) {
    console.error('Error parsing PDF:', err);
    throw new Error('Failed to parse PDF resume: ' + err.message);
  }
}
