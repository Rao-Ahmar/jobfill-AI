import { useState, useEffect } from 'react';
import { useStorage } from '@/hooks/useStorage';
import { Eye, EyeOff, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { Toast } from './Toast';

export function SettingsTab() {
  const [apiKey, setApiKey, loading] = useStorage('jobfill_api_key', '');
  const [inputValue, setInputValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  useEffect(() => {
    if (!loading && apiKey) {
      setInputValue(apiKey);
    }
  }, [loading, apiKey]);

  const handleSave = async () => {
    if (!inputValue.trim()) {
      showToast('API Key cannot be empty', 'error');
      return;
    }
    await setApiKey(inputValue.trim());
    showToast('API Key Saved ✓', 'success');
  };

  const showToast = (message, type) => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };

  if (loading) return <div className="p-4 text-center text-textSecondary">Loading settings...</div>;

  return (
    <div className="p-4 pb-20 fade-in h-screen overflow-y-auto w-full">
      <h1 className="text-xl font-bold mb-4">Settings</h1>
      
      <div className="card-container space-y-4">
        <div>
          <label className="block text-sm font-medium text-textSecondary mb-1">
            Claude API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="sk-ant-api03-..."
              className="input-field pr-10"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button onClick={handleSave} className="btn-primary">
          Save API Key
        </button>

        <div className="flex items-center gap-2 mt-4 text-sm">
          {apiKey ? (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle2 size={16} /> API Key Saved ✓
            </span>
          ) : (
            <span className="flex items-center gap-1 text-warning">
              <AlertCircle size={16} /> No API Key Set
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 text-sm text-textSecondary space-y-4">
        <p className="flex items-start gap-2">
          <ExternalLink size={16} className="shrink-0 mt-0.5" />
          <span>
            Get your Claude API key from the{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Anthropic Console
            </a>.
          </span>
        </p>
        <p>
          Your API key is stored locally on your device only. Never shared with any third party.
        </p>
      </div>

      <Toast {...toast} />
    </div>
  );
}
