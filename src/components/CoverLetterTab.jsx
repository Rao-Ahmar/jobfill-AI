import { useState } from 'react';
import { useStorage } from '@/hooks/useStorage';
import { useSubscription } from '@/hooks/useSubscription';
import { PLAN_LABELS } from '@/config/plans';
import { generateCoverLetter } from '@/utils/claudeApi';
import { RefreshCw, Copy, CheckCircle2, PenLine, Crown, Lock, ArrowUp } from 'lucide-react';
import { Toast } from './Toast';

export function CoverLetterTab({ onNavigate }) {
  const { canUseFeature, incrementUsage, plan, daysUntilReset } = useSubscription();
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

  const check = canUseFeature('coverletter');

  const handleGenerate = async () => {
    if (!check.allowed) {
      onNavigate?.('pro');
      return;
    }

    if (!jobDescription.trim()) {
      showToast('Please paste a job description.', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const generated = await generateCoverLetter(profile, resumeText, jobDescription);
      await setSavedCoverLetter(generated);
      await incrementUsage('coverletter');
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

  // Build banner
  const renderBanner = () => {
    if (check.allowed) {
      if (check.remaining !== Infinity && check.limit) {
        return (
          <div className="mb-4 p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-center">
            <p className="text-[11px] text-indigo-300">
              {check.remaining} of {check.limit} cover letters remaining this month
            </p>
          </div>
        );
      }
      return null;
    }

    if (check.reason === 'tier') {
      return (
        <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
            <Lock size={18} className="text-white" />
          </div>
          <p className="text-[11px] text-indigo-200 leading-tight">
            Requires {PLAN_LABELS[check.upgradeTarget]}.{' '}
            <button onClick={() => onNavigate?.('pro')} className="font-bold underline">Upgrade</button> to unlock AI cover letters.
          </p>
        </div>
      );
    }

    if (check.reason === 'limit') {
      return (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
            <ArrowUp size={18} className="text-white" />
          </div>
          <p className="text-[11px] text-amber-200 leading-tight">
            {check.used}/{check.limit} used this month. Resets in {daysUntilReset} days.{' '}
            <button onClick={() => onNavigate?.('pro')} className="font-bold underline">Upgrade</button> for more.
          </p>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="p-4 pb-20 fade-in h-[calc(100vh-64px)] flex flex-col">
      <h1 className="text-xl font-bold mb-4 shrink-0">Cover Letter</h1>

      {renderBanner()}

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
              disabled={isGenerating || (check.allowed && !jobDescription.trim())}
              className={`shrink-0 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all shadow-lg ${
                !check.allowed
                ? "bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white"
                : "bg-primary hover:bg-indigo-600 text-white"
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Generating...
                </>
              ) : !check.allowed ? (
                <>
                  <Crown size={18} />
                  {check.reason === 'tier'
                    ? `Get ${PLAN_LABELS[check.upgradeTarget]} — Unlock`
                    : 'Upgrade for More'}
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
