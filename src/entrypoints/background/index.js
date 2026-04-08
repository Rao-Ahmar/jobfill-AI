const SERVER_URL = 'http://localhost:3001';

export default defineBackground(() => {
  console.log('JobFill AI background script initialized');

  // Toggle side panel when toolbar icon is clicked
  chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.toggle({ tabId: tab.id });
  });

  // Listen for tab URL changes — auto-verify subscription after Stripe checkout
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only trigger on complete navigation to our success page
    if (changeInfo.status !== 'complete') return;
    if (!tab.url || !tab.url.includes('/success')) return;

    // Check if we have a pending checkout email
    const result = await chrome.storage.local.get('jobfill_checkout_email');
    const email = result.jobfill_checkout_email;
    if (!email) return;

    console.log('Success page detected, auto-verifying subscription for:', email);

    try {
      const response = await fetch(`${SERVER_URL}/api/verify-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.status === 'active') {
        const subData = { ...data, email };
        await chrome.storage.local.set({ jobfill_subscription: subData });
        await chrome.storage.local.remove('jobfill_checkout_email');
        console.log('Subscription auto-verified:', data.plan);
      } else {
        // Payment may still be processing — retry once after a short delay
        setTimeout(async () => {
          try {
            const retry = await fetch(`${SERVER_URL}/api/verify-subscription`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            });
            const retryData = await retry.json();

            if (retryData.status === 'active') {
              const subData = { ...retryData, email };
              await chrome.storage.local.set({ jobfill_subscription: subData });
              await chrome.storage.local.remove('jobfill_checkout_email');
              console.log('Subscription auto-verified on retry:', retryData.plan);
            }
          } catch (err) {
            console.error('Retry verification failed:', err);
          }
        }, 3000);
      }
    } catch (err) {
      console.error('Auto-verification failed:', err);
    }
  });
});
