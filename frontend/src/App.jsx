import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Dashboard states
  const [stats, setStats] = useState({ totalDiscovered: 0, applied: 0, failed: 0, skipped: 0, pending: 0, successRate: 0 });
  const [logs, setLogs] = useState([]);
  const [runnerState, setRunnerState] = useState({ isRunning: false, platforms: [], currentPlatform: null, currentJob: null, processedCount: 0, error: null });
  const [selectedPlatforms, setSelectedPlatforms] = useState({ linkedin: true, indeed: false, instahyre: false });
  
  // Profile states
  const [profile, setProfile] = useState({
    personalInfo: { firstName: '', lastName: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '', workAuthorization: '', yearsOfExperience: 0, currentRole: '', expectedSalary: '' },
    preferences: { jobKeywords: [], locations: [], jobTypes: [], minScore: 60 },
    aiSettings: { geminiApiKey: '' },
    customAnswers: { noticePeriod: '', sponsorshipRequired: '', whyJoin: '' },
    resumeText: ''
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Accounts state
  const [sessionStatus, setSessionStatus] = useState({});

  // Tracker state
  const [jobs, setJobs] = useState([]);
  const [trackerFilter, setTrackerFilter] = useState('all');

  const logConsoleEndRef = useRef(null);

  // Poll intervals
  useEffect(() => {
    fetchProfile();
    fetchStats();
    fetchLogs();
    fetchRunnerState();
    fetchSessionStatus();
    fetchJobs();

    const interval = setInterval(() => {
      fetchStats();
      fetchLogs();
      fetchRunnerState();
      fetchSessionStatus();
      fetchJobs();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logConsoleEndRef.current) {
      logConsoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Fetch API helpers
  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/profile`);
      const data = await res.json();
      setProfile(data);
      setKeywordInput(data.preferences.jobKeywords.join(', '));
      setLocationInput(data.preferences.locations.join(', '));
    } catch (e) {
      console.error('Error fetching profile:', e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/logs`);
      const data = await res.json();
      setLogs(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRunnerState = async () => {
    try {
      const res = await fetch(`${API_BASE}/runner/state`);
      const data = await res.json();
      setRunnerState(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSessionStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions/status`);
      const data = await res.json();
      setSessionStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API_BASE}/jobs`);
      const data = await res.json();
      setJobs(data);
    } catch (e) {
      console.error(e);
    }
  };

  // Action handlers
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaveStatus('Saving...');
    try {
      const updatedPreferences = {
        ...profile.preferences,
        jobKeywords: keywordInput.split(',').map(s => s.trim()).filter(s => s.length > 0),
        locations: locationInput.split(',').map(s => s.trim()).filter(s => s.length > 0)
      };

      const res = await fetch(`${API_BASE}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profile, preferences: updatedPreferences })
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.profile);
        setSaveStatus('Profile saved successfully!');
      } else {
        setSaveStatus('Failed to save profile.');
      }
    } catch (err) {
      setSaveStatus(`Error: ${err.message}`);
    }
    setTimeout(() => setSaveStatus(''), 4000);
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const res = await fetch(`${API_BASE}/profile/upload-resume`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        alert('Resume uploaded and parsed successfully!');
        fetchProfile();
      } else {
        alert(`Failed to parse resume: ${data.error}`);
      }
    } catch (err) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleLaunchSessionHelper = async (platform) => {
    try {
      await fetch(`${API_BASE}/sessions/helper/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform })
      });
      fetchSessionStatus();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleCloseSessionHelper = async (platform) => {
    try {
      await fetch(`${API_BASE}/sessions/helper/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform })
      });
      fetchSessionStatus();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleStartRunner = async () => {
    const activePlatforms = Object.keys(selectedPlatforms).filter(p => selectedPlatforms[p]);
    if (activePlatforms.length === 0) {
      alert('Please select at least one platform to run.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/runner/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: activePlatforms })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error);
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const handleStopRunner = async () => {
    try {
      await fetch(`${API_BASE}/runner/stop`, { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearDatabase = async () => {
    if (window.confirm('Are you sure you want to clear the jobs tracker database?')) {
      try {
        await fetch(`${API_BASE}/jobs/clear`, { method: 'POST' });
        fetchJobs();
        fetchStats();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const filteredJobs = jobs.filter(job => {
    if (trackerFilter === 'all') return true;
    return job.status.toLowerCase() === trackerFilter.toLowerCase();
  });

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-logo">
          <div className="logo-icon">A</div>
          <span>ANTIGRAVITY <span className="glow-text">AUTO-APPLY</span></span>
        </div>
        <nav className="tab-nav">
          <button className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
          <button className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>Profile & CV</button>
          <button className={`tab-button ${activeTab === 'accounts' ? 'active' : ''}`} onClick={() => setActiveTab('accounts')}>Accounts</button>
          <button className={`tab-button ${activeTab === 'tracker' ? 'active' : ''}`} onClick={() => setActiveTab('tracker')}>Job Tracker</button>
        </nav>
      </header>

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="stats-grid">
            <div className="glass-panel stat-card">
              <div className="form-label">Total Discovered</div>
              <div className="stat-value glow-text">{stats.totalDiscovered}</div>
            </div>
            <div className="glass-panel stat-card">
              <div className="form-label" style={{ color: 'var(--secondary-light)' }}>Applied</div>
              <div className="stat-value" style={{ color: 'var(--secondary-light)' }}>{stats.applied}</div>
            </div>
            <div className="glass-panel stat-card">
              <div className="form-label" style={{ color: 'var(--danger)' }}>Failed</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.failed}</div>
            </div>
            <div className="glass-panel stat-card">
              <div className="form-label" style={{ color: 'var(--warning)' }}>Skipped</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{stats.skipped}</div>
            </div>
            <div className="glass-panel stat-card">
              <div className="form-label">Success Rate</div>
              <div className="stat-value">{stats.successRate}%</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
            {/* Control Panel */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h3 className="glow-text">Runner Console</h3>
              
              <div className="form-group">
                <span className="form-label">Select Platforms to Run</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  {['linkedin', 'indeed', 'instahyre'].map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', textTransform: 'capitalize' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedPlatforms[p] || false}
                        onChange={(e) => setSelectedPlatforms({ ...selectedPlatforms, [p]: e.target.checked })}
                        disabled={runnerState.isRunning}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                      />
                      {p} {sessionStatus[p]?.sessionExists ? '✅' : '❌'}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                {runnerState.isRunning ? (
                  <button className="btn btn-danger" onClick={handleStopRunner}>
                    Stop Engine
                  </button>
                ) : (
                  <button className="btn btn-success" onClick={handleStartRunner}>
                    Start Automating
                  </button>
                )}
                
                <button className="btn btn-secondary" onClick={handleClearDatabase}>
                  Clear Jobs Database
                </button>
              </div>

              {runnerState.isRunning && (
                <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div className="pulse-indicator"></div>
                  <span style={{ fontSize: '0.9rem', color: 'var(--secondary-light)', fontWeight: 600 }}>
                    Running: {runnerState.currentPlatform?.toUpperCase()}
                  </span>
                  {runnerState.currentJob && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                      Current: {runnerState.currentJob.title} @ {runnerState.currentJob.company}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Logs Terminal */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 className="glow-text">Live Action Logs</h3>
              <div className="terminal-console">
                {logs.map((log, index) => {
                  const time = new Date(log.timestamp).toLocaleTimeString();
                  let logClass = 'terminal-info';
                  if (log.type === 'success') logClass = 'terminal-success';
                  if (log.type === 'warning') logClass = 'terminal-warning';
                  if (log.type === 'error') logClass = 'terminal-error';

                  return (
                    <div key={index} className="terminal-line">
                      <span className="terminal-time">[{time}]</span>
                      <span className={logClass}>{log.message}</span>
                    </div>
                  );
                })}
                <div ref={logConsoleEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROFILE TAB */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="glow-text">Candidate Profile</h2>
            <button type="submit" className="btn btn-primary">Save Profile Details</button>
          </div>

          {saveStatus && (
            <div style={{ padding: '12px', background: saveStatus.includes('successfully') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
              {saveStatus}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Resume / PDF Parser */}
            <div>
              <span className="form-label">Upload CV (PDF)</span>
              <div className="file-dropzone" onClick={() => document.getElementById('resume-file').click()}>
                {isUploading ? (
                  <div>Parsing PDF & Extracting Text...</div>
                ) : (
                  <div>
                    <span style={{ fontSize: '1.5rem' }}>📄</span>
                    <p style={{ marginTop: '8px' }}>Drag and Drop your PDF CV or Click to browse</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Only PDF format is supported</p>
                  </div>
                )}
                <input 
                  type="file" 
                  id="resume-file" 
                  accept=".pdf" 
                  onChange={handleResumeUpload} 
                  style={{ display: 'none' }} 
                />
              </div>
              {profile.resumeText && (
                <div style={{ marginTop: '15px' }}>
                  <span className="form-label">Parsed CV Content Preview (First 800 chars)</span>
                  <textarea 
                    className="form-control" 
                    rows={8} 
                    value={profile.resumeText.slice(0, 800) + '...'} 
                    readOnly 
                    style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.4)', fontFamily: 'monospace' }}
                  />
                </div>
              )}
            </div>

            {/* Personal Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input type="text" className="form-control" value={profile.personalInfo.firstName || ''} onChange={e => setProfile({ ...profile, personalInfo: { ...profile.personalInfo, firstName: e.target.value } })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input type="text" className="form-control" value={profile.personalInfo.lastName || ''} onChange={e => setProfile({ ...profile, personalInfo: { ...profile.personalInfo, lastName: e.target.value } })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input type="email" className="form-control" value={profile.personalInfo.email || ''} onChange={e => setProfile({ ...profile, personalInfo: { ...profile.personalInfo, email: e.target.value } })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input type="text" className="form-control" value={profile.personalInfo.phone || ''} onChange={e => setProfile({ ...profile, personalInfo: { ...profile.personalInfo, phone: e.target.value } })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label className="form-label">Years of Experience</label>
                  <input type="number" className="form-control" value={profile.personalInfo.yearsOfExperience || 0} onChange={e => setProfile({ ...profile, personalInfo: { ...profile.personalInfo, yearsOfExperience: parseInt(e.target.value) || 0 } })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Current Role</label>
                  <input type="text" className="form-control" value={profile.personalInfo.currentRole || ''} onChange={e => setProfile({ ...profile, personalInfo: { ...profile.personalInfo, currentRole: e.target.value } })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Expected Salary / Compensation</label>
                <input type="text" className="form-control" placeholder="e.g. $100,000 / 15 LPA" value={profile.personalInfo.expectedSalary || ''} onChange={e => setProfile({ ...profile, personalInfo: { ...profile.personalInfo, expectedSalary: e.target.value } })} />
              </div>
            </div>
          </div>

          <hr style={{ borderColor: 'var(--border-glass)' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Preferences */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h3 className="glow-text">Preferences & Filters</h3>
              <div className="form-group">
                <label className="form-label">Job Keywords (Comma separated)</label>
                <input type="text" className="form-control" placeholder="React, Node.js, Python, Full Stack" value={keywordInput} onChange={e => setKeywordInput(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Preferred Locations (Comma separated)</label>
                <input type="text" className="form-control" placeholder="Remote, New York, Bangalore" value={locationInput} onChange={e => setLocationInput(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Minimum Match Score Threshold (%)</label>
                <input type="number" className="form-control" min={0} max={100} value={profile.preferences.minScore || 60} onChange={e => setProfile({ ...profile, preferences: { ...profile.preferences, minScore: parseInt(e.target.value) || 60 } })} />
              </div>
            </div>

            {/* AI Settings & Custom Answers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h3 className="glow-text">AI & Form-filling Config</h3>
              <div className="form-group">
                <label className="form-label">Google Gemini API Key (Optional)</label>
                <input type="password" className="form-control" placeholder="Enter API Key to enable AI application answers" value={profile.aiSettings.geminiApiKey || ''} onChange={e => setProfile({ ...profile, aiSettings: { ...profile.aiSettings, geminiApiKey: e.target.value } })} />
              </div>
              <div className="form-group">
                <label className="form-label">Default Answer: Notice Period</label>
                <input type="text" className="form-control" placeholder="e.g. Immediate, 1 month" value={profile.customAnswers.noticePeriod || ''} onChange={e => setProfile({ ...profile, customAnswers: { ...profile.customAnswers, noticePeriod: e.target.value } })} />
              </div>
              <div className="form-group">
                <label className="form-label">Default Answer: Sponsorship Required?</label>
                <select className="form-control" value={profile.customAnswers.sponsorshipRequired || 'No'} onChange={e => setProfile({ ...profile, customAnswers: { ...profile.customAnswers, sponsorshipRequired: e.target.value } })}>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Default Answer: Cover Note / Why join?</label>
                <textarea className="form-control" rows={3} placeholder="Brief answer for generic cover letter / bio questions..." value={profile.customAnswers.whyJoin || ''} onChange={e => setProfile({ ...profile, customAnswers: { ...profile.customAnswers, whyJoin: e.target.value } })} />
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ACCOUNTS TAB */}
      {activeTab === 'accounts' && (
        <div className="glass-panel">
          <h2 className="glow-text">Job Platform Session Manager</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '6px', marginBottom: '24px' }}>
            Automations require session cookies to function. Click <strong>Launch Login Assistant</strong> to open a browser window and log in manually. Once logged in, close the browser (or click Finish) to lock in the cookies.
          </p>

          <div className="card-grid">
            {['linkedin', 'indeed', 'instahyre', 'naukri', 'wellfound', 'foundit', 'cuvette', 'unstop', 'hackerearth', 'hackerrank'].map(p => {
              const status = sessionStatus[p] || { sessionExists: false, helperActive: false };

              return (
                <div key={p} className="glass-panel platform-card">
                  <div className="platform-header">
                    <span className="platform-name glow-text">{p}</span>
                    <span className={`status-badge ${status.sessionExists ? 'active' : 'inactive'}`}>
                      {status.sessionExists ? 'Connected' : 'Missing'}
                    </span>
                  </div>
                  
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {status.helperActive ? (
                      <span style={{ color: 'var(--warning)' }}>Login Assistant Active...</span>
                    ) : (
                      <span>Session file: {status.sessionExists ? 'Saved ✅' : 'Not configured ❌'}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    {status.helperActive ? (
                      <button className="btn btn-danger" style={{ flex: 1, padding: '8px' }} onClick={() => handleCloseSessionHelper(p)}>
                        Finish Login
                      </button>
                    ) : (
                      <button className="btn btn-secondary" style={{ flex: 1, padding: '8px' }} onClick={() => handleLaunchSessionHelper(p)}>
                        Launch Login Helper
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TRACKER TAB */}
      {activeTab === 'tracker' && (
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 className="glow-text">Applications History</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              {['all', 'applied', 'failed', 'skipped', 'pending'].map(filter => (
                <button 
                  key={filter} 
                  className={`btn ${trackerFilter === filter ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 14px', textTransform: 'capitalize', fontSize: '0.85rem' }}
                  onClick={() => setTrackerFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Company</th>
                  <th>Location</th>
                  <th>Platform</th>
                  <th>Match %</th>
                  <th>Status</th>
                  <th>Discovered / Applied</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                      No job listings found matching this status.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job, idx) => {
                    let scoreClass = 'low';
                    if (job.matchScore >= 75) scoreClass = 'high';
                    else if (job.matchScore >= 60) scoreClass = 'medium';

                    let statusStyle = { color: 'var(--text-secondary)' };
                    if (job.status === 'Applied') statusStyle = { color: 'var(--secondary-light)' };
                    if (job.status === 'Failed') statusStyle = { color: 'var(--danger)' };
                    if (job.status === 'Skipped') statusStyle = { color: 'var(--warning)' };

                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{job.title}</td>
                        <td>{job.company}</td>
                        <td>{job.location}</td>
                        <td style={{ textTransform: 'capitalize' }}>{job.platform}</td>
                        <td>
                          <span className={`score-badge ${scoreClass}`}>{job.matchScore}%</span>
                        </td>
                        <td style={{ fontWeight: 600, ...statusStyle }}>{job.status}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {job.status === 'Applied' && job.appliedAt ? (
                            new Date(job.appliedAt).toLocaleDateString()
                          ) : (
                            new Date(job.discoveredAt).toLocaleDateString()
                          )}
                        </td>
                        <td>
                          <a href={job.link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                            View Post
                          </a>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
