import { useState } from 'react';
import { useStorage } from '@/hooks/useStorage';
import { useSubscription } from '@/hooks/useSubscription';
import { PLAN_LABELS } from '@/config/plans';
import { parsePdfToBase64, extractTextFromPdf } from '@/utils/resumeParser';
import { UploadCloud, FileText, CheckCircle2, Trash2, Send, Crown, Lock } from 'lucide-react';
import { Toast } from './Toast';

export function ResumeTab({ onNavigate }) {
  const { canUseFeature, incrementUsage } = useSubscription();
  const [resumeBase64, setResumeBase64, loadingBase64] = useStorage('jobfill_resume_base64', null);
  const [resumeText, setResumeText, loadingText] = useStorage('jobfill_resume_text', null);
  const [resumeMeta, setResumeMeta, loadingMeta] = useStorage('jobfill_resume_meta', null);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const loading = loadingBase64 || loadingText || loadingMeta;

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };

  const attachCheck = canUseFeature('autoattach');

  const handleFile = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      showToast('Please upload a valid PDF file.', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('File is too large. Max 5MB.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const base64 = await parsePdfToBase64(file);
      const extractedText = await extractTextFromPdf(base64);

      await setResumeBase64(base64);
      await setResumeText(extractedText);
      await setResumeMeta({
        name: file.name,
        size: Math.round(file.size / 1024) + ' KB',
        uploadDate: new Date().toLocaleDateString()
      });

      showToast('Resume Stored ✓');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Failed to process resume.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete your stored resume?')) {
      await setResumeBase64(null);
      await setResumeText(null);
      await setResumeMeta(null);
      showToast('Resume DELETED');
    }
  };

  const handleAttach = async () => {
    if (!attachCheck.allowed) {
      onNavigate?.('pro');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("No active tab.");

      chrome.tabs.sendMessage(tab.id, {
        action: 'ATTACH_RESUME',
        fileData: resumeBase64,
        fileName: resumeMeta.name
      }, async (response) => {
        if (chrome.runtime.lastError) {
          showToast('Failed to attach. Is this a job board site?', 'error');
        } else if (response?.success) {
          await incrementUsage('autofill');
          showToast('Resume auto-attached ✓');
        } else {
          showToast('No file input found on page.', 'warning');
        }
      });
    } catch (error) {
      console.error(error);
      showToast('Failed to connect to page.', 'error');
    }
  };

  if (loading) return <div className="p-4 text-center text-textSecondary">Loading resume...</div>;

  return (
    <div className="p-4 pb-20 fade-in h-[calc(100vh-64px)] overflow-y-auto scrollbar-custom">
      <h1 className="text-xl font-bold mb-4">Resume Management</h1>

      {!attachCheck.allowed && attachCheck.reason === 'tier' && (
        <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
            <Lock size={18} className="text-white" />
          </div>
          <p className="text-[11px] text-indigo-200 leading-tight">
            Auto-attach requires {PLAN_LABELS[attachCheck.upgradeTarget]}.{' '}
            <button onClick={() => onNavigate?.('pro')} className="font-bold underline">Upgrade</button> to enable. Upload is free for all.
          </p>
        </div>
      )}

      {resumeMeta ? (
        <div className="card-container space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center shrink-0">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 className="font-semibold">{resumeMeta.name}</h3>
              <p className="text-xs text-textSecondary">
                {resumeMeta.size} • Uploaded {resumeMeta.uploadDate}
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            {!attachCheck.allowed ? (
              <button
                onClick={() => onNavigate?.('pro')}
                className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white text-sm font-bold py-2.5 rounded-lg transition-all shadow-lg shadow-orange-900/20 active:scale-95"
              >
                <Crown size={16} />
                {attachCheck.reason === 'tier'
                  ? `Get ${PLAN_LABELS[attachCheck.upgradeTarget]} to Auto-Attach`
                  : 'Upgrade for More'}
              </button>
            ) : (
              <button
                onClick={handleAttach}
                className="btn-primary flex-1"
              >
                <Send size={16} /> Auto-Attach on This Page
              </button>
            )}
            <button
              onClick={handleDelete}
              className="btn-danger w-auto px-3"
              title="Delete Resume"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`card-container border-2 border-dashed ${isDragging ? 'border-primary bg-primary/5' : 'border-border'} transition-colors flex flex-col items-center justify-center py-10`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFile(e.dataTransfer.files[0]);
            }
          }}
        >
          {isProcessing ? (
            <div className="animate-pulse flex flex-col items-center">
              <FileText className="text-primary mb-3" size={32} />
              <p className="text-sm font-medium">Processing PDF...</p>
            </div>
          ) : (
            <>
              <UploadCloud className="text-textSecondary mb-3" size={32} />
              <p className="font-medium mb-1">Upload PDF Resume</p>
              <p className="text-xs text-textSecondary mb-4">Drag & drop or click to browse</p>
              <label className="btn-secondary cursor-pointer inline-flex w-auto">
                Select File
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </>
          )}
        </div>
      )}

      {resumeMeta && (
        <div className="mt-6">
          <h2 className="text-sm font-medium mb-2 text-textSecondary">Parsed Content Preview</h2>
          <div className="bg-card border border-border rounded-lg p-3 text-xs font-mono text-textSecondary whitespace-pre-wrap h-40 overflow-y-auto scrollbar-custom shadow-inner">
            {resumeText ? resumeText.substring(0, 500) + '...' : 'Failed to extract text.'}
          </div>
        </div>
      )}

      <Toast {...toast} />
    </div>
  );
}
