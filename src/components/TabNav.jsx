import { User, FileText, PenLine, Target, Crown } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { PLAN_LABELS } from '@/config/plans';

export function TabNav({ activeTab, setActiveTab }) {
  const { plan } = useSubscription();

  const planLabel = plan !== 'free' ? PLAN_LABELS[plan] : 'Plans';

  const tabs = [
    { id: 'profile',      icon: User,    label: 'Profile' },
    { id: 'resume',       icon: FileText, label: 'Resume' },
    { id: 'coverletter',  icon: PenLine,  label: 'Cover' },
    { id: 'keywords',     icon: Target,   label: 'Keywords' },
    { id: 'pro',          icon: Crown,    label: planLabel },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around items-center h-16 px-1 z-40">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const isPro = tab.id === 'pro';
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative ${
              isActive
                ? isPro ? 'text-yellow-400' : 'text-primary'
                : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            <Icon size={18} className="mb-1" />
            <span className="text-[9px] font-medium">{tab.label}</span>
            {isActive && (
              <div className={`absolute bottom-0 w-8 h-0.5 rounded-t-full ${isPro ? 'bg-yellow-400' : 'bg-primary'}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}
