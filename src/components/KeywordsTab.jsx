import { useState } from 'react';
import { useStorage } from '@/hooks/useStorage';
import { useSubscription } from '@/hooks/useSubscription';
import { PLAN_LABELS } from '@/config/plans';
import { analyzeKeywords } from '@/utils/claudeApi';
import { Target, RefreshCw, CheckCircle2, AlertTriangle, Copy, Crown, Lock, ArrowUp } from 'lucide-react';
import { Toast } from './Toast';

const scoreColor = (score) => {
  if (score >= 70) return { text: 'text-green-400', bg: 'bg-green-500', stroke: 'stroke-green-500' };
  if (score >= 40) return { text: 'text-amber-400', bg: 'bg-amber-500', stroke: 'stroke-amber-500' };
  return { text: 'text-red-400', bg: 'bg-red-500', stroke: 'stroke-red-500' };
};

const importanceStyle = {
  high: 'bg-red-500/20 text-red-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-gray-500/20 text-gray-400',
};

function ScoreGauge({ score, matched, total, summary }) {
  const color = scoreColor(score);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="card-container p-4 mb-4 flex items-center gap-4">
      <div className="relative shrink-0">
        <svg width="96" height="96" className="-rotate-90">
          <circle cx="48" cy="48" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-white/10" />
          <circle
            cx="48" cy="48" r={radius} fill="none" strokeWidth="6" strokeLinecap="round"
            className={color.stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xl font-bold ${color.text}`}>{score}%</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-lg font-bold ${color.text}`}>Match Score</p>
        {summary && <p className="text-xs text-textSecondary mt-0.5 leading-relaxed">{summary}</p>}
        <p className="text-xs text-textSecondary mt-1">{matched}/{total} keywords matched</p>
      </div>
    </div>
  );
}

export function KeywordsTab() {
  const { canUseFeature, incrementUsage, daysUntilReset, userEmail, syncServerUsage, openWebsite } = useSubscription();
  const [profile] = useStorage('jobfill_profile', {});
  const [resumeText] = useStorage('jobfill_resume_text', '');

  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };

  const check = canUseFeature('keywords');

  const handleAnalyze = async () => {
    if (!check.allowed) {
      openWebsite();
      return;
    }

    if (!jobDescription.trim()) {
      showToast('Please paste a job description.', 'error');
      return;
    }

    const email = userEmail || profile?.email;

    setIsAnalyzing(true);
    try {
      const keywordsData = await analyzeKeywords(profile, resumeText, jobDescription, email);
      setAnalysisData(keywordsData);
      if (keywordsData._serverUsage) {
        await syncServerUsage({ plan: undefined, usage: keywordsData._serverUsage, resetDate: keywordsData._serverUsage.resetDate });
      } else {
        await incrementUsage('keywords');
      }
      showToast('Analysis Complete ✓');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Analysis failed.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopySuggestions = () => {
    if (!analysisData) return;
    const { overallScore, summary, results } = analysisData;
    const matched = results.filter(r => r.foundInResume).length;
    const missing = results.filter(r => !r.foundInResume);
    const lines = [
      `ATS Match Score: ${overallScore}/100`,
      summary ? `Summary: ${summary}` : '',
      `Keywords Matched: ${matched}/${results.length}`,
      '',
      'Missing Keywords & Suggestions:',
      ...missing.map(m => `- ${m.keyword} (${m.importance || 'medium'}): ${m.suggestedRewrite}`),
    ].filter(Boolean);
    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Suggestions Copied!');
  };

  const renderBanner = () => {
    if (check.allowed) {
      if (check.remaining !== Infinity && check.limit) {
        return (
          <div className="mb-4 p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-center">
            <p className="text-[11px] text-indigo-300">
              {check.remaining} of {check.limit} keyword analyses remaining this month
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
            <button onClick={openWebsite} className="font-bold underline">Upgrade</button> to unlock ATS keyword analysis.
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
            <button onClick={openWebsite} className="font-bold underline">Upgrade</button> for more.
          </p>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="p-4 pb-20 fade-in h-[calc(100vh-64px)] flex flex-col">
      <h1 className="text-xl font-bold mb-4 shrink-0">ATS Keywords</h1>

      {renderBanner()}

      {!analysisData || isAnalyzing ? (
        <div className="flex flex-col flex-1 min-h-0">
          <label className="block text-sm font-medium text-textSecondary mb-2">
            Paste Job Description
          </label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste JD here to extract ATS keywords and match them against your resume..."
            className="input-field flex-1 resize-none text-sm font-sans mb-4 min-h-0 scrollbar-custom"
          />
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || (check.allowed && !jobDescription.trim())}
            className={`shrink-0 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all shadow-lg ${
              !check.allowed
              ? "bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white"
              : "bg-primary hover:bg-indigo-600 text-white"
            }`}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Analyzing...
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
                <Target size={18} />
                Analyze Keywords
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex justify-between items-center mb-3 shrink-0">
            <h2 className="font-semibold">Analysis Results</h2>
            <button
              onClick={() => setAnalysisData(null)}
              className="text-xs text-textSecondary hover:text-textPrimary transition-colors flex items-center gap-1"
            >
              <RefreshCw size={12} /> New Analysis
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-custom min-h-0">
            <ScoreGauge
              score={analysisData.overallScore}
              matched={analysisData.results.filter(r => r.foundInResume).length}
              total={analysisData.results.length}
              summary={analysisData.summary}
            />

            {analysisData.results.map((item, idx) => {
              const imp = item.importance || 'medium';
              const ms = typeof item.matchScore === 'number' ? item.matchScore : (item.foundInResume ? 100 : 0);
              const msColor = scoreColor(ms);
              return (
                <div key={idx} className={`card-container p-3 border ${item.foundInResume ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                  <div className="flex items-start gap-2">
                    {item.foundInResume ? (
                      <CheckCircle2 className="text-green-500 shrink-0 mt-0.5" size={16} />
                    ) : (
                      <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{item.keyword}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${importanceStyle[imp] || importanceStyle.medium}`}>
                          {imp}
                        </span>
                        <span className={`ml-auto text-xs font-bold ${msColor.text}`}>{ms}</span>
                      </div>
                      {!item.foundInResume && item.suggestedRewrite && (
                        <p className="text-xs text-textSecondary mt-1 italic leading-relaxed">
                          <strong className="text-amber-500 font-semibold">Missing.</strong> Try: "{item.suggestedRewrite}"
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={handleCopySuggestions} className="btn-secondary mt-4 shrink-0">
            <Copy size={16} /> Copy Missing Suggestions
          </button>
        </div>
      )}

      <Toast {...toast} />
    </div>
  );
}
