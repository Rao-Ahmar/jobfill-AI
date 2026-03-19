import { User, FileText, PenLine, Target } from 'lucide-react';

export function TabNav({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'profile', icon: User, label: 'Profile' },
    { id: 'resume', icon: FileText, label: 'Resume' },
    { id: 'coverletter', icon: PenLine, label: 'Cover Letter' },
    { id: 'keywords', icon: Target, label: 'Keywords' }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around items-center h-16 px-2 z-40">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${
              isActive ? 'text-primary' : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            <Icon size={20} className="mb-1" />
            <span className="text-[10px] font-medium">{tab.label}</span>
            {isActive && (
              <div className="absolute bottom-0 w-8 h-1 bg-primary rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
