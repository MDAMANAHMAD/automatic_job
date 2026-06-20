import { getProfile } from './profile_manager.js';

/**
 * Calculates a match score between CV and job description using local keyword overlap.
 */
export function calculateLocalScore(resumeText, jobDescription, keywords = []) {
  if (!resumeText || !jobDescription) return 0;

  const descLower = jobDescription.toLowerCase();
  const resumeLower = resumeText.toLowerCase();

  // If we have custom keywords, check them
  if (keywords.length === 0) {
    // Extract some common tech keywords from resume if empty
    const commonTech = ['react', 'angular', 'vue', 'nodejs', 'express', 'python', 'django', 'java', 'spring', 'c++', 'c#', 'dotnet', 'sql', 'mongodb', 'aws', 'docker', 'kubernetes', 'typescript', 'javascript', 'html', 'css', 'git'];
    keywords = commonTech.filter(kw => resumeLower.includes(kw));
  }

  let matched = 0;
  let total = 0;

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    const inJob = descLower.includes(kwLower);
    const inResume = resumeLower.includes(kwLower);

    if (inJob) {
      total++;
      if (inResume) {
        matched++;
      }
    }
  }

  if (total === 0) return 50; // Neutral fallback
  return Math.round((matched / total) * 100);
}

/**
 * Queries Gemini API to evaluate match score and list any missing skills.
 */
export async function getGeminiMatchScore(resumeText, jobDescription, jobTitle, company, apiKey) {
  if (!apiKey) return null;

  const prompt = `
You are an expert technical recruiter. Analyze the candidate's resume and the job description below, and evaluate the match.
Return a JSON object matching this schema:
{
  "score": number (0 to 100),
  "matchReason": "string (1-2 sentences explaining the match)",
  "missingSkills": ["string", "skills in job but missing/weak in resume"]
}

Resume Text:
"""
${resumeText.slice(0, 8000)}
"""

Job Details:
Title: ${jobTitle}
Company: ${company}
Job Description:
"""
${jobDescription.slice(0, 8000)}
"""
`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textResult) {
      return JSON.parse(textResult);
    }
    throw new Error('Empty response from Gemini API');
  } catch (err) {
    console.error('Error in Gemini match score calculation:', err);
    return null;
  }
}

/**
 * Queries Gemini API to answer custom application questions.
 */
export async function answerCustomQuestion(questionText, fieldType, resumeText, apiKey, defaultAnswers = {}) {
  const profile = getProfile();
  
  // Standard field heuristics first
  const qLower = questionText.toLowerCase();

  // Experience questions
  if (qLower.includes('years of experience') || qLower.includes('how many years')) {
    const yoe = profile.personalInfo.yearsOfExperience || 0;
    if (fieldType === 'number' || qLower.includes('number') || qLower.includes('how many')) {
      return String(yoe);
    }
  }

  // Work Authorization / Sponsorship
  if (qLower.includes('sponsorship') || qLower.includes('visa')) {
    const sponsorAns = defaultAnswers.sponsorshipRequired || profile.customAnswers.sponsorshipRequired || 'No';
    if (qLower.includes('require')) {
      return sponsorAns;
    }
  }

  // Notice Period
  if (qLower.includes('notice period') || qLower.includes('how soon')) {
    return defaultAnswers.noticePeriod || profile.customAnswers.noticePeriod || 'Immediate';
  }

  // Gemini AI Answering fallback if key is available
  if (apiKey) {
    const prompt = `
Given the candidate's resume and a job application form question, write a concise, professional, and truthful answer for the field.
Return a JSON object with this schema:
{
  "answer": "string (the answer to fill in the form field)",
  "explanation": "brief reasoning"
}

Form Question: "${questionText}"
Field Type: "${fieldType}"

Candidate Resume:
"""
${resumeText.slice(0, 6000)}
"""

Common Preferences:
- Expected Salary: ${profile.personalInfo.expectedSalary || 'Market rate'}
- Notice Period: ${profile.customAnswers.noticePeriod || 'Immediate'}
- Work Authorization: ${profile.personalInfo.workAuthorization}
`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResult) {
          const parsed = JSON.parse(textResult);
          return parsed.answer;
        }
      }
    } catch (err) {
      console.error('Error calling Gemini for form question:', err);
    }
  }

  // Final Heuristic / Default Fallback
  if (qLower.includes('salary') || qLower.includes('compensation')) {
    return profile.personalInfo.expectedSalary || 'Negotiable';
  }
  if (qLower.includes('why') || qLower.includes('cover letter') || qLower.includes('describe your')) {
    return profile.customAnswers.whyJoin || 'I am excited about this role because my background matches the requirements and I am eager to contribute.';
  }

  // Default choices for radio / checkbox / select if yes/no
  if (qLower.includes('authorized') || qLower.includes('legally')) {
    return 'Yes';
  }

  return '';
}
