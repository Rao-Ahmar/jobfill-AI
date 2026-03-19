import { useState } from 'react';
import { useStorage } from '@/hooks/useStorage';
import { generateCoverLetter } from '@/utils/claudeApi';
import { RefreshCw, Copy, CheckCircle2, PenLine } from 'lucide-react';
import { Toast } from './Toast';

export function CoverLetterTab() {
  const [profile] = useStorage('jobfill_profile', {});
  const [resumeText] = useStorage('jobfill_resume_text', '');
  const [savedCoverLetter, setSavedCoverLetter] = useStorage('jobfill_cover_letter', '');

  const [jobDescription, setJobDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };

  const handleGenerate = async () => {
    if (!jobDescription.trim()) {
      showToast('Please paste a job description.', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const generated = await generateCoverLetter(profile, resumeText, jobDescription);
      await setSavedCoverLetter(generated);
      showToast('Cover Letter Generated ✓');
      setCopied(false);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Generation failed.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!savedCoverLetter) return;
    navigator.clipboard.writeText(savedCoverLetter);
    setCopied(true);
    showToast('Copied to Clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 pb-20 fade-in h-[calc(100vh-64px)] flex flex-col">
      <h1 className="text-xl font-bold mb-4 shrink-0">Cover Letter</h1>
      
      <div className="flex flex-col flex-1 gap-4 min-h-0">
        {!savedCoverLetter || isGenerating ? (
          <div className="flex flex-col flex-1 h-full min-h-0">
            <label className="block text-sm font-medium text-textSecondary mb-2">
              Paste Job Description
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here to generate a tailored cover letter..."
              className="input-field flex-1 resize-none text-sm font-sans mb-4 min-h-0 scrollbar-custom"
            />
            
            <button 
              onClick={handleGenerate} 
              disabled={isGenerating || !jobDescription.trim()}
              className="btn-primary shrink-0"
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Generating with Claude AI...
                </>
              ) : (
                <>
                  <PenLine size={18} />
                  Generate Cover Letter
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col flex-1 h-full min-h-0">
            <div className="flex justify-between items-center mb-2 shrink-0">
              <span className="text-sm font-medium text-success flex items-center gap-1">
                <CheckCircle2 size={16} /> Generated Successfully
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setSavedCoverLetter('')}
                  className="p-1.5 rounded bg-card border border-border text-textSecondary hover:text-textPrimary transition-colors"
                  title="New Cover Letter"
                >
                  <RefreshCw size={14} />
                </button>
                <button 
                  onClick={handleCopy}
                  className="p-1.5 rounded bg-card border border-border text-textSecondary hover:text-textPrimary transition-colors"
                  title="Copy"
                >
                  <Copy size={14} className={copied ? "text-success" : ""} />
                </button>
              </div>
            </div>
            
            <textarea
              value={savedCoverLetter}
              readOnly
              className="input-field flex-1 resize-none text-sm font-sans mb-4 min-h-0 bg-card overflow-y-auto scrollbar-custom leading-relaxed"
            />
            
            <button onClick={handleCopy} className="btn-primary shrink-0">
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
        )}
      </div>

      <Toast {...toast} />
    </div>
  );
}
