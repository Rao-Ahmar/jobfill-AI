import { useState, useEffect } from 'react';
import { useStorage } from '@/hooks/useStorage';
import { Toast } from './Toast';
import { generateAutoFillMapping } from '@/utils/claudeApi';
import { Wand2, RefreshCw } from 'lucide-react';

const defaultProfile = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  linkedin: '',
  portfolio: '',
  jobTitle: '',
  experienceYears: '0-1',
  skills: '',
  workExperience: '',
  education: ''
};

export function ProfileTab() {
  const [storedProfile, setStoredProfile, loading] = useStorage('jobfill_profile', defaultProfile);
  const [resumeText] = useStorage('jobfill_resume_text', '');
  const [customFields, setCustomFields] = useStorage('jobfill_custom_fields', {});
  const [profile, setProfile] = useState(defaultProfile);
  const [toast, setToast] = useState({ visible: false, message: '' });
  const [isAutofilling, setIsAutofilling] = useState(false);

  useEffect(() => {
    if (!loading && storedProfile) {
      setProfile({ ...defaultProfile, ...storedProfile });
    }
  }, [loading, storedProfile]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    await setStoredProfile(profile);
    setToast({ visible: true, message: 'Profile Saved ✓' });
    setTimeout(() => setToast({ visible: false, message: '' }), 3000);
  };

  const handleAutoFill = async () => {
    setIsAutofilling(true);
    setToast({ visible: true, message: 'Scanning page...' });
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) throw new Error("No active tab found");
      
      const scanResponse = await chrome.tabs.sendMessage(tabs[0].id, { action: 'SCAN_FORM' }).catch(() => null);
      if (!scanResponse?.fields || scanResponse.fields.length === 0) {
        throw new Error("No form fields detected on this page.");
      }

      setToast({ visible: true, message: 'AI Mapping Fields...' });
      const { mapping, missingFields } = await generateAutoFillMapping(profile, customFields, resumeText, scanResponse.fields);
      
      if (missingFields && missingFields.length > 0) {
         setCustomFields(prev => {
           let updated = { ...prev };
           let added = false;
           missingFields.forEach(f => {
             if (updated[f] === undefined) { updated[f] = ''; added = true; }
           });
           if (added) {
              setTimeout(() => setToast({ visible: true, message: 'New fields added to your profile! ✨' }), 3000);
           }
           return updated;
         });
      }
      
      setToast({ visible: true, message: 'Filling Form...' });
      await chrome.tabs.sendMessage(tabs[0].id, { action: 'FILL_FORM', mapping });
      
      setToast({ visible: true, message: 'Application Auto-Filled ✨' });
    } catch (err) {
      console.error(err);
      setToast({ visible: true, message: err.message || 'Auto-fill failed', type: 'error' });
    } finally {
      setIsAutofilling(false);
      setTimeout(() => setToast({ visible: false, message: '' }), 3000);
    }
  };

  if (loading) return <div className="p-4 text-center text-textSecondary">Loading profile...</div>;

  return (
    <div className="p-4 pb-20 fade-in h-[calc(100vh-64px)] overflow-y-auto scrollbar-custom">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Your Profile</h1>
        <div className="flex gap-2">
          <button 
            onClick={handleAutoFill} 
            disabled={isAutofilling}
            className="flex items-center gap-1 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-sm font-medium py-1.5 px-3 rounded-md transition-colors"
          >
            {isAutofilling ? <RefreshCw size={14} className="animate-spin" /> : <Wand2 size={14} />}
            Auto-Fill
          </button>
          <button onClick={handleSave} className="bg-primary hover:bg-indigo-600 text-white text-sm font-medium py-1.5 px-3 rounded-md transition-colors">
            Save
          </button>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="card-container space-y-4">
          <h2 className="text-sm border-b border-border pb-2 font-medium">Basic Info</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-textSecondary mb-1">Full Name</label>
              <input name="fullName" value={profile.fullName} onChange={handleChange} className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">Email</label>
              <input type="email" name="email" value={profile.email} onChange={handleChange} className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">Phone</label>
              <input name="phone" value={profile.phone} onChange={handleChange} className="input-field py-1.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-textSecondary mb-1">Location</label>
              <input name="location" value={profile.location} onChange={handleChange} placeholder="City, Country" className="input-field py-1.5 text-sm" />
            </div>
          </div>
        </div>

        <div className="card-container space-y-4">
          <h2 className="text-sm border-b border-border pb-2 font-medium">Professional Links</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-textSecondary mb-1">LinkedIn URL</label>
              <input name="linkedin" value={profile.linkedin} onChange={handleChange} className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">Portfolio / GitHub URL</label>
              <input name="portfolio" value={profile.portfolio} onChange={handleChange} className="input-field py-1.5 text-sm" />
            </div>
          </div>
        </div>

        <div className="card-container space-y-4">
          <h2 className="text-sm border-b border-border pb-2 font-medium">Experience & Skills</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-textSecondary mb-1">Current Job Title</label>
              <input name="jobTitle" value={profile.jobTitle} onChange={handleChange} className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">Years of Experience</label>
              <select name="experienceYears" value={profile.experienceYears} onChange={handleChange} className="input-field py-1.5 text-sm bg-background">
                <option value="0-1">0 - 1 years</option>
                <option value="1-3">1 - 3 years</option>
                <option value="3-5">3 - 5 years</option>
                <option value="5-10">5 - 10 years</option>
                <option value="10+">10+ years</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">Skills (comma-separated)</label>
              <input name="skills" value={profile.skills} onChange={handleChange} placeholder="React, Node.js, Python..." className="input-field py-1.5 text-sm" />
            </div>
          </div>
        </div>

        <div className="card-container space-y-4">
          <h2 className="text-sm border-b border-border pb-2 font-medium">Work History & Education</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-textSecondary mb-1">Work Experience</label>
              <textarea name="workExperience" value={profile.workExperience} onChange={handleChange} rows={4} placeholder="Company — Role (Dates)\nDescription..." className="input-field text-sm font-sans" />
            </div>
            <div>
              <label className="block text-xs text-textSecondary mb-1">Education</label>
              <textarea name="education" value={profile.education} onChange={handleChange} rows={2} placeholder="Degree, Institution, Year" className="input-field text-sm font-sans" />
            </div>
          </div>
        </div>

        {customFields && Object.keys(customFields).length > 0 && (
          <div className="card-container space-y-4 border-l-4 border-indigo-500">
            <h2 className="text-sm border-b border-border pb-2 font-medium text-indigo-400">Custom Fields (Auto-Learned)</h2>
            <div className="space-y-3">
              {Object.keys(customFields).map(key => (
                <div key={key}>
                  <label className="block text-xs text-textSecondary mb-1">{key}</label>
                  <input
                    value={customFields[key] || ''}
                    onChange={(e) => setCustomFields({ ...customFields, [key]: e.target.value })}
                    className="input-field py-1.5 text-sm" 
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Toast {...toast} />
    </div>
  );
}
