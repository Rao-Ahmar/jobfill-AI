import { useState } from 'react';
import { TabNav } from '@/components/TabNav';
import { ProfileTab } from '@/components/ProfileTab';
import { ResumeTab } from '@/components/ResumeTab';
import { CoverLetterTab } from '@/components/CoverLetterTab';
import { KeywordsTab } from '@/components/KeywordsTab';
import { SubscriptionTab } from '@/components/SubscriptionTab';
import '@/styles/global.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('profile');

  const handleNavigate = (tab) => setActiveTab(tab);

  return (
    <div className="w-[420px] h-[580px] bg-background text-textPrimary relative flex flex-col overflow-hidden">
      <main className="flex-1 overflow-hidden relative">

        {activeTab === 'profile' && <ProfileTab onNavigate={handleNavigate} />}
        {activeTab === 'resume' && <ResumeTab onNavigate={handleNavigate} />}
        {activeTab === 'coverletter' && <CoverLetterTab onNavigate={handleNavigate} />}
        {activeTab === 'keywords' && <KeywordsTab onNavigate={handleNavigate} />}
        {activeTab === 'pro' && <SubscriptionTab />}

      </main>
      <TabNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
