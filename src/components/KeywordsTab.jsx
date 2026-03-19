import { useState } from 'react';
import { useStorage } from '@/hooks/useStorage';
import { analyzeKeywords } from '@/utils/claudeApi';
import { Target, RefreshCw, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';
import { Toast } from './Toast';

export function KeywordsTab() {
  const [profile] = useStorage('jobfill_profile', {});
  const [resumeText] = useStorage('jobfill_resume_text', '');

  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };

  const handleAnalyze = async () => {
    if (!jobDescription.trim()) {
      showToast('Please paste a job description.', 'error');
      return;
    }

    setIsAnalyzing(true);
    try {
      const keywordsData = await analyzeKeywords(profile, resumeText, jobDescription);
      setResults(keywordsData);
      showToast('Analysis Complete ✓');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Analysis failed.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopySuggestions = () => {
    if (!results) return;
    const missing = results.filter(r => !r.foundInResume);
    const text = missing.map(m => `- ${m.keyword}: ${m.suggestedRewrite}`).join('\\n');
    navigator.clipboard.writeText(text);
    showToast('Suggestions Copied!');
  };

  return (
    <div className="p-4 pb-20 fade-in h-[calc(100vh-64px)] flex flex-col">
      <h1 className="text-xl font-bold mb-4 shrink-0">ATS Keywords</h1>

      {!results || isAnalyzing ? (
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
            disabled={isAnalyzing || !jobDescription.trim()}
            className="btn-primary shrink-0"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Analyzing with Claude AI...
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
              onClick={() => setResults(null)}
              className="text-xs text-secondary hover:text-textPrimary transition-colors flex items-center gap-1"
            >
              <RefreshCw size={12} /> New Analysis
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-custom min-h-0">
            {results.map((item, idx) => (
              <div key={idx} className={`card-container p-3 border ${item.foundInResume ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}>
                <div className="flex items-start gap-2">
                  {item.foundInResume ? (
                    <CheckCircle2 className="text-success shrink-0 mt-0.5" size={16} />
                  ) : (
                    <AlertTriangle className="text-warning shrink-0 mt-0.5" size={16} />
                  )}
                  <div>
                    <span className="font-medium text-sm">{item.keyword}</span>
                    {!item.foundInResume && item.suggestedRewrite && (
                      <p className="text-xs text-textSecondary mt-1 italic leading-relaxed">
                        <strong className="text-warning font-semibold">Missing.</strong> Try: "{item.suggestedRewrite}"
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
