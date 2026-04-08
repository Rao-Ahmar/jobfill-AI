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

  return (
    <div className="w-full h-screen bg-background text-textPrimary relative flex flex-col overflow-hidden animate-slideIn">
      <main className="flex-1 overflow-hidden relative">

        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'resume' && <ResumeTab />}
        {activeTab === 'coverletter' && <CoverLetterTab />}
        {activeTab === 'keywords' && <KeywordsTab />}
        {activeTab === 'pro' && <SubscriptionTab />}

      </main>
      <TabNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
